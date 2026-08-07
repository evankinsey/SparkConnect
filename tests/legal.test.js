// ─── ONE POLICY, EVERY PLATFORM ──────────────────────────────────────────────
// There were two policies and they disagreed about the most consequential
// sentence either one contained. These tests are what stops that happening
// again — not the fact that they currently match.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  DOCUMENTS, PRIVACY, TERMS, REQUIRED_DISCLOSURES,
  EFFECTIVE_DATE, CONTACT_EMAIL, POLICY_VERSION, asText,
} from '../src/core/legal/policy.js';
import { render } from '../scripts/build-legal-pages.mjs';

const privacyText = asText(PRIVACY, DOCUMENTS.privacy);
const termsText = asText(TERMS, DOCUMENTS.terms);

// ─── No drift ────────────────────────────────────────────────────────────────

test('the published pages are exactly what the policy module generates', () => {
  // The app renders src/core/legal/policy.js directly, so if the committed HTML
  // matches what that module produces, both platforms are showing one text.
  // Editing the HTML by hand is what this catches.
  for (const [key, path] of [['privacy', 'website/privacy.html'], ['terms', 'website/terms.html']]) {
    assert.equal(readFileSync(path, 'utf8'), render(key),
      `${path} has drifted from the policy module. Run: node scripts/build-legal-pages.mjs`);
  }
});

test('the app does not carry its own copy of either document', () => {
  const app = readFileSync('App.js', 'utf8');
  assert.match(app, /from '\.\/src\/core\/legal\/policy'/, 'App.js must render the shared policy');

  // The old hardcoded screens are gone. A sentence unique to the previous
  // in-app text would mean a second copy came back.
  assert.doesNotMatch(app, /Last updated: June 2025/);
  assert.doesNotMatch(app, /SparkConnect Tools collects minimal information/);
  assert.doesNotMatch(app, /No Guarantee of Code Compliance/);
});

test('both surfaces show the same effective date', () => {
  assert.match(readFileSync('website/privacy.html', 'utf8'), new RegExp(EFFECTIVE_DATE));
  assert.match(readFileSync('website/terms.html', 'utf8'), new RegExp(EFFECTIVE_DATE));
  assert.ok(POLICY_VERSION, 'a version makes a change reviewable');
  // The date the app renders comes from the same constant, so it cannot lag.
  assert.match(readFileSync('App.js', 'utf8'), /EFFECTIVE_DATE/);
});

// ─── The disclosures that must survive an edit ───────────────────────────────

test('every required disclosure is actually present', () => {
  // The reason this list exists: the website version omitted the third-party AI
  // provider entirely. It is the most consequential sentence in an AI product's
  // privacy policy and nothing would have noticed it was missing.
  for (const d of REQUIRED_DISCLOSURES) {
    assert.match(privacyText, d.mustMatch, `missing disclosure "${d.id}" — ${d.because}`);
    assert.ok(d.because, `${d.id} does not say why it is required`);
  }
});

test('the third-party AI disclosure is unmistakable, not buried', () => {
  // It gets its own section rather than a clause inside another one.
  const s = PRIVACY.find((x) => /third-party AI/i.test(x.title));
  assert.ok(s, 'third-party AI processing needs its own heading');
  assert.match(s.body, /not answered on your phone/i);
  assert.match(s.body, /encrypted/i);
  assert.match(s.body, /do not send private, sensitive or confidential/i);
  // And it names photographs specifically — a plan sheet with a customer's name
  // on it is the realistic way somebody leaks something here.
  assert.match(s.body, /photographs of people|documents/i);
});

test('what the app actually sends is what the policy says it sends', () => {
  const app = readFileSync('App.js', 'utf8');
  // The payload assembled at the SparkAI call site. Every field in it must be
  // disclosed; a policy that omits one is inaccurate, not merely brief.
  for (const [field, mustMatch] of [
    ['deviceId', /device identifier/i],
    ['appVersion', /app version/i],
    ['planType', /free or paid plan/i],
    ['conversation', /last few messages/i],
  ]) {
    assert.match(app, new RegExp(field), `${field} is no longer sent — the policy may be stale`);
    assert.match(privacyText, mustMatch, `${field} is sent but not disclosed`);
  }
});

test('the policy does not claim a protection the code does not provide', () => {
  const app = readFileSync('App.js', 'utf8');
  // "Exactly two situations" is a strong claim. It is only true while there are
  // exactly two fetch call sites.
  const fetches = [...app.matchAll(/\bfetch\(/g)].length;
  assert.equal(fetches, 2,
    `App.js now makes ${fetches} network calls; the privacy policy says exactly two`);
  assert.match(privacyText, /exactly two situations/);

  // And the "no analytics SDK" claim. Matched against IMPORTS only — a loose
  // scan caught the comment warning against Firebase keys and a component
  // called SEGMENTED CONTROL, which is how a test starts crying wolf.
  const imported = [
    ...app.matchAll(/(?:from|require\()\s*['"]([^'"]+)['"]/g),
  ].map((m) => m[1]);
  for (const spec of imported) {
    assert.doesNotMatch(spec, /amplitude|mixpanel|@segment|firebase|posthog|sentry|bugsnag/i,
      `${spec} is an analytics or crash SDK, and the policy says there is none`);
  }
  assert.match(privacyText, /no advertising SDK/);
  assert.match(privacyText, /no third-party analytics library/);
});

// ─── Terms ───────────────────────────────────────────────────────────────────

test('the terms keep the safety commitments the app makes elsewhere', () => {
  assert.match(termsText, /de-energize, lock out and verify absence of voltage/i);
  assert.match(termsText, /authority having jurisdiction/i);
  assert.match(termsText, /verified against the code edition your jurisdiction has adopted/i);
  // Subscription terms are an App Store requirement wherever a trial is offered.
  assert.match(termsText, /renew automatically/i);
  assert.match(termsText, /24 hours/);
  assert.match(termsText, /App Store or Google Play/);
});

test('no claim of compliance survives, in either document', () => {
  // The app's own content tests ban these. The same rule applies to the
  // documents, and the only permitted use is a denial.
  for (const doc of [privacyText, termsText]) {
    for (const m of doc.matchAll(/.{0,40}(code.compliant|guarantee\w*|certified).{0,40}/gi)) {
      assert.match(m[0], /\bno\b|\bnot\b|never|makes no/i,
        `an unqualified compliance claim: "${m[0].trim()}"`);
    }
  }
});

test('every section has a title and a body worth reading', () => {
  for (const [key, doc] of Object.entries(DOCUMENTS)) {
    assert.ok(doc.sections.length >= 8, `${key} is too thin`);
    for (const s of doc.sections) {
      assert.ok(s.title && s.title.length > 3, `${key}: a section has no title`);
      assert.ok(s.body && s.body.length > 60, `${key}: "${s.title}" has no substance`);
      // Sentence case headings, not the SHOUTING of a boilerplate template.
      assert.notEqual(s.title, s.title.toUpperCase(), `${key}: "${s.title}" is shouting`);
    }
    assert.ok(doc.summary.length > 80, `${key} has no plain-language summary`);
  }
});

test('the contact address is the same everywhere', () => {
  assert.match(privacyText, new RegExp(CONTACT_EMAIL));
  assert.match(termsText, new RegExp(CONTACT_EMAIL));
  for (const p of ['website/privacy.html', 'website/terms.html']) {
    assert.match(readFileSync(p, 'utf8'), new RegExp(CONTACT_EMAIL));
  }
});
