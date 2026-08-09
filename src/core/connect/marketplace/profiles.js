// ─── MARKETPLACE PROFILES ────────────────────────────────────────────────────
// Three shapes, one rule.
//
//   ContractorProfile — "I want work"       (licensed contractor / business)
//   QualifierProfile  — "I can qualify"     (licensed individual, open to it)
//   BusinessNeed      — "I need a qualifier" (entity seeking a qualifying agent)
//
// THE RULE: every profile that claims a licence starts UNVERIFIED, and the
// constructor does not accept a verification argument at all. Verification is
// attached afterwards through verification.js `applyVerification()`, which
// demands source provenance. A client that constructs a profile with
// `verified: true` in the input finds that field silently absent from the
// output, because it was never read.
//
// Pure module: no React, no network, no storage.

import { Trade } from '../index.js';
import { initialVerification } from './verification.js';
import { PROJECT_TYPES, VALUE_RANGES } from './intents.js';

const isNonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;
const clean = (v, max = 300) => (isNonEmpty(v) ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const cleanState = (v) => (isNonEmpty(v) && /^[A-Za-z]{2}$/.test(v.trim()) ? v.trim().toUpperCase() : '');
const cleanList = (v, max = 30) => Object.freeze(
  (Array.isArray(v) ? v : []).filter(isNonEmpty).map((s) => clean(s, 80)).slice(0, max));
const VALUE_RANGE_IDS = VALUE_RANGES.map((r) => r.id);

let _n = 0;
const mintId = (prefix, now) => { _n = (_n + 1) % 10000; return `${prefix}_${now.toString(36)}_${_n.toString(36)}`; };

// ─── Contractor profile — "I want work" ──────────────────────────────────────

export const createContractorProfile = (input = {}, { now = Date.now() } = {}) => {
  const problems = [];
  const businessName = clean(input.businessName);
  const licenseHolder = clean(input.licenseHolder);
  const licenseNumber = clean(input.licenseNumber, 24).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const state = cleanState(input.state);

  if (!businessName) problems.push('businessName');
  if (!licenseHolder) problems.push('licenseHolder');
  if (!licenseNumber) problems.push('licenseNumber');
  if (!state) problems.push('state');
  if (!Object.prototype.hasOwnProperty.call(Trade, input.trade)) problems.push('trade');
  if (problems.length) return { ok: false, missing: Object.freeze(problems), profile: null };

  return {
    ok: true,
    missing: Object.freeze([]),
    profile: Object.freeze({
      id: mintId('con', now),
      kind: 'CONTRACTOR',
      businessName,
      licenseHolder,
      licenseNumber,
      classification: clean(input.classification, 40) || null,
      trade: input.trade,
      state,
      serviceCounties: cleanList(input.serviceCounties),
      projectTypes: Object.freeze((Array.isArray(input.projectTypes) ? input.projectTypes : [])
        .filter((t) => PROJECT_TYPES.includes(t))),
      projectSizeRanges: Object.freeze((Array.isArray(input.projectSizeRanges) ? input.projectSizeRanges : [])
        .filter((r) => VALUE_RANGE_IDS.includes(r))),
      specialties: cleanList(input.specialties),
      // Optional initially, per the brief. Recorded as text; never treated as
      // proof of coverage — the certificate is the proof, and we do not hold it.
      insuranceNote: clean(input.insuranceNote, 300) || null,
      website: clean(input.website, 200) || null,
      phone: clean(input.phone, 30) || null,
      email: clean(input.email, 200) || null,
      createdAt: new Date(now).toISOString(),
      // Not an input. Ever.
      verification: initialVerification(),
    }),
  };
};

// ─── Qualifier profile — "I can qualify" ─────────────────────────────────────

export const createQualifierProfile = (input = {}, { now = Date.now() } = {}) => {
  const problems = [];
  const name = clean(input.name);
  const licenseNumber = clean(input.licenseNumber, 24).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const state = cleanState(input.state);

  if (!name) problems.push('name');
  if (!licenseNumber) problems.push('licenseNumber');
  if (!state) problems.push('state');
  if (problems.length) return { ok: false, missing: Object.freeze(problems), profile: null };

  return {
    ok: true,
    missing: Object.freeze([]),
    profile: Object.freeze({
      id: mintId('qal', now),
      kind: 'QUALIFIER',
      name,
      licenseNumber,
      classifications: cleanList(input.classifications, 10),
      state,
      // What they SAY. The board's record is what counts, and verification
      // reads that separately.
      statedActive: input.statedActive === true,
      businessesCurrentlyQualified: cleanList(input.businessesCurrentlyQualified, 10),
      openToAdditional: input.openToAdditional === true,
      counties: cleanList(input.counties),
      industries: cleanList(input.industries, 15),
      experienceYears: Number.isFinite(input.experienceYears)
        ? Math.max(0, Math.min(60, Math.round(input.experienceYears))) : null,
      expectedInvolvement: clean(input.expectedInvolvement, 800) || null,
      compensationExpectation: clean(input.compensationExpectation, 200) || null,
      availability: clean(input.availability, 200) || null,
      preferredCompanySize: clean(input.preferredCompanySize, 100) || null,
      createdAt: new Date(now).toISOString(),
      verification: initialVerification(),
    }),
  };
};

// ─── Business need — "I need a qualifier" ────────────────────────────────────

export const createBusinessNeed = (input = {}, { now = Date.now() } = {}) => {
  const problems = [];
  const legalName = clean(input.legalName);
  const state = cleanState(input.state);

  if (!legalName) problems.push('legalName');
  if (!state) problems.push('state');
  if (!Object.prototype.hasOwnProperty.call(Trade, input.trade)) problems.push('trade');
  if (!isNonEmpty(input.reasonQualifierNeeded)) problems.push('reasonQualifierNeeded');
  // The oversight expectation is required on purpose: an intake that never
  // asks "what supervision are you expecting?" is an intake optimised for the
  // arrangement this product refuses to broker.
  if (!isNonEmpty(input.expectedOversight)) problems.push('expectedOversight');
  if (problems.length) return { ok: false, missing: Object.freeze(problems), profile: null };

  return {
    ok: true,
    missing: Object.freeze([]),
    profile: Object.freeze({
      id: mintId('biz', now),
      kind: 'BUSINESS_NEED',
      legalName,
      entityType: clean(input.entityType, 60) || null,
      state,
      trade: input.trade,
      classificationSought: clean(input.classificationSought, 60) || null,
      qualifierNeed: input.qualifierNeed === 'SECONDARY' ? 'SECONDARY'
        : input.qualifierNeed === 'PRIMARY' ? 'PRIMARY' : 'UNKNOWN',
      businessAgeYears: Number.isFinite(input.businessAgeYears)
        ? Math.max(0, Math.min(100, Math.round(input.businessAgeYears))) : null,
      approxAnnualVolume: VALUE_RANGE_IDS.includes(input.approxAnnualVolume) ? input.approxAnnualVolume : 'UNKNOWN',
      projectTypes: Object.freeze((Array.isArray(input.projectTypes) ? input.projectTypes : [])
        .filter((t) => PROJECT_TYPES.includes(t))),
      counties: cleanList(input.counties),
      expectedCompensation: clean(input.expectedCompensation, 200) || null,
      ownershipStructure: clean(input.ownershipStructure, 800) || null,
      holdsPermitsOrContracts: input.holdsPermitsOrContracts === true,
      insuranceStatus: clean(input.insuranceStatus, 200) || null,
      reasonQualifierNeeded: clean(input.reasonQualifierNeeded, 1000),
      expectedOversight: clean(input.expectedOversight, 1000),
      createdAt: new Date(now).toISOString(),
      // A business does not claim a licence, but its submission still passes
      // through moderation before it is shown to any qualifier.
      moderationState: 'PENDING',
    }),
  };
};

/** Attach a new verification state to a profile. The only door in. */
export const withVerification = (profile, nextVerification) => {
  if (!profile || !nextVerification) return profile ?? null;
  return Object.freeze({ ...profile, verification: nextVerification });
};
