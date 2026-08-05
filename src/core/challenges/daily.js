// ─── DAILY FIELD CHALLENGE ───────────────────────────────────────────────────
// One challenge a day, rotating format. The format variety is the point: a
// single question type stops being interesting in about a week, which is
// roughly when a habit would otherwise take hold.
//
// Selection is a pure function of the calendar date, so:
//   - every user sees the same challenge on the same day (it is discussable)
//   - it cannot change mid-day under someone's feet
//   - the app can render tomorrow's card offline

import { getQuestionForDate, dayNumber } from '../content/dailyQuestions.js';
import { SCENARIOS } from '../training/troubleshooting.js';

export const ChallengeFormat = {
  CODE_QUESTION: 'CODE_QUESTION',
  SPOT_THE_MISTAKE: 'SPOT_THE_MISTAKE',
  BEND_THIS: 'BEND_THIS',
  WHICH_BREAKER: 'WHICH_BREAKER',
  WHAT_WIRE_SIZE: 'WHAT_WIRE_SIZE',
  TROUBLESHOOT: 'TROUBLESHOOT',
  WHAT_WOULD_YOU_CHARGE: 'WHAT_WOULD_YOU_CHARGE',
};

// Rotation order. Code question stays most frequent because it is the cheapest
// to answer on a job site with one hand.
const ROTATION = [
  ChallengeFormat.CODE_QUESTION,
  ChallengeFormat.SPOT_THE_MISTAKE,
  ChallengeFormat.WHICH_BREAKER,
  ChallengeFormat.CODE_QUESTION,
  ChallengeFormat.BEND_THIS,
  ChallengeFormat.TROUBLESHOOT,
  ChallengeFormat.CODE_QUESTION,
  ChallengeFormat.WHAT_WIRE_SIZE,
  ChallengeFormat.SPOT_THE_MISTAKE,
  ChallengeFormat.WHAT_WOULD_YOU_CHARGE,
];

export const formatForDate = (date = new Date()) =>
  ROTATION[((dayNumber(date) % ROTATION.length) + ROTATION.length) % ROTATION.length];

// ─── Content banks ───────────────────────────────────────────────────────────
// Every answer here is a settled, non-controversial fact. Anything that varies
// by jurisdiction, manufacturer or design decision is deliberately excluded —
// a daily challenge is the wrong place for a judgement call.

export const BREAKER_CHALLENGES = [
  { id: 'br1', prompt: 'A continuous 32 A load. What is the minimum standard breaker size?',
    choices: ['35 A', '40 A', '45 A', '50 A'], correct: 1,
    explanation: '32 A × 125% = 40 A. NEC 210.20(A) requires the OCPD to be at least 125% of a continuous load, and 40 A is a standard size.',
    ref: 'NEC 210.20(A), 240.6(A)' },
  { id: 'br2', prompt: 'Which of these is NOT a standard OCPD ampere rating?',
    choices: ['45 A', '55 A', '70 A', '110 A'], correct: 1,
    explanation: 'NEC 240.6(A) lists 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 110, 125… 55 A is not among them.',
    ref: 'NEC 240.6(A)' },
  { id: 'br3', prompt: 'Maximum OCPD for #12 AWG copper under the small-conductor rule?',
    choices: ['15 A', '20 A', '25 A', '30 A'], correct: 1,
    explanation: 'NEC 240.4(D)(5) caps #12 Cu at 20 A regardless of what the ampacity table would allow.',
    ref: 'NEC 240.4(D)(5)' },
  { id: 'br4', prompt: 'A dwelling laundry branch circuit must be rated:',
    choices: ['15 A', '20 A', '30 A', 'either 15 A or 20 A'], correct: 1,
    explanation: 'NEC 210.11(C)(2) requires at least one 20 A branch circuit for laundry receptacles, serving no other outlets.',
    ref: 'NEC 210.11(C)(2)' },
];

