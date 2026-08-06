// ─── TOOL REGISTRY ───────────────────────────────────────────────────────────
// What SparkAI can DO, as opposed to what it can say.
//
// This is the anti-hallucination mechanism that matters most. If a question can
// be computed, it must be computed. "What is the voltage drop on 100 feet of
// #12 at 20 amps" has one right answer, arrived at by arithmetic, and a
// language model producing it from pattern-matching is guessing at something
// that was never in doubt.
//
// So the model's job shrinks to the part it is actually good at: working out
// which tool the question is about and what the numbers are. The answer comes
// from the tool. That is the difference between an assistant and a chatbot with
// an electrical vocabulary.
//
// Every tool declares:
//   - what it answers, in the user's words
//   - the parameters it needs, so a partial question produces a specific
//     follow-up rather than a guess
//   - a pure `run` that computes, and cites
//
// Pure module: no React, no network.

import { Provenance, answer, refuse } from './answer.js';
import { fillFor, maxConductors, MAX_FILL } from '../domain/conduitFill.js';

/** Conductor DC resistance, ohms per 1000 ft. Shared with the VD calculator. */
const VD_RESISTANCE = Object.freeze({
  14: 3.14, 12: 1.98, 10: 1.24, 8: 0.778, 6: 0.491,
  4: 0.308, 2: 0.194, 1: 0.154,
});

/** NEC 314.16(B) volume allowance per conductor, in³. */
const BOX_VOLUME = Object.freeze({
  18: 1.5, 16: 1.75, 14: 2.0, 12: 2.25, 10: 2.5, 8: 3.0, 6: 5.0,
});

/** NEC 240.4(D) small-conductor overcurrent limits, copper. */
const SMALL_CONDUCTOR_LIMIT = Object.freeze({ 14: 15, 12: 20, 10: 30 });

/** Table 310.15(C)(1) adjustment for more than three current-carrying conductors. */
export const adjustmentFactor = (ccc) => {
  const n = Math.max(1, Math.floor(Number(ccc) || 1));
  if (n <= 3) return 1;
  if (n <= 6) return 0.8;
  if (n <= 9) return 0.7;
  if (n <= 20) return 0.5;
  if (n <= 30) return 0.45;
  if (n <= 40) return 0.4;
  return 0.35;
};

const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

const missing = (tool, params, need) => need.filter((k) => num(params?.[k]) === null);

const tool = (def) => Object.freeze({ ...def, params: Object.freeze(def.params) });

