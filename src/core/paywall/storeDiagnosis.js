// ─── WHY THE STORE RETURNED NOTHING ──────────────────────────────────────────
// Turning a purchase failure into a name and a next step.
//
// THE OBSERVATION THIS EXISTS FOR: build 27 on TestFlight shows "Purchase
// failed — this product could not be loaded from the App Store. Please try
// again." for EVERY product, while the App Store build sells the same products
// to the same account without trouble. Retrying could never have worked. The
// message named nothing, so there was nothing to act on, and two days went into
// guessing between five candidate causes.
//
// The causes are genuinely different problems with genuinely different fixes,
// and — this is the point — THEY ARE DISTINGUISHABLE FROM THE CLIENT if anyone
// bothers to record the three facts that separate them:
//
//   1. did configure() run at all
//   2. which identifiers were asked for, and which came back
//   3. the RevenueCat error CODE (not the message — the message is localised
//      prose, the code is the diagnosis)
//
// SOME came back  → the missing ones do not exist under those identifiers.
// NONE came back  → the request never reached a working store connection, and
//                   that is an account/agreement/bundle problem, never a typo
//                   in one product id.
//
// That distinction is the whole module. A partial result and an empty result
// look identical to a user and mean opposite things to whoever has to fix it.
//
// Pure module: no React, no network, no SDK import. `purchases.js` collects the
// facts, this decides what they mean, and a screen renders it.

/**
 * RevenueCat's error codes, by number.
 *
 * Kept as our own table rather than imported from the SDK, because this module
 * must stay importable in a test environment where react-native-purchases does
 * not load. The numbers are RevenueCat's PURCHASES_ERROR_CODE and are stable.
 */
export const RcErrorCode = Object.freeze({
  UNKNOWN: 0,
  PURCHASE_CANCELLED: 1,
  STORE_PROBLEM: 2,
  PURCHASE_NOT_ALLOWED: 3,
  PURCHASE_INVALID: 4,
  PRODUCT_NOT_AVAILABLE_FOR_PURCHASE: 5,
  PRODUCT_ALREADY_PURCHASED: 6,
  RECEIPT_ALREADY_IN_USE: 7,
  INVALID_RECEIPT: 8,
  MISSING_RECEIPT_FILE: 9,
  NETWORK: 10,
  INVALID_CREDENTIALS: 11,
  UNEXPECTED_BACKEND_RESPONSE: 12,
  INVALID_APP_USER_ID: 14,
  OPERATION_ALREADY_IN_PROGRESS: 15,
  UNKNOWN_BACKEND: 16,
  INVALID_APPLE_SUBSCRIPTION_KEY: 17,
  INELIGIBLE_ERROR: 18,
  INSUFFICIENT_PERMISSIONS: 19,
  PAYMENT_PENDING: 20,
  INVALID_SUBSCRIBER_ATTRIBUTES: 21,
  LOG_OUT_ANONYMOUS_USER: 22,
  CONFIGURATION: 23,
  UNSUPPORTED: 24,
  EMPTY_SUBSCRIBER_ATTRIBUTES: 25,
  CUSTOMER_INFO_ERROR: 28,
});

/**
 * The causes, in the order they should be checked.
 *
 * Each carries what a person sees, what an engineer does about it, and whether
 * it is our fault. `fixIsOutsideTheApp` matters: shipping a new build cannot
 * repair an App Store Connect agreement, and saying so stops somebody burning a
 * release cycle on it.
 */
export const Cause = Object.freeze({
  SDK_ABSENT: 'SDK_ABSENT',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  BAD_API_KEY: 'BAD_API_KEY',
  NO_STORE_CONNECTION: 'NO_STORE_CONNECTION',
  AGREEMENT_OR_BUNDLE: 'AGREEMENT_OR_BUNDLE',
  INCONCLUSIVE: 'INCONCLUSIVE',
  OFFERING_EMPTY: 'OFFERING_EMPTY',
  IDENTIFIER_MISSING: 'IDENTIFIER_MISSING',
  PURCHASE_NOT_ALLOWED: 'PURCHASE_NOT_ALLOWED',
  ALREADY_OWNED: 'ALREADY_OWNED',
  HEALTHY: 'HEALTHY',
});

