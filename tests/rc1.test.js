// ─── RC1 TESTS ───────────────────────────────────────────────────────────────
// Three guarantees:
//
//   · centralising entitlements did not tighten the free tier
//   · Contractor Connect never promises a licensing or permit outcome
//   · the health dashboard is derived, so it cannot flatter the build

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  Tier, TIER_LABEL, normalizeTier, REGISTRY, FEATURE_IDS, featureEntry,
  resolveAccess, Decision, applyRemoteConfig, upgradePreview,
  accessMatrix, matrixText, CREDITS_ENABLED, CREDIT_COST,
} from '../src/core/paywall/registry.js';
import { Feature, FREE_LIMITS, Grant } from '../src/core/paywall/entitlements.js';
import { ProductId, PRODUCTS } from '../src/core/paywall/config.js';
import {
  connectHome, ENTRY, PATHS, PathId, EXPLAINERS, explainerById, networkStatus,
  waitlistEntry, isSubmittable, InterestKind, Trade, ACTIVE_TRADES,
  findOutcomePromise, assertNoOutcomePromise, CONNECT_DISCLAIMER, BETA_NOTICE,
} from '../src/core/connect/index.js';
import { productHealth, healthText, Status } from '../src/core/health.js';

// ─── The free tier must not have moved ───────────────────────────────────────

test('the registry inherits the shipped free limits rather than restating them', () => {
  for (const id of FEATURE_IDS) {
    assert.deepEqual(
      REGISTRY[id].freeLimit, FREE_LIMITS[id],
      `${id}: the registry disagrees with the limits the app already ships`,
    );
  }
});

test('everything that was free is still free', () => {
  // The two that must never be metered, stated explicitly so a future edit to
  // FREE_LIMITS trips this rather than shipping.
  for (const id of [Feature.CALCULATOR, Feature.PERMIT]) {
    assert.equal(REGISTRY[id].freeLimit.limit, null, `${id} must stay unlimited on free`);
    const d = resolveAccess({ feature: id, tier: Tier.FREE, used: 9999 });
    assert.equal(d.allowed, true, `${id} blocked a free user`);
    assert.equal(d.decision, Decision.ALLOW_UNMETERED);
  }
});

test('$7.99 monthly is what ships', () => {
  assert.equal(PRODUCTS[ProductId.PRO_MONTHLY].priceCents, 799);
});

// ─── The access engine ───────────────────────────────────────────────────────

test('an unknown feature fails closed', () => {
  const d = resolveAccess({ feature: 'NOT_A_FEATURE', tier: Tier.PRO });
  assert.equal(d.allowed, false);
  assert.equal(d.decision, Decision.BLOCK_UNKNOWN);
});

test('free metering counts down and then blocks', () => {
  const f = Feature.SPARK_AI;
  const limit = FREE_LIMITS[f].limit;
  const mid = resolveAccess({ feature: f, tier: Tier.FREE, used: limit - 1 });
  assert.equal(mid.allowed, true);
  assert.equal(mid.metered, true);
  assert.equal(mid.remaining, 1);

  const out = resolveAccess({ feature: f, tier: Tier.FREE, used: limit });
  assert.equal(out.allowed, false);
  assert.equal(out.decision, Decision.BLOCK_LIMIT);
  assert.equal(out.upgradeTo, Tier.PRO);
  assert.ok(out.copy, 'a gate must carry the copy that explains it');
});

test('Pro is unmetered, and Lifetime gets the tools without the AI allowance', () => {
  const pro = resolveAccess({ feature: Feature.SPARK_AI, tier: Tier.PRO, used: 9999 });
  assert.equal(pro.decision, Decision.ALLOW_UNMETERED);

  const lifetimeTools = resolveAccess({ feature: Feature.CALCULATOR, tier: Tier.LIFETIME, used: 9999 });
  assert.equal(lifetimeTools.allowed, true);

  // Voice is Pro-only by tier, so Lifetime is refused on tier, not on count.
  const voice = resolveAccess({ feature: Feature.VOICE_ASK, tier: Tier.LIFETIME });
  assert.equal(voice.allowed, false);
  assert.equal(voice.decision, Decision.BLOCK_TIER);
});

test('a job-site task skips the meter', () => {
  const d = resolveAccess({ feature: Feature.SPARK_AI, tier: Tier.FREE, used: 9999, grant: Grant.GAME_TASK });
  assert.equal(d.allowed, true);
  assert.equal(d.decision, Decision.ALLOW_UNMETERED);
  assert.match(d.reason, /job-site/i);
});

