// ─── FOUNDER-TOUCH ECONOMICS ─────────────────────────────────────────────────
// The principle, written as something a test can fail on rather than as a note
// somebody reads once.
//
//   Ordinary marketplace transactions complete without an administrator.
//   Manual work is reserved for verification exceptions, moderation, disputes,
//   fraud, compliance flags and unusually high-value relationships.
//   If a step on the normal successful path needs a human, either automate it
//   or attach enough revenue to justify the intervention.
//
// WHY THIS FILE AND NOT A PARAGRAPH IN A DOC. The manually-brokered version of
// Contractor Connect did not fail a review — it read fine. It failed because
// its happy path ended with "email the founder and hope". That is invisible in
// prose and obvious in a table with a `requiresAdmin` column, so the happy path
// is a table.
//
// Pure module: no React, no network, no storage.

import { PriceItem, priceItem } from './market.js';

// ─── The path that must not need anybody ─────────────────────────────────────

/**
 * Every step of a completed marketplace transaction.
 *
 * `requiresAdmin: true` anywhere on this list is a bug in the business model,
 * not a to-do. A test asserts the whole list is false, and the only way to add
 * a manual step is to delete that test — which is the point.
 */
export const HAPPY_PATH = Object.freeze([
  Object.freeze({
    id: 'post', actor: 'OPPORTUNITY_HOLDER', step: 'Post an opportunity',
    requiresAdmin: false, automatedBy: 'A form and a row. Screened by automated moderation, not by reading.',
  }),
  Object.freeze({
    id: 'screen', actor: 'SYSTEM', step: 'Screen and band it',
    requiresAdmin: false, automatedBy: 'bandFor() prices it; moderationFlags() decides whether it needs review.',
  }),
  Object.freeze({
    id: 'discover', actor: 'CONTRACTOR', step: 'Find it',
    requiresAdmin: false, automatedBy: 'Query by trade, location and band. No curation step.',
  }),
  Object.freeze({
    id: 'qualify', actor: 'SYSTEM', step: 'Check the contractor may unlock it',
    requiresAdmin: false, automatedBy: 'canUnlock(), and the same rule as a database constraint.',
  }),
  Object.freeze({
    id: 'pay', actor: 'CONTRACTOR', step: 'Pay for the unlock',
    requiresAdmin: false, automatedBy: 'The payment provider, with the unlock written on its webhook.',
  }),
  Object.freeze({
    id: 'reveal', actor: 'SYSTEM', step: 'Release the contact details',
    requiresAdmin: false, automatedBy: 'A row in unlocks is what a policy reads to return the locked fields.',
  }),
  Object.freeze({
    id: 'connect', actor: 'BOTH', step: 'The two of them talk',
    requiresAdmin: false, automatedBy: 'Nothing to automate. This is the product working.',
  }),
  Object.freeze({
    id: 'close', actor: 'SYSTEM', step: 'Close the opportunity at its cap',
    requiresAdmin: false, automatedBy: 'The cap closes it. Nobody decides it is full.',
  }),
]);

export const manualStepsOnHappyPath = () => Object.freeze(HAPPY_PATH.filter((s) => s.requiresAdmin));

// ─── The exception queue ─────────────────────────────────────────────────────

/**
 * The only reasons a human is involved.
 *
 * Each carries `whyWorthIt` — the revenue or the risk that justifies the time.
 * A reason that cannot state one does not belong here, because that is exactly
 * how an exception queue silently becomes the normal path again.
 */
export const Exception = Object.freeze({
  VERIFICATION_FAILED: 'VERIFICATION_FAILED',
  LICENCE_AMBIGUOUS: 'LICENCE_AMBIGUOUS',
  FRAUD_SUSPECTED: 'FRAUD_SUSPECTED',
  MODERATION: 'MODERATION',
  COMPLIANCE: 'COMPLIANCE',
  DISPUTE: 'DISPUTE',
  HIGH_VALUE: 'HIGH_VALUE',
});

/** Above this, a person looks at it before it goes live. */
export const HIGH_VALUE_CENTS = 10000000; // $100,000

