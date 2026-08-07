// ─── PANEL ENGINE ────────────────────────────────────────────────────────────
// The schedule was a spreadsheet. This is the part that reads it back and says
// what is wrong with it.
//
// The check this file exists for is the multiwire branch circuit. An MWBC shares
// one neutral between two or three ungrounded conductors, and it is safe only
// because those conductors are on DIFFERENT phases — the neutral then carries
// the difference between the line currents, not the sum. Land both hots on the
// SAME phase and the neutral carries the sum of both loads: two 16 A loads put
// 32 A on a 20 A-rated neutral, and neither 20 A breaker ever trips. The
// conductor overheats inside a wall with nothing on the panel to show for it.
//
// That mistake is invisible on a spreadsheet and obvious to an engine, because
// the engine already knows which phase every position lands on. It is the single
// highest-value thing this module does, and it is why the finding is CRITICAL
// rather than a warning.
//
// Everything reported here is derived from panel geometry and from the loads the
// user entered. Two deliberate limits:
//
//   · The engine never invents a load. A circuit with no VA entered is counted
//     as unknown, not as zero, and any total that depends on it says so.
//   · Demand factors are applied only when the caller supplies them. Article 220
//     is not in the verification register, so this file ships the arithmetic and
//     not the numbers (see DEMAND_FACTOR_NOTE).
//
// Pure module: no React, no storage.

import {
  PanelType, Phase, phaseForPosition, positionsFor, phaseLoads, imbalancePercent, spareCount,
} from './panelSchedule.js';

export const Severity = Object.freeze({
  CRITICAL: 'CRITICAL',   // unsafe as drawn
  WARNING: 'WARNING',     // wrong or very likely wrong
  ADVISORY: 'ADVISORY',   // worth knowing, not a defect
});

export const SEVERITY_RANK = Object.freeze({ CRITICAL: 0, WARNING: 1, ADVISORY: 2 });

/** Balance thresholds. Reported as numbers; the engine does not pass or fail a panel. */
export const IMBALANCE_ADVISORY = 10;
export const IMBALANCE_WARNING = 20;

/** Loading thresholds against the main, as a percentage of its rating. */
export const LOADING_ADVISORY = 80;
export const LOADING_WARNING = 100;

/** Continuous loads are carried at 125% for breaker sizing. */
export const CONTINUOUS_MULTIPLIER = 1.25;

export const DEMAND_FACTOR_NOTE =
  'Demand factors must be supplied by the user. SparkConnect does not ship Article 220 '
  + 'demand factors until those tables have been checked against the printed source.';

// ─── System voltage ──────────────────────────────────────────────────────────

const DEFAULT_VOLTS = Object.freeze({
  [PanelType.SINGLE_SPLIT]: { lineToNeutral: 120, lineToLine: 240 },
  [PanelType.THREE_WYE]: { lineToNeutral: 120, lineToLine: 208 },
});

export const panelVoltage = (panel) => {
  const base = DEFAULT_VOLTS[panel?.panelType] ?? DEFAULT_VOLTS[PanelType.SINGLE_SPLIT];
  const v = panel?.voltage ?? {};
  return Object.freeze({
    lineToNeutral: Number.isFinite(v.lineToNeutral) && v.lineToNeutral > 0 ? v.lineToNeutral : base.lineToNeutral,
    lineToLine: Number.isFinite(v.lineToLine) && v.lineToLine > 0 ? v.lineToLine : base.lineToLine,
  });
};

/**
 * The current a circuit's entered VA implies.
 *
 * A three-pole load is a three-phase load: its line current is VA / (V_LL · √3),
 * not VA / V_LL. Dividing by the line-to-line voltage alone overstates the
 * current by 73%, which would flag correctly-sized breakers as undersized.
 */
export const circuitAmps = (panel, circuit) => {
  if (!circuit || !Number.isFinite(circuit.loadVa) || circuit.loadVa <= 0) return null;
  const { lineToNeutral, lineToLine } = panelVoltage(panel);
  const poles = circuit.poles ?? circuit.positions?.length ?? 1;
  if (poles === 1) return circuit.loadVa / lineToNeutral;
  if (poles === 3) return circuit.loadVa / (lineToLine * Math.sqrt(3));
  return circuit.loadVa / lineToLine;
};

