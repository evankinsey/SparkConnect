// ─── PROGRESSIVE REVEAL ──────────────────────────────────────────────────────
// Troubleshooting as an investigation instead of a quiz.
//
// The complaint about the current screen is fair: it hands you the symptom, the
// meter readings and four answers all at once. That is a reading-comprehension
// exercise. Nobody walks into a house holding a printout of the readings.
//
// A real call goes: somebody tells you what they think is happening, you go and
// operate it yourself, you take readings, you kill the power and check
// continuity, and only then do you pull a device out of the wall. Each step
// costs time and each one rules something out.
//
// WHAT MAKES THIS MORE THAN A DISCLOSURE ANIMATION: the engine already knows
// WHICH step separates any two faults — that is exactly what `contrast()`
// returns as `WhyBasis`. So the candidate set can be computed honestly at every
// stage, and the app can say the thing a quiz can never say:
//
//     "You got it right, but four faults still matched what you knew.
//      You guessed. Here is what would have ruled them out."
//
// A right answer for no reason is the most expensive habit in this trade, and
// it is invisible to any scoring system that only checks the final choice.
//
// THE SAFETY GATE IS NOT DECORATION. Continuity on an energized circuit is
// refused, with the reason, because the ordering — kill it, prove it dead, then
// test — is the actual lesson. A trainer that lets you ring out a live circuit
// has taught the wrong reflex whatever the score says.
//
// Pure module: no React, no storage, no randomness. State in, state out.

import { WhyBasis } from './scenarioEngine.js';

export const Stage = Object.freeze({
  COMPLAINT: 'COMPLAINT',       // what the customer says is wrong
  OPERATE: 'OPERATE',           // walk in and work it yourself
  METER: 'METER',               // voltage readings, energized
  CONTINUITY: 'CONTINUITY',     // de-energized, ring it out
  OPEN: 'OPEN',                 // pull the devices and look
});

export const STAGE_ORDER = Object.freeze([
  Stage.COMPLAINT, Stage.OPERATE, Stage.METER, Stage.CONTINUITY, Stage.OPEN,
]);

/**
 * What each step is, what it costs, and — the important column — what it can
 * actually rule out.
 *
 * `eliminates` is the set of WhyBasis values this step resolves. It is the only
 * thing in the module that decides the candidate set, so a step cannot claim
 * discrimination it does not have.
 */
export const STEPS = Object.freeze({
  [Stage.COMPLAINT]: {
    stage: Stage.COMPLAINT,
    label: 'The call',
    action: 'Read the complaint',
    detail: 'What the customer told the office. Their words, not a diagnosis.',
    // A complaint rules out nothing. People describe intermittent as dead, one
    // room as the whole house, and a tripped AFCI as a blown bulb.
    eliminates: Object.freeze([]),
    minutes: 0,
    requiresDeEnergized: false,
    requiresEnergized: false,
  },
  [Stage.OPERATE]: {
    stage: Stage.OPERATE,
    label: 'Walk in and try it',
    action: 'Operate every switch',
    detail: 'Work the circuit yourself in every switch position and watch what it does.',
    // Free and it eliminates more than anything else. Reaching for a meter
    // before flipping the switch is the most common wasted half hour on a
    // service call.
    eliminates: Object.freeze([WhyBasis.SYMPTOM, WhyBasis.BEHAVIOUR]),
    minutes: 5,
    requiresDeEnergized: false,
    requiresEnergized: true,
  },
  [Stage.METER]: {
    stage: Stage.METER,
    label: 'Take readings',
    action: 'Meter it',
    detail: 'Voltage at the device and at the box, in each switch position.',
    eliminates: Object.freeze([WhyBasis.METER]),
    minutes: 15,
    requiresDeEnergized: false,
    requiresEnergized: true,
  },
  [Stage.CONTINUITY]: {
    stage: Stage.CONTINUITY,
    label: 'Kill it and ring it out',
    action: 'Check continuity',
    detail: 'De-energize, verify absence of voltage, then check the conductors end to end.',
    // Honest: on these circuits continuity CONFIRMS what the voltage readings
    // already implied rather than separating anything new. Claiming otherwise
    // would be inventing a discrimination the solver cannot back.
    eliminates: Object.freeze([]),
    confirms: true,
    minutes: 20,
    requiresDeEnergized: true,
    requiresEnergized: false,
  },
  [Stage.OPEN]: {
    stage: Stage.OPEN,
    label: 'Open it up',
    action: 'Pull the devices',
    detail: 'Take the devices out and look at where every conductor actually lands.',
    // This ends the investigation: you are now looking at the answer. Anything
    // still on the table was, by definition, indistinguishable without it.
    eliminates: Object.freeze([WhyBasis.NONE]),
    terminal: true,
    minutes: 30,
    requiresDeEnergized: true,
    requiresEnergized: false,
  },
});

