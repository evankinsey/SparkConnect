// ─── ENTITLEMENTS ────────────────────────────────────────────────────────────
// One place that decides what a free user can do, so a limit can never be
// enforced in three screens with three different numbers.
//
// Three rules shape this file.
//
// 1. FREE HAS TO BE WORTH USING. A free tier that stops you before you have
//    understood the app does not convert, it uninstalls. Every gate below lets
//    you finish at least one real thing first.
//
// 2. THE GAME GETS A PASS. If the job site sent you to the voltage drop
//    calculator, that use is the game, not a calculator session — charging it
//    against the daily cap would let a free player get walled mid-task by a
//    tool the app itself just told them to open. `Grant.GAME_TASK` says "this
//    came from a station" and skips the meter.
//
// 3. A LOCKED FEATURE MUST SAY WHAT IT IS. Every gate carries the copy for its
//    own paywall, so the user always learns what they would get rather than
//    just being stopped.
//
// Pure module: no React, no storage, no RevenueCat. The caller owns counting.

export const Feature = {
  SPARK_AI: 'SPARK_AI',
  VOICE_ASK: 'VOICE_ASK',
  CALCULATOR: 'CALCULATOR',
  TROUBLESHOOT: 'TROUBLESHOOT',
  WIRING_LESSON: 'WIRING_LESSON',
  JOBSITE: 'JOBSITE',
  BLUEPRINT: 'BLUEPRINT',
  JOB_CAM: 'JOB_CAM',
  PERMIT: 'PERMIT',
};

/** Why a use is being allowed without metering it. */
export const Grant = {
  NONE: 'NONE',
  GAME_TASK: 'GAME_TASK',   // the job site routed the user here
};

/**
 * Free allowances. `null` means unlimited; `0` means Pro-only.
 *
 * `period` is only documentation for the caller — this module does not know
 * what day it is, on purpose, so it stays pure and testable.
 */
export const FREE_LIMITS = Object.freeze({
  [Feature.SPARK_AI]: { limit: 5, period: 'day' },
  [Feature.VOICE_ASK]: { limit: 0, period: 'day' },        // Pro only
  [Feature.CALCULATOR]: { limit: null, period: 'day' },    // never gate the core tools
  [Feature.TROUBLESHOOT]: { limit: 3, period: 'day' },
  [Feature.WIRING_LESSON]: { limit: 2, period: 'total' },  // first two lessons free
  [Feature.JOBSITE]: { limit: 3, period: 'total' },        // three stations, then Pro
  [Feature.BLUEPRINT]: { limit: 1, period: 'total' },      // one takeoff to prove it works
  [Feature.JOB_CAM]: { limit: 25, period: 'total' },
  [Feature.PERMIT]: { limit: null, period: 'day' },        // never gate safety guidance
});

/**
 * Paywall copy per feature. Sells the outcome, and states the free allowance
 * plainly so the gate never feels like a trick.
 */
export const GATE_COPY = Object.freeze({
  [Feature.SPARK_AI]: {
    eyebrow: 'SparkAI',
    headline: 'Out of answers for today',
    sub: 'Pro gives you 20 a day, with the calculator you are in and the job you are on already in context.',
  },
  [Feature.VOICE_ASK]: {
    eyebrow: 'Hands-free',
    headline: 'Ask with your hands full',
    sub: 'Hold the mic, ask the question, hear the answer back. Pro only — reading answers aloud stays free.',
  },
  [Feature.TROUBLESHOOT]: {
    eyebrow: 'Troubleshooting',
    headline: 'Keep working the calls',
    sub: 'Three service calls a day free. Pro opens every scenario, every fault type, no daily cap.',
  },
  [Feature.WIRING_LESSON]: {
    eyebrow: 'Wiring Simulator',
    headline: 'Wire it wrong here, not on the job',
    sub: 'The first two lessons are free. Pro opens three-way, four-way and every lesson after.',
  },
  [Feature.JOBSITE]: {
    eyebrow: 'Job Site',
    headline: 'Finish the whole site',
    sub: 'Three stations free. Pro opens the full crew, every task, and the campaigns as they land.',
  },
  [Feature.BLUEPRINT]: {
    eyebrow: 'Blueprint Takeoff',
    headline: 'Stop counting symbols by hand',
    sub: 'One takeoff free so you can see it work. Pro is unlimited sheets, straight into a material list.',
  },
  [Feature.JOB_CAM]: {
    eyebrow: 'Job Cam',
    headline: 'Save thousands documenting every job',
    sub: '25 projects free. Pro is unlimited, with your branding on every export.',
  },
});

export const gateCopyFor = (feature) => GATE_COPY[feature] ?? GATE_COPY[Feature.SPARK_AI];

/**
 * The single decision point.
 *
 * @param feature   one of Feature
 * @param opts.isPro       live entitlement from RevenueCat
 * @param opts.used        how many the caller has counted so far
 * @param opts.grant       Grant.GAME_TASK when the job site routed them here
 * @returns {{allowed, reason, remaining, limit, meter, copy?}}
 *          `meter` is whether the caller should count this use. A granted or
 *          unlimited use is allowed WITHOUT metering, which is what keeps the
 *          game from burning a free user's daily allowance.
 */
export const checkAccess = (feature, { isPro = false, used = 0, grant = Grant.NONE } = {}) => {
  const rule = FREE_LIMITS[feature];
  if (!rule) return { allowed: true, reason: 'unmetered', remaining: null, limit: null, meter: false };

  if (isPro) {
    return { allowed: true, reason: 'pro', remaining: null, limit: null, meter: false };
  }

  // Rule 2. The job site sent them here, so this is the game running, not a
  // second helping of a metered tool.
  if (grant === Grant.GAME_TASK) {
    return { allowed: true, reason: 'game_task', remaining: null, limit: rule.limit, meter: false };
  }

  if (rule.limit === null) {
    return { allowed: true, reason: 'free_unlimited', remaining: null, limit: null, meter: false };
  }

  const safeUsed = Number.isFinite(used) && used > 0 ? Math.floor(used) : 0;
  const remaining = Math.max(0, rule.limit - safeUsed);

  if (rule.limit === 0) {
    return { allowed: false, reason: 'pro_only', remaining: 0, limit: 0, meter: false, copy: gateCopyFor(feature) };
  }
  if (remaining <= 0) {
    return { allowed: false, reason: 'limit_reached', remaining: 0, limit: rule.limit, meter: false, copy: gateCopyFor(feature) };
  }
  return { allowed: true, reason: 'within_free', remaining, limit: rule.limit, meter: true };
};

/**
 * "2 of 3 service calls left today" — shown BEFORE the wall, not after it.
 * Returns null when there is nothing worth saying (Pro, or unlimited).
 */
export const remainingLabel = (feature, { isPro = false, used = 0 } = {}) => {
  const a = checkAccess(feature, { isPro, used });
  if (a.remaining === null || a.limit === null || a.limit === 0) return null;
  return `${a.remaining} of ${a.limit} left`;
};

/** Everything a free user gets, for the paywall's comparison strip. */
export const freeTierSummary = () =>
  Object.entries(FREE_LIMITS)
    .filter(([, r]) => r.limit !== null)
    .map(([feature, r]) => ({
      feature,
      limit: r.limit,
      period: r.period,
      proOnly: r.limit === 0,
    }));
