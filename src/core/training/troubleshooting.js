// ─── TROUBLESHOOTING MODE ────────────────────────────────────────────────────
// Requirements: LSN-05, LSN-06, ROAD-01 · "Customer says: half the house lost power"
//
// The insight that makes this work: a troubleshooting scenario is a CORRECT
// circuit with a specific fault injected. We do not hand-author symptoms — we
// break a known-good circuit in a defined way and let the deterministic engine
// tell us what actually happens. The symptom the user sees is therefore always
// electrically real, and it stays correct if the engine or the lesson changes.
//
// That also means a scenario can never claim a symptom the circuit would not
// produce, which is the failure mode of every hand-written troubleshooting quiz.

import { conductor, terminalId as T, ConductorRole } from '../../circuit/model.js';
import { truthTable, toggleAnalysis } from '../../circuit/solver.js';
import { lessonById, solutionCircuit } from '../../circuit/lessons/index.js';
import { TRAINING_DISCLAIMER } from '../../circuit/review.js';

// ─── Fault injection ─────────────────────────────────────────────────────────

export const FaultKind = {
  OPEN_CONDUCTOR: 'OPEN_CONDUCTOR',       // a wire is disconnected
  MISLANDED: 'MISLANDED',                 // a wire is on the wrong terminal
  SWAPPED: 'SWAPPED',                     // two wires exchanged terminals
  SHORT: 'SHORT',                         // an extra conductor creates a path
};

/**
 * Apply a fault to a conductor list. Pure — returns a new list.
 * Every fault is described declaratively so a scenario is data, not code.
 */
export const injectFault = (conductors, fault) => {
  switch (fault.kind) {
    case FaultKind.OPEN_CONDUCTOR:
      return conductors.filter((w) => !matches(w, fault.target));

    case FaultKind.MISLANDED:
      return conductors.map((w) =>
        matches(w, fault.target)
          ? { ...w, [fault.end === 'from' ? 'fromTerminal' : 'toTerminal']: fault.to }
          : w);

    case FaultKind.SWAPPED: {
      const [a, b] = fault.terminals;
      return conductors.map((w) => ({
        ...w,
        fromTerminal: w.fromTerminal === a ? b : w.fromTerminal === b ? a : w.fromTerminal,
        toTerminal: w.toTerminal === a ? b : w.toTerminal === b ? a : w.toTerminal,
      }));
    }

    case FaultKind.SHORT:
      return [...conductors, conductor(fault.from, fault.to, ConductorRole.UNSPECIFIED, { id: 'fault-short' })];

    default:
      return conductors;
  }
};

const matches = (wire, target) => {
  if (!target) return false;
  if (target.id) return wire.id === target.id;
  if (target.role) return wire.role === target.role;
  if (target.between) {
    const [a, b] = target.between;
    return (wire.fromTerminal === a && wire.toTerminal === b) ||
           (wire.fromTerminal === b && wire.toTerminal === a);
  }
  return false;
};

// ─── Symptom derivation ──────────────────────────────────────────────────────

/**
 * What the customer would actually observe, derived from the engine rather than
 * written by hand.
 *
 * @returns {{summary, detail, deadStates, workingStates, alwaysOff, alwaysOn,
 *            partialControl, switchesThatWork, switchesThatDoNot, shortPresent}}
 */
