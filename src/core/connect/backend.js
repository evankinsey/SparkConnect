// ─── THE BACKEND, AND WHETHER THERE IS ONE ───────────────────────────────────
// One place that answers "can the marketplace complete a transaction without a
// person", and one place that holds the client configuration when it can.
//
// WHY THIS IS A FILE AND NOT A BOOLEAN IN A SCREEN. The four marketplace
// funnels must not open until posting, discovery, payment and reveal work end
// to end. That is six separate conditions (operations.READINESS), and the way
// they get opened prematurely is somebody flipping a flag in a component to
// see the screen and forgetting. So the screen asks this module, this module
// derives the answer from configuration that only exists when the backend
// actually does, and there is nothing to flip.
//
// ─── WHAT IS STILL NEEDED, EXACTLY ──────────────────────────────────────────
//
//   1. A Supabase project. Nobody in this repo can create one — it needs an
//      account. Once it exists: run supabase/migrations/0001_contractor_connect.sql.
//   2. EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in the build
//      environment. The anon key is public by design; see CLIENT_KEY_RULE.
//   3. The service_role key set as a SERVER-side secret only, for the payment
//      webhook and the verification job. It must never reach this file, an
//      EXPO_PUBLIC_ variable, or a commit.
//   4. A payment provider, decided against the App Store question below.
//
// ─── THE APP STORE QUESTION, WHICH DECIDES THE ARCHITECTURE ─────────────────
//
// Selling lead unlocks inside an iOS app runs into guideline 3.1.1 (digital
// content uses In-App Purchase) against 3.1.3(e) (goods and services consumed
// OUTSIDE the app use other payment methods). A job lead is genuinely both:
// the contact details are digital content delivered in-app, and the thing
// being bought is access to real-world construction work.
//
// The established precedent is that lead marketplaces — Thumbtack, Angi, Bark
// — charge contractors by card rather than IAP, and are on the App Store. That
// is the model to follow, and it also happens to be the only one compatible
// with value-banded pricing, since IAP prices come from a fixed set of
// products configured in App Store Connect and $29/$49/$79/$99 bands with
// per-job variation do not fit that shape.
//
// This is not a decision to make from inside the code. It needs confirming
// before a payment integration is built, because getting it wrong costs a
// rejected binary, and building it twice costs more than asking once.
//
// Pure module: no React, no network, no Supabase import.

import { CLIENT_KEY_RULE } from './schema.js';

const env = (name) => {
  // `process.env` exists under Expo's transform. Guarded because this module is
  // also imported by tests running in plain node.
  try {
    const v = typeof process !== 'undefined' ? process.env?.[name] : null;
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  } catch { return null; }
};

export const SUPABASE_URL = env('EXPO_PUBLIC_SUPABASE_URL');
export const SUPABASE_ANON_KEY = env('EXPO_PUBLIC_SUPABASE_ANON_KEY');

/**
 * A key that is not the anon key must never be read here.
 *
 * The failure this prevents is somebody pasting the service_role key into
 * EXPO_PUBLIC_SUPABASE_ANON_KEY because "it worked in the console". Supabase
 * keys are JWTs whose payload names the role, so the check is cheap and exact.
 */
export const looksLikeServiceKey = (key) => {
  if (typeof key !== 'string' || !key.includes('.')) return false;
  try {
    const payload = key.split('.')[1];
    const json = JSON.parse(
      typeof atob === 'function'
        ? atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
        : Buffer.from(payload, 'base64').toString('utf8'),
    );
    return json?.role === 'service_role';
  } catch { return false; }
};

export const keyIsSafe = (key) => !!key && !looksLikeServiceKey(key);

/**
 * Is there a backend, and is each readiness condition met?
 *
 * Every value is false today and stays false until the conditions are actually
 * true. `configured` is derived from the environment rather than declared, so
 * this cannot claim a backend that is not there.
 */
export const configured = !!SUPABASE_URL && keyIsSafe(SUPABASE_ANON_KEY);

export const BACKEND = Object.freeze({
  configured,
  url: SUPABASE_URL,
  keyRule: CLIENT_KEY_RULE,
  readiness: Object.freeze({
    backend: configured,
    // Each of these flips when the thing it names exists and has been tested on
    // a device. None of them may be set to true to "see the screen".
    auth: false,
    rls: false,
    payments: false,
    verification: false,
    exceptionQueue: false,
  }),
});

/**
 * The order to build it in, which is not the order it is easiest to build in.
 *
 * Payments last. A marketplace with payments and no inventory takes money for
 * an empty room; a marketplace with inventory and no payments is a free beta
 * that teaches you the same things and refunds nobody.
 */
export const BUILD_ORDER = Object.freeze([
  Object.freeze({ step: 'schema', what: 'Run the migration. Verify RLS by querying with the anon key and getting nothing back.' }),
  Object.freeze({ step: 'auth', what: 'Accounts, so a row can belong to somebody.' }),
  Object.freeze({ step: 'verification', what: 'Contractor verification, because unverified unlocks are the failure that ends the marketplace.' }),
  Object.freeze({ step: 'post_and_browse', what: 'Posting and previews. Free, and it is the inventory.' }),
  Object.freeze({ step: 'exceptionQueue', what: 'Somewhere a person looks. Before money, not after.' }),
  Object.freeze({ step: 'payments', what: 'Unlocks. Last, and only once there is something worth unlocking.' }),
]);
