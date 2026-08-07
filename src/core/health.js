// ─── PRODUCT HEALTH ──────────────────────────────────────────────────────────
// Developer-only. What state is this build actually in?
//
// The value is entirely in it being DERIVED. A hand-maintained status page is
// worse than none: it says "NEC datasets verified: 11/11" three weeks after
// somebody added a twelfth, and it is believed because it looks official. Every
// line below is computed from the module that owns the fact, so the dashboard
// is wrong only if the app is wrong.
//
// Hidden behind `debugToolsEnabled`, which is off in production. Nothing here is
// user-facing, so it is blunt on purpose — this is the screen you check before
// tagging a build, and a red line should read as red.
//
// Pure module: no React, no storage. The caller injects anything live.

import { DATASETS, isVerified, productionBlockers, RELEASE_OVERRIDE, VerificationStatus } from './verification.js';
import { accessMatrix, CREDITS_ENABLED, FEATURE_IDS, REGISTRY } from './paywall/registry.js';
import { ALL_LESSONS } from '../circuit/lessons/index.js';
import { pendingReview } from '../circuit/review.js';
import { validateGraph, HANDOFFS, TOOLS } from './domain/fieldIntelligence.js';
import { networkStatus } from './connect/index.js';

export const Status = Object.freeze({ OK: 'OK', WARN: 'WARN', FAIL: 'FAIL', OFF: 'OFF' });

const STATUS_ICON = Object.freeze({ OK: '✅', WARN: '⚠️', FAIL: '❌', OFF: '○' });

const check = (label, status, detail, extra = {}) =>
  Object.freeze({ label, status, detail, icon: STATUS_ICON[status], ...extra });

/**
 * @param live  things only the running app knows:
 *              { flags, remoteConfigConnected, storeProductsFound, backendUrl, tier }
 */
