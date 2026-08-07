// ─── SECURITY INVARIANTS + KILL SWITCH ───────────────────────────────────────
// The properties that must stay true build over build.
//
// A security review is a snapshot; these are the parts worth turning into
// tests, because the way a clean audit stops being true is somebody adding one
// line six weeks later and nobody re-running it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  parseKillConfig, featureState, allStates, killedNotice,
  isProtected, PROTECTED, KILL_SWITCH_NOTE,
} from '../src/core/killSwitch.js';
import { FORBIDDEN_CLIENT_KEYS } from '../src/core/config/validate.js';

const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  if (f === 'node_modules') return [];
  return statSync(p).isDirectory() ? walk(p) : (p.endsWith('.js') ? [p] : []);
});

const SOURCE = [...walk('src'), 'App.js'];
const read = (f) => readFileSync(f, 'utf8');

// ─── Nothing secret ships ────────────────────────────────────────────────────

test('no secret-shaped credential appears anywhere in the client', () => {
  // Live key shapes, not names. A name in a denylist is a guard; a value is a leak.
  const SECRET_SHAPES = [
    /\bsk-[A-Za-z0-9]{20,}/,              // OpenAI / Stripe secret
    /\bsk_live_[A-Za-z0-9]{10,}/,
    /\brk_live_[A-Za-z0-9]{10,}/,
    /\bAIza[A-Za-z0-9_-]{30,}/,           // Google
    /\bghp_[A-Za-z0-9]{20,}/,             // GitHub
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /\beyJ[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,}\./, // a real JWT
  ];
  for (const file of SOURCE) {
    const src = read(file);
    for (const re of SECRET_SHAPES) {
      assert.doesNotMatch(src, re, `${file} contains something shaped like a live secret`);
    }
  }
});

test('the forbidden-key list names the credentials that must never ship', () => {
  for (const k of ['STRIPE_SECRET_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY',
    'SUPABASE_SERVICE_ROLE_KEY', 'REVENUECAT_SECRET_KEY']) {
    assert.ok(FORBIDDEN_CLIENT_KEYS.includes(k), `${k} is not on the forbidden list`);
  }
  // And none of them is actually assigned a value anywhere.
  for (const file of SOURCE) {
    const src = read(file);
    for (const k of FORBIDDEN_CLIENT_KEYS) {
      const assigned = new RegExp(`${k}\\s*[:=]\\s*['"\`][^'"\`]{8,}`);
      assert.doesNotMatch(src, assigned, `${file} assigns a value to ${k}`);
    }
  }
});

test('the RevenueCat keys in the bundle are the public SDK keys, by design', () => {
  const src = read('src/config/keys.js');
  // appl_ / goog_ are PUBLIC client keys — RevenueCat ships them in the app on
  // purpose. The secret key is a different prefix and must never be here.
  assert.match(src, /appl_/, 'the iOS public SDK key is expected');
  assert.doesNotMatch(src, /\bsk_/, 'a RevenueCat secret key must never be in the client');
});

// ─── No code execution surface ───────────────────────────────────────────────