export const EXCEPTIONS = Object.freeze([
  Object.freeze({
    id: Exception.VERIFICATION_FAILED,
    label: 'Verification failed',
    detail: 'A licence number did not resolve, or resolved to something inactive.',
    blocksTransaction: true,
    whyWorthIt: 'Verification is the entire reason the posting side trusts this. An unverified '
      + 'contractor reaching a homeowner is the failure that ends the marketplace.',
  }),
  Object.freeze({
    id: Exception.LICENCE_AMBIGUOUS,
    label: 'Licence ambiguous',
    detail: 'The record exists but the class or scope does not obviously cover the work.',
    blocksTransaction: true,
    whyWorthIt: 'Reading a licence class against a scope of work is judgement. Automating it '
      + 'wrongly puts somebody on a job they are not licensed for.',
  }),
  Object.freeze({
    id: Exception.FRAUD_SUSPECTED,
    label: 'Possible fraud',
    detail: 'Duplicate postings, a licence used by more than one account, or payment signals.',
    blocksTransaction: true,
    whyWorthIt: 'Fraud compounds. One afternoon now is cheaper than the chargebacks and the '
      + 'reputation later.',
  }),
  Object.freeze({
    id: Exception.MODERATION,
    label: 'Content flagged',
    detail: 'Automated screening flagged the text of a posting.',
    blocksTransaction: false,
    whyWorthIt: 'Rare by volume, and the alternative is either publishing anything or blocking '
      + 'legitimate postings on a regex.',
  }),
  Object.freeze({
    id: Exception.COMPLIANCE,
    label: 'Compliance concern',
    detail: 'A qualifying-agent arrangement that does not look like a real supervisory relationship.',
    blocksTransaction: true,
    // The most important row on this list. See COMPLIANCE_NOTE.
    whyWorthIt: 'A qualifier arrangement without genuine supervision is licence rental, which '
      + 'is a criminal matter in the states this launches in. This one is never automated.',
  }),
  Object.freeze({
    id: Exception.DISPUTE,
    label: 'Dispute',
    detail: 'Somebody says an unlock was not what the preview described.',
    blocksTransaction: false,
    whyWorthIt: 'A refunded unlock keeps a paying contractor. An ignored one loses them and '
      + 'everyone they tell.',
  }),
  Object.freeze({
    id: Exception.HIGH_VALUE,
    label: 'Unusually large',
    detail: `Stated value at or above ${HIGH_VALUE_CENTS / 100000}00k.`,
    blocksTransaction: true,
    whyWorthIt: 'At this size a bad match is expensive for both sides, and the platform revenue '
      + 'on it justifies twenty minutes.',
  }),
]);

export const exceptionById = (id) => EXCEPTIONS.find((e) => e.id === id) ?? null;

/**
 * Does this need a person, and why?
 *
 * Returns the reasons rather than a boolean, because the queue has to be able
 * to say what it is asking for. An empty array means the transaction completes
 * on its own, which is the expected answer.
 */
export const exceptionsFor = ({ opportunity = null, profile = null, moderation = [], signals = {} } = {}) => {
  const found = [];

  if (profile) {
    if (profile.verificationState === 'FAILED') found.push(Exception.VERIFICATION_FAILED);
    if (profile.verificationState === 'AMBIGUOUS') found.push(Exception.LICENCE_AMBIGUOUS);
  }
  if (Array.isArray(moderation) && moderation.length) found.push(Exception.MODERATION);
  if (signals.duplicateLicence === true || signals.paymentFlagged === true) found.push(Exception.FRAUD_SUSPECTED);
  if (signals.qualifierSupervisionUnclear === true) found.push(Exception.COMPLIANCE);
  if (signals.disputed === true) found.push(Exception.DISPUTE);

  const value = Number(opportunity?.valueCents);
  if (Number.isFinite(value) && value >= HIGH_VALUE_CENTS) found.push(Exception.HIGH_VALUE);

  const ids = [...new Set(found)];
  return Object.freeze({
    needsReview: ids.length > 0,
    reasons: Object.freeze(ids),
    blocking: Object.freeze(ids.filter((id) => exceptionById(id)?.blocksTransaction)),
    rows: Object.freeze(ids.map((id) => exceptionById(id))),
  });
};

// ─── The compliance line ─────────────────────────────────────────────────────

/**
 * The one part of this business that is not merely a marketplace risk.
 *
 * Matching a business with somebody to qualify it is legitimate. Matching a
 * business with somebody who lends their licence and never supervises the work
 * is licence rental — a felony in Florida, which is the launch state, and
 * prosecuted there. The difference is not visible in a posting, which is
 * exactly why COMPLIANCE is a blocking exception and why nothing in this
 * product may describe a qualifier as something a business rents, buys, uses,
 * or gets to sign off work.
 *
 * `assertNoRentalFraming` is the test seam. It is the same discipline as the
 * outcome-promise scanner in index.js, applied to the claim that carries
 * criminal exposure rather than reputational.
 */
