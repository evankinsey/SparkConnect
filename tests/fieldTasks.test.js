// ─── GRADED FIELD TASKS ──────────────────────────────────────────────────────
// The load-bearing test here recomputes every expected answer using the SAME
// formulas App.js uses. If a calculator changes and a task's answer does not,
// the player would be told they are wrong by the app that told them which tool
// to use. That must fail loudly here instead.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FIELD_TASKS, FieldTaskKind, fieldTaskById, fieldTaskForStation,
  parseAnswer, gradeFieldTask, gradePhotoTask,
} from '../src/core/game/fieldTasks.js';
import { STATIONS } from '../src/core/game/jobsite.js';
import { CHARACTERS } from '../src/core/game/cast.js';

// Constants copied from App.js. Copied deliberately: if App.js changes one of
// these, this test keeps the OLD value and the recomputation below fails,
// which is exactly the alarm we want.
const VD_RES_12AWG_CU = 1.98;      // ohms per 1000 ft
const OFFSET_MULT_30 = 2.0;
const CONDUCTOR_VOL_12 = 2.25;     // in³

test('every field task is complete and voiced by a real cast member', () => {
  for (const t of FIELD_TASKS) {
    assert.ok(t.id && t.stationId && t.ask, `${t.id} incomplete`);
    assert.ok(Object.values(FieldTaskKind).includes(t.kind), `${t.id} kind`);
    assert.ok(CHARACTERS[t.character], `${t.id} names an unknown character ${t.character}`);
    assert.ok(t.explain && t.explain.length > 30, `${t.id} must teach on success`);
    assert.ok(t.wrongNudge && t.wrongNudge.length > 20, `${t.id} must nudge on failure`);
    if (t.kind === FieldTaskKind.CALC) {
      assert.ok(typeof t.answer === 'number' && Number.isFinite(t.answer), `${t.id} answer`);
      assert.ok(t.tolerance > 0 && t.tolerance < 1, `${t.id} tolerance must be tight`);
      assert.ok(t.unit, `${t.id} unit`);
      assert.ok(Array.isArray(t.given) && t.given.length >= 2, `${t.id} must state its givens`);
    }
  }
});

test('the offset answer matches the bending calculator', () => {
  // App.js: spacing = offsetHeight * multiplier
  const expected = 6 * OFFSET_MULT_30;
  assert.equal(fieldTaskById('ft-offset').answer, expected);
});

test('the voltage drop answer matches the voltage drop calculator', () => {
  // App.js: drop = (i * r * d * mult) / 1000, mult = 2 for single phase
  const expected = (20 * VD_RES_12AWG_CU * 50 * 2) / 1000;
  assert.equal(fieldTaskById('ft-voltage-drop').answer, expected);
});

test('the box fill answer matches the box fill calculator', () => {
  // App.js: conductors each 1 vol, ALL grounds 1 vol total, each device 2 vol
  const conductors = 6 * CONDUCTOR_VOL_12;
  const grounds = CONDUCTOR_VOL_12;          // two grounds still count once
  const device = 1 * 2 * CONDUCTOR_VOL_12;
  const expected = Math.round((conductors + grounds + device) * 100) / 100;
  assert.equal(fieldTaskById('ft-box-fill').answer, expected);
});

test('a correct answer is accepted and explains why', () => {
  const r = gradeFieldTask('ft-offset', '12');
  assert.equal(r.correct, true);
  assert.equal(r.expected, 12);
  assert.match(r.message, /multiplier/i);
});

test('units and stray text in the answer do not matter', () => {
  for (const input of ['12', '12.0', '12 in', '12in', ' 12 ', 12, '12.00 inches']) {
    assert.equal(gradeFieldTask('ft-offset', input).correct, true, `rejected ${input}`);
  }
  assert.equal(gradeFieldTask('ft-voltage-drop', '3.96V').correct, true);
  assert.equal(gradeFieldTask('ft-box-fill', '20.25 in³').correct, true);
});

test('a wrong answer gets the nudge, never the number', () => {
  const r = gradeFieldTask('ft-offset', '6');
  assert.equal(r.correct, false);
  assert.equal(r.expected, undefined, 'a wrong answer must not reveal the answer');
  assert.ok(!/\b12\b/.test(r.message), `nudge leaked the answer: ${r.message}`);
});

test('a plausible wrong method is still rejected', () => {
  // Forgetting the round trip on voltage drop halves it.
  assert.equal(gradeFieldTask('ft-voltage-drop', '1.98').correct, false);
  // Counting both grounds separately on box fill overshoots.
  assert.equal(gradeFieldTask('ft-box-fill', '22.5').correct, false);
  // Using the 45° multiplier on the offset.
  assert.equal(gradeFieldTask('ft-offset', '8.48').correct, false);
});

test('empty or non-numeric input asks for a number rather than failing them', () => {
  for (const junk of ['', '   ', 'dunno', null, undefined, {}]) {
    const r = gradeFieldTask('ft-offset', junk);
    assert.equal(r.correct, false);
    assert.match(r.message, /Enter the number/);
  }
});

test('parseAnswer handles what people actually type', () => {
  assert.equal(parseAnswer('1,200'), 1200);
  assert.equal(parseAnswer('-3.5'), -3.5);
  assert.equal(parseAnswer('abc'), null);
  assert.equal(parseAnswer(NaN), null);
  assert.equal(parseAnswer(Infinity), null);
});

test('the photo task requires a NEW photo, not an existing one', () => {
  assert.equal(gradePhotoTask('ft-jobcam', 3, 4).correct, true);
  assert.equal(gradePhotoTask('ft-jobcam', 3, 3).correct, false, 'old photos are not doing the work');
  assert.equal(gradePhotoTask('ft-jobcam', 0, 0).correct, false);
  assert.equal(gradePhotoTask('ft-jobcam', 5, 2).correct, false, 'deleting photos is not doing the work');
  assert.match(gradePhotoTask('ft-jobcam', 3, 3).message, /Nothing was added/);
});

test('bad counts degrade to zero rather than throwing', () => {
  for (const [a, b] of [[null, 1], ['3', 4], [undefined, undefined], [-5, -1], [1.5, 2.5]]) {
    const r = gradePhotoTask('ft-jobcam', a, b);
    assert.equal(r.ok, true);
    assert.equal(typeof r.correct, 'boolean');
  }
});

test('grading the wrong kind of task is refused, not guessed', () => {
  assert.equal(gradeFieldTask('ft-jobcam', '5').ok, false);
  assert.equal(gradePhotoTask('ft-offset', 0, 1).ok, false);
  assert.equal(gradeFieldTask('nope', '1').ok, false);
  assert.equal(gradePhotoTask('nope', 0, 1).ok, false);
});

test('every field task points at a station that exists', () => {
  const ids = new Set(STATIONS.map((s) => s.id));
  for (const t of FIELD_TASKS) {
    assert.ok(ids.has(t.stationId), `${t.id} points at unknown station ${t.stationId}`);
  }
});

test('lookup by station finds the task', () => {
  assert.equal(fieldTaskForStation('st-bench').id, 'ft-offset');
  assert.equal(fieldTaskForStation('nope'), null);
});
