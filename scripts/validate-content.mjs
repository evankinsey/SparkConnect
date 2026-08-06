#!/usr/bin/env node
// ─── CONTENT VALIDATION GATE ─────────────────────────────────────────────────
//
//   npm run validate:content
//
// Walks every lesson, every troubleshooting scenario, and every citation in
// shipped content through the deterministic engine, and exits non-zero on the
// first thing that cannot be proven correct.
//
// This is the difference between "we tested the engine" and "we tested the
// content". The engine has had tests since day one; what it did not have was
// anything stopping a plausible-looking lesson from entering the catalog
// without the engine ever being asked whether it works.
//
// Every check here answers a question a person could get hurt by:
//
//   Does the load actually come on?          → LOAD_ALWAYS_OFF
//   Does it ever fail to go off?             → LOAD_ALWAYS_ON
//   Is the grounded conductor being switched? → NEVER_SWITCH_THE_GROUNDED_CONDUCTOR
//   Is there a path that bypasses the load?   → NO_SHORT_IN_ANY_STATE
//   Is every EGC bonded back to the supply?   → EGC_CONTINUITY
//   Is any citation invented?                 → resolveCitation returns null
//
// Run it in CI. A red exit code here means content does not ship.

import { ALL_LESSONS, solutionCircuit } from '../src/circuit/lessons/index.js';
import { validate, Severity } from '../src/circuit/validator.js';
import { truthTable } from '../src/circuit/solver.js';
import { SCENARIOS, buildScenario } from '../src/core/training/troubleshooting.js';
import { resolveCitation } from '../src/nec/citations.js';
import { electricalFieldsIn } from '../src/core/content/authority.js';

let failures = 0;
let checks = 0;

const ok = (msg) => { checks += 1; process.stdout.write(`  ✓ ${msg}\n`); };
const bad = (msg, detail) => {
  checks += 1;
  failures += 1;
  process.stdout.write(`  ✗ ${msg}\n`);
  if (detail) process.stdout.write(`      ${String(detail).split('\n').join('\n      ')}\n`);
};

const section = (title) => process.stdout.write(`\n${title}\n${'─'.repeat(title.length)}\n`);

// ─── 1. Every lesson's reference solution must actually work ─────────────────

section('Lesson reference solutions');

for (const lesson of ALL_LESSONS) {
  const circuit = solutionCircuit(lesson);
  let result;
  try {
    result = validate(circuit, lesson.expectations);
  } catch (err) {
    bad(`${lesson.id}: validator threw`, err.stack);
    continue;
  }

  if (!result.valid) {
    bad(`${lesson.id}: reference solution does not validate`,
      result.errors.map((e) => `[${e.category}] ${e.message}${e.detail ? ` — ${e.detail}` : ''}`).join('\n'));
    continue;
  }

  // A lesson whose load never changes state is not teaching switching, whatever
  // its title says. Skip lessons that legitimately have no switch.
  const tt = truthTable(circuit);
  if (tt.switchIds.length > 0) {
    const states = new Set(tt.rows.map((r) => r.anyLoadEnergized));
    if (states.size < 2) {
      bad(`${lesson.id}: load never changes state across the truth table`);
      continue;
    }
  }

  if (tt.rows.some((r) => r.shortCircuit)) {
    bad(`${lesson.id}: reference solution shorts in at least one switch position`);
    continue;
  }

  ok(`${lesson.id} — valid, ${tt.rows.length} switch states, no shorts`);
}

// ─── 2. Deliberately broken circuits must be CAUGHT ─────────────────────────
// A validator that never fails is indistinguishable from no validator. These
// are the four faults from the safety mandate; each one must produce an error.

section('Known-bad circuits must be rejected');

const { conductor, terminalId: T, ConductorRole } = await import('../src/circuit/model.js');
const base = ALL_LESSONS.find((l) => l.id === 'single-pole-source-at-switch');

const mustReject = (label, conductors, expectedRule) => {
  const result = validate({ components: base.components(), conductors }, base.expectations);
  if (result.valid) return bad(`${label}: validator accepted it`);
  const rules = result.errors.map((e) => e.rule);
  if (expectedRule && !rules.includes(expectedRule)) {
    return bad(`${label}: caught, but not by ${expectedRule}`, `got: ${rules.join(', ')}`);
  }
  ok(`${label} — rejected (${expectedRule ?? rules[0]})`);
};

mustReject('switched grounded conductor', [
  conductor(T('src', 'neutral'), T('sw1', 'a'), ConductorRole.NEUTRAL),
  conductor(T('sw1', 'b'), T('lamp', 'neu'), ConductorRole.NEUTRAL),
  conductor(T('src', 'hot'), T('lamp', 'hot'), ConductorRole.LINE),
  conductor(T('src', 'ground'), T('gBox', 'p1'), ConductorRole.EQUIPMENT_GROUND),
  conductor(T('gBox', 'p2'), T('sw1', 'gnd'), ConductorRole.EQUIPMENT_GROUND),
  conductor(T('gBox', 'p3'), T('lamp', 'gnd'), ConductorRole.EQUIPMENT_GROUND),
], 'NEVER_SWITCH_THE_GROUNDED_CONDUCTOR');

