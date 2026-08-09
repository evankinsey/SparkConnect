// ─── MATCHING ────────────────────────────────────────────────────────────────
// Deterministic, and proud of it.
//
// Two stages, and the order is the compliance model:
//
//   1. ELIGIBILITY — hard rules. Wrong trade, unverified licence, inactive
//      status, wrong state: OUT, with the reason recorded. No score can buy
//      an ineligible candidate back in. This is where "never let AI override
//      licensing requirements" is enforced — there is no AI in this file, and
//      anything that later summarises matches receives only candidates that
//      already passed these rules.
//
//   2. SCORE — soft fit among the eligible: county overlap, project type,
//      size range, specialties. Points are additive and visible per-factor,
//      so an admin can read WHY a candidate ranked where it did.
//
// Pure module: no React, no network, no storage, no randomness.

import { isActiveVerified } from './verification.js';
import { ModerationState } from './opportunity.js';

// ─── Opportunity → contractor ────────────────────────────────────────────────

/**
 * Hard eligibility for a contractor against an opportunity.
 * Returns { eligible, reasons } — reasons name every failed rule, because a
 * silent filter is indistinguishable from a broken one.
 */
export const contractorEligibility = (opportunity, contractor) => {
  const reasons = [];
  if (!opportunity || !contractor) return { eligible: false, reasons: Object.freeze(['MISSING_INPUT']) };

  if (opportunity.moderationState !== ModerationState.CLEARED) reasons.push('OPPORTUNITY_NOT_CLEARED');
  if (contractor.trade !== opportunity.trade) reasons.push('WRONG_TRADE');
  if (contractor.state !== opportunity.jurisdiction?.state) reasons.push('WRONG_STATE');
  // The licence rule. UNVERIFIED is not "probably fine" — it is out until the
  // board's record has been read. VERIFIED_INACTIVE / EXPIRED are out flatly.
  if (!isActiveVerified(contractor.verification?.status)) reasons.push('LICENSE_NOT_VERIFIED_ACTIVE');

  return { eligible: reasons.length === 0, reasons: Object.freeze(reasons) };
};

const countyMatch = (counties, county) => {
  if (!county) return false;
  const want = county.toLowerCase();
  return (counties ?? []).some((c) => c.toLowerCase() === want);
};

/**
 * Score an ELIGIBLE contractor. Factors are named and additive; the result
 * carries the breakdown so ranking is auditable, not vibes.
 */
export const scoreContractor = (opportunity, contractor) => {
  const factors = [];
  const add = (id, points, note) => factors.push(Object.freeze({ id, points, note }));

  if (countyMatch(contractor.serviceCounties, opportunity.jurisdiction?.county)) {
    add('county', 30, 'Serves the project county');
  } else if ((contractor.serviceCounties ?? []).length === 0) {
    add('county', 10, 'No counties declared — statewide assumed, weakly');
  } else {
    add('county', 0, 'Project county not in declared service area');
  }

  if ((contractor.projectTypes ?? []).includes(opportunity.projectType)) {
    add('project_type', 20, `Works ${opportunity.projectType.toLowerCase()}`);
  }
  if ((contractor.projectSizeRanges ?? []).includes(opportunity.estimatedValueRange)) {
    add('size', 20, 'Project size inside declared range');
  }

  const desc = String(opportunity.description ?? '').toLowerCase();
  const hits = (contractor.specialties ?? []).filter((s) => desc.includes(s.toLowerCase()));
  if (hits.length) add('specialty', Math.min(20, hits.length * 10), `Specialty match: ${hits.join(', ')}`);

  if (contractor.classification) add('classification_declared', 5, 'Licence class on file');
  if (contractor.insuranceNote) add('insurance_noted', 5, 'Insurance details provided (not proof of coverage)');

  const total = factors.reduce((sum, f) => sum + f.points, 0);
  return Object.freeze({ total, factors: Object.freeze(factors) });
};

/**
 * Rank contractors for one opportunity.
 * Ineligible candidates are returned separately WITH their reasons — the
 * admin screen shows both lists, because "why is nobody matching" is the
 * first question a marketplace operator asks.
 */
export const matchContractors = (opportunity, contractors = []) => {
  const eligible = [];
  const ineligible = [];
  for (const c of contractors) {
    const e = contractorEligibility(opportunity, c);
    if (e.eligible) {
      eligible.push({ contractor: c, score: scoreContractor(opportunity, c) });
    } else {
      ineligible.push(Object.freeze({ contractorId: c?.id ?? null, reasons: e.reasons }));
    }
  }
  eligible.sort((a, b) => b.score.total - a.score.total
    // Deterministic tie-break so the same inputs always rank the same way.
    || String(a.contractor.id).localeCompare(String(b.contractor.id)));
  return Object.freeze({
    opportunityId: opportunity?.id ?? null,
    candidates: Object.freeze(eligible.map((e) => Object.freeze({
      contractorId: e.contractor.id,
      businessName: e.contractor.businessName,
      score: e.score,
    }))),
    ineligible: Object.freeze(ineligible),
  });
};

