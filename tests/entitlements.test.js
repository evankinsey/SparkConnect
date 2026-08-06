// ─── ENTITLEMENTS ────────────────────────────────────────────────────────────
// The gates a free user meets. The rule that matters most: a task the job site
// sent them to must never be walled by a meter, or the game strands the player
// inside a tool the app just told them to open.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  Feature, Grant, FREE_LIMITS, GATE_COPY, gateCopyFor,
  checkAccess, remainingLabel, freeTierSummary,
} from '../src/core/paywall/entitlements.js';

test('every metered feature has paywall copy that says what you get', () => {
  for (const [feature, rule] of Object.entries(FREE_LIMITS)) {
    if (rule.limit === null) continue;   // unlimited features need no wall
    const copy = GATE_COPY[feature];
    assert.ok(copy, `${feature} is gated but has no paywall copy`);
    assert.ok(copy.eyebrow && copy.headline && copy.sub, `${feature} copy incomplete`);
    assert.ok(copy.sub.length > 40, `${feature} sub must explain the offer`);
  }
});

test('Pro is never metered on anything', () => {
  for (const feature of Object.values(Feature)) {
    const a = checkAccess(feature, { isPro: true, used: 9999 });
    assert.equal(a.allowed, true, `${feature} blocked a Pro user`);
    assert.equal(a.meter, false);
  }
});

test('a free user gets a real allowance before any wall', () => {
  for (const [feature, rule] of Object.entries(FREE_LIMITS)) {
    if (rule.limit === 0 || rule.limit === null) continue;
    const first = checkAccess(feature, { isPro: false, used: 0 });
    assert.equal(first.allowed, true, `${feature} walls a free user on their first use`);
    assert.equal(first.meter, true, `${feature} must count a free use`);
  }
});

test('the wall arrives exactly at the limit, not before', () => {
  const { limit } = FREE_LIMITS[Feature.TROUBLESHOOT];
  assert.equal(checkAccess(Feature.TROUBLESHOOT, { used: limit - 1 }).allowed, true);
  const walled = checkAccess(Feature.TROUBLESHOOT, { used: limit });
  assert.equal(walled.allowed, false);
  assert.equal(walled.reason, 'limit_reached');
  assert.ok(walled.copy, 'a wall must carry its own copy');
});

test('a job-site task is never metered, even past the limit', () => {
  // This is the rule the owner called out: if the game routed you here, you
  // get a pass. A free player three stations deep must not hit a calculator
  // wall inside a task the app itself opened.
  for (const feature of [Feature.CALCULATOR, Feature.SPARK_AI, Feature.TROUBLESHOOT, Feature.WIRING_LESSON]) {
    const a = checkAccess(feature, { isPro: false, used: 9999, grant: Grant.GAME_TASK });
    assert.equal(a.allowed, true, `${feature} walled a game-routed use`);
    assert.equal(a.meter, false, `${feature} metered a game-routed use`);
    assert.equal(a.reason, 'game_task');
  }
});

test('voice is Pro-only and says so rather than pretending to have a limit', () => {
  const a = checkAccess(Feature.VOICE_ASK, { isPro: false, used: 0 });
  assert.equal(a.allowed, false);
  assert.equal(a.reason, 'pro_only');
  assert.equal(a.remaining, 0);
  assert.match(a.copy.sub, /reading answers aloud stays free/i,
    'the free half of voice must be named so the gate is honest');
  assert.equal(checkAccess(Feature.VOICE_ASK, { isPro: true }).allowed, true);
});

test('calculators and permits are never gated', () => {
  for (const feature of [Feature.CALCULATOR, Feature.PERMIT]) {
    const a = checkAccess(feature, { isPro: false, used: 100000 });
    assert.equal(a.allowed, true, `${feature} must stay free`);
    assert.equal(a.meter, false);
  }
});

test('blueprint gives one free takeoff so the feature can prove itself', () => {
  assert.equal(checkAccess(Feature.BLUEPRINT, { used: 0 }).allowed, true);
  assert.equal(checkAccess(Feature.BLUEPRINT, { used: 1 }).allowed, false);
});

test('a corrupt or hostile used-count cannot unlock a feature', () => {
  for (const used of [-50, NaN, Infinity, null, undefined, 'lots', {}]) {
    const a = checkAccess(Feature.BLUEPRINT, { isPro: false, used });
    // Garbage is treated as zero uses, which is safe: they get their free
    // allowance, never unlimited access.
    assert.equal(a.allowed, true, `used=${String(used)}`);
    assert.equal(a.limit, 1);
  }
  // And a huge count still walls.
  assert.equal(checkAccess(Feature.BLUEPRINT, { used: 9e9 }).allowed, false);
});

test('an unknown feature fails open rather than blocking the app', () => {
  const a = checkAccess('SOMETHING_NEW', { isPro: false, used: 500 });
  assert.equal(a.allowed, true, 'a typo in a feature name must not brick a screen');
  assert.equal(a.meter, false);
});

test('the remaining label warns before the wall, and stays quiet when pointless', () => {
  assert.equal(remainingLabel(Feature.TROUBLESHOOT, { used: 1 }), '2 of 3 left');
  assert.equal(remainingLabel(Feature.TROUBLESHOOT, { used: 3 }), '0 of 3 left');
  assert.equal(remainingLabel(Feature.TROUBLESHOOT, { isPro: true, used: 1 }), null);
  assert.equal(remainingLabel(Feature.CALCULATOR, { used: 40 }), null);
  assert.equal(remainingLabel(Feature.VOICE_ASK, { used: 0 }), null, 'Pro-only is not a countdown');
});

test('the free tier summary is complete enough to render a comparison', () => {
  const s = freeTierSummary();
  assert.ok(s.length >= 5);
  for (const row of s) {
    assert.ok(row.feature && typeof row.limit === 'number');
    assert.ok(['day', 'total'].includes(row.period));
  }
  assert.ok(s.some((r) => r.proOnly), 'voice should show as Pro-only');
});

test('gateCopyFor always returns usable copy', () => {
  assert.ok(gateCopyFor('NONSENSE').headline, 'a missing gate must still render something');
});