/**
 * The causes where we have POSITIVE EVIDENCE that a tap cannot succeed, and so
 * are entitled to disable a button before anybody presses it.
 *
 * Everything not in this set — most importantly INCONCLUSIVE — leaves the
 * button live. Build 29 greyed out all three answer packs on TestFlight for
 * products the App Store build sells to the same account every day, purely
 * because one getProducts call resolved empty and the SDK reported no error.
 * An empty list with no error code is an absence of evidence, and disabling a
 * working purchase on it is a worse bug than the one the preflight was added
 * to catch: an honest error after a tap costs a tap, a wrongly dead paywall
 * costs the sale and looks like a broken app.
 */
export const BLOCKING_CAUSES = Object.freeze([
  Cause.SDK_ABSENT,           // the SDK is not in this build: literally cannot buy
  Cause.PURCHASE_NOT_ALLOWED, // the device itself refuses purchases
  Cause.IDENTIFIER_MISSING,   // other products came back; this one did not
]);

// BAD_API_KEY, AGREEMENT_OR_BUNDLE and OFFERING_EMPTY were on that list and are
// deliberately off it now.
//
// Build 32 greyed out every plan on TestFlight with "Purchases are temporarily
// unavailable", on an account that buys the same products from the App Store
// build without trouble. The cause was a credentials error raised by a PREFLIGHT
// call in the StoreKit sandbox — an environment that routinely reports
// configuration problems that do not exist in production.
//
// That is the build 29 mistake again, one cause over, and I made it while
// fixing build 29. The rule was already written at the top of this list and I
// applied it too narrowly: an error from a preflight is a report about the
// preflight, not proof that a purchase would fail. Only three things here are
// certain enough to disable a button before it is pressed — no SDK at all, a
// device that refuses purchases, and a product the store returned others
// alongside but not this one.
//
// Everything else lets the tap through and lets the REAL purchase attempt
// produce the real error, which is both more accurate and recoverable.

const DIAGNOSES = Object.freeze({
  [Cause.SDK_ABSENT]: {
    headline: 'Purchases are not available in this build.',
    userMessage: 'Purchases need the App Store version of the app on a real device.',
    engineerAction: 'react-native-purchases did not load. Expected in Expo Go, the web '
      + 'preview and tests; a problem anywhere else.',
    fixIsOutsideTheApp: false,
  },
  [Cause.NOT_CONFIGURED]: {
    headline: 'The billing SDK was never configured.',
    userMessage: 'Something went wrong setting up purchases. Reopening the app usually fixes it.',
    engineerAction: 'initPurchases() did not run, or threw before configure(). Check the '
      + 'mount effect in App.js and that the API key constant is non-empty.',
    fixIsOutsideTheApp: false,
  },
  [Cause.BAD_API_KEY]: {
    headline: 'The RevenueCat key is wrong for this platform or app.',
    userMessage: 'Purchases are temporarily unavailable. Nothing has been charged.',
    engineerAction: 'RevenueCat rejected the credentials. Confirm the iOS key starts with '
      + 'appl_ and belongs to the same RevenueCat project as this bundle identifier.',
    fixIsOutsideTheApp: false,
  },
  [Cause.NO_STORE_CONNECTION]: {
    headline: 'The device could not reach the App Store.',
    userMessage: 'Could not reach the App Store. Check your connection and try again.',
    engineerAction: 'Transient. This is the one case where retrying is honest advice.',
    fixIsOutsideTheApp: false,
  },
  [Cause.AGREEMENT_OR_BUNDLE]: {
    // The one that actually explains "every product fails at once".
    headline: 'The store returned no products at all.',
    userMessage: 'Purchases are temporarily unavailable. Nothing has been charged, and '
      + 'anything you have already bought is safe — use Restore Purchases.',
    engineerAction: 'NOT a product-identifier problem: a wrong identifier is dropped '
      + 'individually, so an empty result means the request never reached a working store '
      + 'connection. Check, in this order: (1) the Paid Applications agreement is active '
      + 'and its bank/tax details have not lapsed; (2) this build\'s bundle identifier '
      + 'matches the app that owns the products; (3) the device is signed into a sandbox '
      + 'tester account under Settings → Developer; (4) the products are not all still in '
      + '"Missing Metadata" in App Store Connect.',
    fixIsOutsideTheApp: true,
  },
  [Cause.INCONCLUSIVE]: {
    // What an empty result with no error code ACTUALLY supports.
    headline: 'The store check came back empty without saying why.',
    userMessage: null, // nothing certain enough to put in front of a buyer
    engineerAction: 'Not a verdict. getProducts resolved with an empty array and the SDK '
      + 'raised no error, which is what a genuine agreement problem looks like AND what a '
      + 'store connection that has not warmed up yet looks like. Buttons stay live. If a '
      + 'purchase is then attempted, the error code from that attempt is the real diagnosis '
      + '— check it before touching App Store Connect.',
    fixIsOutsideTheApp: false,
  },
  [Cause.OFFERING_EMPTY]: {
    // Subscriptions and one-time products come from two different places, and
    // this is the one that says WHICH is broken.
    headline: 'The subscription offering is empty, but the store is answering.',
    userMessage: 'Subscriptions are temporarily unavailable. One-time purchases on this screen '
      + 'still work, and nothing has been charged.',
    engineerAction: 'One-time products loaded, so the store connection and the agreement are '
      + 'fine. The current Offering in the RevenueCat dashboard has no packages, or no Offering '
      + 'is marked current for this app. Fix it in RevenueCat — no build required.',
    fixIsOutsideTheApp: true,
  },
  [Cause.IDENTIFIER_MISSING]: {
    headline: 'That plan does not exist under the identifier the app asked for.',
    userMessage: 'This plan is not available from the App Store right now. Other plans on '
      + 'this screen may still work, and nothing has been charged.',
    engineerAction: 'The store returned other products, so the connection is fine and this '
      + 'identifier is simply wrong or not yet approved. Create it in App Store Connect, or '
      + 'add the real identifier to PRODUCT_ALIASES.',
    fixIsOutsideTheApp: true,
  },
  [Cause.PURCHASE_NOT_ALLOWED]: {
    headline: 'This device is not allowed to make purchases.',
    userMessage: 'This device is not allowed to make purchases. Check Screen Time → '
      + 'Content & Privacy Restrictions.',
    engineerAction: 'Device restriction, not an app fault. Nothing to fix in code.',
    fixIsOutsideTheApp: true,
  },
  [Cause.ALREADY_OWNED]: {
    headline: 'This is already owned by the signed-in account.',
    userMessage: 'You already own this. Use Restore Purchases to bring it back — you will '
      + 'not be charged twice.',
    engineerAction: 'Route the user to restore rather than showing an error.',
    fixIsOutsideTheApp: false,
  },
  [Cause.HEALTHY]: {
    headline: 'The store is answering normally.',
    userMessage: null,
    engineerAction: null,
    fixIsOutsideTheApp: false,
  },
});

