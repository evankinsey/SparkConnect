// ─── INSPECT ─────────────────────────────────────────────────────────────────
// Tap a wire or a terminal and find out what it actually is.
//
// This is the part that turns the simulator from a puzzle into a lesson. A
// beginner staring at a red conductor between two three-ways does not know
// whether it is a traveler, a switched leg, or a hot — and the app knows, so it
// should say.
//
// Every explanation here describes the CONDUCTOR'S JOB, not the answer to the
// current lesson. Inspecting is always allowed, in guided mode and expert mode
// and after a wrong test, because knowing what a traveler does is not a hint
// about where this particular traveler goes.
//
// Pure module: no React. The screen renders what this returns.

import { ConductorRole, ComponentType, TerminalRole } from './model.js';

/** What a conductor of this role is for. */
export const ROLE_INFO = Object.freeze({
  [ConductorRole.LINE]: {
    title: 'Line (ungrounded)',
    color: 'Black',
    summary: 'The incoming hot from the panel. This is the conductor the overcurrent device protects.',
    points: [
      'Energized whenever the breaker is on, regardless of switch position',
      'Lands on the common of a three-way, or either screw of a single-pole',
      'Never lands on a neutral bar or an equipment ground',
    ],
  },
  [ConductorRole.SWITCHED_HOT]: {
    title: 'Switched leg',
    color: 'Black, or red where a marker is used',
    summary: 'The conductor between the switch and the load. It is hot only when the switch is closed.',
    points: [
      'Dead with the switch off — that is the whole point of a switch loop',
      'Leaves the switch and lands on the load, not on another switch',
      'If the light is always on, this is usually landed on the line instead',
    ],
  },
  [ConductorRole.TRAVELER_A]: {
    title: 'Traveler',
    color: 'Red, or the pair used for travelers',
    summary: 'One of the two conductors that run between a pair of three-way switches.',
    points: [
      'Carries current between the switches, never to the load directly',
      'Either traveler can be the hot one depending on switch position',
      'Lands on a traveler screw at BOTH switches — never on a common',
    ],
  },
  [ConductorRole.TRAVELER_B]: {
    title: 'Traveler',
    color: 'Red or orange, the second of the pair',
    summary: 'The other of the two conductors running between the three-way switches.',
    points: [
      'Works as a pair with the first traveler; one open traveler makes the light intermittent',
      'A four-way switch goes between the two travelers, not in series with the load',
      'Landing a traveler on a common is the single most common three-way fault',
    ],
  },
  [ConductorRole.NEUTRAL]: {
    title: 'Grounded conductor (neutral)',
    color: 'White or grey',
    summary: 'The return path back to the source. It is a current-carrying conductor — treat it like one.',
    points: [
      'Runs continuously from the supply to the load; it is not switched',
      'Lands on the silver screw at a device, or a neutral splice',
      'A switched neutral leaves the load energized with the switch off',
    ],
  },
  [ConductorRole.EQUIPMENT_GROUND]: {
    title: 'Equipment grounding conductor',
    color: 'Green, green with yellow stripe, or bare',
    summary: 'The fault path. It carries no current in normal operation and exists so a fault trips the breaker.',
    points: [
      'Bonds metal parts back to the source so a short has somewhere to go',
      'Lands on the green screw, and every device in the circuit gets one',
      'Never a substitute for the neutral, and never carries load current',
    ],
  },
  [ConductorRole.LOAD]: {
    title: 'Load conductor',
    color: 'Varies with the run',
    summary: 'A conductor feeding the load side of the circuit.',
    points: ['Lands on the load, not on another switch', 'Dead when the controlling switch is open'],
  },
  [ConductorRole.COMMON]: {
    title: 'Common conductor',
    color: 'Varies with the run',
    summary: 'The conductor landing on a three-way common — the line at one switch, the switched leg at the other.',
    points: ['The common screw is the odd-coloured one, usually dark', 'Never a traveler'],
  },
  [ConductorRole.UNSPECIFIED]: {
    title: 'Unassigned conductor',
    color: '—',
    summary: 'This conductor has no role assigned yet. Pick a conductor type before running it.',
    points: [],
  },
});

export const roleInfo = (role) => ROLE_INFO[role] ?? ROLE_INFO[ConductorRole.UNSPECIFIED];

