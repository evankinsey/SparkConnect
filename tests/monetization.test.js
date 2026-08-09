// ─── THE MONETIZATION MATRIX ─────────────────────────────────────────────────
// Decided 9 Aug 2026. These tests exist so the numbers cannot drift again — the
// audit that produced them found four different figures for one allowance.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  ASK_ALLOWANCE, FREE_LIMITS, PRO_LIMITS, Feature, FREE_PROJECT_LIMIT,
  LIFETIME_ENTITLEMENT, usageLabel, proAskAllowanceLabel, freeAskAllowanceLabel,
  PRICING_DISCREPANCIES,
} from '../src/core/paywall/entitlements.js';
import {
  Source, SOURCES, heroFor, HEROES, DEFAULT_HERO, PILLARS, FREE_FOREVER,
  ctaFor, TRIAL_DAYS, paywallEvent,
} from '../src/core/paywall/contexts.js';
import { ProductId, PACKS, PRODUCT_ALIASES, PRODUCTS } from '../src/core/paywall/config.js';
import { CREDITS_ENABLED } from '../src/core/paywall/registry.js';

// ─── The agreed numbers ──────────────────────────────────────────────────────

test('the allowance matrix is exactly what was decided', () => {
  assert.equal(ASK_ALLOWANCE.free.perDay, 5, 'free is not 5/day');
  assert.equal(ASK_ALLOWANCE.pro.perDay, 10, 'Pro is not 10/day');
  assert.equal(ASK_ALLOWANCE.pro.monthlyBackstop, 250, 'the Pro monthly backstop is not 250');
  assert.equal(ASK_ALLOWANCE.lifetime.perDay, 5, 'Lifetime is not on the free allowance');

  // And the gate reads the table rather than a typed number.
  assert.equal(FREE_LIMITS[Feature.SPARK_AI].limit, ASK_ALLOWANCE.free.perDay);
  assert.equal(PRO_LIMITS[Feature.SPARK_AI].limit, ASK_ALLOWANCE.pro.perDay);
});

test('the monthly backstop is an abuse ceiling, not a second allowance', () => {
  // Deliberately BELOW daily x 31. That is only safe because the backstop is
  // never advertised — the old 20/day + 400/month shape put a daily number on
  // the paywall that the monthly one cancelled two thirds through the month.
  assert.ok(ASK_ALLOWANCE.pro.monthlyBackstop < ASK_ALLOWANCE.pro.perDay * 31);
  // So it must not appear in anything sold.
  const sold = JSON.stringify([PILLARS, HEROES, DEFAULT_HERO, FREE_FOREVER]);
  assert.doesNotMatch(sold, /250/, 'the fair-use ceiling is being advertised as a benefit');
  assert.match(proAskAllowanceLabel(), /^10 SparkAI answers a day$/);
});

test('Lifetime never quietly becomes Pro', () => {
  // $29.99 once cannot fund an indefinitely recurring model expense.
  assert.equal(LIFETIME_ENTITLEMENT.unlimitedAi, false);
  assert.equal(LIFETIME_ENTITLEMENT.becomesPro, false);
  assert.equal(LIFETIME_ENTITLEMENT.aiPerDay, ASK_ALLOWANCE.free.perDay);
  // The escape hatch stays visible until somebody actually reads the listing.
  assert.equal(LIFETIME_ENTITLEMENT.historicalPromiseVerified, false,
    'if this is now true, the historical promise must be recorded alongside it');
});

test('the free project limit is one number', () => {
  assert.equal(FREE_PROJECT_LIMIT, 1);
  assert.equal(FREE_LIMITS[Feature.JOB_CAM].limit, FREE_PROJECT_LIMIT);
});

test('the everyday calculators are free and are not sold as Pro', () => {
  // They are the distribution engine. "Download, tap bender, pay us" converts
  // nobody and gets deleted.
  assert.equal(FREE_LIMITS[Feature.CALCULATOR].limit, null);
  const sold = JSON.stringify([PILLARS, HEROES]);
  assert.doesNotMatch(sold, /unlimited calculat|all calculators|advanced calculators/i,
    'the paywall is selling calculators the app gives away');
  assert.match(FREE_FOREVER.join(' '), /Pipe bending/i, 'the paywall never says what stays free');
});

test('no screen hardcodes an allowance', () => {
  for (const f of [
    'src/core/onboarding/flow.js', 'src/core/paywall/config.js',
    'src/core/paywall/contexts.js', 'src/useGating.js',
  ]) {
    const src = fs.readFileSync(f, 'utf8');
    assert.doesNotMatch(src, /\b(10|5|250)\s+(SparkAI\s+)?answers\b/i, `${f} types an allowance`);
  }
});

// ─── Usage UI ────────────────────────────────────────────────────────────────

