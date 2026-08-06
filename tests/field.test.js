// ─── FIELD TOOLS ─────────────────────────────────────────────────────────────
// Permits: the contract is that we never assert local law as fact.
// Takeoff: the contract is that model output cannot put a nonsense number on a
// material list.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  WORK_TYPES, workTypeById, Likelihood, LIKELIHOOD_LABEL,
  permitGuidance, buildAhjScript, aiPermitContext,
  sanitizeJurisdiction, emptyJurisdiction, hasJurisdiction,
} from '../src/core/field/permits.js';
import {
  TAKEOFF_ITEMS, validateTakeoff, totalDevices, takeoffRows, takeoffToMaterials,
  parseTakeoffReply, takeoffPrompt, Confidence, MAX_PER_ITEM, TAKEOFF_DISCLAIMER,
} from '../src/core/field/takeoff.js';

// ─── Permits ─────────────────────────────────────────────────────────────────

test('every work type is complete and its likelihood is labelled', () => {
  assert.ok(WORK_TYPES.length >= 6);
  for (const w of WORK_TYPES) {
    assert.ok(w.id && w.label && w.sub, `${w.id} needs display fields`);
    assert.ok(Object.values(Likelihood).includes(w.permit), `${w.id} likelihood`);
    assert.ok(LIKELIHOOD_LABEL[w.permit], `${w.id} label`);
    assert.ok(w.why && w.why.length > 30, `${w.id} explains why`);
    assert.ok(Array.isArray(w.inspections) && w.inspections.length >= 1, `${w.id} inspections`);
    assert.ok(Array.isArray(w.asks) && w.asks.length >= 3, `${w.id} needs questions to ask the AHJ`);
    for (const a of w.asks) assert.ok(a.trim().endsWith('?'), `${w.id}: "${a}" must be a question`);
  }
});

test('no work type claims a permit is definitely required or definitely not', () => {
  // The whole module falls down if any copy states local law as fact.
  for (const w of WORK_TYPES) {
    const prose = `${w.label} ${w.sub} ${w.why}`.toLowerCase();
    assert.ok(!/\byou must\b|\bis required by law\b|\bno permit needed\b|\bnever requires\b/.test(prose),
      `${w.id} states local law as fact: ${prose}`);
  }
});

test('guidance always carries the AHJ disclaimer', () => {
  for (const w of WORK_TYPES) {
    const g = permitGuidance(w.id);
    assert.ok(g.disclaimer.includes('authority having jurisdiction'));
    assert.ok(/not legal advice/i.test(g.disclaimer));
    assert.equal(g.permit.label, LIKELIHOOD_LABEL[w.permit]);
  }
});

test('an unknown work type returns null rather than guessing', () => {
  assert.equal(permitGuidance('nope'), null);
  assert.equal(buildAhjScript('nope'), null);
  assert.equal(workTypeById('nope'), null);
});

test('the AHJ script names the saved jurisdiction and asks the universal questions', () => {
  const j = { name: 'City of Tulsa', phone: '918-555-0100', website: 'https://example.gov', codeEdition: 'NEC 2020' };
  const s = buildAhjScript('ev-charger', { jurisdiction: j, address: '12 Elm St', scope: 'Level 2 in garage' });
  assert.match(s.text, /City of Tulsa/);
  assert.match(s.text, /12 Elm St/);
  assert.match(s.text, /Level 2 in garage/);
  assert.match(s.text, /NEC edition and local amendments/);
  assert.match(s.text, /schedule inspections/);
  assert.equal(s.guidance.verifyWith, 'City of Tulsa');
});

test('with no saved jurisdiction the script still works and says so generically', () => {
  const s = buildAhjScript('new-circuit');
  assert.match(s.text, /your building department/);
  assert.equal(s.guidance.verifyWith, null);
});

test('a jurisdiction is sanitized: http websites and junk are dropped', () => {
  const j = sanitizeJurisdiction({
    name: 'x'.repeat(500), phone: '555', website: 'http://insecure.example',
    codeEdition: 'NEC 2023', notes: 'note', updatedAt: 'nope',
  });
  assert.ok(j.name.length <= 80);
  assert.equal(j.website, '', 'a non-HTTPS website is not kept');
  assert.equal(j.updatedAt, null);
  assert.equal(sanitizeJurisdiction(null).name, '');
  assert.equal(hasJurisdiction(emptyJurisdiction()), false);
});

test('the AI context forbids inventing local rules', () => {
  const ctx = aiPermitContext('service-change', { name: 'Travis County', codeEdition: 'NEC 2020' });
  assert.match(ctx, /Travis County/);
  assert.match(ctx, /Do not state local permit requirements as fact/);
  assert.match(ctx, /exact question to ask/);
});

// ─── Takeoff ─────────────────────────────────────────────────────────────────

