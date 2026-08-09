// ─── OPPORTUNITY ─────────────────────────────────────────────────────────────
// A construction opportunity, submitted by whoever found it, contracted only
// ever by someone licensed to contract it.
//
// The submitter's licence answer is load-bearing. `licenseStatusOfSubmitter`
// is recorded verbatim and NEVER upgraded by anything in this module: a
// submitter who said "I do not hold the licence" stays an opportunity source,
// and `submitterNotice()` returns the exact language the brief requires for
// that case. There is no field on this model for "the submitter is the
// contractor" because that relationship is decided by matching against a
// verified profile, not by intake.
//
// Pure module: no React, no network, no storage.

import { Trade } from '../index.js';
import {
  HAVE_JOB_QUESTIONS, HAVE_JOB_REQUIRED_IDS, PROJECT_TYPES, VALUE_RANGES,
  SUBMITTER_ROLES, UNLICENSED_SUBMITTER_NOTICE,
} from './intents.js';

export const VerificationState = Object.freeze({
  UNREVIEWED: 'UNREVIEWED',
  IN_REVIEW: 'IN_REVIEW',
  DETAILS_CONFIRMED: 'DETAILS_CONFIRMED',
  COULD_NOT_CONFIRM: 'COULD_NOT_CONFIRM',
});

export const ModerationState = Object.freeze({
  PENDING: 'PENDING',       // every submission starts here — nothing skips the queue
  CLEARED: 'CLEARED',
  FLAGGED: 'FLAGGED',       // a risk pattern matched; a person decides, the pattern does not
  REJECTED: 'REJECTED',
  DUPLICATE: 'DUPLICATE',
});

export const MatchState = Object.freeze({
  UNMATCHED: 'UNMATCHED',
  CANDIDATES_FOUND: 'CANDIDATES_FOUND',
  INTRO_REQUESTED: 'INTRO_REQUESTED',
  INTRODUCED: 'INTRODUCED',
  MATCHED: 'MATCHED',
  CLOSED: 'CLOSED',
});

export const SubmitterLicense = Object.freeze({
  HOLDS_REQUIRED: 'HOLDS_REQUIRED',
  DOES_NOT_HOLD: 'DOES_NOT_HOLD',
  UNSURE: 'UNSURE',
});

const isNonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;
const clean = (v, max = 4000) => (isNonEmpty(v) ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

const VALUE_RANGE_IDS = VALUE_RANGES.map((r) => r.id);
const ROLE_IDS = SUBMITTER_ROLES.map((r) => r.id);

let _counter = 0;
/** Collision-resistant enough for a local store; the backend will mint real ids. */
export const opportunityId = (now = Date.now()) => {
  _counter = (_counter + 1) % 10000;
  return `opp_${now.toString(36)}_${_counter.toString(36)}`;
};

/**
 * Validate an intake draft against the declared questions.
 * Returns { ok, missing, problems } — the screen renders `missing` as the
 * fields still to answer, so validation and UI cannot drift apart.
 */
export const validateOpportunityDraft = (draft = {}) => {
  const missing = [];
  const problems = [];

  for (const q of HAVE_JOB_QUESTIONS) {
    if (!q.required) continue;
    const v = draft[q.id];
    const empty = v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
    if (empty) missing.push(q.id);
  }
  if (draft.trade && !Object.prototype.hasOwnProperty.call(Trade, draft.trade)) {
    problems.push(`Unknown trade: ${draft.trade}`);
  }
  if (draft.projectType && !PROJECT_TYPES.includes(draft.projectType)) {
    problems.push(`Unknown project type: ${draft.projectType}`);
  }
  if (draft.estimatedValueRange && !VALUE_RANGE_IDS.includes(draft.estimatedValueRange)) {
    problems.push(`Unknown value range: ${draft.estimatedValueRange}`);
  }
  if (draft.submitterRole && !ROLE_IDS.includes(draft.submitterRole)) {
    problems.push(`Unknown submitter role: ${draft.submitterRole}`);
  }
  if (draft.state && !/^[A-Za-z]{2}$/.test(String(draft.state).trim())) {
    problems.push('State must be the two-letter code.');
  }
  return Object.freeze({ ok: missing.length === 0 && problems.length === 0, missing: Object.freeze(missing), problems: Object.freeze(problems) });
};

/**
 * Build the opportunity. Refuses an invalid draft rather than storing a
 * half-answered one — a record with no trade or no jurisdiction can never be
 * matched, so storing it just manufactures a dead row.
 */
export const createOpportunity = (draft = {}, { now = Date.now() } = {}) => {
  const valid = validateOpportunityDraft(draft);
  if (!valid.ok) return { ok: false, ...valid, opportunity: null };

  const holds = draft.holdsRequiredLicense === true || draft.holdsRequiredLicense === 'yes'
    ? SubmitterLicense.HOLDS_REQUIRED
    : draft.holdsRequiredLicense === 'unsure'
      ? SubmitterLicense.UNSURE
      : SubmitterLicense.DOES_NOT_HOLD;

  const opportunity = Object.freeze({
    id: opportunityId(now),
    trade: draft.trade,
    jurisdiction: Object.freeze({
      state: String(draft.state).trim().toUpperCase(),
      county: clean(draft.county, 80),
      city: clean(draft.city, 80) || null,
    }),
    projectType: draft.projectType,
    estimatedValueRange: draft.estimatedValueRange,
    description: clean(draft.description),
    // Media are stored as references, never inlined — analytics and exports
    // must not be able to pick up plan images by accident.
    media: Object.freeze(Array.isArray(draft.media) ? draft.media.filter(isNonEmpty).slice(0, 20) : []),
    plansAvailable: draft.plansAvailable === true || draft.plansAvailable === 'yes',
    photosAvailable: draft.photosAvailable === true || draft.photosAvailable === 'yes',
    desiredStart: isNonEmpty(draft.desiredStart) ? draft.desiredStart : null,
    permitLikely: draft.permitLikely === true || draft.permitLikely === 'yes' ? 'YES'
      : draft.permitLikely === false || draft.permitLikely === 'no' ? 'NO' : 'UNKNOWN',
    howObtained: clean(draft.howObtained, 1000),
    sourceUserRole: draft.submitterRole,
    licenseStatusOfSubmitter: holds,
    createdAt: new Date(now).toISOString(),
    verificationState: VerificationState.UNREVIEWED,
    moderationState: ModerationState.PENDING,
    matchState: MatchState.UNMATCHED,
  });

  return { ok: true, missing: Object.freeze([]), problems: Object.freeze([]), opportunity };
};

/**
 * What the submitter is told after answering the licence question.
 * The brief's exact language for the unlicensed case, and a plain
 * confirmation for the licensed one — which still verifies before matching.
 */
export const submitterNotice = (opportunity) => {
  if (!opportunity) return null;
  if (opportunity.licenseStatusOfSubmitter === SubmitterLicense.HOLDS_REQUIRED) {
    return 'You said you hold a licence for this scope. It will be checked against the issuing '
      + 'board before you appear as a contracting candidate — that check protects you as much as '
      + 'the customer.';
  }
  return UNLICENSED_SUBMITTER_NOTICE;
};

/** State transitions, each refusing to skip the queue. */

export const setModeration = (opportunity, state, { reason = null, by = null, at = null } = {}) => {
  if (!opportunity) return { ok: false, reason: 'No opportunity.' };
  if (!Object.prototype.hasOwnProperty.call(ModerationState, state)) {
    return { ok: false, reason: `Unknown moderation state: ${state}` };
  }
  // CLEARED requires a reviewer. A submission cannot clear itself, and an
  // anonymous clearance is indistinguishable from a bug.
  if (state === ModerationState.CLEARED && !isNonEmpty(by)) {
    return { ok: false, reason: 'Clearing moderation requires a named reviewer.' };
  }
  return {
    ok: true,
    reason: null,
    opportunity: Object.freeze({
      ...opportunity,
      moderationState: state,
      moderation: Object.freeze({ reason, by, at }),
    }),
  };
};

export const setMatchState = (opportunity, state) => {
  if (!opportunity || !Object.prototype.hasOwnProperty.call(MatchState, state)) {
    return { ok: false, reason: 'Unknown match state.' };
  }
  // Nothing matches until moderation cleared it. This is the ordering the
  // whole funnel depends on: flagged language never reaches a contractor.
  if (state !== MatchState.UNMATCHED && state !== MatchState.CLOSED
      && opportunity.moderationState !== ModerationState.CLEARED) {
    return { ok: false, reason: 'An opportunity cannot move toward a match before moderation clears it.' };
  }
  return { ok: true, reason: null, opportunity: Object.freeze({ ...opportunity, matchState: state }) };
};

export { HAVE_JOB_REQUIRED_IDS };
