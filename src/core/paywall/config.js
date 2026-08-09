// ─── PAYWALL CONFIGURATION ───────────────────────────────────────────────────
// Requirements: PWL-01 … PWL-05, UI-02, UI-03, UI-04, UI-05, TRN-08
//
// Pricing, copy and variant logic live here as pure data so they are testable
// and so the paywall component only renders. The audit found the paywall
// highlighting Annual as "BEST VALUE" while the button charged Monthly — the
// kind of bug that survives when pricing lives inside JSX.
//
// App Store rule this file enforces: price, billing interval, renewal and
// cancellation terms must be stated wherever a trial is offered (PWL-03).

import { proAskAllowanceLabel, freeAskAllowanceLabel } from './entitlements.js';

export const ProductId = {
  // MUST match App Store Connect exactly. The shipping build on the App Store
  // sells the annual plan as `sparkconnect_pro_yearly`, and that build takes
  // money successfully today — so `_yearly` is the identifier proven to exist.
  // An earlier rewrite here renamed it to `_annual`, which no store product
  // answers to: the offerings path still worked (it matches on PACKAGE_TYPE,
  // not on the id) but the direct-purchase fallback silently found nothing.
  // That fallback exists precisely because offerings had been misconfigured
  // before, so the one path meant to survive that was the one that broke.
  PRO_ANNUAL: 'sparkconnect_pro_yearly',
  PRO_MONTHLY: 'sparkconnect_pro_monthly',
  LIFETIME_TOOLS: 'sparkconnect_lifetime_tools',
  // Legacy identifiers. The number in the id is NOT the number of answers —
  // these were created before the packs were resized and renaming a live
  // product is not possible. `PACKS` below is the source of truth for what a
  // buyer actually receives.
  PACK_15: 'sparky_answers_10',
  PACK_50: 'sparky_answers_30',
  PACK_150: 'sparky_answers_100',
};

/**
 * Identifiers we will also accept from the store for the same plan.
 *
 * Renaming a product in App Store Connect is not possible once it has sold, so
 * a plan can legitimately answer to an older id. Asking for every alias costs
 * one array entry and removes a class of silent purchase failure — the lookup
 * takes whichever the store actually returns.
 */
export const PRODUCT_ALIASES = Object.freeze({
  [ProductId.PRO_ANNUAL]: Object.freeze(['sparkconnect_pro_yearly', 'sparkconnect_pro_annual']),
  [ProductId.PRO_MONTHLY]: Object.freeze(['sparkconnect_pro_monthly']),
  [ProductId.LIFETIME_TOOLS]: Object.freeze(['sparkconnect_lifetime_tools']),
  [ProductId.PACK_15]: Object.freeze(['sparky_answers_10']),
  [ProductId.PACK_50]: Object.freeze(['sparky_answers_30']),
  [ProductId.PACK_150]: Object.freeze(['sparky_answers_100']),
});

/** Every identifier worth asking the store about. */
export const ALL_STORE_IDS = Object.freeze([...new Set(Object.values(PRODUCT_ALIASES).flat())]);

/** Does this store product satisfy the plan we asked for? */
export const matchesProduct = (productId, storeIdentifier) =>
  (PRODUCT_ALIASES[productId] ?? [productId]).includes(storeIdentifier);

// Prices in cents. RevenueCat is the source of truth at runtime — these are the
// display fallbacks and the basis for the "per month" maths, so they must match
// App Store Connect exactly.
export const PRODUCTS = Object.freeze({
  [ProductId.PRO_ANNUAL]: {
    id: ProductId.PRO_ANNUAL,
    label: 'Annual',
    priceCents: 4999,
    period: 'YEAR',
    trialDays: 3,
    recommended: true,          // UI-03 — annual is the default recommendation
  },
  [ProductId.PRO_MONTHLY]: {
    id: ProductId.PRO_MONTHLY,
    label: 'Monthly',
    priceCents: 799,
    period: 'MONTH',
    trialDays: 3,
    recommended: false,
  },
  [ProductId.LIFETIME_TOOLS]: {
    id: ProductId.LIFETIME_TOOLS,
    label: 'Lifetime Tools',
    priceCents: 2999,
    period: 'ONE_TIME',
    trialDays: 0,
    recommended: false,
  },
});

