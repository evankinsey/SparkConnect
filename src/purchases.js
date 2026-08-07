// ─── PURCHASES ───────────────────────────────────────────────────────────────
// The one bridge between the UI and RevenueCat. v1.0.0 shipped a working
// integration (components/PaywallScreen.js) and has active subscribers, so the
// ground truth lives here unchanged from that build:
//
//   entitlement id:     'pro'
//   subscriptions:      current offering's ANNUAL / MONTHLY packages
//   answer packs:       sparky_answers_10 / _30 / _100  (store products)
//   lifetime:           sparkconnect_lifetime_tools     (store product)
//
// react-native-purchases is loaded lazily inside try/catch so Expo Go, web
// preview, and test environments degrade to a stub instead of throwing at
// import time — an import-time throw here would be a launch crash.

import { Platform } from 'react-native';
import { REVENUECAT_IOS_KEY, REVENUECAT_ANDROID_KEY } from './config/keys';
import { ProductId, ALL_STORE_IDS, matchesProduct, PRODUCT_ALIASES } from './core/paywall/config';
import { diagnose } from './core/paywall/storeDiagnosis';

let Purchases = null;
let PACKAGE_TYPE = { ANNUAL: 'ANNUAL', MONTHLY: 'MONTHLY' };
try {
  const rc = require('react-native-purchases');
  Purchases = rc.default;
  if (rc.PACKAGE_TYPE) PACKAGE_TYPE = { ...PACKAGE_TYPE, ...rc.PACKAGE_TYPE };
} catch (e) { /* preview environment — purchase calls become friendly no-ops */ }

const ENTITLEMENT = 'pro';

/**
 * ONE-TIME PRODUCTS ONLY. Subscriptions are deliberately absent.
 *
 * THIS IS THE SHIPPING BUILD'S SHAPE, and it is not a style preference. iOS 1.0
 * (26) has been selling subscriptions since launch and it has NEVER passed a
 * subscription identifier to getProducts — subscriptions come from the current
 * Offering and consumables come from getProducts, two calls, two failure modes.
 *
 * The version on this branch asked getProducts for everything at once,
 * including `sparkconnect_pro_annual`, which does not exist in App Store
 * Connect. That is the one difference between the build that sells and the
 * build that does not, so it goes back to the shape that works.
 *
 * Lifetime stays here because it genuinely is a one-time product. If it does
 * not exist in App Store Connect, StoreKit drops that identifier and still
 * returns the packs — which is exactly why the two must not be one list with
 * the subscriptions in it.
 */
const ONE_TIME_PRODUCT_IDS = [
  ...(PRODUCT_ALIASES[ProductId.PACK_15] ?? [ProductId.PACK_15]),
  ...(PRODUCT_ALIASES[ProductId.PACK_50] ?? [ProductId.PACK_50]),
  ...(PRODUCT_ALIASES[ProductId.PACK_150] ?? [ProductId.PACK_150]),
  ...(PRODUCT_ALIASES[ProductId.LIFETIME_TOOLS] ?? [ProductId.LIFETIME_TOOLS]),
];

const isSubscription = (productId) =>
  productId === ProductId.PRO_ANNUAL || productId === ProductId.PRO_MONTHLY;

let configured = false;

const proFrom = (customerInfo) =>
  !!customerInfo?.entitlements?.active?.[ENTITLEMENT];

/**
 * Configure RevenueCat once and report current Pro state.
 * Never throws — a billing SDK problem must never take the app down.
 */
export async function initPurchases() {
  if (!Purchases) return { available: false, isPro: false };
  try {
    if (!configured) {
      Purchases.configure({
        apiKey: Platform.OS === 'ios' ? REVENUECAT_IOS_KEY : REVENUECAT_ANDROID_KEY,
      });
      configured = true;
    }
    const info = await Purchases.getCustomerInfo();
    return { available: true, isPro: proFrom(info) };
  } catch (e) {
    return { available: false, isPro: false, error: e?.message };
  }
}

// ─── Store diagnosis ─────────────────────────────────────────────────────────
// Facts recorded on every store call, so a failure names itself instead of
// costing two days of guessing. See core/paywall/storeDiagnosis.js.

let lastDiagnosis = null;

/** The last store check, for the paywall and the Product Health screen. */
export const storeDiagnosis = () => lastDiagnosis;

