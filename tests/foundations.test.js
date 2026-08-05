// ─── FEATURE FLAG / PRIVACY / CODE EDITION TESTS ─────────────────────────────
// Requirements: FLG-12, FLG-13, ANL-07, ANL-08, CODE-01 … CODE-08, REV-13

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULTS, FLAG_NAMES, HARD_LOCKED_OFF, sanitize, resolve, resolveAll, isLessonFlagEnabled,
} from '../src/flags/core.js';
import {
  scrubProperties, isDeniedKey, looksIdentifying, amountBucket, hashId, ALLOWED_PROPERTIES,
} from '../src/privacy/scrub.js';
import {
  Edition, EDITION_OPTIONS, DEFAULT_EDITION, normalizeEdition, effectiveEdition,
  editionLabel, resultEditionLabel, adoptedCodeContext, matchesEdition,
  CHANGE_CATEGORIES_2026, EDITION_VISIBLE_SURFACES,
} from '../src/nec/editions.js';
import { ALL_LESSONS } from '../src/circuit/lessons/index.js';

// ─── Feature flags ───────────────────────────────────────────────────────────

test('FLG-01…FLG-11: all eleven required flags exist', () => {
  for (const name of [
    'wiringSimulationsEnabled', 'fourWaySimulationEnabled', 'troubleshootingGamesEnabled',
    'challengeModeEnabled', 'stripeConnectEnabled', 'customerPaymentsEnabled',
    'platformFeesEnabled', 'roleBasedOnboardingEnabled', 'firstWinPaywallEnabled',
    'shareCardsEnabled', 'updatedLightThemeEnabled',
  ]) {
    assert.ok(FLAG_NAMES.includes(name), `missing flag ${name}`);
  }
  assert.equal(FLAG_NAMES.length, 11);
});

test('FLG-12: every incomplete or money-touching feature defaults OFF', () => {
  for (const name of FLAG_NAMES) {
    if (name === 'updatedLightThemeEnabled') continue; // safe, reversible, complete
    assert.equal(DEFAULTS[name], false, `${name} must default to false`);
  }
});

test('FLG-12: payment flags cannot be forced on by a remote payload', () => {
  const remote = Object.fromEntries(HARD_LOCKED_OFF.map((n) => [n, true]));
  for (const name of HARD_LOCKED_OFF) {
    assert.equal(resolve(name, { remote }), false, `${name} must stay off (no backend — D-01)`);
  }
});

test('FLG-12: payment flags cannot be forced on by a local dev override either', () => {
  const local = { customerPaymentsEnabled: true, stripeConnectEnabled: true };
  assert.equal(resolve('customerPaymentsEnabled', { local, isDev: true }), false);
  assert.equal(resolve('stripeConnectEnabled', { local, isDev: true }), false);
});

test('FLG-13: a remote kill-switch can turn a live feature off without a rebuild', () => {
  assert.equal(resolve('updatedLightThemeEnabled', {}), true);
  assert.equal(resolve('updatedLightThemeEnabled', { remote: { updatedLightThemeEnabled: false } }), false);
});

test('FLG-13: a remote payload can turn a training flag on', () => {
  assert.equal(resolve('wiringSimulationsEnabled', {}), false);
  assert.equal(resolve('wiringSimulationsEnabled', { remote: { wiringSimulationsEnabled: true } }), true);
});

test('local overrides are ignored outside dev builds', () => {
  const local = { wiringSimulationsEnabled: true };
  assert.equal(resolve('wiringSimulationsEnabled', { local, isDev: false }), false);
  assert.equal(resolve('wiringSimulationsEnabled', { local, isDev: true }), true);
});

test('unknown flags resolve false, never true', () => {
  assert.equal(resolve('someFutureFlag', { remote: { someFutureFlag: true } }), false);
});

test('a malformed remote payload cannot corrupt flag state', () => {
  assert.deepEqual(sanitize(null), {});
  assert.deepEqual(sanitize('nope'), {});
  assert.deepEqual(sanitize([1, 2]), {});
  assert.deepEqual(sanitize({ wiringSimulationsEnabled: 'yes', bogus: true }), {},
    'non-boolean values and unknown keys are dropped');
  assert.deepEqual(sanitize({ wiringSimulationsEnabled: true, bogus: true }), { wiringSimulationsEnabled: true });
});