export const deriveSymptom = (circuit) => {
  const { switchIds, rows } = truthTable(circuit);
  const analysis = toggleAnalysis(circuit);

  const workingStates = rows.filter((r) => r.anyLoadEnergized).length;
  const shortPresent = rows.some((r) => r.shortCircuit);

  const dead = analysis.perSwitch.filter((s) => !s.controlsLoad).map((s) => s.switchId);
  const live = analysis.perSwitch.filter((s) => s.controlsLoad).map((s) => s.switchId);

  let summary;
  if (shortPresent) {
    summary = 'The breaker trips as soon as the circuit is energized.';
  } else if (analysis.alwaysOff) {
    summary = 'The light never comes on, in any switch position.';
  } else if (analysis.alwaysOn) {
    summary = 'The light is on all the time and no switch turns it off.';
  } else if (live.length && dead.length) {
    summary = live.length === 1
      ? 'The light is only controlled from one location. The other switches do nothing on their own.'
      : `The light is controlled from ${live.length} locations. ${dead.length} of them do nothing on their own.`;
  } else if (!live.length) {
    // No single switch reliably toggles the load, yet some combination lights
    // it. This is the classic "only works if the other switch is just right".
    summary = 'The light only works in one particular combination of switch positions. ' +
      'Moving either switch turns it off, and the other switch will not bring it back.';
  } else {
    summary = 'The light works correctly from every switch.';
  }

  return {
    summary,
    detail: describeStates(switchIds, rows),
    deadStates: rows.length - workingStates,
    workingStates,
    alwaysOff: analysis.alwaysOff,
    alwaysOn: analysis.alwaysOn,
    partialControl: dead.length > 0 && live.length > 0,
    switchesThatWork: live,
    switchesThatDoNot: dead,
    shortPresent,
  };
};

const describeStates = (switchIds, rows) =>
  rows.map((r) => ({
    positions: Object.fromEntries(switchIds.map((id, i) => [id, r.stateVector[i]])),
    lightOn: r.anyLoadEnergized,
    breakerTrips: r.shortCircuit,
  }));

// ─── Scenarios ───────────────────────────────────────────────────────────────

/**
 * A scenario is: a lesson + a fault + the diagnosis options.
 * `correctChoice` names the fault the user must identify. The SYMPTOM is derived,
 * never written, so it cannot drift out of sync with the circuit.
 */
const scenario = (def) => ({
  ...def,
  disclaimer: TRAINING_DISCLAIMER,
  safetyNote:
    'Diagnose from the symptom and the circuit. In the field, de-energize and ' +
    'verify absence of voltage before opening a device or making a connection.',
});

