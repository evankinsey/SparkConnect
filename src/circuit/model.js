// ─── CIRCUIT MODEL ───────────────────────────────────────────────────────────
// Data shapes for the wiring simulation engine.
// Requirements: SIM-02, SIM-05, SIM-06, SIM-07, SIM-08, SIM-09  (docs/v1.1/REQUIREMENTS.md)
//
// Pure data + pure functions. No React, no React Native, no I/O — so the engine
// is directly testable and the UI can never change what "correct" means (SIM-16).

// SIM-09 — semantic roles a conductor can carry.
// A conductor's ROLE IS A LABEL. It never decides correctness: a traveler does
// not become correct because the user coloured it red (SIM-10). Roles exist so
// the UI can teach conductor function and so terminals can reject nonsense
// (e.g. a neutral landed on a switch traveler screw).
export const ConductorRole = {
  LINE: 'LINE',
  LOAD: 'LOAD',
  NEUTRAL: 'NEUTRAL',
  TRAVELER_A: 'TRAVELER_A',
  TRAVELER_B: 'TRAVELER_B',
  SWITCHED_HOT: 'SWITCHED_HOT',
  EQUIPMENT_GROUND: 'EQUIPMENT_GROUND',
  COMMON: 'COMMON',
  UNSPECIFIED: 'UNSPECIFIED',
};

// What a terminal *is*, electrically. Unlike ConductorRole this DOES affect
// solving, because it tells the solver which terminals are the supply and which
// belong to a load.
export const TerminalRole = {
  SOURCE_LINE: 'SOURCE_LINE',
  SOURCE_NEUTRAL: 'SOURCE_NEUTRAL',
  SOURCE_GROUND: 'SOURCE_GROUND',
  SWITCH_COMMON: 'SWITCH_COMMON',
  SWITCH_TRAVELER: 'SWITCH_TRAVELER',
  SWITCH_LINE_SIDE: 'SWITCH_LINE_SIDE',
  SWITCH_LOAD_SIDE: 'SWITCH_LOAD_SIDE',
  FOURWAY_INPUT: 'FOURWAY_INPUT',
  FOURWAY_OUTPUT: 'FOURWAY_OUTPUT',
  LOAD_HOT: 'LOAD_HOT',
  LOAD_NEUTRAL: 'LOAD_NEUTRAL',
  EQUIPMENT_GROUND: 'EQUIPMENT_GROUND',
  SPLICE: 'SPLICE',
};

export const ComponentType = {
  SOURCE: 'SOURCE',                 // branch circuit supply: hot, neutral, EGC
  SWITCH_SINGLE_POLE: 'SWITCH_SINGLE_POLE',
  SWITCH_THREE_WAY: 'SWITCH_THREE_WAY',
  SWITCH_FOUR_WAY: 'SWITCH_FOUR_WAY',
  LUMINAIRE: 'LUMINAIRE',
  RECEPTACLE: 'RECEPTACLE',
  GFCI_RECEPTACLE: 'GFCI_RECEPTACLE',
  SPLICE: 'SPLICE',                 // wire nut / box splice point
};

// ─── Builders ────────────────────────────────────────────────────────────────
// Terminals are addressed as "componentId.terminalLocalId" everywhere.

export const terminalId = (componentId, localId) => `${componentId}.${localId}`;

const mkTerminal = (componentId, localId, role, opts = {}) => ({
  id: terminalId(componentId, localId),
  localId,
  componentId,
  semanticRole: role,
  acceptedConductorRoles: opts.accepts ?? null, // null = any role accepted
  required: opts.required ?? false,
  maxConnections: opts.maxConnections ?? 4,
  polarityOrFunction: opts.polarityOrFunction ?? null,
  label: opts.label ?? localId,
});

/**
 * Branch-circuit supply. `switchStates` never affects it.
 * Terminals: hot (SOURCE_LINE), neutral (SOURCE_NEUTRAL), ground (SOURCE_GROUND).
 */
export const source = (id = 'src', label = 'Branch Circuit Supply') => ({
  id,
  type: ComponentType.SOURCE,
  label,
  metadata: {},
  terminals: [
    mkTerminal(id, 'hot', TerminalRole.SOURCE_LINE, { required: true, label: 'Ungrounded (hot)' }),
    mkTerminal(id, 'neutral', TerminalRole.SOURCE_NEUTRAL, { required: true, label: 'Grounded (neutral)' }),
    mkTerminal(id, 'ground', TerminalRole.SOURCE_GROUND, { required: true, label: 'Equipment ground' }),
  ],
});

/**
 * Single-pole switch. State 0 = open, 1 = closed.
 * Both screws are interchangeable on a real single-pole switch, so the engine
 * treats them symmetrically — line may land on either (SIM-15).
 */
export const singlePoleSwitch = (id, label = 'Single-Pole Switch') => ({
  id,
  type: ComponentType.SWITCH_SINGLE_POLE,
  label,
  metadata: { positions: 2, positionLabels: ['OFF', 'ON'] },
  terminals: [
    mkTerminal(id, 'a', TerminalRole.SWITCH_LINE_SIDE, { required: true, label: 'Screw 1' }),
    mkTerminal(id, 'b', TerminalRole.SWITCH_LOAD_SIDE, { required: true, label: 'Screw 2' }),
    mkTerminal(id, 'gnd', TerminalRole.EQUIPMENT_GROUND, {
      accepts: [ConductorRole.EQUIPMENT_GROUND], required: true, label: 'Green (EGC)',
    }),
  ],
});

/**
 * Three-way switch. State 0 = common bonded to traveler 1, state 1 = common
 * bonded to traveler 2. There is no "off" position — that is the whole point,
 * and it is why the toggle test in the validator is topology-independent.
 */
