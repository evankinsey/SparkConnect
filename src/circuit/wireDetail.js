// ─── WHAT IS THIS CONDUCTOR DOING ────────────────────────────────────────────
// Tap a wire and get its job, what a meter would read on it, why it lands where
// it lands, and what goes wrong when it does not.
//
// `inspect.js` already answers "what is a traveler". That is a definition, and
// a definition is the same on every circuit. THIS answers "what is THIS
// conductor doing in THIS circuit right now", which is different in a way that
// matters: the same red wire is a traveler in one lesson and a switched leg in
// another, and the reason a beginner cannot tell is that nothing on screen has
// ever told them what it would read.
//
// EVERYTHING ELECTRICAL HERE IS SOLVED, NOT WRITTEN. The expected readings come
// from the same solver that grades the lesson, evaluated in every switch
// position. No author writes "this should read 120", so no author can write it
// wrong, and the readings stay correct when somebody miswires the circuit —
// which is the case where they are worth the most.
//
// THE OPEN-CONDUCTOR RULE, which is the whole reason this is worth building:
// when a conductor reaches neither supply conductor, this does NOT say "reads
// 0 V". A floating conductor next to an energized one reads whatever the meter
// picks up — often 40 or 60 volts of nothing — and an apprentice who was told
// to expect zero concludes the meter is broken or the wire is live. Saying
// "this is not connected to anything, and your meter may still show a number"
// is the single most useful sentence in this module.
//
// Pure module: no React, no network.

import { ConductorRole, TerminalRole, ComponentType, componentIndex, terminalIndex } from './model.js';
import { solveState, enumerateSwitchStates } from './solver.js';
import { roleInfo, componentInfo, TERMINAL_INFO } from './inspect.js';
import { resolveCitation } from '../nec/citations.js';

/** What a conductor is doing electrically, in one switch position. */
export const Energization = Object.freeze({
  HOT: 'HOT',               // solidly on the ungrounded supply
  GROUNDED: 'GROUNDED',     // on the grounded supply conductor
  BACKFED: 'BACKFED',       // reaches the hot only THROUGH a load
  PULLED_LOW: 'PULLED_LOW', // reaches the neutral only through a load
  OPEN: 'OPEN',             // reaches neither, by any path. NOT "reads zero"
  BONDED: 'BONDED',         // on the equipment grounding path
});

const ENERGIZATION_COPY = Object.freeze({
  HOT: {
    reads: 'line voltage to the grounded conductor',
    why: 'This conductor is connected back to the ungrounded supply in this position.',
  },
  GROUNDED: {
    reads: '0 V to the grounded conductor',
    why: 'This conductor IS the return path, so there is no difference to measure against it.',
  },
  BACKFED: {
    reads: 'close to line voltage — but through the load',
    // The reading behind half the "the white wire is hot" calls.
    why: 'It only reaches the ungrounded supply through the load. A high-impedance meter '
      + 'reads nearly full voltage here while almost no current can flow, which is why an '
      + 'open neutral shows line voltage on a white conductor. It is a real hazard and it '
      + 'is not a short.',
  },
  PULLED_LOW: {
    reads: 'about 0 V — pulled down through the load',
    // Why a dead switch leg is not "floating", and why it looks the same as a
    // good connection on a meter.
    why: 'Nothing energized reaches this conductor, but the load ties it to the grounded '
      + 'conductor, so it sits near zero rather than floating. A meter cannot tell this '
      + 'apart from a good grounded connection — that is what continuity is for.',
  },
  OPEN: {
    reads: 'nothing solid — and your meter may still show a number',
    why: 'This conductor reaches neither supply conductor by any path. A digital meter on a '
      + 'floating conductor picks up voltage from whatever runs beside it, so 40 or 60 volts '
      + 'here means open, not live. Confirm with a low-impedance tester before you trust it '
      + 'either way.',
  },
  BONDED: {
    reads: '0 V, and continuous back to the supply ground',
    why: 'This is the fault path. It carries no current in normal operation.',
  },
});

const supplyTerminals = (components) => {
  const find = (role) => {
    for (const c of components) {
      for (const t of c.terminals) if (t.semanticRole === role) return t.id;
    }
    return null;
  };
  return {
    hot: find(TerminalRole.SOURCE_LINE),
    neutral: find(TerminalRole.SOURCE_NEUTRAL),
    ground: find(TerminalRole.SOURCE_GROUND),
  };
};

/** The two terminals of every load, paired, so one can be reached through the other. */
const loadPairs = (components) => {
  const pairs = [];
  for (const c of components) {
    if (!c.metadata?.isLoad) continue;
    const hot = c.terminals.find((t) => t.semanticRole === TerminalRole.LOAD_HOT);
    const neu = c.terminals.find((t) => t.semanticRole === TerminalRole.LOAD_NEUTRAL);
    if (hot && neu) pairs.push([hot.id, neu.id]);
  }
  return pairs;
};

