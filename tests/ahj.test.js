// ─── AHJ AUTOFILL ────────────────────────────────────────────────────────────
// The highest-risk AI surface in the app. A wrong phone number wastes an
// afternoon and announces itself. A wrong adopted code edition is silent, makes
// every downstream answer wrong, and is discovered at inspection.
//
// These tests hold the line that nothing the model proposes can leave the app
// without a person agreeing to it, field by field.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FieldSource, SOURCE_LABEL, AHJ_FIELDS, FIELD_KEYS, fieldMeta, isHighRisk,
  CURATED_AHJ, CURATED_SOURCE_NOTE, lookupCurated,
  emptyRecord, buildRecord, applyProposal, confirmField, rejectField, confirmAll,
  exportable, canExport, pendingVerification, isFullyVerified, toJurisdiction,
  aiLookupRules,
} from '../src/core/field/ahj.js';

const aiSays = (proposal) => buildRecord('Tampa', { aiProposal: proposal });

// ─── The export gate ─────────────────────────────────────────────────────────

test('nothing the model proposed can be exported', () => {
  const record = aiSays({
    name: 'City of Tampa Construction Services',
    phone: '813-555-0100',
    codeEdition: '2023',
  });
  assert.deepEqual(exportable(record), {},
    'an unverified suggestion that reaches a customer proposal has become an assertion');
  assert.equal(canExport(record), false);
});

test('confirming one field exports that field and only that field', () => {
  let record = aiSays({ name: 'City of Tampa', phone: '813-555-0100', codeEdition: '2023' });
  record = confirmField(record, 'phone', { at: 1 });

  const out = exportable(record);
  assert.deepEqual(Object.keys(out), ['phone']);
  assert.equal(out.phone, '813-555-0100');
  assert.equal(out.codeEdition, undefined,
    'saying the phone number looks right must not certify the code edition beside it');
});

test('the jurisdiction handed to the permit assistant is verified-only', () => {
  let record = aiSays({ name: 'City of Tampa', codeEdition: '2023' });
  assert.equal(toJurisdiction(record).name, '', 'unverified names do not become the settled record');

  record = confirmField(record, 'name', { at: 1 });
  assert.equal(toJurisdiction(record).name, 'City of Tampa');
  assert.equal(toJurisdiction(record).codeEdition, '', 'still unverified, still excluded');
});

// ─── Precedence ──────────────────────────────────────────────────────────────

test('the model cannot overwrite what a person typed', () => {
  let record = emptyRecord();
  record = applyProposal(record, { codeEdition: '2020' }, FieldSource.USER, { at: 1 });
  record = applyProposal(record, { codeEdition: '2023' }, FieldSource.AI);

  assert.equal(record.fields.codeEdition.value, '2020');
  assert.equal(record.fields.codeEdition.source, FieldSource.USER);
  assert.equal(record.fields.codeEdition.verified, true);
});

test('the model cannot overwrite curated data', () => {
  let record = emptyRecord();
  record = applyProposal(record, { name: 'Researched Name' }, FieldSource.CURATED);
  record = applyProposal(record, { name: 'Model Guess' }, FieldSource.AI);
  assert.equal(record.fields.name.value, 'Researched Name');
});

test('curated data is trustworthy but still not verified by this user', () => {
  let record = emptyRecord();
  record = applyProposal(record, { codeEdition: '2023' }, FieldSource.CURATED);
  assert.equal(record.fields.codeEdition.verified, false,
    'ours is not the same as confirmed for this job');
  assert.deepEqual(exportable(record), {});
});

test('a user correction always wins, in either order', () => {
  let record = applyProposal(emptyRecord(), { phone: '813-555-0100' }, FieldSource.AI);
  record = applyProposal(record, { phone: '813-555-9999' }, FieldSource.USER, { at: 2 });
  assert.equal(record.fields.phone.value, '813-555-9999');
  assert.equal(record.fields.phone.verified, true);
});

test('only known fields are accepted', () => {
  const record = applyProposal(emptyRecord(), {
    name: 'Real', inspectorHomeAddress: 'nope', __proto__: 'no',
  }, FieldSource.AI);
  assert.equal(record.fields.name.value, 'Real');
  assert.equal(record.fields.inspectorHomeAddress, undefined);
  assert.deepEqual(Object.keys(record.fields).sort(), [...FIELD_KEYS].sort());
});

test('empty and non-string proposals are ignored, not stored as blanks', () => {
  const record = applyProposal(emptyRecord(), {
    name: '   ', phone: null, website: 42, codeEdition: undefined,
  }, FieldSource.AI);
  for (const key of FIELD_KEYS) assert.equal(record.fields[key].value, '');
});

// ─── Risk treatment ──────────────────────────────────────────────────────────

test('the two silent failures are flagged HIGH risk and explain why', () => {
  for (const key of ['codeEdition', 'amendments']) {
    assert.equal(isHighRisk(key), true, `${key} must be treated as high risk`);
    assert.ok(fieldMeta(key).why, `${key} must say why it is dangerous`);
    assert.match(fieldMeta(key).why, /silent|invisible/i);
  }
  assert.equal(isHighRisk('phone'), false, 'a wrong phone number announces itself');
});