test('a disabled feature is off for everyone, including Pro', () => {
  const registry = applyRemoteConfig({ [Feature.BLUEPRINT]: { disabled: true } });
  const d = resolveAccess({ feature: Feature.BLUEPRINT, tier: Tier.PRO, registry });
  assert.equal(d.allowed, false);
  assert.equal(d.decision, Decision.BLOCK_DISABLED);
});

test('remote config can move a limit but cannot invent a feature or a tier', () => {
  const registry = applyRemoteConfig({
    [Feature.SPARK_AI]: { limit: 20 },
    NOT_REAL: { limit: 999 },
  });
  assert.equal(registry[Feature.SPARK_AI].freeLimit.limit, 20);
  assert.equal(registry.NOT_REAL, undefined, 'remote config cannot add features');
  assert.deepEqual(registry[Feature.SPARK_AI].tiers, REGISTRY[Feature.SPARK_AI].tiers, 'tiers are not remote-editable');

  // A nonsense limit is ignored rather than applied.
  const bad = applyRemoteConfig({ [Feature.SPARK_AI]: { limit: -5 } });
  assert.equal(bad[Feature.SPARK_AI].freeLimit.limit, FREE_LIMITS[Feature.SPARK_AI].limit);
});

test('credits are off, and the engine says so without pretending otherwise', () => {
  assert.equal(CREDITS_ENABLED, false);
  const d = resolveAccess({ feature: Feature.SPARK_AI, tier: Tier.FREE, used: 999, credits: 100 });
  assert.equal(d.payableWithCredits, false, 'credits must not unlock anything while disabled');
  assert.equal(d.creditCost, CREDIT_COST[Feature.SPARK_AI], 'the cost is still reported, so the matrix stays honest');
});

test('a cooldown never masks a real block', () => {
  const registry = { ...REGISTRY, [Feature.SPARK_AI]: { ...REGISTRY[Feature.SPARK_AI], cooldownMs: 5000 } };
  // Out of allowance AND inside the cooldown: the allowance is the real reason.
  const d = resolveAccess({
    feature: Feature.SPARK_AI, tier: Tier.FREE, used: 999,
    registry, lastUsedAt: 1000, now: 1500,
  });
  assert.equal(d.decision, Decision.BLOCK_LIMIT);

  const cooling = resolveAccess({
    feature: Feature.SPARK_AI, tier: Tier.FREE, used: 0,
    registry, lastUsedAt: 1000, now: 1500,
  });
  assert.equal(cooling.decision, Decision.BLOCK_COOLDOWN);
  assert.equal(cooling.retryInMs, 4500);
});

test('tier strings from anywhere are made safe', () => {
  assert.equal(normalizeTier('PRO'), Tier.PRO);
  assert.equal(normalizeTier('pro'), Tier.FREE, 'unknown strings fall back to free, never up');
  assert.equal(normalizeTier(null), Tier.FREE);
  assert.equal(normalizeTier({}), Tier.FREE);
});

// ─── Upgrade preview ─────────────────────────────────────────────────────────

test('the upgrade preview is computed from the gates, not written as copy', () => {
  const p = upgradePreview(Tier.FREE, Tier.PRO);
  assert.equal(p.worthwhile, true);
  assert.ok(p.unlocked.some((u) => u.id === Feature.VOICE_ASK), 'voice is tier-locked, so it unlocks');
  assert.ok(p.unmetered.some((u) => u.id === Feature.SPARK_AI), 'SparkAI was metered, so it becomes unmetered');
  // Nothing unlimited on free should appear as an upgrade benefit.
  assert.ok(!p.unmetered.some((u) => u.id === Feature.CALCULATOR));
  assert.ok(!p.unlocked.some((u) => u.id === Feature.CALCULATOR));

  const nothing = upgradePreview(Tier.PRO, Tier.PRO);
  assert.equal(nothing.worthwhile, false, 'an upgrade that changes nothing must not be sold as one');
});

// ─── The access matrix ───────────────────────────────────────────────────────

test('the matrix has a row per feature and is generated from the registry', () => {
  const m = accessMatrix();
  assert.equal(m.rows.length, FEATURE_IDS.length);
  for (const row of m.rows) {
    assert.ok(featureEntry(row.id), `${row.id} is not a real feature`);
    assert.ok(row.free && row.lifetime && row.pro, `${row.id} incomplete`);
    assert.equal(typeof row.tokenEligible, 'boolean');
    assert.equal(typeof row.otaConfigurable, 'boolean');
  }
  assert.equal(m.creditsEnabled, false);
  const text = matrixText(m);
  assert.match(text, /Feature\s+Free\s+Lifetime\s+Pro/);
  assert.match(text, /Spark Credits: disabled/);
});

// ─── Contractor Connect ──────────────────────────────────────────────────────