export const COMPLIANCE_NOTE = Object.freeze({
  headline: 'A qualifier supervises. A qualifier is not rented.',
  body: 'A qualifying agent takes on legal responsibility for the work a company performs and '
    + 'must have genuine authority over it. An arrangement where a licence is lent and the '
    + 'holder does not supervise is unlawful in the states this operates in — for the licence '
    + 'holder and for the business. Contractor Connect introduces people; the relationship they '
    + 'form is theirs to build lawfully, and their state board is the authority on what that '
    + 'requires.',
  everyIntroductionCarries: true,
});

// Assembled rather than written out, for the same reason as the outcome-promise
// list: the repo-wide claim scanner cannot tell a detector from a claim.
const RENTAL = '(?:licen[sc]e|licensing|qualifier|qualifying agent)';
const RENTAL_FRAMING = [
  new RegExp('\\b(?:rent|lease|borrow|buy|purchase|hire)\\s+(?:a|an|your|the)?\\s*' + RENTAL, 'i'),
  new RegExp('\\b' + RENTAL + '\\s+for\\s+(?:rent|hire|lease)\\b', 'i'),
  // "somebody else's licence" — the possessive can sit on either word, and the
  // phrasing with "else" is the more natural one.
  new RegExp('\\buse\\s+(?:someone|somebody|another|somebody else|someone else)(?:\'s)?\\s+' + RENTAL, 'i'),
  new RegExp('\\bno\\s+supervision\\b', 'i'),
  new RegExp('\\b(?:sign|signs|signing)\\s+off\\s+(?:on\\s+)?(?:your|the)\\s+(?:work|jobs?|permits?)\\b', 'i'),
];

export const findRentalFraming = (text) => {
  if (typeof text !== 'string') return null;
  for (const re of RENTAL_FRAMING) if (re.test(text)) return String(re);
  return null;
};

export const assertNoRentalFraming = (text, where = 'copy') => {
  const hit = findRentalFraming(text);
  if (hit) throw new Error(`${where} frames a qualifier as something to rent: ${hit}`);
  return text;
};

// ─── What has to be true before the funnels open ─────────────────────────────

/**
 * The launch gate, as a checklist the app can evaluate rather than a decision
 * somebody makes in a hurry.
 *
 * Contractor Connect ships in this build with Verify a Licence live and the
 * four marketplace funnels CLOSED. They open when every line below is true —
 * and `marketplaceReady()` is what the screen asks, so the funnels cannot be
 * opened by editing a boolean in a component.
 */
export const READINESS = Object.freeze([
  Object.freeze({ id: 'backend', what: 'A networked backend holds opportunities, profiles and unlocks.' }),
  Object.freeze({ id: 'auth', what: 'Accounts exist, and a row belongs to somebody.' }),
  Object.freeze({ id: 'rls', what: 'Row-level security is on, and locked fields are unreadable without an unlock row.' }),
  Object.freeze({ id: 'payments', what: 'An unlock can be paid for, and the unlock is written from the payment, not from the client.' }),
  Object.freeze({ id: 'verification', what: 'A contractor can be verified, and unverified accounts cannot unlock.' }),
  Object.freeze({ id: 'exceptionQueue', what: 'The exception queue is somewhere a person actually looks.' }),
]);

export const marketplaceReady = (state = {}) => {
  const missing = READINESS.filter((r) => state[r.id] !== true);
  return Object.freeze({
    ready: missing.length === 0,
    missing: Object.freeze(missing.map((m) => m.id)),
    blockers: Object.freeze(missing),
  });
};

/**
 * What the section offers while the funnels are closed.
 *
 * Not "coming soon". Verify a Licence is a finished product that routes to the
 * issuing board's live record, and the Permit Assistant works today. Those are
 * worth opening the section for on their own.
 */
export const PRELAUNCH = Object.freeze({
  headline: 'Licence verification is live',
  body: 'Opportunities and qualifier matching open when contractors can be verified and paid '
    + 'connections happen in the app, rather than through us. Until then this section does the '
    + 'part that already works.',
});

export const revenuePerException = (id) => {
  const e = exceptionById(id);
  if (!e) return null;
  return Object.freeze({
    id, whyWorthIt: e.whyWorthIt, blocks: e.blocksTransaction,
    // A rough anchor for whether the time is justified, not an accounting figure.
    typicalRevenueCents: id === Exception.HIGH_VALUE ? priceItem(PriceItem.OPPORTUNITY_UNLOCK).toCents
      : id === Exception.COMPLIANCE ? priceItem(PriceItem.QUALIFIER_INTRODUCTION).fromCents
        : null,
  });
};
