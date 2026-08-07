// ─── FEATURE REGISTRY + ACCESS ENGINE ────────────────────────────────────────
// One declaration per feature, one function that decides access, one matrix
// that prints what the app actually does.
//
// entitlements.js already put the free limits in one place. What it could not
// answer is everything AROUND a limit: which tier a feature belongs to, whether
// a credit can unlock it, whether it can be changed over the air or needs a
// build, and whether it depends on a store product existing. Those answers were
// spread across screens, config and memory, which is how a pricing page and a
// gate end up disagreeing in public.
//
// THE RULE THAT MATTERS MOST HERE: this refactor must not quietly tighten the
// free tier. The registry inherits the shipped FREE_LIMITS rather than restating
// them, and a test asserts the two agree — so "centralise the entitlements"
// cannot become "charge for something that was free yesterday" by accident.
// Restrictions get activated deliberately, one at a time, with a decision
// behind each. Generous stays generous until somebody changes it on purpose.
//
// Spark Credits ship OFF. The infrastructure is here so the switch is a config
// change rather than a release, and `CREDITS_ENABLED` is the only thing between
// the two.
//
// Pure module: no React, no storage, no RevenueCat.

import { Feature, FREE_LIMITS, Grant, GATE_COPY, gateCopyFor } from './entitlements.js';
import { ProductId } from './config.js';

// ─── Tiers ───────────────────────────────────────────────────────────────────

export const Tier = Object.freeze({
  FREE: 'FREE',
  LIFETIME: 'LIFETIME',   // one-time Tools purchase: calculators forever, no AI allowance
  PRO: 'PRO',
});

export const TIER_LABEL = Object.freeze({
  FREE: 'Free', LIFETIME: 'Lifetime Tools', PRO: 'Pro',
});

export const TIER_RANK = Object.freeze({ FREE: 0, LIFETIME: 1, PRO: 2 });

/** A tier string from anywhere — storage, RevenueCat, a test — made safe. */
export const normalizeTier = (tier) =>
  (Object.prototype.hasOwnProperty.call(Tier, tier) ? tier : Tier.FREE);

// ─── Spark Credits ───────────────────────────────────────────────────────────

/**
 * OFF. Every credit path below is inert until this is true, and the access
 * engine reports `creditEligible` regardless so the matrix stays honest about
 * what the infrastructure supports versus what is switched on.
 */
export const CREDITS_ENABLED = false;

export const CREDIT_COST = Object.freeze({
  [Feature.SPARK_AI]: 1,
  [Feature.VOICE_ASK]: 1,
  [Feature.BLUEPRINT]: 5,
  [Feature.TROUBLESHOOT]: 1,
});

// ─── The registry ────────────────────────────────────────────────────────────

/**
 * Every feature, declared once.
 *
 *   tiers                 which tiers get it at all
 *   freeLimit             inherited from FREE_LIMITS — never restated here
 *   creditEligible        a Spark Credit could unlock one use (when enabled)
 *   otaConfigurable       can be changed by remote config without a build
 *   requiresStoreProduct  the product that must exist in App Store Connect, or null
 *   cooldownMs            minimum gap between uses, 0 for none
 *   flag                  the feature flag that can switch it off entirely
 */
const entry = (id, def) => Object.freeze({
  id,
  label: def.label,
  tiers: Object.freeze(def.tiers),
  freeLimit: FREE_LIMITS[id] ?? { limit: null, period: 'day' },
  creditEligible: !!def.creditEligible,
  otaConfigurable: def.otaConfigurable !== false,
  requiresStoreProduct: def.requiresStoreProduct ?? null,
  cooldownMs: Number.isFinite(def.cooldownMs) ? def.cooldownMs : 0,
  flag: def.flag ?? null,
  note: def.note ?? null,
});

