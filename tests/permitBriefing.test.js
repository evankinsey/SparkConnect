// ─── PERMIT BRIEFING TESTS ───────────────────────────────────────────────────
// The guarantee worth testing here is not that the briefing reads well. It is
// that an unverified suggestion can never present itself as a confirmed fact,
// and can never leave the screen.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseLocationRequest, briefing, briefingText, nextActions, attachable,
  Standing, BRIEFING_ORDER, BRIEFING_DISCLAIMER,
} from '../src/core/field/permitBriefing.js';
import {
  buildRecord, applyProposal, confirmField, FieldSource, FIELD_KEYS, fieldMeta, AHJ_FIELDS,
} from '../src/core/field/ahj.js';

// ─── Reading the request ─────────────────────────────────────────────────────

test('a sentence becomes a lookup, and only when it plausibly names a place', () => {
  assert.equal(parseLocationRequest("I'm working in Tampa"), 'Tampa');
  assert.equal(parseLocationRequest('I am working in Hillsborough County'), 'Hillsborough County');
  assert.equal(parseLocationRequest("we're doing work in Tampa, FL"), 'Tampa, FL');
  assert.equal(parseLocationRequest('job in Ordway'), 'Ordway');
  assert.equal(parseLocationRequest('Tampa'), 'Tampa');
  assert.equal(parseLocationRequest('look up Tampa'), 'Tampa');
  assert.equal(parseLocationRequest("what's the AHJ for Tampa?"), 'Tampa');
});

test('a question is not a place, and is refused rather than guessed at', () => {
  assert.equal(parseLocationRequest(''), null);
  assert.equal(parseLocationRequest(null), null);
  assert.equal(parseLocationRequest('   '), null);
  assert.equal(parseLocationRequest('12345678'), null, 'digits alone are not a jurisdiction');
  assert.equal(
    parseLocationRequest('can you tell me whether I need a permit to replace a panel in a rental'),
    null,
    'a whole question must go to the model, not to the AHJ lookup',
  );
  assert.equal(parseLocationRequest('a'.repeat(80)), null);
});

// ─── The separation that matters ─────────────────────────────────────────────

const proposed = () => applyProposal(buildRecord('Tampa'), {
  name: 'City of Tampa Construction Services',
  codeEdition: '2023',
  phone: '555-0100',
  amendments: 'Local amendment package adopted',
  requiredDocuments: 'Signed application, one-line, load calculation',
  inspectionOrder: 'Rough, then final',
  quirks: 'Rough inspections are morning-only',
  inspectionTips: 'Have the panel directory filled in before final',
}, FieldSource.AI);

test('everything a model proposed is SUGGESTED, never CONFIRMED', () => {
  const b = briefing(proposed());
  assert.equal(b.confirmed.length, 0, 'nothing proposed may arrive confirmed');
  assert.ok(b.suggested.length >= 8);
  assert.equal(b.anyConfirmed, false);
  for (const line of b.suggested) {
    assert.equal(line.standing, Standing.SUGGESTED);
    assert.equal(line.usable, false, 'a suggestion is never usable');
    assert.equal(line.source, FieldSource.AI);
  }
});

test('confirming one field does not bless the one next to it', () => {
  let rec = proposed();
  rec = confirmField(rec, 'phone', { value: '555-0100' });
  const b = briefing(rec);

  const phone = b.lines.find((l) => l.key === 'phone');
  const edition = b.lines.find((l) => l.key === 'codeEdition');
  assert.equal(phone.standing, Standing.CONFIRMED);
  assert.equal(phone.usable, true);
  assert.equal(edition.standing, Standing.SUGGESTED, 'the code edition was not confirmed and must not say it was');
  assert.equal(b.anyConfirmed, true);
  assert.equal(b.complete, false);
});

test('the adopted code edition is called out separately and warns until confirmed', () => {
  const suggestedEdition = briefing(proposed());
  assert.equal(suggestedEdition.codeEdition.trustworthy, false);
  assert.match(suggestedEdition.codeEdition.warning, /provisional/i);

  const none = briefing(buildRecord('Nowhere'));
  assert.equal(none.codeEdition.standing, Standing.MISSING);
  assert.match(none.codeEdition.warning, /app default/i);

  const confirmed = briefing(confirmField(proposed(), 'codeEdition', { value: '2023' }));
  assert.equal(confirmed.codeEdition.trustworthy, true);
  assert.equal(confirmed.codeEdition.warning, null);
});

test('a high-risk suggestion carries what it costs to be wrong', () => {
  const b = briefing(proposed());
  const amendments = b.lines.find((l) => l.key === 'amendments');
  assert.equal(amendments.risk, 'HIGH');
  assert.ok(amendments.caution, 'a high-risk suggestion must explain itself');
  assert.match(amendments.caution, /red-tagged|override/i);

  // A confirmed field no longer needs the caution.
  const after = briefing(confirmField(proposed(), 'amendments', { value: 'None' }));
  assert.equal(after.lines.find((l) => l.key === 'amendments').caution, null);
});

