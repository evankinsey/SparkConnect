// ─── SAFETY MANDATE ──────────────────────────────────────────────────────────
// The tests in this file are not about features. They are about the guarantee
// that SparkConnect cannot teach a person something that would hurt them.
//
// If one of these ever goes red, the correct response is to stop and fix it,
// not to adjust the assertion.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ELECTRICAL_FIELDS, isElectricalField, electricalFieldsIn, assertNarrativeOnly,
  partitionNarrativeOnly, ElectricalAuthorityError, CANNOT_VERIFY,
  CONFIDENCE_FLOOR, meetsConfidenceFloor,
} from '../src/core/content/authority.js';
import {
  CITATIONS, normalizeCitation, resolveCitation, isKnownCitation, usableReferenceNotes,
} from '../src/nec/citations.js';
import { validate, primaryFailure, FailureMessage, Category, checklistFor } from '../src/circuit/validator.js';
import { ALL_LESSONS, solutionCircuit, lessonById, productionLessons } from '../src/circuit/lessons/index.js';
import { APPROVALS } from '../src/circuit/lessons/approvals.js';
import { lessonFingerprint, approvalMatchesContent } from '../src/circuit/review.js';
import { truthTable } from '../src/circuit/solver.js';
import { conductor, terminalId as T, ConductorRole, ComponentType } from '../src/circuit/model.js';
import { NEC_QUESTIONS } from '../src/core/content/dailyQuestions.js';

// ─── The authority boundary ──────────────────────────────────────────────────

test('a model may write the story and never the electricity', () => {
  // Narrative is fine. This is what generation is FOR.
  assert.doesNotThrow(() => assertNarrativeOnly({
    title: 'Half the lights are out at the Riverside cafe',
    customerReport: 'It started after the storm. The back room is fine.',
    difficulty: 'Journeyman',
  }));

  // Electricity is not.
  assert.throws(() => assertNarrativeOnly({ wireSize: '12 AWG' }), ElectricalAuthorityError);
  assert.throws(() => assertNarrativeOnly({ breakerSize: 20 }), ElectricalAuthorityError);
  assert.throws(() => assertNarrativeOnly({ neutralRouting: 'through the switch' }), ElectricalAuthorityError);
  assert.throws(() => assertNarrativeOnly({ necRef: '240.4(D)(5)' }), ElectricalAuthorityError);
});

test('the boundary holds at depth, not just at the top level', () => {
  const smuggled = {
    title: 'Looks harmless',
    steps: undefined,
    hints: [
      { text: 'check the panel' },
      { text: 'now look here', detail: { groundingMethod: 'bond to the neutral bar' } },
    ],
  };
  const hits = electricalFieldsIn(smuggled);
  assert.ok(hits.some((p) => p.includes('groundingMethod')), 'nested field must be found');
  assert.throws(() => assertNarrativeOnly(smuggled), ElectricalAuthorityError);
});

test('every forbidden field is actually rejected, one by one', () => {
  // Guards against someone adding a name to the list and forgetting the lookup
  // is case-insensitive, or the traversal missing a shape.
  for (const field of ELECTRICAL_FIELDS) {
    assert.ok(isElectricalField(field), `${field} must be recognised`);
    assert.ok(isElectricalField(field.toUpperCase()), `${field} must match case-insensitively`);
    assert.throws(
      () => assertNarrativeOnly({ [field]: 'anything at all' }),
      ElectricalAuthorityError,
      `a generated payload setting "${field}" must be rejected`,
    );
  }
});

test('the dangerous families are all covered', () => {
  // Spot-check the categories from the safety mandate by the names a model
  // would most plausibly emit.
  for (const field of [
    'awg', 'breakerSize', 'ocpd', 'grounding', 'egc', 'neutral', 'mwbc',
    'sharedNeutral', 'polarity', 'lineSide', 'loadSide', 'travelers',
    'transformer', 'panelSchedule', 'loadCalculation', 'rootCause', 'fix',
    'necArticle', 'citation',
  ]) {
    assert.ok(isElectricalField(field), `${field} must be a protected field`);
  }
});

test('untrusted input cannot crash the check', () => {
  const cyclic = { title: 'ok' };
  cyclic.self = cyclic;
  assert.doesNotThrow(() => electricalFieldsIn(cyclic));

  assert.deepEqual(electricalFieldsIn(null), []);
  assert.deepEqual(electricalFieldsIn('a string'), []);
  assert.deepEqual(electricalFieldsIn(42), []);
});

