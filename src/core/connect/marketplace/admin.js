// ─── ADMIN WAR ROOM ──────────────────────────────────────────────────────────
// One aggregation over a store snapshot: everything an operator needs to
// manually broker the first matches, and nothing that requires a server.
//
// The numbers are blunt on purpose, in the house style of coverage(): a
// dashboard that rounds "0 verified contractors" up to a friendlier shape is
// how an operator convinces themselves the marketplace is further along than
// it is.
//
// Pure module: no React, no network, no storage.

import { LicenseVerification } from './verification.js';
import { ModerationState, MatchState } from './opportunity.js';
import { IntroStatus } from './introductions.js';
import { QualStatus } from './qualification.js';

const count = (rows, pred) => rows.filter(pred).length;

/**
 * Build the war room from an admin snapshot (store.adminSnapshot().data)
 * plus the adapter registry's coverage, if one is passed.
 */
export const warRoom = (data, { coverage = null, now = Date.now() } = {}) => {
  const d = {
    opportunities: [], contractors: [], qualifiers: [], businessNeeds: [],
    intros: [], qualifications: [], billingEvents: [], reviewQueue: [], audit: [],
    ...(data ?? {}),
  };

  const dayAgo = now - 86400000;
  const isNew = (r) => Date.parse(r.createdAt ?? '') > dayAgo;
  const verified = (p) => p.verification?.status === LicenseVerification.VERIFIED_ACTIVE;
  const pendingVerification = (p) => p.verification?.status === LicenseVerification.UNVERIFIED
    || p.verification?.status === LicenseVerification.MANUAL_REVIEW
    || p.verification?.status === LicenseVerification.POSSIBLE_MATCH;

  const funnel = Object.freeze({
    submitted: d.opportunities.length,
    cleared: count(d.opportunities, (o) => o.moderationState === ModerationState.CLEARED),
    candidatesFound: count(d.opportunities, (o) => o.matchState === MatchState.CANDIDATES_FOUND),
    introduced: count(d.opportunities, (o) => o.matchState === MatchState.INTRODUCED),
    matched: count(d.opportunities, (o) => o.matchState === MatchState.MATCHED),
  });

  return Object.freeze({
    newToday: Object.freeze({
      opportunities: count(d.opportunities, isNew),
      contractors: count(d.contractors, isNew),
      qualifiers: count(d.qualifiers, isNew),
      businessNeeds: count(d.businessNeeds, isNew),
    }),
    totals: Object.freeze({
      opportunities: d.opportunities.length,
      contractors: d.contractors.length,
      qualifiers: d.qualifiers.length,
      businessNeeds: d.businessNeeds.length,
    }),
    verification: Object.freeze({
      verifiedContractors: count(d.contractors, verified),
      verifiedQualifiers: count(d.qualifiers, verified),
      pending: count([...d.contractors, ...d.qualifiers], pendingVerification),
      sourceUnavailable: count([...d.contractors, ...d.qualifiers],
        (p) => p.verification?.status === LicenseVerification.SOURCE_UNAVAILABLE),
    }),
    moderation: Object.freeze({
      awaitingReview: count(d.reviewQueue, (r) => r.status === 'AWAITING_REVIEW'),
      flagged: count(d.opportunities, (o) => o.moderationState === ModerationState.FLAGGED)
        + count(d.businessNeeds, (b) => b.moderationState === 'FLAGGED'),
      pendingClear: count(d.opportunities, (o) => o.moderationState === ModerationState.PENDING),
    }),
    introductions: Object.freeze({
      requested: count(d.intros, (i) => i.status === IntroStatus.REQUESTED),
      accepted: count(d.intros, (i) => i.status === IntroStatus.ACCEPTED),
      introduced: count(d.intros, (i) => i.status === IntroStatus.INTRODUCED),
      matched: count(d.intros, (i) => i.status === IntroStatus.MATCHED),
      needingAdmin: count(d.intros, (i) => i.adminReviewRequired === true),
    }),
    qualifications: Object.freeze({
      open: count(d.qualifications, (q) => q.status !== QualStatus.ENDED),
      inBoardReview: count(d.qualifications, (q) => q.status === QualStatus.BOARD_AGENCY_REVIEW),
      confirmed: count(d.qualifications, (q) => q.status === QualStatus.RELATIONSHIP_CONFIRMED),
    }),
    revenue: Object.freeze({
      events: d.billingEvents.length,
      presented: count(d.billingEvents, (b) => b.presentedAt !== null),
      // Nothing charges in the MVP; this stays 0 until a reviewed backend
      // flips it, and a non-zero here with payments flags off is an alarm.
      charged: count(d.billingEvents, (b) => b.charged === true),
    }),
    sources: coverage
      ? Object.freeze({
        total: coverage.total,
        live: coverage.live,
        deepLinkOnly: coverage.deepLinkOnly,
        planned: coverage.planned,
        unavailable: coverage.unavailable,
      })
      : null,
    // The operator's to-do, derived — the manual-broker workflow IS the MVP.
    actionQueue: Object.freeze([
      ...(count(d.reviewQueue, (r) => r.status === 'AWAITING_REVIEW') > 0
        ? [`Review ${count(d.reviewQueue, (r) => r.status === 'AWAITING_REVIEW')} flagged submission(s)`] : []),
      ...(count(d.opportunities, (o) => o.moderationState === ModerationState.PENDING) > 0
        ? [`Clear or reject ${count(d.opportunities, (o) => o.moderationState === ModerationState.PENDING)} pending opportunity(ies)`] : []),
      ...(count([...d.contractors, ...d.qualifiers], pendingVerification) > 0
        ? [`Verify ${count([...d.contractors, ...d.qualifiers], pendingVerification)} licence claim(s) against the issuing board`] : []),
      ...(count(d.intros, (i) => i.status === IntroStatus.ACCEPTED) > 0
        ? [`Make ${count(d.intros, (i) => i.status === IntroStatus.ACCEPTED)} introduction(s) — both sides said yes`] : []),
    ]),
    funnel,
    auditRows: d.audit.length,
  });
};
