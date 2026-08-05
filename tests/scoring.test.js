// ─── SCORING / XP / RANK / STREAK TESTS ──────────────────────────────────────
// Requirements: TST-02, SCR-01 … SCR-07

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  scoreAttempt, recordAttempt, emptyProgress, rankForXp, nextHint,
  completionPercent, xpForAttempt, RANKS, BASE_SCORE, PENALTY, BONUS, TimerMode,
} from '../src/circuit/scoring.js';
import { lessonById } from '../src/circuit/lessons/index.js';
import { RANK_DISCLAIMER } from '../src/circuit/review.js';

test('TST-02 a clean first-attempt completion scores base + first-attempt bonus', () => {
  const r = scoreAttempt({ completed: true });
  assert.equal(r.score, BASE_SCORE + BONUS.FIRST_ATTEMPT);
  assert.equal(r.firstAttempt, true);
});

test('TST-02 wrong-attempt deduction is 100 each', () => {
  const r = scoreAttempt({ wrongTests: 3, completed: true });
  assert.equal(r.breakdown.wrongTests, -300);
  assert.equal(r.score, BASE_SCORE - 300);
  assert.equal(r.firstAttempt, false, 'a wrong test forfeits the first-attempt bonus');
});

test('TST-02 hint deductions follow the 25/50/75/100/200 ladder', () => {
  assert.equal(scoreAttempt({ hintsUsed: [1], completed: true }).score, BASE_SCORE - PENALTY.HINT_1);
  assert.equal(scoreAttempt({ hintsUsed: [1, 2], completed: true }).score, BASE_SCORE - 25 - 50);
  assert.equal(scoreAttempt({ hintsUsed: [1, 2, 3, 4], completed: true }).score, BASE_SCORE - 25 - 50 - 75 - 100);
  assert.equal(scoreAttempt({ hintsUsed: [5], completed: true }).score, BASE_SCORE - PENALTY.REVEAL);
});

test('TST-02 re-reading the same hint is only charged once', () => {
  const a = scoreAttempt({ hintsUsed: [1, 1, 1, 2], completed: true });
  const b = scoreAttempt({ hintsUsed: [1, 2], completed: true });
  assert.equal(a.score, b.score);
});

test('TST-02 reset deduction is 50 each', () => {
  assert.equal(scoreAttempt({ resets: 2, completed: true }).breakdown.resets, -100);
});

test('TST-02 time bonus scales to par and never exceeds the cap', () => {
  const instant = scoreAttempt({ completed: true, elapsedSeconds: 0, parSeconds: 120, timerMode: TimerMode.CHALLENGE });
  assert.equal(instant.breakdown.timeBonus, BONUS.FAST_COMPLETION_MAX);

  const half = scoreAttempt({ completed: true, elapsedSeconds: 60, parSeconds: 120, timerMode: TimerMode.CHALLENGE });
  assert.equal(half.breakdown.timeBonus, 100);

  const slow = scoreAttempt({ completed: true, elapsedSeconds: 999, parSeconds: 120, timerMode: TimerMode.CHALLENGE });
  assert.equal(slow.breakdown.timeBonus, 0, 'over par gives no bonus, never a penalty');
});

test('SCR-04 Learn Mode awards no time bonus, so the default mode is not a race', () => {
  const r = scoreAttempt({ completed: true, elapsedSeconds: 1, parSeconds: 120, timerMode: TimerMode.LEARN });
  assert.equal(r.breakdown.timeBonus, 0);
});

test('TST-02 score has a minimum bound of 0', () => {
  const r = scoreAttempt({ wrongTests: 50, resets: 20, hintsUsed: [1, 2, 3, 4, 5], completed: true });
  assert.equal(r.score, 0);
  assert.equal(r.cappedAtMinimum, true);
  assert.ok(r.breakdown.raw < 0, 'the raw total is still reported for debugging');
});

// ─── Ranks (SCR-06, SCR-07) ──────────────────────────────────────────────────

test('SCR-06 ranks run Helper → Field Troubleshooter in order', () => {
  assert.deepEqual(RANKS.map((r) => r.title), [
    'Helper', 'First-Year Apprentice', 'Second-Year Apprentice', 'Third-Year Apprentice',
    'Fourth-Year Apprentice', 'Journeyman Candidate', 'Field Troubleshooter',
  ]);
});

test('SCR-07 every rank lookup carries the not-a-license disclaimer', () => {
  for (const xp of [0, 499, 500, 3000, 12000, 999999]) {
    assert.equal(rankForXp(xp).disclaimer, RANK_DISCLAIMER);
  }
  assert.match(RANK_DISCLAIMER, /not a license or certification/i);
});

test('SCR-06 rank boundaries and progress are correct', () => {
  assert.equal(rankForXp(0).title, 'Helper');
  assert.equal(rankForXp(499).title, 'Helper');
  assert.equal(rankForXp(500).title, 'First-Year Apprentice');
  assert.equal(rankForXp(12000).title, 'Field Troubleshooter');
  assert.equal(rankForXp(12000).next, null);
  assert.equal(rankForXp(12000).progressToNext, 1);
  assert.equal(rankForXp(-5).xp, 0, 'negative XP is clamped');
});

// ─── Progress and streaks (SCR-05, TST-02) ───────────────────────────────────

