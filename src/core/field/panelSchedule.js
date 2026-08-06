// ─── PANEL SCHEDULE ──────────────────────────────────────────────────────────
// Build the schedule that goes in the door of the panel, and that the inspector
// asks for at final.
//
// The one structural fact that drives this file: breaker positions in a
// panelboard alternate phases down each side, so a two-pole breaker lands on
// two DIFFERENT phases and a three-pole lands on all three. That is why a
// multi-pole breaker occupies positions n and n+2, not n and n+1 — and getting
// it wrong produces a schedule that balances on paper and trips in the field.
//
// Pure module: no React, no storage.

/** Panel sizes people actually buy. */
export const PANEL_SIZES = Object.freeze([12, 20, 24, 30, 40, 42]);

export const Phase = { A: 'A', B: 'B', C: 'C' };

export const PanelType = {
  SINGLE_SPLIT: 'SINGLE_SPLIT',   // 120/240 1Φ 3W — two phases, A/B
  THREE_WYE: 'THREE_WYE',         // 120/208 3Φ 4W — three phases, A/B/C
};

const PHASES_FOR = {
  [PanelType.SINGLE_SPLIT]: [Phase.A, Phase.B],
  [PanelType.THREE_WYE]: [Phase.A, Phase.B, Phase.C],
};

/**
 * Odd positions run down the left, even down the right. Phase repeats every
 * `n` PAIRS of positions, which is what makes position 1 and 3 different
 * phases on a split-phase panel.
 */
export const phaseForPosition = (position, panelType = PanelType.SINGLE_SPLIT) => {
  const phases = PHASES_FOR[panelType] ?? PHASES_FOR[PanelType.SINGLE_SPLIT];
  if (!Number.isInteger(position) || position < 1) return null;
  const pairIndex = Math.floor((position - 1) / 2);   // 1,2 -> 0; 3,4 -> 1; …
  return phases[pairIndex % phases.length];
};

/** The positions a breaker at `start` with `poles` poles actually occupies. */
export const positionsFor = (start, poles) => {
  if (!Number.isInteger(start) || start < 1) return [];
  const n = poles === 2 ? 2 : poles === 3 ? 3 : 1;
  return Array.from({ length: n }, (_, i) => start + i * 2);
};

const clean = (v, max) => {
  if (typeof v !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max) : s;
};

export const emptyPanel = ({ name = 'Panel A', size = 42, panelType = PanelType.SINGLE_SPLIT, mainAmps = 200 } = {}) => ({
  name: clean(name, 40) || 'Panel A',
  size: PANEL_SIZES.includes(size) ? size : 42,
  panelType: PHASES_FOR[panelType] ? panelType : PanelType.SINGLE_SPLIT,
  mainAmps: Number.isFinite(mainAmps) && mainAmps > 0 ? Math.round(mainAmps) : 200,
  circuits: [],
});

/**
 * Add a circuit. Returns { ok, panel } or { ok:false, reason }.
 *
 * Refuses rather than overwrites on a collision: silently stacking two
 * breakers on one position is how a schedule stops matching the panel.
 */
export const addCircuit = (panel, { start, poles = 1, amps, description = '', loadVa = 0 }) => {
  const p = panel ?? emptyPanel();
  const positions = positionsFor(start, poles);
  if (positions.length === 0) return { ok: false, reason: 'invalid starting position' };
  if (positions.some((n) => n > p.size)) return { ok: false, reason: 'breaker runs past the end of the panel' };
  if (!Number.isFinite(amps) || amps <= 0) return { ok: false, reason: 'breaker size required' };
  if (p.panelType === PanelType.SINGLE_SPLIT && poles === 3) {
    return { ok: false, reason: 'a three-pole breaker needs a three-phase panel' };
  }

  const taken = new Set(p.circuits.flatMap((c) => c.positions));
  const clash = positions.find((n) => taken.has(n));
  if (clash) return { ok: false, reason: `position ${clash} is already used` };

  const circuit = {
    id: `c${positions[0]}`,
    positions,
    poles: positions.length,
    amps: Math.round(amps),
    description: clean(description, 60),
    loadVa: Number.isFinite(loadVa) && loadVa >= 0 ? Math.round(loadVa) : 0,
    phases: positions.map((n) => phaseForPosition(n, p.panelType)),
  };
  return { ok: true, panel: { ...p, circuits: [...p.circuits, circuit] } };
};