// ─── Multiwire branch circuits ───────────────────────────────────────────────

/**
 * Circuits are declared part of one MWBC by sharing a `neutralGroup` label. The
 * engine cannot infer this — nothing in a schedule says two circuits share a
 * neutral — so the user tells it, and then the engine checks it.
 */
export const setNeutralGroup = (panel, circuitId, neutralGroup) => ({
  ...panel,
  circuits: (panel?.circuits ?? []).map((c) => (c.id === circuitId
    ? { ...c, neutralGroup: typeof neutralGroup === 'string' && neutralGroup.trim()
      ? neutralGroup.trim().slice(0, 24) : null }
    : c)),
});

export const neutralGroups = (panel) => {
  const groups = new Map();
  for (const c of panel?.circuits ?? []) {
    if (!c.neutralGroup) continue;
    const list = groups.get(c.neutralGroup) ?? [];
    list.push(c);
    groups.set(c.neutralGroup, list);
  }
  return groups;
};

const phasesOf = (circuit) => new Set(circuit.phases ?? []);

/**
 * Check one shared-neutral group.
 *
 * The phase test is the whole point: every ungrounded conductor sharing the
 * neutral must be on a different phase, or the neutral carries the sum.
 */
export const checkNeutralGroup = (panel, label, members) => {
  const findings = [];
  const maxLegs = panel?.panelType === PanelType.THREE_WYE ? 3 : 2;

  if (members.length < 2) {
    findings.push(mk(Severity.ADVISORY, 'MWBC_SINGLE_MEMBER',
      `"${label}" has only one circuit on it`,
      'A shared neutral needs at least two circuits. Either another circuit belongs to this group, or the group can be cleared.',
      members.map((m) => m.id)));
    return findings;
  }

  // Which phases the group occupies, and which circuits collide on one.
  const byPhase = new Map();
  for (const m of members) {
    for (const ph of phasesOf(m)) {
      const list = byPhase.get(ph) ?? [];
      list.push(m);
      byPhase.set(ph, list);
    }
  }

  for (const [ph, list] of byPhase) {
    if (list.length < 2) continue;
    findings.push(mk(Severity.CRITICAL, 'MWBC_SAME_PHASE',
      `Shared neutral "${label}": ${list.length} circuits on phase ${ph}`,
      'These circuits share a neutral but sit on the same phase, so the neutral carries the SUM of their '
      + 'currents instead of the difference. It can be loaded past its rating without either breaker tripping. '
      + 'Move one circuit to a different phase, or give it its own neutral.',
      list.map((m) => m.id)));
  }

  if (members.length > maxLegs) {
    findings.push(mk(Severity.CRITICAL, 'MWBC_TOO_MANY',
      `Shared neutral "${label}" has ${members.length} circuits on it`,
      `This panel has ${maxLegs} phases, so at most ${maxLegs} ungrounded conductors can share one neutral. `
      + 'Beyond that the neutral is carrying current from two conductors on the same phase whatever the arrangement.',
      members.map((m) => m.id)));
  }

  // Simultaneous disconnect. A single multi-pole breaker satisfies it inherently;
  // separate single-pole breakers need handle ties.
  const singlePoles = members.filter((m) => (m.poles ?? 1) === 1);
  const tied = members.every((m) => m.handleTie === true);
  if (members.length >= 2 && singlePoles.length >= 2 && !tied) {
    findings.push(mk(Severity.WARNING, 'MWBC_NO_SIMULTANEOUS_DISCONNECT',
      `Shared neutral "${label}" has no simultaneous disconnect`,
      'Where a multiwire branch circuit originates, all of its ungrounded conductors need a means to be '
      + 'disconnected at the same time — a handle tie or a common-trip multi-pole breaker. Otherwise someone '
      + 'kills one breaker, works on the circuit, and the shared neutral is still carrying the other leg.',
      members.map((m) => m.id)));
  }

  return findings;
};