export const stepFor = (stage) => STEPS[stage] ?? null;

/**
 * Start an investigation.
 *
 * The complaint is free and already revealed — a call always starts with
 * somebody telling you something. Everything else is earned.
 */
export const beginInvestigation = (scenario) => {
  if (!scenario) return null;
  return Object.freeze({
    scenarioId: scenario.id,
    revealed: Object.freeze([Stage.COMPLAINT]),
    // The circuit is live when you arrive, because that is how you find them.
    energized: true,
    // Every refused action, kept: trying to ring out a live circuit is worth
    // showing back at the end, not silently swallowing.
    refusals: Object.freeze([]),
    minutesSpent: 0,
  });
};

const has = (state, stage) => (state?.revealed ?? []).includes(stage);

/**
 * Change the power state.
 *
 * Modelled explicitly rather than being implied by the step, because "I killed
 * the power" has to be a thing the user DID. A trainer that de-energizes for
 * you the instant you tap Continuity has skipped the only part of that sequence
 * that matters.
 */
export const setEnergized = (state, energized) => {
  if (!state) return state;
  return Object.freeze({ ...state, energized: !!energized });
};

/**
 * Can this step be taken right now?
 *
 * Returns `{ ok }` or `{ ok: false, reason, fix }`. The reason is written to be
 * shown — a greyed-out button with no explanation teaches nothing.
 */
export const canReveal = (state, stage) => {
  const step = stepFor(stage);
  if (!state || !step) return { ok: false, reason: 'Unknown step.', fix: null };
  if (has(state, stage)) return { ok: false, reason: 'Already done.', fix: null };

  const i = STAGE_ORDER.indexOf(stage);
  const prev = STAGE_ORDER[i - 1];
  // Steps are ordered because the order IS the method. You do not pull a device
  // before you have flipped the switch.
  if (prev && !has(state, prev)) {
    return {
      ok: false,
      reason: `${STEPS[prev].label} comes first.`,
      fix: STEPS[prev].action,
    };
  }

  if (step.requiresDeEnergized && state.energized) {
    return {
      ok: false,
      // The whole point of the gate.
      reason: 'The circuit is still energized. Continuity testing puts your meter across a '
        + 'live conductor, and opening a device live is how people get hurt.',
      fix: 'De-energize, lock it out, and verify absence of voltage first.',
      safety: true,
    };
  }

  if (step.requiresEnergized && !state.energized) {
    return {
      ok: false,
      reason: 'The circuit is dead. There is nothing to see or measure with the power off.',
      fix: 'Re-energize before operating or metering it.',
      safety: false,
    };
  }

  return { ok: true, reason: null, fix: null };
};

/**
 * Take a step.
 *
 * A refused step is RECORDED rather than discarded. Reaching for continuity on
 * a live circuit is the mistake this whole sequence exists to train out, and it
 * only teaches anything if it comes back at the end.
 */
export const reveal = (state, stage) => {
  const check = canReveal(state, stage);
  if (!check.ok) {
    if (!check.safety) return Object.freeze({ ...state });
    return Object.freeze({
      ...state,
      refusals: Object.freeze([
        ...state.refusals,
        Object.freeze({ stage, reason: check.reason, fix: check.fix }),
      ]),
    });
  }
  return Object.freeze({
    ...state,
    revealed: Object.freeze([...state.revealed, stage]),
    minutesSpent: state.minutesSpent + STEPS[stage].minutes,
  });
};

/** Everything resolved so far, as a set of WhyBasis values. */
const resolvedBases = (state) => {
  const out = new Set();
  for (const stage of state?.revealed ?? []) {
    for (const b of STEPS[stage]?.eliminates ?? []) out.add(b);
  }
  return out;
};

/**
 * Which answers are still on the table.
 *
 * THE HONEST NUMBER. A distractor is only ruled out once the user has actually
 * taken the step that separates it — not because the scenario knows the answer.
 * Everything here comes from the basis the engine computed when it built the
 * scenario, so no step can claim to have narrowed something it did not.
 */
export const candidates = (scenario, state) => {
  if (!scenario || !state) return Object.freeze([]);
  const done = resolvedBases(state);

  const rows = scenario.choices.map((c, index) => {
    // The correct answer is never eliminated: nothing rules out what is true.
    const basis = c.correct ? null : (c.basis ?? WhyBasis.NONE);
    const ruledOut = !c.correct && done.has(basis);
    return Object.freeze({
      index,
      text: c.text,
      correct: c.correct === true,
      ruledOut,
      // Only meaningful once it IS ruled out — before that, saying which step
      // will eliminate it is handing over the answer.
      ruledOutBy: ruledOut ? stageThatEliminates(basis) : null,
      why: ruledOut ? c.why : null,
    });
  });

  return Object.freeze(rows);
};