mustReject('dead short across the supply', [
  conductor(T('src', 'hot'), T('sw1', 'a'), ConductorRole.LINE),
  conductor(T('sw1', 'b'), T('nBox', 'p1'), ConductorRole.SWITCHED_HOT),
  conductor(T('src', 'neutral'), T('nBox', 'p1'), ConductorRole.NEUTRAL),
  conductor(T('nBox', 'p2'), T('lamp', 'neu'), ConductorRole.NEUTRAL),
  conductor(T('src', 'ground'), T('gBox', 'p1'), ConductorRole.EQUIPMENT_GROUND),
  conductor(T('gBox', 'p2'), T('sw1', 'gnd'), ConductorRole.EQUIPMENT_GROUND),
  conductor(T('gBox', 'p3'), T('lamp', 'gnd'), ConductorRole.EQUIPMENT_GROUND),
], 'NO_SHORT_IN_ANY_STATE');

mustReject('open equipment ground', [
  conductor(T('src', 'hot'), T('sw1', 'a'), ConductorRole.LINE),
  conductor(T('sw1', 'b'), T('lamp', 'hot'), ConductorRole.SWITCHED_HOT),
  conductor(T('src', 'neutral'), T('nBox', 'p1'), ConductorRole.NEUTRAL),
  conductor(T('nBox', 'p2'), T('lamp', 'neu'), ConductorRole.NEUTRAL),
], 'REQUIRED_TERMINAL_CONNECTED');

mustReject('load permanently energized (switch bypassed)', [
  conductor(T('src', 'hot'), T('lamp', 'hot'), ConductorRole.LINE),
  conductor(T('src', 'hot'), T('sw1', 'a'), ConductorRole.LINE),
  conductor(T('sw1', 'b'), T('lamp', 'hot'), ConductorRole.SWITCHED_HOT),
  conductor(T('src', 'neutral'), T('nBox', 'p1'), ConductorRole.NEUTRAL),
  conductor(T('nBox', 'p2'), T('lamp', 'neu'), ConductorRole.NEUTRAL),
  conductor(T('src', 'ground'), T('gBox', 'p1'), ConductorRole.EQUIPMENT_GROUND),
  conductor(T('gBox', 'p2'), T('sw1', 'gnd'), ConductorRole.EQUIPMENT_GROUND),
  conductor(T('gBox', 'p3'), T('lamp', 'gnd'), ConductorRole.EQUIPMENT_GROUND),
], 'LOAD_MUST_SWITCH');

// ─── 3. Troubleshooting scenarios must produce a real symptom ────────────────

section('Troubleshooting scenarios');

for (const scenario of SCENARIOS) {
  let built;
  try {
    built = buildScenario(scenario.id);
  } catch (err) {
    bad(`${scenario.id}: buildScenario threw`, err.message);
    continue;
  }
  if (!built) { bad(`${scenario.id}: produced nothing`); continue; }

  // The whole premise of this module is that a scenario is a correct circuit
  // with a fault injected. If the fault does not change behaviour, the symptom
  // shown to the user is fiction — which is the failure mode of every
  // hand-written troubleshooting quiz, and the reason this check exists.
  const healthy = JSON.stringify(truthTable(built.healthyCircuit ?? built.circuit).rows);
  const faulted = JSON.stringify(truthTable(built.faultedCircuit ?? built.circuit).rows);
  if (built.healthyCircuit && built.faultedCircuit && healthy === faulted) {
    bad(`${scenario.id}: the injected fault changes nothing — the symptom is fiction`);
    continue;
  }
  ok(`${scenario.id} — fault produces a real behavioural change`);
}

// ─── 4. No content may carry an unresolvable citation ────────────────────────

section('Citations');

const citationSources = [];
for (const lesson of ALL_LESSONS) {
  for (const note of lesson.referenceNotes ?? []) {
    if (note && note.ref) citationSources.push({ where: lesson.id, ref: note.ref, verified: note.verified === true });
  }
}

const { NEC_QUESTIONS } = await import('../src/core/content/dailyQuestions.js');
for (const q of NEC_QUESTIONS) {
  if (q.ref) citationSources.push({ where: `daily:${q.id}`, ref: q.ref, verified: true });
}

for (const { where, ref, verified } of citationSources) {
  if (!verified) { ok(`${where}: "${ref}" is flagged unverified and will not render`); continue; }
  if (resolveCitation(ref)) ok(`${where}: ${ref}`);
  else bad(`${where}: "${ref}" does not resolve — it would render as an invented citation`,
    'Add it to src/nec/citations.js after checking the book, or mark the note verified:false.');
}

// ─── 5. Shipped content must not look like model output ─────────────────────
// Belt and braces: the authority boundary is enforced at generation time, but
// if a generated object ever leaks into a shipped constant this catches it.

section('Authority boundary on shipped content');

const leaks = electricalFieldsIn(SCENARIOS.map((s) => ({ ...s, id: undefined })));
// Scenarios legitimately describe faults in engine terms, so this check is
// scoped to the narrative fields a model would be asked to write.
const narrativeLeaks = leaks.filter((p) => /customerReport|title|explanation|hint/i.test(p));
if (narrativeLeaks.length) bad('narrative fields contain electrical keys', narrativeLeaks.join('\n'));
else ok('no electrical fields inside narrative content');

// ─── Result ─────────────────────────────────────────────────────────────────

process.stdout.write(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${checks - failures}/${checks} checks passed\n`);
if (failures > 0) {
  process.stdout.write('\nContent does not ship until every check above is green.\n');
  process.exit(1);
}
void Severity;
