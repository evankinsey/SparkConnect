// ─── INTENT ROUTING ──────────────────────────────────────────────────────────
// Decide what a question IS before deciding what to say about it.
//
// The ordering here is the whole safety design, and it goes strongest first:
//
//   1. TOOL       computable → compute it. Deterministic, cited, cannot drift.
//   2. PROJECT    about the user's own data → read it, do not generate it.
//   3. KNOWLEDGE  covered by the reviewed reference → quote it with its citation.
//   4. MODEL      none of the above → the model may explain, in narrative only.
//
// A question never reaches step 4 if steps 1-3 can serve it. That is not an
// optimisation, it is the reason this app can be trusted with an apprentice:
// the model is the last resort rather than the front door.
//
// Parameter extraction is deliberately conservative. A number it cannot place
// is left out, which produces a specific follow-up question. Guessing "probably
// 120 volts" is how a confident wrong answer gets built.
//
// Pure module: no React, no network.

import { TOOLS, toolById } from './tools.js';

export const Route = Object.freeze({
  TOOL: 'TOOL',
  PROJECT: 'PROJECT',
  KNOWLEDGE: 'KNOWLEDGE',
  MODEL: 'MODEL',
});

const lower = (q) => String(q ?? '').toLowerCase();

// ─── Parameter extraction ────────────────────────────────────────────────────

