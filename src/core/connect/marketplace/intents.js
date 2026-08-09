// ─── CONTRACTOR CONNECT: THE FOUR INTENTS ────────────────────────────────────
// The entry screen asks one question — "What are you trying to do?" — and the
// four answers are the four sides of a marketplace that routes construction
// opportunities to people legally able to execute them.
//
// THE RULE THAT SHAPES EVERY STRING IN THIS FILE: this is an
// opportunity-routing marketplace, not a licence-borrowing one. The words
// "rent", "borrow" and "lend" never appear next to "license" as an offer,
// anywhere, in any tense. A user who does not personally hold the licence a
// job requires is a legitimate OPPORTUNITY SOURCE — an estimator, a
// journeyman, a property manager who found real work — and the product's job
// is to route that opportunity to a verified licensed contractor, never to
// dress the submitter up as one.
//
// Pure module: no React, no network, no storage.

import { findOutcomePromise } from '../index.js';
import { Trade } from '../index.js';

export const Intent = Object.freeze({
  HAVE_JOB: 'HAVE_JOB',           // I found an opportunity; I may not hold the licence it needs
  NEED_QUALIFIER: 'NEED_QUALIFIER', // my business needs a properly licensed qualifying agent
  WANT_WORK: 'WANT_WORK',         // I am a licensed contractor seeking opportunities
  CAN_QUALIFY: 'CAN_QUALIFY',     // I am licensed and open to qualifying appropriate businesses
});

export const INTENT_IDS = Object.freeze(Object.keys(Intent));

/**
 * The four premium cards, in the order they render.
 *
 * Copy is deliberately plain. Every line here is run through the
 * outcome-promise detector by `auditIntentCopy()` below, and through the
 * repo-wide banned-wording scanner, because this is the surface where a
 * hurried rewrite would first drift into "we'll get you licensed".
 */
export const INTENT_CARDS = Object.freeze([
  {
    intent: Intent.HAVE_JOB,
    icon: 'briefcase',
    title: 'I have a job',
    blurb: 'Found an opportunity? Connect it with the right licensed contractor.',
    detail: 'You do not need to hold a licence to submit an opportunity. You do need one to '
      + 'contract the work — and if you do not have it, we route the job to someone who does.',
  },
  {
    intent: Intent.NEED_QUALIFIER,
    icon: 'business',
    title: 'I need a qualifier',
    blurb: 'Find verified licensed professionals open to appropriate qualifying relationships.',
    detail: 'A qualifying agent takes on real supervisory and legal responsibility. This connects '
      + 'you with licensed people open to that role — it does not create the relationship, and it '
      + 'is not a way around the board.',
  },
  {
    intent: Intent.WANT_WORK,
    icon: 'ribbon',
    title: 'I want work',
    blurb: 'Licensed contractor? Find matching opportunities.',
    detail: 'Opportunities submitted here are matched on trade, licence class, jurisdiction and '
      + 'project size. Your licence is checked against the issuing board before anything matches.',
  },
  {
    intent: Intent.CAN_QUALIFY,
    icon: 'shield-checkmark',
    title: 'I can qualify',
    blurb: 'Licensed contractor? Explore businesses seeking qualifying professionals.',
    detail: 'Qualifying a business means supervising its operations, field work and finances — '
      + 'and the board decides whether you may take on another entity. This introduces; it never '
      + 'skips that review.',
  },
]);

export const intentCard = (intent) => INTENT_CARDS.find((c) => c.intent === intent) ?? null;

/**
 * The utility row below the four cards. These reuse what already ships:
 * verify opens the DBPR deep link, permit opens the Permit Assistant tab,
 * saved is the local keep-pile.
 */
export const UTILITY_ROW = Object.freeze([
  { id: 'verify_license', icon: 'checkmark-circle', label: 'Verify a License' },
  { id: 'permit_assistant', icon: 'document-text', label: 'Permit Assistant', tab: 'permits' },
  { id: 'saved', icon: 'heart', label: 'Saved' },
]);

// ─── The compliance rule, stated where every funnel can reach it ─────────────

/**
 * Shown to a HAVE_JOB submitter who says they do NOT hold the licence the
 * scope requires. This is the brief's exact posture: they may submit, they may
 * not contract, and the product never presents them as the contractor.
 */
export const UNLICENSED_SUBMITTER_NOTICE =
  'You can submit the opportunity for review and connection with an appropriately licensed '
  + 'contractor. Contractor Connect does not authorize you to contract work you are not legally '
  + 'licensed to contract.';

/**
 * Shown conspicuously on the NEED_QUALIFIER funnel.
 */
export const QUALIFIER_NEED_NOTICE =
  'A qualifying agent must actually satisfy applicable licensing-board requirements and '
  + 'supervisory responsibilities. Contractor Connect does not support passive license rental.';

/**
 * Shown on the CAN_QUALIFY funnel. "Available to qualify" is an interest
 * profile; whether a licensee may take on another business is the board's
 * decision, and the status model in qualification.js refuses to skip it.
 */
export const CAN_QUALIFY_NOTICE =
  'Being open to qualifying a business is not the same as the board permitting you to qualify '
  + 'one. Boards review additional-business requests and expect the qualifier to actually '
  + 'supervise each organization. Contractor Connect records interest and makes introductions — '
  + 'the board decides the rest.';

// ─── What each funnel asks ───────────────────────────────────────────────────
// Declared as data so the screen renders questions it cannot reword, and the
// tests can assert every required question exists without rendering anything.

