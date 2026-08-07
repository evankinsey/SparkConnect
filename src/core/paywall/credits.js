// ─── SPARK CREDITS ───────────────────────────────────────────────────────────
// A ledger, not a number.
//
// NOT LIVE. `CREDITS_ENABLED` in registry.js is false and nothing here is
// reachable from a screen yet. This is the machinery, built and tested ahead of
// the store products existing, so that switching it on is a decision rather
// than a project. See docs/v2/STORE-CONFIGURATION-REQUIRED.md.
//
// WHY A LEDGER AND NOT A BALANCE. A single mutable integer cannot answer "why
// do I have 12 credits when I bought 75", cannot survive a purchase callback
// firing twice, and cannot be reconciled against a receipt when somebody is
// angry. Every movement is an entry, the balance is the sum, and an idempotency
// key makes a retried grant a no-op instead of free money.
//
// THE TWO RULES THAT COME FROM APPLE, and they are not negotiable:
//
//   1. PURCHASED CREDITS NEVER EXPIRE, and never disappear because a
//      subscription lapsed. They were sold as a thing owned, not as a thing
//      rented. `expiresAt` exists only for promotional grants.
//   2. CONSUMABLES ARE NOT AN ENTITLEMENT. Credits are never attached to `pro`.
//      A Free user's purchased credits work exactly as well as a Pro user's.
//
// THE RULE THAT COMES FROM NOT BEING A CASINO: included allowance is spent
// FIRST, always. A user must never burn something they paid for while something
// free was still sitting there. `spend()` enforces the order rather than
// trusting each screen to remember it.
//
// GRANDFATHERING IS THE POINT OF THE MIGRATION, and it is one-way: a legacy
// answer is worth at least one credit, never less. If a conversion would ever
// reduce somebody's balance, the migration keeps the larger number.
//
// Pure module: no React, no storage, no RevenueCat. The caller persists the
// ledger and hands purchases in.

import { Feature } from './entitlements.js';
import { ProductId } from './config.js';

export const CURRENCY_NAME = 'Spark Credits';

/** Where a movement came from. Every entry has exactly one. */
export const Source = Object.freeze({
  LEGACY_MIGRATION: 'LEGACY_MIGRATION',
  IAP_PURCHASE: 'IAP_PURCHASE',
  PROMOTIONAL: 'PROMOTIONAL',
  REFUND_REVERSAL: 'REFUND_REVERSAL',
  FEATURE_CONSUMPTION: 'FEATURE_CONSUMPTION',
  CORRECTION: 'CORRECTION',
});

/** Credits that can expire, and credits that cannot. */
const NEVER_EXPIRES = Object.freeze([
  Source.IAP_PURCHASE, Source.LEGACY_MIGRATION, Source.REFUND_REVERSAL, Source.CORRECTION,
]);

export const canExpire = (source) => !NEVER_EXPIRES.includes(source);

// ─── What things cost ────────────────────────────────────────────────────────

/**
 * The cost table.
 *
 * NOTHING THAT IS PART OF FREE, PRO OR LIFETIME APPEARS HERE. Calculators,
 * basic code reference, standard simulator lessons, standard troubleshooting
 * scenarios, ordinary game progression and saved project data are not on this
 * list and a test asserts they never get added. Credits buy work the backend
 * actually performs on demand; they do not meter the app.
 *
 * `otaAdjustable` marks the ones remote config may move. A cost that can be
 * changed remotely must never be able to go up silently on something already
 * offered at a lower price in the UI — `resolveCost` clamps to the ceiling.
 */
export const CreditAction = Object.freeze({
  SPARK_AI_STANDARD: 'SPARK_AI_STANDARD',
  SPARK_AI_ENHANCED: 'SPARK_AI_ENHANCED',
  PHOTO_ANALYSIS: 'PHOTO_ANALYSIS',
  GENERATED_SCENARIO: 'GENERATED_SCENARIO',
  GENERATED_MISSION: 'GENERATED_MISSION',
  AI_REPORT: 'AI_REPORT',
  BLUEPRINT_ANALYSIS: 'BLUEPRINT_ANALYSIS',
});

export const COSTS = Object.freeze({
  [CreditAction.SPARK_AI_STANDARD]: {
    cost: 1, ceiling: 2, feature: Feature.SPARK_AI, otaAdjustable: true,
    label: 'SparkAI answer',
  },
  [CreditAction.SPARK_AI_ENHANCED]: {
    cost: 2, ceiling: 4, feature: Feature.SPARK_AI, otaAdjustable: true,
    label: 'Researched answer',
  },
  [CreditAction.PHOTO_ANALYSIS]: {
    cost: 2, ceiling: 4, feature: Feature.SPARK_AI, otaAdjustable: true,
    label: 'Photo analysis',
  },
  [CreditAction.GENERATED_SCENARIO]: {
    cost: 2, ceiling: 4, feature: Feature.TROUBLESHOOT, otaAdjustable: true,
    label: 'Custom troubleshooting scenario',
  },
  [CreditAction.GENERATED_MISSION]: {
    cost: 2, ceiling: 4, feature: null, otaAdjustable: true,
    label: 'Extra job-site call',
  },
  [CreditAction.AI_REPORT]: {
    cost: 2, ceiling: 4, feature: null, otaAdjustable: true,
    label: 'Written report',
  },
  [CreditAction.BLUEPRINT_ANALYSIS]: {
    cost: 5, ceiling: 10, feature: Feature.BLUEPRINT, otaAdjustable: true,
    label: 'Blueprint takeoff',
  },
});