test('SIM-18: every lesson declares a feature flag, and it is a real flag', () => {
  for (const l of ALL_LESSONS) {
    assert.ok(l.featureFlag, `${l.id} must declare a feature flag`);
    assert.ok(FLAG_NAMES.includes(l.featureFlag), `${l.id} references unknown flag ${l.featureFlag}`);
    assert.equal(isLessonFlagEnabled(l, {}), false, `${l.id} must be flagged off by default`);
  }
});

test('resolveAll returns every flag', () => {
  const all = resolveAll({});
  assert.equal(Object.keys(all).length, FLAG_NAMES.length);
});

// ─── Analytics privacy guard (ANL-07, ANL-08) ────────────────────────────────

test('ANL-07: customer-identifying keys are dropped', () => {
  const { props, dropped } = scrubProperties({
    customer_name: 'Jane Doe',
    email: 'jane@example.com',
    phone: '555-123-4567',
    address: '123 Main Street, Springfield',
    invoice_description: 'Panel upgrade at the Doe residence',
    photo_uri: 'file:///var/photos/job1.jpg',
    company: 'Doe Electric LLC',
    lesson_id: 'three-way-source-at-switch',
  });
  assert.deepEqual(props, { lesson_id: 'three-way-source-at-switch' });
  for (const key of ['customer_name', 'email', 'phone', 'address', 'invoice_description', 'photo_uri', 'company']) {
    assert.ok(dropped.includes(key), `${key} must be dropped`);
  }
});

test('ANL-07: the guard is deny-by-default — unknown keys never pass', () => {
  const { props } = scrubProperties({ some_new_field: 'value', another: 42 });
  assert.deepEqual(props, {}, 'an unlisted key must not be forwarded');
});

test('ANL-07: identifying values are caught even under an allowed key name', () => {
  assert.deepEqual(scrubProperties({ reason: 'contact jane@example.com' }).props, {});
  assert.deepEqual(scrubProperties({ reason: '+1 (555) 123-4567' }).props, {});
  assert.deepEqual(scrubProperties({ reason: '4111111111111111' }).props, {});
  assert.deepEqual(scrubProperties({ reason: '123 Main Street' }).props, {});
  assert.deepEqual(scrubProperties({ reason: 'trial_expired' }).props, { reason: 'trial_expired' });
});

test('ANL-07: nested objects and arrays are dropped wholesale', () => {
  const { props } = scrubProperties({ role: { name: 'Jane' }, score: [1, 2, 3], xp: 100 });
  assert.deepEqual(props, { xp: 100 });
});

test('ANL-07: AI prompts are never forwarded', () => {
  const { props } = scrubProperties({ prompt: 'Explain the panel at 42 Oak Ave for Mrs Smith', tool: 'spark_ai' });
  assert.deepEqual(props, { tool: 'spark_ai' });
});

test('key denial is case-insensitive', () => {
  assert.ok(isDeniedKey('CustomerEmail'));
  assert.ok(isDeniedKey('CUSTOMER_PHONE'));
  assert.ok(isDeniedKey('billingAddress'));
  assert.equal(isDeniedKey('lesson_id'), false);
});

test('long free text is truncated rather than forwarded whole', () => {
  const { props } = scrubProperties({ reason: 'x'.repeat(500) });
  assert.equal(props.reason.length, 120);
});

test('ANL-08: amounts are bucketed, never exact', () => {
  assert.equal(amountBucket(0), '0');
  assert.equal(amountBucket(75), '<100');
  assert.equal(amountBucket(250), '100-499');
  assert.equal(amountBucket(2500), '1000-4999');
  assert.equal(amountBucket(50000), '10000+');
  assert.equal(amountBucket('not a number'), 'unknown');
  assert.equal(amountBucket(-5), 'unknown');
});

test('ANL-08: document ids are hashed, stable, and not reversible to the input', () => {
  const a = hashId('INV-2026-0001');
  assert.equal(a, hashId('INV-2026-0001'), 'stable for joins');
  assert.notEqual(a, hashId('INV-2026-0002'));
  assert.ok(!a.includes('INV'), 'must not contain the source id');
});

test('the allowlist itself contains no identifying property names', () => {
  for (const key of ALLOWED_PROPERTIES) {
    const bad = ['customer', 'email', 'phone', 'street', 'password', 'secret'];
    assert.ok(!bad.some((b) => key.includes(b)), `allowlist must not contain "${key}"`);
  }
});