export const removeCircuit = (panel, id) => ({
  ...panel,
  circuits: (panel?.circuits ?? []).filter((c) => c.id !== id),
});

/**
 * Load per phase, in VA. A multi-pole breaker's load splits evenly across the
 * phases it lands on, which is what makes balancing meaningful.
 */
export const phaseLoads = (panel) => {
  const phases = PHASES_FOR[panel?.panelType] ?? PHASES_FOR[PanelType.SINGLE_SPLIT];
  const totals = Object.fromEntries(phases.map((ph) => [ph, 0]));
  for (const c of (Array.isArray(panel?.circuits) ? panel.circuits : [])) {
    if (!c.loadVa) continue;
    const share = c.loadVa / c.phases.length;
    for (const ph of c.phases) if (ph in totals) totals[ph] += share;
  }
  for (const k of Object.keys(totals)) totals[k] = Math.round(totals[k]);
  return totals;
};

/**
 * How far off balance the panel is, as a percentage of the heaviest phase.
 * Under 10% is generally considered acceptable; this reports the number and
 * lets the user decide rather than asserting a pass/fail the AHJ owns.
 */
export const imbalancePercent = (panel) => {
  const loads = Object.values(phaseLoads(panel));
  // NOT Math.min(...loads, 0) — that seeds the spread with zero, so every
  // panel reads as 100% unbalanced no matter how evenly it is loaded.
  if (loads.length === 0) return 0;
  const max = Math.max(...loads);
  const min = Math.min(...loads);
  if (max === 0) return 0;
  return Math.round(((max - min) / max) * 1000) / 10;
};

/** Rows for rendering: every position, filled or spare, in panel order. */
export const scheduleRows = (panel) => {
  const base = panel ?? emptyPanel();
  // A stored panel can arrive with a missing or non-array circuit list; that
  // is a corrupt save, not a reason to crash the screen.
  const p = { ...emptyPanel(), ...base, circuits: Array.isArray(base.circuits) ? base.circuits : [] };
  const byPosition = new Map();
  for (const c of p.circuits) {
    for (const n of c.positions) byPosition.set(n, c);
  }
  return Array.from({ length: p.size }, (_, i) => {
    const position = i + 1;
    const c = byPosition.get(position);
    return {
      position,
      side: position % 2 === 1 ? 'L' : 'R',
      phase: phaseForPosition(position, p.panelType),
      circuit: c ?? null,
      // Only the first position of a multi-pole breaker prints the description.
      isContinuation: !!c && c.positions[0] !== position,
    };
  });
};

export const spareCount = (panel) => {
  const circuits = Array.isArray(panel?.circuits) ? panel.circuits : [];
  const used = new Set(circuits.flatMap((c) => c.positions ?? []));
  return (panel?.size ?? 0) - used.size;
};

/** Plain-text schedule for sharing or pasting into a submittal. */
export const scheduleText = (panel) => {
  const base = panel ?? emptyPanel();
  const p = { ...emptyPanel(), ...base, circuits: Array.isArray(base.circuits) ? base.circuits : [] };
  const lines = [
    `${p.name} — ${p.mainAmps}A ${p.panelType === PanelType.THREE_WYE ? '120/208V 3Ø 4W' : '120/240V 1Ø 3W'} — ${p.size} spaces`,
    '',
  ];
  for (const row of scheduleRows(p)) {
    const label = row.isContinuation
      ? '  ↳'
      : row.circuit
        ? `${row.circuit.amps}A ${row.circuit.poles}P  ${row.circuit.description || 'Circuit'}`
        : '—  Spare';
    lines.push(`${String(row.position).padStart(2)} ${row.phase}  ${label}`);
  }
  const loads = phaseLoads(p);
  lines.push('', `Phase load: ${Object.entries(loads).map(([k, v]) => `${k} ${v} VA`).join('  ')}`);
  lines.push(`Imbalance: ${imbalancePercent(p)}%   Spares: ${spareCount(p)}`);
  lines.push('', 'Verify against the installed panel before submitting. Load figures are as entered.');
  return lines.join('\n');
};
