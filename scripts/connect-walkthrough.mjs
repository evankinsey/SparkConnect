#!/usr/bin/env node
//
// Contractor Connect, driven end to end without a phone.
//
//   npm run connect:demo
//
// This is not a test — tests assert, this narrates. It walks one realistic
// Tampa scenario through the real modules and prints what the product actually
// does at each step, including the three places it refuses to do what it is
// asked. Useful for seeing the behaviour in ten seconds, and for showing
// somebody what the compliance posture means in practice rather than in prose.
//
// Nothing here is seeded into the app. It runs on an in-memory store and exits.

import { createOpportunity, submitterNotice, setModeration, setMatchState, ModerationState, MatchState } from '../src/core/connect/marketplace/opportunity.js';
import { createContractorProfile, createBusinessNeed, createQualifierProfile, withVerification } from '../src/core/connect/marketplace/profiles.js';
import { verificationFromSource, applyVerification, initialVerification, verificationBadge } from '../src/core/connect/marketplace/verification.js';
import { matchContractors } from '../src/core/connect/marketplace/matching.js';
import { createIntroRequest, advanceIntro, IntroStatus } from '../src/core/connect/marketplace/introductions.js';
import { createQualification, advanceQualification, QualStatus } from '../src/core/connect/marketplace/qualification.js';
import { createMarketplaceStore, Role } from '../src/core/connect/marketplace/store.js';
import { warRoom } from '../src/core/connect/marketplace/admin.js';
import { Confidence } from '../src/core/connect/sources.js';
import { dbprLicenseAdapter } from '../src/core/connect/adapters/florida.js';

const B = (s) => `\x1b[1m${s}\x1b[0m`;
const G = (s) => `\x1b[32m${s}\x1b[0m`;
const R = (s) => `\x1b[31m${s}\x1b[0m`;
const Y = (s) => `\x1b[33m${s}\x1b[0m`;
const D = (s) => `\x1b[2m${s}\x1b[0m`;

const step = (n, title) => console.log(`\n${B(`── ${n}. ${title} `.padEnd(74, '─'))}`);
const say = (s) => console.log(`   ${s}`);
const refused = (s) => console.log(`   ${R('REFUSED')}  ${s}`);
const allowed = (s) => console.log(`   ${G('OK')}       ${s}`);

const memory = () => { const m = new Map(); return { getItem: async (k) => m.get(k) ?? null, setItem: async (k, v) => { m.set(k, v); } }; };
const store = createMarketplaceStore(memory());

const JOURNEYMAN = { id: 'user_mike', role: Role.USER };
const CONTRACTOR = { id: 'user_brightsparks', role: Role.USER };
const EVAN = { id: 'evan', role: Role.ADMIN };

console.log(B('\nCONTRACTOR CONNECT — one Tampa job, start to finish\n'));
console.log(D('   Mike is a journeyman. He does not hold a contractor licence.'));
console.log(D('   Bright Sparks LLC is an electrical contractor. Evan runs the platform.'));

// ─────────────────────────────────────────────────────────────────────────────
step(1, 'Mike submits a job he found. He is not licensed to contract it');

const draft = {
  trade: 'ELECTRICAL', state: 'FL', county: 'Hillsborough', city: 'Tampa',
  projectType: 'RESIDENTIAL', estimatedValueRange: 'R5K_25K',
  description: 'Panel change and service upgrade, 1960s house, meter can rusted through.',
  plansAvailable: false, photosAvailable: true, permitLikely: 'yes',
  howObtained: 'Neighbour asked me after I fixed their outlet.',
  submitterRole: 'JOURNEYMAN', holdsRequiredLicense: false,
};
const { opportunity } = createOpportunity(draft);
const submitted = await store.submitOpportunity(JOURNEYMAN, opportunity);

say(`${opportunity.id} · ${opportunity.trade} · ${opportunity.jurisdiction.county}, ${opportunity.jurisdiction.state}`);
say(`submitter licence: ${Y(opportunity.licenseStatusOfSubmitter)}`);
say(`moderation: ${opportunity.moderationState}   match: ${opportunity.matchState}`);
console.log(`\n   ${B('What Mike is told:')}`);
console.log(`   ${Y('"' + submitterNotice(opportunity) + '"')}`);

// ─────────────────────────────────────────────────────────────────────────────
step(2, 'The same job, phrased the way that must never be brokered');

const shady = createOpportunity({ ...draft, description: 'Big rewire. Just need someone to lend their license so I can pull the permit.' }).opportunity;
const shadyStored = await store.submitOpportunity(JOURNEYMAN, shady);
say(`moderation: ${R(shadyStored.stored.moderationState)}  flags: ${shadyStored.screening.flags.map((f) => f.id).join(', ')}`);
say(`what the submitter sees: ${D('"' + shadyStored.screening.submitterMessage + '"')}`);
say(D('(no accusation — it goes to a person, and it cannot be matched meanwhile)'));

