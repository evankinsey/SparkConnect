// ─── SPARK CREDITS ───────────────────────────────────────────────────────────
// This is money. The tests that matter are the ones about not taking anything
// away from somebody who already paid.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CURRENCY_NAME, Source, CreditAction, COSTS, NEVER_CHARGED, resolveCost,
  emptyLedger, balance, purchasedBalance, grant, spend, refund, hasEntry,
  migrateLegacyBalance, creditsForLegacyProduct, LEGACY_PACKS, canExpire,
  wallet, spendPrompt,
} from '../src/core/paywall/credits.js';
import { CREDITS_ENABLED } from '../src/core/paywall/registry.js';
import { Feature } from '../src/core/paywall/entitlements.js';

const withCredits = (n) => grant(emptyLedger(), { id: 'seed', source: Source.IAP_PURCHASE, amount: n });

// ─── Not live ────────────────────────────────────────────────────────────────

test('credits are still switched off', () => {
  // The machinery exists ahead of the store products. Switching it on is a
  // decision, and this test is the reminder that it has not been taken.
  assert.equal(CREDITS_ENABLED, false);
});

// ─── Grandfathering ──────────────────────────────────────────────────────────

test('a legacy balance is never reduced by the migration', () => {
  // Somebody with 227 purchased answers has at least 227 credits afterwards.
  const l = migrateLegacyBalance(emptyLedger(), { answers: 227 });
  assert.equal(balance(l), 227);
  assert.equal(purchasedBalance(l), 227, 'carried-over credits are purchased credits');
});

test('the pack names lie, and the migration does not trust them', () => {
  // sparky_answers_10 grants FIFTEEN. A migration that read the identifier
  // would quietly take five answers off everybody who bought the small pack.
  assert.equal(creditsForLegacyProduct('sparky_answers_10'), 15);
  assert.equal(creditsForLegacyProduct('sparky_answers_30'), 50);
  assert.equal(creditsForLegacyProduct('sparky_answers_100'), 150);
  assert.equal(creditsForLegacyProduct('not_a_product'), 0);
  for (const [id, n] of Object.entries(LEGACY_PACKS)) {
    assert.ok(n > 0, `${id} grants nothing`);
  }
});

test('the migration runs once however many times it is called', () => {
  let l = migrateLegacyBalance(emptyLedger(), { answers: 227 });
  l = migrateLegacyBalance(l, { answers: 227 });
  l = migrateLegacyBalance(l, { answers: 227 });
  assert.equal(balance(l), 227, 'a re-run must not multiply somebody\'s balance');
});

test('nothing to migrate is not an error', () => {
  assert.equal(balance(migrateLegacyBalance(emptyLedger(), { answers: 0 })), 0);
  assert.equal(balance(migrateLegacyBalance(emptyLedger(), { answers: -5 })), 0);
  assert.equal(balance(migrateLegacyBalance(emptyLedger(), { answers: 'nonsense' })), 0);
  assert.equal(balance(migrateLegacyBalance(emptyLedger(), {})), 0);
});

// ─── The two Apple rules ─────────────────────────────────────────────────────

test('purchased credits never expire, even if something tries to expire them', () => {
  const soon = Date.now() + 1000;
  const l = grant(emptyLedger(), {
    id: 'p1', source: Source.IAP_PURCHASE, amount: 50, expiresAt: soon,
  });
  // Enforced, not trusted: the expiry is stripped on the way in.
  assert.equal(l.entries[0].expiresAt, null);
  assert.equal(balance(l, { now: soon + 10_000 }), 50);
  assert.equal(canExpire(Source.IAP_PURCHASE), false);
  assert.equal(canExpire(Source.LEGACY_MIGRATION), false);
});

test('promotional credits are the only ones that can expire', () => {
  const at = 1000;
  const l = grant(emptyLedger(), {
    id: 'promo', source: Source.PROMOTIONAL, amount: 10, at, expiresAt: at + 500,
  });
  assert.equal(canExpire(Source.PROMOTIONAL), true);
  assert.equal(balance(l, { now: at + 100 }), 10);
  assert.equal(balance(l, { now: at + 900 }), 0);
  // And they were never part of what somebody bought.
  assert.equal(purchasedBalance(l), 0);
});

test('credits are not an entitlement and do not care about Pro', () => {
  // Nothing in the module reads a tier. A Free user's purchased credits work
  // exactly as well as a Pro user's, which is what Apple requires of a
  // consumable and what RevenueCat recommends of a non-subscription product.
  const l = withCredits(10);
  const r = spend(l, { id: 's', action: CreditAction.SPARK_AI_STANDARD, included: 0 });
  assert.equal(r.ok, true);
  assert.equal(r.charged, 1);
});

// ─── Not a casino ────────────────────────────────────────────────────────────

test('included allowance is always spent before anything purchased', () => {
  const l = withCredits(100);
  const r = spend(l, { id: 's1', action: CreditAction.SPARK_AI_STANDARD, included: 3 });
  assert.equal(r.ok, true);
  assert.equal(r.usedIncluded, true);
  assert.equal(r.charged, 0);
  assert.equal(balance(r.ledger), 100, 'a paid credit was burned while a free use remained');
});

test('nothing an entitlement already covers can be given a price', () => {
  // Calculators, the Permit Assistant, standard lessons, ordinary game
  // progression and Job Cam are not metered. Kept as an explicit list because
  // an absence is not something a test can hold.
  const charged = new Set(Object.values(COSTS).map((c) => c.feature).filter(Boolean));
  for (const f of NEVER_CHARGED) {
    assert.equal(charged.has(f), false, `${f} was given a credit price`);
  }
  assert.ok(NEVER_CHARGED.includes(Feature.CALCULATOR));
  assert.ok(NEVER_CHARGED.includes(Feature.PERMIT));
});

