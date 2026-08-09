// ─── CONTRACTOR CONNECT MARKETPLACE TESTS ────────────────────────────────────
// The guarantees, in order of how much damage losing them would do:
//
//   1. VERIFIED cannot be self-awarded. Not by a profile constructor, not by
//      a store write, not by a hand-rolled object. Evidence or nothing.
//   2. Licence-rental language is flagged into review, and moderation gates
//      matching — a flagged submission cannot reach a contractor.
//   3. An unverified licence is ineligible to match, and no score overrides
//      eligibility.
//   4. Mutual interest never equals a legally active qualifying relationship.
//   5. Money stays off: fee flags are hard-locked, billing events never charge.
//   6. Copy promises no outcome, and analytics carry no content.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  Intent, INTENT_CARDS, HAVE_JOB_QUESTIONS, HAVE_JOB_REQUIRED_IDS,
  UNLICENSED_SUBMITTER_NOTICE, QUALIFIER_NEED_NOTICE, CAN_QUALIFY_NOTICE,
  auditIntentCopy, UTILITY_ROW,
} from '../src/core/connect/marketplace/intents.js';
import {
  LicenseVerification, verificationFromSource, applyVerification, initialVerification,
  deriveStatus, sourceUnavailable, isActiveVerified, verificationBadge, fingerprint,
  routeToManualReview, VERIFICATION_LABEL,
} from '../src/core/connect/marketplace/verification.js';
import {
  createOpportunity, validateOpportunityDraft, submitterNotice, setModeration, setMatchState,
  ModerationState, MatchState, SubmitterLicense, VerificationState,
} from '../src/core/connect/marketplace/opportunity.js';
import {
  createContractorProfile, createQualifierProfile, createBusinessNeed, withVerification,
} from '../src/core/connect/marketplace/profiles.js';
import { screenSubmission, looksDuplicate, reviewItem, RISK_IDS } from '../src/core/connect/marketplace/moderation.js';
import {
  contractorEligibility, scoreContractor, matchContractors,
  qualifierEligibility, matchQualifiers, MATCHING_POLICY,
} from '../src/core/connect/marketplace/matching.js';
import {
  createIntroRequest, advanceIntro, IntroStatus, hasMutualInterest, markForAdminReview,
} from '../src/core/connect/marketplace/introductions.js';
import {
  createQualification, advanceQualification, QualStatus, CONFIRMED_CAVEAT, QUAL_STATUS_LABEL,
} from '../src/core/connect/marketplace/qualification.js';
import {
  billingEvent, BillingEventKind, priceVariantFor, INTRO_FEE_VARIANTS_CENTS,
  FREE_ACTIONS, canPresentFee, PRICING_DISCLAIMER,
} from '../src/core/connect/marketplace/billing.js';
import { createMarketplaceStore, Role } from '../src/core/connect/marketplace/store.js';
import { warRoom } from '../src/core/connect/marketplace/admin.js';
import { CONNECT_EVENTS, CONNECT_SAFE_PROPS } from '../src/core/connect/marketplace/analytics.js';
import { MARKETPLACE_DISCLAIMER, FLORIDA_NOTES, LEGAL_REVIEW, auditLegalCopy } from '../src/core/connect/marketplace/legal.js';
import { findOutcomePromise } from '../src/core/connect/index.js';
import { sourceRecord, Confidence } from '../src/core/connect/sources.js';
import { DEFAULTS, HARD_LOCKED_OFF, resolve, sanitize } from '../src/flags/core.js';
import { ALLOWED_PROPERTIES, scrubProperties } from '../src/privacy/scrub.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────
// Test-only data. Nothing here ships: production records can only enter
// through the store, and the store cannot mint verification without a source.

const DBPR_SOURCE = {
  sourceId: 'fl-dbpr-license',
  sourceName: 'Florida DBPR — Licensee Search',
  sourceUrl: 'https://www.myfloridalicense.com/wl11.asp',
  jurisdictionId: 'us-fl',
  retrievedAt: '2026-08-09T12:00:00.000Z',
  confidence: Confidence.OFFICIAL,
  payload: { status: 'Current, Active', name: 'TEST FIXTURE' },
};

const goodDraft = () => ({
  trade: 'ELECTRICAL', state: 'fl', county: 'Hillsborough', city: 'Tampa',
  projectType: 'RESIDENTIAL', estimatedValueRange: 'R5K_25K',
  description: 'Panel change and service upgrade on a 1960s house, meter can rusted through.',
  plansAvailable: false, photosAvailable: true, permitLikely: 'yes',
  howObtained: 'Neighbor asked me after I fixed their outlet.',
  submitterRole: 'JOURNEYMAN', holdsRequiredLicense: false,
});

const contractorInput = () => ({
  businessName: 'Bright Sparks LLC', licenseHolder: 'Pat Doe', licenseNumber: 'ec13001234',
  classification: 'Certified Electrical Contractor', trade: 'ELECTRICAL', state: 'FL',
  serviceCounties: ['Hillsborough', 'Pinellas'], projectTypes: ['RESIDENTIAL'],
  projectSizeRanges: ['R5K_25K'], specialties: ['panel', 'service upgrade'],
});