export const REGISTRY = Object.freeze({
  [Feature.CALCULATOR]: entry(Feature.CALCULATOR, {
    label: 'Calculators',
    tiers: [Tier.FREE, Tier.LIFETIME, Tier.PRO],
    creditEligible: false,
    requiresStoreProduct: null,
    note: 'Never gated. The calculators are why someone opens the app the first time.',
  }),
  [Feature.PERMIT]: entry(Feature.PERMIT, {
    label: 'Permit Assistant',
    tiers: [Tier.FREE, Tier.LIFETIME, Tier.PRO],
    creditEligible: false,
    note: 'Never gated. Safety and compliance guidance is not a paid tier.',
  }),
  [Feature.SPARK_AI]: entry(Feature.SPARK_AI, {
    label: 'SparkAI',
    tiers: [Tier.FREE, Tier.LIFETIME, Tier.PRO],
    creditEligible: true,
    requiresStoreProduct: ProductId.PRO_MONTHLY,
    cooldownMs: 0,
    flag: 'sparkAiEnabled',
  }),
  [Feature.VOICE_ASK]: entry(Feature.VOICE_ASK, {
    label: 'Voice ask',
    tiers: [Tier.PRO],
    creditEligible: true,
    requiresStoreProduct: ProductId.PRO_MONTHLY,
    flag: 'voiceAskEnabled',
  }),
  [Feature.TROUBLESHOOT]: entry(Feature.TROUBLESHOOT, {
    label: 'Troubleshooting',
    tiers: [Tier.FREE, Tier.LIFETIME, Tier.PRO],
    creditEligible: true,
    requiresStoreProduct: ProductId.PRO_MONTHLY,
  }),
  [Feature.WIRING_LESSON]: entry(Feature.WIRING_LESSON, {
    label: 'Wiring Simulator',
    tiers: [Tier.FREE, Tier.LIFETIME, Tier.PRO],
    creditEligible: false,
    requiresStoreProduct: ProductId.PRO_MONTHLY,
    flag: 'wiringSimulationsEnabled',
  }),
  [Feature.JOBSITE]: entry(Feature.JOBSITE, {
    label: 'Job Site',
    tiers: [Tier.FREE, Tier.LIFETIME, Tier.PRO],
    creditEligible: false,
    requiresStoreProduct: ProductId.PRO_MONTHLY,
  }),
  [Feature.BLUEPRINT]: entry(Feature.BLUEPRINT, {
    label: 'Blueprint AI',
    tiers: [Tier.FREE, Tier.LIFETIME, Tier.PRO],
    creditEligible: true,
    requiresStoreProduct: ProductId.PRO_MONTHLY,
    flag: 'blueprintEnabled',
  }),
  [Feature.JOB_CAM]: entry(Feature.JOB_CAM, {
    label: 'Projects & photos',
    tiers: [Tier.FREE, Tier.LIFETIME, Tier.PRO],
    creditEligible: false,
    requiresStoreProduct: ProductId.PRO_MONTHLY,
  }),
});

export const FEATURE_IDS = Object.freeze(Object.keys(REGISTRY));
export const featureEntry = (id) => REGISTRY[id] ?? null;

// ─── Remote configuration ────────────────────────────────────────────────────

/**
 * Overrides delivered over the air. Only limits and enablement — a remote
 * payload can never invent a feature, change a tier's meaning, or turn on
 * credits, because those need code that ships with them.
 */
export const applyRemoteConfig = (remote) => {
  const out = {};
  for (const id of FEATURE_IDS) {
    const base = REGISTRY[id];
    const patch = remote && typeof remote === 'object' ? remote[id] : null;
    if (!patch || !base.otaConfigurable) { out[id] = base; continue; }

    const limit = patch.limit;
    out[id] = Object.freeze({
      ...base,
      freeLimit: Object.freeze({
        ...base.freeLimit,
        limit: limit === null || (Number.isFinite(limit) && limit >= 0) ? limit : base.freeLimit.limit,
      }),
      disabled: patch.disabled === true,
      remoteOverridden: true,
    });
  }
  return Object.freeze(out);
};

// ─── The access engine ───────────────────────────────────────────────────────

