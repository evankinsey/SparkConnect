// ─── BADGES + REPLAY ─────────────────────────────────────────────────────────
// The rest of the progression spine: what you have earned, and being able to
// watch back what you did.
//
// Badges are DERIVED FROM THE PROGRESS RECORD, never awarded and stored. The
// stored-award version needs a migration every time a badge is added, silently
// keeps badges whose criteria later changed, and drifts out of step with the
// progress it claims to describe. Recomputing from the record costs nothing and
// cannot disagree with it.
//
// The wording matters as much as the mechanics. A badge in a trade app is one
// step away from reading as a credential, and it is not one: nothing here is
// evidence of competence, and every badge ships with the same disclaimer the
// ranks carry. "Wired a three-way from scratch, in a simulator" is the honest
// claim, and it is the one made.
//
// Pure module: no React, no storage.

import { RANK_DISCLAIMER } from './review.js';
import { BASE_SCORE } from './scoring.js';

export const BADGE_DISCLAIMER = RANK_DISCLAIMER;

export const BadgeTier = Object.freeze({ BRONZE: 'BRONZE', SILVER: 'SILVER', GOLD: 'GOLD' });

const attemptsOf = (progress) => progress?.attempts ?? {};
const entries = (progress) => Object.entries(attemptsOf(progress));

/**
 * Every badge, and the exact condition it is earned by.
 *
 * `earned` reads the progress record only. `progress` returns { have, need }
 * so a locked badge can show how far off it is rather than sitting there as a
 * grey square that explains nothing.
 */
export const BADGES = Object.freeze([
  {
    id: 'first_light', title: 'First Light', tier: BadgeTier.BRONZE, icon: 'bulb',
    describe: 'Completed your first simulation.',
    earned: (p) => (p?.lessonsCompleted?.length ?? 0) >= 1,
    progress: (p) => ({ have: Math.min(p?.lessonsCompleted?.length ?? 0, 1), need: 1 }),
  },
  {
    id: 'no_hints', title: 'Unassisted', tier: BadgeTier.SILVER, icon: 'eye-off',
    describe: 'Completed a simulation without taking a hint.',
    earned: (p) => entries(p).some(([, a]) => a.completed && (a.hintsUsed ?? 0) === 0),
    progress: (p) => ({ have: entries(p).filter(([, a]) => a.completed && (a.hintsUsed ?? 0) === 0).length, need: 1 }),
  },
  {
    id: 'perfect', title: 'Clean Sheet', tier: BadgeTier.GOLD, icon: 'checkmark-done',
    describe: 'A full-score run — no wrong connections, no hints.',
    earned: (p) => entries(p).some(([, a]) => (a.bestScore ?? 0) >= BASE_SCORE),
    progress: (p) => ({
      have: Math.max(0, ...entries(p).map(([, a]) => a.bestScore ?? 0)),
      need: BASE_SCORE,
    }),
  },
  {
    id: 'three_way', title: 'Three-Way', tier: BadgeTier.SILVER, icon: 'git-branch',
    describe: 'Wired a three-way from both source positions.',
    earned: (p) => ['three-way-source-at-switch', 'three-way-source-at-light']
      .every((id) => attemptsOf(p)[id]?.completed),
    progress: (p) => ({
      have: ['three-way-source-at-switch', 'three-way-source-at-light']
        .filter((id) => attemptsOf(p)[id]?.completed).length,
      need: 2,
    }),
  },
  {
    id: 'four_way', title: 'Four-Way', tier: BadgeTier.GOLD, icon: 'shuffle',
    describe: 'Wired three switching locations correctly.',
    earned: (p) => !!attemptsOf(p)['four-way-three-location']?.completed,
    progress: (p) => ({ have: attemptsOf(p)['four-way-three-location']?.completed ? 1 : 0, need: 1 }),
  },
  {
    id: 'persistent', title: 'Persistent', tier: BadgeTier.BRONZE, icon: 'refresh',
    describe: 'Came back to a simulation after getting it wrong, and finished it.',
    earned: (p) => entries(p).some(([, a]) => a.completed && (a.attempts ?? 0) >= 3),
    progress: (p) => ({
      have: Math.max(0, ...entries(p).filter(([, a]) => a.completed).map(([, a]) => a.attempts ?? 0)),
      need: 3,
    }),
  },
  {
    id: 'streak_3', title: 'Three Days', tier: BadgeTier.BRONZE, icon: 'flame',
    describe: 'Practised three days running.',
    earned: (p) => (p?.longestStreak ?? 0) >= 3,
    progress: (p) => ({ have: Math.min(p?.longestStreak ?? 0, 3), need: 3 }),
  },
  {
    id: 'streak_7', title: 'A Full Week', tier: BadgeTier.SILVER, icon: 'flame',
    describe: 'Practised seven days running.',
    earned: (p) => (p?.longestStreak ?? 0) >= 7,
    progress: (p) => ({ have: Math.min(p?.longestStreak ?? 0, 7), need: 7 }),
  },
  {
    id: 'streak_30', title: 'A Month', tier: BadgeTier.GOLD, icon: 'flame',
    describe: 'Practised thirty days running.',
    earned: (p) => (p?.longestStreak ?? 0) >= 30,
    progress: (p) => ({ have: Math.min(p?.longestStreak ?? 0, 30), need: 30 }),
  },
  {
    id: 'all_lessons', title: 'Every Lesson', tier: BadgeTier.GOLD, icon: 'trophy',
    describe: 'Completed every simulation in the catalog.',
    // Needs the catalog size, which the caller supplies — a badge that hardcoded
    // "5 lessons" would silently unearn itself the day a sixth was added.
    earned: (p, { totalLessons = 0 } = {}) =>
      totalLessons > 0 && (p?.lessonsCompleted?.length ?? 0) >= totalLessons,
    progress: (p, { totalLessons = 0 } = {}) =>
      ({ have: p?.lessonsCompleted?.length ?? 0, need: totalLessons || 1 }),
  },
  {
    id: 'diagnostician', title: 'Diagnostician', tier: BadgeTier.SILVER, icon: 'search',
    describe: 'Diagnosed ten troubleshooting scenarios correctly.',
    earned: (p) => (p?.scenariosSolved ?? 0) >= 10,
    progress: (p) => ({ have: Math.min(p?.scenariosSolved ?? 0, 10), need: 10 }),
  },
]);