export const PACKS = Object.freeze([
  { id: ProductId.PACK_15, label: '15 Answers', priceCents: 199, answers: 15, tag: null },
  { id: ProductId.PACK_50, label: '50 Answers', priceCents: 499, answers: 50, tag: 'Popular' },
  { id: ProductId.PACK_150, label: '150 Answers', priceCents: 999, answers: 150, tag: 'Best Value' },
]);

// ─── Price maths ─────────────────────────────────────────────────────────────

export const formatPrice = (cents) => {
  const n = Number.isInteger(cents) ? cents : 0;
  return n % 100 === 0 ? `$${n / 100}` : `$${(n / 100).toFixed(2)}`;
};

/** Monthly equivalent of an annual plan, for the honest comparison (UI-03). */
export const monthlyEquivalent = (product) => {
  if (product.period !== 'YEAR') return null;
  return Math.round(product.priceCents / 12);
};

/**
 * Annual saving versus paying monthly for a year.
 * Computed, never hardcoded — the old paywall claimed "Save 48%" as a static
 * string, which silently becomes a lie the moment either price changes.
 */
export const annualSavingPercent = (annual = PRODUCTS[ProductId.PRO_ANNUAL], monthly = PRODUCTS[ProductId.PRO_MONTHLY]) => {
  const yearOfMonthly = monthly.priceCents * 12;
  if (!yearOfMonthly) return 0;
  return Math.round(((yearOfMonthly - annual.priceCents) / yearOfMonthly) * 100);
};

export const perAnswerCents = (pack) =>
  pack.answers > 0 ? Math.round(pack.priceCents / pack.answers) : 0;

/** Best value pack by unit price — computed, so the tag can never be wrong. */
export const bestValuePack = (packs = PACKS) =>
  packs.reduce((best, p) => (perAnswerCents(p) < perAnswerCents(best) ? p : best), packs[0]);

// ─── Placements (TRN-08) ─────────────────────────────────────────────────────
// Names must match the Superwall dashboard exactly.

export const Placement = {
  SIMULATION_LOCKED: 'simulation_locked',
  TROUBLESHOOTING_LOCKED: 'troubleshooting_locked',
  CHALLENGE_MODE_LOCKED: 'challenge_mode_locked',
  AI_SIMULATION_EXPLANATION: 'ai_simulation_explanation',
  PROGRESS_HISTORY_LOCKED: 'progress_history_locked',
  CUSTOM_PRACTICE_LOCKED: 'custom_practice_locked',
  AI_LIMIT_REACHED: 'ai_limit_reached',
  CALCULATOR_LIMIT_REACHED: 'calculator_limit_reached',
  EXPORT_LIMIT_REACHED: 'export_limit_reached',
  JOB_CAM_LIMIT_REACHED: 'job_cam_limit_reached',
  SETTINGS_UPGRADE: 'settings_upgrade',
  ONBOARDING_COMPLETE: 'onboarding_complete',
};

export const ALL_PLACEMENTS = Object.values(Placement);

/**
 * Headline copy per placement.
 *
 * A paywall that says "Upgrade to Pro" regardless of context wastes the one
 * moment the user has already told you what they want. Each headline names the
 * thing they just reached for.
 */