export const Decision = Object.freeze({
  ALLOW: 'ALLOW',
  ALLOW_UNMETERED: 'ALLOW_UNMETERED',
  BLOCK_LIMIT: 'BLOCK_LIMIT',
  BLOCK_TIER: 'BLOCK_TIER',
  BLOCK_COOLDOWN: 'BLOCK_COOLDOWN',
  BLOCK_DISABLED: 'BLOCK_DISABLED',
  BLOCK_UNKNOWN: 'BLOCK_UNKNOWN',
});

/**
 * The single call every gate makes.
 *
 * Order is deliberate: an unknown feature fails closed, a disabled one is off
 * for everybody including Pro, a granted use skips the meter, tier is checked
 * before counting, and the cooldown is last so it never masks a real block.
 */
export const resolveAccess = ({
  feature,
  tier = Tier.FREE,
  used = 0,
  grant = Grant.NONE,
  registry = REGISTRY,
  credits = 0,
  lastUsedAt = null,
  now = Date.now(),
} = {}) => {
  const e = registry?.[feature] ?? null;
  const t = normalizeTier(tier);

  // Fail closed. A typo'd feature id must not open a gate.
  if (!e) {
    return decision(Decision.BLOCK_UNKNOWN, { feature, tier: t, reason: 'Unknown feature.' });
  }
  if (e.disabled) {
    return decision(Decision.BLOCK_DISABLED, { feature, tier: t, entry: e, reason: 'Temporarily unavailable.' });
  }

  // The job site routed the user here — that use is the game, not a session.
  if (grant === Grant.GAME_TASK) {
    return decision(Decision.ALLOW_UNMETERED, { feature, tier: t, entry: e, reason: 'Opened from a job-site task.' });
  }

  if (!e.tiers.includes(t)) {
    return decision(Decision.BLOCK_TIER, {
      feature, tier: t, entry: e,
      reason: `${e.label} is part of Pro.`,
      upgradeTo: Tier.PRO,
    });
  }

  // Pro and Lifetime are unmetered on anything their tier includes.
  if (t !== Tier.FREE) {
    return decision(Decision.ALLOW_UNMETERED, { feature, tier: t, entry: e, reason: `Included with ${TIER_LABEL[t]}.` });
  }

  const { limit } = e.freeLimit;
  if (limit === null) {
    return decision(Decision.ALLOW_UNMETERED, { feature, tier: t, entry: e, reason: 'Always available.' });
  }

  const count = Number.isFinite(used) && used > 0 ? used : 0;
  if (count >= limit) {
    // A credit can cover one use — when credits are switched on at all.
    const payable = CREDITS_ENABLED && e.creditEligible && credits >= (CREDIT_COST[feature] ?? 1);
    return decision(Decision.BLOCK_LIMIT, {
      feature, tier: t, entry: e,
      reason: limit === 0 ? `${e.label} is part of Pro.` : `You have used today's ${limit}.`,
      upgradeTo: Tier.PRO,
      creditCost: e.creditEligible ? (CREDIT_COST[feature] ?? 1) : null,
      payableWithCredits: payable,
    });
  }

  if (e.cooldownMs > 0 && Number.isFinite(lastUsedAt) && now - lastUsedAt < e.cooldownMs) {
    return decision(Decision.BLOCK_COOLDOWN, {
      feature, tier: t, entry: e,
      reason: 'Just a moment.',
      retryInMs: e.cooldownMs - (now - lastUsedAt),
    });
  }

  return decision(Decision.ALLOW, {
    feature, tier: t, entry: e,
    remaining: limit - count,
    reason: `${limit - count} left today.`,
  });
};

const decision = (kind, extra = {}) => {
  const { entry: e, ...rest } = extra;
  return Object.freeze({
    decision: kind,
    allowed: kind === Decision.ALLOW || kind === Decision.ALLOW_UNMETERED,
    metered: kind === Decision.ALLOW,
    remaining: null,
    upgradeTo: null,
    creditCost: null,
    payableWithCredits: false,
    retryInMs: null,
    label: e?.label ?? null,
    copy: rest.feature ? gateCopyFor(rest.feature) : null,
    ...rest,
  });
};