export const SCENARIOS = [
  scenario({
    id: 'ts-3way-common-reversed',
    title: 'Only one switch works',
    lessonId: 'three-way-source-at-switch',
    difficulty: 'Journeyman',
    customerReport:
      'The hallway light only comes on if both switches are sitting just right. As soon as I flip ' +
      'either one it goes off, and then the other switch will not bring it back.',
    fault: {
      kind: FaultKind.SWAPPED,
      terminals: [T('sw2', 'com'), T('sw2', 't1')],
      description: 'Common and a traveler are reversed at the second three-way.',
    },
    choices: [
      'A traveler is open between the switches',
      'Common and traveler are reversed at one switch',
      'The neutral is not landed at the light',
      'The line is landed on a traveler at the first switch',
    ],
    correctChoice: 1,
    explanation:
      'When the common and a traveler are swapped at a three-way, the switch can no longer steer ' +
      'the circuit between both travelers. The load ends up controlled from one location only. ' +
      'The tell is that one switch works normally and the other has no effect in any position.',
    whatToInspect: [
      'Identify the common terminal — it is the odd-coloured screw, usually dark or black',
      'Confirm the conductor on the common is the line at one switch and the switched leg at the other',
      'Confirm both travelers land on traveler terminals at both switches',
    ],
    commonMistake: 'Assuming the red conductor is always a traveler. Identify by terminal and function, not colour.',
  }),

  scenario({
    id: 'ts-3way-open-traveler',
    title: 'Works in some positions only',
    lessonId: 'three-way-source-at-switch',
    difficulty: 'Journeyman',
    customerReport:
      'The light works sometimes. There is one combination where it comes on, but from then on ' +
      'neither switch does anything until I put them both back.',
    fault: {
      kind: FaultKind.OPEN_CONDUCTOR,
      target: { role: ConductorRole.TRAVELER_B },
      description: 'One traveler is open between the switches.',
    },
    choices: [
      'One traveler is open between the switches',
      'The equipment ground is missing',
      'The neutral is switched instead of the hot',
      'Both commons are fed from the line',
    ],
    correctChoice: 0,
    explanation:
      'With only one traveler intact, the pair can only complete the circuit through a single path. ' +
      'Half the switch combinations lose continuity, so the light appears intermittent and dependent ' +
      'on where the other switch is left.',
    whatToInspect: [
      'Ring out both travelers end to end with the circuit de-energized',
      'Check for a loose or backed-out traveler screw at both switches',
      'Check splices in any box the travelers pass through',
    ],
    commonMistake: 'Replacing a switch before proving the travelers are continuous.',
  }),

  scenario({
    id: 'ts-single-pole-open-switched-leg',
    title: 'Light never comes on',
    lessonId: 'single-pole-source-at-switch',
    difficulty: 'Apprentice',
    customerReport: 'I replaced the switch and now the light will not come on at all.',
    fault: {
      kind: FaultKind.OPEN_CONDUCTOR,
      target: { role: ConductorRole.SWITCHED_HOT },
      description: 'The switched leg from the switch to the luminaire is open.',
    },
    choices: [
      'The switched leg is not connected between the switch and the light',
      'The line is not landed on the switch',
      'The equipment ground is missing at the switch',
      'The neutral is landed on the switch',
    ],
    correctChoice: 0,
    explanation:
      'The supply still reaches the switch, but nothing leaves it toward the luminaire, so the ' +
      'load never sees an ungrounded conductor. The light is dead in both switch positions.',
    whatToInspect: [
      'Confirm a conductor leaves the second switch screw toward the luminaire',
      'Check the luminaire hot termination',
      'Check splices in the switch box',
    ],
    commonMistake: 'Assuming a dead light means a dead circuit. Prove the switched leg first.',
  }),

  scenario({
    id: 'ts-single-pole-no-neutral',
    title: 'Nothing works after a fixture swap',
    lessonId: 'single-pole-source-at-switch',
    difficulty: 'Apprentice',
    customerReport: 'New fixture is installed, breaker is on, switch clicks, but no light.',
    fault: {
      kind: FaultKind.OPEN_CONDUCTOR,
      target: { role: ConductorRole.NEUTRAL },
      description: 'The grounded conductor is not landed at the luminaire.',
    },
    choices: [
      'The grounded conductor is not connected to the luminaire',
      'The switch is wired backwards',
      'A traveler is open',
      'The breaker is undersized',
    ],
    correctChoice: 0,
    explanation:
      'Without a return path through the grounded conductor the load cannot carry current, no matter ' +
      'what the switch does. The circuit looks live at the fixture but nothing operates.',
    whatToInspect: [
      'Confirm the grounded conductor is landed at the luminaire and spliced back to the supply',
      'Check the splice in the fixture box',
      'Confirm the grounded conductor was not accidentally landed on the equipment ground',
    ],
    commonMistake: 'Chasing the hot side when the return path is the problem.',
  }),

  scenario({
    id: 'ts-4way-split-travelers',
    title: 'Works from two of three locations',
    lessonId: 'four-way-three-location',
    difficulty: 'Journeyman',
    customerReport:
      'The switch at the far end of the hall works the light fine. The one at the top of the stairs ' +
      'and the one in the middle both do nothing on their own.',
    fault: {
      kind: FaultKind.MISLANDED,
      target: { between: [T('sw1', 't2'), T('sw4', 'in2')] },
      end: 'to',
      to: T('sw2', 't2'),
      description: 'One traveler bypasses the four-way entirely, splitting the pair.',
    },
    choices: [
      'One traveler bypasses the four-way, so the pair is split',
      'The four-way switch is faulty and needs replacing',
      'The neutral is missing at the light',
      'The commons are reversed at both end switches',
    ],
    correctChoice: 0,
    explanation:
      'A four-way only works when BOTH conductors of the traveler pair pass through it. If one runs ' +
      'straight from the first three-way to the second, the four-way has nothing to swap and its ' +
      'position stops mattering. The end switches still work because their traveler pair is intact.',
    whatToInspect: [
      'Confirm both travelers from the first three-way land on the four-way inputs',
      'Confirm both four-way outputs continue to the second three-way',
      'Never split a traveler pair around a four-way',
    ],
    commonMistake: 'Replacing the four-way switch. The device is usually fine — the pair is split.',
  }),

  scenario({
    id: 'ts-short-line-neutral',
    title: 'Breaker trips instantly',
    lessonId: 'single-pole-source-at-switch',
    difficulty: 'Apprentice',
    customerReport: 'As soon as I turn the breaker on it trips. It will not stay on.',
    fault: {
      kind: FaultKind.SHORT,
      from: T('src', 'hot'),
      to: T('nBox', 'p3'),
      description: 'The ungrounded conductor contacts the grounded conductor splice.',
    },
    choices: [
      'The ungrounded and grounded conductors are in contact, bypassing the load',
      'The light bulb is burned out',
      'The switch is wired to the neutral',
      'The equipment ground is missing',
    ],
    correctChoice: 0,
    explanation:
      'A path from the ungrounded conductor to the grounded conductor that does not pass through a ' +
      'load is a short. Current is limited only by the conductors, so the overcurrent device operates ' +
      'immediately. That is the breaker doing exactly its job.',
    whatToInspect: [
      'De-energize and confirm absence of voltage before opening anything',
      'Inspect splices for a stray strand bridging conductors',
      'Check for a conductor pinched against a box or damaged by a screw',
    ],
    commonMistake: 'Resetting the breaker repeatedly instead of finding the fault.',
  }),
];