export const PLACEMENT_COPY = Object.freeze({
  [Placement.SIMULATION_LOCKED]: {
    eyebrow: 'Wiring Simulator',
    headline: 'Keep going in the Wiring Simulator',
    sub: 'You finished the free lesson. Pro unlocks every wiring and troubleshooting lesson.',
  },
  [Placement.TROUBLESHOOTING_LOCKED]: {
    eyebrow: 'Troubleshooting',
    headline: 'Diagnose the whole catalog',
    sub: 'Real service-call scenarios with the fault derived from a real circuit.',
  },
  [Placement.CHALLENGE_MODE_LOCKED]: {
    eyebrow: 'Challenge Mode',
    headline: 'Beat the clock',
    sub: 'Timed challenges, par times, and a score worth sharing.',
  },
  [Placement.AI_SIMULATION_EXPLANATION]: {
    eyebrow: 'SparkAI',
    headline: 'Find out why that circuit failed',
    sub: 'SparkAI explains the fault, what to inspect, and the mistake most people make.',
  },
  [Placement.PROGRESS_HISTORY_LOCKED]: {
    eyebrow: 'Progress',
    headline: 'See how far you have come',
    sub: 'Full attempt history, weak areas, and scores over time.',
  },
  [Placement.CUSTOM_PRACTICE_LOCKED]: {
    eyebrow: 'Custom Practice',
    headline: 'Practise exactly what you keep missing',
    sub: 'Build your own sets from the topics you get wrong.',
  },
  [Placement.AI_LIMIT_REACHED]: {
    eyebrow: 'SparkAI',
    headline: 'Out of answers for today',
    sub: `Pro gives you ${proAskAllowanceLabel()}, with your calculator and job already in context.`,
  },
  [Placement.CALCULATOR_LIMIT_REACHED]: {
    eyebrow: 'Calculators',
    headline: 'Unlimited calculations',
    sub: 'Every calculator, no daily cap, results saved to the job.',
  },
  [Placement.EXPORT_LIMIT_REACHED]: {
    eyebrow: 'Documents',
    headline: 'Send as many invoices as you need',
    sub: 'Unlimited PDF exports, and your branding instead of ours.',
  },
  [Placement.JOB_CAM_LIMIT_REACHED]: {
    eyebrow: 'Job Cam',
    headline: 'Document every job',
    sub: 'Unlimited projects, folders, tags and before/after records.',
  },
  [Placement.SETTINGS_UPGRADE]: {
    eyebrow: 'SparkConnect Pro',
    headline: 'The complete field workflow',
    sub: 'Calculate, ask SparkAI, save it to the job, and turn it into paperwork that gets you paid.',
  },
  [Placement.ONBOARDING_COMPLETE]: {
    eyebrow: 'Nice work',
    headline: 'That is one of about forty tools',
    sub: 'Pro opens the rest, plus the Wiring Simulator and unlimited SparkAI.',
  },
});

export const copyForPlacement = (placement) =>
  PLACEMENT_COPY[placement] ?? PLACEMENT_COPY[Placement.SETTINGS_UPGRADE];

// ─── Benefits (UI-02, UI-05) ─────────────────────────────────────────────────
// Five, maximum. The old paywall put a comparison table above the price, which
// is a spreadsheet between the user and their wallet.
//
// "Priority new features" was removed — UI-05. It promised nothing specific.

// Each line sells the outcome, with the concrete mechanism in the sub-line —
// "what you get out of it", not "what we built" (UI-05 still applies: no
// vague promises, every benefit has a specific sub).
export const PRO_BENEFITS = Object.freeze([
  { icon: 'flash', title: 'Get unstuck in the field, fast', sub: `${proAskAllowanceLabel()}, your job in context` },
  { icon: 'calculator', title: 'Never lose another calculation', sub: 'Every calculator unlimited, history saved to the job' },
  { icon: 'school', title: 'Wire it wrong here, not on the job', sub: 'Full wiring & troubleshooting simulator' },
  { icon: 'camera', title: 'Save thousands documenting every job', sub: 'Unlimited Job Cam, your branding on exports' },
  { icon: 'time', title: 'Walk back into any job cold', sub: 'Photos, numbers and notes right where you left them' },
]);

export const LIFETIME_BENEFITS = Object.freeze([
  'Core calculators forever',
  freeAskAllowanceLabel(),
  '25 Job Cam projects',
  '5 invoice exports a month',
]);

// ─── Experiment variants (PWL-02) ────────────────────────────────────────────

export const Variant = {
  A_CURRENT: 'A_CURRENT',       // existing freemium limits
  B_FIRST_WIN: 'B_FIRST_WIN',   // paywall after one meaningful action
  C_TRAINING: 'C_TRAINING',     // foundational lesson free, catalog paid
  D_TRIAL_FORWARD: 'D_TRIAL_FORWARD',
};

export const VARIANT_CONFIG = Object.freeze({
  A_CURRENT: { defaultProduct: ProductId.PRO_ANNUAL, leadWithTrial: false, showLifetime: true },
  B_FIRST_WIN: { defaultProduct: ProductId.PRO_ANNUAL, leadWithTrial: false, showLifetime: true },
  C_TRAINING: { defaultProduct: ProductId.PRO_ANNUAL, leadWithTrial: false, showLifetime: false },
  D_TRIAL_FORWARD: { defaultProduct: ProductId.PRO_ANNUAL, leadWithTrial: true, showLifetime: true },
});