/** "#12", "12 AWG", "12 gauge", "number 12" → 12 */
export const extractAwg = (q) => {
  const s = lower(q);
  const m = s.match(/(?:#|no\.?\s*|number\s+)?(\d{1,2})\s*(?:awg|gauge|ga\b)/)
    ?? s.match(/#\s*(\d{1,2})\b/);
  if (!m) return null;
  const n = Number(m[1]);
  // Real conductor sizes only. "12 amps" must not be read as 12 AWG, and a
  // stray "3" from "3 phase" must not become a conductor.
  return [18, 16, 14, 12, 10, 8, 6, 4, 3, 2, 1].includes(n) ? n : null;
};

export const extractAmps = (q) => {
  const m = lower(q).match(/(\d+(?:\.\d+)?)\s*(?:a\b|amp|amps|ampere)/);
  return m ? Number(m[1]) : null;
};

export const extractFeet = (q) => {
  const m = lower(q).match(/(\d+(?:\.\d+)?)\s*(?:ft\b|feet|foot|')/);
  return m ? Number(m[1]) : null;
};

export const extractVolts = (q) => {
  const m = lower(q).match(/(\d{2,3})\s*(?:v\b|volt|volts)/);
  return m ? Number(m[1]) : null;
};

/** '1/2"', 'half inch', '3/4', '1-1/4' → the trade-size string the tables use. */
export const extractTradeSize = (q) => {
  const s = lower(q);
  if (/1\s*-?\s*1\/4|1\.25/.test(s)) return '1-1/4"';
  if (/1\s*-?\s*1\/2|1\.5/.test(s)) return '1-1/2"';
  if (/\b3\/4|three quarter/.test(s)) return '3/4"';
  if (/\b1\/2|half\s*inch/.test(s)) return '1/2"';
  if (/\b2\s*(?:"|inch|in\b)/.test(s)) return '2"';
  if (/\b1\s*(?:"|inch|in\b)/.test(s)) return '1"';
  return null;
};

/** The insulation the Chapter 9 tables are indexed by. THHN when unstated. */
export const extractInsulation = (q) => {
  const s = lower(q);
  if (/\bxhhw(?:-2)?\b/.test(s)) return 'XHHW';
  if (/\bthwn(?:-2)?\b/.test(s)) return 'THWN';
  if (/\bthhn(?:-2)?\b/.test(s)) return 'THHN';
  return null;
};

/**
 * Every number in the sentence that is NOT a conductor count.
 *
 * A count is the one bare integer left after the qualified numbers are taken
 * out — the gauge, the trade size, the feet, the amps, the volts, the phase.
 * Stripping them first is what lets "can I put 10 #12 in a 1/2 inch pipe" find
 * the 10 without also finding the 12, the 1 and the 2.
 */
const stripQualifiedNumbers = (s) => s
  // Gauge: "12 AWG", "#12", "12 gauge"
  .replace(/#?\s*\d{1,2}\s*(?:awg|gauge|ga)\b/g, ' ')
  .replace(/#\s*\d{1,2}\b/g, ' ')
  // Trade sizes: 1/2, 3/4, 1-1/4
  .replace(/\d+\s*[-/]\s*\d+\s*(?:"|inch(?:es)?|in\b)?/g, ' ')
  // Anything carrying a unit. NOT a bare "in": "put 10 in a pipe" is a count
  // followed by a preposition, not ten inches, and stripping it there loses the
  // only number in the question.
  .replace(/\d+(?:\.\d+)?\s*(?:ft\b|feet|foot|'|a\b|amps?\b|ampere|v\b|volts?\b|inch(?:es)?|")/g, ' ')
  .replace(/\d+\s*(?:phase|ph)\b/g, ' ');

export const extractCount = (q) => {
  // In "6 12 AWG conductors" the digits nearest "conductors" are the SIZE, not
  // the count, and reading them as the count is how a box gets sized for twelve
  // wires instead of six.
  const s = stripQualifiedNumbers(lower(q));

  const m = s.match(/(\d+)\s*(?:conductors?|wires?|current[- ]carrying)/);
  if (m) return Number(m[1]);

  // The count without the noun: "can I put 10 in a 1/2 pipe", "fill on 6",
  // "is 12 too many", "a box for 6". These are how the question actually
  // arrives, and losing the count here sends a computable question to the
  // model, where the answer contract then refuses it.
  for (const re of [
    /\b(?:put|fit|pull|run|cram|stuff|land)\s+(\d+)\b/,
    /\bfill\s+(?:on|for|of|with)\s+(\d+)\b/,
    /\bis\s+(\d+)\s+too\s+many\b/,
    /\b(?:for|with)\s+(\d+)\b/,
  ]) {
    const hit = s.match(re);
    if (hit) return Number(hit[1]);
  }

  const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const w = s.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:conductors?|wires?)/);
  return w ? words[w[1]] : null;
};

/** Everything a tool might want, from one question. */
export const extractParams = (q) => {
  const s = lower(q);
  return {
    awg: extractAwg(q),
    amps: extractAmps(q),
    feet: extractFeet(q),
    volts: extractVolts(q),
    conduitSize: extractTradeSize(q),
    count: extractCount(q),
    conductors: extractCount(q),
    ccc: extractCount(q),
    phase: /three\s*phase|3\s*phase|3ph|3Φ/.test(s) ? '3' : null,
    insulation: extractInsulation(q),
    conduitType: /\bimc\b/.test(s) ? 'IMC'
      : /\brmc\b|rigid/.test(s) ? 'RMC'
        : /pvc/.test(s) ? 'PVC-40'
          : /\bemt\b/.test(s) ? 'EMT' : null,
    devices: /(\d+)\s*(?:device|yoke|receptacle|switch)/.test(s)
      ? Number(s.match(/(\d+)\s*(?:device|yoke|receptacle|switch)/)[1]) : null,
    grounds: /ground/.test(s) ? 1 : null,
    clamps: /clamp/.test(s) ? 1 : null,
  };
};

// ─── Routing ─────────────────────────────────────────────────────────────────

/**
 * Which tool, if any, is this question about?
 *
 * Literal triggers first, longest wins — an exact phrase is the strongest
 * signal there is. Then the shape patterns, which catch the way people
 * actually ask ("how many 12s fit in 3/4 EMT"). A question that reaches
 * neither goes to the model, and the answer contract will not let the model
 * put a number on it — so a missing phrasing here reads to the user as SparkAI
 * refusing something it can compute perfectly.
 */
export const matchTool = (q) => {
  const s = lower(q);
  let best = null;
  let bestLen = 0;
  for (const t of TOOLS) {
    for (const trigger of t.triggers) {
      if (s.includes(trigger) && trigger.length > bestLen) { best = t; bestLen = trigger.length; }
    }
  }
  if (best) return best;

  for (const t of TOOLS) {
    for (const pattern of (t.patterns ?? [])) {
      if (pattern.test(s)) return t;
    }
  }
  return null;
};

const PROJECT_PATTERNS = [
  /\bhow many\b.*\b(?:on|in)\s+(?:this|the|my)\s+(?:job|project|plan|sheet|takeoff)\b/i,
  /\b(?:my|this|the)\s+(?:takeoff|project|job|estimate)\b/i,
  /\bwhat(?:'s| is)\s+(?:on|in)\s+(?:this|the)\s+(?:sheet|plan|drawing)\b/i,
  /\bcount\s+(?:the|every|all)\b/i,
];

const isProjectQuestion = (q) => PROJECT_PATTERNS.some((re) => re.test(String(q ?? '')));

/**
 * Route a question.
 *
 * Returns the decision AND the reasoning, so the UI can show why it answered
 * the way it did — and so a wrong route is debuggable rather than mysterious.
 */
export const route = (question, { hasProjectData = false, knowledgeHit = null } = {}) => {
  const q = String(question ?? '').trim();
  if (!q) {
    return Object.freeze({ route: Route.MODEL, reason: 'Nothing was asked.', tool: null, params: {} });
  }

  const params = extractParams(q);

  // 1. Computable beats everything. Even a partially-specified calculation goes
  //    here, because a named follow-up is better than a generated answer.
  const t = matchTool(q);
  if (t) {
    return Object.freeze({
      route: Route.TOOL,
      tool: t.id,
      params,
      reason: `This is a ${t.answers} question, which SparkConnect computes rather than generates.`,
    });
  }

  // 2. The user's own data. Never generated, only read.
  if (isProjectQuestion(q)) {
    return Object.freeze({
      route: Route.PROJECT,
      tool: null,
      params,
      reason: hasProjectData
        ? 'This is about your own project data, so it is read from the takeoff rather than generated.'
        : 'This is about project data, and there is no verified takeoff loaded to read from.',
      hasProjectData,
    });
  }

  // 3. The reviewed reference, with a citation that resolves.
  if (knowledgeHit) {
    return Object.freeze({
      route: Route.KNOWLEDGE,
      tool: null,
      params,
      topicId: knowledgeHit,
      reason: 'This is covered by SparkConnect’s reviewed reference.',
    });
  }

  // 4. Last resort. The model may explain; the answer contract stops it
  //    asserting anything electrical.
  return Object.freeze({
    route: Route.MODEL,
    tool: null,
    params,
    reason: 'No calculator, project record, or reference entry covers this, so SparkAI will answer in its own words — which means it may not state a specification.',
  });
};

/** Did the question supply enough to run the tool it matched? */
export const readyForTool = (decision) => {
  if (decision.route !== Route.TOOL) return false;
  const t = toolById(decision.tool);
  if (!t) return false;
  return t.params.every((k) => decision.params?.[k] !== null && decision.params?.[k] !== undefined);
};

export { TOOLS };