test('high-risk fields get the stronger confirmation prompt', () => {
  const record = aiSays({ name: 'City of Tampa', phone: '813-555-0100', codeEdition: '2023' });
  const pending = pendingVerification(record);

  assert.equal(pending[0].key, 'codeEdition', 'the riskiest thing is asked about first');
  assert.match(pending[0].prompt, /Confirm with City of Tampa before relying on this/);

  const phone = pending.find((p) => p.key === 'phone');
  assert.match(phone.prompt, /Check this looks right/);
});

test('every pending field says where its value came from', () => {
  const record = aiSays({ name: 'X', codeEdition: '2023' });
  for (const p of pendingVerification(record)) {
    assert.equal(p.sourceLabel, SOURCE_LABEL[p.source]);
    assert.match(p.sourceLabel, /not verified/i);
  }
});

test('confirmed fields drop out of the pending list', () => {
  let record = aiSays({ name: 'X', codeEdition: '2023' });
  assert.equal(pendingVerification(record).length, 2);
  record = confirmField(record, 'codeEdition', { at: 1 });
  assert.deepEqual(pendingVerification(record).map((p) => p.key), ['name']);
  assert.equal(isFullyVerified(record), false);
  record = confirmField(record, 'name', { at: 2 });
  assert.equal(isFullyVerified(record), true);
});

test('a record with nothing in it is trivially fully verified', () => {
  assert.equal(isFullyVerified(emptyRecord()), true);
  assert.equal(canExport(emptyRecord()), false);
});

// ─── Editing during confirmation ─────────────────────────────────────────────

test('confirming with a correction stores the correction', () => {
  let record = aiSays({ phone: '813-555-0100' });
  record = confirmField(record, 'phone', { value: '813-555-0199', at: 5 });
  assert.equal(record.fields.phone.value, '813-555-0199');
  assert.equal(record.fields.phone.confirmedAt, 5);
  assert.equal(exportable(record).phone, '813-555-0199');
});

test('rejecting a field clears it back to empty and unverified', () => {
  let record = aiSays({ codeEdition: '2023' });
  record = rejectField(record, 'codeEdition');
  assert.equal(record.fields.codeEdition.value, '');
  assert.equal(record.fields.codeEdition.verified, false);
  assert.deepEqual(exportable(record), {});
});

test('confirm-all only touches fields that have a value', () => {
  let record = aiSays({ name: 'City of Tampa', phone: '813-555-0100' });
  record = confirmAll(record, { at: 9 });
  assert.deepEqual(Object.keys(exportable(record)).sort(), ['name', 'phone']);
  assert.equal(record.fields.codeEdition.verified, false);
  assert.equal(record.fields.codeEdition.value, '');
});

test('an unknown field key is a no-op rather than a crash', () => {
  const record = aiSays({ name: 'X' });
  assert.equal(confirmField(record, 'nonsense', {}), record);
  assert.equal(rejectField(record, 'nonsense'), record);
});

// ─── The curated table ───────────────────────────────────────────────────────

test('the curated table contains only researched entries', () => {
  // It ships empty on purpose. Filling it from memory with plausible county
  // phone numbers would move the hallucination from runtime into the repo,
  // where it looks authoritative and carries no confidence signal at all.
  for (const [key, entry] of Object.entries(CURATED_AHJ)) {
    assert.ok(entry.sourceNote, `curated entry "${key}" has no source note`);
    assert.match(entry.sourceNote, /verified/i);
    for (const k of Object.keys(entry)) {
      if (k === 'sourceNote') continue;
      assert.ok(FIELD_KEYS.includes(k), `curated entry "${key}" has unknown field "${k}"`);
    }
  }
  assert.match(CURATED_SOURCE_NOTE, /verified/i);
});

test('an unknown place returns nothing rather than a guess', () => {
  assert.equal(lookupCurated('Nowhere County'), null);
  assert.equal(lookupCurated(''), null);
  assert.equal(lookupCurated(null), null);
});

// ─── The model instructions ──────────────────────────────────────────────────

test('the model is told to omit rather than guess', () => {
  const joined = aiLookupRules.join(' ');
  assert.match(joined, /omit it/i);
  assert.match(joined, /An omitted field is correct/i);
  assert.match(joined, /code edition/i);
  assert.match(joined, /unverified suggestion/i);
});

test('every field has a label so nothing renders as a raw key', () => {
  for (const f of AHJ_FIELDS) {
    assert.ok(f.label && f.key, JSON.stringify(f));
    assert.ok(['LOW', 'MEDIUM', 'HIGH'].includes(f.risk), `${f.key} has a bogus risk`);
  }
  assert.equal(new Set(FIELD_KEYS).size, FIELD_KEYS.length, 'field keys must be unique');
});