export const TOOLS = Object.freeze([
  tool({
    id: 'voltage_drop',
    tab: 'volt',
    answers: 'voltage drop on a run',
    triggers: ['voltage drop', 'vd', 'volt drop', 'dropping'],
    params: ['awg', 'amps', 'feet'],
    optional: ['volts', 'phase'],
    ask: {
      awg: 'What size conductor? (for example 12 AWG)',
      amps: 'How many amps is the load?',
      feet: 'How long is the run, one way, in feet?',
    },
    run: (p) => {
      const awg = num(p.awg); const amps = num(p.amps); const feet = num(p.feet);
      const volts = num(p.volts) ?? 120;
      const threePhase = String(p.phase ?? '').includes('3');
      const r = VD_RESISTANCE[awg];
      if (!r) {
        return refuse(`No resistance value on file for ${awg} AWG.`, {
          suggestion: 'SparkConnect carries 14 through 1 AWG copper for this calculation.',
        });
      }
      const multiplier = threePhase ? 1.732 : 2;
      const drop = (amps * r * feet * multiplier) / 1000;
      const percent = (drop / volts) * 100;

      return answer({
        provenance: Provenance.ENGINE,
        tool: 'voltage_drop',
        text: `${drop.toFixed(2)} V, which is ${percent.toFixed(1)}% of ${volts} V.`,
        detail: `${amps} A × ${r} Ω/1000ft × ${feet} ft × ${multiplier}${threePhase ? ' (√3, three phase)' : ' (out and back)'} ÷ 1000 = ${drop.toFixed(2)} V.`
          + (percent > 3
            ? ' That is past the 3% the informational note recommends for a branch circuit — consider upsizing.'
            : ' That is inside the 3% recommended for a branch circuit.'),
        sources: ['NEC 210.19(A)'],
        confidence: 1,
      });
    },
  }),

  tool({
    id: 'box_fill',
    tab: 'boxfill',
    answers: 'the box volume a set of conductors needs',
    triggers: ['box fill', 'box size', 'cubic inch', 'how big a box'],
    params: ['awg', 'conductors'],
    optional: ['devices', 'grounds', 'clamps'],
    ask: {
      awg: 'What size conductors? (for example 12 AWG)',
      conductors: 'How many current-carrying conductors enter the box?',
    },
    run: (p) => {
      const awg = num(p.awg); const conductors = num(p.conductors);
      const devices = num(p.devices) ?? 0;
      const grounds = num(p.grounds) ?? 0;
      const clamps = num(p.clamps) ?? 0;
      const vol = BOX_VOLUME[awg];
      if (!vol) {
        return refuse(`No box-fill volume on file for ${awg} AWG.`, {
          suggestion: 'Table 314.16(B) covers 18 through 6 AWG.',
        });
      }
      // Yokes count twice; ALL grounds count once total; ALL clamps count once
      // total. Counting each ground separately is the classic overshoot.
      const total = vol * (conductors + devices * 2 + (grounds > 0 ? 1 : 0) + (clamps > 0 ? 1 : 0));

      return answer({
        provenance: Provenance.ENGINE,
        tool: 'box_fill',
        text: `${total.toFixed(2)} in³ minimum.`,
        detail: `${conductors} × ${vol}`
          + (devices ? ` + ${devices} yoke${devices === 1 ? '' : 's'} × 2 × ${vol}` : '')
          + (grounds ? ` + all grounds as one × ${vol}` : '')
          + (clamps ? ` + all clamps as one × ${vol}` : '')
          + ` = ${total.toFixed(2)} in³. Pigtails that do not leave the box are not counted.`,
        sources: ['NEC 314.16(B)'],
        confidence: 1,
      });
    },
  }),

  tool({
    id: 'conduit_fill',
    tab: 'conduitfill',
    answers: 'how many conductors fit in a conduit',
    triggers: ['conduit fill', 'how many wires fit', 'fill percent', 'emt fill'],
    params: ['awg', 'conduitSize'],
    optional: ['count', 'conduitType', 'insulation'],
    ask: {
      awg: 'What size conductors?',
      conduitSize: 'What trade size conduit? (for example 1/2")',
    },
    run: (p) => {
      const awg = String(num(p.awg) ?? '');
      const size = String(p.conduitSize ?? '').trim();
      const type = String(p.conduitType ?? 'EMT').toUpperCase();
      const insulation = String(p.insulation ?? 'THHN').toUpperCase();
      const count = num(p.count);

      if (count !== null) {
        const r = fillFor({ conduitType: type, tradeSize: size, insulation, gauge: awg, count });
        if (!r) return refuse(`No Chapter 9 data for ${count} × ${awg} AWG ${insulation} in ${size} ${type}.`);
        return answer({
          provenance: Provenance.ENGINE,
          tool: 'conduit_fill',
          text: `${r.percent.toFixed(1)}% fill — ${r.passed ? 'passes' : 'over the limit'}.`,
          detail: `${count} × ${r.wireArea} in² = ${r.totalWireArea.toFixed(4)} in², against ${r.conduitArea} in² total area for ${size} ${type}. The limit for ${count === 1 ? 'one conductor' : count === 2 ? 'two conductors' : 'more than two conductors'} is ${r.limit}%.`,
          sources: ['NEC Chapter 9, Table 1'],
          confidence: 1,
        });
      }

      const max = maxConductors(type, size, insulation, awg);
      if (max === null) return refuse(`No Chapter 9 data for ${awg} AWG ${insulation} in ${size} ${type}.`);
      return answer({
        provenance: Provenance.ENGINE,
        tool: 'conduit_fill',
        text: `${max} conductor${max === 1 ? '' : 's'}.`,
        detail: `${max} × ${awg} AWG ${insulation} is the maximum in ${size} ${type} at the ${MAX_FILL[3]}% limit for more than two conductors.`,
        sources: ['NEC Chapter 9, Table 1'],
        confidence: 1,
      });
    },
  }),

  tool({
    id: 'derating',
    tab: 'ampacity',
    answers: 'ampacity after adjustment for conductor count',
    triggers: ['derate', 'derating', 'adjustment factor', 'current carrying conductors', 'ccc'],
    params: ['awg', 'ccc'],
    optional: ['baseAmpacity'],
    ask: {
      awg: 'What size conductor?',
      ccc: 'How many current-carrying conductors are in the raceway?',
    },
    run: (p) => {
      const awg = num(p.awg); const ccc = num(p.ccc);
      // 90°C column, which is where THHN derating starts from.
      const base = num(p.baseAmpacity) ?? { 14: 25, 12: 30, 10: 40, 8: 55, 6: 75 }[awg];
      if (!base) {
        return refuse(`No base ampacity on file for ${awg} AWG.`, {
          suggestion: 'Give the ampacity from the 90°C column and SparkConnect will apply the adjustment.',
        });
      }
      const factor = adjustmentFactor(ccc);
      const adjusted = base * factor;
      const cap = SMALL_CONDUCTOR_LIMIT[awg] ?? null;
      const final = cap !== null ? Math.min(adjusted, cap) : adjusted;

      return answer({
        provenance: Provenance.ENGINE,
        tool: 'derating',
        text: `${final} A.`,
        detail: `${base} A at 90°C × ${factor} for ${ccc} current-carrying conductors = ${adjusted.toFixed(1)} A.`
          + (cap !== null && cap < adjusted
            ? ` The small-conductor rule then caps ${awg} AWG copper at ${cap} A, so that governs.`
            : ' No small-conductor cap applies below that.'),
        sources: cap !== null && cap < adjusted
          ? ['NEC 310.15(C)(1)', 'NEC 240.4(D)']
          : ['NEC 310.15(C)(1)'],
        confidence: 1,
      });
    },
  }),
]);

