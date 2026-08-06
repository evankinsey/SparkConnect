// ─── LESSON CATALOG ──────────────────────────────────────────────────────────
// Requirements: LSN-01…LSN-04, SIM-05, SIM-17, SIM-18, REV-06, REV-08, REV-10
//
// Every lesson here is seeded NEEDS_ELECTRICAL_REVIEW / productionApproved:false.
// `productionLessons()` therefore returns an EMPTY array until a qualified human
// reviews each one (docs/v1.1/DECISIONS.md D-06). That is intentional, not a bug.

import {
  source, singlePoleSwitch, threeWaySwitch, fourWaySwitch, luminaire, splice,
  conductor, terminalId, ConductorRole,
} from '../model.js';
import { seedReview, visibleLessons, TRAINING_DISCLAIMER, approvalMatchesContent } from '../review.js';
import { APPROVALS } from './approvals.js';

const T = terminalId;

// Shared safety language. LSN-10 and LSN-08 add their own on top.
const BASE_SAFETY = [
  TRAINING_DISCLAIMER,
  'De-energize the circuit and verify absence of voltage before working on it.',
  'Conductor colour conventions vary. Identify conductors by function and testing, not colour alone.',
];

/**
 * Build a lesson. `solution` is a function returning the conductor list for one
 * known-good wiring, used by the truth-table tests (REV-01, REV-02).
 * `expectations` feeds the validator.
 */
const lesson = (def) => {
  const version = def.lessonVersion ?? 1;
  const base = {
    ...def,
    ...seedReview({ lessonVersion: version, referenceNotes: def.referenceNotes ?? [] }),
    safetyNotes: [...BASE_SAFETY, ...(def.safetyNotes ?? [])],
    // SIM-18 — one flag per simulation, resolved against src/featureFlags.js
    featureFlag: def.featureFlag,
  };

  // Merge a recorded review, written by `npm run lessons:approve`.
  //
  // An approval is for the lesson as it was reviewed. Two independent checks
  // have to agree before one is honoured:
  //
  //   lessonVersion  — the deliberate signal, bumped by a person.
  //   fingerprint    — the automatic one, computed from the content itself.
  //
  // The version check alone was not enough, because bumping it was a manual
  // step that an edit could simply skip. Rewording a hint or relabelling a
  // terminal left the old sign-off in place, still claiming to cover text
  // nobody had read. The fingerprint closes that: change what a learner sees
  // and the approval stops matching on its own.
  const record = APPROVALS[def.id];
  if (!record || record.lessonVersion !== version) return base;
  if (!approvalMatchesContent(base, record)) return base;

  return {
    ...base,
    technicalReviewStatus: record.technicalReviewStatus,
    technicalReviewer: record.technicalReviewer,
    reviewDate: record.reviewDate,
    reviewerNotes: record.reviewerNotes ?? '',
    productionApproved: record.productionApproved === true,
  };
};

