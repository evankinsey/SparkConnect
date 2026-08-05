// ─── PAYWALL CONFIG TESTS ────────────────────────────────────────────────────
// Requirements: PWL-02, PWL-03, PWL-05, UI-02..UI-05

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ProductId, PRODUCTS, PACKS, Placement, ALL_PLACEMENTS, Variant,
  formatPrice, monthlyEquivalent, annualSavingPercent, perAnswerCents, bestValuePack,
  copyForPlacement, assignVariant, termsFor, ctaFor, buildPaywall,
  PRO_BENEFITS,
} from '../src/core/paywall/config.js';

test('the CTA always matches the selected plan — the bug that was live', () => {
  // Previously: Annual was badged BEST VALUE while the button said "$7.99/mo"
  // and purchased monthly. The highlighted plan could not be bought.
  const annual = buildPaywall({ selectedProductId: ProductId.PRO_ANNUAL });
  assert.equal(annual.selectedProductId, ProductId.PRO_ANNUAL);
  assert.match(annual.cta.sub, /\$49\.99\/year/);
  assert.ok(!annual.cta.sub.includes('/month'), 'annual CTA must not quote a monthly price');

  const monthly = buildPaywall({ selectedProductId: ProductId.PRO_MONTHLY });
  assert.equal(monthly.selectedProductId, ProductId.PRO_MONTHLY);
  assert.match(monthly.cta.sub, /\$7\.99\/month/);
});

test('UI-03: annual is selected by default', () => {
  const model = buildPaywall({});
  assert.equal(model.selectedProductId, ProductId.PRO_ANNUAL);
  assert.equal(model.plans.find((p) => p.id === ProductId.PRO_ANNUAL).selected, true);
});

test('the saving percentage is computed, never hardcoded', () => {
  // The old paywall said "Save 48%" as a literal string.
  const expected = Math.round(((799 * 12) - 4999) / (799 * 12) * 100);
  assert.equal(annualSavingPercent(), expected);
  assert.equal(expected, 48, 'sanity check against the real prices');

  // Change a price and the number must move on its own.
  const moved = annualSavingPercent({ priceCents: 5999, period: 'YEAR' }, { priceCents: 999, period: 'MONTH' });
  assert.equal(moved, 50);
});

test('the monthly equivalent of annual is shown honestly', () => {
  assert.equal(monthlyEquivalent(PRODUCTS[ProductId.PRO_ANNUAL]), 417);
  assert.equal(formatPrice(417), '$4.17');
  assert.equal(monthlyEquivalent(PRODUCTS[ProductId.PRO_MONTHLY]), null, 'monthly has no equivalent');

  const model = buildPaywall({});
  assert.equal(model.plans.find((p) => p.id === ProductId.PRO_ANNUAL).perMonthLabel, '$4.17/mo');
});

test('PWL-03: trial terms state price, interval, renewal and how to cancel', () => {
  const terms = termsFor(PRODUCTS[ProductId.PRO_ANNUAL]);
  assert.match(terms, /3-day free trial/i);
  assert.match(terms, /\$49\.99 per year/);
  assert.match(terms, /Renews automatically/i);
  assert.match(terms, /Cancel any time/i);
  assert.match(terms, /24 hours before the trial ends/i);
});

test('PWL-03: a one-time purchase is never described as a subscription', () => {
  const terms = termsFor(PRODUCTS[ProductId.LIFETIME_TOOLS]);
  assert.match(terms, /Not a subscription/i);
  assert.ok(!/renews/i.test(terms));
  assert.match(terms, /restored/i);
});

test('UI-04: Lifetime is present but secondary, and hidden in the training variant', () => {
  const model = buildPaywall({ variant: Variant.A_CURRENT });
  assert.ok(model.lifetime, 'Lifetime is offered');
  assert.equal(model.lifetime.priceLabel, '$29.99');
  // It is not in the plan selector — that is what keeps it secondary.
  assert.ok(!model.plans.some((p) => p.id === ProductId.LIFETIME_TOOLS));

  assert.equal(buildPaywall({ variant: Variant.C_TRAINING }).lifetime, null);
});