const asArray = (v) => (Array.isArray(v) ? v : []);

/**
 * Diagnose a store interaction.
 *
 * @param {object} facts
 * @param {boolean} facts.sdkPresent      react-native-purchases loaded
 * @param {boolean} facts.configured      configure() completed
 * @param {string[]} facts.requested      identifiers asked for
 * @param {string[]} facts.returned       identifiers the store answered with
 * @param {number|null} facts.errorCode   RevenueCat PURCHASES_ERROR_CODE, if a call threw
 * @param {string|null} facts.wanted      the one identifier a purchase was for, if any
 *
 * Ordering is deliberate: an explicit error code beats an inference drawn from
 * an empty list, because a code is something the SDK actually said and the
 * empty list is something we noticed.
 */
export const diagnose = (facts = {}) => {
  const {
    sdkPresent = true, configured = true,
    requested = [], returned = [], errorCode = null, wanted = null,
    // From StoreKit via checkStore(). Never defaulted to true — a trial
    // promised to somebody who cannot have one opens a sheet that charges
    // immediately and contradicts the button they just pressed.
    trialEligible = false,
    // Subscription products do not come from getProducts. They come from the
    // current Offering, which is a separate call that fails for separate
    // reasons — and the build that has been selling subscriptions since 1.0
    // never asks getProducts about them at all. Keeping the two apart is what
    // stops "the offering is misconfigured" being reported as "the App Store
    // is down", which are a dashboard edit and a support ticket respectively.
    offeringPackages = null,
  } = facts ?? {};

  const req = asArray(requested);
  const ret = asArray(returned);
  const pkgs = offeringPackages === null ? null : asArray(offeringPackages);

  const cause = (() => {
    if (!sdkPresent) return Cause.SDK_ABSENT;
    if (!configured) return Cause.NOT_CONFIGURED;

    switch (errorCode) {
      case RcErrorCode.INVALID_CREDENTIALS:
      case RcErrorCode.CONFIGURATION:
      case RcErrorCode.INVALID_APPLE_SUBSCRIPTION_KEY:
        return Cause.BAD_API_KEY;
      case RcErrorCode.NETWORK:
        return Cause.NO_STORE_CONNECTION;
      case RcErrorCode.PURCHASE_NOT_ALLOWED:
        return Cause.PURCHASE_NOT_ALLOWED;
      case RcErrorCode.PRODUCT_ALREADY_PURCHASED:
      case RcErrorCode.RECEIPT_ALREADY_IN_USE:
        return Cause.ALREADY_OWNED;
      case RcErrorCode.STORE_PROBLEM:
        return Cause.AGREEMENT_OR_BUNDLE;
      // The store knows this product and will not sell it — not approved yet,
      // not available in this storefront, or still in Missing Metadata. It was
      // previously unmapped, so it fell through to the empty-list inference and
      // got reported as an agreement problem, sending the fix to the wrong place.
      case RcErrorCode.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE:
        return Cause.IDENTIFIER_MISSING;
      default: break;
    }

    // No error code. Now the counts are the evidence, and there are two of
    // them: nothing at all from EITHER source is a store-level problem, while
    // one source empty and the other full localises it precisely.
    const productsEmpty = req.length > 0 && ret.length === 0;
    const offeringEmpty = pkgs !== null && pkgs.length === 0;

    // Nothing from either source, and the SDK raised no error. This is the
    // shape of a lapsed agreement — and equally the shape of a store that has
    // not answered yet. Without an error code the two are indistinguishable
    // from here, so it is recorded as inconclusive and nothing is disabled.
    // AGREEMENT_OR_BUNDLE stays reachable, from the STORE_PROBLEM code above,
    // where the SDK has actually said so.
    if (productsEmpty && (pkgs === null || offeringEmpty)) return Cause.INCONCLUSIVE;
    if (offeringEmpty && ret.length > 0) return Cause.OFFERING_EMPTY;
    if (wanted && !ret.includes(wanted)) return Cause.IDENTIFIER_MISSING;
    if (req.length > 0 && ret.length < req.length && !wanted) return Cause.IDENTIFIER_MISSING;
    return Cause.HEALTHY;
  })();

  const d = DIAGNOSES[cause];
  const missing = req.filter((id) => !ret.includes(id));

  return Object.freeze({
    cause,
    healthy: cause === Cause.HEALTHY,
    // Whether this conclusion is strong enough to disable a button. Kept
    // separate from `healthy` on purpose: "not healthy" and "provably cannot
    // sell" are different claims, and treating the first as the second is what
    // blacked out the answer packs in build 29.
    blocksPurchase: BLOCKING_CAUSES.includes(cause),
    ...d,
    // Facts, kept alongside the conclusion, so a debug screen can show the
    // working rather than asking anybody to trust the verdict.
    requested: Object.freeze([...req]),
    returned: Object.freeze([...ret]),
    missing: Object.freeze(missing),
    offeringPackages: pkgs === null ? null : Object.freeze([...pkgs]),
    // Subscriptions are sellable when the Offering has packages. Null means no
    // offering check ran, which is treated as "do not block" — never as empty.
    subscriptionsSellable: pkgs === null ? true : pkgs.length > 0,
    errorCode,
    // From the store. Never defaulted to true — see checkStore().
    trialEligible: trialEligible === true,
    // The distinction the whole module exists for, stated plainly enough that a
    // screen can render it without re-deriving it.
    everythingFailed: req.length > 0 && ret.length === 0 && (pkgs === null || pkgs.length === 0),
    // Whether telling the user to try again is honest.
    retryWorthwhile: cause === Cause.NO_STORE_CONNECTION,
  });
};

/**
 * One line for a debug screen or a support message.
 *
 * Deliberately includes the identifiers. A support thread that says "purchases
 * are broken" costs three round trips; one that says which identifiers were
 * asked for and what came back costs none.
 */
export const diagnosisLine = (d) => {
  if (!d) return 'No store check has run yet.';
  if (d.healthy) return `Store OK — ${d.returned.length} product(s) available.`;
  const bits = [d.cause];
  if (d.errorCode !== null && d.errorCode !== undefined) bits.push(`rc=${d.errorCode}`);
  bits.push(`asked ${d.requested.length}`, `got ${d.returned.length}`);
  if (d.missing.length) bits.push(`missing: ${d.missing.join(', ')}`);
  return bits.join(' · ');
};