/**
 * Things that must NEVER cost a credit.
 *
 * Kept as an explicit list rather than as an absence, because an absence is not
 * something a test can hold. Adding any of these to COSTS fails the suite.
 */
export const NEVER_CHARGED = Object.freeze([
  Feature.CALCULATOR,
  Feature.PERMIT,
  Feature.WIRING_LESSON,
  Feature.JOBSITE,
  Feature.JOB_CAM,
]);

export const resolveCost = (action, remote = null) => {
  const base = COSTS[action];
  if (!base) return null;
  const proposed = remote?.[action];
  if (!base.otaAdjustable || !Number.isInteger(proposed) || proposed < 0) return base.cost;
  // A remotely raised price cannot exceed the ceiling declared in the build the
  // user is running. Otherwise a dashboard edit silently doubles what somebody
  // was quoted on screen a second ago.
  return Math.min(proposed, base.ceiling);
};

// ─── The ledger ──────────────────────────────────────────────────────────────

export const emptyLedger = () => Object.freeze({ entries: Object.freeze([]) });

const entryOf = ({ id, source, amount, at, action = null, storeTransactionId = null, note = null, expiresAt = null }) =>
  Object.freeze({ id, source, amount, at, action, storeTransactionId, note, expiresAt });

/** Sum of every entry. The balance is derived, never stored. */
export const balance = (ledger, { now = Date.now() } = {}) => (ledger?.entries ?? [])
  .filter((e) => !(e.expiresAt && e.expiresAt <= now))
  .reduce((sum, e) => sum + e.amount, 0);

/** Purchased credits only — the part that can never be taken away. */
export const purchasedBalance = (ledger) => (ledger?.entries ?? [])
  .filter((e) => !canExpire(e.source) || e.amount < 0)
  .reduce((sum, e) => sum + e.amount, 0);

export const hasEntry = (ledger, id) => (ledger?.entries ?? []).some((e) => e.id === id);

/**
 * Add credits.
 *
 * `id` is the idempotency key and it is REQUIRED. A purchase callback that
 * retries — which they do, on a flaky connection, routinely — must grant once.
 * Re-applying a known id returns the ledger untouched rather than doubling it.
 */
export const grant = (ledger, {
  id, source, amount, at = Date.now(), storeTransactionId = null, note = null, expiresAt = null,
}) => {
  if (!id || !Number.isInteger(amount) || amount <= 0 || !Source[source]) return ledger;
  if (hasEntry(ledger, id)) return ledger;
  if (expiresAt && !canExpire(source)) expiresAt = null; // rule 1, enforced not trusted

  return Object.freeze({
    entries: Object.freeze([
      ...(ledger?.entries ?? []),
      entryOf({ id, source, amount, at, storeTransactionId, note, expiresAt }),
    ]),
  });
};

/**
 * Spend, with the included allowance used first.
 *
 * `included` is how many free/Pro uses remain right now. When it covers the
 * action, NOTHING is deducted and the result says so — a user must never burn
 * something they paid for while something free was still sitting there.
 *
 * Returns `{ ok, ledger, charged, usedIncluded, reason }`. Never partially
 * charges: either the whole cost comes out or none of it does.
 */
export const spend = (ledger, {
  id, action, included = 0, remote = null, at = Date.now(), now = Date.now(),
}) => {
  const cost = resolveCost(action, remote);
  if (cost === null) return { ok: false, ledger, charged: 0, usedIncluded: false, reason: 'UNKNOWN_ACTION' };
  if (!id) return { ok: false, ledger, charged: 0, usedIncluded: false, reason: 'NO_IDEMPOTENCY_KEY' };
  // A retried spend is the same spend. Report it as done, charge nothing again.
  if (hasEntry(ledger, id)) {
    return { ok: true, ledger, charged: 0, usedIncluded: false, reason: 'ALREADY_APPLIED' };
  }

  if (included > 0) {
    return { ok: true, ledger, charged: 0, usedIncluded: true, reason: 'INCLUDED' };
  }

  const available = balance(ledger, { now });
  if (available < cost) {
    return {
      ok: false, ledger, charged: 0, usedIncluded: false,
      reason: 'INSUFFICIENT', cost, available, short: cost - available,
    };
  }

  return {
    ok: true,
    charged: cost,
    usedIncluded: false,
    reason: 'CHARGED',
    ledger: Object.freeze({
      entries: Object.freeze([
        ...(ledger?.entries ?? []),
        entryOf({ id, source: Source.FEATURE_CONSUMPTION, amount: -cost, at, action }),
      ]),
    }),
  };
};