test('UI-05: no vague benefit copy, and at most five benefits', () => {
  assert.ok(PRO_BENEFITS.length <= 5, 'a short list beats a comparison table');
  for (const b of PRO_BENEFITS) {
    assert.ok(!/priority new features/i.test(b.title), 'the vague promise was removed');
    assert.ok(b.title && b.sub, 'every benefit needs a concrete sub-line');
  }
});

test('App Review: a restore path is always offered', () => {
  assert.equal(buildPaywall({}).showRestore, true);
});

test('TRN-08: every required Superwall placement exists', () => {
  for (const required of [
    'simulation_locked', 'troubleshooting_locked', 'challenge_mode_locked',
    'ai_simulation_explanation', 'progress_history_locked', 'custom_practice_locked',
  ]) {
    assert.ok(ALL_PLACEMENTS.includes(required), `missing placement ${required}`);
  }
});

test('every placement has distinct, contextual copy', () => {
  const headlines = new Set();
  for (const p of ALL_PLACEMENTS) {
    const copy = copyForPlacement(p);
    assert.ok(copy.eyebrow && copy.headline && copy.sub, `${p} needs full copy`);
    assert.ok(!/^upgrade to pro$/i.test(copy.headline), `${p} must not use generic copy`);
    headlines.add(copy.headline);
  }
  assert.equal(headlines.size, ALL_PLACEMENTS.length, 'each placement gets its own headline');
});

test('an unknown placement falls back rather than rendering blank', () => {
  const copy = copyForPlacement('not_a_real_placement');
  assert.ok(copy.headline.length > 0);
});

test('PWL-02: variant assignment is stable per user and spread across variants', () => {
  const variants = [Variant.A_CURRENT, Variant.B_FIRST_WIN, Variant.D_TRIAL_FORWARD];
  assert.equal(assignVariant('user-123', variants), assignVariant('user-123', variants),
    'the same user must always see the same variant');

  const seen = new Set();
  for (let i = 0; i < 300; i++) seen.add(assignVariant(`user-${i}`, variants));
  assert.equal(seen.size, 3, 'all variants get traffic');

  assert.equal(assignVariant('anyone', []), Variant.A_CURRENT, 'empty config falls back safely');
});

test('the best-value pack is computed from unit price, so the tag cannot be wrong', () => {
  assert.equal(bestValuePack().id, ProductId.PACK_150);
  assert.equal(perAnswerCents(PACKS[0]), 13);
  assert.equal(perAnswerCents(PACKS[2]), 7);

  const inverted = [
    { id: 'a', answers: 10, priceCents: 100 },
    { id: 'b', answers: 10, priceCents: 500 },
  ];
  assert.equal(bestValuePack(inverted).id, 'a');
});

test('price formatting stays clean for whole and part dollars', () => {
  assert.equal(formatPrice(4999), '$49.99');
  assert.equal(formatPrice(800), '$8');
  assert.equal(formatPrice(0), '$0');
  assert.equal(formatPrice('nope'), '$0');
});

test('the CTA leads with the trial when one exists', () => {
  assert.match(ctaFor(PRODUCTS[ProductId.PRO_ANNUAL]).title, /Start 3-Day Free Trial/);
  assert.match(ctaFor(PRODUCTS[ProductId.LIFETIME_TOOLS]).title, /Buy Lifetime Tools — \$29\.99/);
  assert.match(ctaFor({ period: 'MONTH', priceCents: 799, trialDays: 0 }).title, /\$7\.99\/month/);
});

test('a full paywall model is renderable for every placement and variant', () => {
  for (const placement of ALL_PLACEMENTS) {
    for (const variant of Object.values(Variant)) {
      const m = buildPaywall({ placement, variant });
      assert.ok(m.copy.headline, `${placement}/${variant} headline`);
      assert.equal(m.plans.length, 2, `${placement}/${variant} plans`);
      assert.ok(m.cta.title, `${placement}/${variant} cta`);
      assert.ok(m.terms.length > 30, `${placement}/${variant} terms`);
    }
  }
});