export const WIRE_SIZE_CHALLENGES = [
  { id: 'ws1', prompt: 'Minimum copper EGC for a 20 A branch circuit?',
    choices: ['#14', '#12', '#10', '#8'], correct: 0,
    explanation: 'NEC Table 250.122: 15 A and 20 A circuits require a #14 Cu equipment grounding conductor.',
    ref: 'NEC 250.122' },
  { id: 'ws2', prompt: 'Minimum copper EGC for a 100 A feeder?',
    choices: ['#10', '#8', '#6', '#4'], correct: 1,
    explanation: 'NEC Table 250.122: 100 A = #8 Cu.',
    ref: 'NEC 250.122' },
  { id: 'ws3', prompt: 'NM cable ampacity must be taken from which temperature column?',
    choices: ['60 °C', '75 °C', '90 °C', 'the conductor rating'], correct: 0,
    explanation: 'NEC 334.80: NM cable ampacity uses the 60 °C column, even though the conductors are 90 °C rated. The 90 °C rating may still be used for derating.',
    ref: 'NEC 334.80' },
  { id: 'ws4', prompt: 'For equipment rated 100 A or less, terminations are assumed rated for:',
    choices: ['60 °C', '75 °C', '90 °C', 'no assumption'], correct: 0,
    explanation: 'NEC 110.14(C)(1)(a): use the 60 °C column unless the equipment is listed and marked otherwise.',
    ref: 'NEC 110.14(C)' },
];

export const BEND_CHALLENGES = [
  { id: 'bd1', prompt: 'A 6 in offset at 30°. What is the distance between marks?',
    choices: ['8.5 in', '12 in', '9 in', '6 in'], correct: 1,
    explanation: 'The 30° multiplier is 2.0. 6 in × 2.0 = 12 in between marks.',
    ref: 'Standard offset multipliers' },
  { id: 'bd2', prompt: 'A 6 in offset at 45°. What is the distance between marks?',
    choices: ['8.5 in', '12 in', '9 in', '6 in'], correct: 0,
    explanation: 'The 45° multiplier is 1.414. 6 in × 1.414 = 8.49 in, call it 8½ in.',
    ref: 'Standard offset multipliers' },
  { id: 'bd3', prompt: 'Maximum total bend degrees in EMT between pull points?',
    choices: ['180°', '270°', '360°', '450°'], correct: 2,
    explanation: 'NEC 358.26 limits the run to 360° total — four quarter-bends — between pull points.',
    ref: 'NEC 358.26' },
  { id: 'bd4', prompt: 'Rise 6 in, roll 8 in. What is the travel for a rolling offset?',
    choices: ['10 in', '14 in', '7 in', '12 in'], correct: 0,
    explanation: '√(6² + 8²) = √100 = 10 in. Classic 3-4-5 triangle.',
    ref: 'Pythagorean theorem' },
];

// "Spot the mistake" — a described installation with one clear defect.
export const SPOT_THE_MISTAKE = [
  { id: 'sm1',
    prompt: 'A 20 A kitchen small-appliance circuit is wired with #14 AWG copper, protected by a 20 A breaker, all terminations torqued. What is wrong?',
    choices: [
      'The conductor is undersized for the breaker',
      'The breaker is undersized for the circuit',
      'Nothing — this is correct',
      'Kitchen circuits may not be 20 A',
    ], correct: 0,
    explanation: '#14 Cu is limited to 15 A by NEC 240.4(D)(3). A 20 A circuit needs #12 Cu minimum.',
    ref: 'NEC 240.4(D)' },
  { id: 'sm2',
    prompt: 'A three-way switch has the line landed on a traveler terminal and a traveler on the common. What is the result?',
    choices: [
      'It works normally',
      'The load cannot be controlled from both locations',
      'The breaker trips',
      'The neutral becomes energized',
    ], correct: 1,
    explanation: 'The common must carry the line in or the switched leg out. With it reversed, the switch can no longer steer between both travelers and the load loses control from one location.',
    ref: 'Three-way switching principle' },
  { id: 'sm3',
    prompt: 'A cable is run through a stud with 3/4 in from the edge, no plate installed. What is wrong?',
    choices: [
      'Cables may not pass through studs',
      'It needs 1-1/4 in from the edge, or a steel plate',
      'It needs to be in conduit',
      'Nothing — 3/4 in is fine',
    ], correct: 1,
    explanation: 'NEC 300.4(A)(1) requires 1-1/4 in from the nearest edge, or a 1/16 in steel plate to protect against screws and nails.',
    ref: 'NEC 300.4(A)(1)' },
  { id: 'sm4',
    prompt: 'A panel directory lists every circuit as "Lights" or "Plugs". What is wrong?',
    choices: [
      'Nothing — the panel is labelled',
      'Circuits must be identified by their clear, evident and specific purpose',
      'Directories are optional',
      'Only the main needs identifying',
    ], correct: 1,
    explanation: 'NEC 408.4(A) requires each circuit to be legibly identified as to its clear, evident and specific purpose. Generic labels do not meet that.',
    ref: 'NEC 408.4(A)' },
];