test('batch generation keeps the clean ones and reports what it dropped', () => {
  const { kept, rejected } = partitionNarrativeOnly([
    { title: 'A' },
    { title: 'B', ampacity: 30 },
    { title: 'C' },
  ], 'test-pack');
  assert.equal(kept.length, 2);
  assert.equal(rejected.length, 1);
  assert.ok(rejected[0].paths.includes('ampacity'));
  assert.equal(rejected[0].source, 'test-pack');
});

test('low confidence produces silence, not a hedge', () => {
  assert.equal(meetsConfidenceFloor(CONFIDENCE_FLOOR), true);
  assert.equal(meetsConfidenceFloor(CONFIDENCE_FLOOR - 0.01), false);
  assert.equal(meetsConfidenceFloor(undefined), false);
  assert.equal(meetsConfidenceFloor(NaN), false);
  assert.equal(meetsConfidenceFloor('0.99'), false, 'a string is not a confidence');
  // The copy must not contain a soft word that a reader could keep.
  assert.ok(!/probably|likely|should be|might be/i.test(CANNOT_VERIFY));
  assert.match(CANNOT_VERIFY, /can't verify/i);
});

// ─── Citations ───────────────────────────────────────────────────────────────

test('an invented citation does not resolve, however plausible it looks', () => {
  // Each of these is correctly formed and completely made up.
  for (const fake of [
    '240.9(Q)(7)', '404.7(F)', '250.999', 'Article 9999', '310.15(Z)(3)',
    'NEC 111.11(A)', 'Table 999.1',
  ]) {
    assert.equal(resolveCitation(fake), null, `"${fake}" must not resolve`);
    assert.equal(isKnownCitation(fake), false);
  }
});

test('real citations resolve through the decoration prose puts on them', () => {
  const hit = resolveCitation('NEC 404.2(B).');
  assert.ok(hit, 'trailing period and NEC prefix must not defeat it');
  assert.equal(hit.ref, '404.2(B)');
  assert.equal(hit.display, 'NEC 404.2(B)');
  assert.equal(resolveCitation('nec 404.2(b)'), null,
    'sections are case-sensitive by design — a lowercased subdivision is not the same key');
  assert.ok(resolveCitation('NEC 2023 250.122'), 'an edition year in the string must be tolerated');
  assert.ok(resolveCitation('Article 250'));
  assert.ok(resolveCitation('NEC Chapter 9, Table 1'));
});

test('normalizeCitation refuses junk instead of guessing', () => {
  assert.equal(normalizeCitation(null), null);
  assert.equal(normalizeCitation(''), null);
  assert.equal(normalizeCitation('NEC'), null);
  assert.equal(normalizeCitation(42), null);
});

test('a citation outside its edition does not resolve', () => {
  const key = Object.keys(CITATIONS)[0];
  assert.ok(resolveCitation(key), 'resolves with no edition given');
  assert.equal(resolveCitation(key, 'nonsense-edition'), null,
    'an unknown edition must fail closed, not fall through');
});

test('EVERY citation in shipped content resolves', () => {
  // This is the test that keeps the whitelist honest. Adding content with a
  // reference nobody checked turns this red.
  for (const lesson of ALL_LESSONS) {
    for (const note of lesson.referenceNotes ?? []) {
      if (!note || !note.ref || note.verified !== true) continue;
      assert.ok(resolveCitation(note.ref), `${lesson.id} cites "${note.ref}" which does not resolve`);
    }
  }
  for (const q of NEC_QUESTIONS) {
    if (!q.ref) continue;
    assert.ok(resolveCitation(q.ref), `daily question ${q.id} cites "${q.ref}" which does not resolve`);
  }
});

test('an unverified note is dropped even when the section is real', () => {
  const notes = [
    { label: 'checked', ref: 'NEC 404.2(B)', verified: true },
    { label: 'not checked', ref: 'NEC 404.2(C)', verified: false },
    { label: 'checked but invented', ref: 'NEC 404.9(Z)', verified: true },
  ];
  const usable = usableReferenceNotes(notes);
  assert.equal(usable.length, 1);
  assert.equal(usable[0].resolved.ref, '404.2(B)');
});

// ─── The switched grounded conductor ─────────────────────────────────────────

const base = lessonById('single-pole-source-at-switch');
const grounds = () => [
  conductor(T('src', 'ground'), T('gBox', 'p1'), ConductorRole.EQUIPMENT_GROUND),
  conductor(T('gBox', 'p2'), T('sw1', 'gnd'), ConductorRole.EQUIPMENT_GROUND),
  conductor(T('gBox', 'p3'), T('lamp', 'gnd'), ConductorRole.EQUIPMENT_GROUND),
];
const check = (conductors) => validate({ components: base.components(), conductors }, base.expectations);

test('a switched neutral is named as such, not filed under "missing"', () => {
  // The switch is in the grounded conductor. The lamp still goes on and off,
  // which is exactly why this is dangerous: it looks like it works, and the
  // fixture stays energized with the switch off.
  const result = check([
    conductor(T('src', 'neutral'), T('sw1', 'a'), ConductorRole.NEUTRAL),
    conductor(T('sw1', 'b'), T('lamp', 'neu'), ConductorRole.NEUTRAL),
    conductor(T('src', 'hot'), T('lamp', 'hot'), ConductorRole.LINE),
    ...grounds(),
  ]);

  assert.equal(result.valid, false);
  const messages = result.errors.map((e) => e.message);
  assert.ok(messages.includes(FailureMessage.NEUTRAL_SWITCHED),
    'the learner must be told the grounded conductor is being switched');
  assert.ok(!messages.includes(FailureMessage.NEUTRAL_MISSING),
    'a switched neutral is not a missing neutral — conflating them taught nothing');
});

test('an OPEN neutral is still reported as missing, not as switched', () => {
  const result = check([
    conductor(T('src', 'hot'), T('sw1', 'a'), ConductorRole.LINE),
    conductor(T('sw1', 'b'), T('lamp', 'hot'), ConductorRole.SWITCHED_HOT),
    // no neutral run at all
    ...grounds(),
  ]);
  const messages = result.errors.map((e) => e.message);
  assert.ok(messages.includes(FailureMessage.NEUTRAL_MISSING));
  assert.ok(!messages.includes(FailureMessage.NEUTRAL_SWITCHED));
});

test('the switched neutral is what the user is told about FIRST', () => {
  // Built with an open ground as well, so there is competition for the headline.
  const result = check([
    conductor(T('src', 'neutral'), T('sw1', 'a'), ConductorRole.NEUTRAL),
    conductor(T('sw1', 'b'), T('lamp', 'neu'), ConductorRole.NEUTRAL),
    conductor(T('src', 'hot'), T('lamp', 'hot'), ConductorRole.LINE),
  ]);
  const primary = primaryFailure(result);
  assert.equal(primary.message, FailureMessage.NEUTRAL_SWITCHED,
    'of everything wrong here, this is the one that can get someone hurt');
  assert.equal(primary.category, Category.SWITCHING);
});

test('the diagnostic explains the consequence without printing the fix', () => {
  const result = check([
    conductor(T('src', 'neutral'), T('sw1', 'a'), ConductorRole.NEUTRAL),
    conductor(T('sw1', 'b'), T('lamp', 'neu'), ConductorRole.NEUTRAL),
    conductor(T('src', 'hot'), T('lamp', 'hot'), ConductorRole.LINE),
    ...grounds(),
  ]);
  const f = result.errors.find((e) => e.message === FailureMessage.NEUTRAL_SWITCHED);
  assert.match(f.detail, /energized when the switch is off/i, 'say why it is dangerous');
  assert.ok(!/screw 1|screw 2|sw1\.|move the/i.test(f.detail), 'do not hand over the answer');
});

// ─── The reference solutions themselves ──────────────────────────────────────

test('every shipped lesson solution survives its own validator', () => {
  for (const lesson of ALL_LESSONS) {
    const result = validate(solutionCircuit(lesson), lesson.expectations);
    assert.equal(result.valid, true,
      `${lesson.id}: ${result.errors.map((e) => e.message).join('; ')}`);
  }
});

test('no shipped lesson solution shorts, in any switch position', () => {
  for (const lesson of ALL_LESSONS) {
    const { rows } = truthTable(solutionCircuit(lesson));
    assert.ok(!rows.some((r) => r.shortCircuit), `${lesson.id} shorts somewhere`);
  }
});

test('every shipped lesson actually switches its load', () => {
  for (const lesson of ALL_LESSONS) {
    const tt = truthTable(solutionCircuit(lesson));
    if (tt.switchIds.length === 0) continue;
    const states = new Set(tt.rows.map((r) => r.anyLoadEnergized));
    assert.equal(states.size, 2, `${lesson.id}: the load never changes state`);
  }
});

// ─── The circuit from the field report ───────────────────────────────────────

test('single-pole source-at-switch, wired the way the screenshot showed it', () => {
  // Both neutrals landed on splice point 1 and all three grounds on ground
  // point 1. A splice is one node, so this is electrically identical to the
  // reference solution — and it was reported as miswired by someone reading the
  // drawing rather than the netlist. It is correct, and it stays correct.
  const result = check([
    conductor(T('src', 'hot'), T('sw1', 'a'), ConductorRole.LINE),
    conductor(T('sw1', 'b'), T('lamp', 'hot'), ConductorRole.SWITCHED_HOT),
    conductor(T('src', 'neutral'), T('nBox', 'p1'), ConductorRole.NEUTRAL),
    conductor(T('nBox', 'p1'), T('lamp', 'neu'), ConductorRole.NEUTRAL),
    conductor(T('src', 'ground'), T('gBox', 'p1'), ConductorRole.EQUIPMENT_GROUND),
    conductor(T('gBox', 'p1'), T('sw1', 'gnd'), ConductorRole.EQUIPMENT_GROUND),
    conductor(T('gBox', 'p1'), T('lamp', 'gnd'), ConductorRole.EQUIPMENT_GROUND),
  ]);
  assert.equal(result.valid, true, result.errors.map((e) => e.message).join('; '));

  const { rows } = truthTable({ components: base.components(), conductors: [
    conductor(T('src', 'hot'), T('sw1', 'a'), ConductorRole.LINE),
    conductor(T('sw1', 'b'), T('lamp', 'hot'), ConductorRole.SWITCHED_HOT),
    conductor(T('src', 'neutral'), T('nBox', 'p1'), ConductorRole.NEUTRAL),
    conductor(T('nBox', 'p1'), T('lamp', 'neu'), ConductorRole.NEUTRAL),
    ...grounds(),
  ] });
  assert.equal(rows[0].anyLoadEnergized, false, 'switch open: lamp off');
  assert.equal(rows[1].anyLoadEnergized, true, 'switch closed: lamp on');
  assert.ok(!rows.some((r) => r.shortCircuit));
});

// ─── The review gate cannot be outrun by an edit ─────────────────────────────

test('an approval stops matching when the content changes', () => {
  const original = lessonById('single-pole-source-at-switch');
  const fp = lessonFingerprint(original);
  assert.equal(typeof fp, 'string');
  assert.ok(fp.length > 0);

  // Same lesson, one hint reworded. That is a change to what a learner reads
  // and acts on, so the sign-off no longer covers it.
  const edited = {
    ...original,
    hintSteps: original.hintSteps.map((h, i) => (i === 0 ? { ...h, text: 'something else entirely' } : h)),
  };
  assert.notEqual(lessonFingerprint(edited), fp, 'rewording a hint must invalidate the approval');

  // Same for a terminal label, an objective, and a citation.
  assert.notEqual(lessonFingerprint({
    ...original, learningObjectives: ['different'],
  }), fp, 'changing an objective must invalidate the approval');
  assert.notEqual(lessonFingerprint({
    ...original, referenceNotes: [{ label: 'x', ref: 'NEC 110.14(C)', verified: true }],
  }), fp, 'changing a citation must invalidate the approval');
  assert.notEqual(lessonFingerprint({
    ...original,
    components: () => original.components().map((c) => ({
      ...c,
      terminals: c.terminals.map((t, i) => (i === 0 ? { ...t, label: 'Screw 1' } : t)),
    })),
  }), fp, 'relabelling a terminal must invalidate the approval');
});

test('the fingerprint does not change for reasons that are not content', () => {
  const lesson = lessonById('single-pole-source-at-switch');
  const fp = lessonFingerprint(lesson);
  // Recomputing must be stable, and unrelated metadata must not disturb it.
  assert.equal(lessonFingerprint(lesson), fp, 'recomputing gives the same answer');
  assert.equal(lessonFingerprint({ ...lesson, reviewDate: '1999-01-01', technicalReviewer: 'someone' }), fp,
    'who reviewed it is not part of what was reviewed');
});

test('an approval with no fingerprint does not count', () => {
  const lesson = lessonById('single-pole-source-at-switch');
  assert.equal(approvalMatchesContent(lesson, { lessonVersion: 1 }), false,
    'a record that cannot prove what it covered must fail closed');
  assert.equal(approvalMatchesContent(lesson, null), false);
  assert.equal(approvalMatchesContent(lesson, { contentFingerprint: 'deadbeef' }), false);
  assert.equal(approvalMatchesContent(lesson, { contentFingerprint: lessonFingerprint(lesson) }), true);
});

test('every lesson that ships has an approval matching its current content', () => {
  for (const lesson of productionLessons()) {
    const record = APPROVALS[lesson.id];
    assert.ok(record, `${lesson.id} ships with no approval record`);
    assert.ok(approvalMatchesContent(lesson, record),
      `${lesson.id} ships under an approval that does not describe its current content`);
  }
});

test('the terminal labels teach, and never imply DC polarity', () => {
  const sw = lessonById('single-pole-source-at-switch').components()
    .find((c) => c.type === ComponentType.SWITCH_SINGLE_POLE);
  const labels = sw.terminals.map((t) => t.label);

  // "+" and "-" would be teaching a DC mental model on a 120 V AC branch
  // circuit, and would set up the exact wrong instinct for a GFCI, where line
  // and load are genuinely not interchangeable.
  for (const label of labels) {
    assert.ok(!/[+\-−]|positive|negative|polarity/i.test(label),
      `"${label}" implies polarity that does not exist on an AC switch`);
    assert.ok(!/screw\s*\d/i.test(label), `"${label}" implies an order that does not exist`);
  }
  assert.ok(labels.filter((l) => /brass/i.test(l)).length === 2, 'both switched terminals are brass');
  assert.match(sw.metadata.terminalNote, /either/i, 'the note must say the screws are interchangeable');
  assert.match(sw.metadata.terminalNote, /GFCI/, 'and must contrast with the device where it does matter');
});

// ─── The bench-test readout ──────────────────────────────────────────────────

test('a correct circuit reports every check as passing', () => {
  const result = validate(solutionCircuit(lessonById('single-pole-source-at-switch')),
    lessonById('single-pole-source-at-switch').expectations);
  const rows = checklistFor(result);
  assert.ok(rows.length >= 8, 'the learner sees the whole battery, not just a verdict');
  assert.ok(rows.every((r) => r.pass), rows.filter((r) => !r.pass).map((r) => r.label).join('; '));
});

test('a switched neutral shows as one failed row among passing ones', () => {
  const result = check([
    conductor(T('src', 'neutral'), T('sw1', 'a'), ConductorRole.NEUTRAL),
    conductor(T('sw1', 'b'), T('lamp', 'neu'), ConductorRole.NEUTRAL),
    conductor(T('src', 'hot'), T('lamp', 'hot'), ConductorRole.LINE),
    ...grounds(),
  ]);
  const rows = checklistFor(result);
  const failed = rows.filter((r) => !r.pass);
  const passed = rows.filter((r) => r.pass);

  assert.ok(failed.some((r) => r.key === 'neutral_switched'), 'the dangerous row must fail');
  assert.ok(passed.length > 0, 'what the learner got right stays visible');
  assert.ok(passed.some((r) => r.key === 'ground'), 'grounding was correct here and should say so');
  // A failed row explains the kind of mistake without handing over the fix.
  const row = failed.find((r) => r.key === 'neutral_switched');
  assert.ok(row.detail && row.detail.length > 0);
  assert.ok(!/brass a|brass b|sw1\./i.test(row.detail));
});

test('the readout never invents a row that the engine did not check', () => {
  const result = validate(solutionCircuit(lessonById('single-pole-source-at-switch')),
    lessonById('single-pole-source-at-switch').expectations);
  // A single-pole lesson has no travelers, so no traveler row should appear.
  assert.ok(!checklistFor(result).some((r) => r.key === 'travelers'));

  // Every row must be keyed and labelled — a blank row is worse than no row.
  for (const row of checklistFor(result)) {
    assert.ok(row.key && row.label, JSON.stringify(row));
    assert.equal(typeof row.pass, 'boolean');
  }
});

test('checklistFor survives a result it was not given', () => {
  assert.deepEqual(checklistFor(null).filter((r) => !r.pass), []);
  assert.deepEqual(checklistFor({}).filter((r) => !r.pass), []);
});
