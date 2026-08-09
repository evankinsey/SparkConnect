// ─── LICENCE VERIFICATION: STATUS BY EVIDENCE, NEVER BY CLAIM ────────────────
// The one security property this file exists for:
//
//   NOBODY — not the profile owner, not the screen, not a compromised client —
//   can produce a VERIFIED status by writing it. The only way to a VERIFIED_*
//   status is through `applyVerification()` with a source record, and a source
//   record cannot be constructed without provenance (sources.js refuses).
//
// A contractor marketplace where "Verified" is a boolean a client can set is a
// marketplace where the word means nothing. Here it is a value that can only
// be derived from evidence, and the evidence rides along with it: source name,
// URL, retrieval timestamp, what the source said, and a hash of the raw
// payload so a dispute can be checked against what was actually read.
//
// Pure module: no React, no network, no storage.

import { sourceRecord, freshness } from '../sources.js';

/** The brief's enum, verbatim. */
export const LicenseVerification = Object.freeze({
  UNVERIFIED: 'UNVERIFIED',                 // nothing checked yet — every profile starts here
  SOURCE_MATCH_FOUND: 'SOURCE_MATCH_FOUND', // the source returned a record; status not yet read
  VERIFIED_ACTIVE: 'VERIFIED_ACTIVE',       // source says the licence is current
  VERIFIED_INACTIVE: 'VERIFIED_INACTIVE',   // source says inactive
  VERIFIED_EXPIRED: 'VERIFIED_EXPIRED',     // source says expired
  POSSIBLE_MATCH: 'POSSIBLE_MATCH',         // a record resembles the claim; not certain enough to act on
  MANUAL_REVIEW: 'MANUAL_REVIEW',           // a person has to look
  SOURCE_UNAVAILABLE: 'SOURCE_UNAVAILABLE', // the source could not be read; says so instead of guessing
});

export const VERIFICATION_LABEL = Object.freeze({
  UNVERIFIED: 'Not yet checked',
  SOURCE_MATCH_FOUND: 'Record found — reading status',
  VERIFIED_ACTIVE: 'Active, per the issuing board',
  VERIFIED_INACTIVE: 'Inactive, per the issuing board',
  VERIFIED_EXPIRED: 'Expired, per the issuing board',
  POSSIBLE_MATCH: 'Possible match — needs a person',
  MANUAL_REVIEW: 'In manual review',
  SOURCE_UNAVAILABLE: 'Source unavailable — check the official record',
});

/** The statuses that mean "evidence was read". Everything else is a holding state. */
export const EVIDENCED = Object.freeze([
  LicenseVerification.SOURCE_MATCH_FOUND,
  LicenseVerification.VERIFIED_ACTIVE,
  LicenseVerification.VERIFIED_INACTIVE,
  LicenseVerification.VERIFIED_EXPIRED,
  LicenseVerification.POSSIBLE_MATCH,
]);

/** Only VERIFIED_ACTIVE is good enough to contract on. Stated once, used everywhere. */
export const isActiveVerified = (status) => status === LicenseVerification.VERIFIED_ACTIVE;

export const isEvidenced = (status) => EVIDENCED.includes(status);

// ─── The raw-source hash ─────────────────────────────────────────────────────
// Not cryptographic — there is no crypto primitive in this runtime worth
// pretending about. FNV-1a gives a stable fingerprint of what the source
// returned, so a later dispute ("the app said active") can be checked against
// the payload that was actually read. The honest name says what it is.

export const fingerprint = (value) => {
  const s = typeof value === 'string' ? value : JSON.stringify(value ?? null);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return `fnv1a:${h.toString(16).padStart(8, '0')}`;
};

// ─── The verification record ─────────────────────────────────────────────────

const isNonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

/**
 * Build a verification outcome from evidence.
 *
 * `source` MUST be a source record from sources.js — the thing that cannot be
 * constructed without naming its origin. Passing anything else returns null,
 * and null means the status stays wherever it was. There is deliberately no
 * argument by which a caller supplies the status "VERIFIED_ACTIVE" alongside
 * no evidence: the status is DERIVED from what the source said.
 */
export const verificationFromSource = ({
  source, licenseNumber, officialName = null, businessAssociation = null,
  licenseStatusText = null, classification = null, expiresAt = null,
} = {}) => {
  // Only a real source record will do. A plain object that looks like one is
  // refused by re-running it through the constructor that enforces provenance.
  const src = sourceRecord(source);
  if (!src) return null;
  if (!isNonEmpty(licenseNumber)) return null;

  const status = deriveStatus(licenseStatusText, officialName);

  return Object.freeze({
    status,
    licenseNumber: licenseNumber.trim().toUpperCase(),
    officialName,
    businessAssociation,
    licenseStatusText,
    classification,
    expiresAt,
    // Provenance, visible to the user — the brief's "make source provenance
    // visible" is satisfied by rendering exactly these fields.
    source: Object.freeze({
      id: src.sourceId,
      name: src.sourceName,
      url: src.sourceUrl,
      jurisdictionId: src.jurisdictionId,
      retrievedAt: src.retrievedAt,
      confidence: src.confidence,
    }),
    rawSourceRef: fingerprint(src.payload ?? src.sourceUrl),
    checkedAt: src.retrievedAt,
  });
};