// ─── LSN-01a — Single-pole, source at switch ─────────────────────────────────
const singlePoleSourceAtSwitch = lesson({
  id: 'single-pole-source-at-switch',
  title: 'Single-Pole Switch — Source at Switch',
  difficulty: 'Apprentice',
  description: 'The branch circuit lands in the switch box. Identify the ungrounded conductor, the switched leg, the grounded conductor, and the equipment ground.',
  learningObjectives: [
    'Recognise which conductor is the ungrounded (line) conductor',
    'Route the switched leg from the switch to the luminaire',
    'Run the grounded conductor through to the luminaire without switching it',
    'Bond equipment grounding conductors throughout',
  ],
  featureFlag: 'wiringSimulationsEnabled',
  allowedWireTypes: [
    ConductorRole.LINE, ConductorRole.SWITCHED_HOT, ConductorRole.NEUTRAL, ConductorRole.EQUIPMENT_GROUND,
  ],
  components: () => [
    source('src'),
    singlePoleSwitch('sw1'),
    luminaire('lamp'),
    splice('nBox', 'Neutral splice', 3),
    splice('gBox', 'Ground splice', 4),
  ],
  expectations: { everySwitchControlsLoad: true, requireGrounding: true, requireNeutralAtLoad: true },
  solution: () => [
    conductor(T('src', 'hot'), T('sw1', 'a'), ConductorRole.LINE),
    conductor(T('sw1', 'b'), T('lamp', 'hot'), ConductorRole.SWITCHED_HOT),
    conductor(T('src', 'neutral'), T('nBox', 'p1'), ConductorRole.NEUTRAL),
    conductor(T('nBox', 'p2'), T('lamp', 'neu'), ConductorRole.NEUTRAL),
    conductor(T('src', 'ground'), T('gBox', 'p1'), ConductorRole.EQUIPMENT_GROUND),
    conductor(T('gBox', 'p2'), T('sw1', 'gnd'), ConductorRole.EQUIPMENT_GROUND),
    conductor(T('gBox', 'p3'), T('lamp', 'gnd'), ConductorRole.EQUIPMENT_GROUND),
  ],
  hintSteps: [
    { level: 1, text: 'A single-pole switch interrupts one conductor only. Which conductor is it allowed to interrupt?' },
    { level: 2, text: 'Look at the switch box. The supply arrives there, and something has to leave it toward the luminaire.' },
    { level: 3, text: 'The grounded conductor is not switched — it needs a continuous path from the supply to the luminaire.' },
    { level: 4, text: 'Land the ungrounded conductor on either brass screw and run the switched leg from the other one to the luminaire.' },
    { level: 5, text: 'Supply hot → either brass screw. The other brass screw → luminaire hot. Supply neutral → splice → luminaire neutral, never through the switch. All grounds bonded together.' },
  ],
  referenceNotes: [
    { label: 'Switching the ungrounded conductor', ref: 'NEC 404.2(B)', verified: true },
    { label: 'Grounded conductor at switch locations', ref: 'NEC 404.2(C)', verified: true },
  ],
});

// ─── LSN-01b — Single-pole, source at light ──────────────────────────────────
const singlePoleSourceAtLight = lesson({
  id: 'single-pole-source-at-light',
  title: 'Single-Pole Switch — Source at Light',
  difficulty: 'Apprentice',
  description: 'The branch circuit lands at the luminaire. A two-conductor cable runs down to the switch and back.',
  learningObjectives: [
    'Recognise the switch loop topology',
    'Understand why the conductor returning from the switch is the switched leg',
    'Keep the grounded conductor at the luminaire, not at the switch',
  ],
  featureFlag: 'wiringSimulationsEnabled',
  allowedWireTypes: [
    ConductorRole.LINE, ConductorRole.SWITCHED_HOT, ConductorRole.NEUTRAL, ConductorRole.EQUIPMENT_GROUND,
  ],
  components: () => [source('src'), singlePoleSwitch('sw1'), luminaire('lamp'), splice('gBox', 'Ground splice', 4)],
  expectations: { everySwitchControlsLoad: true, requireGrounding: true, requireNeutralAtLoad: true },
  solution: () => [
    conductor(T('src', 'hot'), T('sw1', 'a'), ConductorRole.LINE),
    conductor(T('sw1', 'b'), T('lamp', 'hot'), ConductorRole.SWITCHED_HOT),
    conductor(T('src', 'neutral'), T('lamp', 'neu'), ConductorRole.NEUTRAL),
    conductor(T('src', 'ground'), T('gBox', 'p1'), ConductorRole.EQUIPMENT_GROUND),
    conductor(T('gBox', 'p2'), T('sw1', 'gnd'), ConductorRole.EQUIPMENT_GROUND),
    conductor(T('gBox', 'p3'), T('lamp', 'gnd'), ConductorRole.EQUIPMENT_GROUND),
  ],
  hintSteps: [
    { level: 1, text: 'The supply is at the luminaire this time. Only two circuit conductors run down to the switch.' },
    { level: 2, text: 'One conductor carries power down to the switch. What does the other one carry back?' },
    { level: 3, text: 'The grounded conductor stays at the luminaire — it does not need to reach the switch to make the lamp work.' },
    { level: 4, text: 'Send the ungrounded conductor to either brass screw; bring the switched leg back from the other one to the luminaire hot.' },
    { level: 5, text: 'Supply hot → either brass screw. The other brass screw carries the switched leg back to the luminaire hot. Supply neutral → luminaire neutral directly. Grounds bonded.' },
  ],
  referenceNotes: [
    { label: 'Grounded conductor required at most switch locations', ref: 'NEC 404.2(C)', verified: true },
    { label: 'Re-identification of conductors in a switch loop — verify against adopted edition', ref: null, verified: false },
  ],
});

