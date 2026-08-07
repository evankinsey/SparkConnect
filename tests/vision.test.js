// ─── PHOTO AND VOICE ─────────────────────────────────────────────────────────
// Two input modes, one set of guardrails.
//
// Photo: a picture supports far less than it appears to, and the gap between
// "visible" and "inferred" is where somebody gets hurt.
// Voice: the danger is a feature built as its own path, with its own prompt,
// that quietly does not have the guardrails the typed path spent months getting.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  Observation, OBSERVATION_PREFIX, UNPHOTOGRAPHABLE, overreaches,
  toObservation, readPhoto, VISION_RULES, MAX_OBSERVATIONS,
} from '../src/core/ai/vision.js';
import {
  askByVoice, normalizeTranscript, ambiguousNumbers, TRANSCRIPT_CONFIDENCE_FLOOR,
} from '../src/core/ai/voice.js';
import { Provenance } from '../src/core/ai/answer.js';

const obs = (text, kind = Observation.OBSERVED) => ({ text, kind });

// ─── What a photograph cannot establish ──────────────────────────────────────

test('a claim about conductor function is demoted, never asserted', () => {
  const r = toObservation(obs('the white conductor is the neutral'));
  assert.equal(r.kind, Observation.NOT_CONFIRMED);
  assert.equal(r.demotedFrom, Observation.OBSERVED);
  assert.equal(r.claim, 'conductor function');
  assert.match(r.settle, /re-identified switch leg|by testing/i);
});

test('the whole unphotographable list is enforced', () => {
  const cases = [
    ['the neutral lands on the silver screw', 'conductor function'],
    ['the panel is de-energized', 'voltage state'],
    ['that is a 20 amp breaker protecting it', 'device rating as installed'],
    ['the lugs are torqued properly', 'termination tightness'],
    ['this installation is code compliant', 'code compliance'],
    ['there is damage inside the breaker', 'internal condition'],
    ['the conductor is 12 AWG', 'conductor size'],
  ];
  for (const [text, claim] of cases) {
    const hit = overreaches(text);
    assert.ok(hit, `"${text}" should overreach`);
    assert.equal(hit.claim, claim);
    assert.equal(toObservation(obs(text)).kind, Observation.NOT_CONFIRMED, `"${text}" was asserted`);
  }
  // Every entry carries what would actually settle it.
  for (const u of UNPHOTOGRAPHABLE) assert.ok(u.settle && u.claim);
});

test('an observation that stays within the frame is kept as observed', () => {
  for (const text of [
    'a panel cover removed with breakers visible',
    'a length of EMT running to a junction box',
    'a device box mounted on a stud',
  ]) {
    assert.equal(toObservation(obs(text)).kind, Observation.OBSERVED, `wrongly demoted: "${text}"`);
  }
});

test('a demoted claim is moved, not dropped', () => {
  // Dropping loses information the user might want. Leaving it as observed
  // asserts something the image cannot support. Moving it does neither.
  const r = readPhoto({
    observations: [
      obs('a subpanel with the cover off'),
      obs('the white conductor is the grounded conductor'),
    ],
  });
  assert.equal(r.observed.length, 1);
  assert.equal(r.notConfirmed.length, 1);
  assert.equal(r.demoted.length, 1);
  assert.match(r.text, /I cannot confirm the white conductor/);
  assert.ok(r.needed.some((n) => /by testing/i.test(n)));
});

