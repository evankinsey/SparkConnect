// ─── CONFIGURATION VALIDATION ────────────────────────────────────────────────
// Requirements: NNR-05, NNR-06, SEC-01, DOD-08 · answers DECISIONS.md Q2 and Q3
//
// The audit found three separate sources of truth for keys:
//   1. src/config/keys.js          — a real RevenueCat iOS key, empty Android/Superwall
//   2. App.js RC_IOS_KEY           — the literal string 'YOUR_IOS_KEY_HERE'
//   3. App.js IS_PRO = false       — Pro hardwired off regardless of entitlement
//
// The failure mode that matters: an empty Android key does not throw. RevenueCat
// simply never resolves an entitlement, so every Android user is silently
// treated as Free — including one who has paid. Silent is the problem. This
// module makes missing configuration LOUD in development and degrade honestly in
// production, and it is the single place that decides whether a key is usable.

export const ConfigStatus = {
  OK: 'OK',
  MISSING: 'MISSING',
  PLACEHOLDER: 'PLACEHOLDER',
  MALFORMED: 'MALFORMED',
};

export const Severity = { BLOCKER: 'BLOCKER', DEGRADED: 'DEGRADED', OPTIONAL: 'OPTIONAL' };

// Strings a developer leaves behind. Treated as missing, never as a real key.
const PLACEHOLDER_PATTERNS = [
  /^your_/i, /_here$/i, /^replace/i, /^todo/i, /^xxx/i, /^changeme/i, /^placeholder/i, /^<.*>$/,
];

const isPlaceholder = (value) =>
  typeof value === 'string' && PLACEHOLDER_PATTERNS.some((p) => p.test(value.trim()));

/**
 * Expected key shapes. RevenueCat public SDK keys are prefixed by platform;
 * checking the prefix catches an iOS key pasted into the Android slot, which
 * otherwise fails exactly like an empty key: silently.
 */
export const KEY_SPECS = Object.freeze({
  REVENUECAT_IOS_KEY: {
    label: 'RevenueCat iOS SDK key', prefix: 'appl_', severity: Severity.BLOCKER,
    platform: 'ios', secret: false,
    consequence: 'iOS purchases and entitlements cannot resolve. Every iOS user is treated as Free.',
  },
  REVENUECAT_ANDROID_KEY: {
    label: 'RevenueCat Android SDK key', prefix: 'goog_', severity: Severity.BLOCKER,
    platform: 'android', secret: false,
    consequence: 'Android purchases and entitlements cannot resolve. Every Android user — including paying customers — is silently treated as Free.',
  },
  SUPERWALL_IOS_KEY: {
    label: 'Superwall iOS key', prefix: 'pk_', severity: Severity.DEGRADED,
    platform: 'ios', secret: false,
    consequence: 'Paywall placements and A/B experiments do not run. The app falls back to the built-in paywall.',
  },
  SUPERWALL_ANDROID_KEY: {
    label: 'Superwall Android key', prefix: 'pk_', severity: Severity.DEGRADED,
    platform: 'android', secret: false,
    consequence: 'Paywall placements and A/B experiments do not run on Android.',
  },
  BACKEND_URL: {
    label: 'Backend base URL', prefix: 'https://', severity: Severity.DEGRADED,
    platform: 'all', secret: false,
    consequence: 'SparkAI, remote feature flags and any payment work cannot reach a server.',
  },
});

/** Key names that must NEVER appear in the client bundle (NNR-06, SEC-01). */
export const FORBIDDEN_CLIENT_KEYS = Object.freeze([
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_CONNECT_CLIENT_SECRET',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'REVENUECAT_SECRET_KEY',
  'FIREBASE_ADMIN_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
]);

export const validateKey = (name, value) => {
  const spec = KEY_SPECS[name];
  if (!spec) return { name, status: ConfigStatus.OK, unknown: true };

  const v = typeof value === 'string' ? value.trim() : '';
  if (!v) return { name, ...spec, status: ConfigStatus.MISSING, usable: false };
  if (isPlaceholder(v)) return { name, ...spec, status: ConfigStatus.PLACEHOLDER, usable: false };
  if (spec.prefix && !v.startsWith(spec.prefix)) {
    return {
      name, ...spec, status: ConfigStatus.MALFORMED, usable: false,
      detail: `Expected a value starting with "${spec.prefix}".`,
    };
  }
  return { name, ...spec, status: ConfigStatus.OK, usable: true };
};

/**
 * Validate the whole config.
 *
 * @param keys      { [name]: value }
 * @param platform  'ios' | 'android' — only the running platform's blockers count
 * @returns {{ok, blockers, degraded, findings, forbiddenPresent, summary}}
 */
export const validateConfig = (keys = {}, { platform = 'ios' } = {}) => {
  const findings = Object.keys(KEY_SPECS).map((name) => validateKey(name, keys[name]));

  const relevant = findings.filter((f) => f.platform === 'all' || f.platform === platform);
  const blockers = relevant.filter((f) => !f.usable && f.severity === Severity.BLOCKER);
  const degraded = relevant.filter((f) => !f.usable && f.severity === Severity.DEGRADED);

  // A secret leaking into the client is worse than any missing key.
  const forbiddenPresent = FORBIDDEN_CLIENT_KEYS.filter(
    (name) => typeof keys[name] === 'string' && keys[name].trim().length > 0,
  );

  return {
    ok: blockers.length === 0 && forbiddenPresent.length === 0,
    blockers,
    degraded,
    findings,
    forbiddenPresent,
    summary: forbiddenPresent.length
      ? `SECRET IN CLIENT BUNDLE: ${forbiddenPresent.join(', ')}`
      : blockers.length
        ? `${blockers.length} blocking configuration problem(s) on ${platform}`
        : degraded.length
          ? `${degraded.length} optional integration(s) unconfigured`
          : 'Configuration complete',
  };
};

/**
 * Human-readable report. Printed loudly at startup in development so a missing
 * Android key is impossible to miss, rather than surfacing as a support ticket
 * from a customer who paid and got nothing.
 */
export const formatConfigReport = (result, { platform = 'ios' } = {}) => {
  const lines = [`SparkConnect configuration (${platform}): ${result.summary}`];

  for (const f of result.forbiddenPresent) {
    lines.push(`  [CRITICAL] ${f} must never be in the client bundle. Move it to the backend.`);
  }
  for (const f of result.blockers) {
    lines.push(`  [BLOCKER]  ${f.label} — ${f.status}. ${f.consequence}`);
  }
  for (const f of result.degraded) {
    lines.push(`  [DEGRADED] ${f.label} — ${f.status}. ${f.consequence}`);
  }
  return lines.join('\n');
};

/**
 * Whether entitlements can be trusted on this platform right now.
 *
 * When the key is unusable the honest answer is "unknown", not "free". A UI that
 * knows the difference can say "we could not verify your subscription — try
 * Restore Purchases" instead of quietly downgrading a paying customer.
 */
export const entitlementResolution = (keys, platform) => {
  const keyName = platform === 'android' ? 'REVENUECAT_ANDROID_KEY' : 'REVENUECAT_IOS_KEY';
  const check = validateKey(keyName, keys[keyName]);
  return check.usable
    ? { canResolve: true, reason: null }
    : {
      canResolve: false,
      reason: `${check.label} is ${check.status}`,
      userMessage: 'We could not verify your subscription on this device. Your purchases are safe — try Restore Purchases.',
    };
};