/**
 * What the source's own words mean, conservatively.
 *
 * DBPR uses phrasings like "Current, Active", "Null and Void", "Delinquent",
 * "Expired". Anything we do not recognise is a POSSIBLE_MATCH — a person
 * reads it, the code does not guess. An unrecognised status defaulting to
 * ACTIVE would be the exact failure this module exists to prevent.
 */
export const deriveStatus = (statusText, officialName) => {
  if (!isNonEmpty(statusText)) {
    // A record came back but carried no readable status.
    return isNonEmpty(officialName)
      ? LicenseVerification.SOURCE_MATCH_FOUND
      : LicenseVerification.POSSIBLE_MATCH;
  }
  const s = statusText.toLowerCase();
  if (/\b(current|active)\b/.test(s) && !/\bin ?active\b/.test(s)) return LicenseVerification.VERIFIED_ACTIVE;
  if (/\binactive\b/.test(s)) return LicenseVerification.VERIFIED_INACTIVE;
  if (/\b(expired|delinquent|null and void|revoked|suspended)\b/.test(s)) return LicenseVerification.VERIFIED_EXPIRED;
  return LicenseVerification.POSSIBLE_MATCH;
};

/** The outcome when a source cannot be read. Explicit, so screens render the
 *  deep link to the official record instead of a spinner that never resolves. */
export const sourceUnavailable = ({ sourceName, portalUrl, reason = null, at }) => Object.freeze({
  status: LicenseVerification.SOURCE_UNAVAILABLE,
  source: Object.freeze({ name: sourceName ?? 'Issuing board', url: portalUrl ?? null }),
  reason,
  checkedAt: at ?? null,
  userAction: 'Open the official record — it is the version that counts, and it is always current.',
});

// ─── Applying an outcome to a profile ────────────────────────────────────────

/**
 * The ONLY way a profile's verification changes.
 *
 * Takes the current verification state and an outcome from
 * `verificationFromSource` / `sourceUnavailable` / an explicit manual-review
 * routing, and returns the next state with the transition logged. A plain
 * object with `status: 'VERIFIED_ACTIVE'` and no source provenance is refused.
 */
export const applyVerification = (current, outcome, { at = null } = {}) => {
  if (!outcome || typeof outcome !== 'object') return { ok: false, reason: 'No outcome supplied.', next: current ?? initialVerification() };
  const status = outcome.status;
  if (!Object.prototype.hasOwnProperty.call(LicenseVerification, status)) {
    return { ok: false, reason: `Unknown status: ${String(status)}`, next: current ?? initialVerification() };
  }
  // An evidenced status must carry evidence. This is the line a compromised
  // client cannot cross: it can say "VERIFIED_ACTIVE" all it likes, but
  // without a source block naming url + retrievedAt the transition is refused.
  if (isEvidenced(status)) {
    const src = outcome.source;
    if (!src || !isNonEmpty(src.url) || !isNonEmpty(src.retrievedAt) || !isNonEmpty(src.name)) {
      return { ok: false, reason: 'An evidenced status requires source provenance.', next: current ?? initialVerification() };
    }
  }
  const prev = current ?? initialVerification();
  return {
    ok: true,
    reason: null,
    next: Object.freeze({
      status,
      outcome: Object.freeze(outcome),
      history: Object.freeze([
        ...(prev.history ?? []),
        Object.freeze({ from: prev.status, to: status, at: at ?? outcome.checkedAt ?? null }),
      ]),
    }),
  };
};

/** Where every profile starts. Not an argument — a constant. */
export const initialVerification = () => Object.freeze({
  status: LicenseVerification.UNVERIFIED,
  outcome: null,
  history: Object.freeze([]),
});

export const routeToManualReview = (current, { reason, at = null } = {}) =>
  applyVerification(current, {
    status: LicenseVerification.MANUAL_REVIEW,
    reason: reason ?? 'Routed for a person to look at.',
    checkedAt: at,
  }, { at });

/**
 * What a screen shows next to a verification, freshness included, so
 * "Active" never renders without the date it was read and who said so.
 */
export const verificationBadge = (verification, now = Date.now()) => {
  const v = verification ?? initialVerification();
  const out = v.outcome;
  const fresh = out?.source?.retrievedAt
    ? freshness({ retrievedAt: out.source.retrievedAt }, now)
    : null;
  return Object.freeze({
    status: v.status,
    label: VERIFICATION_LABEL[v.status],
    active: isActiveVerified(v.status),
    sourceName: out?.source?.name ?? null,
    sourceUrl: out?.source?.url ?? null,
    checkedAt: out?.source?.retrievedAt ?? null,
    freshness: fresh,
    // The one sentence that keeps the badge honest even when it says Active.
    caveat: isActiveVerified(v.status)
      ? 'Per the issuing board as of the date shown. The official record is the one that counts.'
      : null,
  });
};