test('a blurry photo says so instead of guessing', () => {
  const r = readPhoto({ observations: [obs('something metal, too dark to make out', Observation.NOT_CONFIRMED)] });
  assert.equal(r.provenance, Provenance.REFUSED);
  // Refuses in SparkAI's own voice, and says the refusal was a choice.
  assert.match(r.text, /SparkAI/);
  assert.match(r.text, /won't guess/i);
  // And says what to do about the photo, which is the part that fixes it.
  assert.match(r.suggestion, /light|steadier|wider/i);
});

test('an unusable response refuses rather than inventing observations', () => {
  for (const bad of [null, {}, 'nope', { observations: 'not an array' }]) {
    const r = readPhoto(bad);
    assert.equal(r.provenance, Provenance.REFUSED, `got an answer from: ${JSON.stringify(bad)}`);
  }
});

test('needed steps are deduplicated', () => {
  const r = readPhoto({
    observations: [
      obs('a panel'),
      obs('the white one is the neutral'),
      obs('the black one is the hot'),
      obs('the red is a traveler'),
    ],
  });
  assert.equal(r.notConfirmed.length, 3);
  // Three conductor claims produce ONE "identify by testing" line, not three.
  assert.equal(r.needed.filter((n) => /by testing/i.test(n)).length, 1);
});

test('observation output is capped', () => {
  const many = Array.from({ length: MAX_OBSERVATIONS + 20 }, (_, i) => obs(`thing ${i}`));
  assert.equal(readPhoto({ observations: many }).observations.length, MAX_OBSERVATIONS);
});

test('the vision rules forbid what the image cannot show', () => {
  const joined = VISION_RULES.join(' ');
  assert.match(joined, /only what is genuinely visible/i);
  assert.match(joined, /Never state conductor function/i);
  assert.match(joined, /Colour does not establish function/i);
  assert.match(joined, /cannot tell from this image/i);
  assert.match(joined, /energized/i);
});

test('every prefix reads as an observation, not a verdict', () => {
  assert.equal(OBSERVATION_PREFIX.OBSERVED, 'I can see');
  assert.equal(OBSERVATION_PREFIX.NOT_CONFIRMED, 'I cannot confirm');
  for (const kind of Object.values(Observation)) assert.ok(OBSERVATION_PREFIX[kind]);
});

// ─── Voice is the same pipeline ──────────────────────────────────────────────

test('a spoken calculation reaches the same engine as a typed one', async () => {
  const r = await askByVoice('voltage drop on one hundred feet of number twelve at twenty amps');
  assert.equal(r.provenance, Provenance.ENGINE);
  assert.match(r.text, /7\.92 V/, 'the spoken question computes identically to the typed one');
});

test('voice cannot bypass a guardrail the typed path enforces', async () => {
  let called = false;
  const spy = async () => { called = true; return { text: 'here is how to do it live' }; };

  const r = await askByVoice('how do I change this breaker hot', { askModel: spy });
  assert.equal(r.provenance, Provenance.REFUSED, 'the CRITICAL refusal applies to speech too');
  assert.equal(called, false);
  assert.match(r.suggestion, /De-energize|absence of voltage/i);
});

test('voice inherits the high-risk refusal as well', async () => {
  const r = await askByVoice('what size feeder do I need for the subpanel', {
    askModel: async () => ({ text: 'run 4 AWG', confidence: 0.99 }),
  });
  assert.equal(r.provenance, Provenance.REFUSED);
});

test('spoken numbers become numbers the extractors can read', () => {
  assert.match(normalizeTranscript('number twelve'), /#12/);
  assert.match(normalizeTranscript('twelve gauge wire'), /12 gauge/);
  assert.match(normalizeTranscript('twenty amps'), /20 amps/);
  assert.match(normalizeTranscript('one hundred feet'), /hundred feet|100 feet/);
  assert.match(normalizeTranscript('half inch conduit'), /1\/2"/);
  assert.match(normalizeTranscript('three quarter inch'), /3\/4"/);
  assert.match(normalizeTranscript('a w g'), /AWG/);
});

test('normalisation touches nothing it does not understand', () => {
  const s = 'the panel in the back room keeps tripping';
  assert.equal(normalizeTranscript(s), s);
  assert.equal(normalizeTranscript(''), '');
  assert.equal(normalizeTranscript(null), '');
});

test('a misheard number is FLAGGED, never silently corrected', () => {
  // "Forty" and "fourteen" are one vowel apart and three sizes apart. Correcting
  // a number the user did not say is the danger, not the fix.
  const a = ambiguousNumbers('run fourteen gauge');
  assert.ok(a.length > 0);
  assert.ok(a[0].couldBe.includes('forty'));

  const b = ambiguousNumbers('fifty amps');
  assert.ok(b[0].couldBe.includes('fifteen'));
});

test('an ambiguous spoken number asks for confirmation before it is acted on', async () => {
  const r = await askByVoice('box fill for fifteen conductors of twelve gauge');
  assert.equal(r.voice.needsConfirmation, true);
  assert.ok(r.voice.ambiguous.some((x) => x.couldBe.includes('fifty')));
  // The answer is still computed — the UI confirms rather than blocking.
  assert.equal(r.provenance, Provenance.ENGINE);
});

test('an unambiguous spoken question needs no confirmation', async () => {
  const r = await askByVoice('voltage drop on 100 feet of 12 AWG at 20 amps');
  assert.equal(r.voice.needsConfirmation, false);
  assert.deepEqual(r.voice.ambiguous, []);
});

test('a low-confidence transcript asks the user to repeat', async () => {
  const r = await askByVoice('voltage drop on fifty feet', {
    transcriptConfidence: TRANSCRIPT_CONFIDENCE_FLOOR - 0.1,
  });
  assert.equal(r.provenance, Provenance.REFUSED);
  assert.equal(r.voice.lowConfidence, true);
  assert.match(r.suggestion, /misheard number changes the answer/i);
});

test('silence is not a question', async () => {
  const r = await askByVoice('   ');
  assert.equal(r.provenance, Provenance.REFUSED);
  // Nothing was heard, so the reason is about the microphone rather than about
  // confidence — telling somebody SparkAI is unsure of a question they never
  // asked is a worse answer than telling them it heard nothing.
  assert.match(r.reason, /did not catch/i);
  assert.match(r.suggestion, /closer to the mic/i);
});

test('the voice path carries the same evidence contract', async () => {
  const r = await askByVoice('voltage drop on 100 feet of 12 AWG at 20 amps');
  assert.ok(r.evidence, 'a spoken answer must be as auditable as a typed one');
  assert.equal(r.evidence.calculatedBy, 'voltage_drop');
  assert.equal(r.evidence.verificationStatus, 'SOURCE_VERIFIED');
  assert.ok(r.voice.transcript);
});