// ─── Business → qualifier ────────────────────────────────────────────────────

export const qualifierEligibility = (businessNeed, qualifier) => {
  const reasons = [];
  if (!businessNeed || !qualifier) return { eligible: false, reasons: Object.freeze(['MISSING_INPUT']) };

  if (businessNeed.moderationState !== 'CLEARED') reasons.push('BUSINESS_NEED_NOT_CLEARED');
  if (qualifier.state !== businessNeed.state) reasons.push('WRONG_STATE');
  if (!isActiveVerified(qualifier.verification?.status)) reasons.push('LICENSE_NOT_VERIFIED_ACTIVE');
  if (!qualifier.openToAdditional && (qualifier.businessesCurrentlyQualified ?? []).length > 0) {
    reasons.push('NOT_OPEN_TO_ADDITIONAL');
  }
  if (businessNeed.classificationSought
      && (qualifier.classifications ?? []).length > 0
      && !qualifier.classifications.some((c) =>
        c.toLowerCase().includes(businessNeed.classificationSought.toLowerCase())
        || businessNeed.classificationSought.toLowerCase().includes(c.toLowerCase()))) {
    reasons.push('CLASSIFICATION_MISMATCH');
  }
  return { eligible: reasons.length === 0, reasons: Object.freeze(reasons) };
};

export const scoreQualifier = (businessNeed, qualifier) => {
  const factors = [];
  const add = (id, points, note) => factors.push(Object.freeze({ id, points, note }));

  const overlap = (businessNeed.counties ?? [])
    .filter((c) => (qualifier.counties ?? []).map((q) => q.toLowerCase()).includes(c.toLowerCase()));
  if (overlap.length) add('geography', 25, `County overlap: ${overlap.join(', ')}`);
  else if ((qualifier.counties ?? []).length === 0) add('geography', 10, 'No counties declared');

  // Fewer entities already qualified scores higher: boards weigh supervision
  // capacity, and so does this — visibly.
  const load = (qualifier.businessesCurrentlyQualified ?? []).length;
  add('qualification_load', Math.max(0, 20 - load * 10),
    load === 0 ? 'Qualifies no other entity' : `Already qualifies ${load}`);

  const industries = (qualifier.industries ?? []).map((i) => i.toLowerCase());
  if ((businessNeed.projectTypes ?? []).some((t) => industries.includes(t.toLowerCase()))
      || industries.includes(String(businessNeed.trade ?? '').toLowerCase())) {
    add('industry', 15, 'Industry fit');
  }

  if (qualifier.expectedInvolvement) add('oversight_stated', 15, 'Describes real expected involvement');
  if (qualifier.compensationExpectation && businessNeed.expectedCompensation) {
    add('compensation_declared', 10, 'Both sides stated compensation expectations');
  }
  if (Number.isFinite(qualifier.experienceYears) && qualifier.experienceYears >= 5) {
    add('experience', 10, `${qualifier.experienceYears} years stated`);
  }

  const total = factors.reduce((s, f) => s + f.points, 0);
  return Object.freeze({ total, factors: Object.freeze(factors) });
};

export const matchQualifiers = (businessNeed, qualifiers = []) => {
  const eligible = [];
  const ineligible = [];
  for (const q of qualifiers) {
    const e = qualifierEligibility(businessNeed, q);
    if (e.eligible) eligible.push({ qualifier: q, score: scoreQualifier(businessNeed, q) });
    else ineligible.push(Object.freeze({ qualifierId: q?.id ?? null, reasons: e.reasons }));
  }
  eligible.sort((a, b) => b.score.total - a.score.total
    || String(a.qualifier.id).localeCompare(String(b.qualifier.id)));
  return Object.freeze({
    businessNeedId: businessNeed?.id ?? null,
    candidates: Object.freeze(eligible.map((e) => Object.freeze({
      qualifierId: e.qualifier.id,
      name: e.qualifier.name,
      score: e.score,
    }))),
    ineligible: Object.freeze(ineligible),
  });
};

/**
 * The sentence any AI summariser must live inside. Exported so the screen can
 * show it and the test can pin it: summaries describe candidates that already
 * passed the rules; nothing generative decides eligibility.
 */
export const MATCHING_POLICY =
  'Eligibility is decided by rules you can read: trade, jurisdiction, and a licence the issuing '
  + 'board says is active. Scores order the eligible; they never overrule the rules, and neither '
  + 'does anything else.';