const reply = (over = {}) => ({
  counts: { receptacles: 24, switches: 11, lights: 18, panels: 1 },
  confidence: Confidence.MEDIUM,
  sheetLabel: 'E1.1 First Floor Power',
  notes: ['Legend partially cut off'],
  ...over,
});

test('a well-formed takeoff validates and totals', () => {
  const r = validateTakeoff(reply());
  assert.ok(r.ok, r.reason);
  assert.equal(totalDevices(r.takeoff), 54);
  assert.equal(r.takeoff.needsReview, true, 'anything below HIGH wants a human pass');
  assert.equal(takeoffRows(r.takeoff).length, 4);
});

test('numeric strings are accepted because models return them constantly', () => {
  const r = validateTakeoff(reply({ counts: { receptacles: '24', switches: 3 } }));
  assert.ok(r.ok, r.reason);
  assert.equal(r.takeoff.counts.receptacles, 24);
});

test('nonsense counts are dropped, never coerced onto a material list', () => {
  const r = validateTakeoff(reply({
    counts: { receptacles: -3, switches: 2.5, lights: 'twelve', panels: MAX_PER_ITEM + 1, fans: 4 },
  }));
  assert.ok(r.ok, r.reason);
  assert.deepEqual(Object.keys(r.takeoff.counts), ['fans'], 'only the sane value survives');
  assert.ok(r.takeoff.dropped.includes('receptacles'));
  assert.equal(r.takeoff.needsReview, true, 'a dropped value forces review');
});

test('a reply with nothing usable is rejected with an actionable reason', () => {
  const r = validateTakeoff(reply({ counts: { receptacles: 'lots', switches: null } }));
  assert.equal(r.ok, false);
  assert.match(r.reason, /straighter, better-lit/);
});

test('categories the model invents are ignored', () => {
  const r = validateTakeoff(reply({ counts: { receptacles: 5, unicorns: 900, drop_tables: 1 } }));
  assert.ok(r.ok, r.reason);
  assert.deepEqual(Object.keys(r.takeoff.counts), ['receptacles']);
});

test('an unknown confidence degrades to LOW rather than being trusted', () => {
  assert.equal(validateTakeoff(reply({ confidence: 'ABSOLUTELY_CERTAIN' })).takeoff.confidence, Confidence.LOW);
  assert.equal(validateTakeoff(reply({ confidence: undefined })).takeoff.confidence, Confidence.LOW);
});

test('notes are bounded and control characters stripped', () => {
  const r = validateTakeoff(reply({ notes: Array(50).fill('x'.repeat(900)) }));
  assert.ok(r.takeoff.notes.length <= 6);
  for (const n of r.takeoff.notes) assert.ok(n.length <= 400);
});

test('garbage never throws', () => {
  for (const junk of [null, undefined, 5, 'nope', [], { counts: [] }]) {
    const r = validateTakeoff(junk);
    assert.equal(r.ok, false);
    assert.ok(typeof r.reason === 'string');
  }
});

test('model replies wrapped in prose or code fences still parse', () => {
  const body = '{"counts":{"receptacles":9},"confidence":"HIGH"}';
  for (const wrapped of [
    body,
    'Here is the takeoff:\n```json\n' + body + '\n```\nHope that helps.',
    '```\n' + body + '\n```',
    'Sure! ' + body,
  ]) {
    const parsed = parseTakeoffReply(wrapped);
    assert.ok(parsed, `failed to parse: ${wrapped.slice(0, 40)}`);
    assert.equal(validateTakeoff(parsed).takeoff.counts.receptacles, 9);
  }
  for (const bad of ['no json here', '', null, '{broken']) {
    assert.equal(parseTakeoffReply(bad), null);
  }
});

test('the prompt asks for exactly the categories the validator accepts', () => {
  const p = takeoffPrompt();
  for (const item of TAKEOFF_ITEMS) {
    assert.ok(p.includes(item.id), `prompt must request ${item.id} so the shapes cannot drift`);
  }
  assert.match(p, /JSON only/);
});

test('materials carry devices and boxes but never invented wire or conduit', () => {
  const { takeoff } = validateTakeoff(reply());
  const mats = takeoffToMaterials(takeoff);
  assert.ok(mats.length > 0);
  assert.ok(mats.some((m) => /Receptacles/.test(m.item)));
  assert.ok(mats.some((m) => /Device box/.test(m.item)));
  for (const m of mats) {
    assert.ok(!/wire|conduit|emt|romex|nm-b|footage/i.test(m.item),
      `a device count cannot know routing: ${m.item}`);
    assert.ok(Number.isInteger(m.qty) && m.qty > 0);
  }
});

test('the takeoff disclaimer refuses to call itself a survey', () => {
  assert.match(TAKEOFF_DISCLAIMER, /not a quantity survey/i);
  assert.match(TAKEOFF_DISCLAIMER, /verify/i);
});