const verifiedActive = () => applyVerification(initialVerification(), verificationFromSource({
  source: DBPR_SOURCE, licenseNumber: 'EC13001234',
  officialName: 'PAT DOE', licenseStatusText: 'Current, Active',
})).next;

// ─── 1. Verified cannot be self-awarded ──────────────────────────────────────

test('a profile constructor ignores any verification the caller supplies', () => {
  const out = createContractorProfile({ ...contractorInput(), verification: { status: 'VERIFIED_ACTIVE' }, verified: true });
  assert.equal(out.ok, true);
  assert.equal(out.profile.verification.status, LicenseVerification.UNVERIFIED,
    'a client-supplied verified flag must never survive construction');
  assert.equal(out.profile.verified, undefined);

  const q = createQualifierProfile({ name: 'Pat', licenseNumber: 'EC1', state: 'FL', verification: { status: 'VERIFIED_ACTIVE' } });
  assert.equal(q.profile.verification.status, LicenseVerification.UNVERIFIED);
});

test('an evidenced status without source provenance is refused', () => {
  const r = applyVerification(initialVerification(), { status: 'VERIFIED_ACTIVE' });
  assert.equal(r.ok, false);
  assert.match(r.reason, /provenance/);
  assert.equal(r.next.status, LicenseVerification.UNVERIFIED, 'the state must not move');

  // A hand-rolled source block missing retrievedAt is also refused.
  const r2 = applyVerification(initialVerification(), {
    status: 'VERIFIED_ACTIVE', source: { url: 'https://x.gov', name: 'X' },
  });
  assert.equal(r2.ok, false);
});