test('a remote price change cannot exceed the ceiling in the running build', () => {
  const a = CreditAction.SPARK_AI_STANDARD;
  assert.equal(resolveCost(a), 1);
  assert.equal(resolveCost(a, { [a]: 2 }), 2);
  // Otherwise a dashboard edit silently doubles what somebody was quoted on
  // screen a second earlier.
  assert.equal(resolveCost(a, { [a]: 99 }), COSTS[a].ceiling);
  assert.equal(resolveCost(a, { [a]: -1 }), 1, 'a nonsense price is ignored');
  assert.equal(resolveCost('NOT_AN_ACTION'), null);
});

test('the spend prompt only appears when the free allowance is gone, and always has a way out', () => {
  assert.equal(spendPrompt(CreditAction.PHOTO_ANALYSIS, { included: 2, balance: 50 }), null,
    'a prompt while free uses remain is the dark pattern');

  const p = spendPrompt(CreditAction.PHOTO_ANALYSIS, { included: 0, balance: 50 });
  assert.equal(p.cost, 2);
  assert.equal(p.affordable, true);
  assert.ok(p.actions.some((a) => a.id === 'later'), 'there must be a free way out');
  assert.ok(p.actions.some((a) => a.id === 'pro'));

  const broke = spendPrompt(CreditAction.PHOTO_ANALYSIS, { included: 0, balance: 0 });
  assert.equal(broke.affordable, false);
  assert.equal(broke.actions[0].id, 'buy');
  assert.ok(broke.actions.some((a) => a.id === 'later'));
});

// ─── Retries and double-grants ───────────────────────────────────────────────

test('a purchase callback that fires twice grants once', () => {
  // They retry on a flaky connection, routinely.
  let l = emptyLedger();
  for (let i = 0; i < 5; i++) {
    l = grant(l, { id: 'txn_abc', source: Source.IAP_PURCHASE, amount: 75, storeTransactionId: 'txn_abc' });
  }
  assert.equal(balance(l), 75);
  assert.equal(l.entries.length, 1);
  assert.equal(hasEntry(l, 'txn_abc'), true);
});

test('a retried spend charges once and reports itself as done', () => {
  const l = withCredits(10);
  const first = spend(l, { id: 'req_1', action: CreditAction.SPARK_AI_STANDARD });
  assert.equal(first.charged, 1);
  const retry = spend(first.ledger, { id: 'req_1', action: CreditAction.SPARK_AI_STANDARD });
  assert.equal(retry.ok, true, 'a retry must not read as a failure');
  assert.equal(retry.charged, 0);
  assert.equal(balance(retry.ledger), 9);
});

test('a spend with no idempotency key is refused rather than guessed at', () => {
  const r = spend(withCredits(10), { action: CreditAction.SPARK_AI_STANDARD });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'NO_IDEMPOTENCY_KEY');
  assert.equal(balance(r.ledger), 10);
});

test('an unaffordable spend takes nothing and says how short you are', () => {
  const r = spend(withCredits(3), { id: 's', action: CreditAction.BLUEPRINT_ANALYSIS });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'INSUFFICIENT');
  assert.equal(r.charged, 0);
  assert.equal(r.short, 2);
  assert.equal(balance(r.ledger), 3, 'a failed spend must never partially charge');
});

test('a generation that fails after charging gives the credits back', () => {
  const l = withCredits(10);
  const spent = spend(l, { id: 'req_9', action: CreditAction.BLUEPRINT_ANALYSIS });
  assert.equal(balance(spent.ledger), 5);
  const back = refund(spent.ledger, { id: 'rev_9', ofSpendId: 'req_9' });
  assert.equal(balance(back), 10);
  // And a reversal of a reversal is not free money.
  assert.equal(balance(refund(back, { id: 'rev_9b', ofSpendId: 'rev_9' })), 10);
  assert.equal(balance(refund(back, { id: 'rev_x', ofSpendId: 'nope' })), 10);
});

test('a malformed grant is ignored rather than corrupting the ledger', () => {
  const l = withCredits(10);
  for (const bad of [
    { id: 'x', source: 'NOT_A_SOURCE', amount: 5 },
    { id: 'x', source: Source.IAP_PURCHASE, amount: 0 },
    { id: 'x', source: Source.IAP_PURCHASE, amount: -5 },
    { id: 'x', source: Source.IAP_PURCHASE, amount: 1.5 },
    { source: Source.IAP_PURCHASE, amount: 5 },
  ]) {
    assert.equal(balance(grant(l, bad)), 10, `${JSON.stringify(bad)} moved the balance`);
  }
});

// ─── The wallet ──────────────────────────────────────────────────────────────

test('the wallet says the reassuring thing out loud', () => {
  let l = migrateLegacyBalance(emptyLedger(), { answers: 227 });
  l = spend(l, { id: 's', action: CreditAction.PHOTO_ANALYSIS }).ledger;
  const w = wallet(l, { includedToday: 3 });

  assert.equal(w.currency, CURRENCY_NAME);
  assert.equal(w.balance, 225);
  assert.equal(w.includedToday, 3);
  assert.equal(w.neverExpires, true);
  // Both true and the single most reassuring thing about the product, so it
  // goes on the screen rather than into the terms.
  assert.match(w.note, /never expire/i);
  assert.match(w.note, /whether or not you have Pro/i);

  assert.equal(w.recent[0].label, 'Photo analysis');
  assert.equal(w.recent[0].amount, -2);
  assert.match(w.recent[1].label, /Carried over/i);
  assert.equal(wallet(emptyLedger()).empty, true);
});