export const badgeById = (id) => BADGES.find((b) => b.id === id) ?? null;

/** Every badge with its current state. Recomputed, never read from storage. */
export const badgesFor = (progress, options = {}) => {
  const rows = BADGES.map((b) => {
    let earned = false;
    let prog = { have: 0, need: 1 };
    try {
      earned = !!b.earned(progress, options);
      prog = b.progress(progress, options) ?? prog;
    } catch { /* a malformed progress record locks the badge, it does not crash */ }

    const have = Number.isFinite(prog.have) ? prog.have : 0;
    const need = Number.isFinite(prog.need) && prog.need > 0 ? prog.need : 1;
    return Object.freeze({
      id: b.id, title: b.title, tier: b.tier, icon: b.icon, describe: b.describe,
      earned,
      have: Math.min(have, need),
      need,
      // A locked badge caps at 99. Rounding 999/1000 gives 100, and a badge
      // reading "100%" while still greyed out is the kind of small lie that
      // makes a user distrust the rest of the screen.
      percent: earned ? 100 : Math.min(99, Math.round((have / need) * 100)),
    });
  });

  const earned = rows.filter((r) => r.earned);
  return Object.freeze({
    badges: Object.freeze(rows),
    earned: Object.freeze(earned),
    locked: Object.freeze(rows.filter((r) => !r.earned)),
    earnedCount: earned.length,
    total: rows.length,
    // The next one within reach, so there is always something to aim at.
    nextUp: Object.freeze([...rows.filter((r) => !r.earned)].sort((a, b) => b.percent - a.percent)[0] ?? null),
    disclaimer: BADGE_DISCLAIMER,
  });
};

/**
 * Badges gained between two progress records.
 *
 * Computed by comparing, rather than by a badge-awarding side effect, so the
 * celebration and the badge list can never disagree about what was earned.
 */
export const newlyEarned = (before, after, options = {}) => {
  const had = new Set(badgesFor(before, options).earned.map((b) => b.id));
  return Object.freeze(badgesFor(after, options).earned.filter((b) => !had.has(b.id)));
};

// ─── Replay ──────────────────────────────────────────────────────────────────

/**
 * A replayable attempt: the moves, in order, with the time each happened.
 *
 * Stored as MOVES rather than as a sequence of full circuit snapshots. A
 * snapshot list is large, and it goes stale the moment a lesson's component ids
 * change — whereas a move list replayed through the same engine either still
 * works or fails loudly, which is the behaviour worth having.
 */
export const MoveKind = Object.freeze({
  CONNECT: 'CONNECT',
  DISCONNECT: 'DISCONNECT',
  TOGGLE: 'TOGGLE',
  HINT: 'HINT',
  VALIDATE: 'VALIDATE',
});

export const MAX_MOVES = 500;

export const move = ({ kind, at, from = null, to = null, role = null, detail = null } = {}) => {
  if (!Object.prototype.hasOwnProperty.call(MoveKind, kind)) return null;
  return Object.freeze({
    kind,
    at: Number.isFinite(at) ? at : 0,
    from, to, role, detail,
  });
};

export const replay = ({ lessonId, startedAt, moves = [], completed = false, score = null } = {}) => {
  const clean = moves.map(move).filter(Boolean).slice(0, MAX_MOVES);
  return Object.freeze({
    lessonId: lessonId ?? null,
    startedAt: Number.isFinite(startedAt) ? startedAt : 0,
    moves: Object.freeze(clean),
    completed: !!completed,
    score: Number.isFinite(score) ? score : null,
    durationMs: clean.length ? clean[clean.length - 1].at : 0,
    truncated: moves.length > MAX_MOVES,
  });
};

/** The state of a replay at time `t`, for a scrubber. */
export const replayAt = (rec, t) => {
  if (!rec) return null;
  const upTo = rec.moves.filter((m) => m.at <= t);
  return Object.freeze({
    index: upTo.length,
    total: rec.moves.length,
    moves: Object.freeze(upTo),
    current: upTo[upTo.length - 1] ?? null,
    done: upTo.length === rec.moves.length,
  });
};

/**
 * Where the attempt went wrong, in the user's own move list.
 *
 * The interesting moment is not the failed validation — it is the move that
 * made it fail. This finds the last connection made before each failed check,
 * which is what a person actually wants to see when they scrub back.
 */
export const turningPoints = (rec) => {
  if (!rec) return [];
  const out = [];
  let lastConnect = null;
  for (const m of rec.moves) {
    if (m.kind === MoveKind.CONNECT || m.kind === MoveKind.DISCONNECT) lastConnect = m;
    if (m.kind === MoveKind.VALIDATE && m.detail && m.detail !== 'PASS' && lastConnect) {
      out.push(Object.freeze({ at: m.at, failure: m.detail, causedBy: lastConnect }));
    }
  }
  return Object.freeze(out);
};

export { BASE_SCORE };
