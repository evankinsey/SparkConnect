// ─── QUALIFYING RELATIONSHIPS ────────────────────────────────────────────────
// The pipeline from "these two are interested" to "a qualifying relationship
// exists" — with the board's review as an UNSKIPPABLE stage in the middle.
//
// The rule the brief states and this file enforces: a qualifying relationship
// is never marked legally active because both parties clicked Accept. Between
// MUTUAL_INTEREST and RELATIONSHIP_CONFIRMED sit APPLICATION_REQUIRED and
// BOARD_AGENCY_REVIEW, and `advanceQualification` refuses to jump them. The
// final state also demands a reference to what the parties say the authority
// issued — recorded as their attestation, with the caveat rendered alongside:
// SparkConnect has not independently confirmed board approval unless a source
// record says so.
//
// Pure module: no React, no network, no storage.

import { isActiveVerified } from './verification.js';

export const QualStatus = Object.freeze({
  LICENSE_VERIFIED: 'LICENSE_VERIFIED',       // qualifier's licence read from the board
  INTEREST_PROFILE: 'INTEREST_PROFILE',       // both sides profiled, nothing between them yet
  INTRO_REQUESTED: 'INTRO_REQUESTED',
  MUTUAL_INTEREST: 'MUTUAL_INTEREST',
  APPLICATION_REQUIRED: 'APPLICATION_REQUIRED', // the paperwork stage — DBPR forms, board filing
  BOARD_AGENCY_REVIEW: 'BOARD_AGENCY_REVIEW',   // out of our hands, and said so
  RELATIONSHIP_CONFIRMED: 'RELATIONSHIP_CONFIRMED',
  ENDED: 'ENDED',
});

export const QUAL_STATUS_LABEL = Object.freeze({
  LICENSE_VERIFIED: 'Licence read from the issuing board',
  INTEREST_PROFILE: 'Interest recorded',
  INTRO_REQUESTED: 'Introduction requested',
  MUTUAL_INTEREST: 'Both sides interested',
  APPLICATION_REQUIRED: 'Board application required',
  BOARD_AGENCY_REVIEW: 'With the board / agency',
  RELATIONSHIP_CONFIRMED: 'Relationship recorded as confirmed',
  ENDED: 'Ended',
});

const ORDER = Object.freeze([
  QualStatus.INTEREST_PROFILE,
  QualStatus.INTRO_REQUESTED,
  QualStatus.MUTUAL_INTEREST,
  QualStatus.APPLICATION_REQUIRED,
  QualStatus.BOARD_AGENCY_REVIEW,
  QualStatus.RELATIONSHIP_CONFIRMED,
]);

const isNonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

let _n = 0;
const mintId = (now) => { _n = (_n + 1) % 10000; return `qrel_${now.toString(36)}_${_n.toString(36)}`; };

/**
 * Open a pipeline between one business need and one qualifier.
 * Refuses a qualifier whose licence is not VERIFIED_ACTIVE — an introduction
 * toward qualifying is exactly the place an unchecked licence must not reach.
 */
export const createQualification = ({ businessNeedId, qualifierId, qualifierVerification } = {},
  { now = Date.now() } = {}) => {
  if (!isNonEmpty(businessNeedId) || !isNonEmpty(qualifierId)) {
    return { ok: false, reason: 'Both parties are required.', pipeline: null };
  }
  if (!isActiveVerified(qualifierVerification?.status)) {
    return {
      ok: false,
      reason: 'The qualifier’s licence has not been read as active from the issuing board. '
        + 'Verify first — this pipeline starts from evidence.',
      pipeline: null,
    };
  }
  return {
    ok: true,
    reason: null,
    pipeline: Object.freeze({
      id: mintId(now),
      businessNeedId,
      qualifierId,
      status: QualStatus.INTEREST_PROFILE,
      createdAt: new Date(now).toISOString(),
      boardReference: null,
      events: Object.freeze([Object.freeze({ at: new Date(now).toISOString(), to: QualStatus.INTEREST_PROFILE })]),
    }),
  };
};

/**
 * Advance one stage at a time, in order. ENDED is reachable from anywhere.
 *
 * RELATIONSHIP_CONFIRMED additionally requires `boardReference` — the filing
 * or licence reference the parties report the authority issued. Without it,
 * "confirmed" would mean "two people agreed", which is the exact meaning this
 * state machine exists to refuse.
 */
export const advanceQualification = (pipeline, to, { at = null, by = null, boardReference = null } = {}) => {
  if (!pipeline) return { ok: false, reason: 'No pipeline.', pipeline: null };
  if (to === QualStatus.ENDED) {
    return { ok: true, reason: null, pipeline: stamp(pipeline, to, { at, by }) };
  }
  const from = ORDER.indexOf(pipeline.status);
  const next = ORDER.indexOf(to);
  if (next === -1) return { ok: false, reason: `Unknown status: ${to}`, pipeline };
  if (next !== from + 1) {
    return {
      ok: false,
      reason: `Cannot move ${pipeline.status} → ${to}. Stages advance one at a time — the board’s `
        + 'review is not skippable, and neither is anything else.',
      pipeline,
    };
  }
  if (to === QualStatus.RELATIONSHIP_CONFIRMED && !isNonEmpty(boardReference)) {
    return {
      ok: false,
      reason: 'Confirming a relationship requires the board or agency reference the parties '
        + 'received. Mutual agreement is not a licensing decision.',
      pipeline,
    };
  }
  const stamped = stamp(pipeline, to, { at, by });
  return {
    ok: true,
    reason: null,
    pipeline: to === QualStatus.RELATIONSHIP_CONFIRMED
      ? Object.freeze({ ...stamped, boardReference: boardReference.trim() })
      : stamped,
  };
};

const stamp = (pipeline, to, { at, by }) => Object.freeze({
  ...pipeline,
  status: to,
  events: Object.freeze([...pipeline.events, Object.freeze({ at, to, by })]),
});

/**
 * What a screen says next to RELATIONSHIP_CONFIRMED. The record is the
 * parties' report plus their reference — the caveat keeps that honest.
 */
export const CONFIRMED_CAVEAT =
  'Recorded from the parties’ report and the reference they provided. SparkConnect is not the '
  + 'licensing authority and has not independently read the board’s decision unless a source '
  + 'record is attached.';