/** What a device is and what its terminals expect. */
export const COMPONENT_INFO = Object.freeze({
  [ComponentType.SOURCE]: {
    title: 'Branch circuit supply',
    summary: 'Where the circuit starts: the breaker, the grounded conductor and the grounding electrode path.',
    points: ['Hot is protected by the breaker', 'Neutral returns to the source', 'Ground is the fault path, not a return'],
  },
  [ComponentType.SWITCH_SINGLE_POLE]: {
    title: 'Single-pole switch',
    summary: 'Two screws plus a ground. It opens and closes ONE conductor — the ungrounded one.',
    points: ['Either brass screw can take the line', 'The other screw becomes the switched leg', 'Switching the neutral instead is a code violation and a shock hazard'],
  },
  [ComponentType.SWITCH_THREE_WAY]: {
    title: 'Three-way switch',
    summary: 'A common and two travelers. It steers the circuit between the two travelers rather than simply opening it.',
    points: ['The common is the odd-coloured screw, usually dark', 'One switch takes the line on its common, the other takes the switched leg', 'Travelers land on traveler screws at both switches'],
  },
  [ComponentType.SWITCH_FOUR_WAY]: {
    title: 'Four-way switch',
    summary: 'Goes BETWEEN the two three-ways and swaps the travelers over. Any number of these can be added to a pair.',
    points: ['Wired into the travelers, never into the line or the load', 'Two travelers in, two travelers out', 'Crossing the pairs is the usual four-way mistake'],
  },
  [ComponentType.LUMINAIRE]: {
    title: 'Luminaire',
    summary: 'The load. Needs the switched conductor, the neutral, and a ground.',
    points: ['Hot lands on the brass terminal', 'Neutral lands on the silver terminal', 'The shell of a lampholder goes to the neutral, not the hot'],
  },
  [ComponentType.RECEPTACLE]: {
    title: 'Receptacle',
    summary: 'An outlet. Brass to hot, silver to neutral, green to ground.',
    points: ['Reversed polarity energizes the shell of anything plugged in', 'Needs a ground for any grounding-type receptacle', 'Backstabs are legal and still a bad idea'],
  },
  [ComponentType.GFCI_RECEPTACLE]: {
    title: 'GFCI receptacle',
    summary: 'A receptacle that opens the circuit on a ground fault. LINE and LOAD are not interchangeable.',
    points: ['Supply lands on LINE; anything downstream lands on LOAD', 'Reversing line and load leaves it un-protected and it will not reset', 'Test and reset monthly, and after any work on the circuit'],
  },
  [ComponentType.SPLICE]: {
    title: 'Splice point',
    summary: 'A junction where conductors of the same role are joined. Every point on a splice is electrically the same node.',
    points: ['Landing on any point of the splice is the same connection', 'Neutrals splice together; grounds splice together', 'Splices belong in an accessible box'],
  },
});

export const componentInfo = (type) => COMPONENT_INFO[type] ?? {
  title: 'Device', summary: 'Part of the circuit.', points: [],
};

/** What a specific terminal is for. */
export const TERMINAL_INFO = Object.freeze({
  [TerminalRole.SOURCE_LINE]: 'The ungrounded supply, protected by the breaker.',
  [TerminalRole.SOURCE_NEUTRAL]: 'The grounded supply conductor — the return path.',
  [TerminalRole.SOURCE_GROUND]: 'The grounding electrode / equipment ground reference.',
  [TerminalRole.SWITCH_COMMON]: 'The common. The line lands here at one three-way, the switched leg at the other.',
  [TerminalRole.SWITCH_TRAVELER]: 'A traveler screw. Only travelers land here — never the line or the load.',
  [TerminalRole.SWITCH_LINE_SIDE]: 'A single-pole switch screw. One side takes the line, the other becomes the switched leg.',
  [TerminalRole.SWITCH_LOAD_SIDE]: 'A single-pole switch screw. Whichever screw the line does not land on becomes the switched leg.',
  [TerminalRole.FOURWAY_INPUT]: 'Travelers coming IN to the four-way from one three-way.',
  [TerminalRole.FOURWAY_OUTPUT]: 'Travelers going OUT of the four-way toward the other three-way.',
  [TerminalRole.LOAD_HOT]: 'The load\'s ungrounded terminal — brass.',
  [TerminalRole.LOAD_NEUTRAL]: 'The load\'s grounded terminal — silver.',
  [TerminalRole.EQUIPMENT_GROUND]: 'The equipment ground screw — green.',
  [TerminalRole.SPLICE]: 'A splice point. Every point on this splice is the same electrical node.',
});

/**
 * Build the panel for a tapped terminal. `component` and `terminal` come
 * straight from the lesson's own model, so this can never describe a device
 * that is not on screen.
 */
export const inspectTerminal = (component, terminal, connectionCount = 0) => {
  if (!component || !terminal) return null;
  const ci = componentInfo(component.type);
  return {
    kind: 'TERMINAL',
    heading: terminal.label || terminal.localId,
    subheading: component.label,
    summary: TERMINAL_INFO[terminal.semanticRole] ?? ci.summary,
    points: ci.points,
    status: connectionCount > 0
      ? `${connectionCount} conductor${connectionCount === 1 ? '' : 's'} landed here`
      : 'Nothing landed here yet',
  };
};

/** Build the panel for a tapped conductor. */
export const inspectWire = (wire, fromLabel, toLabel) => {
  if (!wire) return null;
  const info = roleInfo(wire.role);
  return {
    kind: 'WIRE',
    heading: info.title,
    subheading: fromLabel && toLabel ? `${fromLabel} → ${toLabel}` : null,
    colorNote: info.color,
    summary: info.summary,
    points: info.points,
    status: null,
  };
};