// ─────────────────────────────────────────────────────────────────────────────
step(3, 'Bright Sparks signs up wanting work');

const contractorProfile = createContractorProfile({
  businessName: 'Bright Sparks LLC', licenseHolder: 'Pat Doe', licenseNumber: 'ec 13-001234',
  classification: 'EC', trade: 'ELECTRICAL', state: 'FL',
  serviceCounties: ['Hillsborough', 'Pinellas'], projectTypes: ['RESIDENTIAL'],
  projectSizeRanges: ['R5K_25K'], specialties: ['panel', 'service upgrade'],
  // A hostile client trying to mark itself verified on the way in:
  verification: { status: 'VERIFIED_ACTIVE' }, verified: true,
}).profile;
const conStored = await store.submitProfile(CONTRACTOR, contractorProfile);
say(`${contractorProfile.businessName} · licence ${contractorProfile.licenseNumber}`);
refused(`the "verified: true" it sent was discarded → status is ${Y(conStored.stored.verification.status)}`);

// ─────────────────────────────────────────────────────────────────────────────
step(4, 'Evan clears the good job. Can Bright Sparks match it yet?');

const cleared = setModeration(opportunity, ModerationState.CLEARED, { by: 'evan', at: new Date().toISOString() }).opportunity;
await store.decideModeration(EVAN, opportunity.id, 'CLEARED', 'real job, real submitter');
allowed(`opportunity cleared by ${EVAN.id}`);

const before = matchContractors(cleared, [conStored.stored]);
say(`candidates: ${before.candidates.length}`);
refused(`Bright Sparks is out — ${before.ineligible[0].reasons.join(', ')}`);
say(D('an unverified licence is ineligible by rule. No score can buy it back.'));

// ─────────────────────────────────────────────────────────────────────────────
step(5, 'Evan reads the DBPR record and attaches what it said');

// In production this is a human opening the deep link below and recording what
// the board's own page shows. The payload is what was read, not what we hope.
say(D(`deep link: ${dbprLicenseAdapter().deepLink('EC13001234')}`));

const outcome = verificationFromSource({
  source: {
    sourceId: 'fl-dbpr-license',
    sourceName: 'Florida DBPR — Licensee Search',
    sourceUrl: 'https://www.myfloridalicense.com/wl11.asp',
    jurisdictionId: 'us-fl',
    retrievedAt: new Date().toISOString(),
    confidence: Confidence.OFFICIAL,
    payload: { status: 'Current, Active', name: 'DOE, PAT' },
  },
  licenseNumber: 'EC13001234', officialName: 'DOE, PAT', licenseStatusText: 'Current, Active',
});

const forged = applyVerification(initialVerification(), { status: 'VERIFIED_ACTIVE' });
refused(`a status with no source: ${forged.reason}`);

const applied = applyVerification(initialVerification(), outcome);
const selfServe = await store.applyProfileVerification(CONTRACTOR, contractorProfile.id, applied);
refused(`Bright Sparks verifying itself: ${selfServe.reason}`);

const byEvan = await store.applyProfileVerification(EVAN, contractorProfile.id, applied);
allowed(`attached by ${EVAN.id} → ${G(byEvan.stored.verification.status)}`);

const badge = verificationBadge(byEvan.stored.verification);
say(`badge: "${badge.label}" · ${badge.sourceName} · ${badge.freshness.label}`);
say(D(`caveat shown even when active: "${badge.caveat}"`));

// ─────────────────────────────────────────────────────────────────────────────
step(6, 'Now match');

const verifiedContractor = byEvan.stored;
const after = matchContractors(cleared, [verifiedContractor]);
const top = after.candidates[0];
say(`candidates: ${G(String(after.candidates.length))} — top is ${top.businessName}, score ${B(String(top.score.total))}`);
for (const f of top.score.factors) say(D(`   ${String(f.points).padStart(3)}  ${f.id.padEnd(22)} ${f.note}`));
say(D('every point is attributable. Nothing generative decided any of this.'));

// ─────────────────────────────────────────────────────────────────────────────
step(7, 'Introduction — one legal step at a time');

const { intro } = createIntroRequest({
  senderId: CONTRACTOR.id, recipientId: JOURNEYMAN.id,
  subjectKind: 'OPPORTUNITY', subjectId: opportunity.id,
  message: 'We cover Hillsborough and do service changes weekly. Happy to look.',
});
say(`created → ${intro.status}`);
refused(`straight to MATCHED: ${advanceIntro(intro, IntroStatus.MATCHED).reason}`);