const stageThatEliminates = (basis) =>
  STAGE_ORDER.find((s) => (STEPS[s].eliminates ?? []).includes(basis)) ?? null;

/** How many answers a person could still not tell apart, right now. */
export const remainingCount = (scenario, state) =>
  candidates(scenario, state).filter((c) => !c.ruledOut).length;

/**
 * The state of the investigation, for a screen.
 *
 * `readings` and `symptomDetail` are withheld until the step that would have
 * produced them. This is the part that makes it an investigation: the meter
 * readings do not exist until somebody meters it.
 */
export const view = (scenario, state) => {
  if (!scenario || !state) return null;
  const remaining = remainingCount(scenario, state);
  const opened = has(state, Stage.OPEN);

  return Object.freeze({
    // Always available. It is why the phone rang.
    complaint: scenario.customerReport,

    // Earned.
    symptom: has(state, Stage.OPERATE) ? scenario.symptom : null,
    symptomDetail: has(state, Stage.OPERATE) ? scenario.symptomDetail : null,
    readings: has(state, Stage.METER) ? scenario.readings : null,
    // The wiring is the answer. Showing it is ending the exercise, not helping.
    circuit: opened ? scenario.faultedCircuit : null,

    revealed: Object.freeze([...state.revealed]),
    energized: state.energized,
    minutesSpent: state.minutesSpent,

    steps: Object.freeze(STAGE_ORDER.map((stage) => {
      const check = canReveal(state, stage);
      return Object.freeze({
        ...STEPS[stage],
        done: has(state, stage),
        enabled: check.ok,
        blockedReason: check.ok ? null : check.reason,
        blockedFix: check.ok ? null : check.fix,
      });
    })),

    remaining,
    // Say it plainly rather than making somebody count the greyed-out rows.
    narrowedTo: remaining === 1
      ? 'One answer left. The readings point at exactly one thing.'
      : `${remaining} answers still fit what you know.`,
    // Guessing is allowed; being told it was a guess is the feature.
    canDeduce: remaining === 1,
    refusals: state.refusals,
    safetyNote: scenario.safetyNote,
    disclaimer: scenario.disclaimer,
  });
};

/**
 * Grade an answer IN CONTEXT of what the person had actually established.
 *
 * A quiz reports right or wrong. This reports whether the answer was earned,
 * which is a different and more useful fact:
 *
 *   deduced       right, and nothing else fitted   — the real result
 *   lucky         right, but N others also fitted  — worth saying out loud
 *   read off      right, after opening it up       — that is not diagnosis
 *   wrong         with the step that would have shown it
 *
 * `whatWouldHaveRuledItOut` is the coaching, and it is derived: the basis on
 * the choice already says which step separates it.
 */
export const gradeInvestigation = (scenario, state, choiceIndex) => {
  if (!scenario || !state) return null;
  const rows = candidates(scenario, state);
  const choice = rows[choiceIndex];
  if (!choice) return null;

  const remaining = rows.filter((c) => !c.ruledOut).length;
  const openedIt = has(state, Stage.OPEN);
  const correct = choice.correct;

  const outcome = !correct ? 'WRONG'
    : openedIt ? 'READ_OFF'
      : remaining === 1 ? 'DEDUCED' : 'LUCKY';

  const nextStep = STAGE_ORDER.find((s) => !has(state, s)) ?? null;

  return Object.freeze({
    correct,
    outcome,
    remainingWhenAnswered: remaining,
    minutesSpent: state.minutesSpent,
    stepsTaken: state.revealed.length,

    verdict: {
      DEDUCED: 'Called it. Nothing else fitted what you had.',
      LUCKY: `Right answer — but ${remaining} faults still fitted what you knew, so this `
        + 'one was a coin toss. On a real call that is the day you replace the wrong device.',
      READ_OFF: 'Right, but you opened it up first. That is reading the answer, not finding it.',
      WRONG: choice.ruledOut
        ? 'You had already ruled that out.'
        : 'Not this one.',
    }[outcome],

    // For a wrong answer, what separates it — already computed by the engine.
    whyThisIsWrong: correct ? null : (scenario.choices[choiceIndex]?.why ?? null),
    // For a lucky one, the step that would have made it a deduction.
    whatWouldHaveRuledItOut: outcome === 'LUCKY' && nextStep ? STEPS[nextStep].action : null,

    explanation: scenario.explanation,
    correctIndex: scenario.correctIndex,
    cannotBeRuledOut: scenario.cannotBeRuledOut,

    // Reaching for a meter on a de-energized circuit is a wasted trip. Reaching
    // for continuity on a live one is a hospital visit. Only the second is
    // reported back, and it outranks the score.
    safetyLapses: state.refusals,
    clean: state.refusals.length === 0,
  });
};

export { WhyBasis };
