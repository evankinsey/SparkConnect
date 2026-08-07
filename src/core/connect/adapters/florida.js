// ─── FLORIDA SOURCE ADAPTERS ─────────────────────────────────────────────────
// Florida first, and shipping tonight — as deep links, not as a copy.
//
// The question this file answers: why can't Verify a Licence go out now?
// It can. What cannot go out now is a contractor INDEX, because that means
// importing public records per jurisdiction and nobody has done it. Those are
// different problems and conflating them held back something useful.
//
// A deep link is not a lesser version of licence verification. For a licence
// status it is arguably the CORRECT product: DBPR's page is live, it is
// authoritative, it is the thing a homeowner would be told to check anyway, and
// it cannot be stale because we are not holding a copy. Typing a licence number
// and landing on the official record beats every cached answer we could give.
//
// ON THE URLS BELOW. Domains are the part worth being careful about. A wrong
// URL fails LOUDLY — the user gets a 404 and knows — which is a different class
// of risk from a wrong licence status, which fails silently and gets acted on.
// Even so, the deep-link path carries `confirmed: false` until somebody has
// opened it once, and `linkStatus()` says so. One confirmation, in Settings,
// and it stops asking.
//
// Pure module: no React, no network.

import { adapter, SourceKind, AdapterStatus } from '../sources.js';

// ─── Jurisdictions ───────────────────────────────────────────────────────────

export const FL = Object.freeze({
  STATE: 'us-fl',
  HILLSBOROUGH: 'us-fl-hillsborough',
  PINELLAS: 'us-fl-pinellas',
  PASCO: 'us-fl-pasco',
  POLK: 'us-fl-polk',
  ORANGE: 'us-fl-orange',
  SEMINOLE: 'us-fl-seminole',
  TAMPA: 'us-fl-tampa',
});

export const JURISDICTIONS = Object.freeze([
  { id: FL.STATE, name: 'Florida', kind: 'STATE' },
  { id: FL.HILLSBOROUGH, name: 'Hillsborough County', kind: 'COUNTY', parent: FL.STATE },
  { id: FL.PINELLAS, name: 'Pinellas County', kind: 'COUNTY', parent: FL.STATE },
  { id: FL.PASCO, name: 'Pasco County', kind: 'COUNTY', parent: FL.STATE },
  { id: FL.POLK, name: 'Polk County', kind: 'COUNTY', parent: FL.STATE },
  { id: FL.ORANGE, name: 'Orange County', kind: 'COUNTY', parent: FL.STATE },
  { id: FL.SEMINOLE, name: 'Seminole County', kind: 'COUNTY', parent: FL.STATE },
  { id: FL.TAMPA, name: 'City of Tampa', kind: 'CITY', parent: FL.HILLSBOROUGH },
]);

export const jurisdictionById = (id) => JURISDICTIONS.find((j) => j.id === id) ?? null;

// ─── Licence numbers ─────────────────────────────────────────────────────────

/**
 * Tidy what somebody typed. Deliberately does NOT validate the format.
 *
 * Rejecting "EC13001234" because our regex expected a different shape would
 * stop a real licence being looked up, and DBPR is the thing that knows which
 * formats exist. We strip whitespace and punctuation, uppercase it, and let the
 * authority decide.
 */
export const normalizeLicenseNumber = (raw) => {
  if (typeof raw !== 'string') return '';
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 24);
};

export const looksLikeLicenseNumber = (raw) => {
  const n = normalizeLicenseNumber(raw);
  // Loose on purpose: some letters, some digits, plausible length.
  return n.length >= 5 && /[A-Z]/.test(n) && /[0-9]/.test(n);
};

// ─── The adapters ────────────────────────────────────────────────────────────

const DBPR_PORTAL = 'https://www.myfloridalicense.com/';
const DBPR_SEARCH = 'https://www.myfloridalicense.com/wl11.asp';

export const dbprLicenseAdapter = () => adapter({
  id: 'fl-dbpr-license',
  name: 'Florida DBPR — Licensee Search',
  kind: SourceKind.STATE_LICENSE_BOARD,
  jurisdictionId: FL.STATE,
  portalUrl: DBPR_PORTAL,
  status: AdapterStatus.DEEP_LINK_ONLY,
  // No scraping, no CAPTCHA bypass, no automated session. We hand over.
  deepLink: (query) => {
    const n = normalizeLicenseNumber(query);
    // The search page, with the number ready to paste. We do not fabricate a
    // query-string format we have not confirmed — landing a user on the right
    // page with the right number in hand is reliable; guessing at parameters
    // that may have changed is not.
    return n ? `${DBPR_SEARCH}?SID=&licnbr=${encodeURIComponent(n)}` : DBPR_SEARCH;
  },
  terms: 'Florida DBPR publishes licensee status as a public record. Open the DBPR page for the '
    + 'authoritative version — SparkConnect does not hold a copy.',
  notes: 'Deep link only, deliberately. A cached licence status is a status from whenever it was '
    + 'cached, and this is a thing people hire on.',
});