test('usage leads with the day and mentions the month only when it matters', () => {
  const early = usageLabel({ usedToday: 2, usedThisMonth: 12, isPro: true });
  assert.equal(early.daily, '8 of 10 answers remaining today');
  assert.equal(early.monthly, null, 'a ceiling nobody will reach is being quoted');

  const near = usageLabel({ usedToday: 2, usedThisMonth: 238, isPro: true });
  assert.match(near.monthly, /238 of 250 included answers used this month/);

  const free = usageLabel({ usedToday: 5, isPro: false });
  assert.equal(free.daily, '0 of 5 answers remaining today');
  assert.equal(free.exhausted, true);

  // Purchased answers are shown separately, never merged into the allowance.
  assert.match(usageLabel({ usedToday: 5, purchased: 15 }).purchased, /\+ 15 purchased answers/);
  assert.equal(usageLabel({}).purchased, null);
  assert.ok(usageLabel(undefined).daily);
});

// ─── Legacy purchase protection ──────────────────────────────────────────────

test('the lying pack SKUs are preserved exactly', () => {
  // sparky_answers_10 grants 15. The number in the id is not the number of
  // answers — they predate a resize and a live product cannot be renamed.
  // This is compatibility now, not a bug.
  assert.equal(ProductId.PACK_15, 'sparky_answers_10');
  assert.equal(ProductId.PACK_50, 'sparky_answers_30');
  assert.equal(ProductId.PACK_150, 'sparky_answers_100');

  const byId = Object.fromEntries(PACKS.map((p) => [p.id, p]));
  assert.equal(byId[ProductId.PACK_15].answers, 15, 'the historical grant amount changed');
  assert.equal(byId[ProductId.PACK_50].answers, 50);
  assert.equal(byId[ProductId.PACK_150].answers, 150);

  assert.equal(byId[ProductId.PACK_15].priceCents, 199);
  assert.equal(byId[ProductId.PACK_50].priceCents, 499);
  assert.equal(byId[ProductId.PACK_150].priceCents, 999);
});

test('subscription identifiers are untouched', () => {
  assert.equal(ProductId.PRO_ANNUAL, 'sparkconnect_pro_yearly');
  assert.equal(ProductId.PRO_MONTHLY, 'sparkconnect_pro_monthly');
  assert.equal(PRODUCTS[ProductId.PRO_MONTHLY].priceCents, 799);
  assert.equal(PRODUCTS[ProductId.PRO_ANNUAL].priceCents, 4999);
  // The older annual alias stays, so a product created under it still resolves.
  assert.ok(PRODUCT_ALIASES[ProductId.PRO_ANNUAL].includes('sparkconnect_pro_annual'));
});

test('credits stay off', () => {
  assert.equal(CREDITS_ENABLED, false, 'a customer-facing token economy was switched on');
});

// ─── Contextual paywall ──────────────────────────────────────────────────────

test('every entry point has its own argument', () => {
  const seen = new Set();
  for (const s of SOURCES) {
    const h = heroFor(s);
    assert.ok(h.headline && h.sub, `${s} has no pitch`);
    if (s !== Source.SETTINGS) {
      assert.ok(!seen.has(h.headline), `${s} reuses another source's headline`);
      seen.add(h.headline);
    }
  }
  // Unknown sources still produce a working paywall.
  assert.deepEqual(heroFor('nonsense'), DEFAULT_HERO);
  assert.deepEqual(heroFor(undefined), DEFAULT_HERO);
});

test('the offer never changes with the entry point, only the pitch', () => {
  // A paywall whose OFFER changes by where you came from is a dark pattern.
  // Price and product live in config.js and nothing here can touch them.
  const src = fs.readFileSync('src/core/paywall/contexts.js', 'utf8');
  assert.doesNotMatch(src, /priceCents|\$\d|discount|% off/i,
    'the contextual layer is reaching into pricing');
});

test('Pro is not sold as an AI subscription', () => {
  // The app is much bigger than its assistant.
  assert.equal(PILLARS.length, 4);
  assert.match(DEFAULT_HERO.headline, /entire electrical field kit/i);
  const ids = PILLARS.map((p) => p.id);
  assert.deepEqual(ids, ['sparkai', 'training', 'projects', 'tools']);
  // Three of four pillars are not about AI.
  assert.equal(PILLARS.filter((p) => /SPARKAI/.test(p.title)).length, 1);
});

test('a trial is never promised to somebody who cannot have one', () => {
  // Promising one produces a purchase sheet that contradicts the button just
  // pressed. Eligibility comes from StoreKit and there is no default of true.
  assert.equal(ctaFor().showsTrial, false, 'a trial is offered by default');
  assert.equal(ctaFor({ eligible: false, plan: 'annual' }).showsTrial, false);
  assert.equal(ctaFor({ eligible: true, plan: 'monthly' }).showsTrial, false, 'monthly got a trial');
  const yes = ctaFor({ eligible: true, plan: 'annual' });
  assert.equal(yes.showsTrial, true);
  assert.match(yes.label, new RegExp(`${TRIAL_DAYS}-Day Free Trial`));
  assert.match(ctaFor({}).label, /Unlock SparkConnect Pro/);
});

