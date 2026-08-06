// ─── GENERATED SCENARIO PACKS ────────────────────────────────────────────────
// Generated content is untrusted input. These tests are the contract that it
// can never crash a screen, never smuggle a no-op fault past as a puzzle, and
// never displace the handcrafted set the app ships with.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SCENARIOS, FaultKind } from '../src/core/training/troubleshooting.js';
import {
  validateGeneratedScenario, loadGeneratedPack, mergeScenarios,
  GENERATED_PREFIX, LIMITS,
} from '../src/core/training/generated.js';
import { ConductorRole } from '../src/circuit/model.js';

// A well-formed generated scenario: opening the switched leg really does break
// the single-pole lesson, so the engine check passes.
const good = (over = {}) => ({
  lessonId: 'single-pole-source-at-switch',
  title: 'Light never comes on',
  difficulty: 'Apprentice',
  customerReport: 'Flipped the switch, nothing happens. Bulb is new.',
  fault: { kind: FaultKind.OPEN_CONDUCTOR, target: { role: ConductorRole.SWITCHED_HOT } },
  choices: ['The switched leg is open', 'The neutral is open', 'The ground is missing'],
  correctChoice: 0,
  explanation: 'With the switched leg open the luminaire never sees the ungrounded conductor.',
  whatToInspect: ['Check the switch screws', 'Ring out the switched leg'],
  commonMistake: 'Replacing the bulb twice before testing for voltage.',
  ...over,
});

test('a well-formed generated scenario validates and is namespaced', () => {
  const r = validateGeneratedScenario(good());
  assert.ok(r.ok, r.reason);
  assert.ok(r.scenario.id.startsWith(GENERATED_PREFIX), 'generated ids cannot collide with shipped ones');
  assert.equal(r.scenario.generated, true);
  assert.ok(r.scenario.disclaimer, 'training disclaimer rides along');
  assert.ok(r.scenario.safetyNote);
});

test('a fault that does not change circuit behaviour is rejected', () => {
  // Opening a traveler in a lesson that has no travelers is a silent no-op:
  // plausible prose, no symptom, no answer.
  const r = validateGeneratedScenario(good({
    fault: { kind: FaultKind.OPEN_CONDUCTOR, target: { role: ConductorRole.TRAVELER_A } },
  }));
  assert.equal(r.ok, false);
  assert.match(r.reason, /does not change how the circuit behaves/);
});

test('terminals that do not exist in the lesson are rejected', () => {
  for (const fault of [
    { kind: FaultKind.SWAPPED, terminals: ['sw9.com', 'sw9.t1'] },
    { kind: FaultKind.SHORT, from: 'nope.a', to: 'src.hot' },
    { kind: FaultKind.MISLANDED, target: { role: ConductorRole.LINE }, end: 'to', to: 'ghost.x' },
  ]) {
    const r = validateGeneratedScenario(good({ fault }));
    assert.equal(r.ok, false, `${fault.kind} should reject unknown terminals`);
  }
});

test('an unknown fault kind is rejected rather than silently ignored', () => {
  const r = validateGeneratedScenario(good({ fault: { kind: 'ARC_FLASH_OF_DOOM' } }));
  assert.equal(r.ok, false);
  assert.match(r.reason, /unknown fault kind/);
});

test('unbounded model output is truncated, not passed through', () => {
  const r = validateGeneratedScenario(good({ customerReport: 'x'.repeat(5000) }));
  assert.ok(r.ok, r.reason);
  assert.ok(r.scenario.customerReport.length <= LIMITS.customerReport, 'customer report is capped');
});

test('control characters are stripped from generated text', () => {
  const r = validateGeneratedScenario(good({ title: 'Dead\u0007 outlet\u001B[31m' }));
  assert.ok(r.ok, r.reason);
  assert.ok(!/[\u0000-\u001F\u007F]/.test(r.scenario.title), 'no control characters survive');
});

test('a correctChoice pointing outside the choices is rejected', () => {
  for (const correctChoice of [-1, 3, 99, 1.5, '0', null]) {
    const r = validateGeneratedScenario(good({ correctChoice }));
    assert.equal(r.ok, false, `correctChoice ${correctChoice} must be rejected`);
  }
});

test('too few choices, or duplicated ones, are rejected', () => {
  assert.equal(validateGeneratedScenario(good({ choices: ['a', 'b'] })).ok, false);
  assert.equal(validateGeneratedScenario(good({ choices: ['Same', 'same', 'Other'] })).ok, false);
});

test('an unknown lessonId is rejected', () => {
  assert.equal(validateGeneratedScenario(good({ lessonId: 'not-a-lesson' })).ok, false);
  assert.equal(validateGeneratedScenario(good({ lessonId: 42 })).ok, false);
});

test('garbage input never throws', () => {
  for (const junk of [null, undefined, 42, 'string', [], {}, { lessonId: {} }]) {
    const r = validateGeneratedScenario(junk);
    assert.equal(r.ok, false);
    assert.ok(typeof r.reason === 'string');
  }
});

test('one bad scenario in a pack does not cost the good ones', () => {
  const { scenarios, rejected } = loadGeneratedPack([
    good(),
    good({ title: 'Broken', fault: { kind: 'NONSENSE' } }),
    good({ title: 'Neutral open', customerReport: 'Light is dead but the switch feels normal.',
           fault: { kind: FaultKind.OPEN_CONDUCTOR, target: { role: ConductorRole.NEUTRAL } } }),
  ]);
  assert.equal(scenarios.length, 2);
  assert.equal(rejected.length, 1);
  assert.match(rejected[0].reason, /unknown fault kind/);
});

test('a pack is capped and non-list input degrades quietly', () => {
  const huge = Array.from({ length: LIMITS.packSize + 25 }, (_, i) =>
    good({ title: `Scenario ${i}`, customerReport: `Report number ${i} from the field.` }));
  assert.ok(loadGeneratedPack(huge).scenarios.length <= LIMITS.packSize);

  const bad = loadGeneratedPack('not a pack');
  assert.deepEqual(bad.scenarios, []);
  assert.equal(bad.rejected.length, 1);
});

test('duplicate generated ids collapse to one', () => {
  const one = good({ id: 'dup' });
  const { scenarios, rejected } = loadGeneratedPack([one, { ...one }]);
  assert.equal(scenarios.length, 1);
  assert.match(rejected[0].reason, /duplicate id/);
});

test('handcrafted scenarios always come first and are never displaced', () => {
  const gen = loadGeneratedPack([good()]).scenarios;
  const merged = mergeScenarios(SCENARIOS, gen);
  assert.equal(merged.length, SCENARIOS.length + 1);
  for (let i = 0; i < SCENARIOS.length; i++) assert.equal(merged[i].id, SCENARIOS[i].id);
});

test('the app works with no generated content at all', () => {
  const merged = mergeScenarios(SCENARIOS);
  assert.deepEqual(merged.map((s) => s.id), SCENARIOS.map((s) => s.id));
  assert.ok(merged.length > 0, 'handcrafted content stands alone');
});
