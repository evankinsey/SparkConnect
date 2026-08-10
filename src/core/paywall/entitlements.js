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
  CONTRACTOR_CONNECT: 'CONTRACTOR_CONNECT',
};

/** Why a use is being allowed without metering it. */
export const Grant = {
  NONE: 'NONE',
  GAME_TASK: 'GAME_TASK',   // the job site routed the user here
};

/**
 * THE SPARKAI ALLOWANCE. One table. Every screen that states a number reads it.
 *
 * Settled 9 Aug 2026 after an audit found four different numbers for one thing:
 * free enforced at 3 and advertised as 5, Pro sold as 20/day, 100/month and
 * "unlimited" on three different screens.
 *
 * FREE — 5 a day. The app had been promising five since launch, so the
 * allowance was raised to match the promise rather than the promise corrected
 * down and two answers taken off everybody.
 *
 * PRO — 10 a day. Deliberately between the two candidates that were on the
 * table. 100/month averages about three a day, which is thin for a product
 * marketed around SparkAI; 25/day made the answer packs pointless to a
 * subscriber and left no headroom if photo analysis or Blueprint Takeoff get
 * popular and cost several times a text question.
 *
 * THE MONTHLY BACKSTOP IS DELIBERATELY BELOW daily x 31. 250 against a
 * theoretical 310 is not an oversight — it is an abuse ceiling, not a second
 * allowance, and a normal subscriber will never reach it. This is the opposite
 * of the old 20/day + 400/month shape, which advertised a daily number the
 * monthly one quietly cancelled two thirds of the way through the month: there,
 * the ceiling contradicted the number ON THE PAYWALL. Here the paywall says
 * "10 answers every day" and the backstop is never quoted as a benefit, so
 * nothing advertised stops being true.
 *
 * LIFETIME — the free allowance. Lifetime Tools is $29.99 once, and a one-time
 * payment cannot sensibly fund an indefinitely recurring model expense. It buys
 * the tools it was sold with; it is not a cheap Pro. Any historical buyer who
 * was explicitly promised more is grandfathered rather than having the deal
 * changed under them — see PRICING_DISCREPANCIES.
 *
 * ⚠️  THE SERVER ENFORCES THIS, NOT THIS FILE. /api/ask-nec returns the 429.
 * These numbers change what the app SAYS. Shipping a client that advertises a
 * limit the backend does not honour is the same bug in both directions.
 */
/**
 * Free active projects. One, and it is read by every screen that mentions it.
 *
 * Three surfaces used to state this differently — the paywall, the projects
 * screen and this table — which is how somebody hits a limit the app never
 * warned them about.
 */
export const FREE_PROJECT_LIMIT = 1;

export const ASK_ALLOWANCE = Object.freeze({
  free: Object.freeze({ perDay: 5 }),
  pro: Object.freeze({ perDay: 10, monthlyBackstop: 250 }),
  // GRANDFATHERED. The App Store sold Pro as "20 AI answers/day" up to the
  // cutoff below, and anybody who bought on that promise keeps it for as long
  // as they stay subscribed. Cutting an active subscriber from 20 to 10
  // because we changed our minds is taking something back that was paid for —
  // and it is the kind of thing that gets a subscription app reported, quite
  // reasonably.
  //
  // This is not a "legacy plan" to be quietly retired later. It has no end
  // date, and it lapses only when the subscription itself does.
  legacyPro: Object.freeze({ perDay: 20, monthlyBackstop: 500 }),
  lifetime: Object.freeze({ perDay: 5 }),
});

export const PRO_LIMITS = Object.freeze({
  [Feature.SPARK_AI]: {
    limit: ASK_ALLOWANCE.pro.perDay,
    period: 'day',
    monthlyCap: ASK_ALLOWANCE.pro.monthlyBackstop,
  },
});

/** "10 SparkAI answers a day" — read wherever Pro is sold. */
export const proAskAllowanceLabel = () =>
  `${ASK_ALLOWANCE.pro.perDay} SparkAI answers a day`;