// ─── Findings ────────────────────────────────────────────────────────────────

const mk = (severity, code, title, detail, circuitIds = []) => Object.freeze({
  severity, code, title, detail, circuitIds: Object.freeze([...circuitIds]),
});

/**
 * Everything wrong with a panel, worst first.
 *
 * @param options.futureGrowthPercent  headroom to reserve when reporting capacity
 * @param options.demandFactors        { [circuitId]: factor } supplied by the caller
 */
export const analyzePanel = (panel, options = {}) => {
  const p = panel ?? {};
  const circuits = Array.isArray(p.circuits) ? p.circuits : [];
  const findings = [];

  // ── Geometry ──
  const seen = new Map();
  for (const c of circuits) {
    for (const n of c.positions ?? []) {
      if (seen.has(n)) {
        findings.push(mk(Severity.CRITICAL, 'POSITION_CONFLICT',
          `Position ${n} is used twice`,
          'Two breakers are recorded in one space. The schedule no longer matches the panel it describes.',
          [seen.get(n), c.id]));
      }
      seen.set(n, c.id);
      if (p.size && n > p.size) {
        findings.push(mk(Severity.CRITICAL, 'POSITION_OFF_PANEL',
          `Position ${n} is past the end of a ${p.size}-space panel`,
          'This breaker cannot physically be where the schedule says it is.', [c.id]));
      }
    }

    // A multi-pole breaker must span different phases. positionsFor() guarantees
    // it, so this only fires on data that came from somewhere else — an import,
    // an older save, a hand-edited record.
    const phases = phasesOf(c);
    const poles = c.poles ?? c.positions?.length ?? 1;
    if (poles > 1 && phases.size < poles) {
      findings.push(mk(Severity.CRITICAL, 'MULTIPOLE_SAME_PHASE',
        `${poles}-pole breaker at position ${c.positions?.[0]} does not span ${poles} phases`,
        'A multi-pole breaker must land on a different phase per pole. As recorded, it is bridging one phase '
        + 'to itself and would deliver no voltage across the load — or short, depending on how it is landed.',
        [c.id]));
    }
  }

  // ── Shared neutrals ──
  for (const [label, members] of neutralGroups(p)) {
    findings.push(...checkNeutralGroup(p, label, members));
  }

  // ── Continuous loads ──
  for (const c of circuits) {
    if (!c.continuous) continue;
    const amps = circuitAmps(p, c);
    if (amps === null) continue;
    const required = amps * CONTINUOUS_MULTIPLIER;
    if (c.amps && required > c.amps + 1e-9) {
      findings.push(mk(Severity.WARNING, 'CONTINUOUS_UNDERSIZED',
        `${c.description || `Circuit ${c.positions?.[0]}`}: ${c.amps} A breaker on a continuous load`,
        `A continuous load is carried at 125%. ${round(amps)} A × 1.25 = ${round(required)} A, which is more `
        + `than the ${c.amps} A device recorded here.`,
        [c.id]));
    }
  }

  // ── Balance ──
  const imbalance = imbalancePercent(p);
  const loads = phaseLoads(p);
  const anyLoad = Object.values(loads).some((v) => v > 0);
  if (anyLoad && imbalance >= IMBALANCE_WARNING) {
    findings.push(mk(Severity.WARNING, 'PHASE_IMBALANCE',
      `Phases are ${imbalance}% out of balance`,
      `${describeLoads(loads)}. Moving a load from the heaviest phase to the lightest evens the neutral current `
      + 'and the heating in the service conductors.', []));
  } else if (anyLoad && imbalance >= IMBALANCE_ADVISORY) {
    findings.push(mk(Severity.ADVISORY, 'PHASE_IMBALANCE',
      `Phases are ${imbalance}% out of balance`,
      `${describeLoads(loads)}. Worth evening out while circuits are still easy to move.`, []));
  }

  // ── Capacity ──
  const cap = capacity(p, options);
  if (cap.percentOfMain !== null && cap.percentOfMain >= LOADING_WARNING) {
    findings.push(mk(Severity.WARNING, 'OVER_MAIN',
      `Connected load is ${cap.percentOfMain}% of the ${p.mainAmps} A main`,
      'This is connected load as entered, before any demand factors. If it is not diversified, the main is undersized.',
      []));
  } else if (cap.percentOfMain !== null && cap.percentOfMain >= LOADING_ADVISORY) {
    findings.push(mk(Severity.ADVISORY, 'MAIN_LOADING',
      `Connected load is ${cap.percentOfMain}% of the ${p.mainAmps} A main`,
      'Getting close. Worth checking before adding anything else to this panel.', []));
  }

  // ── Spaces ──
  const spares = spareCount(p);
  if (p.size && spares === 0) {
    findings.push(mk(Severity.ADVISORY, 'NO_SPARES',
      'No spare spaces left',
      'Every space is used. The next circuit needs a tandem where the panel allows one, a sub-panel, or a change out.',
      []));
  } else if (p.size && spares > 0 && spares <= 2 && circuits.length > 0) {
    findings.push(mk(Severity.ADVISORY, 'FEW_SPARES',
      `${spares} spare space${spares === 1 ? '' : 's'} left`,
      'Worth mentioning to the customer now rather than on the next call-out.', []));
  }

  // ── Unknown loads ──
  const noLoad = circuits.filter((c) => !Number.isFinite(c.loadVa) || c.loadVa <= 0);
  if (noLoad.length) {
    findings.push(mk(Severity.ADVISORY, 'LOADS_UNKNOWN',
      `${noLoad.length} circuit${noLoad.length === 1 ? ' has' : 's have'} no load entered`,
      'Balance and capacity below are calculated from the circuits that do. They are not the whole panel.',
      noLoad.map((c) => c.id)));
  }

  // ── Harmonics on a wye ──
  if (p.panelType === PanelType.THREE_WYE && circuits.some((c) => c.nonlinear)) {
    findings.push(mk(Severity.ADVISORY, 'WYE_NONLINEAR_NEUTRAL',
      'Nonlinear loads on a shared neutral',
      'On a 4-wire wye, the third-harmonic currents from nonlinear loads add in the neutral instead of '
      + 'cancelling, so the neutral can carry more than any line conductor. Worth sizing for.', []));
  }

  findings.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  return Object.freeze(findings);
};