// "What would you charge?" — no correct answer. The value is comparison, so it
// is scored on participation, never on being near a number we invented.
export const PRICING_PROMPTS = [
  { id: 'wc1', job: 'Replace a 100 A main panel with a 200 A panel, 20 circuits, permit and inspection included. Single-family home, existing service riser reusable.' },
  { id: 'wc2', job: 'Install one Level 2 EV charger, 60 ft from the panel, attached garage, existing 200 A service with spare capacity.' },
  { id: 'wc3', job: 'Diagnose and repair a dead bedroom circuit. Service call, one hour minimum, cause unknown at dispatch.' },
  { id: 'wc4', job: 'Rough-in a 1,200 sq ft single-family addition: 18 receptacles, 9 lights, 3 three-way circuits, bath fan, smoke detectors.' },
  { id: 'wc5', job: 'Replace 12 recessed cans with LED retrofits, 9 ft ceiling, existing dedicated circuit, no attic access.' },
];

// ─── Assembling the daily challenge ──────────────────────────────────────────

const pick = (bank, date, salt = 0) => {
  const i = ((dayNumber(date) + salt) % bank.length + bank.length) % bank.length;
  return bank[i];
};

/**
 * The whole challenge card for a date.
 *
 * @returns {{date, format, title, kind, prompt, choices?, correct?, explanation?,
 *            ref?, xp, scenarioId?, freeform?}}
 */
export const dailyChallenge = (date = new Date()) => {
  const format = formatForDate(date);
  const base = { date: isoDate(date), format, xp: 50 };

  switch (format) {
    case ChallengeFormat.CODE_QUESTION: {
      const q = getQuestionForDate(date);
      return { ...base, title: 'Daily Code Question', kind: 'MULTIPLE_CHOICE',
        prompt: q.question, choices: q.choices, correct: q.correct,
        explanation: q.explanation, ref: q.ref, category: q.category, difficulty: q.difficulty };
    }
    case ChallengeFormat.SPOT_THE_MISTAKE: {
      const c = pick(SPOT_THE_MISTAKE, date);
      return { ...base, title: 'Spot the Mistake', kind: 'MULTIPLE_CHOICE',
        prompt: c.prompt, choices: c.choices, correct: c.correct,
        explanation: c.explanation, ref: c.ref, xp: 75 };
    }
    case ChallengeFormat.WHICH_BREAKER: {
      const c = pick(BREAKER_CHALLENGES, date);
      return { ...base, title: 'Which Breaker?', kind: 'MULTIPLE_CHOICE',
        prompt: c.prompt, choices: c.choices, correct: c.correct,
        explanation: c.explanation, ref: c.ref };
    }
    case ChallengeFormat.WHAT_WIRE_SIZE: {
      const c = pick(WIRE_SIZE_CHALLENGES, date);
      return { ...base, title: 'What Wire Size?', kind: 'MULTIPLE_CHOICE',
        prompt: c.prompt, choices: c.choices, correct: c.correct,
        explanation: c.explanation, ref: c.ref };
    }
    case ChallengeFormat.BEND_THIS: {
      const c = pick(BEND_CHALLENGES, date);
      return { ...base, title: 'Bend This', kind: 'MULTIPLE_CHOICE',
        prompt: c.prompt, choices: c.choices, correct: c.correct,
        explanation: c.explanation, ref: c.ref };
    }
    case ChallengeFormat.TROUBLESHOOT: {
      const s = pick(SCENARIOS, date);
      return { ...base, title: 'Troubleshoot This', kind: 'SCENARIO',
        scenarioId: s.id, prompt: s.customerReport, choices: s.choices,
        correct: s.correctChoice, explanation: s.explanation, xp: 100 };
    }
    case ChallengeFormat.WHAT_WOULD_YOU_CHARGE: {
      const p = pick(PRICING_PROMPTS, date);
      return { ...base, title: 'What Would You Charge?', kind: 'FREEFORM_NUMBER',
        prompt: p.job, freeform: true, xp: 50,
        // No answer key. Pricing varies by market, licence class, overhead and
        // risk — publishing a "right" number would be misleading and would put
        // us in the position of setting prices.
        note: 'No right answer. Compare with what other electricians in your area said.' };
    }
    default:
      return { ...base, title: 'Daily Code Question', kind: 'MULTIPLE_CHOICE', ...getQuestionForDate(date) };
  }
};