test('looksIdentifying does not false-positive on ordinary values', () => {
  for (const v of ['three-way-source-at-switch', 'CHALLENGE', 'pro_annual', 'v1.1.0', '2026']) {
    assert.equal(looksIdentifying(v), false, `"${v}" should be safe`);
  }
});

// ─── Code editions (CODE-01 … CODE-08) ───────────────────────────────────────

test('CODE-02: the selector offers 2020, 2023, 2026 and "not sure"', () => {
  assert.deepEqual(EDITION_OPTIONS.map((o) => o.value), ['2020', '2023', '2026', 'unsure']);
});

test('CODE-01/D-08: the default is 2023, the most widely adopted edition', () => {
  assert.equal(DEFAULT_EDITION, Edition.NEC_2023);
  assert.equal(normalizeEdition(undefined), Edition.NEC_2023);
  assert.equal(normalizeEdition('1999'), Edition.NEC_2023, 'garbage falls back, never forward');
});

test('CODE-01: "not sure" resolves to the default rather than guessing 2026', () => {
  assert.equal(effectiveEdition(Edition.UNSURE), Edition.NEC_2023);
  assert.equal(editionLabel(Edition.UNSURE), '2023 NEC');
});

test('CODE-06: an earlier edition is labelled with a pointer to 2026 differences', () => {
  const l = resultEditionLabel(Edition.NEC_2023);
  assert.equal(l.primary, 'Based on selected edition: 2023 NEC');
  assert.match(l.secondary, /2026 edition may differ/);
  assert.equal(l.isNewest, false);
});

test('CODE-06: selecting 2026 warns that the jurisdiction may enforce an earlier edition', () => {
  const l = resultEditionLabel(Edition.NEC_2026);
  assert.equal(l.primary, '2026 edition selected');
  assert.match(l.secondary, /may still enforce an earlier edition/);
  assert.equal(l.isNewest, true);
});

test('CODE-01: no label ever claims universal 2026 compliance', () => {
  for (const e of [Edition.NEC_2020, Edition.NEC_2023, Edition.NEC_2026, Edition.UNSURE]) {
    const l = resultEditionLabel(e);
    const text = `${l.primary} ${l.secondary}`.toLowerCase();
    assert.ok(!text.includes('compliant'), `"${text}" must not claim compliance`);
  }
});

test('CODE-03: every required surface is listed', () => {
  assert.deepEqual(EDITION_VISIBLE_SURFACES, [
    'spark_ai', 'code_quiz', 'formula_reference', 'calculator_explanation',
    'result_card', 'saved_work', 'share_card',
  ]);
});

test('CODE-04: all ten change categories exist', () => {
  assert.equal(CHANGE_CATEGORIES_2026.length, 10);
  assert.deepEqual(CHANGE_CATEGORIES_2026.map((c) => c.id), [
    'new_relocated', 'services_feeders', 'grounding_bonding', 'gfci_afci', 'ev_emerging',
    'limited_energy', 'medium_voltage', 'motors_transformers', 'table_changes', 'comparison_lessons',
  ]);
});

test('REV-13: no 2026 change content is fabricated — every category awaits a verified source', () => {
  for (const c of CHANGE_CATEGORIES_2026) {
    assert.equal(c.contentStatus, 'AWAITING_VERIFIED_SOURCE', `${c.id} must not ship invented content`);
    assert.deepEqual(c.items, [], `${c.id} must be empty until a verified source is supplied`);
  }
});

test('CODE-08: content filters by edition, and unlabelled content shows for everyone', () => {
  assert.equal(matchesEdition({ editions: ['2026'] }, Edition.NEC_2023), false);
  assert.equal(matchesEdition({ editions: ['2023'] }, Edition.NEC_2023), true);
  assert.equal(matchesEdition({ editions: ['2020', '2023'] }, Edition.UNSURE), true);
  assert.equal(matchesEdition({}, Edition.NEC_2020), true, 'edition-agnostic content always matches');
});

test('AI-02: adoptedCodeContext carries the selected and effective edition plus the reorg note', () => {
  const ctx = adoptedCodeContext(Edition.UNSURE);
  assert.equal(ctx.selected, 'unsure');
  assert.equal(ctx.effective, '2023');
  assert.equal(ctx.userIsUnsure, true);
  assert.match(ctx.note, /2029/);
});
