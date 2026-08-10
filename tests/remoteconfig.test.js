// ─── THE KILL SWITCH ─────────────────────────────────────────────────────────
// The one rule: a kill switch that bricks the app when the network is down is
// worse than the bug it was added to contain.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CONFIG_URL, EMPTY, readConfig, fetchConfig, cacheIsFresh, resolveConfig,
  configSummary, CACHE_TTL_MS,
} from '../src/core/remoteConfig.js';
import { applyRemoteConfig, REGISTRY, FEATURE_IDS, resolveAccess, Tier, Decision } from '../src/core/paywall/registry.js';
import { Feature } from '../src/core/paywall/entitlements.js';

const okRes = (body) => ({ ok: true, text: async () => JSON.stringify(body) });

test('every failure path leaves the app exactly as it shipped', async () => {
  // Offline, 404, timeout, garbage — all the same answer. Removing a paid
  // feature because the network hiccuped is the worst thing this could do.
  const failures = [
    async () => { throw new Error('offline'); },
    async () => ({ ok: false, status: 404, text: async () => '' }),
    async () => ({ ok: true, text: async () => 'not json' }),
    async () => ({ ok: true, text: async () => JSON.stringify({ features: 'nope' }) }),
    async () => null,
  ];
  for (const f of failures) {
    const c = await fetchConfig(f);
    assert.deepEqual(c, EMPTY, 'a failure produced overrides');
  }
  // No fetch at all is also fine.
  assert.deepEqual(await fetchConfig(null), EMPTY);
  assert.deepEqual(await fetchConfig(undefined), EMPTY);
});

test('a real config disables exactly what it names', async () => {
  const c = await fetchConfig(async () => okRes({
    features: { BLUEPRINT: { disabled: true } },
    notice: 'Blueprint is off while we fix an upload problem.',
  }));
  assert.equal(c.features.BLUEPRINT.disabled, true);
  assert.match(c.notice, /Blueprint is off/);

  // And it actually reaches the gate.
  const registry = applyRemoteConfig(c.features);
  const d = resolveAccess({ feature: Feature.BLUEPRINT, tier: Tier.PRO, registry });
  assert.equal(d.allowed, false);
  assert.equal(d.decision, Decision.BLOCK_DISABLED, 'the switch does not reach the gate');

  // Everything else is untouched.
  const other = resolveAccess({ feature: Feature.CALCULATOR, tier: Tier.FREE, registry, used: 5 });
  assert.equal(other.allowed, true);
});

test('a malformed entry is dropped, never half-applied', () => {
  // One bad key silently disabling a feature nobody meant to touch is the
  // failure mode that makes a kill switch scarier than the bug.
  const c = readConfig({
    features: {
      A: 'nope',
      B: { limit: -5 },
      C: { disabled: 'yes' },
      D: { disabled: true },
    },
  });
  assert.equal(c.features.A, undefined);
  assert.equal(c.features.B, undefined, 'a negative limit was accepted');
  assert.equal(c.features.C, undefined, 'a string was read as true');
  assert.equal(c.features.D.disabled, true);

  for (const junk of [null, undefined, [], 'x', 42]) {
    assert.deepEqual(readConfig(junk), EMPTY);
  }
});

test('remote config can never disable a safety behaviour', async () => {
  // otaConfigurable is the registry's decision and this layer cannot widen it.
  const c = await fetchConfig(async () => okRes({
    features: Object.fromEntries(FEATURE_IDS.map((id) => [id, { disabled: true }])),
  }));
  const registry = applyRemoteConfig(c.features);
  for (const id of FEATURE_IDS) {
    if (!REGISTRY[id].otaConfigurable) {
      assert.notEqual(registry[id].disabled, true, `${id} is not meant to be remotely disableable`);
    }
  }
});

test('a config cannot invent a feature or grow without limit', async () => {
  const c = await fetchConfig(async () => okRes({ features: { NOT_REAL: { disabled: true } } }));
  const registry = applyRemoteConfig(c.features);
  assert.equal(registry.NOT_REAL, undefined);

  // An oversized body is refused rather than parsed.
  const huge = await fetchConfig(async () => ({ ok: true, text: async () => 'x'.repeat(40000) }));
  assert.deepEqual(huge, EMPTY);

  // The notice is length-capped; a novel in it is a broken screen.
  assert.ok(readConfig({ notice: 'y'.repeat(1000) }).notice.length <= 240);
});

test('a feature turned off yesterday stays off through a launch with no signal', () => {
  // Otherwise the switch only works for people who happen to be online at the
  // moment it matters.
  const cached = readConfig({ features: { BLUEPRINT: { disabled: true } } });
  const now = Date.now();
  const r = resolveConfig({ cached, cachedAt: now - 60_000, fetched: EMPTY, now });
  assert.equal(r.features.BLUEPRINT.disabled, true);

  // But a stale cache is discarded — a month-old config disabling something
  // long since fixed is its own bug.
  const stale = resolveConfig({ cached, cachedAt: now - CACHE_TTL_MS - 1, fetched: EMPTY, now });
  assert.deepEqual(stale, EMPTY);

  // A fresh fetch always wins over the cache.
  const fresh = readConfig({ features: { JOBSITE: { disabled: true } } });
  const won = resolveConfig({ cached, cachedAt: now, fetched: fresh, now });
  assert.equal(won.features.JOBSITE?.disabled, true);
  assert.equal(won.features.BLUEPRINT, undefined, 'the cache overrode a live config');
});

test('the config lives on the stable public domain', () => {
  assert.match(CONFIG_URL, /^https:\/\/sparkconnect\.pro\//);
  assert.doesNotMatch(CONFIG_URL, /vercel\.app/, 'a deployment-protected host cannot serve a kill switch');
});

test('the shipped config file is valid and disables nothing', async () => {
  const fs = await import('node:fs');
  const raw = JSON.parse(fs.readFileSync('website/app-config.json', 'utf8'));
  const c = readConfig(raw);
  assert.deepEqual(c.features, {}, 'the file shipped with a feature already disabled');
  assert.equal(c.notice, null);
  // The instructions travel with the file, so whoever edits it under pressure
  // does not have to find this test to know the format.
  assert.ok(raw._howToDisableAFeature.includes('disabled'));
});

test('a disabled feature is never a mystery on the health screen', () => {
  assert.match(configSummary(EMPTY), /running as shipped/i);
  const c = readConfig({ features: { BLUEPRINT: { disabled: true } } });
  assert.match(configSummary(c), /BLUEPRINT/);
});