/**
 * How this conductor sits electrically, in one switch position.
 *
 * Read off the solver's nets, so a miswired circuit reports what it actually
 * does rather than what the lesson intended.
 *
 * THE LOAD IS NOT AN OPEN CIRCUIT, and the solver deliberately does not bond
 * its terminals — it must not, or every load would look like a short. So the
 * coupling through a load is worked out here instead, and it is worth the extra
 * pass: a switched leg with the switch off is not floating, it is tied to the
 * grounded conductor through the lamp, and calling that OPEN would teach
 * somebody to expect a floating reading where a meter shows a solid zero.
 */
export const energizationOf = (circuit, wire, switchState = {}) => {
  if (!circuit || !wire) return null;
  const state = solveState(circuit, switchState);
  const supply = supplyTerminals(circuit.components);
  const probe = wire.fromTerminal;

  const at = (t) => !!(t && state.nets.connected(probe, t));

  // Direct connections first. Nothing through a load outranks a solid one.
  if (at(supply.ground) && !at(supply.hot) && !at(supply.neutral)) return Energization.BONDED;
  if (at(supply.hot)) return Energization.HOT;
  if (at(supply.neutral)) return Energization.GROUNDED;

  // Nothing direct. Now: does a load bridge this conductor to either supply?
  for (const [a, b] of loadPairs(circuit.components)) {
    const near = at(a) ? b : at(b) ? a : null;
    if (!near) continue;
    if (supply.hot && state.nets.connected(near, supply.hot)) return Energization.BACKFED;
    if (supply.neutral && state.nets.connected(near, supply.neutral)) return Energization.PULLED_LOW;
  }

  return Energization.OPEN;
};

const positionLabel = (components, switchState) => {
  const byId = componentIndex(components);
  const parts = [];
  for (const [id, pos] of Object.entries(switchState)) {
    const c = byId.get(id);
    const labels = c?.metadata?.positionLabels ?? ['position 1', 'position 2'];
    parts.push(`${c?.label ?? id} ${labels[pos] ?? pos}`);
  }
  return parts.length ? `With ${parts.join(' and ')}` : 'With the circuit energized';
};

/**
 * What a meter would read on this conductor, in every switch position.
 *
 * Collapsed when every position gives the same answer, because four identical
 * rows is how somebody learns to stop reading the panel.
 */
export const expectedReadings = (circuit, wire) => {
  if (!circuit || !wire) return Object.freeze([]);
  const states = enumerateSwitchStates(circuit.components);
  const rows = states.map((switchState) => {
    const e = energizationOf(circuit, wire, switchState);
    return {
      positions: positionLabel(circuit.components, switchState),
      switchState,
      energization: e,
      ...ENERGIZATION_COPY[e],
    };
  });

  const allSame = rows.every((r) => r.energization === rows[0].energization);
  if (allSame && rows.length > 1) {
    return Object.freeze([Object.freeze({
      ...rows[0],
      positions: 'In every switch position',
      switchState: null,
    })]);
  }
  return Object.freeze(rows.map((r) => Object.freeze(r)));
};

/**
 * Why this conductor lands where it lands.
 *
 * Built from the two terminals it actually connects, so it describes the run in
 * front of the user rather than a generic one. Says nothing about whether the
 * connection is CORRECT — that is the lesson's job, and answering it here would
 * turn inspection into a hint.
 */
export const whyItLandsHere = (circuit, wire) => {
  if (!circuit || !wire) return null;
  const tIndex = terminalIndex(circuit.components);
  const cIndex = componentIndex(circuit.components);
  const from = tIndex.get(wire.fromTerminal);
  const to = tIndex.get(wire.toTerminal);
  if (!from || !to) return null;

  const describe = (t) => {
    const comp = cIndex.get(t.id.split('.')[0]);
    const purpose = TERMINAL_INFO[t.semanticRole];
    return {
      terminalId: t.id,
      terminal: t.label || t.localId,
      device: comp?.label ?? 'device',
      deviceType: comp?.type ?? null,
      purpose: purpose ?? componentInfo(comp?.type).summary,
    };
  };

  return Object.freeze({ from: Object.freeze(describe(from)), to: Object.freeze(describe(to)) });
};

/**
 * What goes wrong with a conductor of this role.
 *
 * Written as consequences rather than rules. "Do not switch the neutral" is a
 * rule somebody forgets; "the fixture stays energized with the switch off, and
 * whoever changes the bulb finds out" is a thing they remember.
 */