const accepted = advanceIntro(intro, IntroStatus.ACCEPTED, { by: JOURNEYMAN.id }).intro;
allowed(`Mike accepted → ${accepted.status}`);
refused(`introducing with nobody named: ${advanceIntro(accepted, IntroStatus.INTRODUCED).reason}`);
const introduced = advanceIntro(accepted, IntroStatus.INTRODUCED, { by: EVAN.id }).intro;
allowed(`Evan made the introduction → ${introduced.status}`);
const matched = advanceIntro(introduced, IntroStatus.MATCHED, { by: EVAN.id }).intro;
allowed(`both sides proceeding → ${G(matched.status)}`);
await store.putIntro(EVAN, matched);

// ─────────────────────────────────────────────────────────────────────────────
step(8, 'A different thread: a business wants a qualifying agent');

const need = createBusinessNeed({
  legalName: 'Gulf Coast Electric LLC', state: 'FL', trade: 'ELECTRICAL',
  reasonQualifierNeeded: 'Our qualifier retired and we hold live contracts.',
  expectedOversight: 'Weekly site visits, countersigns permits, monthly review of the books.',
}).profile;
const qualifier = withVerification(createQualifierProfile({
  name: 'Dana Reed', licenseNumber: 'EC13009999', state: 'FL',
  openToAdditional: true, expectedInvolvement: 'On site weekly, signs off every permit.',
}).profile, applied.next);

let pipe = createQualification({
  businessNeedId: need.id, qualifierId: qualifier.id, qualifierVerification: qualifier.verification,
}).pipeline;
say(`pipeline opened → ${pipe.status}`);
pipe = advanceQualification(pipe, QualStatus.INTRO_REQUESTED).pipeline;
pipe = advanceQualification(pipe, QualStatus.MUTUAL_INTEREST).pipeline;
say(`both sides interested → ${Y(pipe.status)}`);

refused(`calling that a qualifying relationship: ${advanceQualification(pipe, QualStatus.RELATIONSHIP_CONFIRMED).reason.split('—')[0].trim()}`);
pipe = advanceQualification(pipe, QualStatus.APPLICATION_REQUIRED).pipeline;
pipe = advanceQualification(pipe, QualStatus.BOARD_AGENCY_REVIEW).pipeline;
say(`filed → ${pipe.status}`);
refused(`confirming with no board reference: ${advanceQualification(pipe, QualStatus.RELATIONSHIP_CONFIRMED).reason.split('.')[0]}`);
pipe = advanceQualification(pipe, QualStatus.RELATIONSHIP_CONFIRMED, { boardReference: 'DBPR file 2026-1234' }).pipeline;
allowed(`board reference recorded → ${G(pipe.status)}`);
await store.putQualification(EVAN, pipe);

// ─────────────────────────────────────────────────────────────────────────────
step(9, "Evan's war room");

const snap = await store.adminSnapshot(EVAN);
const room = warRoom(snap.data, { now: Date.now() });
say(`opportunities ${room.totals.opportunities} · contractors ${room.totals.contractors} · verified ${G(String(room.verification.verifiedContractors))}`);
say(`flagged ${R(String(room.moderation.flagged))} · pending verification ${room.verification.pending}`);
say(`intros matched ${room.introductions.matched} · qualifying relationships confirmed ${room.qualifications.confirmed}`);
say(`billing events ${room.revenue.events}, charged ${G(String(room.revenue.charged))} ${D('(payments are hard-locked off)')}`);
say(`audit rows ${room.auditRows} ${D('(every write named its actor)')}`);
if (room.actionQueue.length) {
  console.log(`\n   ${B('Do next:')}`);
  for (const a of room.actionQueue) say(`${Y('→')} ${a}`);
}

// And Evan works the queue: the licence-lending ask is declined, with a reason
// that stays on the record next to who decided it.
const decided = await store.decideModeration(EVAN, shady.id, 'REJECTED', 'asked to borrow a licence');
console.log('');
allowed(`reviewed the flagged one → ${R(decided.stored.moderationState)} by ${decided.stored.moderation.by} ("${decided.stored.moderation.reason}")`);
const after9 = warRoom((await store.adminSnapshot(EVAN)).data, { now: Date.now() });
say(`queue now: flagged ${after9.moderation.flagged} · awaiting review ${after9.moderation.awaitingReview}`);

console.log(`\n${B('── The three refusals that matter '.padEnd(74, '─'))}`);
say(`${R('1.')} a client cannot write its own verified status`);
say(`${R('2.')} an unverified licence cannot match, at any score`);
say(`${R('3.')} two people agreeing is not a qualifying relationship`);
console.log('');