/** Put credits back. Used when a generation fails after it was charged for. */
export const refund = (ledger, { id, ofSpendId, at = Date.now() }) => {
  const original = (ledger?.entries ?? []).find((e) => e.id === ofSpendId);
  if (!original || original.amount >= 0) return ledger;
  return grant(ledger, {
    id, source: Source.REFUND_REVERSAL, amount: -original.amount, at,
    note: `Reversal of ${ofSpendId}`,
  });
};

// ─── Migration ───────────────────────────────────────────────────────────────

/**
 * Every pack ever sold, including identifiers no longer displayed.
 *
 * The names lie and that is the trap: `sparky_answers_10` grants FIFTEEN. A
 * migration that trusted the identifier would quietly take five answers off
 * every person who bought the small pack.
 */
export const LEGACY_PACKS = Object.freeze({
  sparky_answers_10: 15,
  sparky_answers_30: 50,
  sparky_answers_100: 150,
});

export const LEGACY_RATE = 1; // 1 purchased answer → 1 Spark Credit

/**
 * Convert a previously purchased answer balance into credits.
 *
 * ONE-WAY, AND NEVER DOWNWARD. `atLeast` is the balance the user can see today;
 * whatever the arithmetic produces, the result is never smaller. Somebody with
 * 227 answers has at least 227 credits afterwards, and a rate change later can
 * only ever be generous.
 */
export const migrateLegacyBalance = (ledger, {
  id = 'legacy:answers', answers = 0, at = Date.now(),
} = {}) => {
  const owned = Number.isFinite(Number(answers)) ? Math.max(0, Math.trunc(Number(answers))) : 0;
  if (owned <= 0) return ledger;
  const converted = Math.max(owned, Math.round(owned * LEGACY_RATE));
  return grant(ledger, {
    id, source: Source.LEGACY_MIGRATION, amount: converted, at,
    note: `${owned} purchased SparkAI answers carried over`,
  });
};

/** What a historical purchase receipt is worth, for rebuilding from history. */
export const creditsForLegacyProduct = (storeIdentifier) => LEGACY_PACKS[storeIdentifier] ?? 0;

// ─── The wallet ──────────────────────────────────────────────────────────────

/**
 * What a wallet screen renders.
 *
 * `neverExpires` is stated on the screen rather than buried in terms, because
 * it is both true and the single most reassuring thing about the product.
 */
export const wallet = (ledger, { includedToday = 0, now = Date.now(), limit = 8 } = {}) => {
  // Newest first, ties broken by insertion order. Two entries inside the same
  // millisecond is not rare — a migration and the first spend after it land
  // together — and an unstable sort shows somebody their history backwards.
  const entries = [...(ledger?.entries ?? [])]
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (b.e.at - a.e.at) || (b.i - a.i))
    .map(({ e }) => e);
  return Object.freeze({
    currency: CURRENCY_NAME,
    balance: balance(ledger, { now }),
    purchased: purchasedBalance(ledger),
    includedToday,
    neverExpires: true,
    note: 'Purchased credits never expire, and they keep working whether or not you have Pro.',
    recent: Object.freeze(entries.slice(0, limit).map((e) => Object.freeze({
      at: e.at,
      amount: e.amount,
      label: e.action ? (COSTS[e.action]?.label ?? e.action) : sourceLabel(e.source),
      note: e.note,
    }))),
    empty: entries.length === 0,
  });
};

const sourceLabel = (source) => ({
  LEGACY_MIGRATION: 'Carried over from answer packs',
  IAP_PURCHASE: 'Credits purchased',
  PROMOTIONAL: 'Free credits',
  REFUND_REVERSAL: 'Returned',
  CORRECTION: 'Adjustment',
  FEATURE_CONSUMPTION: 'Used',
}[source] ?? source);

/**
 * The prompt shown before a credit is spent.
 *
 * Only when included allowance is genuinely exhausted, and it always offers the
 * option of not spending. A prompt that appears while free uses remain, or one
 * with no way out, is the dark pattern this product does not get to have.
 */
export const spendPrompt = (action, { included = 0, remote = null, balance: bal = 0 }) => {
  const cost = resolveCost(action, remote);
  if (cost === null || included > 0) return null;
  const meta = COSTS[action];
  return Object.freeze({
    title: meta.label,
    cost,
    affordable: bal >= cost,
    body: bal >= cost
      ? `Uses ${cost} ${cost === 1 ? 'credit' : 'credits'}. You have ${bal}.`
      : `Needs ${cost} ${cost === 1 ? 'credit' : 'credits'} and you have ${bal}.`,
    // Three ways out, and one of them is free.
    actions: Object.freeze([
      bal >= cost ? { id: 'spend', label: `Use ${cost}`, primary: true } : { id: 'buy', label: 'Get credits', primary: true },
      { id: 'pro', label: 'Pro includes more', primary: false },
      { id: 'later', label: 'Come back tomorrow', primary: false },
    ]),
  });
};

export { ProductId };