// ─── LSN-02 — Three-way, source at first switch ──────────────────────────────
const threeWaySourceAtSwitch = lesson({
  id: 'three-way-source-at-switch',
  title: 'Three-Way Switches — Source at First Switch',
  difficulty: 'Journeyman',
  description: 'Line enters the first three-way. Travelers run between the two switches. The opposite common feeds the luminaire.',
  learningObjectives: [
    'Identify the common terminal on a three-way switch',
    'Run both travelers between corresponding traveler terminals',
    'Feed the load from the second switch common',
    'Confirm the load toggles from both locations',
  ],
  featureFlag: 'wiringSimulationsEnabled',
  allowedWireTypes: [
    ConductorRole.LINE, ConductorRole.TRAVELER_A, ConductorRole.TRAVELER_B,
    ConductorRole.SWITCHED_HOT, ConductorRole.NEUTRAL, ConductorRole.EQUIPMENT_GROUND,
  ],
  components: () => [
    source('src'), threeWaySwitch('sw1', 'Three-Way A'), threeWaySwitch('sw2', 'Three-Way B'),
    luminaire('lamp'), splice('nBox', 'Neutral splice', 3), splice('gBox', 'Ground splice', 4),
  ],
  expectations: { everySwitchControlsLoad: true, requireGrounding: true, requireNeutralAtLoad: true },
  solution: () => [
    conductor(T('src', 'hot'), T('sw1', 'com'), ConductorRole.LINE),
    conductor(T('sw1', 't1'), T('sw2', 't1'), ConductorRole.TRAVELER_A),
    conductor(T('sw1', 't2'), T('sw2', 't2'), ConductorRole.TRAVELER_B),
    conductor(T('sw2', 'com'), T('lamp', 'hot'), ConductorRole.SWITCHED_HOT),
    conductor(T('src', 'neutral'), T('nBox', 'p1'), ConductorRole.NEUTRAL),
    conductor(T('nBox', 'p2'), T('lamp', 'neu'), ConductorRole.NEUTRAL),
    conductor(T('src', 'ground'), T('gBox', 'p1'), ConductorRole.EQUIPMENT_GROUND),
    conductor(T('gBox', 'p2'), T('sw1', 'gnd'), ConductorRole.EQUIPMENT_GROUND),
    conductor(T('gBox', 'p3'), T('sw2', 'gnd'), ConductorRole.EQUIPMENT_GROUND),
    conductor(T('gBox', 'p4'), T('lamp', 'gnd'), ConductorRole.EQUIPMENT_GROUND),
  ],
  hintSteps: [
    { level: 1, text: 'A three-way switch has no on or off. It always connects its common to one of two travelers.' },
    { level: 2, text: 'The supply arrives at the first switch. Which single terminal on that switch should it land on?' },
    { level: 3, text: 'The common is the odd-coloured screw. Travelers must land on traveler terminals at BOTH switches.' },
    { level: 4, text: 'Line → first common. Travelers between the two switches. Second common → luminaire.' },
    { level: 5, text: 'Supply hot → sw1 common. sw1 t1 → sw2 t1, sw1 t2 → sw2 t2. sw2 common → lamp hot. Neutral straight to the lamp. Grounds bonded.' },
  ],
  referenceNotes: [
    { label: 'Three-way switch definition', ref: 'NEC Article 100 (three-way switch)', verified: false },
    { label: 'Switching the ungrounded conductor', ref: 'NEC 404.2(B)', verified: true },
  ],
});

