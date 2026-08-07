// ─── BEFORE THE INSPECTOR ARRIVES ────────────────────────────────────────────
// The property this file exists to hold: the module must not blur what is
// trade-general into what is jurisdictional. The first is shippable content and
// the second is a question with a place to write the answer.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  Stage, STAGE_LABEL, FAIL_REASONS, failReasonsFor, checklist, callScript,
  SCHEDULING_QUESTIONS, PREP_DISCLAIMER,
} from '../src/core/field/inspectionPrep.js';
import { WORK_TYPES } from '../src/core/field/permits.js';
import { FIELD_KEYS } from '../src/core/field/ahj.js';
import { resolveCitation } from '../src/nec/citations.js';

// ─── What may ship as content ────────────────────────────────────────────────

test('every fail reason is something you can check yourself, standing in the room', () => {
  // The entire value: a failed inspection costs a week, and most of them are
  // caught by walking the job once with the right list. An item that needs the
  // inspector's opinion, a phone call, or a jurisdiction we have not confirmed
  // does not belong here.
  for (const r of FAIL_REASONS) {
    assert.ok(r.check, `${r.id} has nothing to do`);
    // Phrased as an action, not a fact to know.
    assert.match(r.check, /^(Count|Walk|Look|Check|Confirm|Pull|Measure|Fill|Torque|Have)/,
      `${r.id} is phrased as knowledge rather than an action: "${r.check}"`);
    assert.ok(Object.values(Stage).includes(r.stage), `${r.id} has no stage`);
    assert.ok(r.tags.length > 0, `${r.id} applies to no work type`);
  }
});

test('every tag names a work type that exists', () => {
  const ids = new Set(WORK_TYPES.map((w) => w.id));
  for (const r of FAIL_REASONS) {
    for (const t of r.tags) assert.ok(ids.has(t), `${r.id} tags unknown work type "${t}"`);
  }
});

test('an unresolvable citation is dropped, never shown as a bare string', () => {
  // A code section a reader cannot look up is worth less than nothing: it looks
  // authoritative and cannot be checked. Same rule as everywhere else in the app.
  for (const r of failReasonsFor(null)) {
    if (r.reference === null) continue;
    assert.ok(resolveCitation(r.reference.ref), `${r.id} offered an unresolved citation`);
    assert.ok(r.reference.display);
  }
  // And some genuinely are dropped, which is the point — the check still stands
  // without a number the app cannot back.
  const dropped = failReasonsFor(null).filter((r) => r.reference === null);
  assert.ok(dropped.length > 0);
  for (const r of dropped) assert.ok(r.check, 'a dropped citation must not take the item with it');
});

test('the checklist is scoped to the work in front of you', () => {
  const service = checklist('service-change');
  const ids = service.groups.flatMap((g) => g.items.map((i) => i.id));
  assert.ok(ids.includes('grounding-electrode'));
  assert.ok(ids.includes('working-space'));
  // Nail plates are a rough-in concern on a remodel, not a service change.
  assert.equal(ids.includes('nail-plates'), false);

  const circuit = checklist('new-circuit');
  const cIds = circuit.groups.flatMap((g) => g.items.map((i) => i.id));
  assert.ok(cIds.includes('nail-plates'));
  assert.ok(cIds.includes('box-fill'));
});

test('empty stages do not render as empty headings', () => {
  const c = checklist('new-circuit');
  for (const g of c.groups) assert.ok(g.items.length > 0, `${g.label} is an empty heading`);
  assert.ok(c.groups.every((g) => STAGE_LABEL[g.stage] === g.label));
});

// ─── What may not ────────────────────────────────────────────────────────────

test('turnaround is a question, never a number', () => {
  const q = SCHEDULING_QUESTIONS.find((x) => x.id === 'turnaround');
  assert.ok(q, 'scheduling turnaround must be asked about');
  assert.match(q.ask, /\?$/, 'it is a question');
  // "Usually two to three business days" is a number somebody schedules a
  // drywall crew around, and we do not know it for a single jurisdiction.
  const everything = JSON.stringify(SCHEDULING_QUESTIONS) + JSON.stringify(FAIL_REASONS);
  assert.doesNotMatch(everything, /\b\d+\s*(-|to)\s*\d+\s*(business\s*)?days?\b/i,
    'no turnaround figure may be asserted');
  assert.doesNotMatch(everything, /usually takes|typically takes|expect .* days/i);
});

test('every scheduling answer has somewhere real to be written down', () => {
  // A question with no field to record it in is a question somebody answers
  // once and loses.
  for (const q of SCHEDULING_QUESTIONS) {
    assert.ok(FIELD_KEYS.includes(q.record), `"${q.id}" records into unknown field "${q.record}"`);
    assert.ok(q.why, `${q.id} does not say why it is worth asking`);
  }
});

test('the inspections a work type lists are labelled as typical, not as required', () => {
  const c = checklist('ev-charger');
  assert.ok(c.typicalInspections.length > 0);
  // Which inspections a jurisdiction actually performs is theirs to say.
  assert.match(c.inspectionsCaveat, /usually gets/i);
  assert.match(c.inspectionsCaveat, /theirs to confirm/i);
});

test('nothing promises a pass', () => {
  // The guardrail from day one: no wording may imply SparkConnect can deliver a
  // permit or an inspection outcome.
  // The disclaimer is checked separately: it is the one place the word
  // "guarantee" is allowed, because there it is being denied.
  const all = JSON.stringify([FAIL_REASONS, SCHEDULING_QUESTIONS, checklist('remodel'), callScript('remodel')])
    .split(JSON.stringify(PREP_DISCLAIMER).slice(1, -1)).join('');
  for (const banned of [
    /guarantee/i, /will pass/i, /ensures? (a )?pass/i, /code.compliant/i,
    /approved by/i, /certified/i,
  ]) {
    assert.doesNotMatch(all, banned, `banned promise: ${banned}`);
  }
  assert.match(PREP_DISCLAIMER, /does not guarantee a pass/i);
  assert.match(PREP_DISCLAIMER, /authority having jurisdiction/i);
});

// ─── The call ────────────────────────────────────────────────────────────────

test('the call script asks about the scope before it asks about scheduling', () => {
  const s = callScript('service-change');
  const groups = s.questions.map((q) => q.group);
  assert.equal(groups[0], 'This job', 'the scope questions come first');
  assert.ok(groups.indexOf('Scheduling') > groups.lastIndexOf('This job'));
  // The code edition goes last: it is the one people ring back about, and being
  // wrong about it is silent until inspection.
  assert.equal(groups[groups.length - 1], 'Code');
  assert.match(s.questions[s.questions.length - 1].ask, /NEC edition/);
  assert.match(s.questions[s.questions.length - 1].ask, /amendment/i);
});

test('every question in the script is a question', () => {
  for (const id of WORK_TYPES.map((w) => w.id)) {
    const s = callScript(id);
    assert.ok(s.questions.length > 0, `${id} has nothing to ask`);
    for (const q of s.questions) assert.match(q.ask, /\?$/, `not a question: "${q.ask}"`);
  }
});

test('an unknown work type degrades instead of throwing', () => {
  const c = checklist('not-a-work-type');
  assert.equal(c.workType, null);
  assert.equal(c.total, 0);
  assert.deepEqual([...c.groups], []);
  assert.ok(c.disclaimer, 'the disclaimer survives an empty checklist');

  const s = callScript(null);
  assert.equal(s.workType, null);
  // The scheduling and code questions still stand on their own.
  assert.ok(s.questions.length >= SCHEDULING_QUESTIONS.length + 1);
});