export const FieldKind = Object.freeze({
  TEXT: 'TEXT',
  MULTILINE: 'MULTILINE',
  CHOICE: 'CHOICE',
  MULTI_CHOICE: 'MULTI_CHOICE',
  BOOL: 'BOOL',           // yes / no / unknown where allowUnknown is set
  STATE: 'STATE',         // two-letter state
  COUNTY: 'COUNTY',
  MONEY_RANGE: 'MONEY_RANGE',
  DATE: 'DATE',
});

export const PROJECT_TYPES = Object.freeze(['RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL']);

export const VALUE_RANGES = Object.freeze([
  { id: 'UNDER_5K', label: 'Under $5k' },
  { id: 'R5K_25K', label: '$5k – $25k' },
  { id: 'R25K_100K', label: '$25k – $100k' },
  { id: 'R100K_500K', label: '$100k – $500k' },
  { id: 'OVER_500K', label: 'Over $500k' },
  { id: 'UNKNOWN', label: 'Not sure yet' },
]);

export const SUBMITTER_ROLES = Object.freeze([
  { id: 'APPRENTICE', label: 'Apprentice' },
  { id: 'JOURNEYMAN', label: 'Journeyman' },
  { id: 'ESTIMATOR', label: 'Estimator' },
  { id: 'SALES', label: 'Salesperson' },
  { id: 'PROPERTY_MANAGER', label: 'Property manager' },
  { id: 'GC', label: 'General contractor' },
  { id: 'INVESTOR', label: 'Investor' },
  { id: 'HOMEOWNER', label: 'Homeowner / customer' },
  { id: 'OTHER', label: 'Other' },
]);

/**
 * The HAVE_JOB intake, question by question, in order. Every field the brief
 * names is here; the test pins that list so a redesign cannot quietly drop
 * "do you personally hold the licence?" — the one question the compliance
 * posture hangs on.
 */
export const HAVE_JOB_QUESTIONS = Object.freeze([
  { id: 'trade', kind: FieldKind.CHOICE, required: true, ask: 'What trade is the work?',
    options: Object.freeze(Object.keys(Trade)) },
  { id: 'state', kind: FieldKind.STATE, required: true, ask: 'Which state is the project in?' },
  { id: 'county', kind: FieldKind.COUNTY, required: true, ask: 'Which county?' },
  { id: 'city', kind: FieldKind.TEXT, required: false, ask: 'Which city, if you know it?' },
  { id: 'projectType', kind: FieldKind.CHOICE, required: true, ask: 'What kind of property?',
    options: PROJECT_TYPES },
  { id: 'estimatedValueRange', kind: FieldKind.MONEY_RANGE, required: true,
    ask: 'Roughly what is the project worth?', options: Object.freeze(VALUE_RANGES.map((r) => r.id)) },
  { id: 'description', kind: FieldKind.MULTILINE, required: true,
    ask: 'Describe the scope in your own words.' },
  { id: 'plansAvailable', kind: FieldKind.BOOL, required: true, ask: 'Are plans available?' },
  { id: 'photosAvailable', kind: FieldKind.BOOL, required: true, ask: 'Do you have photos?' },
  { id: 'desiredStart', kind: FieldKind.DATE, required: false, ask: 'When should work start?' },
  { id: 'permitLikely', kind: FieldKind.BOOL, required: true, allowUnknown: true,
    ask: 'Will this likely need a permit?',
    note: '"Not sure" is a fine answer. Permit thresholds are local, and guessing helps nobody.' },
  { id: 'howObtained', kind: FieldKind.MULTILINE, required: true,
    ask: 'How did this opportunity come to you?' },
  { id: 'submitterRole', kind: FieldKind.CHOICE, required: true, ask: 'What is your role?',
    options: Object.freeze(SUBMITTER_ROLES.map((r) => r.id)) },
  { id: 'holdsRequiredLicense', kind: FieldKind.BOOL, required: true,
    ask: 'Do you personally hold a contractor licence for this scope?',
    note: 'Answering no does not stop the submission. It changes who contracts the work — '
      + 'a verified licensed contractor, found through matching, never you.' },
]);

/** Field ids the brief requires, pinned for the test. */
export const HAVE_JOB_REQUIRED_IDS = Object.freeze(
  HAVE_JOB_QUESTIONS.filter((q) => q.required).map((q) => q.id));

export const questionById = (list, id) => list.find((q) => q.id === id) ?? null;

// ─── Copy audit ──────────────────────────────────────────────────────────────

/**
 * Every user-facing string in this file goes through the outcome-promise
 * detector. Run by the tests; kept here so a new card cannot be added without
 * being covered.
 */
export const auditIntentCopy = () => {
  const problems = [];
  const check = (text, where) => {
    const hit = findOutcomePromise(text);
    if (hit) problems.push(`${where}: promises an outcome — ${hit}`);
  };
  for (const c of INTENT_CARDS) {
    check(c.title, c.intent); check(c.blurb, c.intent); check(c.detail, c.intent);
  }
  for (const q of HAVE_JOB_QUESTIONS) {
    check(q.ask, q.id);
    if (q.note) check(q.note, q.id);
  }
  check(UNLICENSED_SUBMITTER_NOTICE, 'unlicensed-submitter notice');
  check(QUALIFIER_NEED_NOTICE, 'qualifier-need notice');
  check(CAN_QUALIFY_NOTICE, 'can-qualify notice');
  return Object.freeze(problems);
};
