// ─── PROGRESSIVE REVEAL ──────────────────────────────────────────────────────
// A troubleshooting screen that hands over the symptom, the readings and four
// answers at once is a reading exercise. These tests hold the difference.

import test from 'node:test';
import assert from 'node:assert/strict';

import { generateScenario, generateBatch, WhyBasis } from '../src/core/training/scenarioEngine.js';
import {
  Stage, STAGE_ORDER, STEPS, beginInvestigation, canReveal, reveal, setEnergized,
  candidates, remainingCount, view, gradeInvestigation,
} from '../src/core/training/investigation.js';

const LESSONS = [
  'single-pole-source-at-switch', 'single-pole-source-at-light',
  'three-way-source-at-switch', 'three-way-source-at-light',
  'four-way-three-location',
];

/** A scenario with at least one distractor the meter is needed for. */
const scenarioWithBasis = (basis) => {
  for (const lessonId of LESSONS) {
    for (const s of generateBatch(lessonId, { from: 0, count: 40 })) {
      if (s.choices.some((c) => !c.correct && c.basis === basis)) return s;
    }
  }
  return null;
};

const anyScenario = () => {
  const [s] = generateBatch(LESSONS[0], { from: 0, count: 1 });
  return s ?? null;
};

const walkTo = (state, stage) => {
  let s = state;
  for (const st of STAGE_ORDER) {
    if (STEPS[st].requiresDeEnergized) s = setEnergized(s, false);
    if (STEPS[st].requiresEnergized) s = setEnergized(s, true);
    s = reveal(s, st);
    if (st === stage) break;
  }
  return s;
};

// ─── The reveal itself ───────────────────────────────────────────────────────

test('nothing but the complaint is available at the start', () => {
  const sc = anyScenario();
  const v = view(sc, beginInvestigation(sc));

  assert.ok(v.complaint, 'a call always starts with somebody telling you something');
  // The three things the old screen handed over for free.
  assert.equal(v.symptom, null, 'the symptom is what you find, not what you are given');
  assert.equal(v.readings, null, 'meter readings do not exist until somebody meters it');
  assert.equal(v.circuit, null, 'the wiring is the answer');
});

test('each step reveals only what that step would actually produce', () => {
  const sc = anyScenario();
  let s = beginInvestigation(sc);

  s = reveal(s, Stage.OPERATE);
  let v = view(sc, s);
  assert.ok(v.symptom, 'operating it tells you what it does');
  assert.equal(v.readings, null, 'you have not metered anything yet');

  s = reveal(s, Stage.METER);
  v = view(sc, s);
  assert.ok(v.readings);
  assert.equal(v.circuit, null, 'a meter does not show you the terminations');

  s = reveal(setEnergized(s, false), Stage.CONTINUITY);
  s = reveal(s, Stage.OPEN);
  assert.ok(view(sc, s).circuit, 'opening it up is the only thing that shows the wiring');
});

test('the order is the method', () => {
  const sc = anyScenario();
  const s = beginInvestigation(sc);
  // You do not pull a device before you have flipped the switch.
  const blocked = canReveal(s, Stage.METER);
  assert.equal(blocked.ok, false);
  assert.match(blocked.reason, /Walk in and try it/);
  assert.match(blocked.fix, /Operate every switch/);
});

// ─── The safety gate ─────────────────────────────────────────────────────────

test('continuity on a live circuit is refused, and the refusal is remembered', () => {
  const sc = anyScenario();
  let s = walkTo(beginInvestigation(sc), Stage.METER);
  assert.equal(s.energized, true, 'you find them live');

  const check = canReveal(s, Stage.CONTINUITY);
  assert.equal(check.ok, false);
  assert.equal(check.safety, true);
  assert.match(check.reason, /still energized/i);
  assert.match(check.fix, /verify absence of voltage/i);

  // Attempting it is recorded rather than swallowed — this is the mistake the
  // whole sequence exists to train out, and it only teaches if it comes back.
  s = reveal(s, Stage.CONTINUITY);
  assert.equal(s.revealed.includes(Stage.CONTINUITY), false, 'it must not happen anyway');
  assert.equal(s.refusals.length, 1);
  assert.equal(s.refusals[0].stage, Stage.CONTINUITY);

  // And it outranks the score at the end.
  const g = gradeInvestigation(sc, s, sc.correctIndex);
  assert.equal(g.clean, false);
  assert.equal(g.safetyLapses.length, 1);
});

test('the app does not de-energize for you', () => {
  const sc = anyScenario();
  let s = walkTo(beginInvestigation(sc), Stage.METER);
  // Killing the power has to be a thing the user DID. A trainer that does it
  // the instant you tap Continuity has skipped the part that matters.
  assert.equal(canReveal(s, Stage.CONTINUITY).ok, false);
  s = setEnergized(s, false);
  assert.equal(canReveal(s, Stage.CONTINUITY).ok, true);
});

test('metering a dead circuit is refused too, without calling it a safety lapse', () => {
  const sc = anyScenario();
  let s = reveal(beginInvestigation(sc), Stage.OPERATE);
  s = setEnergized(s, false);
  const check = canReveal(s, Stage.METER);
  assert.equal(check.ok, false);
  assert.equal(check.safety, false, 'a wasted trip is not a hospital visit');
  assert.match(check.reason, /dead/i);
});

// ─── The honest candidate set ────────────────────────────────────────────────

