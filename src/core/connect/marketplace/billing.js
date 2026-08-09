// ─── BILLING EVENTS ──────────────────────────────────────────────────────────
// The monetization ARCHITECTURE, with the monetization switched off.
//
// No escrow, no payment processing, no fee is ever charged by this module.
// What exists is the abstraction the brief asks for: a BillingEvent that
// records "a billable thing happened" with enough structure that any later
// fee model — match fee, qualifier fee, subscription, transaction fee — is a
// consumer of these events rather than a rewrite. Whether a fee is even
// PRESENTED is gated by `matchFeesEnabled`, which is hard-locked off in
// flags/core.js alongside the other money paths, for the same reason they
// are: a client-side toggle must not be able to light up a money path.
//
// Pure module: no React, no network, no storage.

export const BillingEventKind = Object.freeze({
  OPPORTUNITY_MATCH_FEE: 'OPPORTUNITY_MATCH_FEE',   // contractor/business pays on successful introduction
  QUALIFIER_MATCH_FEE: 'QUALIFIER_MATCH_FEE',       // business pays on successful qualifier introduction
  SUBSCRIPTION: 'SUBSCRIPTION',                     // ongoing Contractor Connect software
  TRANSACTION_FEE: 'TRANSACTION_FEE',               // later, if payments ever flow through
});

const isNonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

let _n = 0;
const mintId = (now) => { _n = (_n + 1) % 10000; return `bill_${now.toString(36)}_${_n.toString(36)}`; };

/**
 * Record that a billable event occurred. Recording is not charging: an event
 * with `charged: false` is a row in the revenue funnel, nothing more.
 */
export const billingEvent = ({ kind, subjectId, payerId, amountCents = null, experimentVariant = null } = {},
  { now = Date.now() } = {}) => {
  if (!Object.prototype.hasOwnProperty.call(BillingEventKind, kind)) return null;
  if (!isNonEmpty(subjectId) || !isNonEmpty(payerId)) return null;
  return Object.freeze({
    id: mintId(now),
    kind,
    subjectId,
    payerId,
    amountCents: Number.isInteger(amountCents) && amountCents >= 0 ? amountCents : null,
    experimentVariant,
    charged: false,           // nothing in the MVP charges. This flips server-side, later.
    presentedAt: null,
    createdAt: new Date(now).toISOString(),
  });
};

// ─── The pricing experiment ──────────────────────────────────────────────────
// Remote-configurable test prices for a successful assisted introduction.
// These are experiment arms, not market data, and `PRICING_DISCLAIMER` says so
// anywhere a number is shown internally.

export const INTRO_FEE_VARIANTS_CENTS = Object.freeze([19900, 29900, 49900]);

export const PRICING_DISCLAIMER =
  'Test prices for a pricing experiment. Not market-established rates, and nothing is charged '
  + 'in the MVP — the experiment measures willingness, manually.';

/** What is free in the MVP. Pinned by a test so a pricing change is loud. */
export const FREE_ACTIONS = Object.freeze([
  'post_opportunity',
  'create_qualifier_profile',
  'create_contractor_profile',
  'request_initial_match',
]);

/**
 * Deterministic variant assignment: same subject, same arm, every time,
 * with no stored assignment table. Uses the same FNV walk as verification's
 * fingerprint — good distribution, zero dependencies.
 */
export const priceVariantFor = (subjectId, variants = INTRO_FEE_VARIANTS_CENTS) => {
  const s = String(subjectId ?? '');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
  const cents = variants[h % variants.length];
  return Object.freeze({
    amountCents: cents,
    label: `$${(cents / 100).toFixed(0)}`,
    variant: `intro_fee_${cents}`,
    disclaimer: PRICING_DISCLAIMER,
  });
};

/**
 * May a fee be PRESENTED (not charged — presented)?
 * Both flags must agree, and the resolver comes from flags/core so the
 * hard-lock applies. There is no code path from "true" to money moving; a
 * presented fee in the MVP is a screen and a conversation.
 */
export const canPresentFee = (resolveFlag) =>
  typeof resolveFlag === 'function'
  && resolveFlag('contractorConnectEnabled') === true
  && resolveFlag('matchFeesEnabled') === true;
