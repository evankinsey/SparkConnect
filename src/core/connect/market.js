// ─── THE MARKETPLACE ─────────────────────────────────────────────────────────
// Contractor Connect as something that completes without anybody operating it.
//
// The previous release was manually brokered: a submission left the app as an
// email and a person did the matching. That is a fine way to learn what to
// automate and a terrible way to run a business, because the normal successful
// path required a founder's Tuesday evening. This module is the economics of
// the version that does not.
//
// WHAT IS BEING SOLD, PRECISELY. Access to a qualified opportunity — not an
// outcome. A contractor pays to see who the job belongs to and to be one of a
// small number of people who can. They are not paying for the contract, we do
// not promise them the contract, and nothing here takes a percentage of a
// contract we cannot observe. That distinction is the whole reason this can be
// automated: "did they see it" is a fact the system holds, and "did they win
// it" is a fact three other parties hold.
//
// THE RULE THAT PROTECTS BOTH SIDES. An opportunity is capped. Selling one
// homeowner's phone number to fifteen contractors is what a lead-generation
// company does, and it is why nobody trusts one. The cap is small, it is
// visible before purchase, and it is enforced here rather than in a screen.
//
// Pure module: no React, no network, no storage. Prices are cents, integers,
// because a price rendered from a float is a price that eventually renders
// wrong.

import { Trade, TRADE_LABEL } from './index.js';

// ─── Value bands ─────────────────────────────────────────────────────────────

/**
 * What a lead costs, banded by what the job is worth.
 *
 * One flat price is wrong in both directions: it prices a $3,000 service call
 * out of reach and gives away a $90,000 tenant fit-out. The bands are wide on
 * purpose — a stated job value is an estimate by somebody who has not priced
 * it yet, and pretending to more precision than that would be false.
 */
export const Band = Object.freeze({
  SMALL: 'SMALL',
  MID: 'MID',
  LARGE: 'LARGE',
  MAJOR: 'MAJOR',
});

export const BANDS = Object.freeze([
  Object.freeze({
    id: Band.SMALL,
    label: 'Under $5k',
    minCents: 0,
    maxCents: 500000,
    unlockCents: 2900,
    // Three is the most an opportunity holder can field without it becoming
    // spam to them, and it is the most a buyer will pay a real price to be
    // part of.
    maxUnlocks: 3,
  }),
  Object.freeze({
    id: Band.MID,
    label: '$5k – $15k',
    minCents: 500000,
    maxCents: 1500000,
    unlockCents: 4900,
    maxUnlocks: 3,
  }),
  Object.freeze({
    id: Band.LARGE,
    label: '$15k – $50k',
    minCents: 1500000,
    maxCents: 5000000,
    unlockCents: 7900,
    maxUnlocks: 3,
  }),
  Object.freeze({
    id: Band.MAJOR,
    label: '$50k and up',
    minCents: 5000000,
    maxCents: null,
    unlockCents: 9900,
    // Fewer, deliberately. At this size the holder is choosing a contractor,
    // not collecting quotes, and a fourth caller is noise to them and a wasted
    // $99 to the fourth contractor.
    maxUnlocks: 2,
  }),
]);

export const bandById = (id) => BANDS.find((b) => b.id === id) ?? null;

/**
 * Which band a stated value falls in.
 *
 * An unstated or unparseable value gets no band and therefore no price, which
 * is the honest outcome: a job with no size cannot be banded, and guessing MID
 * would charge somebody $49 on the strength of a blank field.
 */
export const bandFor = (valueCents) => {
  // Number(null) is 0 and Number('') is 0 — both finite, both non-negative, and
  // both would land an unpriced job in the cheapest band and sell it for $29.
  // The absent cases have to be rejected before any coercion happens.
  if (valueCents === null || valueCents === undefined || valueCents === '') return null;
  const v = Number(valueCents);
  if (!Number.isFinite(v) || v < 0) return null;
  for (const b of BANDS) {
    if (v >= b.minCents && (b.maxCents === null || v < b.maxCents)) return b;
  }
  return null;
};