// ─── Building and playing a scenario ─────────────────────────────────────────

/**
 * Materialise a scenario: correct circuit → fault applied → derived symptom.
 * @returns {{scenario, lesson, faultedCircuit, healthyCircuit, symptom}}
 */
export const buildScenario = (scenarioId) => {
  const s = SCENARIOS.find((x) => x.id === scenarioId);
  if (!s) return null;

  const lesson = lessonById(s.lessonId);
  if (!lesson) return null;

  const healthy = solutionCircuit(lesson);
  const faultedCircuit = {
    components: lesson.components(),
    conductors: injectFault(healthy.conductors, s.fault),
  };

  return {
    scenario: s,
    lesson,
    healthyCircuit: healthy,
    faultedCircuit,
    symptom: deriveSymptom(faultedCircuit),
  };
};

export const scenarioIds = () => SCENARIOS.map((s) => s.id);

/**
 * Grade an answer. Wrong answers get the category of mistake, not the answer —
 * same principle as the wiring lessons (SUX-05).
 */
export const answerScenario = (scenarioId, choiceIndex) => {
  const s = SCENARIOS.find((x) => x.id === scenarioId);
  if (!s) return { ok: false, error: 'Unknown scenario' };

  const correct = choiceIndex === s.correctChoice;
  return {
    ok: true,
    correct,
    correctChoice: s.correctChoice,
    explanation: correct ? s.explanation : null,
    // Revealed only once they have it right, so the explanation is a reward
    // rather than a spoiler.
    hint: correct ? null : 'Look at which switch positions work and which do not. The pattern names the fault.',
    whatToInspect: correct ? s.whatToInspect : null,
    commonMistake: correct ? s.commonMistake : null,
  };
};

/** Scenarios grouped by the lesson they build on, for a catalog screen. */
export const scenariosByLesson = () => {
  const map = new Map();
  for (const s of SCENARIOS) {
    if (!map.has(s.lessonId)) map.set(s.lessonId, []);
    map.get(s.lessonId).push({ id: s.id, title: s.title, difficulty: s.difficulty });
  }
  return [...map.entries()].map(([lessonId, scenarios]) => ({ lessonId, scenarios }));
};
