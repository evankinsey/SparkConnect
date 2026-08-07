// ─── BADGE + REPLAY TESTS ────────────────────────────────────────────────────
// Two things worth proving: a badge cannot disagree with the progress record it
// is computed from, and a badge never reads as a credential.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BADGES, badgeById, badgesFor, newlyEarned, BadgeTier, BADGE_DISCLAIMER,
  move, replay, replayAt, turningPoints, MoveKind, MAX_MOVES,
} from '../src/circuit/badges.js';
import { emptyProgress, recordAttempt, BASE_SCORE } from '../src/circuit/scoring.js';

const done = (over = {}) => ({
  attempts: 1, bestScore: 800, bestTimeSeconds: 120, hintsUsed: 0, completed: true, ...over,
});

const progressWith = (attempts, over = {}) => ({
  ...emptyProgress(),
  attempts,
  lessonsCompleted: Object.entries(attempts).filter(([, a]) => a.completed).map(([id]) => id),
  ...over,
});

// ─── Declaration ─────────────────────────────────────────────────────────────

test('every badge is fully declared', () => {
  for (const b of BADGES) {
    assert.ok(b.id && b.title && b.describe && b.icon, `${b.id} incomplete`);
    assert.ok(Object.values(BadgeTier).includes(b.tier), `${b.id} bad tier`);
    assert.equal(typeof b.earned, 'function');
    assert.equal(typeof b.progress, 'function');
  }
  assert.equal(new Set(BADGES.map((b) => b.id)).size, BADGES.length);
  assert.equal(badgeById('first_light').title, 'First Light');
  assert.equal(badgeById('nope'), null);
});

test('a badge never reads as a credential', () => {
  assert.match(BADGE_DISCLAIMER, /not a license or certification/i);
  assert.equal(badgesFor(emptyProgress()).disclaimer, BADGE_DISCLAIMER);
  for (const b of BADGES) {
    assert.doesNotMatch(b.title, /certified|licensed|qualified|master electrician/i, `${b.id} title`);
    assert.doesNotMatch(b.describe, /certified|licensed|qualified to/i, `${b.id} describe`);
  }
});

// ─── Derived, not stored ─────────────────────────────────────────────────────

test('a fresh record has earned nothing and still explains every badge', () => {
  const b = badgesFor(emptyProgress(), { totalLessons: 5 });
  assert.equal(b.earnedCount, 0);
  assert.equal(b.locked.length, b.total);
  for (const row of b.badges) {
    assert.equal(row.earned, false);
    assert.ok(row.need >= 1, `${row.id} has no target`);
    assert.ok(row.percent >= 0 && row.percent <= 100);
  }
  assert.ok(b.nextUp, 'there should always be something to aim at');
});

test('badges follow the record they are computed from', () => {
  const p = progressWith({ 'single-pole-source-at-switch': done() });
  const b = badgesFor(p, { totalLessons: 5 });
  const ids = b.earned.map((x) => x.id);
  assert.ok(ids.includes('first_light'));
  assert.ok(ids.includes('no_hints'), 'completed with zero hints');
  assert.ok(!ids.includes('perfect'), '800 is not a full score');
  assert.ok(!ids.includes('all_lessons'));
});

test('a full-score run earns Clean Sheet', () => {
  const p = progressWith({ l1: done({ bestScore: BASE_SCORE }) });
  assert.ok(badgesFor(p).earned.some((b) => b.id === 'perfect'));
  const partial = badgesFor(progressWith({ l1: done({ bestScore: BASE_SCORE - 1 }) }));
  assert.ok(!partial.earned.some((b) => b.id === 'perfect'));
  assert.equal(partial.badges.find((b) => b.id === 'perfect').percent, 99);
});

test('hints taken block the unassisted badge', () => {
  const p = progressWith({ l1: done({ hintsUsed: 1 }) });
  assert.ok(!badgesFor(p).earned.some((b) => b.id === 'no_hints'));
});

test('three-way needs both source positions, four-way needs the lesson', () => {
  const half = progressWith({ 'three-way-source-at-switch': done() });
  assert.ok(!badgesFor(half).earned.some((b) => b.id === 'three_way'));
  assert.equal(badgesFor(half).badges.find((b) => b.id === 'three_way').have, 1);

  const both = progressWith({
    'three-way-source-at-switch': done(), 'three-way-source-at-light': done(),
  });
  assert.ok(badgesFor(both).earned.some((b) => b.id === 'three_way'));

  const four = progressWith({ 'four-way-three-location': done() });
  assert.ok(badgesFor(four).earned.some((b) => b.id === 'four_way'));
});

test('"every lesson" tracks the catalog rather than a hardcoded number', () => {
  const p = progressWith({ a: done(), b: done(), c: done() });
  assert.ok(badgesFor(p, { totalLessons: 3 }).earned.some((x) => x.id === 'all_lessons'));
  // Add a sixth lesson to the catalog and the badge is not yet earned — but it
  // must not have been "unearned" by storing it either, which is the point.
  assert.ok(!badgesFor(p, { totalLessons: 6 }).earned.some((x) => x.id === 'all_lessons'));
  assert.ok(!badgesFor(p).earned.some((x) => x.id === 'all_lessons'), 'no catalog size means no claim');
});