/**
 * Read "$15,000", "15k", "$15,000 - $25,000" into cents.
 *
 * A RANGE RESOLVES TO ITS LOW END. The person posting is estimating, the
 * person paying is buying access on the strength of that estimate, and
 * rounding a "$15k–$25k" up into the $15k–$50k band charges the buyer more on
 * a number nobody has verified. Low end is the reading that cannot overcharge.
 */
export const parseValueCents = (raw) => {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw >= 0 ? Math.round(raw * 100) : null;
  if (typeof raw !== 'string') return null;
  const matches = [...raw.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(k|m)?/gi)];
  if (!matches.length) return null;
  const values = matches.map((m) => {
    const n = parseFloat(m[1].replace(/,/g, ''));
    if (!Number.isFinite(n)) return null;
    const scale = (m[2] ?? '').toLowerCase() === 'k' ? 1000
      : (m[2] ?? '').toLowerCase() === 'm' ? 1000000 : 1;
    return Math.round(n * scale * 100);
  }).filter((n) => n !== null);
  if (!values.length) return null;
  return Math.min(...values);
};

export const formatPrice = (cents) => {
  const n = Number(cents);
  if (!Number.isFinite(n)) return '';
  return n % 100 === 0 ? `$${(n / 100).toFixed(0)}` : `$${(n / 100).toFixed(2)}`;
};

// ─── What a contractor sees before paying ────────────────────────────────────

/**
 * The preview/locked split.
 *
 * Everything needed to DECIDE is free. Only the identity is paid for. A buyer
 * who cannot tell whether a job is worth $79 will not spend $79, and a buyer
 * who spends it and finds the job was nothing like the preview does not spend
 * it twice — so a thin preview costs more than it protects.
 *
 * `LOCKED_FIELDS` is the entire list of what payment buys. It is short by
 * design and a test asserts nothing identifying leaks into the preview.
 */
export const PREVIEW_FIELDS = Object.freeze([
  'trade', 'location', 'band', 'projectType', 'plansAvailable', 'desiredStart',
  'postedAt', 'unlocksRemaining', 'scope',
]);

export const LOCKED_FIELDS = Object.freeze([
  'contactName', 'contactEmail', 'contactPhone', 'address',
]);

