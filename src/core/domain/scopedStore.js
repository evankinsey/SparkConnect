// ─── SCOPED STORE ────────────────────────────────────────────────────────────
// Turn a one-record tool into a per-job tool without losing the one record.
//
// The material list and the panel schedule each save a single global blob. That
// was right when the app was a bag of calculators, and it is why four sections
// of the project hub read empty: the data exists, it just does not know which
// job it belongs to.
//
// The migration is the whole risk here. A user has a material list open right
// now — 60 lines they typed on site — and the moment this ships, that list has
// to still be there. So:
//
//   THE LEGACY RECORD IS NEVER DISCARDED AND NEVER GUESSED AT. It becomes the
//   record for `projectId: null` — the unfiled job. It stays fully editable, it
//   shows up in the app exactly where it did before, and the user can attach it
//   to a real project later if they want to. What this does NOT do is quietly
//   assign it to whichever project happens to be open, because that would file
//   a stranger's takeoff under someone's job and nothing would say so.
//
// Reading is tolerant and writing is strict: any shape at all comes in, exactly
// one shape goes out.
//
// Pure module: no React, no storage — the caller owns AsyncStorage.

export const SCOPED_VERSION = 2;

/** The unfiled scope: work that predates projects, or was never attached. */
export const UNFILED = null;

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Parse whatever is in storage into records.
 *
 * @param raw            the string from AsyncStorage, or null
 * @param legacyToRecord (parsed) => data | null — how to read the OLD single-blob
 *                       shape. Returning null means "there was nothing to keep".
 */
export const readScoped = (raw, { legacyToRecord = null } = {}) => {
  let parsed = null;
  if (typeof raw === 'string' && raw) {
    try { parsed = JSON.parse(raw); } catch { parsed = null; }
  } else if (isPlainObject(raw) || Array.isArray(raw)) {
    parsed = raw;
  }
  if (parsed === null || parsed === undefined) {
    return { records: [], migrated: false };
  }

  // Already scoped.
  if (isPlainObject(parsed) && Number.isFinite(parsed.version) && Array.isArray(parsed.records)) {
    return { records: parsed.records.filter(isPlainObject).map(normalize), migrated: false };
  }

  // The old single-record shape. Keep it, as the unfiled job.
  const data = legacyToRecord ? legacyToRecord(parsed) : parsed;
  if (!data || !isPlainObject(data)) return { records: [], migrated: false };
  return {
    records: [normalize({ ...data, projectId: UNFILED })],
    migrated: true,
  };
};

const normalize = (r) => ({
  ...r,
  projectId: typeof r.projectId === 'string' && r.projectId ? r.projectId : UNFILED,
  updatedAt: Number.isFinite(r.updatedAt) ? r.updatedAt : Date.now(),
});

export const writeScoped = (records) => JSON.stringify({
  version: SCOPED_VERSION,
  records: (records ?? []).filter(isPlainObject).map(normalize),
});

/** The record for one job, or null. `UNFILED` is a scope like any other. */
export const recordFor = (records, projectId = UNFILED) => {
  const want = typeof projectId === 'string' && projectId ? projectId : UNFILED;
  return (records ?? []).find((r) => r.projectId === want) ?? null;
};

/** Add or replace one job's record. One record per job, by construction. */
export const upsertRecord = (records, projectId, data, { at = null } = {}) => {
  const want = typeof projectId === 'string' && projectId ? projectId : UNFILED;
  const rest = (records ?? []).filter((r) => r.projectId !== want);
  return [...rest, normalize({ ...data, projectId: want, updatedAt: at ?? Date.now() })];
};

export const removeRecord = (records, projectId) => {
  const want = typeof projectId === 'string' && projectId ? projectId : UNFILED;
  return (records ?? []).filter((r) => r.projectId !== want);
};

/**
 * Attach unfiled work to a real job.
 *
 * Refuses rather than merges if the target job already has a record — silently
 * combining two material lists loses whichever one it decides to drop, and the
 * user is the only one who knows which is current.
 */
export const attachUnfiled = (records, projectId) => {
  if (typeof projectId !== 'string' || !projectId) {
    return { ok: false, reason: 'No project selected.', records };
  }
  const unfiled = recordFor(records, UNFILED);
  if (!unfiled) return { ok: false, reason: 'There is nothing unfiled to attach.', records };
  if (recordFor(records, projectId)) {
    return { ok: false, reason: 'That job already has one. Attaching would overwrite it.', records };
  }
  return {
    ok: true,
    reason: null,
    records: [...records.filter((r) => r.projectId !== UNFILED), normalize({ ...unfiled, projectId })],
  };
};

/** Everything, for the hub — which reads by projectId and ignores the rest. */
export const allRecords = (records) => Object.freeze([...(records ?? [])]);

// ─── Legacy adapters ─────────────────────────────────────────────────────────
//
// Shared rather than written at each call site. Two screens and the project hub
// all read the same store, and an adapter that disagrees with its twin about
// what counts as "worth keeping" produces a record in one place and not the
// other — which reads as data loss even though nothing was lost.

export const LegacyAdapters = Object.freeze({
  /** The old `{ items, waste }` material blob. An empty list is not a list. */
  materials: (old) => (Array.isArray(old?.items) && old.items.length
    ? { items: old.items, waste: Number.isFinite(old.waste) ? old.waste : 0 }
    : null),

  /** The old single panel. A panel with no size was never really saved. */
  panel: (old) => (isPlainObject(old) && Number.isFinite(old.size) ? old : null),
});