// ─── LSN-03 — Three-way, source at light ─────────────────────────────────────
const threeWaySourceAtLight = lesson({
  id: 'three-way-source-at-light',
  title: 'Three-Way Switches — Source at Light',
  difficulty: 'Journeyman',
  description: 'The supply lands at the luminaire. Power runs out to the first three-way, travelers run between the switches, and the switched leg returns to the lamp.',
  learningObjectives: [
    'Recognise that the three-way topology is unchanged even when the feed moves',
    'Distinguish conductor function from conductor colour',
    'Confirm the load still toggles from both locations',
  ],
  featureFlag: 'wiringSimulationsEnabled',
  allowedWireTypes: [
    ConductorRole.LINE, ConductorRole.TRAVELER_A, ConductorRole.TRAVELER_B,
    ConductorRole.SWITCHED_HOT, ConductorRole.NEUTRAL, ConductorRole.EQUIPMENT_GROUND,
  ],
  components: () => [
    source('src'), threeWaySwitch('sw1', 'Three-Way A'), threeWaySwitch('sw2', 'Three-Way B'),
    luminaire('lamp'), splice('gBox', 'Ground splice', 4),
  ],
  expectations: { everySwitchControlsLoad: true, requireGrounding: true, requireNeutralAtLoad: true },
  solution: () => [
    conductor(T('src', 'hot'), T('sw1', 'com'), ConductorRole.LINE),
    conductor(T('sw1', 't1'), T('sw2', 't1'), ConductorRole.TRAVELER_A),
    conductor(T('sw1', 't2'), T('sw2', 't2'), ConductorRole.TRAVELER_B),
    conductor(T('sw2', 'com'), T('lamp', 'hot'), ConductorRole.SWITCHED_HOT),
    conductor(T('src', 'neutral'), T('lamp', 'neu'), ConductorRole.NEUTRAL),
    conductor(T('src', 'ground'), T('gBox', 'p1'), ConductorRole.EQUIPMENT_GROUND),
    conductor(T('gBox', 'p2'), T('sw1', 'gnd'), ConductorRole.EQUIPMENT_GROUND),
    conductor(T('gBox', 'p3'), T('sw2', 'gnd'), ConductorRole.EQUIPMENT_GROUND),
    conductor(T('gBox', 'p4'), T('lamp', 'gnd'), ConductorRole.EQUIPMENT_GROUND),
  ],
  hintSteps: [
    { level: 1, text: 'Moving the feed does not change how a three-way pair works. The commons still anchor each end.' },
    { level: 2, text: 'Power has to reach one common, and the other common has to return to the lamp.' },
    { level: 3, text: 'Do not assume a white conductor is a neutral here. Identify by function.' },
    { level: 4, text: 'Line out to the first common, travelers between switches, second common back to the lamp hot.' },
    { level: 5, text: 'Supply hot → sw1 common. Travelers t1→t1 and t2→t2. sw2 common → lamp hot. Supply neutral → lamp neutral. Grounds bonded.' },
  ],
  referenceNotes: [
    { label: 'Conductor re-identification in cable assemblies — verify against adopted edition and AHJ', ref: null, verified: false },
  ],
});