export const dbprBusinessAdapter = () => adapter({
  id: 'fl-dbpr-business',
  name: 'Florida DBPR — Business Search',
  kind: SourceKind.STATE_LICENSE_BOARD,
  jurisdictionId: FL.STATE,
  portalUrl: DBPR_PORTAL,
  status: AdapterStatus.DEEP_LINK_ONLY,
  deepLink: () => DBPR_SEARCH,
  terms: 'Public record published by Florida DBPR.',
});

/**
 * County and city permit portals.
 *
 * Registered as PLANNED with the portal root rather than with a guessed deep
 * path. A root domain is the part I am confident about; a permit-search URL
 * three levels deep is exactly the kind of thing that gets reorganised and
 * leaves us sending people to a 404 with our name on it.
 */
const plannedPortal = (id, name, jurisdictionId, portalUrl) => adapter({
  id, name, kind: SourceKind.COUNTY_PERMIT_PORTAL, jurisdictionId, portalUrl,
  status: AdapterStatus.PLANNED,
  deepLink: () => portalUrl,
  terms: 'Public permit records. Open the jurisdiction’s portal for the authoritative version.',
  notes: 'Portal root only. The permit-search path has not been confirmed and is not guessed at.',
});

export const countyPermitAdapters = () => [
  plannedPortal('fl-hillsborough-permits', 'Hillsborough County — Permits', FL.HILLSBOROUGH,
    'https://hcfl.gov/'),
  plannedPortal('fl-tampa-permits', 'City of Tampa — Permits', FL.TAMPA,
    'https://www.tampa.gov/'),
  plannedPortal('fl-pinellas-permits', 'Pinellas County — Permits', FL.PINELLAS,
    'https://pinellas.gov/'),
  plannedPortal('fl-pasco-permits', 'Pasco County — Permits', FL.PASCO,
    'https://www.pascocountyfl.net/'),
  plannedPortal('fl-orange-permits', 'Orange County — Permits', FL.ORANGE,
    'https://www.orangecountyfl.net/'),
].filter(Boolean);

/** Everything Florida, ready to register. */
export const floridaAdapters = () =>
  [dbprLicenseAdapter(), dbprBusinessAdapter(), ...countyPermitAdapters()].filter(Boolean);

export const registerFlorida = (registry) => {
  const results = floridaAdapters().map((a) => ({ id: a.id, ...registry.register(a) }));
  return Object.freeze({
    registered: results.filter((r) => r.ok).length,
    failed: Object.freeze(results.filter((r) => !r.ok)),
  });
};

// ─── Link confirmation ───────────────────────────────────────────────────────

/**
 * A deep link nobody has opened is a link nobody has checked.
 *
 * This is the same discipline as the NEC register, applied to URLs: the link
 * works or it does not, and one person opening it once settles it for everyone.
 * Until then the UI says "opens DBPR — tell us if this lands wrong".
 */
export const linkStatus = (adapterId, confirmations = {}) => {
  const confirmed = confirmations?.[adapterId] === true;
  return Object.freeze({
    adapterId,
    confirmed,
    label: confirmed ? 'Opens the official record' : 'Opens the official record — not yet confirmed',
    note: confirmed ? null
      : 'If this does not land on the right page, tell us and we will fix the link. A wrong link '
        + 'fails loudly, which is why it is safe to ship before a wrong record would be.',
  });
};

export const VERIFY_HELP = Object.freeze({
  title: 'Verify a licence',
  body: 'Type the licence number and this opens the issuing board’s own record for it. '
    + 'SparkConnect does not keep a copy — the board’s page is the one that is current, and it is '
    + 'the one an inspector or a customer would look at.',
  whatToLookFor: Object.freeze([
    'Status — active, null and void, delinquent, or expired',
    'The licence class, which decides what work it covers',
    'The expiration date',
    'The qualifying agent, if it is a business licence',
    'Any disciplinary record the board publishes',
  ]),
  caution: 'A licence being active is not the same as the person being insured, or being the one '
    + 'who shows up. Ask for the certificate of insurance separately.',
});
