// ─── CONTRACTOR CONNECT: SUBMISSIONS ─────────────────────────────────────────
// One property carries this whole feature: THE APP CANNOT SAY A THING WAS SENT
// UNTIL SOMETHING OUTSIDE THE APP SAYS SO.
//
// The bug these tests exist to prevent is not hypothetical. The previous flow
// saved a lead locally, showed a confirmation, and offered "send" as a separate
// optional step afterwards — so a user could believe they had submitted a
// $20,000 opportunity that nobody had ever received. Every assertion below is
// aimed at making that unreachable rather than merely unlikely.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  Pathway, PATHWAYS, pathwayById, ContactMethod, CONTACT_METHOD_LABEL,
  SubmissionStatus, STATUS_COPY, TRANSITIONS, DeliveryEvidence,
  submissionDraft, validateSubmission, validateContact, contactDetails,
  transition, wasHandedOff, moderationFlags, ModerationFlag, FLAG_NOTE,
  subjectFor, bodyFor, handoffPayload, mailtoUrl, verificationUrlFor,
  looksLikeEmail, looksLikePhone, BETA_DISCLOSURE, BACKEND_CONTRACT, SUPPORT_EMAIL,
} from '../src/core/connect/submissions.js';
import {
  createSubmissionStore, parseStored, serialize, STORE_KEY,
} from '../src/core/connect/store.js';
import { findOutcomePromise } from '../src/core/connect/index.js';
import { Feature } from '../src/core/paywall/entitlements.js';
import { REGISTRY, applyRemoteConfig } from '../src/core/paywall/registry.js';

const goodContact = {
  name: 'Evan K', email: 'evan@example.com', phone: '(813) 555-0148',
  preferred: ContactMethod.EMAIL,
};

const complete = (pathway = Pathway.HAVE_JOB, answers = {}) => submissionDraft({
  pathway,
  contact: goodContact,
  answers: {
    location: 'Tampa, Hillsborough',
    scope: '200A service change on a single family house.',
    business: 'Kinsey Electric LLC',
    need: 'Residential service work in Hillsborough.',
    interests: 'Service changes and panel upgrades.',
    terms: 'One company, residential only.',
    license: 'EC13001234',
    ...answers,
  },
});

/** Draft → ready → attempted → confirmed, the way the screen does it. */
const sendIt = (sub, evidence = DeliveryEvidence.OS_REPORTED_SHARED) => {
  const ready = transition(sub, SubmissionStatus.READY_TO_SEND);
  const started = transition(ready.sub, SubmissionStatus.HANDOFF_STARTED);
  return transition(started.sub, SubmissionStatus.HANDED_OFF, { evidence });
};

// ─── The hole that had to close ──────────────────────────────────────────────

test('a local draft can never jump straight to sent', () => {
  const d = complete();
  const r = transition(d, SubmissionStatus.HANDED_OFF, {
    evidence: DeliveryEvidence.OS_REPORTED_SHARED,
  });
  assert.equal(r.ok, false);
  assert.equal(r.sub.status, SubmissionStatus.DRAFT, 'the refused move must not mutate anything');
  assert.match(r.error, /cannot go from DRAFT to HANDED_OFF/);
});

test('sent requires evidence from outside the app', () => {
  const ready = transition(complete(), SubmissionStatus.READY_TO_SEND);
  const started = transition(ready.sub, SubmissionStatus.HANDOFF_STARTED);

  // No evidence: the strongest claim available is "not sent yet".
  const bare = transition(started.sub, SubmissionStatus.HANDED_OFF);
  assert.equal(bare.ok, false);
  assert.match(bare.error, /nothing confirmed/i);

  // A composer opening proves a composer opened. It does not prove delivery.
  const composer = transition(started.sub, SubmissionStatus.HANDED_OFF, {
    evidence: DeliveryEvidence.COMPOSER_OPENED,
  });
  assert.equal(composer.ok, false, 'opening a mail app is not evidence an email was sent');

  const real = transition(started.sub, SubmissionStatus.HANDED_OFF, {
    evidence: DeliveryEvidence.OS_REPORTED_SHARED,
  });
  assert.equal(real.ok, true);
  assert.equal(wasHandedOff(real.sub), true);
});