test('the entry screen leads with the problem, not the jargon', () => {
  assert.match(ENTRY.headline, /bigger jobs/i);
  assert.doesNotMatch(ENTRY.headline, /qualifying agent/i,
    'the hook must not be a term most users have never needed');
  // It is still present — just not first.
  assert.ok(ENTRY.bullets.some((b) => /qualifying agent/i.test(b)));
  const qaPath = PATHS.findIndex((p) => p.id === PathId.BECOME_QA);
  assert.ok(qaPath >= 2, 'qualifying agent should not be the first route offered');
});

test('nothing in Contractor Connect promises a licensing or permit outcome', () => {
  const strings = [
    ENTRY.headline, ENTRY.sub, ...ENTRY.bullets,
    BETA_NOTICE, CONNECT_DISCLAIMER,
    ...PATHS.flatMap((p) => [p.label, p.describe]),
    ...EXPLAINERS.flatMap((e) => [e.title, e.body, e.thenWhat]),
    networkStatus().headline, networkStatus().detail,
  ];
  for (const s of strings) {
    assert.equal(findOutcomePromise(s), null, `promises an outcome: "${s}"`);
  }
  // The guard itself works.
  assert.ok(findOutcomePromise("We'll get your permits sorted"));
  assert.ok(findOutcomePromise('Guaranteed license approval'));
  assert.throws(() => assertNoOutcomePromise("we'll handle the permit for you"));
});

test('the disclaimer says what SparkConnect is not', () => {
  assert.match(CONNECT_DISCLAIMER, /not a licensing authority/i);
  assert.match(CONNECT_DISCLAIMER, /(?:not|nothing here is) legal advice/i);
  assert.match(CONNECT_DISCLAIMER, /law firm/i);
  assert.match(CONNECT_DISCLAIMER, /does not obtain permits or licences/i);
});

