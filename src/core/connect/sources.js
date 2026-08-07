// ─── SOURCE RECORDS ──────────────────────────────────────────────────────────
// The spine of ContractorConnect: nothing exists in this system unless it can
// say where it came from.
//
// The brief's first requirement is "never fake data", and the way to honour that
// is not care — it is making a record without provenance IMPOSSIBLE TO
// CONSTRUCT. `sourceRecord()` returns null when the provenance is incomplete.
// There is no path that produces a contractor, a licence or a permit with a
// blank source field, because the constructor refuses.
//
// That matters more here than anywhere else in the app. A wrong conduit fill is
// caught by an electrician who knows the answer. A fabricated licence status
// tells someone a contractor is insured and current when they are neither, and
// the person who finds out is a homeowner with a fire.
//
// WHAT THIS FILE DOES NOT DO: fetch anything. Adapters declare how a source
// WOULD be read and what shape it returns. Whether a given source is actually
// wired is `adapter.status`, and an adapter with no live implementation reports
// DEEP_LINK_ONLY — the honest state for a portal that a person must open
// themselves.
//
// Pure module: no React, no network. Fetching lives in the adapter
// implementations, behind an injected client, so this stays testable.

export const SourceKind = Object.freeze({
  STATE_LICENSE_BOARD: 'STATE_LICENSE_BOARD',
  COUNTY_PERMIT_PORTAL: 'COUNTY_PERMIT_PORTAL',
  CITY_PERMIT_PORTAL: 'CITY_PERMIT_PORTAL',
  OPEN_DATA_PORTAL: 'OPEN_DATA_PORTAL',
  USER_SUBMITTED: 'USER_SUBMITTED',
});

/**
 * How an adapter can currently be used.
 *
 * DEEP_LINK_ONLY is not a failure state and is not temporary shame — for a
 * portal with no API, sending the user to the official record IS the correct
 * product. It is better than a stale copy, and it is the only version that
 * cannot be wrong.
 */
export const AdapterStatus = Object.freeze({
  LIVE: 'LIVE',                     // implemented, fetching, returning records
  DEEP_LINK_ONLY: 'DEEP_LINK_ONLY', // no API; we hand the user the official page
  PLANNED: 'PLANNED',               // declared, not implemented
  UNAVAILABLE: 'UNAVAILABLE',       // the source went away or blocked access
});

export const Confidence = Object.freeze({
  OFFICIAL: 'OFFICIAL',       // straight from the authority's own system
  DERIVED: 'DERIVED',         // computed by us from official records
  SUBMITTED: 'SUBMITTED',     // a person told us
  UNKNOWN: 'UNKNOWN',
});

// ─── The record ──────────────────────────────────────────────────────────────

const isNonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

/**
 * Wrap any externally sourced fact.
 *
 * Returns null rather than throwing, because the caller is usually a loop over
 * a source's rows and one malformed row should be dropped and counted, not
 * allowed to kill an import. `rejectedReason` on the batch result says why.
 */
export const sourceRecord = (input) => {
  // A default parameter only fires on `undefined`, so `sourceRecord(null)` would
  // throw on destructuring — and a null row is exactly what a real feed hands
  // you. Crashing the import on one bad row is the failure this module exists
  // to stop, so null is rejected like any other incomplete record.
  if (input === null || typeof input !== 'object') return null;
  const {
    sourceId, sourceName, sourceUrl, jurisdictionId,
    retrievedAt, lastVerifiedAt = null, sourceIdentifier = null,
    confidence = Confidence.UNKNOWN, payload = null, attribution = null,
  } = input;
  // Every one of these is required. A record that cannot name its origin is
  // exactly the thing this product must never produce.
  if (!isNonEmpty(sourceId)) return null;
  if (!isNonEmpty(sourceName)) return null;
  if (!isNonEmpty(sourceUrl)) return null;
  if (!isNonEmpty(jurisdictionId)) return null;
  if (!isNonEmpty(retrievedAt)) return null;
  if (!Object.prototype.hasOwnProperty.call(Confidence, confidence)) return null;
  if (!isHttps(sourceUrl)) return null;

  return Object.freeze({
    sourceId,
    sourceName,
    sourceUrl,
    jurisdictionId,
    retrievedAt,
    lastVerifiedAt,
    sourceIdentifier,
    confidence,
    // Who to credit, and who to blame if the number is wrong. Defaults to the
    // source's own name rather than to us.
    attribution: attribution ?? sourceName,
    payload: payload === null ? null : Object.freeze(payload),
  });
};

/**
 * Only https, and no credentials in the URL.
 *
 * A source URL is rendered as a tappable link and is the thing we tell people
 * to trust over us. An http link is a downgrade attack waiting to happen, and
 * `https://user:pass@host` in a shipped constant is a leaked credential.
 */