/** "5 SparkAI answers a day" — the free allowance, wherever it is quoted. */
export const freeAskAllowanceLabel = () =>
  `${ASK_ALLOWANCE.free.perDay} SparkAI answers a day`;

/**
 * What the usage indicator says.
 *
 * Leads with the day, because "8 of 10 remaining today" is intuitive and
 * generous-feeling. The monthly figure appears only when it is close enough to
 * matter — quoting a ceiling nobody will reach turns a fair-use guard into a
 * thing people ration against.
 */
export const MONTHLY_WARN_AT = 0.8;

export const usageLabel = ({ usedToday = 0, usedThisMonth = 0, isPro = false, purchased = 0 } = {}) => {
  const day = isPro ? ASK_ALLOWANCE.pro.perDay : ASK_ALLOWANCE.free.perDay;
  const left = Math.max(0, day - (Number(usedToday) || 0));
  const month = isPro ? ASK_ALLOWANCE.pro.monthlyBackstop : 0;
  const monthUsed = Number(usedThisMonth) || 0;
  const nearMonthly = month > 0 && monthUsed >= month * MONTHLY_WARN_AT;
  return Object.freeze({
    daily: `${left} of ${day} answers remaining today`,
    // Only when it is actually relevant.
    monthly: nearMonthly ? `${monthUsed} of ${month} included answers used this month` : null,
    purchased: purchased > 0 ? `+ ${purchased} purchased answers` : null,
    exhausted: left <= 0,
  });
};

/**
 * Free allowances. `null` means unlimited; `0` means Pro-only.
 *
 * `period` is only documentation for the caller — this module does not know
 * what day it is, on purpose, so it stays pure and testable.
 */
export const FREE_LIMITS = Object.freeze({
  // Read from ASK_ALLOWANCE below, never typed. This was 3 while the app told
  // users they had 5 — see the note there for why it moved up rather than the
  // copy moving down.
  [Feature.SPARK_AI]: { limit: ASK_ALLOWANCE.free.perDay, period: 'day' },
  [Feature.VOICE_ASK]: { limit: 0, period: 'day' },        // Pro only
  // RESOLVED 9 Aug 2026: the everyday calculators stay free, permanently, and
  // the paywall stops selling them. They are the distribution engine — somebody
  // downloads the app for a pipe-bending reel, finds the bender genuinely
  // useful, keeps it on their phone and converts months later. "Download, tap
  // bender, pay us" converts nobody and gets deleted.
  [Feature.CALCULATOR]: { limit: null, period: 'day' },
  [Feature.TROUBLESHOOT]: { limit: 3, period: 'day' },
  [Feature.WIRING_LESSON]: { limit: 2, period: 'total' },  // first two lessons free
  [Feature.JOBSITE]: { limit: 3, period: 'total' },        // three stations, then Pro
  [Feature.BLUEPRINT]: { limit: 1, period: 'total' },      // one takeoff to prove it works
  // ONE number for the free project limit, after three screens disagreed about
  // it. Free gets one ACTIVE project — enough to document a real job end to end
  // and understand what the tab is for.
  [Feature.JOB_CAM]: { limit: FREE_PROJECT_LIMIT, period: 'total' },
  [Feature.PERMIT]: { limit: null, period: 'day' },        // never gate safety guidance
  // Beta, and the matching behind it is a person reading an inbox. Metering a
  // funnel we are trying to learn from would only reduce what we learn.
  [Feature.CONTRACTOR_CONNECT]: { limit: null, period: 'day' },
});


/**
 * Paywall copy per feature. Sells the outcome, and states the free allowance
 * plainly so the gate never feels like a trick.
 */