test('what nobody knows is stated, not left blank', () => {
  const b = briefing(buildRecord('Nowhere in particular'));
  assert.equal(b.confirmed.length, 0);
  assert.equal(b.suggested.length, 0);
  assert.equal(b.missing.length, BRIEFING_ORDER.length);
  const text = briefingText(b);
  assert.match(text, /NOT KNOWN/);
});

// ─── The brief's nine items ──────────────────────────────────────────────────

test('the briefing covers everything the brief listed', () => {
  // AHJ · code edition · permit office · inspection sequence · amendments ·
  // required documents · contact info · quirks · inspection tips
  for (const key of ['name', 'codeEdition', 'permitOffice', 'inspectionOrder', 'amendments',
    'requiredDocuments', 'phone', 'quirks', 'inspectionTips']) {
    assert.ok(BRIEFING_ORDER.includes(key), `the briefing has no line for "${key}"`);
    assert.ok(fieldMeta(key), `"${key}" is not a real AHJ field`);
  }
});

test('every briefing line is backed by a declared field', () => {
  const known = new Set(FIELD_KEYS);
  for (const key of BRIEFING_ORDER) assert.ok(known.has(key), `${key} is not in AHJ_FIELDS`);
  assert.equal(new Set(BRIEFING_ORDER).size, BRIEFING_ORDER.length);
  for (const f of AHJ_FIELDS) {
    assert.ok(['HIGH', 'MEDIUM', 'LOW'].includes(f.risk), `${f.key} has no risk level`);
  }
});

// ─── Nothing unverified leaves the app ───────────────────────────────────────

test('a briefing with nothing confirmed cannot be attached to anything', () => {
  const a = attachable(briefing(proposed()));
  assert.equal(a.ok, false);
  assert.match(a.reason, /has been confirmed/);
  assert.equal(a.values, null);
  assert.equal(attachable(null), null);
});

test('only confirmed fields are attachable', () => {
  let rec = proposed();
  rec = confirmField(rec, 'phone', { value: '555-0100' });
  const a = attachable(briefing(rec));
  assert.equal(a.ok, true);
  assert.deepEqual(Object.keys(a.values), ['phone'], 'the suggestions must not ride along');
  assert.equal(a.values.codeEdition, undefined);
});

test('the rendered text separates confirmed from suggested by heading, not badge', () => {
  let rec = proposed();
  rec = confirmField(rec, 'phone', { value: '555-0100' });
  const text = briefingText(briefing(rec));

  const confirmedAt = text.indexOf('CONFIRMED');
  const suggestedAt = text.indexOf('SUGGESTED — NOT CHECKED');
  assert.ok(confirmedAt >= 0 && suggestedAt > confirmedAt, 'both blocks must be present and ordered');

  // The confirmed phone is above the suggested block; the code edition below it.
  assert.ok(text.indexOf('555-0100') < suggestedAt);
  assert.ok(text.indexOf('2023') > suggestedAt, 'an unconfirmed edition must sit under the warning heading');
  assert.match(text, /not the authority having jurisdiction/i);
});

test('the disclaimer never softens into a claim', () => {
  assert.match(BRIEFING_DISCLAIMER, /not the authority having jurisdiction/i);
  assert.match(BRIEFING_DISCLAIMER, /has not been checked/i);
  assert.doesNotMatch(BRIEFING_DISCLAIMER, /verified by SparkConnect|guaranteed|accurate/i);
});

// ─── The way forward ─────────────────────────────────────────────────────────

test('next actions lead with the code edition, because it fails silently', () => {
  const actions = nextActions(briefing(proposed()));
  assert.ok(actions.length > 0);
  assert.equal(actions[0].id, 'confirm-edition');
  assert.match(actions[0].detail, /2023/, 'the call script should name the value being checked');
  assert.match(actions[0].via, /555-0100/, 'it should tell them who to call');
});

test('once everything is confirmed there is nothing left to chase', () => {
  let rec = proposed();
  for (const key of FIELD_KEYS) {
    const v = rec.fields[key]?.value;
    if (v) rec = confirmField(rec, key, { value: v });
  }
  const b = briefing(rec);
  assert.equal(b.suggested.length, 0);
  assert.equal(b.codeEdition.trustworthy, true);
  const actions = nextActions(b);
  assert.equal(actions.filter((a) => a.id.startsWith('confirm-')).length, 0);
  assert.equal(attachable(b).ok, true);
});

test('an empty briefing says so rather than looking finished', () => {
  const actions = nextActions(briefing(buildRecord('')));
  assert.ok(actions.some((a) => a.id === 'nothing-confirmed'));
  assert.equal(nextActions(null).length, 0);
});