export const threeWaySwitch = (id, label = 'Three-Way Switch') => ({
  id,
  type: ComponentType.SWITCH_THREE_WAY,
  label,
  metadata: { positions: 2, positionLabels: ['Position 1', 'Position 2'] },
  terminals: [
    mkTerminal(id, 'com', TerminalRole.SWITCH_COMMON, {
      required: true, label: 'Common (dark screw)',
      polarityOrFunction: 'Carries line in, or switched hot out — never a traveler',
    }),
    mkTerminal(id, 't1', TerminalRole.SWITCH_TRAVELER, { required: true, label: 'Traveler 1' }),
    mkTerminal(id, 't2', TerminalRole.SWITCH_TRAVELER, { required: true, label: 'Traveler 2' }),
    mkTerminal(id, 'gnd', TerminalRole.EQUIPMENT_GROUND, {
      accepts: [ConductorRole.EQUIPMENT_GROUND], required: true, label: 'Green (EGC)',
    }),
  ],
});

/**
 * Four-way switch. State 0 = straight through (in1-out1, in2-out2),
 * state 1 = crossed (in1-out2, in2-out1).  (LSN-04, TST-01 four-way straight/cross)
 */
export const fourWaySwitch = (id, label = 'Four-Way Switch') => ({
  id,
  type: ComponentType.SWITCH_FOUR_WAY,
  label,
  metadata: { positions: 2, positionLabels: ['Straight through', 'Crossed'] },
  terminals: [
    mkTerminal(id, 'in1', TerminalRole.FOURWAY_INPUT, { required: true, label: 'Traveler in 1' }),
    mkTerminal(id, 'in2', TerminalRole.FOURWAY_INPUT, { required: true, label: 'Traveler in 2' }),
    mkTerminal(id, 'out1', TerminalRole.FOURWAY_OUTPUT, { required: true, label: 'Traveler out 1' }),
    mkTerminal(id, 'out2', TerminalRole.FOURWAY_OUTPUT, { required: true, label: 'Traveler out 2' }),
    mkTerminal(id, 'gnd', TerminalRole.EQUIPMENT_GROUND, {
      accepts: [ConductorRole.EQUIPMENT_GROUND], required: true, label: 'Green (EGC)',
    }),
  ],
});

/**
 * A two-terminal load. Its terminals are NEVER bonded internally — that is what
 * makes a short detectable: if line and neutral land in the same net, current
 * bypassed the load.
 */
export const luminaire = (id, label = 'Luminaire') => ({
  id,
  type: ComponentType.LUMINAIRE,
  label,
  metadata: { isLoad: true },
  terminals: [
    mkTerminal(id, 'hot', TerminalRole.LOAD_HOT, { required: true, label: 'Hot / brass' }),
    mkTerminal(id, 'neu', TerminalRole.LOAD_NEUTRAL, {
      accepts: [ConductorRole.NEUTRAL], required: true, label: 'Neutral / white',
    }),
    mkTerminal(id, 'gnd', TerminalRole.EQUIPMENT_GROUND, {
      accepts: [ConductorRole.EQUIPMENT_GROUND], required: true, label: 'Green (EGC)',
    }),
  ],
});

export const receptacle = (id, label = 'Receptacle') => ({
  id,
  type: ComponentType.RECEPTACLE,
  label,
  metadata: { isLoad: true },
  terminals: [
    mkTerminal(id, 'hot', TerminalRole.LOAD_HOT, { required: true, label: 'Brass (hot)' }),
    mkTerminal(id, 'neu', TerminalRole.LOAD_NEUTRAL, {
      accepts: [ConductorRole.NEUTRAL], required: true, label: 'Silver (neutral)',
    }),
    mkTerminal(id, 'gnd', TerminalRole.EQUIPMENT_GROUND, {
      accepts: [ConductorRole.EQUIPMENT_GROUND], required: true, label: 'Green (EGC)',
    }),
  ],
});

/** Splice point / wire nut. All conductors landing here are bonded together. */
export const splice = (id, label = 'Splice', count = 4) => ({
  id,
  type: ComponentType.SPLICE,
  label,
  metadata: { bondsAllTerminals: true },
  terminals: Array.from({ length: count }, (_, i) =>
    mkTerminal(id, `p${i + 1}`, TerminalRole.SPLICE, { label: `Point ${i + 1}`, maxConnections: 8 })),
});

// ─── Conductors ──────────────────────────────────────────────────────────────

let _conductorSeq = 0;
export const conductor = (fromTerminal, toTerminal, role = ConductorRole.UNSPECIFIED, opts = {}) => ({
  id: opts.id ?? `w${++_conductorSeq}`,
  fromTerminal,
  toTerminal,
  role,
  displayColor: opts.displayColor ?? null,
  userAssignedLabel: opts.userAssignedLabel ?? null,
});

// ─── Lookup helpers ──────────────────────────────────────────────────────────

export const allTerminals = (components) => components.flatMap((c) => c.terminals);

export const terminalIndex = (components) => {
  const map = new Map();
  for (const c of components) for (const t of c.terminals) map.set(t.id, t);
  return map;
};

export const componentIndex = (components) => {
  const map = new Map();
  for (const c of components) map.set(c.id, c);
  return map;
};

export const findTerminalsByRole = (components, role) =>
  allTerminals(components).filter((t) => t.semanticRole === role);

/** Components whose position the solver must enumerate, in stable order. */
export const switchableComponents = (components) =>
  components.filter((c) =>
    c.type === ComponentType.SWITCH_SINGLE_POLE ||
    c.type === ComponentType.SWITCH_THREE_WAY ||
    c.type === ComponentType.SWITCH_FOUR_WAY);

export const loadComponents = (components) => components.filter((c) => c.metadata && c.metadata.isLoad);