test('a distractor is only ruled out once the step that separates it was taken', () => {
  const sc = scenarioWithBasis(WhyBasis.METER);
  assert.ok(sc, 'expected at least one scenario the meter is needed for');

  const meterOnly = sc.choices
    .map((c, i) => ({ ...c, i }))
    .filter((c) => !c.correct && c.basis === WhyBasis.METER)
    .map((c) => c.i);

  let s = beginInvestigation(sc);
  for (const i of meterOnly) {
    assert.equal(candidates(sc, s)[i].ruledOut, false, 'the complaint rules out nothing');
  }

  s = reveal(s, Stage.OPERATE);
  for (const i of meterOnly) {
    assert.equal(candidates(sc, s)[i].ruledOut, false,
      'a fault that only a meter separates survives walking in and flipping the switch');
  }

  s = reveal(s, Stage.METER);
  for (const i of meterOnly) {
    const c = candidates(sc, s)[i];
    assert.equal(c.ruledOut, true);
    assert.equal(c.ruledOutBy, Stage.METER);
    assert.ok(c.why, 'and it says what it would have read instead');
  }
});

test('the correct answer is never ruled out, and the count only falls', () => {
  const sc = anyScenario();
  let s = beginInvestigation(sc);
  let last = remainingCount(sc, s);
  assert.equal(last, sc.choices.length, 'nothing is eliminated before you have done anything');

  for (const stage of STAGE_ORDER.slice(1)) {
    if (STEPS[stage].requiresDeEnergized) s = setEnergized(s, false);
    if (STEPS[stage].requiresEnergized) s = setEnergized(s, true);
    s = reveal(s, stage);
    const now = remainingCount(sc, s);
    assert.ok(now <= last, `${stage} increased the candidate set`);
    assert.equal(candidates(sc, s)[sc.correctIndex].ruledOut, false,
      'nothing rules out what is true');
    last = now;
  }
  assert.equal(last, 1, 'opening it up leaves exactly one');
});

test('a step never claims to narrow something it cannot', () => {
  // Continuity confirms what the voltage readings already implied on these
  // circuits. Saying otherwise would invent a discrimination the solver cannot
  // back, which is the exact failure the whole app is arranged against.
  assert.deepEqual([...STEPS[Stage.CONTINUITY].eliminates], []);
  assert.equal(STEPS[Stage.CONTINUITY].confirms, true);
  assert.deepEqual([...STEPS[Stage.COMPLAINT].eliminates], [],
    'people describe intermittent as dead and one room as the whole house');
});

// ─── Grading in context ──────────────────────────────────────────────────────

test('a right answer that could not have been known is called a guess', () => {
  const sc = scenarioWithBasis(WhyBasis.METER);
  const s = beginInvestigation(sc);

  const g = gradeInvestigation(sc, s, sc.correctIndex);
  assert.equal(g.correct, true);
  assert.equal(g.outcome, 'LUCKY');
  assert.ok(g.remainingWhenAnswered > 1);
  // The sentence that makes this worth building. A right answer for no reason
  // is the most expensive habit in the trade and no quiz can see it.
  assert.match(g.verdict, /coin toss/i);
  assert.ok(g.whatWouldHaveRuledItOut, 'and it says which step would have settled it');
});

test('a right answer with one candidate left is a deduction', () => {
  const sc = anyScenario();
  const s = walkTo(beginInvestigation(sc), Stage.METER);
  const g = gradeInvestigation(sc, s, sc.correctIndex);
  if (g.remainingWhenAnswered === 1) {
    assert.equal(g.outcome, 'DEDUCED');
    assert.match(g.verdict, /Called it/);
    assert.equal(g.whatWouldHaveRuledItOut, null);
  }
});

test('answering after opening it up is not diagnosis', () => {
  const sc = anyScenario();
  const s = walkTo(beginInvestigation(sc), Stage.OPEN);
  const g = gradeInvestigation(sc, s, sc.correctIndex);
  assert.equal(g.correct, true);
  assert.equal(g.outcome, 'READ_OFF');
  assert.match(g.verdict, /reading the answer, not finding it/);
});

test('a wrong answer says what would have separated it', () => {
  const sc = scenarioWithBasis(WhyBasis.METER);
  const wrong = sc.choices.findIndex((c) => !c.correct);
  const s = walkTo(beginInvestigation(sc), Stage.METER);
  const g = gradeInvestigation(sc, s, wrong);
  assert.equal(g.correct, false);
  assert.equal(g.outcome, 'WRONG');
  assert.ok(g.whyThisIsWrong, 'the engine computed this when it built the scenario');
});

test('the time spent is real, and doing nothing costs nothing', () => {
  const sc = anyScenario();
  assert.equal(beginInvestigation(sc).minutesSpent, 0, 'reading the complaint is free');
  const s = walkTo(beginInvestigation(sc), Stage.OPEN);
  assert.equal(s.minutesSpent, 70, 'every step after the call costs time');
  assert.ok(view(sc, s).minutesSpent > 0);
});

test('a null scenario produces nothing rather than throwing', () => {
  assert.equal(beginInvestigation(null), null);
  assert.equal(view(null, null), null);
  assert.equal(gradeInvestigation(null, null, 0), null);
  assert.deepEqual([...candidates(null, null)], []);
  const sc = anyScenario();
  assert.equal(gradeInvestigation(sc, beginInvestigation(sc), 99), null, 'no such choice');
});