test('streak badges step up', () => {
  const at = (n) => badgesFor(progressWith({}, { longestStreak: n })).earned.map((b) => b.id);
  assert.ok(!at(2).includes('streak_3'));
  assert.ok(at(3).includes('streak_3'));
  assert.ok(!at(3).includes('streak_7'));
  assert.ok(at(7).includes('streak_7'));
  assert.ok(at(30).includes('streak_30'));
});

test('persistence needs a finish, not just retries', () => {
  const gaveUp = progressWith({ l1: { attempts: 9, bestScore: 0, hintsUsed: 0, completed: false } });
  assert.ok(!badgesFor(gaveUp).earned.some((b) => b.id === 'persistent'));
  const finished = progressWith({ l1: done({ attempts: 3 }) });
  assert.ok(badgesFor(finished).earned.some((b) => b.id === 'persistent'));
});

test('a malformed record locks badges rather than crashing', () => {
  for (const bad of [null, undefined, {}, { attempts: 'nope' }, { attempts: { l1: null } }]) {
    const b = badgesFor(bad);
    assert.ok(b.badges.length === BADGES.length, `failed on ${JSON.stringify(bad)}`);
    assert.equal(b.earnedCount, 0);
  }
});

// ─── Against the real scoring path ───────────────────────────────────────────

test('badges track a real recorded attempt', () => {
  const before = emptyProgress();
  const { progress } = recordAttempt(before, 'single-pole-source-at-switch', {
    completed: true, wrongConnections: 0, hintsUsed: [], elapsedSeconds: 90,
  }, '2026-03-02');

  const gained = newlyEarned(before, progress, { totalLessons: 5 });
  const ids = gained.map((b) => b.id);
  assert.ok(ids.includes('first_light'));
  assert.ok(ids.includes('no_hints'));

  // Recording a second attempt on the same lesson earns nothing new.
  const { progress: again } = recordAttempt(progress, 'single-pole-source-at-switch', {
    completed: true, wrongConnections: 0, hintsUsed: [], elapsedSeconds: 80,
  }, '2026-03-02');
  assert.deepEqual(newlyEarned(progress, again, { totalLessons: 5 }), []);
});

test('newlyEarned is a comparison, so it cannot disagree with the list', () => {
  const before = progressWith({ l1: done() });
  const after = progressWith({ l1: done(), l2: done({ bestScore: BASE_SCORE }) });
  const gained = newlyEarned(before, after);
  const nowEarned = new Set(badgesFor(after).earned.map((b) => b.id));
  for (const g of gained) assert.ok(nowEarned.has(g.id), `${g.id} celebrated but not in the list`);
});

// ─── Replay ──────────────────────────────────────────────────────────────────

test('a replay is a move list, and a bad move is dropped not stored', () => {
  const r = replay({
    lessonId: 'l1', startedAt: 1000,
    moves: [
      { kind: MoveKind.CONNECT, at: 0, from: 'src.hot', to: 'sw1.a', role: 'LINE' },
      { kind: 'NONSENSE', at: 5 },
      { kind: MoveKind.VALIDATE, at: 10, detail: 'NEUTRAL_MISSING' },
    ],
    completed: false,
  });
  assert.equal(r.moves.length, 2, 'an unknown move kind is refused');
  assert.equal(r.durationMs, 10);
  assert.equal(r.completed, false);
  assert.equal(r.truncated, false);
  assert.equal(move({ kind: 'NOPE' }), null);
});

test('a runaway attempt is capped and says so', () => {
  const moves = Array.from({ length: MAX_MOVES + 50 }, (_, i) => ({ kind: MoveKind.TOGGLE, at: i }));
  const r = replay({ lessonId: 'l1', startedAt: 0, moves });
  assert.equal(r.moves.length, MAX_MOVES);
  assert.equal(r.truncated, true);
});

test('the scrubber returns the state at a point in time', () => {
  const r = replay({ lessonId: 'l1', startedAt: 0, moves: [
    { kind: MoveKind.CONNECT, at: 0 }, { kind: MoveKind.CONNECT, at: 10 }, { kind: MoveKind.VALIDATE, at: 20, detail: 'PASS' },
  ] });
  assert.equal(replayAt(r, 0).index, 1);
  assert.equal(replayAt(r, 15).index, 2);
  assert.equal(replayAt(r, 999).done, true);
  assert.equal(replayAt(r, -1).index, 0);
  assert.equal(replayAt(null, 0), null);
});

test('turning points name the move that caused the failure, not the failure', () => {
  const r = replay({ lessonId: 'l1', startedAt: 0, moves: [
    { kind: MoveKind.CONNECT, at: 0, from: 'src.neutral', to: 'sw1.a', role: 'NEUTRAL' },
    { kind: MoveKind.CONNECT, at: 5, from: 'src.hot', to: 'lamp.hot', role: 'LINE' },
    { kind: MoveKind.VALIDATE, at: 10, detail: 'NEUTRAL_SWITCHED' },
    { kind: MoveKind.VALIDATE, at: 20, detail: 'PASS' },
  ] });
  const points = turningPoints(r);
  assert.equal(points.length, 1, 'a passing check is not a turning point');
  assert.equal(points[0].failure, 'NEUTRAL_SWITCHED');
  assert.equal(points[0].causedBy.to, 'lamp.hot', 'the last wire before the check is the suspect');
  assert.deepEqual(turningPoints(null), []);
});