/** Answer a challenge. Freeform prompts always count as complete. */
export const answerDailyChallenge = (challenge, answer) => {
  if (challenge.kind === 'FREEFORM_NUMBER') {
    const n = Number(answer);
    return {
      complete: Number.isFinite(n) && n > 0,
      correct: null,          // there is no correct
      xpAwarded: Number.isFinite(n) && n > 0 ? challenge.xp : 0,
      note: challenge.note,
    };
  }
  const correct = answer === challenge.correct;
  return {
    complete: true,
    correct,
    xpAwarded: correct ? challenge.xp : Math.floor(challenge.xp / 5), // trying still counts
    explanation: challenge.explanation,
    ref: challenge.ref,
  };
};

/** The next seven days, for a "coming up" strip and for offline prefetch. */
export const upcomingChallenges = (from = new Date(), days = 7) =>
  Array.from({ length: days }, (_, i) => {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    const c = dailyChallenge(d);
    return { date: c.date, format: c.format, title: c.title };
  });

// ─── "Can You Beat the Apprentice?" ──────────────────────────────────────────
//
// A 15-second timed mistake hunt built for sharing. Deliberately built on the
// same content as Spot the Mistake — a share loop is worth building only once
// the content exists, not as a separate content pipeline.

export const BEAT_THE_APPRENTICE_SECONDS = 15;

// A plausible-but-beatable benchmark, presented honestly as a benchmark rather
// than as a real person's score.
export const APPRENTICE_BENCHMARK_SECONDS = 9;

export const beatTheApprentice = (date = new Date()) => {
  const c = pick(SPOT_THE_MISTAKE, date, 3);
  return {
    id: `bta-${c.id}`,
    title: 'Can You Beat the Apprentice?',
    timeLimitSeconds: BEAT_THE_APPRENTICE_SECONDS,
    benchmarkSeconds: APPRENTICE_BENCHMARK_SECONDS,
    prompt: c.prompt,
    choices: c.choices,
    correct: c.correct,
    explanation: c.explanation,
    ref: c.ref,
  };
};

export const scoreBeatTheApprentice = ({ correct, elapsedSeconds }) => {
  if (!correct) {
    return { beat: false, correct: false, xp: 10, shareable: false,
      message: 'Not this time. Try tomorrow.' };
  }
  const beat = elapsedSeconds < APPRENTICE_BENCHMARK_SECONDS;
  // Faster is worth more, but a correct slow answer still pays.
  const speedBonus = Math.max(0, Math.round((BEAT_THE_APPRENTICE_SECONDS - elapsedSeconds) * 10));
  return {
    beat,
    correct: true,
    elapsedSeconds,
    xp: 50 + speedBonus,
    shareable: true,
    message: beat
      ? `Beat the apprentice by ${(APPRENTICE_BENCHMARK_SECONDS - elapsedSeconds).toFixed(1)}s.`
      : 'Correct — the apprentice was just faster.',
    shareText: beat
      ? `Spotted the fault in ${elapsedSeconds.toFixed(1)}s. Can you beat that?`
      : `Got it in ${elapsedSeconds.toFixed(1)}s. Think you're faster?`,
  };
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export { isoDate };