const record = (facts) => {
  lastDiagnosis = Object.freeze({ ...diagnose(facts), at: new Date().toISOString() });
  return lastDiagnosis;
};

/**
 * Ask the store what it will actually sell, before anyone taps Buy.
 *
 * THE POINT: build 27 let a person choose a plan, tap it, wait, and only then
 * be told the product could not be loaded — for every plan on the screen. The
 * store already knew that at the moment the paywall opened. Asking then turns
 * an error after a decision into a disabled button before one, which is the
 * difference between a broken app and an unavailable plan.
 *
 * Never throws. A preflight that crashes the paywall is worse than no
 * preflight, so a failure here degrades to "we could not check", and the buy
 * path still runs as it always did.
 */
export async function checkStore() {
  if (!Purchases) return record({ sdkPresent: false, configured: false });

  // Configure defensively: the paywall can be opened from a deep link before
  // the mount effect has finished, and a getProducts call on an unconfigured
  // SDK returns nothing, which reads exactly like a missing product.
  await initPurchases();

  // Two independent calls, because they are two independent failure modes. One
  // throwing must not blank the other — an offering misconfiguration should
  // never stop the packs from selling.
  let packages = [];
  let returned = [];
  let errorCode = null;

  try {
    const offerings = await Purchases.getOfferings();
    packages = (offerings?.current?.availablePackages ?? [])
      .map((p) => p.product?.identifier ?? p.identifier)
      .filter(Boolean);
  } catch (e) {
    errorCode = codeOf(e);
  }

  try {
    const prods = await Purchases.getProducts(ONE_TIME_PRODUCT_IDS);
    returned = (prods || []).map((p) => p.productIdentifier);
  } catch (e) {
    errorCode = errorCode ?? codeOf(e);
  }

  return record({
    sdkPresent: true,
    configured,
    requested: ONE_TIME_PRODUCT_IDS,
    returned,
    offeringPackages: packages,
    errorCode,
  });
}

const codeOf = (e) => (typeof e?.code === 'number' ? e.code : Number(e?.code ?? NaN) || null);

/**
 * Is this specific plan buyable right now?
 *
 * Answers from the last preflight rather than making a call, so a paywall can
 * ask it once per row while rendering. Unknown means no check has run — treated
 * as buyable, because greying out a working button on no evidence is worse than
 * an occasional honest error.
 *
 * Subscriptions are answered from the Offering and one-time products from
 * getProducts, matching how each is actually bought. Asking the wrong source is
 * how a plan that sells fine gets rendered as unavailable.
 */
export const isProductAvailable = (productId) => {
  if (!lastDiagnosis) return true;
  if (lastDiagnosis.cause === 'SDK_ABSENT') return false;
  if (isSubscription(productId)) return lastDiagnosis.subscriptionsSellable;
  return lastDiagnosis.returned.some((id) => matchesProduct(productId, id));
};

/** Buy by product identifier. This path needs only the product to exist in
 *  App Store Connect — no Offering, no dashboard packages. */
async function buyByIdentifier(productId) {
  const prods = await Purchases.getProducts(ONE_TIME_PRODUCT_IDS);
  const returned = (prods || []).map((p) => p.productIdentifier);
  // Match on any known alias, not on our internal id — the store returns
  // whatever identifier the product was actually created with.
  const prod = (prods || []).find(p => matchesProduct(productId, p.productIdentifier));
  if (!prod) {
    // Record which identifier the store did not return, and what it did.
    //
    // The count is the diagnosis. Some products back means this identifier is
    // wrong; none back means the request never reached a working store, which
    // is an agreement or bundle problem and cannot be fixed by shipping a
    // build. Those two look identical to a user and are opposite jobs.
    record({
      sdkPresent: true,
      configured,
      requested: ONE_TIME_PRODUCT_IDS,
      returned,
      // The Offering is unaffected by a one-time product missing, so carry the
      // last known packages forward rather than reporting subscriptions dead.
      offeringPackages: lastDiagnosis?.offeringPackages ?? null,
      wanted: (PRODUCT_ALIASES[productId] ?? [productId])[0],
    });
    return null;
  }
  return (await Purchases.purchaseStoreProduct(prod)).customerInfo;
}