test('there are no fake listings, contractors or availability', () => {
  const s = networkStatus();
  assert.equal(s.listings, 0);
  assert.equal(s.matching, false);
  assert.equal(s.beta, true);
  assert.match(s.headline, /Nothing to browse/i);
  // Nothing in the module returns a person.
  const home = connectHome();
  const json = JSON.stringify(home);
  assert.doesNotMatch(json, /"contractors"\s*:\s*\[\s*\{/, 'no contractor list may be fabricated');
  assert.ok(home.paths.length > 0);
  assert.ok(home.comingSoon.every((p) => p.available === false));
});

test('the explainers point at the authority rather than answering for it', () => {
  for (const e of EXPLAINERS) {
    assert.ok(e.title && e.body && e.thenWhat, `${e.id} incomplete`);
    assert.match(e.thenWhat, /board|department|authority|AHJ|source|them/i,
      `${e.id} does not hand off to the authority`);
  }
  assert.equal(explainerById('what-is-qa').title, 'What a qualifying agent is');
  assert.equal(explainerById('nope'), null);
});

test('a waitlist entry needs a state and an interest, and is local until sent', () => {
  const blank = waitlistEntry();
  assert.equal(blank.submitted, false, 'nothing is transmitted by building an entry');
  assert.equal(isSubmittable(blank).ok, false);
  assert.match(isSubmittable(blank).reason, /state/i);

  const noInterest = waitlistEntry({ state: 'fl' });
  assert.equal(noInterest.state, 'FL');
  assert.equal(isSubmittable(noInterest).ok, false);

  const good = waitlistEntry({
    state: 'FL', interests: [InterestKind.NEED_QUALIFIER, 'NOT_REAL', InterestKind.NEED_QUALIFIER],
    note: 'Starting a company',
  });
  assert.deepEqual(good.interests, [InterestKind.NEED_QUALIFIER], 'unknown interests are dropped, duplicates collapsed');
  assert.equal(isSubmittable(good).ok, true);
  assert.equal(good.trade, Trade.ELECTRICAL);
});

test('the trade list is the shape for TradeConnect, not a promise', () => {
  assert.ok(Object.keys(Trade).length >= 9);
  assert.deepEqual(ACTIVE_TRADES, [Trade.ELECTRICAL], 'only electrical is live');
});

// ─── Product health ──────────────────────────────────────────────────────────

test('the dashboard reads real state rather than restating it', () => {
  const h = productHealth({ flags: {} });
  const byLabel = (l) => h.checks.find((c) => c.label === l);

  const datasets = byLabel('NEC datasets verified');
  assert.equal(datasets.status, Status.WARN, 'not every table has been checked yet');
  assert.ok(datasets.outstanding.length > 0, 'the unchecked ones must stay listed');
  // The partially-checked table is credited without being counted as done.
  assert.ok(datasets.partial.length >= 1, 'the EMT rows already confirmed should show as partial');
  assert.match(datasets.detail, /partially/);
  assert.ok(!datasets.outstanding.includes('conductor-resistance'),
    'a table checked against the book must leave the outstanding list');

  const graph = byLabel('Field Intelligence graph');
  assert.equal(graph.status, Status.OK, 'the tool graph should validate');

  assert.equal(byLabel('Spark Credits').status, Status.OFF);
  assert.match(byLabel('Release override').detail, /ACTIVE/);
});

test('a failing check blocks tagging; warnings do not', () => {
  const h = productHealth({ flags: {}, storeProductsFound: [] });
  assert.equal(h.checks.find((c) => c.label === 'Store products').status, Status.FAIL,
    'missing store products is a hard failure');
  assert.equal(h.safeToTag, false);

  const ok = productHealth({
    flags: {},
    storeProductsFound: [ProductId.PRO_MONTHLY, ProductId.PRO_ANNUAL, ProductId.LIFETIME_TOOLS],
  });
  assert.equal(ok.checks.find((c) => c.label === 'Store products').status, Status.OK);
  assert.equal(ok.safeToTag, true, 'warnings alone are a judgement, not a block');
  assert.ok(ok.counts.warn > 0, 'and there should still be warnings to judge');
});

test('the health report is pasteable', () => {
  const text = healthText(productHealth({ flags: { blueprintEnabled: true } }));
  assert.match(text, /PRODUCT HEALTH/);
  assert.match(text, /TRUST/);
  assert.match(text, /Safe to tag/);
  assert.match(text, /blueprintEnabled/);
});

// ─── Store identifiers must match what is already selling ────────────────────
// The build on the App Store takes money successfully today. Anything here that
// disagrees with it is a purchase that silently fails for a real customer, so
// these are pinned rather than described.

test('the annual plan uses the identifier the live build sells', async () => {
  const { ProductId, PRODUCT_ALIASES, ALL_STORE_IDS, matchesProduct } =
    await import('../src/core/paywall/config.js');

  // Proven to exist: the shipping build buys this one.
  assert.equal(ProductId.PRO_ANNUAL, 'sparkconnect_pro_yearly');
  assert.equal(ProductId.PRO_MONTHLY, 'sparkconnect_pro_monthly');

  // The renamed id is still accepted, so a store product created under either
  // name resolves rather than silently returning nothing.
  assert.ok(matchesProduct(ProductId.PRO_ANNUAL, 'sparkconnect_pro_yearly'));
  assert.ok(matchesProduct(ProductId.PRO_ANNUAL, 'sparkconnect_pro_annual'));
  assert.ok(!matchesProduct(ProductId.PRO_ANNUAL, 'something_else'));

  // Every plan is asked for by every alias it might carry.
  for (const [id, aliases] of Object.entries(PRODUCT_ALIASES)) {
    assert.ok(aliases.includes(id) || aliases.length > 0, `${id} has no store identifier`);
    for (const a of aliases) assert.ok(ALL_STORE_IDS.includes(a), `${a} is never requested from the store`);
  }
});

test('the consumable packs keep their legacy identifiers', async () => {
  const { ProductId, PACKS } = await import('../src/core/paywall/config.js');
  // The number in the identifier is not the number of answers. These sold under
  // these names and cannot be renamed, so the ids are pinned and PACKS is the
  // source of truth for what a buyer receives.
  assert.equal(ProductId.PACK_15, 'sparky_answers_10');
  assert.equal(ProductId.PACK_50, 'sparky_answers_30');
  assert.equal(ProductId.PACK_150, 'sparky_answers_100');
  assert.equal(PACKS.find((p) => p.id === ProductId.PACK_15).answers, 15);
  assert.equal(PACKS.find((p) => p.id === ProductId.PACK_150).answers, 150);
});

test('the entitlement id matches the live build', async () => {
  // main uses RC_ENTITLEMENT = 'pro'. If this ever diverges, a real purchase
  // succeeds and the app still shows the paywall.
  const src = await import('node:fs').then((fs) => fs.readFileSync('src/purchases.js', 'utf8'));
  assert.match(src, /const ENTITLEMENT = 'pro';/);
});

// ─── The gates must agree with the build that is selling ─────────────────────

test('the free SparkAI allowance comes from one table', async () => {
  const { FREE_LIMITS: L, Feature: F, ASK_ALLOWANCE } =
    await import('../src/core/paywall/entitlements.js');
  // The gate enforced 3 while the app's own copy advertised 5. It was raised to
  // 5 rather than the copy corrected down, so nobody loses an answer they were
  // already being promised — see the note on ASK_ALLOWANCE.
  assert.equal(L[F.SPARK_AI].limit, ASK_ALLOWANCE.free.perDay);
  assert.equal(L[F.SPARK_AI].period, 'day');
  assert.equal(ASK_ALLOWANCE.free.perDay, 5);
});

test('the Pro monthly backstop can never bind before the daily number', async () => {
  const { ASK_ALLOWANCE } = await import('../src/core/paywall/entitlements.js');
  // 20/day with a 400/month cap means "20 a day" runs out on day 20 — the
  // advertised number quietly stops being true two thirds of the way through
  // the month. The backstop must clear a full month at the daily rate.
  assert.ok(
    ASK_ALLOWANCE.pro.monthlyBackstop >= ASK_ALLOWANCE.pro.perDay * 31,
    'the monthly cap contradicts the daily allowance the paywall sells',
  );
});

test('disagreements with the paywall are recorded, not silently resolved', async () => {
  const { PRICING_DISCREPANCIES, openPricingDecisions } =
    await import('../src/core/paywall/entitlements.js');
  assert.ok(PRICING_DISCREPANCIES.length >= 3);
  for (const d of PRICING_DISCREPANCIES) {
    assert.ok(d.id && d.paywallSays && d.thisCodeDoes && d.why, `${d.id} incomplete`);
    assert.ok(['HIGH', 'MEDIUM', 'LOW'].includes(d.severity));
  }
  // These are pricing calls, so they stay open until a person makes them.
  assert.equal(openPricingDecisions().length, PRICING_DISCREPANCIES.length);
  assert.ok(PRICING_DISCREPANCIES.some((d) => d.id === 'lifetime-gets-unlimited-ai'),
    'a one-time purchase including the subscription headline feature must be on the record');
});

test('the three tables checked against the printed 2023 book are verified', async () => {
  const { datasetById, isVerified } = await import('../src/core/verification.js');
  for (const id of ['conductor-resistance', 'table-314-16-b', 'table-240-4-d']) {
    const d = datasetById(id);
    assert.equal(isVerified(id), true, `${id} should be verified`);
    assert.equal(d.sourceEdition, '2023');
    assert.ok(d.reviewDate && d.reviewer, `${id} needs a full review record`);
    assert.ok(d.verifiedRows.length >= 1, `${id} must record what was actually read`);
  }
  // The resistance rows are the stranded column, and that is written down.
  assert.match(datasetById('conductor-resistance').verifiedRows[0], /STRANDED/);
  assert.match(datasetById('conductor-resistance').verifiedRows[0], /3\.14/);
  // 240.4(D) records the aluminium rows as present in print but absent here.
  assert.ok(datasetById('table-240-4-d').outstandingRows.some((r) => /alumini/i.test(r)));
});

test('the health dashboard counts verified datasets correctly', async () => {
  const { productHealth, Status } = await import('../src/core/health.js');
  const { DATASETS, isVerified } = await import('../src/core/verification.js');
  const expected = Object.values(DATASETS).filter((d) => isVerified(d.id)).length;
  assert.ok(expected >= 3, 'three tables have been checked against the 2023 book');

  const check = productHealth({ flags: {} }).checks.find((c) => c.label === 'NEC datasets verified');
  assert.match(check.detail, new RegExp(`^${expected}/`),
    'the dashboard must report the same number the register does');
  // Partial means rows read but the table not cleared — never a verified one.
  for (const id of check.partial) assert.equal(isVerified(id), false);
});

// ─── The purchase failure that shipped in build 27 ───────────────────────────

test('a missing product does not tell the user to try again', async () => {
  const { diagnose } = await import('../src/core/paywall/storeDiagnosis.js');
  // "Please try again" is wrong advice: retrying a purchase for an identifier
  // that does not exist fails identically every time, and it sends somebody
  // round a loop believing the fault is theirs.
  const d = diagnose({
    requested: ['a', 'b'], returned: ['a'], wanted: 'b',
  });
  assert.equal(d.retryWorthwhile, false, 'retrying a missing identifier never works');
  assert.doesNotMatch(d.userMessage, /try again/i);
  assert.match(d.userMessage, /nothing has been charged/i, 'say the money is safe');

  // The one case where "try again" IS honest.
  assert.equal(diagnose({ requested: ['a'], returned: [], errorCode: 10 }).retryWorthwhile, true);
});

test('every product failing is diagnosed differently from one product failing', async () => {
  const { diagnose, Cause } = await import('../src/core/paywall/storeDiagnosis.js');
  // This is the whole point of the module. Build 27 showed the same sentence
  // for both, and they are opposite jobs: one is a typo in an identifier, the
  // other cannot be fixed by shipping a build at all.
  const one = diagnose({ requested: ['a', 'b', 'c'], returned: ['a', 'c'], wanted: 'b' });
  const all = diagnose({ requested: ['a', 'b', 'c'], returned: [] });

  assert.equal(one.cause, Cause.IDENTIFIER_MISSING);
  assert.deepEqual([...one.missing], ['b']);
  assert.equal(one.everythingFailed, false);

  // Nothing came back and the SDK said nothing. That is not a verdict.
  assert.equal(all.cause, Cause.INCONCLUSIVE);
  assert.equal(all.everythingFailed, true, 'still a fact worth recording');
  assert.notEqual(one.cause, all.cause, 'one failing and all failing stay distinguishable');

  // An agreement problem is what the SDK SAYS it is, not what we infer.
  const stated = diagnose({ requested: ['a', 'b', 'c'], returned: [], errorCode: 2 });
  assert.equal(stated.cause, Cause.AGREEMENT_OR_BUNDLE);
  assert.equal(stated.fixIsOutsideTheApp, true, 'no build fixes a lapsed agreement');
  assert.match(stated.engineerAction, /Paid Applications/);
  assert.match(stated.engineerAction, /bundle identifier/);
  assert.notEqual(one.userMessage, stated.userMessage, 'a user must not see the same sentence');
  // When everything is down, point at restore — existing purchases still work.
  assert.match(stated.userMessage, /Restore/i);
});

test('an empty store result with no error code never disables a button', async () => {
  const { diagnose, Cause } = await import('../src/core/paywall/storeDiagnosis.js');
  // Build 29 greyed out all three answer packs on TestFlight — the same three
  // identifiers the App Store build sells to the same account every day —
  // because one getProducts call resolved empty and nothing threw. An empty
  // list with no error code is an absence of evidence, and a wrongly dead
  // paywall costs the sale, while an honest error after a tap costs a tap.
  const empty = diagnose({ requested: ['p1', 'p2', 'p3'], returned: [] });
  assert.equal(empty.cause, Cause.INCONCLUSIVE);
  assert.equal(empty.blocksPurchase, false, 'no evidence may not disable a purchase');
  assert.equal(empty.userMessage, null, 'do not tell a buyer something we have not concluded');
  assert.equal(empty.fixIsOutsideTheApp, false, 'do not send anybody to App Store Connect on a guess');

  // Positive evidence still disables: others came back, this one did not.
  const missing = diagnose({ requested: ['p1', 'p2'], returned: ['p1'], wanted: 'p2' });
  assert.equal(missing.blocksPurchase, true);

  // And an SDK that is not present cannot sell anything.
  assert.equal(diagnose({ sdkPresent: false }).blocksPurchase, true);
});

test('the paywall and purchases.js disable by the same rule', async () => {
  const fs = await import('node:fs');
  // Two copies of "can this be bought" drifting apart is how a button gets
  // rendered live and then refuses, or rendered dead while the store would
  // have sold it. Both must consult blocksPurchase.
  for (const f of ['src/SparkPaywall.js', 'src/purchases.js']) {
    assert.match(fs.readFileSync(f, 'utf8'), /blocksPurchase/, `${f} ignores the evidence rule`);
  }
});

test('a product the store refuses to sell is not blamed on the agreement', async () => {
  const { diagnose, Cause, RcErrorCode } = await import('../src/core/paywall/storeDiagnosis.js');
  // Code 5 was unmapped, so it fell through to the empty-list inference and
  // pointed at bank details when the real cause was one product not approved.
  const d = diagnose({
    requested: ['p1'], returned: [], errorCode: RcErrorCode.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE,
  });
  assert.equal(d.cause, Cause.IDENTIFIER_MISSING);
  assert.doesNotMatch(d.engineerAction, /Paid Applications/);
});

test('an error code beats an inference from an empty list', async () => {
  const { diagnose, Cause, RcErrorCode } = await import('../src/core/paywall/storeDiagnosis.js');
  // Zero products came back in all three, but the SDK said why, and what it
  // said is a better answer than what we noticed.
  const base = { requested: ['a'], returned: [] };
  assert.equal(diagnose({ ...base, errorCode: RcErrorCode.NETWORK }).cause, Cause.NO_STORE_CONNECTION);
  assert.equal(diagnose({ ...base, errorCode: RcErrorCode.INVALID_CREDENTIALS }).cause, Cause.BAD_API_KEY);
  assert.equal(diagnose({ ...base, errorCode: RcErrorCode.PURCHASE_NOT_ALLOWED }).cause, Cause.PURCHASE_NOT_ALLOWED);
  assert.equal(diagnose({ ...base, errorCode: RcErrorCode.PRODUCT_ALREADY_PURCHASED }).cause, Cause.ALREADY_OWNED);
  // Already owned routes to restore instead of showing a failure.
  assert.match(diagnose({ ...base, errorCode: RcErrorCode.RECEIPT_ALREADY_IN_USE }).userMessage, /Restore/i);
});

test('an unconfigured SDK is never mistaken for a missing product', async () => {
  const { diagnose, Cause } = await import('../src/core/paywall/storeDiagnosis.js');
  // getProducts on an unconfigured SDK returns nothing, which looks exactly
  // like a product that does not exist. Checking configure() first is what
  // keeps somebody from editing App Store Connect to fix a race in App.js.
  assert.equal(diagnose({ configured: false, requested: ['a'], returned: [] }).cause, Cause.NOT_CONFIGURED);
  assert.equal(diagnose({ sdkPresent: false }).cause, Cause.SDK_ABSENT);
});

test('a healthy store says so, and the debug line carries the identifiers', async () => {
  const { diagnose, diagnosisLine } = await import('../src/core/paywall/storeDiagnosis.js');
  const ok = diagnose({ requested: ['a', 'b'], returned: ['a', 'b'] });
  assert.equal(ok.healthy, true);
  assert.equal(ok.userMessage, null, 'nothing to say when nothing is wrong');

  // A support thread that names the identifiers costs no round trips.
  const line = diagnosisLine(diagnose({ requested: ['a', 'b'], returned: ['a'], wanted: 'b' }));
  assert.match(line, /missing: b/);
  assert.match(line, /asked 2/);
  assert.match(line, /got 1/);
  assert.match(diagnosisLine(null), /No store check/);
});

test('the paywall can ask what is buyable before anyone taps', async () => {
  const src = await import('node:fs').then((fs) => fs.readFileSync('src/purchases.js', 'utf8'));
  // The store already knew, at the moment the paywall opened, that nothing
  // would load. Asking then turns an error after a decision into a disabled
  // button before one.
  assert.match(src, /export async function checkStore/);
  assert.match(src, /export const isProductAvailable/);
  assert.match(src, /export const storeDiagnosis/);
  // The preflight must configure defensively — a paywall opened from a deep
  // link can beat the mount effect, and that reads as a missing product.
  assert.match(src, /await initPurchases\(\);/);
});

test('subscriptions are never asked for by identifier', async () => {
  const src = await import('node:fs').then((fs) => fs.readFileSync('src/purchases.js', 'utf8'));
  // iOS 1.0 (26) has been selling subscriptions since launch and has NEVER
  // passed a subscription identifier to getProducts -- subscriptions come from
  // the current Offering. The branch asked getProducts for everything at once,
  // including an identifier that does not exist in App Store Connect. That is
  // the one difference between the build that sells and the build that does not.
  const list = src.match(/const ONE_TIME_PRODUCT_IDS = \[[\s\S]*?\n\];/);
  assert.ok(list, 'the one-time product list must exist');
  assert.doesNotMatch(list[0], /PRO_ANNUAL|PRO_MONTHLY/,
    'a subscription identifier must never go into getProducts');
  assert.match(list[0], /PACK_15/);
  assert.match(list[0], /LIFETIME_TOOLS/, 'lifetime genuinely is a one-time product');

  // Every getProducts call asks for that list and no other.
  const calls = [...src.matchAll(/getProducts\(([^)]*)\)/g)];
  assert.ok(calls.length > 0, 'getProducts is never called');
  for (const m of calls) {
    const [ids, category] = m[1].split(',').map((a) => a.trim());
    assert.equal(ids, 'ONE_TIME_PRODUCT_IDS', `getProducts asked for ${ids}`);
    // The SDK defaults this argument to SUBSCRIPTION, which is wrong for every
    // product in that list. iOS ignores it; Google Play does not, and would
    // return an empty list for consumables queried as subscriptions.
    assert.equal(category, 'NON_SUBSCRIPTION',
      'one-time products must be queried as non-subscriptions');
  }
});

test('an empty offering does not black out the packs, or the reverse', async () => {
  const { diagnose, Cause } = await import('../src/core/paywall/storeDiagnosis.js');
  // Two sources, two failure modes. Reporting one as the other turns a
  // dashboard edit into a support ticket.
  const offeringDown = diagnose({
    requested: ['pack_a', 'pack_b'], returned: ['pack_a', 'pack_b'], offeringPackages: [],
  });
  assert.equal(offeringDown.cause, Cause.OFFERING_EMPTY);
  assert.equal(offeringDown.subscriptionsSellable, false);
  assert.equal(offeringDown.everythingFailed, false, 'the packs still sell');
  assert.match(offeringDown.engineerAction, /RevenueCat/);
  assert.match(offeringDown.engineerAction, /no build required/i);

  const packsDown = diagnose({
    requested: ['pack_a'], returned: [], offeringPackages: ['sparkconnect_pro_monthly'],
  });
  assert.equal(packsDown.subscriptionsSellable, true, 'subscriptions are unaffected');
  assert.equal(packsDown.everythingFailed, false);

  // Both empty LOOKS like the store-level problem and is not evidence of one:
  // a store that has not answered yet is indistinguishable from here. Recorded
  // as a fact, not a verdict, and nothing gets disabled on it.
  const allDown = diagnose({ requested: ['pack_a'], returned: [], offeringPackages: [] });
  assert.equal(allDown.cause, Cause.INCONCLUSIVE);
  assert.equal(allDown.everythingFailed, true);
  assert.equal(allDown.blocksPurchase, false);

  // No offering check ran: never treated as empty.
  const unknown = diagnose({ requested: ['a'], returned: ['a'], offeringPackages: null });
  assert.equal(unknown.subscriptionsSellable, true);
  assert.equal(unknown.healthy, true);
});

test('the free-answer count in the copy is the one the app enforces', async () => {
  const fs = await import('node:fs');
  const { FREE_LIMITS, Feature } = await import('../src/core/paywall/entitlements.js');
  const src = fs.readFileSync('App.js', 'utf8');

  // The rate-limit message said "You've used your 5 daily free answers" while
  // useGating.js enforces 3 and FREE_LIMITS says 3. So the app cut somebody off
  // after three and told them in writing that they had received five. Whichever
  // number is right, there is only one of it, and it lives where it is checked.
  // The gate no longer types a number at all — it reads the same table the
  // copy does, which is the only way the two cannot drift apart again.
  const gating = fs.readFileSync('src/useGating.js', 'utf8');
  assert.doesNotMatch(gating, /sparky:\s*\d+/, 'useGating hardcodes the allowance again');
  assert.match(gating, /FREE_LIMITS\[Feature\.SPARK_AI\]\.limit/);

  // The message reads the constant rather than spelling a number.
  assert.match(src, /const FREE_ASK_LIMIT = FREE_LIMITS/);
  assert.match(src, /RATE_LIMIT_MESSAGE/);
  assert.doesNotMatch(src, /used your \$\{isPro \? '100 monthly' : '5 daily'\}/,
    'the hardcoded mismatched count is back');
});

test('the estimator asks a question, and it carries the takeoff', async () => {
  const { buildPriceQuestion, takeoffSummary, normalizeZip, priceAskBlocker } =
    await import('../src/core/ai/estimatorAsk.js');

  // The old button sent `material pricing estimate electrician supply 33701
  // THHN wire conduit EMT boxes` — keywords, not a question, and carrying none
  // of the quantities the screen above it promised to price.
  const q = buildPriceQuestion({
    receptacles: 10, switches: 5, lights: 8, fans: 2,
    dedicated: 3, homeRuns: 6, conduitFt: 200, zip: '33701',
  });
  for (const n of ['10 duplex receptacles', '5 single-pole switches', '8 light fixtures',
    '200 ft', '33701']) {
    assert.ok(q.includes(n), `the request never mentions ${n}`);
  }
  assert.match(q, /broken down by line item/, 'one total cannot be checked against a quote');
  assert.match(q, /where you are uncertain/, 'a guessed price must be flagged as one');

  // A zip that is not a zip is dropped, never passed through as prose. Telling
  // a model "my area" invites it to pick one, and a made-up region makes every
  // price in the answer quietly wrong.
  assert.equal(normalizeZip('my area'), null);
  assert.equal(normalizeZip('337'), null);
  assert.equal(normalizeZip(' 33701 '), '33701');
  assert.doesNotMatch(buildPriceQuestion({ receptacles: 4, zip: 'nope' }), /ZIP code|my area/i);

  // Nothing entered is refused at the source rather than sent empty.
  assert.equal(takeoffSummary({}), null);
  assert.equal(buildPriceQuestion({}), null);
  assert.match(priceAskBlocker({}), /Enter at least one quantity/);
  assert.equal(priceAskBlocker({ receptacles: 1 }), null);
});

test('asking for a price never leaves the estimator', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync('App.js', 'utf8');
  // Navigating to the chat tab destroyed the filled-in takeoff — and the
  // takeoff IS the question. Same bug as the Permit Assistant AHJ lookup.
  const btn = src.slice(src.indexOf('Get a SparkAI Price Estimate'),
    src.indexOf('Material prices vary by region'));
  assert.doesNotMatch(btn, /setTab\(/, 'the price ask navigates away from its own question');
  assert.match(src, /askForPrice/);
  assert.match(src, /PRICE_DISCLAIMER/, 'a model-written price must not read like a quote');
});