export const isHttps = (url) => {
  if (typeof url !== 'string') return false;
  if (!/^https:\/\//i.test(url)) return false;
  if (/^https:\/\/[^/@]*@/i.test(url)) return false;
  return true;
};

/** How old is this, in whole days? Null when we cannot tell. */
export const ageInDays = (record, now = Date.now()) => {
  const t = Date.parse(record?.retrievedAt ?? '');
  if (Number.isNaN(t)) return null;
  return Math.floor((now - t) / 86400000);
};

export const STALE_AFTER_DAYS = 30;

/**
 * Freshness, stated rather than implied.
 *
 * A licence status from six months ago is not a licence status. Every rendered
 * record carries this so "Active" never appears without a date beside it.
 */
export const freshness = (record, now = Date.now()) => {
  const days = ageInDays(record, now);
  if (days === null) {
    return Object.freeze({ known: false, days: null, stale: true, label: 'Age unknown' });
  }
  const stale = days >= STALE_AFTER_DAYS;
  return Object.freeze({
    known: true,
    days,
    stale,
    label: days === 0 ? 'Checked today'
      : days === 1 ? 'Checked yesterday'
        : `Checked ${days} days ago`,
    warning: stale
      ? 'This is old enough that it may have changed. Open the official record before relying on it.'
      : null,
  });
};

// ─── Adapters ────────────────────────────────────────────────────────────────

/**
 * A source adapter. Declares what a source is and how it would be read.
 *
 * `search` and `fetchOne` are optional: an adapter with neither is DEEP_LINK_ONLY
 * and must supply `deepLink`, so there is always SOMETHING the product can do
 * with a source — even one we cannot automate.
 */
export const adapter = (def) => {
  if (!isNonEmpty(def?.id) || !isNonEmpty(def?.name)) return null;
  if (!Object.prototype.hasOwnProperty.call(SourceKind, def.kind)) return null;
  if (!isHttps(def.portalUrl ?? '')) return null;

  const hasFetch = typeof def.search === 'function' || typeof def.fetchOne === 'function';
  const status = def.status ?? (hasFetch ? AdapterStatus.LIVE : AdapterStatus.DEEP_LINK_ONLY);

  // Claiming LIVE without an implementation is the one inconsistency that would
  // make the coverage dashboard lie, so it is refused outright.
  if (status === AdapterStatus.LIVE && !hasFetch) return null;
  if ((status === AdapterStatus.DEEP_LINK_ONLY || status === AdapterStatus.PLANNED)
      && typeof def.deepLink !== 'function') return null;

  return Object.freeze({
    id: def.id,
    name: def.name,
    kind: def.kind,
    jurisdictionId: def.jurisdictionId ?? null,
    portalUrl: def.portalUrl,
    status,
    search: def.search ?? null,
    fetchOne: def.fetchOne ?? null,
    deepLink: def.deepLink ?? (() => def.portalUrl),
    // Stated by us, about the source — not a legal opinion.
    terms: def.terms ?? 'Public record. Open the official portal for the authoritative version.',
    notes: def.notes ?? null,
  });
};

export const createRegistry = () => {
  const adapters = new Map();

  const register = (a) => {
    if (!a) return { ok: false, reason: 'Invalid adapter — it was rejected by adapter().' };
    if (adapters.has(a.id)) return { ok: false, reason: `Duplicate adapter id: ${a.id}` };
    adapters.set(a.id, a);
    return { ok: true, reason: null };
  };

  const forJurisdiction = (jurisdictionId) =>
    [...adapters.values()].filter((a) => a.jurisdictionId === jurisdictionId);

  /**
   * What this product can actually do today, per source.
   *
   * The internal coverage screen renders this. It is deliberately blunt: a
   * dashboard that rounds PLANNED up to something friendlier is how a team
   * convinces itself it has coverage it does not have.
   */
  const coverage = () => {
    const rows = [...adapters.values()].map((a) => Object.freeze({
      id: a.id, name: a.name, kind: a.kind, jurisdictionId: a.jurisdictionId,
      status: a.status,
      canSearch: typeof a.search === 'function',
      canFetchOne: typeof a.fetchOne === 'function',
      portalUrl: a.portalUrl,
    }));
    const by = (s) => rows.filter((r) => r.status === s).length;
    return Object.freeze({
      rows: Object.freeze(rows),
      total: rows.length,
      live: by(AdapterStatus.LIVE),
      deepLinkOnly: by(AdapterStatus.DEEP_LINK_ONLY),
      planned: by(AdapterStatus.PLANNED),
      unavailable: by(AdapterStatus.UNAVAILABLE),
      // The number that matters, and the one it would be easiest to dress up.
      liveRecordSources: by(AdapterStatus.LIVE),
    });
  };

  return {
    register,
    get: (id) => adapters.get(id) ?? null,
    all: () => [...adapters.values()],
    forJurisdiction,
    coverage,
  };
};

// ─── Normalising a batch ─────────────────────────────────────────────────────

/**
 * Turn adapter output into source records, counting what was dropped.
 *
 * A silent drop is how a "1,200 contractors" number becomes a lie. Rejects are
 * returned with their reason so the coverage screen can show the import as
 * partial rather than as clean.
 */
export const normalizeBatch = (rows, wrap) => {
  const kept = [];
  const rejected = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    let record = null;
    try { record = sourceRecord(wrap(row)); } catch { record = null; }
    if (record) kept.push(record);
    else rejected.push({ row, reason: 'Incomplete provenance — refused by sourceRecord().' });
  }
  return Object.freeze({
    records: Object.freeze(kept),
    rejected: Object.freeze(rejected),
    total: (Array.isArray(rows) ? rows : []).length,
    complete: rejected.length === 0,
  });
};

export const ATTRIBUTION_NOTICE =
  'Records shown here are public information published by the authority named on each one. '
  + 'SparkConnect does not own, certify or guarantee them. The official record is the one that counts.';