const round = (n) => Math.round(n * 10) / 10;

const describeLoads = (loads) =>
  Object.entries(loads).map(([k, v]) => `${k} ${v} VA`).join(', ');

// ─── Capacity and growth ─────────────────────────────────────────────────────

/**
 * What the panel is carrying and what is left.
 *
 * `connectedVa` is the sum of what the user entered — nothing is assumed for a
 * circuit with no load, and `complete` says whether anything was missing. A
 * capacity figure that silently treats unknowns as zero is the number that gets
 * someone to add one more circuit to a full panel.
 */
export const capacity = (panel, { futureGrowthPercent = 0, demandFactors = null } = {}) => {
  const p = panel ?? {};
  const circuits = Array.isArray(p.circuits) ? p.circuits : [];
  const { lineToNeutral, lineToLine } = panelVoltage(p);

  let connectedVa = 0;
  let unknown = 0;
  for (const c of circuits) {
    if (Number.isFinite(c.loadVa) && c.loadVa > 0) connectedVa += c.loadVa;
    else unknown += 1;
  }

  // Demand factors are applied per circuit and ONLY where the caller supplied
  // one. An absent factor is 1.0 — never a guess at what Article 220 would say.
  let demandVa = null;
  let factorsApplied = 0;
  if (demandFactors && typeof demandFactors === 'object') {
    demandVa = 0;
    for (const c of circuits) {
      const va = Number.isFinite(c.loadVa) && c.loadVa > 0 ? c.loadVa : 0;
      const f = demandFactors[c.id];
      if (Number.isFinite(f) && f >= 0) { demandVa += va * f; factorsApplied += 1; }
      else demandVa += va;
    }
    demandVa = Math.round(demandVa);
  }

  // Service amps from VA: single-phase across the two legs, three-phase √3.
  const serviceVolts = p.panelType === PanelType.THREE_WYE ? lineToLine * Math.sqrt(3) : lineToLine;
  const basisVa = demandVa === null ? connectedVa : demandVa;
  const amps = serviceVolts > 0 ? basisVa / serviceVolts : null;
  const main = Number.isFinite(p.mainAmps) && p.mainAmps > 0 ? p.mainAmps : null;

  const growth = Number.isFinite(futureGrowthPercent) && futureGrowthPercent > 0 ? futureGrowthPercent : 0;
  const withGrowthAmps = amps === null ? null : amps * (1 + growth / 100);

  return Object.freeze({
    connectedVa,
    demandVa,
    factorsApplied,
    demandFactorsSupplied: demandFactors !== null && demandFactors !== undefined,
    demandNote: DEMAND_FACTOR_NOTE,
    lineToNeutral,
    lineToLine,
    amps: amps === null ? null : round(amps),
    withGrowthAmps: withGrowthAmps === null ? null : round(withGrowthAmps),
    futureGrowthPercent: growth,
    mainAmps: main,
    percentOfMain: amps === null || main === null ? null : Math.round((amps / main) * 100),
    percentOfMainWithGrowth: withGrowthAmps === null || main === null
      ? null : Math.round((withGrowthAmps / main) * 100),
    headroomAmps: amps === null || main === null ? null : round(main - amps),
    circuitsWithoutLoad: unknown,
    // The honest qualifier on every number above.
    complete: unknown === 0 && circuits.length > 0,
  });
};