export const toolById = (id) => TOOLS.find((t) => t.id === id) ?? null;

/**
 * Run a tool, or say precisely what is missing.
 *
 * A partial question produces a NAMED follow-up rather than an assumed default.
 * Filling in "probably 120 volts" is how a confident wrong answer happens.
 */
export const runTool = (id, params = {}) => {
  const t = toolById(id);
  if (!t) return refuse(`No tool called "${id}".`);

  const gaps = missing(t, params, t.params);
  if (gaps.length > 0) {
    return Object.freeze({
      ...refuse(`Need ${gaps.length} more detail${gaps.length === 1 ? '' : 's'} before that can be calculated.`, {
        suggestion: t.ask[gaps[0]],
      }),
      needs: Object.freeze(gaps),
      needsPrompts: Object.freeze(gaps.map((g) => t.ask[g] ?? g)),
      tool: t.id,
    });
  }

  try {
    return t.run(params);
  } catch (err) {
    return refuse(`That calculation failed: ${err?.message ?? 'unknown error'}.`);
  }
};

/** What the app can compute, for the model's system context. */
export const toolManifest = () => TOOLS.map((t) => Object.freeze({
  id: t.id,
  answers: t.answers,
  requires: t.params,
  optional: t.optional ?? [],
}));

export { VD_RESISTANCE, BOX_VOLUME, SMALL_CONDUCTOR_LIMIT };