// ─── Upgrade preview ─────────────────────────────────────────────────────────

/**
 * What changes if you upgrade — computed from the registry rather than written
 * as marketing copy, so the preview cannot promise something the gates do not
 * actually deliver.
 */
export const upgradePreview = (fromTier = Tier.FREE, toTier = Tier.PRO, registry = REGISTRY) => {
  const from = normalizeTier(fromTier);
  const to = normalizeTier(toTier);

  const unlocked = [];
  const unmetered = [];
  for (const id of FEATURE_IDS) {
    const e = registry[id] ?? REGISTRY[id];
    const hadTier = e.tiers.includes(from);
    const getsTier = e.tiers.includes(to);
    if (!hadTier && getsTier) { unlocked.push({ id, label: e.label }); continue; }
    if (hadTier && getsTier && from === Tier.FREE && to !== Tier.FREE && e.freeLimit.limit !== null) {
      unmetered.push({
        id, label: e.label,
        was: e.freeLimit.limit === 0 ? 'Pro only' : `${e.freeLimit.limit} per ${e.freeLimit.period}`,
      });
    }
  }

  return Object.freeze({
    from, to,
    fromLabel: TIER_LABEL[from], toLabel: TIER_LABEL[to],
    unlocked: Object.freeze(unlocked),
    unmetered: Object.freeze(unmetered),
    changeCount: unlocked.length + unmetered.length,
    // An upgrade that changes nothing should not be sold as one.
    worthwhile: unlocked.length + unmetered.length > 0,
  });
};

// ─── The access matrix ───────────────────────────────────────────────────────

/**
 * The table the release brief asked for, generated from the registry so it can
 * never drift from the code that enforces it. Printed by the Product Health
 * screen and by scripts/access-matrix.mjs.
 */
export const accessMatrix = (registry = REGISTRY) => {
  const rows = FEATURE_IDS.map((id) => {
    const e = registry[id] ?? REGISTRY[id];
    const limit = e.freeLimit.limit;
    return Object.freeze({
      feature: e.label,
      id,
      free: limit === null ? 'Unlimited'
        : limit === 0 ? '—'
          : `${limit} / ${e.freeLimit.period}`,
      lifetime: e.tiers.includes(Tier.LIFETIME) ? 'Unlimited' : '—',
      pro: e.tiers.includes(Tier.PRO) ? 'Unlimited' : '—',
      tokenEligible: e.creditEligible,
      otaConfigurable: e.otaConfigurable,
      storeProduct: e.requiresStoreProduct,
      flag: e.flag,
      note: e.note,
    });
  });

  return Object.freeze({
    rows: Object.freeze(rows),
    creditsEnabled: CREDITS_ENABLED,
    generatedFrom: 'src/core/paywall/registry.js',
    note: 'Generated from the registry the gates read. If this table is wrong, the app is wrong.',
  });
};

/** Fixed-width text, for the release report and the health screen. */
export const matrixText = (matrix = accessMatrix()) => {
  const head = ['Feature', 'Free', 'Lifetime', 'Pro', 'Token', 'OTA', 'Store product'];
  const rows = matrix.rows.map((r) => [
    r.feature, r.free, r.lifetime, r.pro,
    r.tokenEligible ? 'yes' : 'no',
    r.otaConfigurable ? 'yes' : 'no',
    r.storeProduct ?? '—',
  ]);
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => cells.map((c, i) => String(c).padEnd(widths[i])).join('  ');
  return [
    line(head),
    widths.map((w) => '─'.repeat(w)).join('  '),
    ...rows.map(line),
    '',
    `Spark Credits: ${matrix.creditsEnabled ? 'ENABLED' : 'disabled'}`,
  ].join('\n');
};

export { Feature, Grant, GATE_COPY, FREE_LIMITS };