test('paywall analytics carry the source and nothing private', () => {
  const e = paywallEvent({ source: Source.JOB_SITE, isPro: false });
  assert.equal(e.event, 'paywall_viewed');
  assert.equal(e.source, 'job_site');
  // No question text, no photo, no project.
  assert.deepEqual(Object.keys(e).sort(), ['alreadyPro', 'event', 'plan', 'source']);
  assert.equal(paywallEvent({ source: 'made_up' }).source, Source.SETTINGS);
});

// ─── The record ──────────────────────────────────────────────────────────────

test('every audit item was resolved rather than dropped', () => {
  const ids = ['pro-ai-allowance-unresolved', 'calculators-advertised-as-pro',
    'lifetime-gets-unlimited-ai', 'jobcam-project-count'];
  for (const id of ids) {
    const d = PRICING_DISCREPANCIES.find((x) => x.id === id);
    assert.ok(d, `${id} vanished from the record instead of being resolved`);
    assert.match(d.decision, /^RESOLVED/, `${id} is still open`);
  }
  // The one that still blocks the build says so.
  const server = PRICING_DISCREPANCIES.find((x) => x.id === 'pro-ai-allowance-unresolved');
  assert.match(server.decision, /OUTSTANDING AND BLOCKING/);
  assert.match(server.decision, /api\/ask-nec/);
});

test('the paywall renders four pillars and says what stays free', async () => {
  const src = fs.readFileSync('src/SparkPaywall.js', 'utf8');
  assert.match(src, /pillars/, 'the paywall does not render the pillars');
  assert.match(src, /freeForever/, 'the paywall never says what stays free');
  // The hero is contextual, with the static copy as the fallback.
  assert.match(src, /hero\?\.headline \|\| copy\.headline/);
});

test('the packs are named for what they are', async () => {
  const src = fs.readFileSync('App.js', 'utf8');
  // Only what a user can read. Scanning the whole file matched a source comment
  // and reported it as shipped copy, which is a false positive that trains
  // people to ignore the test.
  const rendered = [...src.matchAll(/(?:title|text|label)=["'{]([^"'}]{3,80})["'}]/g)].map((m) => m[1])
    .concat([...src.matchAll(/<Text[^>]*>([^<{]{3,80})</g)].map((m) => m[1]));
  const blob = rendered.join(' | ');
  assert.doesNotMatch(blob, /Query Pack/i, '"Query Packs" survived the rename');
  assert.match(blob, /SparkAI Answer Packs/);
});

// ─── Purchases have to actually work ─────────────────────────────────────────

test('a trial is never promised before StoreKit confirms eligibility', async () => {
  const { buildPaywall, ctaFor, termsFor, PRODUCTS, ProductId } =
    await import('../src/core/paywall/config.js');
  const { diagnose } = await import('../src/core/paywall/storeDiagnosis.js');

  // The default at EVERY layer is false. A trial offered to somebody who has
  // already used one opens a sheet that charges immediately and contradicts the
  // button they just pressed — a refund request and an App Review rejection.
  assert.equal(diagnose({}).trialEligible, false, 'the diagnosis defaults to eligible');
  assert.equal(buildPaywall({}).trialEligible, false, 'the paywall model defaults to eligible');
  assert.doesNotMatch(buildPaywall({}).cta.title, /trial/i);
  assert.doesNotMatch(buildPaywall({}).terms, /trial/i);

  // Only annual carries it, and only when confirmed.
  assert.match(buildPaywall({ trialEligible: true }).cta.title, /7-Day Free Trial/);
  assert.doesNotMatch(
    ctaFor(PRODUCTS[ProductId.PRO_MONTHLY], { trialEligible: true }).title, /trial/i,
    'monthly was given a trial',
  );
  // The disclosure always matches what will be charged.
  assert.doesNotMatch(termsFor(PRODUCTS[ProductId.PRO_ANNUAL]), /trial/i);
});

test('an unverified product is never offered for sale', async () => {
  const { buildPaywall } = await import('../src/core/paywall/config.js');
  // sparkconnect_lifetime_tools has never been confirmed in App Store Connect.
  // A plan that cannot be bought is the failure that broke builds 27, 28 and 29.
  assert.equal(buildPaywall({}).lifetime, null);
  assert.ok(buildPaywall({ lifetimeConfirmed: true }).lifetime);

  const src = fs.readFileSync('src/SparkPaywall.js', 'utf8');
  // Confirmation comes from what the store RETURNED, not from a constant.
  assert.match(src, /lifetimeConfirmed: !!store\?\.returned/);
  assert.match(src, /trialEligible: store\?\.trialEligible === true/);
});

test('eligibility is read from the store, and UNKNOWN counts as no', async () => {
  const src = fs.readFileSync('src/purchases.js', 'utf8');
  assert.match(src, /checkTrialOrIntroductoryPriceEligibility/);
  // Status 2 is ELIGIBLE. 0 is UNKNOWN and must not be treated as yes.
  assert.match(src, /Number\(e\?\.status\) === 2/);
  assert.match(src, /let trialEligible = false/);
});
