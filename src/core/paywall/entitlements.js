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
  // 3, not 5. The build on the App Store enforces `LIMITS = { sparky: 3 }` in
  // useGating.js and its paywall advertises "3/day" — this file had invented a
  // different number that never shipped. Matching the live build is not a
  // tightening: no user has ever had 5, and the paywall would have been calling
  // the app a liar in front of a paying customer.
  [Feature.SPARK_AI]: { limit: 3, period: 'day' },
  [Feature.VOICE_ASK]: { limit: 0, period: 'day' },        // Pro only
  // The live build meters calculators at 5/day; the live paywall lists "Box &
  // Conduit Fill" and "Advanced calculators" as Pro-only. Those two disagree
  // with each other, and this file made a third choice. Left unlimited on
  // purpose pending a decision — see PRICING_DISCREPANCIES below — because
  // whichever way it resolves is a pricing call, not a code cleanup.
  [Feature.CALCULATOR]: { limit: null, period: 'day' },
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

// ─── Known discrepancies between the paywall and the gates ───────────────────
//
// Read off the shipping build on 2026-08-07: its paywall screenshot, and the
// limits `src/useGating.js` actually enforces. These three sources have been
// disagreeing, and the disagreements are recorded here rather than silently
// resolved, because every one of them is a pricing decision.
//
// In every case the CODE IS MORE GENEROUS than the paywall advertises. Nobody
// has been short-changed. The risk runs the other way: a customer who pays for
// something and then finds it was free is a refund and a bad review, and a
// one-time purchase that quietly includes the subscription's headline feature
// is a hole in the revenue model.

export const PRICING_DISCREPANCIES = Object.freeze([
  {
    id: 'calculators-advertised-as-pro',
    feature: Feature.CALCULATOR,
    paywallSays: 'Box & Conduit Fill and Advanced calculators: free tier shows "—"',
    liveBuildEnforces: '5 calculator uses per day on free',
    thisCodeDoes: 'unlimited on free',
    severity: 'HIGH',
    why: 'The paywall sells a feature the app gives away. Someone upgrading for conduit '
      + 'fill will find it was never locked, and that is the kind of thing an electrician '
      + 'tells the rest of the crew about.',
    decision: 'OPEN — either lock calculators to match the paywall, or redraw the paywall '
      + 'to stop selling them. Not a code cleanup either way.',
  },
  {
    id: 'lifetime-gets-unlimited-ai',
    feature: Feature.SPARK_AI,
    paywallSays: 'Lifetime Tools: 5 SparkAI answers per day',
    liveBuildEnforces: 'not distinguished — the live build has no Lifetime tier in useGating',
    thisCodeDoes: 'Lifetime is unmetered on everything its tier includes, so unlimited SparkAI',
    severity: 'HIGH',
    why: 'A $29.99 one-time purchase would include the headline feature of a $7.99/month '
      + 'subscription. That is the whole reason to subscribe, given away once.',
    decision: 'OPEN — Lifetime needs its own metered allowance (5/day per the paywall) '
      + 'rather than inheriting the unmetered path.',
  },
  {
    id: 'jobcam-project-count',
    feature: Feature.JOB_CAM,
    paywallSays: 'Job Cam projects: free 1, Lifetime 25, Pro unlimited',
    liveBuildEnforces: 'not metered',
    thisCodeDoes: '25 photos total on free — a different unit entirely',
    severity: 'MEDIUM',
    why: 'The paywall counts PROJECTS, this counts PHOTOS. Whichever is right, the two '
      + 'numbers are not comparable and one of them is describing something the app does not do.',
    decision: 'OPEN — pick a unit, then make the paywall and the gate use the same one.',
  },
]);

export const openPricingDecisions = () =>
  PRICING_DISCREPANCIES.filter((d) => d.decision.startsWith('OPEN'));
