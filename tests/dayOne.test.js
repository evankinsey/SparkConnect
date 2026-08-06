// ─── DAY ONE ─────────────────────────────────────────────────────────────────
// The game is not where the electrical truth gets hand-waved.
//
// Every wiring step is graded by the same solver as the Wiring Simulator, and
// every calculation is checked against the method it claims to use — not
// against a number somebody typed into a game script.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DAY_ONE, LEVEL, StepKind, stepById, emptyProgress, sanitizeProgress,
  isUnlocked, isDone, nextStep, completeStep, levelProgress,
  gradeCalcStep, lessonForStep,
} from '../src/core/game/dayOne.js';
import { solutionCircuit, lessonById } from '../src/circuit/lessons/index.js';
import { validate } from '../src/circuit/validator.js';
import { truthTable } from '../src/circuit/solver.js';
import { resolveCitation } from '../src/nec/citations.js';
import { fillFor, maxConductors } from '../src/core/domain/conduitFill.js';

// ─── The level exists and is ten steps ───────────────────────────────────────

test('the level the brief asked for exists, with ten ordered steps', () => {
  assert.equal(DAY_ONE.length, 10);
  assert.equal(LEVEL.steps, 10);
  assert.equal(LEVEL.title, 'Commercial Rough-In — Day One');
  assert.deepEqual(DAY_ONE.map((s) => s.order), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(new Set(DAY_ONE.map((s) => s.id)).size, 10, 'step ids must be unique');
});

test('every step is well formed', () => {
  for (const s of DAY_ONE) {
    assert.ok(s.id && s.title && s.brief, JSON.stringify(s));
    assert.ok(Object.values(StepKind).includes(s.kind), `${s.id} has a bogus kind`);
    assert.ok(Number.isFinite(s.xp) && s.xp > 0, `${s.id} has no xp`);
    assert.ok(s.character, `${s.id} has nobody asking for it`);
  }
});

// ─── The guarantee ───────────────────────────────────────────────────────────

test('EVERY wiring step is graded by the solver, not by a picture', () => {
  const wireSteps = DAY_ONE.filter((s) => s.kind === StepKind.WIRE);
  assert.ok(wireSteps.length >= 2, 'a day with no wiring in it is not a rough-in');

  for (const s of wireSteps) {
    const lesson = lessonForStep(s.id);
    assert.ok(lesson, `${s.id} names lesson "${s.lessonId}" which does not exist`);

    // The same battery the Wiring Simulator runs. If a lesson used by the game
    // could not pass it, the game would be teaching something the bench refuses.
    const result = validate(solutionCircuit(lesson), lesson.expectations);
    assert.equal(result.valid, true,
      `${s.id}: ${result.errors.map((e) => e.message).join('; ')}`);

    const tt = truthTable(solutionCircuit(lesson));
    assert.ok(!tt.rows.some((r) => r.shortCircuit), `${s.id} shorts somewhere`);
    assert.equal(new Set(tt.rows.map((r) => r.anyLoadEnergized)).size, 2,
      `${s.id}: the load never changes state, so nothing is being taught`);
  }
});

test('a non-wiring step never claims a lesson it is not graded by', () => {
  for (const s of DAY_ONE) {
    if (s.kind === StepKind.WIRE) continue;
    assert.equal(s.lessonId, null, `${s.id} carries a lessonId it does not use`);
    assert.equal(lessonForStep(s.id), null);
  }
});

test('every calculation states the method it used', () => {
  for (const s of DAY_ONE.filter((x) => x.kind === StepKind.CALC)) {
    assert.ok(s.method, `${s.id} produces a number with no stated method`);
    assert.ok(Number.isFinite(s.answer), `${s.id} has no answer`);
    assert.ok(s.tolerance > 0, `${s.id} has no tolerance`);
    assert.ok(s.unit, `${s.id} has a number with no unit`);
    assert.ok(s.explain && s.explain.length > 40, `${s.id} does not explain itself`);
    assert.ok(s.wrongNudge, `${s.id} has nothing to say to someone who got it wrong`);
  }
});

test('every citation in the level resolves', () => {
  for (const s of DAY_ONE) {
    if (!s.ref) continue;
    assert.ok(resolveCitation(s.ref), `${s.id} cites "${s.ref}", which does not resolve`);
  }
});

// ─── The arithmetic is actually right ────────────────────────────────────────

test('the box fill answer matches NEC 314.16(B)', () => {
  // 4 × #12 (2.25) + yoke (2 × 2.25) + all grounds (2.25) + all clamps (2.25)
  const expected = 4 * 2.25 + 2 * 2.25 + 2.25 + 2.25;
  assert.equal(expected, 18);
  assert.equal(stepById('d1-boxes').answer, expected);
});

test('the conduit answer matches the conduit fill engine', () => {
  // Nine #12 THHN in 1/2" EMT — the step claims 39.4% and that it is the max.
  const r = fillFor({ conduitType: 'EMT', tradeSize: '1/2"', insulation: 'THHN', gauge: '12', count: 9 });
  assert.equal(r.passed, true);
  assert.ok(r.percent > 39 && r.percent < 40, `expected ~39.4%, got ${r.percent}`);
  assert.equal(maxConductors('EMT', '1/2"', 'THHN', '12'), 9,
    'the step says nine is the maximum; Annex C has to agree');
  assert.equal(stepById('d1-pipe').answer, 0.5);
});

test('the derating answer respects the small-conductor rule', () => {
  // 30 A at 90°C, 80% for 4-6 CCC = 24 A, then 240.4(D)(5) caps 12 Cu at 20 A.
  const derated = 30 * 0.8;
  assert.equal(derated, 24);
  assert.equal(stepById('d1-panel').answer, 20,
    'the adjustment is not the last word — 240.4(D) is');
  assert.match(stepById('d1-panel').explain, /240\.4\(D\)/);
});

test('the layout answer measures from the right edge of the box', () => {
  assert.equal(stepById('d1-layout').answer, 18 - 4 / 2);
  // Mounting heights come from the drawings and the spec, not the NEC, and the
  // explanation has to say so rather than implying a code requirement.
  assert.match(stepById('d1-layout').explain, /drawings and the spec|not by the NEC/i);
});

// ─── Ordering ────────────────────────────────────────────────────────────────

test('the day happens in order and nothing can be skipped', () => {
  let p = emptyProgress();
  assert.equal(nextStep(p).id, 'd1-checkin');
  assert.equal(isUnlocked('d1-switch', p), false, 'you do not wire before you lay out');

  for (const s of DAY_ONE) {
    const next = nextStep(p);
    assert.equal(next.id, s.id, `expected ${s.id} next, got ${next?.id}`);
    p = completeStep(p, s.id);
  }
  assert.equal(nextStep(p), null, 'the day is finished');
  assert.equal(levelProgress(p).complete, true);
  assert.equal(levelProgress(p).xp, LEVEL.totalXp);
});

test('a requirement chain that names a missing step would be caught', () => {
  for (const s of DAY_ONE) {
    for (const r of s.requires) {
      assert.ok(stepById(r), `${s.id} requires "${r}", which does not exist`);
      assert.ok(stepById(r).order < s.order, `${s.id} requires a step that comes after it`);
    }
  }
});

test('progress survives garbage', () => {
  assert.deepEqual(sanitizeProgress(null).completed, []);
  assert.deepEqual(sanitizeProgress({ completed: 'nope' }).completed, []);
  assert.deepEqual(sanitizeProgress({ completed: ['d1-checkin', 'fake', 'd1-checkin'] }).completed,
    ['d1-checkin'], 'unknown ids dropped, duplicates collapsed');
  assert.equal(completeStep(emptyProgress(), 'not-a-step').completed.length, 0);
});

test('completing a step twice does not double count', () => {
  let p = completeStep(emptyProgress(), 'd1-checkin');
  p = completeStep(p, 'd1-checkin');
  assert.equal(p.completed.length, 1);
  assert.equal(levelProgress(p).done, 1);
  assert.equal(isDone('d1-checkin', p), true);
});

// ─── Grading ─────────────────────────────────────────────────────────────────

test('a calc step grades to its tolerance and explains either way', () => {
  const right = gradeCalcStep('d1-boxes', '18');
  assert.equal(right.correct, true);
  assert.ok(right.explain, 'getting it right without knowing why is what this prevents');

  const wrong = gradeCalcStep('d1-boxes', '15.75');
  assert.equal(wrong.correct, false);
  assert.ok(wrong.nudge);
  assert.ok(wrong.explain);

  assert.equal(gradeCalcStep('d1-boxes', '18.0 in³').correct, true, 'units are tolerated');
  assert.equal(gradeCalcStep('d1-boxes', '').empty, true);
  assert.equal(gradeCalcStep('d1-boxes', 'abc').empty, true);
});

test('a tolerance cannot be wide enough to pass a wrong method', () => {
  // 15.75 is the answer you get from counting the yoke once instead of twice.
  // It has to fail, or the step teaches the wrong method.
  assert.equal(gradeCalcStep('d1-boxes', 15.75).correct, false);
  // 9.0 is conductors only, forgetting the device, ground and clamp.
  assert.equal(gradeCalcStep('d1-boxes', 9).correct, false);
});

test('grading a step that is not a calculation returns nothing', () => {
  assert.equal(gradeCalcStep('d1-switch', '5'), null);
  assert.equal(gradeCalcStep('d1-checkin', '5'), null);
  assert.equal(gradeCalcStep('nope', '5'), null);
});

test('the day covers site work, reading, arithmetic and wiring', () => {
  const kinds = new Set(DAY_ONE.map((s) => s.kind));
  for (const k of Object.values(StepKind)) {
    assert.ok(kinds.has(k), `a first day with no ${k} step is not a first day`);
  }
});
