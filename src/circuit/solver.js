// ─── DETERMINISTIC CIRCUIT SOLVER ────────────────────────────────────────────
// Requirements: SIM-03, SIM-11, SIM-12, SIM-13, SIM-14, SIM-19
//
// Netlist-style evaluation. Terminals are nodes; user conductors and closed
// internal switch contacts are edges. Connectivity is resolved with union-find,
// then each load is asked whether it sits between the supply and the grounded
// conductor.
//
// This module decides what is electrically true. Nothing else in the app —
// including Spark AI — is permitted to overrule it (SIM-19).

import {
  ComponentType, TerminalRole,
  componentIndex, terminalIndex, switchableComponents, loadComponents,
} from './model.js';

// ─── Union-Find ──────────────────────────────────────────────────────────────
class Nets {
  constructor(ids) {
    this.parent = new Map();
    for (const id of ids) this.parent.set(id, id);
  }
  find(x) {
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root);
    while (this.parent.get(x) !== root) { const next = this.parent.get(x); this.parent.set(x, root); x = next; }
    return root;
  }
  union(a, b) {
    const ra = this.find(a), rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
  connected(a, b) { return this.find(a) === this.find(b); }
}

/**
 * Internal contacts a component closes for a given position.
 * Returns an array of [terminalLocalIdA, terminalLocalIdB] pairs.
 *
 * A load's terminals are deliberately NOT bonded — see model.js.
 */
export const internalBonds = (component, position) => {
  const t = (local) => `${component.id}.${local}`;
  switch (component.type) {
    case ComponentType.SWITCH_SINGLE_POLE:
      return position === 1 ? [[t('a'), t('b')]] : [];
    case ComponentType.SWITCH_THREE_WAY:
      return position === 0 ? [[t('com'), t('t1')]] : [[t('com'), t('t2')]];
    case ComponentType.SWITCH_FOUR_WAY:
      return position === 0
        ? [[t('in1'), t('out1')], [t('in2'), t('out2')]]   // straight through
        : [[t('in1'), t('out2')], [t('in2'), t('out1')]];  // crossed
    case ComponentType.SPLICE: {
      const pts = component.terminals.map((x) => x.id);
      return pts.slice(1).map((p) => [pts[0], p]);
    }
    default:
      return [];
  }
};

/** All switch-position vectors, in stable order. 2^n for n two-position devices. */
export const enumerateSwitchStates = (components) => {
  const switches = switchableComponents(components);
  const total = 2 ** switches.length;
  const states = [];
  for (let mask = 0; mask < total; mask++) {
    const state = {};
    switches.forEach((sw, i) => { state[sw.id] = (mask >> i) & 1; });
    states.push(state);
  }
  return states;
};

/**
 * Solve one switch-state vector.
 *
 * @returns {{
 *   nets: Nets,
 *   loads: Array<{id, energized, hotReachesSupply, neutralReachesSupply}>,
 *   anyLoadEnergized: boolean,
 *   shortCircuit: boolean,
 *   groundedComponents: string[],
 *   ungroundedComponents: string[],
 * }}
 */
export const solveState = (circuit, switchState) => {
  const { components, conductors } = circuit;
  const tIndex = terminalIndex(components);
  const nets = new Nets([...tIndex.keys()]);

  // User conductors.
  for (const w of conductors) {
    if (!tIndex.has(w.fromTerminal) || !tIndex.has(w.toTerminal)) continue;
    nets.union(w.fromTerminal, w.toTerminal);
  }

  // Internal contacts for this position.
  for (const c of components) {
    const position = switchState[c.id] ?? 0;
    for (const [a, b] of internalBonds(c, position)) nets.union(a, b);
  }

  const roleTerminal = (role) => {
    for (const t of tIndex.values()) if (t.semanticRole === role) return t.id;
    return null;
  };
  const supplyHot = roleTerminal(TerminalRole.SOURCE_LINE);
  const supplyNeutral = roleTerminal(TerminalRole.SOURCE_NEUTRAL);
  const supplyGround = roleTerminal(TerminalRole.SOURCE_GROUND);

  // A short is supply hot reaching the grounded conductor without a load in
  // between. Because load terminals are never internally bonded, same-net means
  // the current path bypassed every load.
  const shortCircuit = !!(supplyHot && supplyNeutral && nets.connected(supplyHot, supplyNeutral));

  const loads = loadComponents(components).map((c) => {
    const hot = c.terminals.find((t) => t.semanticRole === TerminalRole.LOAD_HOT);
    const neu = c.terminals.find((t) => t.semanticRole === TerminalRole.LOAD_NEUTRAL);
    if (!hot || !neu || !supplyHot || !supplyNeutral) {
      return { id: c.id, energized: false, hotReachesSupply: false, neutralReachesSupply: false };
    }
    // A lamp is not polarised: either orientation across the supply lights it.
    const forward = nets.connected(hot.id, supplyHot) && nets.connected(neu.id, supplyNeutral);
    const reverse = nets.connected(hot.id, supplyNeutral) && nets.connected(neu.id, supplyHot);
    return {
      id: c.id,
      energized: (forward || reverse) && !shortCircuit,
      hotReachesSupply: nets.connected(hot.id, supplyHot),
      neutralReachesSupply: nets.connected(neu.id, supplyNeutral),
    };
  });

  // EGC continuity for every component that has a ground terminal.
  const groundedComponents = [];
  const ungroundedComponents = [];
  for (const c of components) {
    if (c.type === ComponentType.SOURCE) continue;
    const g = c.terminals.find((t) => t.semanticRole === TerminalRole.EQUIPMENT_GROUND);
    if (!g) continue;
    (supplyGround && nets.connected(g.id, supplyGround) ? groundedComponents : ungroundedComponents).push(c.id);
  }

  return {
    nets,
    loads,
    anyLoadEnergized: loads.some((l) => l.energized),
    shortCircuit,
    groundedComponents,
    ungroundedComponents,
  };
};

