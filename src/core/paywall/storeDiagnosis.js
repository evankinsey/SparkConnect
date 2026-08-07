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
  IDENTIFIER_MISSING: 'IDENTIFIER_MISSING',
  PURCHASE_NOT_ALLOWED: 'PURCHASE_NOT_ALLOWED',
  ALREADY_OWNED: 'ALREADY_OWNED',
  HEALTHY: 'HEALTHY',
});

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
  } = facts ?? {};

  const req = asArray(requested);
  const ret = asArray(returned);

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
      default: break;
    }

    // No error code. Now the count is the evidence.
    if (req.length > 0 && ret.length === 0) return Cause.AGREEMENT_OR_BUNDLE;
    if (wanted && !ret.includes(wanted)) return Cause.IDENTIFIER_MISSING;
    if (req.length > 0 && ret.length < req.length && !wanted) return Cause.IDENTIFIER_MISSING;
    return Cause.HEALTHY;
  })();

  const d = DIAGNOSES[cause];
  const missing = req.filter((id) => !ret.includes(id));

  return Object.freeze({
    cause,
    healthy: cause === Cause.HEALTHY,
    ...d,
    // Facts, kept alongside the conclusion, so a debug screen can show the
    // working rather than asking anybody to trust the verdict.
    requested: Object.freeze([...req]),
    returned: Object.freeze([...ret]),
    missing: Object.freeze(missing),
    errorCode,
    // The distinction the whole module exists for, stated plainly enough that a
    // screen can render it without re-deriving it.
    everythingFailed: req.length > 0 && ret.length === 0,
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