test('a cancelled handoff stays unsent, and retrying works', () => {
  const ready = transition(complete(), SubmissionStatus.READY_TO_SEND);
  const started = transition(ready.sub, SubmissionStatus.HANDOFF_STARTED);
  const failed = transition(started.sub, SubmissionStatus.SEND_FAILED);

  assert.equal(failed.ok, true);
  assert.equal(wasHandedOff(failed.sub), false);
  assert.match(STATUS_COPY[failed.sub.status].headline, /not sent/i);

  const retry = transition(failed.sub, SubmissionStatus.HANDOFF_STARTED);
  assert.equal(retry.ok, true);
  assert.equal(retry.sub.attempts, 2, 'each attempt is counted, so a silent failure is visible');

  const done = transition(retry.sub, SubmissionStatus.HANDED_OFF, {
    evidence: DeliveryEvidence.OS_REPORTED_SHARED,
  });
  assert.equal(wasHandedOff(done.sub), true);
});

test('no state that has not been delivered may claim it was', () => {
  const unsent = [
    SubmissionStatus.DRAFT, SubmissionStatus.READY_TO_SEND,
    SubmissionStatus.HANDOFF_STARTED, SubmissionStatus.SEND_FAILED,
  ];
  // Per sentence, and negated sentences are skipped — "Contractor Connect has
  // NOT received it" is the copy we want, and a whole-string scan for
  // "received" would ban the clearest way of saying nothing arrived.
  const claimsDelivery = (text) => text
    .split(/(?<=[.!?])\s+/)
    .filter((s) => !/\bnot\b|n['’]t\b|\bnever\b/i.test(s))
    .some((s) => /\bsubmitted\b|\breceived\b|\bwe (?:have|'ve) got\b|\bon its way\b/i.test(s));

  for (const s of unsent) {
    const copy = STATUS_COPY[s];
    const all = `${copy.label}. ${copy.headline}. ${copy.detail}`;
    assert.equal(claimsDelivery(all), false, `${s} claims delivery: "${all}"`);
  }
  // Even the delivered state must not claim WE received it — a share sheet
  // reports the payload reached the chosen app, and nothing more.
  const done = STATUS_COPY[SubmissionStatus.HANDED_OFF];
  assert.doesNotMatch(`${done.headline} ${done.detail}`, /\breceived\b/i);
  assert.match(done.detail, /assisted manually|reviews each submission/i,
    'the delivered state has to say a person does the matching');
});

test('every status has copy, and every copy has a way forward', () => {
  for (const s of Object.keys(SubmissionStatus)) {
    const copy = STATUS_COPY[s];
    assert.ok(copy, `${s} has no copy`);
    for (const k of ['label', 'headline', 'detail', 'cta']) {
      assert.ok(copy[k]?.length > 0, `${s}.${k} is empty`);
    }
  }
});

test('the state machine has no path that skips an attempt', () => {
  for (const [from, tos] of Object.entries(TRANSITIONS)) {
    if (from === SubmissionStatus.HANDOFF_STARTED) continue;
    assert.ok(!tos.includes(SubmissionStatus.HANDED_OFF),
      `${from} can reach HANDED_OFF without attempting a handoff`);
  }
});

// ─── Validation ──────────────────────────────────────────────────────────────

test('a lead with no way to reach the person cannot be sent', () => {
  const noContact = submissionDraft({
    pathway: Pathway.HAVE_JOB,
    answers: { location: 'Tampa', scope: 'Service change.' },
  });
  const v = validateSubmission(noContact);
  assert.equal(v.ok, false);
  assert.ok(v.missing.includes('name') && v.missing.includes('email'));
  assert.equal(transition(noContact, SubmissionStatus.READY_TO_SEND).ok, false);
});

test('the contact required is the one they asked to be reached by', () => {
  const emailOnly = { name: 'A', email: 'a@b.co', phone: '', preferred: ContactMethod.EMAIL };
  assert.equal(validateContact(emailOnly).ok, true, 'a phone is not demanded from somebody who wants email');

  const wantsCall = { ...emailOnly, preferred: ContactMethod.PHONE };
  const v = validateContact(wantsCall);
  assert.equal(v.ok, false);
  assert.ok(v.missing.includes('phone'));
  assert.match(v.reason, /phone call/i, 'the reason names the choice they made');
});

test('required fields are per pathway and are actually enforced', () => {
  for (const p of PATHWAYS) {
    const missingAll = submissionDraft({ pathway: p.id, contact: goodContact });
    const v = validateSubmission(missingAll);
    assert.equal(v.ok, false, `${p.id} accepts an empty form`);
    for (const f of p.fields.filter((x) => x.required)) {
      assert.ok(v.missing.includes(f.id), `${p.id} does not require ${f.id}`);
    }
    assert.equal(validateSubmission(complete(p.id)).ok, true, `${p.id} rejects a complete form`);
  }
});

test('email and phone checks let real values through', () => {
  for (const ok of ['a@b.co', 'evan.kinsey+cc@sparkconnect.pro']) assert.equal(looksLikeEmail(ok), true, ok);
  for (const bad of ['', 'evan', 'evan@', '@b.co', 'a@b']) assert.equal(looksLikeEmail(bad), false, bad);
  for (const ok of ['(813) 555-0148', '813-555-0148', '+1 813 555 0148']) assert.equal(looksLikePhone(ok), true, ok);
  assert.equal(looksLikePhone('555-0148'), false);
});

// ─── Moderation ──────────────────────────────────────────────────────────────

test('moderation flags persist onto the submission and into the handoff', () => {
  const noLicence = complete(Pathway.CAN_QUALIFY, { license: '' });
  assert.deepEqual([...moderationFlags(noLicence)], [ModerationFlag.NO_LICENCE_STATED]);

  const wrong = complete(Pathway.WANT_WORK, { license: 'XX' });
  assert.ok(moderationFlags(wrong).includes(ModerationFlag.LICENCE_LOOKS_WRONG));

  // A stated licence is never treated as a verified one.
  const stated = complete(Pathway.WANT_WORK);
  assert.ok(moderationFlags(stated).includes(ModerationFlag.UNVERIFIED_LICENCE));

  const body = bodyFor(sendIt(stated).sub);
  assert.match(body, /REVIEW BEFORE MATCHING/);
  assert.ok(body.includes(FLAG_NOTE[ModerationFlag.UNVERIFIED_LICENCE]));
});

test('a licence number in the app is never a verified badge', () => {
  const stated = complete(Pathway.WANT_WORK);
  const flags = moderationFlags(stated);
  assert.ok(flags.includes(ModerationFlag.UNVERIFIED_LICENCE),
    'typing a number must never be treated as verification');
  assert.match(FLAG_NOTE[ModerationFlag.UNVERIFIED_LICENCE], /nobody has checked/i);

  // And the handoff carries the authority's own URL, so matching starts there.
  const url = verificationUrlFor(stated);
  assert.match(url, /^https:\/\/www\.myfloridalicense\.com\//);
  assert.match(url, /EC13001234/);
});

test('free text that promises an outcome is flagged rather than repeated', () => {
  const promising = complete(Pathway.HAVE_JOB, {
    scope: 'Straightforward job, and we will get the permit approved quickly.',
  });
  assert.ok(findOutcomePromise(promising.answers.scope), 'the fixture is not actually a promise');
  assert.ok(moderationFlags(promising).includes(ModerationFlag.OUTCOME_PROMISE));
});

test('contact details buried in a description are noticed', () => {
  const buried = complete(Pathway.HAVE_JOB, { scope: 'Call the owner on 813-555-0148 about it.' });
  assert.ok(moderationFlags(buried).includes(ModerationFlag.CONTACT_IN_FREE_TEXT));
});

// ─── The inbox ───────────────────────────────────────────────────────────────

test('the subject line sorts an inbox without opening anything', () => {
  const s = subjectFor(sendIt(complete(Pathway.HAVE_JOB)).sub);
  assert.equal(s, '[Contractor Connect] Job Opportunity — Electrical — Tampa');

  assert.match(subjectFor(complete(Pathway.NEED_QUALIFIER)), /Qualifier Request/);
  assert.match(subjectFor(complete(Pathway.WANT_WORK)), /Contractor Profile/);
  assert.match(subjectFor(complete(Pathway.CAN_QUALIFY)), /Qualifier Interest/);
});

test('the body is readable by a person and parseable later', () => {
  const sub = sendIt(complete(Pathway.HAVE_JOB)).sub;
  const body = bodyFor(sub);

  for (const needed of ['CONTACT', 'DETAILS', sub.id, 'Evan K', 'evan@example.com', 'Tampa, Hillsborough']) {
    assert.ok(body.includes(needed), `the handoff omits ${needed}`);
  }

  // The machine-readable tail must actually parse.
  const data = JSON.parse(body.split('\nDATA\n')[1]);
  assert.equal(data.id, sub.id);
  assert.equal(data.pathway, Pathway.HAVE_JOB);
  assert.deepEqual(data.contact, sub.contact);
});

test('the handoff carries nothing internal', () => {
  const body = bodyFor(sendIt(complete()).sub);
  for (const leak of [/deviceId/i, /revenuecat/i, /appl_/, /goog_/, /api[_ ]?key/i, /bearer /i, /stack/i]) {
    assert.doesNotMatch(body, leak, `debug or secret material in the handoff: ${leak}`);
  }
});

test('the payload goes to the support address, by share or by mail', () => {
  const sub = complete();
  const p = handoffPayload(sub);
  assert.equal(p.to, SUPPORT_EMAIL);
  const url = mailtoUrl(p);
  assert.ok(url.startsWith(`mailto:${SUPPORT_EMAIL}?subject=`));
  assert.ok(decodeURIComponent(url).includes('Tampa'));
});

// ─── The store ───────────────────────────────────────────────────────────────

const memoryStorage = () => {
  const map = new Map();
  return {
    map,
    getItem: async (k) => (map.has(k) ? map.get(k) : null),
    setItem: async (k, v) => { map.set(k, v); },
  };
};

test('a draft survives being written and read back', async () => {
  const storage = memoryStorage();
  const store = createSubmissionStore(storage);
  const d = complete();

  await store.save(d);
  const back = await store.get(d.id);
  assert.equal(back.id, d.id);
  assert.equal(back.status, SubmissionStatus.DRAFT);
  assert.deepEqual(back.answers, d.answers);
  assert.ok(storage.map.has(STORE_KEY));
});

test('saving is an upsert, so a status change does not fork the record', async () => {
  const store = createSubmissionStore(memoryStorage());
  const d = complete();
  await store.save(d);
  const sent = sendIt(d).sub;
  const rows = await store.save(sent);

  assert.equal(rows.length, 1, 'the same submission was stored twice');
  assert.equal(rows[0].status, SubmissionStatus.HANDED_OFF);
  assert.equal((await store.unsent()).length, 0);
});

test('a corrupted store opens empty rather than never opening', () => {
  for (const junk of ['', 'not json', '{"not":"an array"}', '[{"pathway":"NOPE"}]', '[null]']) {
    assert.deepEqual([...parseStored(junk)], [], `parseStored choked on ${junk}`);
  }
  // A half-written record cannot enter through the back door either.
  const smuggled = serialize([{ id: 'x', pathway: 'HAVE_JOB', status: 'RECEIVED' }]);
  const [row] = parseStored(smuggled);
  assert.equal(row.status, SubmissionStatus.DRAFT, 'an unknown status must fall back to DRAFT');
});

test('removing one leaves the others', async () => {
  const store = createSubmissionStore(memoryStorage());
  const a = complete(Pathway.HAVE_JOB);
  const b = complete(Pathway.WANT_WORK);
  await store.save(a);
  await store.save(b);
  const left = await store.remove(a.id);
  assert.equal(left.length, 1);
  assert.equal(left[0].id, b.id);
});

// ─── Reachability and the flag ───────────────────────────────────────────────

test('the screen is reachable, and all four pathways open from it', () => {
  const app = readFileSync(new URL('../App.js', import.meta.url), 'utf8');
  assert.match(app, /case 'connect':/, 'no route renders Contractor Connect');
  assert.match(app, /ContractorConnectScreen/, 'the screen is never imported');
  assert.match(app, /'panelschedule','connect'\]/, "'connect' is not a valid tab");
  assert.match(app, /connect: Feature\.CONTRACTOR_CONNECT/, 'the tab is not on the kill switch map');

  const screen = readFileSync(new URL('../src/screens/ContractorConnectScreen.js', import.meta.url), 'utf8');
  assert.match(screen, /PATHWAYS\.map/, 'the entry screen does not render the pathways');
  assert.match(screen, /startPathway\(p\.id\)/, 'the pathway cards do not open anything');
  assert.equal(PATHWAYS.length, 4);
});

test('Contractor Connect can be switched off from the website', () => {
  assert.ok(REGISTRY[Feature.CONTRACTOR_CONNECT], 'the feature is not in the registry');
  assert.equal(REGISTRY[Feature.CONTRACTOR_CONNECT].otaConfigurable, true);
  const off = applyRemoteConfig({ [Feature.CONTRACTOR_CONNECT]: { disabled: true } });
  assert.equal(off[Feature.CONTRACTOR_CONNECT].disabled, true);

  const config = JSON.parse(readFileSync(new URL('../website/app-config.json', import.meta.url), 'utf8'));
  assert.match(config._howToDisableAFeature, /CONTRACTOR_CONNECT/,
    'the operator instructions do not mention the one feature most likely to need switching off');
});

test('the screen never renders developer language at a user', () => {
  const screen = readFileSync(new URL('../src/screens/ContractorConnectScreen.js', import.meta.url), 'utf8');
  // Strings only — the comments in that file discuss the backend at length and
  // should, because the next person to edit it needs to know.
  const strings = [...screen.matchAll(/>([^<>{}]{12,})</g)].map((m) => m[1]);
  for (const s of strings) {
    assert.doesNotMatch(s, /no backend|local[- ]only|not implemented|coming soon|TODO/i,
      `developer language on screen: "${s.trim()}"`);
  }
});

test('the beta disclosure says who does the matching', () => {
  assert.match(BETA_DISCLOSURE.body, /reviewed and assisted by our team/i);
  assert.match(BETA_DISCLOSURE.body, /not currently published/i);
  assert.doesNotMatch(`${BETA_DISCLOSURE.title} ${BETA_DISCLOSURE.body}`, /no backend|not built/i);
});

test('the future backend is documented and stays unbuilt', () => {
  assert.match(BACKEND_CONTRACT.status, /NOT IMPLEMENTED/);
  for (const t of ['users', 'opportunities', 'contractor_profiles', 'qualifier_profiles',
    'intro_requests', 'verification_records', 'moderation_flags', 'saved_items', 'audit_events']) {
    assert.ok(BACKEND_CONTRACT.tables[t], `${t} is missing from the migration target`);
  }
  // Nothing in this release may reach for a marketplace backend.
  for (const f of ['submissions.js', 'store.js']) {
    const src = readFileSync(new URL(`../src/core/connect/${f}`, import.meta.url), 'utf8');
    const code = src.split('\n').filter((l) => !/^\s*(\*|\/\/)/.test(l)).join('\n');
    assert.doesNotMatch(code, /supabase|createClient|fetch\(/i, `${f} reaches for a backend`);
  }
});
