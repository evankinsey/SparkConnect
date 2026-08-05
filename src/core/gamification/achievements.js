// ─── ACHIEVEMENTS, BADGES, CHALLENGES ────────────────────────────────────────
// Sits on top of the XP/rank system in src/circuit/scoring.js.
//
// Design rule taken from Duolingo's actual lesson, not its surface: streaks work
// because losing one hurts and recovering is possible. Badges that unlock for
// merely opening the app teach nothing and devalue the ones that matter — so
// every achievement here requires a real action.
//
// Nothing in this file may imply certification (SCR-07).

export const AchievementTier = { BRONZE: 'BRONZE', SILVER: 'SILVER', GOLD: 'GOLD' };

export const AchievementCategory = {
  TRAINING: 'TRAINING',
  TOOLS: 'TOOLS',
  BUSINESS: 'BUSINESS',
  CONSISTENCY: 'CONSISTENCY',
  MASTERY: 'MASTERY',
};

/**
 * `check(stats)` is a pure predicate over a stats snapshot. Adding an achievement
 * means adding a row — no other code changes.
 */
export const ACHIEVEMENTS = Object.freeze([
  // Training
  { id: 'first_circuit', title: 'First Circuit', description: 'Complete your first wiring lesson.',
    category: AchievementCategory.TRAINING, tier: AchievementTier.BRONZE, xp: 50,
    check: (s) => s.lessonsCompleted >= 1 },
  { id: 'three_way_master', title: 'Three-Way Master', description: 'Complete both three-way topologies.',
    category: AchievementCategory.TRAINING, tier: AchievementTier.SILVER, xp: 150,
    check: (s) => s.completedLessonIds.includes('three-way-source-at-switch')
               && s.completedLessonIds.includes('three-way-source-at-light') },
  { id: 'four_way_finisher', title: 'Four-Way Finisher', description: 'Complete the four-way lesson.',
    category: AchievementCategory.TRAINING, tier: AchievementTier.SILVER, xp: 200,
    check: (s) => s.completedLessonIds.includes('four-way-three-location') },
  { id: 'no_hints', title: 'No Hints Needed', description: 'Complete a lesson first try with no hints.',
    category: AchievementCategory.MASTERY, tier: AchievementTier.GOLD, xp: 250,
    check: (s) => s.firstAttemptCompletions >= 1 },
  { id: 'perfect_five', title: 'Clean Sweep', description: 'Score 1,000+ on five different lessons.',
    category: AchievementCategory.MASTERY, tier: AchievementTier.GOLD, xp: 400,
    check: (s) => s.lessonsScoredAbove1000 >= 5 },

  // Consistency
  { id: 'streak_3', title: 'Three in a Row', description: 'Practise three days running.',
    category: AchievementCategory.CONSISTENCY, tier: AchievementTier.BRONZE, xp: 50,
    check: (s) => s.longestStreak >= 3 },
  { id: 'streak_7', title: 'Full Week', description: 'Practise seven days running.',
    category: AchievementCategory.CONSISTENCY, tier: AchievementTier.SILVER, xp: 150,
    check: (s) => s.longestStreak >= 7 },
  { id: 'streak_30', title: 'Thirty Days', description: 'Practise thirty days running.',
    category: AchievementCategory.CONSISTENCY, tier: AchievementTier.GOLD, xp: 600,
    check: (s) => s.longestStreak >= 30 },
  { id: 'daily_question_10', title: 'Code Habit', description: 'Answer ten daily code questions.',
    category: AchievementCategory.CONSISTENCY, tier: AchievementTier.BRONZE, xp: 75,
    check: (s) => s.dailyQuestionsAnswered >= 10 },

  // Tools
  { id: 'first_calc', title: 'Field Ready', description: 'Complete your first calculation.',
    category: AchievementCategory.TOOLS, tier: AchievementTier.BRONZE, xp: 25,
    check: (s) => s.calculationsCompleted >= 1 },
  { id: 'calc_50', title: 'Calculator Regular', description: 'Complete fifty calculations.',
    category: AchievementCategory.TOOLS, tier: AchievementTier.SILVER, xp: 150,
    check: (s) => s.calculationsCompleted >= 50 },
  { id: 'toolbox', title: 'Whole Toolbox', description: 'Use five different calculators.',
    category: AchievementCategory.TOOLS, tier: AchievementTier.SILVER, xp: 125,
    check: (s) => s.distinctToolsUsed >= 5 },

  // Business
  { id: 'first_estimate', title: 'First Estimate', description: 'Create your first estimate.',
    category: AchievementCategory.BUSINESS, tier: AchievementTier.BRONZE, xp: 50,
    check: (s) => s.estimatesCreated >= 1 },
  { id: 'first_invoice', title: 'First Invoice', description: 'Create your first invoice.',
    category: AchievementCategory.BUSINESS, tier: AchievementTier.BRONZE, xp: 50,
    check: (s) => s.invoicesCreated >= 1 },
  { id: 'first_paid', title: 'Paid In Full', description: 'Mark your first invoice paid.',
    category: AchievementCategory.BUSINESS, tier: AchievementTier.GOLD, xp: 300,
    check: (s) => s.invoicesPaid >= 1 },
  { id: 'documented', title: 'Documented', description: 'Save twenty-five job photos.',
    category: AchievementCategory.BUSINESS, tier: AchievementTier.SILVER, xp: 125,
    check: (s) => s.photosSaved >= 25 },
]);

