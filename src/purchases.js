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
import { ProductId, ALL_STORE_IDS, matchesProduct } from './core/paywall/config';

let Purchases = null;
let PACKAGE_TYPE = { ANNUAL: 'ANNUAL', MONTHLY: 'MONTHLY' };
try {
  const rc = require('react-native-purchases');
  Purchases = rc.default;
  if (rc.PACKAGE_TYPE) PACKAGE_TYPE = { ...PACKAGE_TYPE, ...rc.PACKAGE_TYPE };
} catch (e) { /* preview environment — purchase calls become friendly no-ops */ }

const ENTITLEMENT = 'pro';

// Every product we can buy directly by identifier, subscriptions included.
// Subscriptions are listed here so the direct path below can serve them when
// the Offerings system is not configured — see purchaseProduct().
// Every identifier the store might answer to, including the older ones a live
// product can still carry. Asking for all of them is what stops a renamed plan
// from silently failing to load.
const STORE_PRODUCT_IDS = ALL_STORE_IDS;

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

/** Buy by product identifier. This path needs only the product to exist in
 *  App Store Connect — no Offering, no dashboard packages. */
async function buyByIdentifier(productId) {
  const prods = await Purchases.getProducts(STORE_PRODUCT_IDS);
  // Match on any known alias, not on our internal id — the store returns
  // whatever identifier the product was actually created with.
  const prod = (prods || []).find(p => matchesProduct(productId, p.productIdentifier));
  if (!prod) return null;
  const { customerInfo } = await Purchases.purchaseStoreProduct(prod);
  return customerInfo;
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
      if (!customerInfo) {
        return { ok: false, isPro: false, error: 'This product could not be loaded from the App Store. Please try again.' };
      }
      return { ok: proFrom(customerInfo), isPro: proFrom(customerInfo) };
    }

    // One-time store products: answer packs and Lifetime Tools.
    const customerInfo = await buyByIdentifier(productId);
    if (!customerInfo) {
      return { ok: false, isPro: false, error: 'This product could not be loaded from the App Store. Please try again.' };
    }
    // Packs are consumables — they do not flip the entitlement; ok means paid.
    return { ok: true, isPro: proFrom(customerInfo) };
  } catch (e) {
    if (e?.userCancelled) return { ok: false, isPro: false, cancelled: true };
    return { ok: false, isPro: false, error: e?.message || 'Purchase failed.' };
  }
}

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