/**
 * Buy anything by our internal ProductId. Returns { ok, isPro, cancelled, error }.
 *
 * ONE PATH FOR EVERY BUTTON. Subscriptions used to go through Offerings while
 * packs went through getProducts, so the two buttons could fail for completely
 * different reasons — and did: the packs said "could not be loaded" while Pro
 * said "no products registered for your offerings". Two failures, two messages,
 * one confused user.
 *
 * Now Offerings is an OPTIMISATION, not a requirement. It is tried first for
 * subscriptions because a package purchase carries the offering/paywall
 * metadata RevenueCat reports on, but if the Offering is missing or empty we
 * fall through to buying the identifier directly — the same call the packs
 * already make, which only needs the product to exist in App Store Connect.
 */
export async function purchaseProduct(productId) {
  if (!Purchases) {
    return { ok: false, isPro: false, error: 'Purchases require the App Store build on a real device.' };
  }
  try {
    if (productId === ProductId.PRO_ANNUAL || productId === ProductId.PRO_MONTHLY) {
      // Preferred: a package from the current offering.
      try {
        const offerings = await Purchases.getOfferings();
        const pkgs = offerings?.current?.availablePackages || [];
        const wanted = productId === ProductId.PRO_ANNUAL ? PACKAGE_TYPE.ANNUAL : PACKAGE_TYPE.MONTHLY;
        const pkg = pkgs.find(p => p.packageType === wanted)
          || pkgs.find(p => matchesProduct(productId, p.product?.identifier));
        if (pkg) {
          const { customerInfo } = await Purchases.purchasePackage(pkg);
          return { ok: proFrom(customerInfo), isPro: proFrom(customerInfo) };
        }
      } catch (e) {
        if (e?.userCancelled) return { ok: false, isPro: false, cancelled: true };
        // An offerings misconfiguration is not a dead end — fall through.
      }

      // Fallback: buy the subscription by identifier, exactly like a pack.
      const customerInfo = await buyByIdentifier(productId);
      if (!customerInfo) return unavailable();
      return { ok: proFrom(customerInfo), isPro: proFrom(customerInfo) };
    }

    // One-time store products: answer packs and Lifetime Tools.
    const customerInfo = await buyByIdentifier(productId);
    if (!customerInfo) return unavailable();
    // Packs are consumables — they do not flip the entitlement; ok means paid.
    return { ok: true, isPro: proFrom(customerInfo) };
  } catch (e) {
    if (e?.userCancelled) return { ok: false, isPro: false, cancelled: true };
    // An error code is a diagnosis; a message is prose. Record the code, then
    // show the sentence that matches what actually went wrong.
    const d = record({
      sdkPresent: true,
      configured,
      requested: ONE_TIME_PRODUCT_IDS,
      returned: lastDiagnosis?.returned ?? [],
      offeringPackages: lastDiagnosis?.offeringPackages ?? null,
      errorCode: codeOf(e),
    });
    return {
      ok: false, isPro: false,
      error: d.userMessage || e?.message || 'Purchase failed.',
      cause: d.cause,
      retryWorthwhile: d.retryWorthwhile,
    };
  }
}

/**
 * The result for a purchase that could not be attempted.
 *
 * NOT "please try again". Retrying an identifier the store does not return
 * fails identically every time, and telling somebody to retry sends them round
 * a loop while believing the fault is theirs or their connection's. The
 * sentence comes from the diagnosis, so "this plan is unavailable" and
 * "purchases are down, your existing ones are safe" are different sentences.
 */
const unavailable = () => ({
  ok: false,
  isPro: false,
  error: lastDiagnosis?.userMessage
    || 'This plan is not available from the App Store right now. Nothing has been charged.',
  cause: lastDiagnosis?.cause ?? null,
  productMissing: true,
  retryWorthwhile: !!lastDiagnosis?.retryWorthwhile,
});

/** Restore. Returns { ok, isPro, error } — ok means the call worked, isPro the result. */
export async function restorePurchases() {
  if (!Purchases) {
    return { ok: false, isPro: false, error: 'Restore requires the App Store build on a real device.' };
  }
  try {
    const info = await Purchases.restorePurchases();
    return { ok: true, isPro: proFrom(info) };
  } catch (e) {
    return { ok: false, isPro: false, error: e?.message || 'Restore failed.' };
  }
}