/**
 * Stable per-user variant assignment. Same user always sees the same variant,
 * so an experiment measures the variant rather than measuring reshuffling.
 * Deterministic hash — no storage, no network.
 */
export const assignVariant = (anonymousId, enabledVariants = [Variant.A_CURRENT]) => {
  if (!enabledVariants.length) return Variant.A_CURRENT;
  const s = String(anonymousId ?? '');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return enabledVariants[h % enabledVariants.length];
};

// ─── Legal copy (PWL-03) ─────────────────────────────────────────────────────

/**
 * Terms shown under the CTA. Must state price, interval, renewal and how to
 * cancel. Generated from the product so it can never drift out of sync with
 * what the user is actually charged.
 */
export const termsFor = (product) => {
  if (!product) return '';
  if (product.period === 'ONE_TIME') {
    return `${formatPrice(product.priceCents)} once. Not a subscription. Purchases are managed by the App Store and can be restored on any device.`;
  }
  const interval = product.period === 'YEAR' ? 'year' : 'month';
  const price = formatPrice(product.priceCents);
  if (product.trialDays > 0) {
    return `${product.trialDays}-day free trial, then ${price} per ${interval}. ` +
      `Renews automatically until cancelled. Cancel any time in your App Store account settings, ` +
      `at least 24 hours before the trial ends to avoid being charged.`;
  }
  return `${price} per ${interval}. Renews automatically until cancelled. ` +
    'Cancel any time in your App Store account settings.';
};

/**
 * The CTA label. Derived from the SELECTED product, which is the bug that was
 * live: the button said "Start 3-Day Free Trial … then $7.99/mo" while Annual
 * was highlighted, and it purchased monthly whatever the user picked.
 */
export const ctaFor = (product) => {
  if (!product) return { title: 'Continue', sub: '' };
  if (product.period === 'ONE_TIME') {
    return { title: `Buy ${product.label} — ${formatPrice(product.priceCents)}`, sub: 'One-time purchase' };
  }
  const interval = product.period === 'YEAR' ? 'year' : 'month';
  if (product.trialDays > 0) {
    return {
      title: `Start ${product.trialDays}-Day Free Trial`,
      sub: `Then ${formatPrice(product.priceCents)}/${interval} · Cancel any time`,
    };
  }
  return {
    title: `Continue — ${formatPrice(product.priceCents)}/${interval}`,
    sub: 'Cancel any time',
  };
};

/** Everything the paywall screen needs, assembled in one place. */
export const buildPaywall = ({
  placement = Placement.SETTINGS_UPGRADE,
  variant = Variant.A_CURRENT,
  selectedProductId = null,
} = {}) => {
  const config = VARIANT_CONFIG[variant] ?? VARIANT_CONFIG.A_CURRENT;
  const selected = PRODUCTS[selectedProductId] ?? PRODUCTS[config.defaultProduct];
  const annual = PRODUCTS[ProductId.PRO_ANNUAL];
  const monthly = PRODUCTS[ProductId.PRO_MONTHLY];

  return {
    placement,
    variant,
    copy: copyForPlacement(placement),
    benefits: PRO_BENEFITS,
    plans: [
      {
        ...annual,
        priceLabel: formatPrice(annual.priceCents),
        perMonthLabel: `${formatPrice(monthlyEquivalent(annual))}/mo`,
        savingPercent: annualSavingPercent(annual, monthly),
        selected: selected.id === annual.id,
      },
      {
        ...monthly,
        priceLabel: formatPrice(monthly.priceCents),
        perMonthLabel: null,
        savingPercent: 0,
        selected: selected.id === monthly.id,
      },
    ],
    lifetime: config.showLifetime
      ? { ...PRODUCTS[ProductId.LIFETIME_TOOLS], priceLabel: formatPrice(PRODUCTS[ProductId.LIFETIME_TOOLS].priceCents), benefits: LIFETIME_BENEFITS }
      : null,
    selectedProductId: selected.id,
    cta: ctaFor(selected),
    terms: termsFor(selected),
    // App Review requires a visible restore path on any screen selling a
    // non-consumable or subscription.
    showRestore: true,
  };
};
