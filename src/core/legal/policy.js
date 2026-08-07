// ─── THE POLICIES, ONCE ──────────────────────────────────────────────────────
// One source for the Terms and the Privacy Policy, rendered by every surface
// that shows them.
//
// WHY THIS EXISTS. There were two policies. The app carried one (App.js,
// "Last updated: June 2025") and the website carried another, and they
// disagreed about the thing that matters most in an AI product:
//
//   · the APP disclosed that questions and photos are passed to a third-party
//     AI service provider. The website did not, and implied they stop at our
//     own backend. That is the single most consequential sentence in the
//     document and it was missing from the copy a regulator would read first.
//   · the WEBSITE disclosed the random device identifier sent with every
//     SparkAI request. The app's policy never mentioned it at all.
//
// Neither was complete, so "make them match" could not mean picking one. Both
// gaps are closed here and there is now exactly one text. `scripts/build-legal-pages.mjs`
// generates the website HTML from this file and a test fails if the committed
// HTML drifts from what this file produces.
//
// EVERY CLAIM HERE IS CHECKABLE AGAINST THE CODE. Before editing, verify:
//   fetch targets      App.js — exactly two, /api/ask-nec and /api/transcribe
//   what is sent       App.js — question, conversation, deviceId, appVersion, planType
//   device id          App.js getDeviceId() — Math.random, not a hardware value
//   local storage      the @sc_* AsyncStorage keys
//   no analytics       no SDK is imported anywhere; tests/security.test.js holds this
//
// A policy that says something the code does not do is worse than no policy.
//
// Pure module: no React. Data only.

export const POLICY_VERSION = '2.0.0';
export const EFFECTIVE_DATE = '7 August 2026';
export const CONTACT_EMAIL = 'support@sparkconnect.pro';

/**
 * The disclosures that must appear, whatever else changes.
 *
 * Each names the code path that makes it true. A test asserts every one of
 * these is present in the rendered privacy text — so an edit that tidies the
 * prose cannot quietly delete a required disclosure.
 */
export const REQUIRED_DISCLOSURES = Object.freeze([
  { id: 'third-party-ai', mustMatch: /third[- ]party|AI service provider/i,
    because: 'Question text and any attached photo are forwarded beyond our own backend.' },
  { id: 'photos-uploaded', mustMatch: /photo/i,
    because: 'A photo attached to a SparkAI question is transmitted.' },
  { id: 'voice-uploaded', mustMatch: /voice|audio/i,
    because: 'App.js posts recorded audio to /api/transcribe.' },
  { id: 'device-id', mustMatch: /device identifier|device ID/i,
    because: 'App.js sends deviceId with every SparkAI request.' },
  { id: 'no-sensitive', mustMatch: /do not (send|submit)/i,
    because: 'Users must be told not to put customer or personal data through SparkAI.' },
  { id: 'payments', mustMatch: /Apple|Google/,
    because: 'Purchases are processed by the stores; we never see card data.' },
  { id: 'children', mustMatch: /13/,
    because: 'Required age statement.' },
]);

const section = (title, body) => Object.freeze({ title, body });

// ─── Privacy ─────────────────────────────────────────────────────────────────

export const PRIVACY_SUMMARY =
  'There is no account. Almost everything stays on your phone. The exceptions are '
  + 'what you deliberately send to SparkAI — a question, a photo you attach, or a '
  + 'voice recording — and those are answered by a third-party AI service.';

export const PRIVACY = Object.freeze([
  section('What stays on your device',
    'Your projects, job photos, daily logs, panel schedules, material lists, calculations, '
    + 'calculator history, flashcard and quiz progress, job-site progress, saved settings, '
    + 'theme and Home layout are stored locally on your phone. None of it is uploaded to us. '
    + 'Deleting the app deletes them.'),

  section('What leaves your device, and when',
    'SparkConnect makes network requests in exactly two situations. First, when you ask '
    + 'SparkAI a question: we send the question text, the last few messages of that '
    + 'conversation so the answer makes sense in context, a randomly generated device '
    + 'identifier, the app version, and whether you are on the free or paid plan. If you '
    + 'attached a photo, the photo goes with it. Second, when you use voice input: the audio '
    + 'is sent to be transcribed into text, and the text is then treated as a typed question. '
    + 'That is the complete list. There is no background telemetry, no advertising SDK, no '
    + 'third-party analytics library and no database client in the app.'),

  section('Third-party AI processing',
    'SparkAI is not answered on your phone. Your question, and any photo attached to it, are '
    + 'sent over an encrypted connection to our backend and passed on to a third-party AI '
    + 'service provider that generates the response. Voice recordings are sent the same way to '
    + 'be transcribed. They are used to answer that request and are not used by us to identify '
    + 'you. Because that content leaves our systems, do not send private, sensitive or '
    + 'confidential information through SparkAI — including photographs of people, of '
    + 'documents, or of anything identifying a customer or a site.'),

  section('The device identifier',
    'A random string generated on your phone the first time you open the app — for example '
    + 'dev_k3n1p8x2mfq. It is not your advertising ID, not your device serial, and not derived '
    + 'from anything about your hardware. It exists so daily question limits can be counted. '
    + 'Deleting and reinstalling the app generates a new one. RevenueCat separately uses its '
    + 'own anonymous install identifier to track whether a plan is active.'),

  section('Photos',
    'Job photos live on your phone. A photo is only ever transmitted if you attach it to a '
    + 'SparkAI question yourself, including a plan sheet photographed for Blueprint Takeoff. '
    + 'We do not scan your camera roll, and the app only requests photo access at the moment '
    + 'you use a feature that needs it.'),

  section('Payments',
    'Subscriptions and one-time purchases are processed entirely by Apple or Google. We never '
    + 'see or store card details. Purchase status is managed through RevenueCat, which tells '
    + 'the app whether a plan is active. Refunds and cancellations are handled in your App '
    + 'Store or Google Play account.'),

  section('What we do not collect',
    'We never ask for your name, email address or phone number. We do not collect your '
    + 'location or your contacts. Customer names and addresses you type into a project stay on '
    + 'the device and are deliberately stripped from anything sent to SparkAI. We do not sell, '
    + 'rent or trade personal data.'),

  section('Children',
    'SparkConnect is a professional tool for people working or training in the electrical '
    + 'trade. It is not directed at children under 13 and we do not knowingly collect '
    + 'information from them.'),

  section('Your choices',
    'Turn the daily notification off in Settings at any time. Delete any project, photo or log '
    + 'from inside the app. Delete the app to remove everything stored on the device. Email '
    + `${CONTACT_EMAIL} with any question about your data.`),

  section('Changes',
    'If this policy changes in a way that affects what leaves your device, the change will be '
    + 'described here with a new date at the top rather than quietly replacing the text.'),
]);