// ─── LSN-04 — Four-way ───────────────────────────────────────────────────────
const fourWayThreeLocation = lesson({
  id: 'four-way-three-location',
  title: 'Four-Way Switch — Three Locations',
  difficulty: 'Journeyman',
  description: 'Two three-way switches at the endpoints with a four-way between them. The load must be controllable from all three locations.',
  learningObjectives: [
    'Place the four-way switch in the traveler pair, never at an endpoint',
    'Keep traveler pairs together through the four-way',
    'Verify control from all three locations across all eight switch combinations',
  ],
  featureFlag: 'fourWaySimulationEnabled',
  allowedWireTypes: [
    ConductorRole.LINE, ConductorRole.TRAVELER_A, ConductorRole.TRAVELER_B,
    ConductorRole.SWITCHED_HOT, ConductorRole.NEUTRAL, ConductorRole.EQUIPMENT_GROUND,
  ],
  components: () => [
    source('src'), threeWaySwitch('sw1', 'Three-Way A'), fourWaySwitch('sw4', 'Four-Way'),
    threeWaySwitch('sw2', 'Three-Way B'), luminaire('lamp'),
    splice('nBox', 'Neutral splice', 3), splice('gBox', 'Ground splice', 5),
  ],
  expectations: { everySwitchControlsLoad: true, requireGrounding: true, requireNeutralAtLoad: true },
  solution: () => [
    conductor(T('src', 'hot'), T('sw1', 'com'), ConductorRole.LINE),
    conductor(T('sw1', 't1'), T('sw4', 'in1'), ConductorRole.TRAVELER_A),
    conductor(T('sw1', 't2'), T('sw4', 'in2'), ConductorRole.TRAVELER_B),
    conductor(T('sw4', 'out1'), T('sw2', 't1'), ConductorRole.TRAVELER_A),
    conductor(T('sw4', 'out2'), T('sw2', 't2'), ConductorRole.TRAVELER_B),
    conductor(T('sw2', 'com'), T('lamp', 'hot'), ConductorRole.SWITCHED_HOT),
    conductor(T('src', 'neutral'), T('nBox', 'p1'), ConductorRole.NEUTRAL),
    conductor(T('nBox', 'p2'), T('lamp', 'neu'), ConductorRole.NEUTRAL),
    conductor(T('src', 'ground'), T('gBox', 'p1'), ConductorRole.EQUIPMENT_GROUND),
    conductor(T('gBox', 'p2'), T('sw1', 'gnd'), ConductorRole.EQUIPMENT_GROUND),
    conductor(T('gBox', 'p3'), T('sw4', 'gnd'), ConductorRole.EQUIPMENT_GROUND),
    conductor(T('gBox', 'p4'), T('sw2', 'gnd'), ConductorRole.EQUIPMENT_GROUND),
    conductor(T('gBox', 'p5'), T('lamp', 'gnd'), ConductorRole.EQUIPMENT_GROUND),
  ],
  hintSteps: [
    { level: 1, text: 'A four-way switch does not have a common. It sits between the two three-ways.' },
    { level: 2, text: 'The four-way switch either passes both travelers straight through or swaps them.' },
    { level: 3, text: 'Travelers arriving from the first three-way land on the four-way inputs; its outputs continue to the second three-way.' },
    { level: 4, text: 'Do not split a traveler pair across the four-way. Both conductors of the pair must pass through it.' },
    { level: 5, text: 'sw1 t1/t2 → sw4 in1/in2. sw4 out1/out2 → sw2 t1/t2. Line → sw1 common, sw2 common → lamp.' },
  ],
  referenceNotes: [
    { label: 'Four-way switch definition', ref: 'NEC Article 100 (four-way switch)', verified: false },
  ],
});

export const ALL_LESSONS = [
  singlePoleSourceAtSwitch,
  singlePoleSourceAtLight,
  threeWaySourceAtSwitch,
  threeWaySourceAtLight,
  fourWayThreeLocation,
];

/** Materialise a lesson into a solvable circuit with a given conductor set. */
export const buildCircuit = (lesson, conductors) => ({
  components: lesson.components(),
  conductors: conductors ?? [],
});

/** The known-good wiring, for tests and for the level-5 hint reveal. */
export const solutionCircuit = (lesson) => buildCircuit(lesson, lesson.solution());

/**
 * REV-08 — what the production UI is allowed to render.
 * Returns [] today, by design (D-06).
 */
export const productionLessons = () => visibleLessons(ALL_LESSONS);

export const lessonById = (id) => ALL_LESSONS.find((l) => l.id === id) ?? null;
