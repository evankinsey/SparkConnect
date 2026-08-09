// ─── SERVER-SIDE ALLOWANCE ENFORCEMENT ───────────────────────────────────────
// Drop this into the Vercel project that serves /api/ask-nec, and call it
// before the model request. It reads the SAME policy file the app reads, so the
// number cannot drift between the two systems again.
//
// WHY THIS FILE EXISTS. The app advertised "5 a day free, 10 a day Pro" while
// the backend enforced whatever was typed into it months ago. A client that
// promises a limit the server does not honour is broken in both directions: too
// generous and people hit a wall the app said was not there, too strict and
// they are cut off early and told they had more.
//
// The policy lives at https://sparkconnect.pro/allowance-policy.json and is
// GENERATED from the app's own entitlements module. Editing it by hand defeats
// the point — change src/core/paywall/entitlements.js, run `npm run allowance`,
// redeploy the website, and both systems move together.
//
// ── HOW TO INSTALL ──────────────────────────────────────────────────────────
// 1. Copy this file into the sparkconnect-website Vercel project as
//    `api/_allowance.js`.
// 2. In `api/ask-nec.js`, before calling the model:
//
//      import { checkAllowance } from './_allowance.js';
//
//      const verdict = await checkAllowance({
//        deviceId: body.deviceId,
//        planType: body.planType,        // 'pro' | 'free'
//        usage: await readUsage(body.deviceId),   // your existing store
//      });
//      if (!verdict.allowed) {
//        return res.status(429).json({
//          error: verdict.reason,
//          remainingQuestions: 0,
//          policyVersion: verdict.policyVersion,
//        });
//      }
//      // ... make the model request, then:
//      res.json({ answer, remainingQuestions: verdict.remaining, policyVersion: verdict.policyVersion });
//
// 3. Keep returning `remainingQuestions` — the app displays it, and it is also
//    how the app detects that the two systems disagree.

const POLICY_URL = 'https://sparkconnect.pro/allowance-policy.json';
const CACHE_MS = 5 * 60 * 1000;

// If the policy cannot be fetched, these apply. They are deliberately the
// CURRENT values rather than something permissive: failing open on a paid
// allowance is a cost problem, and failing closed is a support problem, but
// failing to the last known good policy is neither.
const FALLBACK = Object.freeze({
  version: 0,
  tiers: {
    free: { perDay: 5, perMonth: null },
    pro: { perDay: 10, perMonth: 250 },
    lifetime: { perDay: 5, perMonth: null },
  },
});

let cached = null;
let cachedAt = 0;

export const loadPolicy = async (fetchImpl = fetch) => {
  if (cached && Date.now() - cachedAt < CACHE_MS) return cached;
  try {
    const res = await fetchImpl(POLICY_URL, { headers: { 'Cache-Control': 'no-cache' } });
    if (!res?.ok) throw new Error(`policy ${res?.status}`);
    const json = await res.json();
    if (!json?.tiers?.free?.perDay || !json?.tiers?.pro?.perDay) throw new Error('malformed policy');
    cached = json;
    cachedAt = Date.now();
    return cached;
  } catch (e) {
    // Keep serving the last good policy rather than reverting to the fallback
    // mid-flight — a blip in the CDN must not silently change everybody's limit.
    return cached ?? FALLBACK;
  }
};

const tierFor = (planType) => {
  const p = String(planType ?? '').toLowerCase();
  if (p === 'pro') return 'pro';
  if (p === 'lifetime') return 'lifetime';
  return 'free';
};

/**
 * Decide whether this request is allowed.
 *
 * `usage` is whatever your store already tracks: { today, month, purchased }.
 * `purchased` is the permanent balance and is consumed ONLY after the included
 * allowance is gone — and never reset by a daily or monthly rollover. Somebody
 * paid for those.
 */
export const checkAllowance = async ({ planType, usage = {}, fetchImpl } = {}) => {
  const policy = await loadPolicy(fetchImpl);
  const tier = tierFor(planType);
  const limits = policy.tiers[tier] ?? policy.tiers.free;

  const today = Number(usage.today) || 0;
  const month = Number(usage.month) || 0;
  const purchased = Number(usage.purchased) || 0;

  const dailyLeft = Math.max(0, limits.perDay - today);
  const monthlyLeft = limits.perMonth == null
    ? Number.POSITIVE_INFINITY
    : Math.max(0, limits.perMonth - month);

  const includedLeft = Math.min(dailyLeft, monthlyLeft);

  if (includedLeft > 0) {
    return {
      allowed: true,
      usingPurchased: false,
      remaining: includedLeft === Number.POSITIVE_INFINITY ? null : includedLeft - 1,
      policyVersion: policy.version,
    };
  }

  // Included is gone. Purchased answers are permanent and spend next.
  if (purchased > 0) {
    return {
      allowed: true,
      usingPurchased: true,
      remaining: 0,
      purchasedRemaining: purchased - 1,
      policyVersion: policy.version,
    };
  }

  const hitMonthly = limits.perMonth != null && monthlyLeft <= 0 && dailyLeft > 0;
  return {
    allowed: false,
    usingPurchased: false,
    remaining: 0,
    // The app shows this. It must name which ceiling was hit, because "out of
    // answers" when you have nine left today is a support ticket.
    reason: hitMonthly
      ? 'monthly_fair_use_reached'
      : 'daily_limit_reached',
    policyVersion: policy.version,
  };
};