const age = (postedAt, now) => {
  const t = Date.parse(postedAt ?? '');
  if (Number.isNaN(t)) return 'Recently';
  const mins = Math.max(0, Math.floor((now - t) / 60000));
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

/**
 * The card a contractor browses, with the price and the scarcity on it.
 *
 * Never returns a contact field. Not "returns them masked" — the object does
 * not contain them, so a screen cannot render one by accident and a logged
 * payload cannot leak one. The unlocked view is a separate call that the
 * server answers only for somebody who has paid.
 */
export const opportunityPreview = (opp, { now = Date.now() } = {}) => {
  if (!opp) return null;
  const band = bandById(opp.bandId) ?? bandFor(opp.valueCents);
  const used = Math.max(0, Math.floor(Number(opp.unlockCount) || 0));
  const cap = band?.maxUnlocks ?? 3;
  const remaining = Math.max(0, cap - used);

  return Object.freeze({
    id: opp.id,
    trade: TRADE_LABEL[opp.trade] ?? TRADE_LABEL[Trade.ELECTRICAL],
    location: opp.location ?? '',
    band: band?.label ?? null,
    projectType: opp.projectType ?? '',
    scope: opp.scope ?? '',
    plansAvailable: opp.plansAvailable === true,
    desiredStart: opp.desiredStart ?? '',
    postedAt: age(opp.postedAt, now),
    // The two numbers a purchase decision is made on.
    unlockCents: band?.unlockCents ?? null,
    unlockPrice: band ? formatPrice(band.unlockCents) : null,
    unlocksRemaining: remaining,
    // "2 of 3 contractor connections remaining" — real scarcity, because the
    // cap protects the person who posted rather than manufacturing urgency.
    scarcityLabel: `${remaining} of ${cap} contractor connection${cap === 1 ? '' : 's'} remaining`,
    contactLocked: true,
    open: remaining > 0 && opp.status === OpportunityStatus.OPEN,
  });
};

export const OpportunityStatus = Object.freeze({
  DRAFT: 'DRAFT',
  PENDING_REVIEW: 'PENDING_REVIEW',
  OPEN: 'OPEN',
  FULL: 'FULL',
  CLOSED: 'CLOSED',
  WITHDRAWN: 'WITHDRAWN',
});

// ─── Can this contractor unlock this opportunity? ────────────────────────────

export const UnlockRefusal = Object.freeze({
  NOT_OPEN: 'NOT_OPEN',
  CAP_REACHED: 'CAP_REACHED',
  ALREADY_UNLOCKED: 'ALREADY_UNLOCKED',
  NOT_VERIFIED: 'NOT_VERIFIED',
  OWN_OPPORTUNITY: 'OWN_OPPORTUNITY',
  NO_BAND: 'NO_BAND',
});

export const REFUSAL_COPY = Object.freeze({
  NOT_OPEN: 'This one is closed.',
  CAP_REACHED: 'This opportunity has all the contractors it takes. Capping it is how the person who posted it gets called by three contractors instead of fifteen.',
  ALREADY_UNLOCKED: 'You already have this one — it is in your unlocked list.',
  NOT_VERIFIED: 'Add a licence number to your profile first. Only verified contractors can unlock an opportunity, which is the reason the people posting them use this.',
  OWN_OPPORTUNITY: 'This is yours.',
  NO_BAND: 'This one has no stated value yet, so it has no price. It will open once the person who posted it adds one.',
});

/**
 * The gate, evaluated the same way on the client and the server.
 *
 * The client version exists to explain and to avoid a pointless payment sheet.
 * The SERVER version is the one that decides — see schema.js, where the cap is
 * additionally a database constraint, because a cap enforced only in
 * application code is a cap that a retry, a race, or a rebuilt client gets
 * around.
 */
export const canUnlock = ({ opportunity, contractor, existingUnlocks = [] } = {}) => {
  const deny = (reason) => Object.freeze({ ok: false, reason, message: REFUSAL_COPY[reason], priceCents: null });
  if (!opportunity || !contractor) return deny(UnlockRefusal.NOT_OPEN);
  if (opportunity.ownerId && opportunity.ownerId === contractor.id) return deny(UnlockRefusal.OWN_OPPORTUNITY);
  if (opportunity.status !== OpportunityStatus.OPEN) return deny(UnlockRefusal.NOT_OPEN);

  const band = bandById(opportunity.bandId) ?? bandFor(opportunity.valueCents);
  if (!band) return deny(UnlockRefusal.NO_BAND);

  // Verification is the product. An unverified contractor unlocking leads is
  // the failure mode that makes a marketplace worthless to the side posting.
  if (contractor.verified !== true) return deny(UnlockRefusal.NOT_VERIFIED);

  if (existingUnlocks.some((u) => u.contractorId === contractor.id && u.opportunityId === opportunity.id)) {
    return deny(UnlockRefusal.ALREADY_UNLOCKED);
  }
  const used = existingUnlocks.filter((u) => u.opportunityId === opportunity.id).length;
  if (used >= band.maxUnlocks) return deny(UnlockRefusal.CAP_REACHED);

  return Object.freeze({
    ok: true,
    reason: null,
    message: null,
    priceCents: band.unlockCents,
    price: formatPrice(band.unlockCents),
    remainingAfter: band.maxUnlocks - used - 1,
  });
};

// ─── The price list ──────────────────────────────────────────────────────────

/**
 * Everything that costs money, in one place, with what is and is not live.
 *
 * `live: false` is not a roadmap decoration — nothing off this list may be
 * charged for, and a subscription that opens before there is inventory is a
 * subscription to an empty room. Contractor Pro stays off until opportunity
 * volume can support it, and the condition is written down rather than left to
 * a judgement call in six weeks.
 */
export const PriceItem = Object.freeze({
  OPPORTUNITY_UNLOCK: 'OPPORTUNITY_UNLOCK',
  QUALIFIER_INTRODUCTION: 'QUALIFIER_INTRODUCTION',
  RELATIONSHIP_PRO: 'RELATIONSHIP_PRO',
  CONTRACTOR_PRO: 'CONTRACTOR_PRO',
});

export const PRICE_LIST = Object.freeze([
  Object.freeze({
    id: PriceItem.OPPORTUNITY_UNLOCK,
    label: 'Unlock an opportunity',
    pricing: 'Banded by job value',
    fromCents: 2900, toCents: 9900,
    recurring: false,
    live: true,
    buys: 'The contact details, and one of a capped number of connections to that job.',
    doesNotBuy: 'The contract. Nothing here promises the work is won.',
  }),
  Object.freeze({
    id: PriceItem.QUALIFIER_INTRODUCTION,
    label: 'Qualifier introduction',
    pricing: 'Flat, on mutual interest only',
    fromCents: 19900, toCents: 19900,
    recurring: false,
    live: true,
    // Charged only when BOTH sides have said yes. Charging a business to
    // contact somebody who has not agreed to be contacted is selling a
    // rejection.
    requiresMutualInterest: true,
    buys: 'An introduction to a licensed professional who has already said they are open to it.',
    doesNotBuy: 'A qualifying agreement, or any assurance one will be reached.',
  }),
  Object.freeze({
    id: PriceItem.RELATIONSHIP_PRO,
    label: 'Relationship Pro',
    pricing: 'Per active relationship',
    fromCents: 9900, toCents: 9900,
    recurring: true, period: 'month',
    live: false,
    liveWhen: 'There is a real monitoring pipeline behind it — licence status, renewals, '
      + 'documents and activity logs. Charging monthly for an introduction that already '
      + 'happened is not a service.',
    buys: 'Ongoing licence monitoring, renewal alerts, documents and relationship history.',
  }),
  Object.freeze({
    id: PriceItem.CONTRACTOR_PRO,
    label: 'Contractor Connect Pro',
    pricing: 'Subscription with included unlocks',
    fromCents: 14900, toCents: 14900,
    recurring: true, period: 'month',
    live: false,
    liveWhen: 'Opportunity volume in a market can fill the included unlocks. Nobody should '
      + 'pay $149 a month to browse an empty room, and the first person who does will '
      + 'tell everybody.',
    buys: 'Included unlocks, early access, saved searches, alerts and licence monitoring.',
  }),
]);

export const priceItem = (id) => PRICE_LIST.find((p) => p.id === id) ?? null;
export const livePriceItems = () => Object.freeze(PRICE_LIST.filter((p) => p.live));

/**
 * What is deliberately NOT charged for, and why. Kept beside the price list so
 * a later "we could charge for that" runs into the reason it was free.
 */
export const FREE_BY_DESIGN = Object.freeze([
  Object.freeze({ what: 'Posting an opportunity', why: 'Supply is the scarce side. Charging for it kills the marketplace before it starts.' }),
  Object.freeze({ what: 'Creating a qualifier profile', why: 'Same — the licensed professionals are the inventory.' }),
  Object.freeze({ what: 'Browsing previews', why: 'A buyer has to be able to tell whether an unlock is worth it.' }),
  Object.freeze({ what: 'Licence verification', why: 'It is the thing that makes the rest trustworthy, and it costs us a deep link.' }),
]);

/**
 * The percentage question, answered once so it stops being reopened.
 *
 * Taking a cut of the contract is the obvious model and it is wrong for v1: it
 * requires knowing whether a job closed and at what number, which means
 * self-reporting, disputes, circumvention and chasing. Access is a fact the
 * platform observes. A contract value is a fact three other people hold.
 */
export const NO_SUCCESS_FEE = Object.freeze({
  decision: 'Charge for access, not for outcomes.',
  because: 'A completed contract is not observable from here. Enforcing a percentage would '
    + 'mean policing self-reported deal values and chasing people who transacted off-platform.',
  revisitWhen: 'Contractor Connect carries the workflow and the payment — quotes, scope, '
    + 'milestones. When the platform can see the deal, it can reasonably price it.',
});