/**
 * Where to put the next circuit.
 *
 * Returns the open start positions for a breaker of `poles` poles, ordered so
 * the first suggestion lands on the phase carrying the least load. Balancing is
 * cheap while the panel is being built and expensive afterwards.
 */
export const suggestPositions = (panel, poles = 1, { limit = 5 } = {}) => {
  const p = panel ?? {};
  const size = p.size ?? 0;
  const taken = new Set((p.circuits ?? []).flatMap((c) => c.positions ?? []));
  const loads = phaseLoads(p);

  const options = [];
  for (let start = 1; start <= size; start++) {
    const positions = positionsFor(start, poles);
    if (!positions.length || positions.some((n) => n > size || taken.has(n))) continue;
    const phases = positions.map((n) => phaseForPosition(n, p.panelType));
    // Rank by the load already on the phases this breaker would land on.
    const weight = phases.reduce((sum, ph) => sum + (loads[ph] ?? 0), 0) / phases.length;
    options.push({ start, positions, phases, phaseLoadVa: Math.round(weight) });
  }

  options.sort((a, b) => a.phaseLoadVa - b.phaseLoadVa || a.start - b.start);
  return Object.freeze(options.slice(0, limit).map(Object.freeze));
};

// ─── The report ──────────────────────────────────────────────────────────────

export const PANEL_DISCLAIMER =
  'Calculated from the panel geometry and the loads entered. It does not verify the installation, '
  + 'size a service, or replace the adopted code and the authority having jurisdiction.';

/** One object a screen can render top to bottom. */
export const panelReport = (panel, options = {}) => {
  const findings = analyzePanel(panel, options);
  const cap = capacity(panel, options);
  const counts = { CRITICAL: 0, WARNING: 0, ADVISORY: 0 };
  for (const f of findings) counts[f.severity] += 1;

  return Object.freeze({
    findings,
    counts: Object.freeze(counts),
    worst: findings[0]?.severity ?? null,
    // "Clean" means nothing was found — not that the panel is correct.
    clean: findings.length === 0,
    capacity: cap,
    balance: Object.freeze({
      loads: Object.freeze(phaseLoads(panel)),
      imbalancePercent: imbalancePercent(panel),
    }),
    spares: spareCount(panel),
    nextPositions: suggestPositions(panel, 1),
    disclaimer: PANEL_DISCLAIMER,
  });
};

export { Phase, PanelType };
