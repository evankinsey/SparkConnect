// ─── FEATURE FLAG CORE (pure) ────────────────────────────────────────────────
// Requirements: FLG-01 … FLG-13, NNR-11, SIM-18, DOD-09
//
// No storage, no React Native — so the resolution rules that keep money paths
// and unreviewed lessons switched off are directly testable.
// The RN-facing wrapper with persistence is ../featureFlags.js.

/**
 * FLG-12: anything incomplete, unreviewed, or money-touching starts OFF.
 * A flag being `true` here is a claim that the feature is finished, tested,
 * entitlement-gated and safe.
 */
export const DEFAULTS = Object.freeze({
  // Training — the engine is tested, but no lesson has passed electrical review
  // (D-06), so the catalog renders empty regardless. OFF until review lands.
  wiringSimulationsEnabled: false,      // FLG-01
  fourWaySimulationEnabled: false,      // FLG-02
  troubleshootingGamesEnabled: false,   // FLG-03 — lessons not yet built
  challengeModeEnabled: false,          // FLG-04 — needs par times per lesson

  // The isometric job site rebuild. ON by default because the flag exists to
  // switch it OFF fast if a device shows a problem the emulator did not — the
  // old top-down renderer is still in git and this is a one-line revert, which
  // is the whole point of shipping a rewrite behind a flag.
  isoJobsiteEnabled: true,              // FLG-14

  // Payments — no backend exists. Enabling these client-side would violate
  // PAY-04/05/06 and SEC-12.
  stripeConnectEnabled: false,          // FLG-05
  customerPaymentsEnabled: false,       // FLG-06
  platformFeesEnabled: false,           // FLG-07 — also gated by PAY-16

  // Conversion — needs Superwall keys (D-02) before it can be verified.
  roleBasedOnboardingEnabled: false,    // FLG-08
  firstWinPaywallEnabled: false,        // FLG-09
  shareCardsEnabled: false,             // FLG-10

  // Community — needs a server. A community stored on one phone is not a
  // community, so these stay off until src/core/backend exists.
  communityEnabled: false,
  jobsBoardEnabled: false,

  // Theme — safe, reversible, no entitlement or safety surface.
  updatedLightThemeEnabled: true,       // FLG-11

  // ── Contractor Connect (the brief's flags, in this file's naming) ────────
  // CONTRACTOR_CONNECT_ENABLED — the module as a whole. ON: the four intake
  // funnels, verify deep link and saved pile work locally and honestly.
  contractorConnectEnabled: true,
  // LIVE_LICENSE_VERIFICATION_ENABLED — automated reads of a licence source.
  // OFF: DBPR is deep-link-only today (adapters/florida.js says why), and a
  // flag cannot conjure an implementation. Flipping this does nothing until a
  // LIVE adapter exists; it is here so the day one does, the switch is too.
  liveLicenseVerificationEnabled: false,
  // OPPORTUNITY_MARKETPLACE_ENABLED / QUALIFIER_MARKETPLACE_ENABLED — the
  // intake funnels. ON: intake, moderation and local records are complete and
  // tested; matching against OTHER users' records waits on the backend and is
  // stated in-product as manual/brokered.
  opportunityMarketplaceEnabled: true,
  qualifierMarketplaceEnabled: true,
  // INTRODUCTIONS_ENABLED — request-introduction flow (no open messaging).
  introductionsEnabled: true,
  // MATCH_FEES_ENABLED / MARKETPLACE_PAYMENTS_ENABLED — money. Hard-locked
  // off below with the other payment flags: no backend, no charge, and no
  // remote payload may pretend otherwise.
  matchFeesEnabled: false,
  marketplacePaymentsEnabled: false,
  // PERMIT_DATA_ENABLED — automated permit records. OFF: every permit adapter
  // is PLANNED (portal roots only), and this flips when one goes LIVE.
  permitDataEnabled: false,
});

export const FLAG_NAMES = Object.keys(DEFAULTS);

// ─── SOURCE-DATA GATE ────────────────────────────────────────────────────────
//
// A flag can be ON and a feature still not ship, because a second gate sits
// behind it: the tables that feature reads have to have been checked against a
// printed source by a qualified person.
//
// This is separate from the flags on purpose. A flag is a product decision
// ("is this finished?"). This is an evidence decision ("do we know the numbers
// are right?"), and the two must not be able to satisfy each other. Passing
// tests answers the first question and says nothing about the second.
export const isGatedBySourceData = (featureId, { productionBlockers }) =>
  typeof productionBlockers === 'function' && productionBlockers(featureId).length > 0;

/**
 * The real answer to "may this render in production?".
 * Both gates must agree. Either one can hold a feature back on its own.
 */
export const canRenderInProduction = (flagName, featureId, context = {}, verification = null) => {
  const flagOn = resolve(flagName, context);
  if (!flagOn) return { allowed: false, reason: `Feature flag ${flagName} is off.` };
  if (verification && isGatedBySourceData(featureId, verification)) {
    return {
      allowed: false,
      reason: `${featureId} reads source data that has not been checked against a printed source.`,
      blockers: verification.productionBlockers(featureId),
    };
  }
  return { allowed: true, reason: null };
};

/**
 * Flags that must never be forced on by a remote payload or a local override.
 * Payments have no backend (D-01); turning them on cannot make them work, it can
 * only expose a half-wired money path. A compromised or mistaken remote config
 * must not be able to light up a payment flow.
 */
export const HARD_LOCKED_OFF = Object.freeze([
  'stripeConnectEnabled',
  'customerPaymentsEnabled',
  'platformFeesEnabled',
  // Contractor Connect money paths join the lock for the same reason: there
  // is no reviewed backend, so ON cannot make them work — it can only make a
  // screen present a fee nothing can honour.
  'matchFeesEnabled',
  'marketplacePaymentsEnabled',
]);

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** Drops unknown keys and non-boolean values so a malformed payload cannot corrupt state. */
export const sanitize = (source) => {
  if (!isPlainObject(source)) return {};
  const out = {};
  for (const name of FLAG_NAMES) {
    if (typeof source[name] === 'boolean') out[name] = source[name];
  }
  return out;
};

/**
 * Resolve one flag.
 * Precedence: local dev override (dev builds only) → remote kill-switch → default.
 * Hard-locked flags and unknown names always resolve false.
 */
export const resolve = (name, { remote = {}, local = {}, isDev = false } = {}) => {
  if (!FLAG_NAMES.includes(name)) return false;
  if (HARD_LOCKED_OFF.includes(name)) return false;
  if (isDev && typeof local[name] === 'boolean') return local[name];
  if (typeof remote[name] === 'boolean') return remote[name];
  return DEFAULTS[name];
};

export const resolveAll = (context) =>
  Object.fromEntries(FLAG_NAMES.map((name) => [name, resolve(name, context)]));

/**
 * SIM-18 — a lesson's own flag. Combined with the review gate this means a
 * lesson needs BOTH a human approval and an enabled flag to be reachable.
 */
export const isLessonFlagEnabled = (lesson, context) =>
  !!lesson && (!lesson.featureFlag || resolve(lesson.featureFlag, context));