/**
 * Evaluate EVERY switch-state combination (SIM-13).
 * This is the artifact the truth-table tests assert against (SIM-14, REV-01).
 *
 * @returns {{switchIds: string[], rows: Array<{state, stateVector, loads, anyLoadEnergized, shortCircuit, ungroundedComponents}>}}
 */
export const truthTable = (circuit) => {
  const switches = switchableComponents(circuit.components);
  const switchIds = switches.map((s) => s.id);
  const rows = enumerateSwitchStates(circuit.components).map((state) => {
    const result = solveState(circuit, state);
    return {
      state,
      stateVector: switchIds.map((id) => state[id]),
      loads: result.loads,
      anyLoadEnergized: result.anyLoadEnergized,
      shortCircuit: result.shortCircuit,
      ungroundedComponents: result.ungroundedComponents,
    };
  });
  return { switchIds, rows };
};

/**
 * Can the load be toggled from EVERY switch location? (LSN-02, LSN-04)
 *
 * This is the topology-independent definition of correct multi-location
 * switching: for every switch, flipping it alone — with every combination of
 * the other switches held — must change the load state. It is what makes the
 * validator work identically for source-at-switch, source-at-light, and
 * four-way topologies without hardcoding a layout (SIM-15).
 */
export const toggleAnalysis = (circuit) => {
  const switches = switchableComponents(circuit.components);
  const switchIds = switches.map((s) => s.id);
  const table = new Map();
  for (const state of enumerateSwitchStates(circuit.components)) {
    table.set(switchIds.map((id) => state[id]).join(''), solveState(circuit, state).anyLoadEnergized);
  }

  const perSwitch = switchIds.map((id, i) => {
    let controls = true;
    let ineffectiveCombos = 0;
    for (const key of table.keys()) {
      if (key[i] !== '0') continue;
      const flipped = key.slice(0, i) + '1' + key.slice(i + 1);
      if (table.get(key) === table.get(flipped)) { controls = false; ineffectiveCombos++; }
    }
    return { switchId: id, controlsLoad: controls, ineffectiveCombos };
  });

  const states = [...table.values()];
  return {
    perSwitch,
    everySwitchControlsLoad: perSwitch.every((s) => s.controlsLoad),
    alwaysOn: states.every((v) => v === true),
    alwaysOff: states.every((v) => v === false),
  };
};

/** Terminals carrying no conductor at all — used for "missing connection" hints. */
export const unconnectedTerminals = (circuit) => {
  const used = new Set();
  for (const w of circuit.conductors) { used.add(w.fromTerminal); used.add(w.toTerminal); }
  return [...terminalIndex(circuit.components).values()].filter((t) => !used.has(t.id));
};

/** How many conductors land on each terminal. */
export const connectionCounts = (circuit) => {
  const counts = new Map();
  for (const t of terminalIndex(circuit.components).keys()) counts.set(t, 0);
  for (const w of circuit.conductors) {
    counts.set(w.fromTerminal, (counts.get(w.fromTerminal) ?? 0) + 1);
    counts.set(w.toTerminal, (counts.get(w.toTerminal) ?? 0) + 1);
  }
  return counts;
};

export { Nets, componentIndex };