test('verification derives its status from the source, never from an argument', () => {
  const v = verificationFromSource({
    source: DBPR_SOURCE, licenseNumber: 'ec 13-001234',
    officialName: 'PAT DOE', licenseStatusText: 'Current, Active',
  });
  assert.equal(v.status, LicenseVerification.VERIFIED_ACTIVE);
  assert.equal(v.licenseNumber, 'EC 13-001234'.trim().toUpperCase());
  assert.equal(v.source.name, 'Florida DBPR — Licensee Search');
  assert.match(v.source.url, /^https:\/\//);
  assert.ok(v.rawSourceRef.startsWith('fnv1a:'), 'the raw payload is fingerprinted for disputes');

  // A fake source object that never passed sourceRecord is refused wholesale.
  assert.equal(verificationFromSource({
    source: { sourceUrl: 'https://x.gov' }, licenseNumber: 'EC1',
  }), null);
  assert.equal(verificationFromSource({ source: DBPR_SOURCE, licenseNumber: '' }), null);
});

test('the source status words map conservatively — unknown never becomes active', () => {
  assert.equal(deriveStatus('Current, Active', 'PAT'), LicenseVerification.VERIFIED_ACTIVE);
  assert.equal(deriveStatus('Inactive', 'PAT'), LicenseVerification.VERIFIED_INACTIVE);
  assert.equal(deriveStatus('Null and Void', 'PAT'), LicenseVerification.VERIFIED_EXPIRED);
  assert.equal(deriveStatus('Delinquent', 'PAT'), LicenseVerification.VERIFIED_EXPIRED);
  assert.equal(deriveStatus('Probation, something odd', 'PAT'), LicenseVerification.POSSIBLE_MATCH,
    'an unrecognised status goes to a person, not to ACTIVE');
  assert.equal(deriveStatus(null, 'PAT'), LicenseVerification.SOURCE_MATCH_FOUND);
  assert.equal(deriveStatus(null, null), LicenseVerification.POSSIBLE_MATCH);
});

test('source unavailable says so and hands the user the official route', () => {
  const s = sourceUnavailable({ sourceName: 'DBPR', portalUrl: 'https://www.myfloridalicense.com/', at: '2026-08-09' });
  assert.equal(s.status, LicenseVerification.SOURCE_UNAVAILABLE);
  assert.match(s.userAction, /official record/i);
});

test('the badge renders provenance, and Active always carries its caveat', () => {
  const badge = verificationBadge(verifiedActive(), Date.parse('2026-08-09T13:00:00Z'));
  assert.equal(badge.active, true);
  assert.equal(badge.sourceName, 'Florida DBPR — Licensee Search');
  assert.ok(badge.freshness.label);
  assert.match(badge.caveat, /official record/i);

  const unv = verificationBadge(null);
  assert.equal(unv.active, false);
  assert.equal(unv.label, 'Not yet checked');
  assert.equal(unv.caveat, null);
});

test('every verification status has a label that does not overclaim', () => {
  for (const s of Object.values(LicenseVerification)) {
    assert.ok(VERIFICATION_LABEL[s], `${s} has no label`);
    assert.ok(!/guarantee|certif/i.test(VERIFICATION_LABEL[s]));
  }
  assert.notEqual(fingerprint('a'), fingerprint('b'));
  assert.equal(fingerprint('a'), fingerprint('a'));
});

test('manual review is reachable without evidence, because it claims none', () => {
  const r = routeToManualReview(initialVerification(), { reason: 'name mismatch' });
  assert.equal(r.ok, true);
  assert.equal(r.next.status, LicenseVerification.MANUAL_REVIEW);
  assert.equal(r.next.history.length, 1);
});

// ─── 2. Intake ───────────────────────────────────────────────────────────────

test('the four intents exist, with the utility row beneath', () => {
  assert.deepEqual(INTENT_CARDS.map((c) => c.intent),
    [Intent.HAVE_JOB, Intent.NEED_QUALIFIER, Intent.WANT_WORK, Intent.CAN_QUALIFY]);
  assert.deepEqual(UTILITY_ROW.map((u) => u.id), ['verify_license', 'permit_assistant', 'saved']);
});

test('the HAVE_JOB intake asks everything the brief requires', () => {
  const ids = HAVE_JOB_QUESTIONS.map((q) => q.id);
  for (const want of ['trade', 'state', 'county', 'projectType', 'estimatedValueRange',
    'description', 'plansAvailable', 'photosAvailable', 'desiredStart', 'permitLikely',
    'howObtained', 'submitterRole', 'holdsRequiredLicense']) {
    assert.ok(ids.includes(want), `intake dropped ${want}`);
  }
  assert.ok(HAVE_JOB_REQUIRED_IDS.includes('holdsRequiredLicense'),
    'the licence question is the compliance posture and cannot be optional');
  const permit = HAVE_JOB_QUESTIONS.find((q) => q.id === 'permitLikely');
  assert.equal(permit.allowUnknown, true, 'the brief allows "unknown" for permits');
});

test('an unlicensed submitter gets the exact routing language, and is never the contractor', () => {
  const { ok, opportunity } = createOpportunity(goodDraft(), { now: Date.parse('2026-08-09T12:00:00Z') });
  assert.equal(ok, true);
  assert.equal(opportunity.licenseStatusOfSubmitter, SubmitterLicense.DOES_NOT_HOLD);
  assert.equal(submitterNotice(opportunity), UNLICENSED_SUBMITTER_NOTICE);
  assert.match(UNLICENSED_SUBMITTER_NOTICE, /does not authorize you to contract/);

  // Every brief-required field landed on the model.
  assert.equal(opportunity.trade, 'ELECTRICAL');
  assert.equal(opportunity.jurisdiction.state, 'FL');
  assert.equal(opportunity.jurisdiction.county, 'Hillsborough');
  assert.equal(opportunity.projectType, 'RESIDENTIAL');
  assert.equal(opportunity.estimatedValueRange, 'R5K_25K');
  assert.equal(opportunity.sourceUserRole, 'JOURNEYMAN');
  assert.equal(opportunity.permitLikely, 'YES');
  assert.equal(opportunity.verificationState, VerificationState.UNREVIEWED);
  assert.equal(opportunity.moderationState, ModerationState.PENDING);
  assert.equal(opportunity.matchState, MatchState.UNMATCHED);
  assert.ok(opportunity.id.startsWith('opp_'));
  assert.ok(opportunity.createdAt);

  // A licensed submitter is told the check protects them too.
  const licensed = createOpportunity({ ...goodDraft(), holdsRequiredLicense: true }).opportunity;
  assert.equal(licensed.licenseStatusOfSubmitter, SubmitterLicense.HOLDS_REQUIRED);
  assert.match(submitterNotice(licensed), /checked against the issuing board/);
});

test('an incomplete or nonsense draft is refused with the gaps named', () => {
  const v = validateOpportunityDraft({ trade: 'MAGIC', state: 'Florida' });
  assert.equal(v.ok, false);
  assert.ok(v.missing.includes('description'));
  assert.ok(v.problems.some((p) => /Unknown trade/.test(p)));
  assert.ok(v.problems.some((p) => /two-letter/.test(p)));
  assert.equal(createOpportunity({}).ok, false);
});

test('profiles collect what the brief asks and normalise the licence number', () => {
  const c = createContractorProfile(contractorInput()).profile;
  assert.equal(c.licenseNumber, 'EC13001234');
  assert.deepEqual([...c.serviceCounties], ['Hillsborough', 'Pinellas']);

  const q = createQualifierProfile({
    name: 'Pat Doe', licenseNumber: 'ec 13-001234', state: 'FL',
    businessesCurrentlyQualified: ['One LLC'], openToAdditional: true, experienceYears: 12,
  }).profile;
  assert.equal(q.licenseNumber, 'EC13001234');
  assert.equal(q.experienceYears, 12);

  const missing = createBusinessNeed({ legalName: 'Biz LLC', state: 'FL', trade: 'ELECTRICAL' });
  assert.equal(missing.ok, false);
  assert.ok(missing.missing.includes('expectedOversight'),
    'the oversight question is required — an intake that never asks invites the wrong arrangement');
  assert.ok(missing.missing.includes('reasonQualifierNeeded'));

  const b = createBusinessNeed({
    legalName: 'Biz LLC', state: 'FL', trade: 'ELECTRICAL',
    reasonQualifierNeeded: 'Our qualifier retired.',
    expectedOversight: 'Weekly site visits, countersigns permits, reviews the books monthly.',
  }).profile;
  assert.equal(b.moderationState, 'PENDING');
});

// ─── 3. Moderation ───────────────────────────────────────────────────────────

test('licence-rental language is flagged into review, never auto-accused', () => {
  const cases = [
    ['need someone to lend their license for a big job', 'license_lending'],
    ['can you pull the permit under your name', 'permit_under_your_name'],
    ["you don't need to supervise, we handle everything", 'no_supervision'],
    ['cash only, off the books, no inspections', 'cash_only_evasive'],
    ['we can skip the permit if we do it on a weekend', 'skip_permit'],
    ['just say you are licensed if they ask', 'present_as_licensed'],
  ];
  for (const [text, expected] of cases) {
    const opp = createOpportunity({ ...goodDraft(), description: `Panel change. ${text}` }).opportunity;
    const s = screenSubmission(opp);
    assert.equal(s.clean, false, `not flagged: "${text}"`);
    assert.ok(s.flags.some((f) => f.id === expected), `expected ${expected} for "${text}"`);
    assert.equal(s.route, 'MANUAL_REVIEW');
    // The submitter-facing message accuses nobody.
    assert.ok(!/violat|illegal|fraud|reject/i.test(s.submitterMessage));
  }
  assert.ok(RISK_IDS.length >= 6);
});

test('a clean submission passes and says what happens next', () => {
  const s = screenSubmission(createOpportunity(goodDraft()).opportunity);
  assert.equal(s.clean, true);
  assert.equal(s.route, 'CLEAR_QUEUE');
  assert.match(s.submitterMessage, /review/i);
});

test('duplicates are suggested, not decided', () => {
  const a = createOpportunity(goodDraft()).opportunity;
  const b = createOpportunity(goodDraft()).opportunity;
  const c = createOpportunity({ ...goodDraft(), county: 'Pinellas', description: 'Completely different dock wiring job with new sub feed.' }).opportunity;
  assert.equal(looksDuplicate(a, b), true);
  assert.equal(looksDuplicate(a, c), false);
  assert.equal(looksDuplicate(a, a), false, 'a record is not its own duplicate');

  const item = reviewItem(a, screenSubmission(a), { at: 'now' });
  assert.equal(item.status, 'AWAITING_REVIEW');
  assert.match(item.guidance, /explain the compliant route/i);
});

test('moderation clearance needs a named reviewer, and gates matching', () => {
  const opp = createOpportunity(goodDraft()).opportunity;

  const anon = setModeration(opp, ModerationState.CLEARED);
  assert.equal(anon.ok, false, 'a submission cannot clear itself');

  const blocked = setMatchState(opp, MatchState.CANDIDATES_FOUND);
  assert.equal(blocked.ok, false, 'nothing moves toward a match before moderation');

  const cleared = setModeration(opp, ModerationState.CLEARED, { by: 'evan', at: 'now' }).opportunity;
  const moved = setMatchState(cleared, MatchState.CANDIDATES_FOUND);
  assert.equal(moved.ok, true);
});

// ─── 4. Matching ─────────────────────────────────────────────────────────────

const clearedOpp = () => setModeration(
  createOpportunity(goodDraft()).opportunity, ModerationState.CLEARED, { by: 'evan' }).opportunity;

test('an unverified licence is ineligible, and the reason says so', () => {
  const opp = clearedOpp();
  const raw = createContractorProfile(contractorInput()).profile;
  const e = contractorEligibility(opp, raw);
  assert.equal(e.eligible, false);
  assert.ok(e.reasons.includes('LICENSE_NOT_VERIFIED_ACTIVE'));

  // Verified-инactive is just as out.
  const inactive = withVerification(raw, applyVerification(initialVerification(), verificationFromSource({
    source: DBPR_SOURCE, licenseNumber: 'EC13001234', officialName: 'PAT', licenseStatusText: 'Inactive',
  })).next);
  assert.equal(contractorEligibility(opp, inactive).eligible, false);
});

test('no score can buy back an ineligible candidate', () => {
  const opp = clearedOpp();
  // A perfect-fit contractor in the wrong trade…
  const wrongTrade = withVerification(
    createContractorProfile({ ...contractorInput(), trade: 'HVAC' }).profile, verifiedActive());
  const out = matchContractors(opp, [wrongTrade]);
  assert.equal(out.candidates.length, 0);
  assert.equal(out.ineligible.length, 1);
  assert.ok(out.ineligible[0].reasons.includes('WRONG_TRADE'));
});

test('among the eligible, the scoring is deterministic and auditable', () => {
  const opp = clearedOpp();
  const near = withVerification(createContractorProfile(contractorInput()).profile, verifiedActive());
  const far = withVerification(createContractorProfile({
    ...contractorInput(), businessName: 'Far Away Electric', serviceCounties: ['Miami-Dade'],
    specialties: [], projectTypes: ['COMMERCIAL'], projectSizeRanges: [],
  }).profile, verifiedActive());

  const out = matchContractors(opp, [far, near]);
  assert.equal(out.candidates.length, 2);
  assert.equal(out.candidates[0].businessName, 'Bright Sparks LLC', 'county+type+size+specialty wins');
  assert.ok(out.candidates[0].score.total > out.candidates[1].score.total);
  assert.ok(out.candidates[0].score.factors.every((f) => f.id && typeof f.points === 'number' && f.note));

  // Same input, same order — twice.
  assert.deepEqual(matchContractors(opp, [far, near]), out);
  assert.match(MATCHING_POLICY, /never overrule/);
});

test('qualifier matching enforces state, licence and openness', () => {
  const need = { ...createBusinessNeed({
    legalName: 'Biz LLC', state: 'FL', trade: 'ELECTRICAL',
    counties: ['Hillsborough'],
    reasonQualifierNeeded: 'Growth — our founder is not licensed.',
    expectedOversight: 'Qualifier runs field supervision and signs off financials.',
  }).profile, moderationState: 'CLEARED' };

  const openQ = withVerification(createQualifierProfile({
    name: 'Open Pat', licenseNumber: 'EC1', state: 'FL', counties: ['Hillsborough'],
    openToAdditional: true, expectedInvolvement: 'Weekly visits', experienceYears: 10,
  }).profile, verifiedActive());
  const loadedNotOpen = withVerification(createQualifierProfile({
    name: 'Busy Sam', licenseNumber: 'EC2', state: 'FL',
    businessesCurrentlyQualified: ['A LLC', 'B LLC'], openToAdditional: false,
  }).profile, verifiedActive());
  const unverified = createQualifierProfile({
    name: 'New Kim', licenseNumber: 'EC3', state: 'FL', openToAdditional: true,
  }).profile;

  const out = matchQualifiers(need, [openQ, loadedNotOpen, unverified]);
  assert.equal(out.candidates.length, 1);
  assert.equal(out.candidates[0].name, 'Open Pat');
  const reasons = Object.fromEntries(out.ineligible.map((i) => [i.qualifierId, i.reasons]));
  assert.ok(Object.values(reasons).some((r) => r.includes('NOT_OPEN_TO_ADDITIONAL')));
  assert.ok(Object.values(reasons).some((r) => r.includes('LICENSE_NOT_VERIFIED_ACTIVE')));

  // An uncleared business need matches nobody.
  const dark = matchQualifiers({ ...need, moderationState: 'PENDING' }, [openQ]);
  assert.equal(dark.candidates.length, 0);
});

// ─── 5. Introductions ────────────────────────────────────────────────────────

test('introductions move one legal step at a time', () => {
  const { intro } = createIntroRequest({
    senderId: 'u1', recipientId: 'u2', subjectKind: 'OPPORTUNITY', subjectId: 'opp_1',
    message: 'Panel change in Tampa, are you taking work?',
  });
  assert.equal(intro.status, IntroStatus.REQUESTED);
  assert.equal(hasMutualInterest(intro), false);

  assert.equal(advanceIntro(intro, IntroStatus.MATCHED).ok, false, 'REQUESTED cannot leap to MATCHED');
  assert.equal(advanceIntro(intro, IntroStatus.INTRODUCED).ok, false, 'no introduction before acceptance');

  const accepted = advanceIntro(intro, IntroStatus.ACCEPTED, { by: 'u2' }).intro;
  assert.equal(hasMutualInterest(accepted), true);

  assert.equal(advanceIntro(accepted, IntroStatus.INTRODUCED).ok, false, 'the platform must be named');
  const introduced = advanceIntro(accepted, IntroStatus.INTRODUCED, { by: 'admin_evan' }).intro;
  const matched = advanceIntro(introduced, IntroStatus.MATCHED, { by: 'u1' }).intro;
  assert.equal(matched.status, IntroStatus.MATCHED);
  assert.equal(matched.events.length, 4, 'every transition is on the record');

  const flagged = markForAdminReview(matched, 'high value');
  assert.equal(flagged.adminReviewRequired, true);
});

test('a request without a subject or to yourself is refused', () => {
  assert.equal(createIntroRequest({ senderId: 'u1', recipientId: 'u1', subjectKind: 'OPPORTUNITY', subjectId: 'x' }).ok, false);
  assert.equal(createIntroRequest({ senderId: 'u1', recipientId: 'u2', subjectKind: 'SPAM', subjectId: 'x' }).ok, false);
  assert.equal(createIntroRequest({ senderId: 'u1', recipientId: 'u2', subjectKind: 'OPPORTUNITY', subjectId: '' }).ok, false);
});

// ─── 6. Qualifying relationships ─────────────────────────────────────────────

test('a pipeline cannot open on an unverified qualifier', () => {
  const r = createQualification({ businessNeedId: 'biz_1', qualifierId: 'qal_1', qualifierVerification: initialVerification() });
  assert.equal(r.ok, false);
  assert.match(r.reason, /issuing board/);
});

test('mutual interest is never a legally active relationship', () => {
  const { pipeline } = createQualification({
    businessNeedId: 'biz_1', qualifierId: 'qal_1', qualifierVerification: verifiedActive(),
  });
  let p = pipeline;
  assert.equal(p.status, QualStatus.INTEREST_PROFILE);

  p = advanceQualification(p, QualStatus.INTRO_REQUESTED).pipeline;
  p = advanceQualification(p, QualStatus.MUTUAL_INTEREST).pipeline;

  // The jump the brief forbids, refused with the reason spelled out.
  const jump = advanceQualification(p, QualStatus.RELATIONSHIP_CONFIRMED);
  assert.equal(jump.ok, false);
  assert.match(jump.reason, /board/i);

  p = advanceQualification(p, QualStatus.APPLICATION_REQUIRED).pipeline;
  p = advanceQualification(p, QualStatus.BOARD_AGENCY_REVIEW).pipeline;

  // Even in order, no board reference → no confirmation.
  const noRef = advanceQualification(p, QualStatus.RELATIONSHIP_CONFIRMED);
  assert.equal(noRef.ok, false);
  assert.match(noRef.reason, /not a licensing decision/);

  const done = advanceQualification(p, QualStatus.RELATIONSHIP_CONFIRMED, { boardReference: 'DBPR file 2026-1234' });
  assert.equal(done.ok, true);
  assert.equal(done.pipeline.boardReference, 'DBPR file 2026-1234');
  assert.match(CONFIRMED_CAVEAT, /not the licensing authority/);
  for (const s of Object.values(QualStatus)) assert.ok(QUAL_STATUS_LABEL[s], `${s} unlabeled`);

  // ENDED is reachable from anywhere — walking away must always be possible.
  assert.equal(advanceQualification(pipeline, QualStatus.ENDED).ok, true);
});

// ─── 7. Money stays off ──────────────────────────────────────────────────────

test('fee flags are hard-locked off and no remote payload can force them', () => {
  assert.ok(HARD_LOCKED_OFF.includes('matchFeesEnabled'));
  assert.ok(HARD_LOCKED_OFF.includes('marketplacePaymentsEnabled'));
  assert.equal(DEFAULTS.matchFeesEnabled, false);
  assert.equal(DEFAULTS.marketplacePaymentsEnabled, false);
  assert.equal(resolve('matchFeesEnabled', { remote: { matchFeesEnabled: true } }), false,
    'a compromised remote config must not light up a money path');
  assert.equal(canPresentFee((name) => resolve(name, { remote: { matchFeesEnabled: true } })), false);
});

test('the module itself ships on, with live-data and permit automation off', () => {
  assert.equal(DEFAULTS.contractorConnectEnabled, true);
  assert.equal(DEFAULTS.liveLicenseVerificationEnabled, false, 'no LIVE adapter exists; the flag says so');
  assert.equal(DEFAULTS.permitDataEnabled, false);
  assert.equal(DEFAULTS.opportunityMarketplaceEnabled, true);
  assert.equal(DEFAULTS.qualifierMarketplaceEnabled, true);
  assert.equal(DEFAULTS.introductionsEnabled, true);
  // sanitize still drops junk for the new names.
  assert.deepEqual(sanitize({ contractorConnectEnabled: 'yes' }), {});
});

test('billing events record without charging, and prices declare themselves experiments', () => {
  const e = billingEvent({ kind: BillingEventKind.OPPORTUNITY_MATCH_FEE, subjectId: 'opp_1', payerId: 'con_1', amountCents: 29900 });
  assert.equal(e.charged, false);
  assert.equal(e.presentedAt, null);
  assert.equal(billingEvent({ kind: 'MADE_UP', subjectId: 'x', payerId: 'y' }), null);

  const v = priceVariantFor('con_1');
  assert.ok(INTRO_FEE_VARIANTS_CENTS.includes(v.amountCents));
  assert.deepEqual(priceVariantFor('con_1'), v, 'assignment is deterministic');
  assert.match(v.disclaimer, /Not market-established/);
  assert.match(PRICING_DISCLAIMER, /nothing is charged/i);
  assert.deepEqual([...FREE_ACTIONS], [
    'post_opportunity', 'create_qualifier_profile', 'create_contractor_profile', 'request_initial_match',
  ]);
});

// ─── 8. The store: authorization, audit, no verified writes ──────────────────

const memoryStorage = () => {
  const m = new Map();
  return {
    getItem: async (k) => (m.has(k) ? m.get(k) : null),
    setItem: async (k, v) => { m.set(k, v); },
  };
};

test('the store scopes reads by owner and requires an actor for writes', async () => {
  const store = createMarketplaceStore(memoryStorage());
  const a = { id: 'user_a', role: Role.USER };
  const b = { id: 'user_b', role: Role.USER };

  assert.equal((await store.submitOpportunity(null, createOpportunity(goodDraft()).opportunity)).ok, false);

  await store.submitOpportunity(a, createOpportunity(goodDraft()).opportunity);
  await store.submitOpportunity(b, createOpportunity({ ...goodDraft(), description: 'Different dock feeder job with long run.' }).opportunity);

  const mineA = await store.readOwn(a);
  assert.equal(mineA.data.opportunities.length, 1, 'user A must not read user B');
  assert.equal((await store.adminSnapshot(a)).ok, false, 'a USER cannot take the admin snapshot');
  const admin = await store.adminSnapshot({ id: 'evan', role: Role.ADMIN });
  assert.equal(admin.data.opportunities.length, 2);
  assert.ok(admin.data.audit.length >= 2, 'every write left an audit row');
  assert.equal(store.syncState().mode, 'LOCAL_ONLY', 'the store says where the data actually lives');
});

test('a flagged submission is quarantined on write, and only an admin clears it', async () => {
  const store = createMarketplaceStore(memoryStorage());
  const user = { id: 'user_a', role: Role.USER };
  const bad = createOpportunity({
    ...goodDraft(),
    description: 'Big rewire, just need someone to lend their license for the permit.',
  }).opportunity;

  const res = await store.submitOpportunity(user, bad);
  assert.equal(res.ok, true, 'the submission is accepted — into review, not into the market');
  assert.equal(res.stored.moderationState, 'FLAGGED');
  assert.ok(res.screening.flags.length > 0);

  assert.equal((await store.decideModeration(user, bad.id, 'CLEARED')).ok, false, 'users cannot moderate');
  const cleared = await store.decideModeration({ id: 'evan', role: Role.ADMIN }, bad.id, 'REJECTED', 'licence-lending ask');
  assert.equal(cleared.ok, true);
  assert.equal(cleared.stored.moderationState, 'REJECTED');
});

test('the store discards caller-supplied verification and only admins can attach real outcomes', async () => {
  const store = createMarketplaceStore(memoryStorage());
  const user = { id: 'user_a', role: Role.USER };
  const forged = { ...createContractorProfile(contractorInput()).profile, verification: { status: 'VERIFIED_ACTIVE' } };

  const put = await store.submitProfile(user, forged);
  assert.equal(put.stored.verification.status, 'UNVERIFIED', 'the forgery did not survive the write');

  const applied = applyVerification(initialVerification(), verificationFromSource({
    source: DBPR_SOURCE, licenseNumber: 'EC13001234', officialName: 'PAT DOE', licenseStatusText: 'Current, Active',
  }));
  assert.equal((await store.applyProfileVerification(user, forged.id, applied)).ok, false, 'users cannot verify themselves');
  const ok = await store.applyProfileVerification({ id: 'evan', role: Role.ADMIN }, forged.id, applied);
  assert.equal(ok.ok, true);
  assert.equal(ok.stored.verification.status, 'VERIFIED_ACTIVE');
  assert.equal((await store.applyProfileVerification({ id: 'evan', role: Role.ADMIN }, forged.id, { ok: true, next: null })).ok, false);
});

// ─── 9. The war room ─────────────────────────────────────────────────────────

test('the war room aggregates bluntly and derives the operator to-do', async () => {
  const store = createMarketplaceStore(memoryStorage());
  const user = { id: 'user_a', role: Role.USER };
  const adminActor = { id: 'evan', role: Role.ADMIN };

  await store.submitOpportunity(user, createOpportunity(goodDraft()).opportunity);
  await store.submitProfile(user, createContractorProfile(contractorInput()).profile);
  const { intro } = createIntroRequest({ senderId: 'u1', recipientId: 'u2', subjectKind: 'OPPORTUNITY', subjectId: 'opp_x' });
  await store.putIntro(user, advanceIntro(intro, IntroStatus.ACCEPTED, { by: 'u2' }).intro);

  const snap = await store.adminSnapshot(adminActor);
  const room = warRoom(snap.data, { now: Date.now() });
  assert.equal(room.totals.opportunities, 1);
  assert.equal(room.totals.contractors, 1);
  assert.equal(room.verification.verifiedContractors, 0, 'nobody is verified until a source says so');
  assert.equal(room.verification.pending, 1);
  assert.equal(room.introductions.accepted, 1);
  assert.equal(room.revenue.charged, 0, 'a non-zero here with payments locked off is an alarm');
  assert.ok(room.actionQueue.some((a) => /Verify/.test(a)));
  assert.ok(room.actionQueue.some((a) => /introduction/i.test(a)));
  assert.ok(room.funnel.submitted === 1 && room.funnel.matched === 0);

  const empty = warRoom(null);
  assert.equal(empty.totals.opportunities, 0);
});

// ─── 10. Analytics carry no content ──────────────────────────────────────────

test('the brief’s event taxonomy is complete and every safe prop passes the scrub', () => {
  for (const want of ['contractor_connect_opened', 'intent_selected', 'opportunity_started',
    'opportunity_submitted', 'contractor_profile_created', 'qualifier_profile_created',
    'license_verification_started', 'license_verification_success', 'license_verification_failed',
    'match_viewed', 'intro_requested', 'intro_accepted', 'intro_declined', 'match_completed',
    'fee_presented', 'fee_paid', 'source_clicked']) {
    assert.ok(CONNECT_EVENTS.includes(want), `taxonomy dropped ${want}`);
  }
  for (const prop of CONNECT_SAFE_PROPS) {
    assert.ok(ALLOWED_PROPERTIES.has(prop), `${prop} would be silently dropped by the scrub`);
  }
});

test('descriptions, licence numbers and contact details cannot leave through analytics', () => {
  const { props, dropped } = scrubProperties({
    intent: 'HAVE_JOB', trade: 'ELECTRICAL', state: 'FL', county: 'Hillsborough',
    description: 'meter can rusted through at 123 Oak Street',
    license_number: 'EC13001234', email: 'pat@example.com', phone: '813-555-0100',
  });
  assert.deepEqual(Object.keys(props).sort(), ['county', 'intent', 'state', 'trade']);
  assert.ok(dropped.includes('description') && dropped.includes('license_number')
    && dropped.includes('email') && dropped.includes('phone'));
});

// ─── 11. Copy and legal ──────────────────────────────────────────────────────

test('no marketplace copy promises an outcome', () => {
  assert.deepEqual([...auditIntentCopy()], []);
  assert.deepEqual([...auditLegalCopy()], []);
  assert.equal(findOutcomePromise(QUALIFIER_NEED_NOTICE), null);
  assert.equal(findOutcomePromise(CAN_QUALIFY_NOTICE), null);
  assert.match(QUALIFIER_NEED_NOTICE, /does not support passive license rental/);
  assert.match(CAN_QUALIFY_NOTICE, /board decides/i);
});

test('the marketplace disclaimer matches the brief and the legal notes carry review metadata', () => {
  assert.match(MARKETPLACE_DISCLAIMER, /does not issue licenses/);
  assert.match(MARKETPLACE_DISCLAIMER, /replace DBPR or local licensing-board review/);
  assert.ok(FLORIDA_NOTES.length >= 3);
  for (const n of FLORIDA_NOTES) {
    assert.ok(n.confirmWith, `${n.id} has no authority to confirm with`);
    assert.ok(!/\b\d+\s*(?:years|hours)\b|\$\s?\d/.test(n.text), `${n.id} states a specific figure — that belongs to the board`);
  }
  assert.ok(LEGAL_REVIEW.reviewedAt && LEGAL_REVIEW.source);
});

test('no marketplace file offers to rent, lend or borrow a licence in its copy', async () => {
  // The detectors in moderation.js assemble those phrases from fragments;
  // nothing user-facing may contain them assembled. This walks every
  // marketplace module's exported strings the cheap way: the source text,
  // minus the moderation detector file.
  const fs = await import('node:fs');
  const files = fs.readdirSync('src/core/connect/marketplace').filter((f) => f.endsWith('.js') && f !== 'moderation.js');
  for (const f of files) {
    const src = fs.readFileSync(`src/core/connect/marketplace/${f}`, 'utf8');
    assert.ok(!/\b(?:rent|lend|borrow)\s+(?:a|your|an?other'?s?|my)\s+licen[sc]e\b/i.test(src)
      || /does not support passive license rental/.test(src),
      `${f} contains rental-offer phrasing`);
  }
});

// ─── 12. The split stays cheap, marketplace included ─────────────────────────

test('nothing in marketplace/ imports React, a screen, or anything electrical', async () => {
  const fs = await import('node:fs');
  const files = fs.readdirSync('src/core/connect/marketplace').filter((f) => f.endsWith('.js'));
  assert.ok(files.length >= 10);
  for (const f of files) {
    const src = fs.readFileSync(`src/core/connect/marketplace/${f}`, 'utf8');
    const imports = [...src.matchAll(/^import[^;]*from\s+'([^']+)'/gm)].map((m) => m[1]);
    for (const spec of imports) {
      assert.ok(!/screens?\//i.test(spec), `${f} imports a screen: ${spec}`);
      assert.ok(!spec.includes('react'), `${f} imports React: ${spec}`);
      assert.ok(!/\/circuit\/|\/nec\//.test(spec), `${f} imports something electrical: ${spec}`);
      assert.ok(spec.startsWith('.'), `${f} imports outside the module: ${spec}`);
    }
  }
});