test('nothing in the app evaluates a string as code', () => {
  for (const file of SOURCE) {
    const src = read(file);
    assert.doesNotMatch(src, /\beval\s*\(/, `${file} calls eval`);
    assert.doesNotMatch(src, /new\s+Function\s*\(/, `${file} builds a Function from a string`);
    assert.doesNotMatch(src, /dangerouslySetInnerHTML/, `${file} sets raw HTML`);
  }
});

test('no prototype-pollution sink', () => {
  for (const file of SOURCE) {
    const src = read(file);
    // Reading __proto__ defensively is fine; assigning through it is not.
    assert.doesNotMatch(src, /\[\s*['"`]__proto__['"`]\s*\]\s*=/, `${file} assigns via __proto__`);
    assert.doesNotMatch(src, /\.__proto__\s*=/, `${file} assigns __proto__`);
  }
});

// ─── Network surface ─────────────────────────────────────────────────────────

test('every request goes to a hardcoded https host, so there is no SSRF surface', () => {
  const app = read('App.js');
  const urls = [...app.matchAll(/const\s+\w*(?:URL|Url)\w*\s*=\s*'([^']+)'/g)].map((m) => m[1]);
  const remote = urls.filter((u) => /^https?:/i.test(u));
  assert.ok(remote.length > 0, 'expected at least one declared endpoint');
  for (const u of remote) {
    assert.match(u, /^https:\/\//, `${u} is not https`);
  }
  // No fetch is handed a URL built from user input.
  for (const m of app.matchAll(/fetch\(([^,)]+)/g)) {
    const arg = m[1].trim();
    assert.doesNotMatch(arg, /inputText|question|query|userInput|params\./,
      `fetch() is called with something user-controlled: ${arg}`);
  }
});

test('no database client ships in the app, so there is no client-side RLS to abuse', () => {
  // The honest position on row-level security: there is no data layer in this
  // bundle to secure. When a backend arrives, RLS belongs on the server, and a
  // client holding an anon key that talks straight to Postgres is the pattern
  // this test exists to notice if it ever appears.
  for (const file of SOURCE) {
    const src = read(file);
    assert.doesNotMatch(src, /@supabase\/supabase-js/, `${file} imports a Postgres client`);
    assert.doesNotMatch(src, /\bfrom\(['"`]\w+['"`]\)\s*\.\s*select\(/, `${file} queries a table directly`);
  }
});

// ─── Kill switch ─────────────────────────────────────────────────────────────

test('a malformed payload is discarded whole, never partly applied', () => {
  for (const bad of [
    null, 'nope', 42, [],
    { blueprint: 'off' },                                    // not an object
    { blueprint: { killed: 'yes' } },                        // not a boolean
    { blueprint: { killed: true } },                         // no reason
    { blueprint: { killed: true, reason: 'x', wat: 1 } },     // unknown key
  ]) {
    const c = parseKillConfig(bad);
    assert.equal(c.ok, false, `${JSON.stringify(bad)} should be refused`);
    assert.deepEqual(c.kills, {}, 'a refused payload must apply nothing at all');
  }
});

test('a well formed payload parses', () => {
  const c = parseKillConfig({
    BLUEPRINT: { killed: true, reason: 'Takeoff is misreading dense sheets.' },
    VOICE_ASK: { killed: false },
  });
  assert.equal(c.ok, true);
  assert.equal(c.kills.BLUEPRINT.killed, true);
  assert.match(c.kills.BLUEPRINT.reason, /misreading/);
  assert.equal(c.kills.VOICE_ASK.killed, false);
});

test('paid content and safety surfaces cannot be killed remotely', () => {
  for (const id of PROTECTED) assert.equal(isProtected(id), true);

  const c = parseKillConfig({
    CALCULATOR: { killed: true, reason: 'nope' },
    PERMIT: { killed: true, reason: 'nope' },
    paywall: { killed: true, reason: 'nope' },
    disclaimers: { killed: true, reason: 'nope' },
  });
  assert.equal(c.ok, true, 'protected ids are dropped, not treated as a broken payload');
  assert.deepEqual(c.kills, {}, 'nothing protected may be killed');

  // And even a hand-built config cannot take them away.
  const forged = { ok: true, kills: { CALCULATOR: { killed: true, reason: 'x' } } };
  const s = featureState('CALCULATOR', { config: forged });
  assert.equal(s.available, true, 'a subscriber cannot lose what they paid for');
  assert.equal(s.protectedFromKill, true);
});

test('unreachable config fails OPEN — everything stays on', () => {
  const s = featureState('BLUEPRINT', { reachable: false });
  assert.equal(s.available, true, 'a bad connection must not dark-launch the app');
  assert.equal(s.usingDefaults, true);

  assert.equal(featureState('BLUEPRINT', { config: null }).available, true);
  assert.equal(featureState('BLUEPRINT', { config: { ok: false } }).available, true);
});

test('a kill is scoped by build, so fixing it in 29 does not punish 29', () => {
  const config = parseKillConfig({
    BLUEPRINT: { killed: true, reason: 'Broken in 28.', maxBuild: 28 },
  });
  assert.equal(featureState('BLUEPRINT', { config, build: 28 }).available, false);
  assert.equal(featureState('BLUEPRINT', { config, build: 29 }).available, true,
    'a build with the fix should not stay dark');
});

test('a temporary kill expires instead of becoming permanent', () => {
  const config = parseKillConfig({
    BLUEPRINT: { killed: true, reason: 'Investigating.', until: '2026-08-08T00:00:00.000Z' },
  });
  const before = Date.parse('2026-08-07T12:00:00.000Z');
  const after = Date.parse('2026-08-09T12:00:00.000Z');
  assert.equal(featureState('BLUEPRINT', { config, now: before }).available, false);
  assert.equal(featureState('BLUEPRINT', { config, now: after }).available, true);
  assert.equal(featureState('BLUEPRINT', { config, now: after }).expiredKill, true);
});

test('a killed feature always has something to show the user', () => {
  const config = parseKillConfig({ BLUEPRINT: { killed: true, reason: 'Fixing a takeoff bug.' } });
  const s = featureState('BLUEPRINT', { config });
  const notice = killedNotice(s);
  assert.equal(notice.title, 'Paused');
  assert.match(notice.body, /takeoff bug/);
  assert.match(notice.reassurance, /Everything else works/);
  assert.equal(killedNotice({ killed: false }), null);

  // Every feature resolves to a state, so no tile can render undefined.
  const states = allStates({ config });
  for (const [id, st] of Object.entries(states)) {
    assert.equal(typeof st.available, 'boolean', `${id} has no resolved state`);
  }
});

test('the kill switch says what it will not touch', () => {
  assert.match(KILL_SWITCH_NOTE, /cannot be removed/i);
  assert.match(KILL_SWITCH_NOTE, /Calculators/);
});