const MISTAKES = Object.freeze({
  [ConductorRole.LINE]: [
    { mistake: 'Landing it on the load side of the switch',
      consequence: 'The light is on permanently and the switch does nothing.' },
    { mistake: 'Landing it on a traveler screw at a three-way',
      consequence: 'The pair works from one location and not the other, or not at all.' },
  ],
  [ConductorRole.SWITCHED_HOT]: [
    { mistake: 'Running it to the other switch instead of the load',
      consequence: 'The two switches fight each other and the load never sees a complete path.' },
    { mistake: 'Landing it on the neutral terminal of the fixture',
      consequence: 'The shell of the lampholder is energized with the switch closed.' },
  ],
  [ConductorRole.TRAVELER_A]: [
    { mistake: 'Landing a traveler on a common screw',
      consequence: 'The single most common three-way fault. One location works, the other does not.' },
    { mistake: 'Splitting the pair across two cables',
      consequence: 'It may work and it is an inductive-heating and code problem — conductors of a circuit belong in the same raceway or cable.' },
  ],
  [ConductorRole.TRAVELER_B]: [
    { mistake: 'Crossing the pair through a four-way',
      consequence: 'The four-way stops reversing the pair and becomes a switch that does nothing in one position.' },
    { mistake: 'Leaving one traveler off',
      consequence: 'The light works from some switch combinations and not others — the classic "it is intermittent" call.' },
  ],
  [ConductorRole.NEUTRAL]: [
    { mistake: 'Running it through the switch',
      consequence: 'The fixture stays energized with the switch off, and whoever changes the bulb finds out.' },
    { mistake: 'Borrowing it from another circuit',
      consequence: 'Two circuits share a return path that was never sized for both, and the conductor carries the sum with no overcurrent device watching it.' },
  ],
  [ConductorRole.EQUIPMENT_GROUND]: [
    { mistake: 'Using it as a neutral',
      consequence: 'Load current on the fault path energizes every metal part it touches.' },
    { mistake: 'Leaving a device unbonded',
      consequence: 'A fault to the metal box has nowhere to go, so the breaker never trips and the box stays live.' },
  ],
});

/**
 * NEC references for this role.
 *
 * Only citations that RESOLVE are returned. An unresolvable citation is
 * indistinguishable from an invented one, and this app drops those everywhere
 * else, so it drops them here too.
 */
const ROLE_CITATIONS = Object.freeze({
  [ConductorRole.NEUTRAL]: ['404.2(B)', '404.2(C)'],
  [ConductorRole.SWITCHED_HOT]: ['404.2(C)'],
  [ConductorRole.EQUIPMENT_GROUND]: ['250.4(A)(5)', '250.122'],
  [ConductorRole.LINE]: ['240.4(D)', '110.14(C)'],
});

export const referencesFor = (role, edition = null) => Object.freeze(
  (ROLE_CITATIONS[role] ?? [])
    .map((ref) => resolveCitation(ref, edition))
    .filter(Boolean)
    .map((hit) => Object.freeze({ ref: hit.ref, display: hit.display, topic: hit.topic })),
);

/**
 * Everything a tap on a conductor should show.
 *
 * `expected` is solved; `mistakes` and `references` are reviewed content; the
 * two are kept in separate fields so a screen can label them differently. A
 * reader has to be able to tell "the app computed this" from "somebody wrote
 * this", because those deserve different amounts of trust.
 */
export const inspectConductor = (circuit, wire, { edition = null } = {}) => {
  if (!wire) return null;
  const info = roleInfo(wire.role);
  const lands = circuit ? whyItLandsHere(circuit, wire) : null;

  return Object.freeze({
    kind: 'CONDUCTOR',
    heading: info.title,
    colorNote: info.color,
    summary: info.summary,
    points: info.points,

    subheading: lands ? `${lands.from.device} → ${lands.to.device}` : null,
    lands,
    // The two ends, in the words of what each terminal is for. This is the
    // "why does it connect here" answer, and it stops short of saying whether
    // the connection is right — that is the lesson's job, not the inspector's.
    whyHere: lands
      ? `${lands.from.purpose} ${lands.to.purpose}`
      : null,

    // Solved.
    expected: circuit ? expectedReadings(circuit, wire) : Object.freeze([]),
    computed: true,

    // Reviewed content.
    mistakes: Object.freeze(MISTAKES[wire.role] ?? []),
    references: referencesFor(wire.role, edition),

    // Inspecting is always allowed — knowing what a traveler does is not a hint
    // about where this particular traveler goes.
    allowedDuringLesson: true,
  });
};

export { ENERGIZATION_COPY };