export const productHealth = (live = {}) => {
  const checks = [];

  // ── Electrical trust ──
  const datasets = Object.values(DATASETS ?? {});
  // isVerified takes an ID, not a dataset. Passing the object made
  // datasetById() return undefined and the count read 0/12 no matter how many
  // tables had been checked — a health dashboard that could only ever report
  // bad news, which is the same as reporting none.
  const verified = datasets.filter((d) => isVerified(d.id));
  // A table with SOME rows confirmed is not a verified table, and rounding it up
  // to one would be the exact failure this register exists to prevent. It is
  // reported separately so the work already done is still visible.
  const partial = datasets.filter((d) => !isVerified(d.id) && (d.verifiedRows?.length ?? 0) > 0);
  checks.push(check(
    'NEC datasets verified',
    verified.length === datasets.length ? Status.OK : Status.WARN,
    `${verified.length}/${datasets.length} fully checked against printed source`
      + (partial.length ? `, ${partial.length} partially (${partial.map((d) => d.id).join(', ')})` : ''),
    {
      partial: partial.map((d) => d.id),
      group: 'Trust',
      outstanding: datasets.filter((d) => !isVerified(d.id)).map((d) => d.id),
      // The release gate, stated separately from the count.
      blocking: (productionBlockers?.() ?? []).length,
    },
  ));

  checks.push(check(
    'Release override',
    RELEASE_OVERRIDE?.active ? Status.WARN : Status.OK,
    RELEASE_OVERRIDE?.active
      ? `ACTIVE — shipping on unverified tables, authorised ${RELEASE_OVERRIDE.date} by ${RELEASE_OVERRIDE.authorizedBy}`
      : 'Not active',
    { group: 'Trust' },
  ));

  const unreviewed = pendingReview(ALL_LESSONS) ?? [];
  checks.push(check(
    'Lessons pending technical review',
    unreviewed.length === 0 ? Status.OK : Status.WARN,
    `${unreviewed.length} of ${ALL_LESSONS.length} awaiting a qualified reviewer`,
    { group: 'Trust', items: unreviewed.map((l) => l.id) },
  ));

  // ── Engines ──
  const graphProblems = validateGraph();
  checks.push(check(
    'Field Intelligence graph',
    graphProblems.length === 0 ? Status.OK : Status.FAIL,
    graphProblems.length === 0
      ? `${TOOLS.length} tools, ${HANDOFFS.length} handoffs, all edges valid`
      : `${graphProblems.length} broken edge(s)`,
    { group: 'Engines', items: graphProblems },
  ));

  checks.push(check(
    'SparkAI router',
    live.backendUrl ? Status.OK : Status.WARN,
    live.backendUrl
      ? 'Backend reachable — deterministic tools first, model last'
      : 'No backend URL. Deterministic tools work; model answers cannot reach a server.',
    { group: 'Engines' },
  ));

  // ── Monetization ──
  const matrix = accessMatrix();
  const needStore = new Set(matrix.rows.map((r) => r.storeProduct).filter(Boolean));
  const found = new Set(live.storeProductsFound ?? []);
  const missing = [...needStore].filter((p) => !found.has(p));
  checks.push(check(
    'Store products',
    live.storeProductsFound == null ? Status.WARN
      : missing.length === 0 ? Status.OK : Status.FAIL,
    live.storeProductsFound == null
      ? 'Not checked this session'
      : missing.length === 0 ? `All ${needStore.size} product(s) found`
        : `Missing from the store: ${missing.join(', ')}`,
    { group: 'Monetization', items: missing },
  ));

  checks.push(check(
    'Spark Credits',
    CREDITS_ENABLED ? Status.OK : Status.OFF,
    CREDITS_ENABLED ? 'Enabled' : 'Disabled — infrastructure present, switch is off',
    { group: 'Monetization' },
  ));

  checks.push(check(
    'Remote config',
    live.remoteConfigConnected === true ? Status.OK
      : live.remoteConfigConnected === false ? Status.WARN : Status.OFF,
    live.remoteConfigConnected === true ? 'Connected'
      : live.remoteConfigConnected === false ? 'Not reachable — using built-in defaults'
        : 'Not checked',
    { group: 'Monetization' },
  ));

  checks.push(check(
    'Feature registry',
    Status.OK,
    `${FEATURE_IDS.length} features declared, ${matrix.rows.filter((r) => r.otaConfigurable).length} OTA-configurable`,
    { group: 'Monetization' },
  ));

  // ── Flags ──
  const flags = live.flags ?? {};
  const on = Object.entries(flags).filter(([, v]) => v === true).map(([k]) => k);
  checks.push(check(
    'Feature flags enabled',
    on.length === 0 ? Status.OFF : Status.WARN,
    on.length === 0 ? 'None' : `${on.length} on: ${on.join(', ')}`,
    { group: 'Build', items: on },
  ));

  // ── Network ──
  const net = networkStatus();
  checks.push(check(
    'Contractor Connect',
    Status.OFF,
    `Beta — matching ${net.matching ? 'on' : 'off'}, ${net.listings} listing(s)`,
    { group: 'Build' },
  ));

  const worst = checks.some((c) => c.status === Status.FAIL) ? Status.FAIL
    : checks.some((c) => c.status === Status.WARN) ? Status.WARN : Status.OK;

  const groups = [];
  for (const g of ['Trust', 'Engines', 'Monetization', 'Build']) {
    const inGroup = checks.filter((c) => c.group === g);
    if (inGroup.length) groups.push(Object.freeze({ group: g, checks: Object.freeze(inGroup) }));
  }

  return Object.freeze({
    checks: Object.freeze(checks),
    groups: Object.freeze(groups),
    worst,
    counts: Object.freeze({
      ok: checks.filter((c) => c.status === Status.OK).length,
      warn: checks.filter((c) => c.status === Status.WARN).length,
      fail: checks.filter((c) => c.status === Status.FAIL).length,
      off: checks.filter((c) => c.status === Status.OFF).length,
    }),
    // A build with a FAIL should not be tagged. A build with WARNs might be
    // fine — that is a judgement, not a rule, so it is reported not enforced.
    safeToTag: !checks.some((c) => c.status === Status.FAIL),
    generatedAt: new Date().toISOString(),
  });
};

/** Fixed-width, for pasting into a release thread. */
export const healthText = (health = productHealth()) => {
  const out = ['SPARKCONNECT — PRODUCT HEALTH', ''];
  for (const g of health.groups) {
    out.push(g.group.toUpperCase());
    for (const c of g.checks) out.push(`  ${c.icon} ${c.label}: ${c.detail}`);
    out.push('');
  }
  out.push(`Safe to tag: ${health.safeToTag ? 'yes' : 'NO — a check is failing'}`);
  return out.join('\n');
};

export { VerificationStatus };