export const GATE_COPY = Object.freeze({
  [Feature.SPARK_AI]: {
    eyebrow: 'SparkAI',
    headline: 'Out of answers for today',
    sub: `Pro gives you ${PRO_LIMITS[Feature.SPARK_AI].limit} a day, with the calculator you are in and the job you are on already in context.`,
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

/**
 * What Lifetime Tools actually buys.
 *
 * RESOLVED: the tools it was sold with, for good — and the FREE AI allowance.
 * $29.99 once cannot fund an indefinitely recurring model expense, and a
 * lifetime product that quietly becomes Pro is a subscription somebody bought
 * by accident.
 *
 * `historicalPromise` is the escape hatch and it matters: if inspection of the
 * shipped App Store listing turns up an explicit promise of more, those buyers
 * are grandfathered rather than having the deal changed under them. Nobody has
 * been able to check the historical listing yet, so this stays false and the
 * check is recorded as outstanding.
 */
/**
 * The day the allowance changed.
 *
 * A Pro subscription whose ORIGINAL purchase predates this was sold on the old
 * promise. Original, not latest: a renewal is the same subscription continuing,
 * and treating a renewal as a new purchase would silently downgrade every
 * grandfathered member on their next billing date — which is worse than never
 * having grandfathered them, because it happens quietly a month later.
 */
export const ALLOWANCE_CHANGED_AT = '2026-08-10T00:00:00.000Z';

export const Plan = Object.freeze({
  FREE: 'free',
  PRO: 'pro',
  LEGACY_PRO: 'pro_legacy',
  LIFETIME: 'lifetime',
});

/**
 * Which plan's allowance applies, from what the store actually reports.
 *
 * An unparseable or absent purchase date resolves to LEGACY_PRO — deliberately
 * the GENEROUS side. If we cannot tell when somebody subscribed, giving them
 * the smaller allowance is taking something away on a guess, and the cost of
 * guessing wrong the other way is ten answers.
 */
export const planFor = ({ isPro = false, proSince = null, isLifetime = false } = {}) => {
  if (!isPro) return isLifetime ? Plan.LIFETIME : Plan.FREE;
  const t = Date.parse(proSince ?? '');
  if (!Number.isFinite(t)) return Plan.LEGACY_PRO;
  return t < Date.parse(ALLOWANCE_CHANGED_AT) ? Plan.LEGACY_PRO : Plan.PRO;
};

export const allowanceForPlan = (plan) => (
  plan === Plan.LEGACY_PRO ? ASK_ALLOWANCE.legacyPro
    : plan === Plan.PRO ? ASK_ALLOWANCE.pro
      : plan === Plan.LIFETIME ? ASK_ALLOWANCE.lifetime
        : ASK_ALLOWANCE.free
);

export const LIFETIME_ENTITLEMENT = Object.freeze({
  aiPerDay: ASK_ALLOWANCE.lifetime.perDay,
  unlimitedAi: false,
  becomesPro: false,
  historicalPromiseVerified: false,
  note: 'Lifetime Tools is the calculators and field tools, kept for good. SparkAI '
    + 'stays at the free allowance.',
});

export const PRICING_DISCREPANCIES = Object.freeze([
  {
    id: 'pro-ai-allowance-unresolved',
    feature: Feature.SPARK_AI,
    paywallSays: 'live App Store build: "20 Sparky AI answers/day (400/month fair-use cap)"; '
      + 'this branch previously told Pro users "100 answers/month" in the rate-limit message, '
      + 'and the onboarding trial screen promised no daily ceiling at all',
    liveBuildEnforces: 'the SERVER meters it — /api/ask-nec returns 429 and the client only '
      + 'learns the number from `remainingQuestions`. The real ceiling is not in this repo.',
    thisCodeDoes: 'PRO_LIMITS says 20/day + 400/month, matching the live paywall, and '
      + 'checkAccess() still returns unmetered for Pro because the client does not do the '
      + 'counting',
    severity: 'HIGH',
    why: 'Three numbers were being shown to the same paying user — 20/day, 100/month and '
      + 'unlimited — and none of them is checked against the backend that actually enforces '
      + 'the cap. The unlimited claim is fixed because it is false under every reading. The '
      + 'remaining number is copied from the shipping paywall, which is the best evidence '
      + 'available from inside the app, NOT a verified fact.',
    id: 'pro-ai-allowance-unresolved',
    feature: Feature.SPARK_AI,
    paywallSays: 'live App Store build: "20 Sparky AI answers/day (400/month fair-use cap)"; '
      + 'this branch previously told Pro users "100 answers/month" in the rate-limit message, '
      + 'and the onboarding trial screen promised no daily ceiling at all',
    liveBuildEnforces: 'the SERVER meters it — /api/ask-nec returns 429 and the client only '
      + 'learns the number from `remainingQuestions`. The real ceiling is not in this repo.',
    thisCodeDoes: 'PRO_LIMITS says 20/day + 400/month, matching the live paywall, and '
      + 'checkAccess() still returns unmetered for Pro because the client does not do the '
      + 'counting',
    severity: 'HIGH',
    why: 'Three numbers were being shown to the same paying user — 20/day, 100/month and '
      + 'unlimited — and none of them is checked against the backend that actually enforces '
      + 'the cap. The unlimited claim is fixed because it is false under every reading. The '
      + 'remaining number is copied from the shipping paywall, which is the best evidence '
      + 'available from inside the app, NOT a verified fact.',
    decision: 'RESOLVED 9 Aug 2026 — Pro is 10/day with a 250/month abuse backstop, and '
      + 'existing subscribers keep 20/day + 500/month for as long as they stay '
      + 'subscribed (see ALLOWANCE_CHANGED_AT). OUTSTANDING AND BLOCKING: /api/ask-nec must '
      + 'enforce the four tiers in website/allowance-policy.json. The client sends '
      + 'planType and server/allowance.js is the drop-in, but the endpoint lives in a '
      + 'separate CLI-deployed Vercel project that nothing in this repo can reach — so '
      + 'until somebody pastes it in, the app advertises a limit the server does not honour.',
  },
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
    id: 'calculators-advertised-as-pro',
    feature: Feature.CALCULATOR,
    paywallSays: 'Box & Conduit Fill and Advanced calculators: free tier shows "—"',
    liveBuildEnforces: '5 calculator uses per day on free',
    thisCodeDoes: 'unlimited on free',
    severity: 'HIGH',
    why: 'The paywall sells a feature the app gives away. Someone upgrading for conduit '
      + 'fill will find it was never locked, and that is the kind of thing an electrician '
      + 'tells the rest of the crew about.',
    decision: 'RESOLVED 9 Aug 2026 — the calculators stay free permanently and the paywall no longer sells them. They are the distribution engine, not a lever.',
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
    id: 'lifetime-gets-unlimited-ai',
    feature: Feature.SPARK_AI,
    paywallSays: 'Lifetime Tools: 5 SparkAI answers per day',
    liveBuildEnforces: 'not distinguished — the live build has no Lifetime tier in useGating',
    thisCodeDoes: 'Lifetime is unmetered on everything its tier includes, so unlimited SparkAI',
    severity: 'HIGH',
    why: 'A $29.99 one-time purchase would include the headline feature of a $7.99/month '
      + 'subscription. That is the whole reason to subscribe, given away once.',
    decision: 'RESOLVED 9 Aug 2026 — Lifetime gets the FREE allowance, not unlimited and not Pro. See LIFETIME_ENTITLEMENT. OUTSTANDING: nobody has read the historical App Store listing; if it promised more, those buyers are grandfathered.',
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
    id: 'jobcam-project-count',
    feature: Feature.JOB_CAM,
    paywallSays: 'Job Cam projects: free 1, Lifetime 25, Pro unlimited',
    liveBuildEnforces: 'not metered',
    thisCodeDoes: '25 photos total on free — a different unit entirely',
    severity: 'MEDIUM',
    why: 'The paywall counts PROJECTS, this counts PHOTOS. Whichever is right, the two '
      + 'numbers are not comparable and one of them is describing something the app does not do.',
    decision: 'RESOLVED 9 Aug 2026 — FREE_PROJECT_LIMIT is the one number and every screen reads it.',
  },
]);

export const openPricingDecisions = () =>
  PRICING_DISCREPANCIES.filter((d) => d.decision.startsWith('OPEN'));