test('TST-02 streak increments on consecutive days and resets after a gap', () => {
  let p = emptyProgress();
  ({ progress: p } = recordAttempt(p, 'l1', { completed: true }, '2026-08-01'));
  assert.equal(p.currentStreak, 1);

  ({ progress: p } = recordAttempt(p, 'l2', { completed: true }, '2026-08-02'));
  assert.equal(p.currentStreak, 2);

  ({ progress: p } = recordAttempt(p, 'l3', { completed: true }, '2026-08-03'));
  assert.equal(p.currentStreak, 3);
  assert.equal(p.longestStreak, 3);

  // Skip a day.
  ({ progress: p } = recordAttempt(p, 'l4', { completed: true }, '2026-08-05'));
  assert.equal(p.currentStreak, 1, 'a missed day resets the streak');
  assert.equal(p.longestStreak, 3, 'longest streak is retained');
});

test('TST-02 two completions on the same day do not double-count the streak', () => {
  let p = emptyProgress();
  ({ progress: p } = recordAttempt(p, 'l1', { completed: true }, '2026-08-01'));
  ({ progress: p } = recordAttempt(p, 'l2', { completed: true }, '2026-08-01'));
  assert.equal(p.currentStreak, 1);
});

test('TST-02 streak survives a month boundary', () => {
  let p = emptyProgress();
  ({ progress: p } = recordAttempt(p, 'l1', { completed: true }, '2026-08-31'));
  ({ progress: p } = recordAttempt(p, 'l2', { completed: true }, '2026-09-01'));
  assert.equal(p.currentStreak, 2);
});

test('SCR-05 progress tracks attempts, best score, best time and hints', () => {
  let p = emptyProgress();
  ({ progress: p } = recordAttempt(p, 'l1', { completed: true, wrongTests: 4, elapsedSeconds: 200 }, '2026-08-01'));
  ({ progress: p } = recordAttempt(p, 'l1', { completed: true, hintsUsed: [1], elapsedSeconds: 90 }, '2026-08-02'));

  const e = p.attempts.l1;
  assert.equal(e.attempts, 2);
  assert.equal(e.bestScore, BASE_SCORE - PENALTY.HINT_1, 'best score keeps the better run');
  assert.equal(e.bestTimeSeconds, 90, 'best time keeps the faster run');
  assert.equal(e.hintsUsed, 1);
  assert.equal(e.completed, true);
  assert.deepEqual(p.lessonsCompleted, ['l1'], 'a lesson is only listed once');
});

test('SCR-05 an incomplete attempt counts as an attempt but earns no XP or streak', () => {
  let p = emptyProgress();
  ({ progress: p } = recordAttempt(p, 'l1', { completed: false, wrongTests: 2 }, '2026-08-01'));
  assert.equal(p.attempts.l1.attempts, 1);
  assert.equal(p.totalXp, 0);
  assert.equal(p.currentStreak, 0);
  assert.deepEqual(p.lessonsCompleted, []);
});

test('SCR-05 replaying a lesson cannot farm XP', () => {
  let p = emptyProgress();
  let gained;
  ({ progress: p, gainedXp: gained } = recordAttempt(p, 'l1', { completed: true }, '2026-08-01'));
  assert.equal(gained, xpForAttempt(BASE_SCORE + BONUS.FIRST_ATTEMPT));

  const afterFirst = p.totalXp;
  ({ progress: p, gainedXp: gained } = recordAttempt(p, 'l1', { completed: true, wrongTests: 3 }, '2026-08-02'));
  assert.equal(gained, 0, 'a worse repeat run awards nothing');
  assert.equal(p.totalXp, afterFirst);
});

test('SCR-05 completion percentage', () => {
  const p = { ...emptyProgress(), lessonsCompleted: ['a', 'b'] };
  assert.equal(completionPercent(p, 5), 40);
  assert.equal(completionPercent(p, 0), 0);
});

// ─── Hints (SCR-01) ──────────────────────────────────────────────────────────

test('SCR-01 hints are graduated and cannot skip ahead', () => {
  const l = lessonById('three-way-source-at-switch');
  assert.equal(nextHint(l, []).level, 1);
  assert.equal(nextHint(l, [1]).level, 2);
  assert.equal(nextHint(l, [1, 2, 3]).level, 4);
  assert.equal(nextHint(l, [1, 2, 3, 4]).level, 5);
  assert.equal(nextHint(l, [1, 2, 3, 4, 5]).exhausted, true);
});

test('SCR-01 level 1 names no terminal; level 5 is the reveal', () => {
  const l = lessonById('three-way-source-at-switch');
  const h1 = nextHint(l, []);
  assert.equal(h1.isReveal, false);
  assert.ok(!/common\s*→|→/.test(h1.text), 'hint 1 must stay conceptual');

  const h5 = nextHint(l, [1, 2, 3, 4]);
  assert.equal(h5.isReveal, true);
  assert.equal(h5.penalty, PENALTY.REVEAL);
});

test('SCR-01 each hint level carries its documented penalty', () => {
  const l = lessonById('single-pole-source-at-switch');
  assert.equal(nextHint(l, []).penalty, PENALTY.HINT_1);
  assert.equal(nextHint(l, [1]).penalty, PENALTY.HINT_2);
  assert.equal(nextHint(l, [1, 2]).penalty, PENALTY.HINT_3);
  assert.equal(nextHint(l, [1, 2, 3]).penalty, PENALTY.HINT_4);
});