export const emptyStats = () => ({
  lessonsCompleted: 0,
  completedLessonIds: [],
  firstAttemptCompletions: 0,
  lessonsScoredAbove1000: 0,
  longestStreak: 0,
  currentStreak: 0,
  dailyQuestionsAnswered: 0,
  calculationsCompleted: 0,
  distinctToolsUsed: 0,
  estimatesCreated: 0,
  invoicesCreated: 0,
  invoicesPaid: 0,
  photosSaved: 0,
});

/**
 * Evaluate every achievement against a stats snapshot.
 * @returns {{unlocked: string[], newlyUnlocked: string[], xpAwarded: number, progress: object[]}}
 */
export const evaluateAchievements = (stats, alreadyUnlocked = []) => {
  const s = { ...emptyStats(), ...stats };
  const unlocked = [];
  const newlyUnlocked = [];
  let xpAwarded = 0;

  for (const a of ACHIEVEMENTS) {
    let passed = false;
    try { passed = !!a.check(s); } catch { passed = false; }
    if (!passed) continue;
    unlocked.push(a.id);
    if (!alreadyUnlocked.includes(a.id)) {
      newlyUnlocked.push(a.id);
      xpAwarded += a.xp;   // awarded once — re-evaluating never re-pays
    }
  }

  return {
    unlocked,
    newlyUnlocked,
    xpAwarded,
    progress: ACHIEVEMENTS.map((a) => ({
      id: a.id, title: a.title, tier: a.tier, category: a.category,
      unlocked: unlocked.includes(a.id),
    })),
  };
};

export const achievementById = (id) => ACHIEVEMENTS.find((a) => a.id === id) ?? null;

// ─── Streaks ─────────────────────────────────────────────────────────────────

const dayNumber = (dateString) => {
  const [y, m, d] = String(dateString).split('-').map(Number);
  if (!y || !m || !d) return NaN;
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
};

/**
 * Streak state including a grace day.
 *
 * A hard reset after one missed day punishes the electrician who worked a
 * fourteen-hour service call — exactly the user this app is for. One grace day
 * keeps the habit without making the streak meaningless.
 */
export const streakState = ({ lastActiveDate, currentStreak = 0, today }) => {
  if (!lastActiveDate) return { status: 'NONE', currentStreak: 0, graceRemaining: 0 };

  const gap = dayNumber(today) - dayNumber(lastActiveDate);
  if (Number.isNaN(gap)) return { status: 'NONE', currentStreak: 0, graceRemaining: 0 };

  if (gap <= 0) return { status: 'ACTIVE_TODAY', currentStreak, graceRemaining: 1 };
  if (gap === 1) return { status: 'ACTIVE', currentStreak, graceRemaining: 1 };
  if (gap === 2) return { status: 'AT_RISK', currentStreak, graceRemaining: 0 };
  return { status: 'BROKEN', currentStreak: 0, graceRemaining: 0, previousStreak: currentStreak };
};

// ─── Monthly challenge ───────────────────────────────────────────────────────

export const monthlyChallenge = (year, month) => {
  const challenges = [
    { id: 'lessons_5', title: 'Complete five wiring lessons', metric: 'lessonsCompleted', target: 5 },
    { id: 'streak_14', title: 'Hold a fourteen-day streak', metric: 'longestStreak', target: 14 },
    { id: 'calc_100', title: 'Complete one hundred calculations', metric: 'calculationsCompleted', target: 100 },
    { id: 'daily_20', title: 'Answer twenty daily code questions', metric: 'dailyQuestionsAnswered', target: 20 },
  ];
  // Deterministic per month, so every user sees the same challenge and it can be
  // talked about — and so it never changes mid-month under someone's feet.
  const index = (year * 12 + month) % challenges.length;
  return { ...challenges[index], year, month, xp: 500 };
};

export const challengeProgress = (challenge, stats) => {
  const value = (stats ?? {})[challenge.metric] ?? 0;
  return {
    ...challenge,
    value,
    complete: value >= challenge.target,
    percent: Math.min(100, Math.round((value / challenge.target) * 100)),
  };
};
