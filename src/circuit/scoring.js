// ─── SCORING, HINTS, XP, RANKS ───────────────────────────────────────────────
// Requirements: SCR-01 … SCR-07, TST-02
// Pure functions — no storage, no React. The caller persists the result.

import { RANK_DISCLAIMER } from './review.js';

// SCR-02 — exact values from the brief (L1270–1280).
export const BASE_SCORE = 1000;
export const PENALTY = {
  WRONG_TEST: 100,
  HINT_1: 25,
  HINT_2: 50,
  HINT_3: 75,
  HINT_4: 100,
  REVEAL: 200,   // hint level 5
  RESET: 50,
};
export const BONUS = {
  FAST_COMPLETION_MAX: 200,
  FIRST_ATTEMPT: 150,
};
export const MIN_SCORE = 0;

const HINT_PENALTY_BY_LEVEL = {
  1: PENALTY.HINT_1,
  2: PENALTY.HINT_2,
  3: PENALTY.HINT_3,
  4: PENALTY.HINT_4,
  5: PENALTY.REVEAL,
};

// SCR-03 — Learn Mode has no timer and no time pressure (SCR-04).
export const TimerMode = {
  LEARN: 'LEARN',
  PRACTICE: 'PRACTICE',
  CHALLENGE: 'CHALLENGE',
};

/**
 * Score one attempt.
 *
 * @param {object} a
 * @param {number} a.wrongTests      failed "Test Circuit" presses
 * @param {number[]} a.hintsUsed     hint levels revealed, e.g. [1,2]
 * @param {number} a.resets
 * @param {boolean} a.completed
 * @param {number} [a.elapsedSeconds]
 * @param {number} [a.parSeconds]    lesson par time; omit to skip the time bonus
 * @param {string} [a.timerMode]
 * @returns {{score, breakdown, firstAttempt, cappedAtMinimum}}
 */
export const scoreAttempt = ({
  wrongTests = 0,
  hintsUsed = [],
  resets = 0,
  completed = false,
  elapsedSeconds = null,
  parSeconds = null,
  timerMode = TimerMode.LEARN,
} = {}) => {
  const wrongPenalty = wrongTests * PENALTY.WRONG_TEST;
  // Each hint level is charged once, however many times it is re-read.
  const uniqueHints = [...new Set(hintsUsed)].sort((a, b) => a - b);
  const hintPenalty = uniqueHints.reduce((sum, lvl) => sum + (HINT_PENALTY_BY_LEVEL[lvl] ?? 0), 0);
  const resetPenalty = resets * PENALTY.RESET;

  const firstAttempt = completed && wrongTests === 0 && uniqueHints.length === 0 && resets === 0;
  const firstAttemptBonus = firstAttempt ? BONUS.FIRST_ATTEMPT : 0;

  // SCR-04 — Learn Mode never awards or withholds a time bonus, so the default
  // experience carries no clock pressure.
  let timeBonus = 0;
  if (completed && timerMode !== TimerMode.LEARN &&
      Number.isFinite(elapsedSeconds) && Number.isFinite(parSeconds) && parSeconds > 0) {
    const ratio = Math.max(0, Math.min(1, (parSeconds - elapsedSeconds) / parSeconds));
    timeBonus = Math.round(ratio * BONUS.FAST_COMPLETION_MAX);
  }

  const raw = BASE_SCORE - wrongPenalty - hintPenalty - resetPenalty + firstAttemptBonus + timeBonus;
  const score = Math.max(MIN_SCORE, raw);

  return {
    score,
    firstAttempt,
    cappedAtMinimum: raw < MIN_SCORE,
    breakdown: {
      base: BASE_SCORE,
      wrongTests: -wrongPenalty,
      hints: -hintPenalty,
      resets: -resetPenalty,
      firstAttemptBonus,
      timeBonus,
      raw,
    },
  };
};

// ─── XP and ranks (SCR-05, SCR-06, SCR-07) ───────────────────────────────────

// XP is score-derived so a careless completion is worth less than a clean one.
export const xpForAttempt = (score) => Math.max(0, Math.round(score / 10));

export const RANKS = [
  { id: 'helper', title: 'Helper', minXp: 0 },
  { id: 'apprentice_1', title: 'First-Year Apprentice', minXp: 500 },
  { id: 'apprentice_2', title: 'Second-Year Apprentice', minXp: 1500 },
  { id: 'apprentice_3', title: 'Third-Year Apprentice', minXp: 3000 },
  { id: 'apprentice_4', title: 'Fourth-Year Apprentice', minXp: 5000 },
  { id: 'journeyman_candidate', title: 'Journeyman Candidate', minXp: 8000 },
  { id: 'field_troubleshooter', title: 'Field Troubleshooter', minXp: 12000 },
];

