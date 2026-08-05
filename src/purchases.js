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
import { ProductId } from './core/paywall/config';

let Purchases = null;
let PACKAGE_TYPE = { ANNUAL: 'ANNUAL', MONTHLY: 'MONTHLY' };
try {
  const rc = require('react-native-purchases');
  Purchases = rc.default;
  if (rc.PACKAGE_TYPE) PACKAGE_TYPE = { ...PACKAGE_TYPE, ...rc.PACKAGE_TYPE };
} catch (e) { /* preview environment — purchase calls become friendly no-ops */ }

const ENTITLEMENT = 'pro';

const STORE_PRODUCT_IDS = [
  ProductId.PACK_15,
  ProductId.PACK_50,
  ProductId.PACK_150,
  ProductId.LIFETIME_TOOLS,
];

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

/**
 * Buy anything by our internal ProductId.
 *   PRO_ANNUAL / PRO_MONTHLY → package purchase from the current offering
 *   packs / lifetime         → store product purchase
 * Returns { ok, isPro, cancelled, error }.
 */
export async function purchaseProduct(productId) {
  if (!Purchases) {
    return { ok: false, isPro: false, error: 'Purchases require the App Store build on a real device.' };
  }
  try {
    if (productId === ProductId.PRO_ANNUAL || productId === ProductId.PRO_MONTHLY) {
      const offerings = await Purchases.getOfferings();
      const pkgs = offerings?.current?.availablePackages || [];
      const wanted = productId === ProductId.PRO_ANNUAL ? PACKAGE_TYPE.ANNUAL : PACKAGE_TYPE.MONTHLY;
      const pkg = pkgs.find(p => p.packageType === wanted) || pkgs[0];
      if (!pkg) {
        return { ok: false, isPro: false, error: 'Subscription plans have not finished loading. Check your connection and try again.' };
      }
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      return { ok: proFrom(customerInfo), isPro: proFrom(customerInfo) };
    }

    // One-time store products: answer packs and Lifetime Tools.
    const prods = await Purchases.getProducts(STORE_PRODUCT_IDS);
    const prod = (prods || []).find(p => p.productIdentifier === productId);
    if (!prod) {
      return { ok: false, isPro: false, error: 'This product could not be loaded from the App Store. Please try again.' };
    }
    const { customerInfo } = await Purchases.purchaseStoreProduct(prod);
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