// ─── Terms ───────────────────────────────────────────────────────────────────

export const TERMS_SUMMARY =
  'SparkConnect is a reference and productivity tool. It is not an engineer, an inspector, '
  + 'or a substitute for licensed supervision. Every calculation and every answer must be '
  + 'verified against the code edition your jurisdiction has adopted, the approved plans, and '
  + 'the equipment in front of you before you act on it.';

export const TERMS = Object.freeze([
  section('Reference tool only',
    'SparkConnect provides electrical calculators, training simulations, troubleshooting '
    + 'practice, job documentation and an AI assistant for electricians, apprentices, students '
    + 'and contractors. It does not replace professional judgement, licensed supervision, '
    + 'engineering review, inspections, permits, manufacturer instructions, OSHA requirements, '
    + 'the National Electrical Code, or your local Authority Having Jurisdiction.'),

  section('No warranty of code compliance',
    'Calculations and code references are for information and planning. We make no warranty '
    + 'that any result complies with the code adopted in your jurisdiction, is accurate, or is '
    + 'applicable to your installation or conditions.'),

  section('Accuracy, and what we publish about it',
    'The app\'s calculations rest on tables printed in the National Electrical Code. We track '
    + 'which of those we have checked by hand against the printed book and which we have not, '
    + 'and the app marks an answer resting on unverified data at the point the answer is given. '
    + 'That disclosure is a statement of our review status. It is not a warranty that any '
    + 'answer is correct for your installation.'),

  section('Your responsibility',
    'You are solely responsible for verifying every calculation, code citation, conductor '
    + 'size, conduit fill, voltage drop and box fill before using it in any installation. Work '
    + 'within your licence, training and local law. Obtain permits and inspections where they '
    + 'are required. Confirm the code edition your jurisdiction enforces.'),

  section('Electrical safety',
    'Electrical work can cause serious injury, death or property damage if performed '
    + 'incorrectly. This app does not provide safety advice and is not a substitute for '
    + 'training, licensing, supervision or safe work practices. It will not tell you a circuit '
    + 'is safe to touch — de-energize, lock out and verify absence of voltage yourself, every '
    + 'time.'),

  section('No engineering or professional advice',
    'This app does not provide engineering, legal or professional advice. For engineering '
    + 'review consult a licensed professional engineer. For legal questions consult a licensed '
    + 'attorney.'),

  section('Subscriptions and purchases',
    'Pro is billed monthly or annually at the price shown in the app at the time of purchase. '
    + 'Payment is charged to your App Store or Google Play account at confirmation. '
    + 'Subscriptions renew automatically unless cancelled at least 24 hours before the end of '
    + 'the current period, and your account is charged within 24 hours of the period ending. '
    + 'Manage or cancel in your App Store or Google Play account settings. One-time purchases, '
    + 'including answer packs and Lifetime Tools, do not renew. Prices may vary by region. '
    + 'Refunds are handled by Apple or Google under their policies.'),

  section('Acceptable use',
    'Do not reverse engineer, resell or redistribute the app or its content, and do not use it '
    + 'to produce guidance you present as your own professional certification.'),

  section('Limitation of liability',
    'SparkConnect is provided as-is. To the fullest extent permitted by law, we are not liable '
    + 'for any loss, damage, injury, rework, failed inspection, code violation or cost arising '
    + 'from use of or reliance on the app. It is one input to your professional judgement and '
    + 'never a replacement for it.'),

  section('Changes',
    'We may update these Terms. Material changes will be dated at the top of this page, and '
    + 'continued use after a change constitutes acceptance.'),
]);

/** Plain text, for anywhere that cannot render structure. */
export const asText = (sections, { title, summary }) => [
  title,
  `Last updated ${EFFECTIVE_DATE}`,
  '',
  summary,
  '',
  ...sections.flatMap((s) => [s.title.toUpperCase(), s.body, '']),
  `Questions? ${CONTACT_EMAIL}`,
].join('\n');

export const DOCUMENTS = Object.freeze({
  privacy: { title: 'Privacy Policy', summary: PRIVACY_SUMMARY, sections: PRIVACY, path: '/privacy' },
  terms: { title: 'Terms of Service', summary: TERMS_SUMMARY, sections: TERMS, path: '/terms' },
});