/** SCR-06/SCR-07 — always returns the disclaimer alongside the rank. */
export const rankForXp = (xp = 0) => {
  const safeXp = Number.isFinite(xp) && xp > 0 ? xp : 0;
  let current = RANKS[0];
  for (const r of RANKS) if (safeXp >= r.minXp) current = r;
  const next = RANKS.find((r) => r.minXp > safeXp) ?? null;
  return {
    ...current,
    xp: safeXp,
    next,
    xpToNext: next ? next.minXp - safeXp : 0,
    progressToNext: next
      ? (safeXp - current.minXp) / (next.minXp - current.minXp)
      : 1,
    disclaimer: RANK_DISCLAIMER,
  };
};

// ─── Progress record (SCR-05) ────────────────────────────────────────────────

export const emptyProgress = () => ({
  lessonsCompleted: [],
  attempts: {},        // lessonId -> { attempts, bestScore, bestTimeSeconds, hintsUsed, completed }
  totalXp: 0,
  currentStreak: 0,
  longestStreak: 0,
  lastCompletedDate: null,
});

const dayString = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/**
 * Fold one attempt into a progress record. Pure: returns a new object.
 * `today` is injectable so streak behaviour is testable (TST-02).
 */
export const recordAttempt = (progress, lessonId, attempt, today = dayString()) => {
  const p = progress ?? emptyProgress();
  const prev = p.attempts[lessonId] ?? {
    attempts: 0, bestScore: 0, bestTimeSeconds: null, hintsUsed: 0, completed: false,
  };

  const result = scoreAttempt(attempt);
  const completed = !!attempt.completed;

  const entry = {
    attempts: prev.attempts + 1,
    bestScore: Math.max(prev.bestScore, completed ? result.score : 0),
    bestTimeSeconds: completed && Number.isFinite(attempt.elapsedSeconds)
      ? (prev.bestTimeSeconds === null ? attempt.elapsedSeconds : Math.min(prev.bestTimeSeconds, attempt.elapsedSeconds))
      : prev.bestTimeSeconds,
    hintsUsed: prev.hintsUsed + [...new Set(attempt.hintsUsed ?? [])].length,
    completed: prev.completed || completed,
  };

  const lessonsCompleted = completed && !p.lessonsCompleted.includes(lessonId)
    ? [...p.lessonsCompleted, lessonId]
    : p.lessonsCompleted;

  // XP is only awarded for a completion, and only for the improvement over the
  // previous best — so replaying an easy lesson cannot farm rank.
  const gainedXp = completed ? Math.max(0, xpForAttempt(result.score) - xpForAttempt(prev.bestScore)) : 0;

  let { currentStreak, longestStreak, lastCompletedDate } = p;
  if (completed) {
    if (lastCompletedDate === today) {
      // already counted today
    } else {
      const yesterday = dayString(new Date(new Date(`${today}T12:00:00`).getTime() - 86400000));
      currentStreak = lastCompletedDate === yesterday ? currentStreak + 1 : 1;
      longestStreak = Math.max(longestStreak, currentStreak);
      lastCompletedDate = today;
    }
  }

  return {
    progress: {
      ...p,
      lessonsCompleted,
      attempts: { ...p.attempts, [lessonId]: entry },
      totalXp: p.totalXp + gainedXp,
      currentStreak,
      longestStreak,
      lastCompletedDate,
    },
    result,
    gainedXp,
  };
};

export const completionPercent = (progress, totalLessons) => {
  if (!totalLessons) return 0;
  return Math.round(((progress?.lessonsCompleted?.length ?? 0) / totalLessons) * 100);
};

// ─── Hints (SCR-01) ──────────────────────────────────────────────────────────

export const MAX_HINT_LEVEL = 5;

/**
 * Next hint, refusing to skip ahead. Level 5 is the reveal.
 * Once the reveal has been taken there is nothing left to charge for, so further
 * requests come back exhausted with a zero penalty.
 */
export const nextHint = (lesson, hintsUsed = []) => {
  const highest = hintsUsed.length ? Math.max(...hintsUsed) : 0;
  if (highest >= MAX_HINT_LEVEL) {
    const reveal = lesson.hintSteps.find((h) => h.level === MAX_HINT_LEVEL) ?? null;
    return {
      level: MAX_HINT_LEVEL,
      text: reveal ? reveal.text : null,
      penalty: 0,
      isReveal: true,
      exhausted: true,
    };
  }
  const level = highest + 1;
  const step = lesson.hintSteps.find((h) => h.level === level) ?? null;
  return step
    ? { ...step, penalty: HINT_PENALTY_BY_LEVEL[level], isReveal: level === MAX_HINT_LEVEL, exhausted: false }
    : { level, text: null, penalty: 0, isReveal: level === MAX_HINT_LEVEL, exhausted: true };
};

export { HINT_PENALTY_BY_LEVEL, dayString };
