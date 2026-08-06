// ─── PROJECTS ABSORBS JOB CAM ────────────────────────────────────────────────
// Contractors do not think "I want Job Cam". They think "I'm working on
// Starbucks", and everything about Starbucks belongs in one place.
//
// Two project systems shipped by accident and ran in parallel:
//
//   @sc_cam_projects / @sc_cam_photos   flat  { id, name, created } + photos
//   @sc_projects_v1                     rich  templates, folders, tags, shots
//
// A user with photos in the first one could not see them in the second, and
// nothing said so. This module folds the first into the second, once, without
// losing anything.
//
// The rules the migration obeys, in priority order:
//
//   1. NEVER lose a photo. Not to a name collision, not to a missing parent
//      project, not to malformed JSON. A photo whose project vanished goes to
//      "Unfiled" rather than being dropped — a lost jobsite photo is
//      unrecoverable evidence, and the user cannot tell it is gone.
//   2. Idempotent. Running it twice changes nothing, because a half-finished
//      migration that re-runs on next launch must not duplicate 200 photos.
//   3. One-way and non-destructive. Legacy storage is left intact; this returns
//      the new state and the caller decides when to clear the old keys.
//
// Pure module: no React, no storage. The screen does the I/O.

import { project as makeProject, photo as makePhoto, ProjectTemplate } from './jobcam.js';

/** Where photos go when their project is gone or was never named. */
export const UNFILED_PROJECT_NAME = 'Unfiled';

/** Marks a project/photo that arrived from the old Job Cam store. */
export const MIGRATION_SOURCE = 'jobcam-v1';

const asArray = (value) => (Array.isArray(value) ? value : []);

/** Parse whatever was in AsyncStorage without ever throwing. */
export const parseLegacy = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Corrupt JSON is not a reason to lose the rest of the migration.
    return [];
  }
};

const toTimestamp = (value, fallback) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Date.parse(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
};

/**
 * Convert one legacy photo. Returns null only when there is no image to keep —
 * a record with no uri is not a photo, it is a stray row.
 */
export const convertPhoto = (legacy, { now = Date.now() } = {}) => {
  if (!legacy || typeof legacy !== 'object') return null;
  const uri = typeof legacy.uri === 'string' ? legacy.uri.trim() : '';
  if (!uri) return null;

  const note = [legacy.label, legacy.note]
    .filter((s) => typeof s === 'string' && s.trim())
    .join(' — ')
    .slice(0, 2000);

  return {
    ...makePhoto({
      id: String(legacy.id ?? `mig_${uri.slice(-12)}_${now}`),
      uri,
      capturedAt: toTimestamp(legacy.timestamp ?? legacy.capturedAt ?? legacy.created, now),
      note,
    }),
    // Provenance, so a photo that shows up in an unexpected project can be
    // traced back rather than guessed about.
    migratedFrom: MIGRATION_SOURCE,
    legacyProjectId: legacy.projectId != null ? String(legacy.projectId) : null,
  };
};

const normalizeName = (name) =>
  (typeof name === 'string' ? name : '').trim().toLowerCase();

/**
 * Fold the legacy Job Cam store into the rich Projects list.
 *
 * @returns {{ projects, report }} — `report` is what the UI tells the user,
 *          and what a support conversation is reconstructed from.
 */
export const mergeJobCamIntoProjects = (existingProjects, legacyProjects, legacyPhotos, { now = Date.now() } = {}) => {
  const projects = asArray(existingProjects).map((p) => ({
    ...p,
    photos: asArray(p.photos),
    folders: asArray(p.folders),
  }));
  const camProjects = parseLegacy(legacyProjects);
  const camPhotos = parseLegacy(legacyPhotos);

  const report = {
    photosSeen: camPhotos.length,
    photosMigrated: 0,
    photosAlreadyPresent: 0,
    photosWithoutImage: 0,
    photosUnfiled: 0,
    projectsCreated: 0,
    projectsMatched: 0,
  };

  // Every photo uri already in the rich store, so re-running cannot duplicate.
  // Matching on uri rather than id because the legacy id space is timestamps
  // and two devices could collide, while a file uri is what actually identifies
  // the image on disk.
  const existingUris = new Set();
  for (const p of projects) for (const ph of p.photos) if (ph?.uri) existingUris.add(ph.uri);

  const byLegacyId = new Map();
  const byName = new Map(projects.map((p) => [normalizeName(p.name), p]));

  // Pass 1 — make sure every legacy project has a home in the new store.
  for (const cam of camProjects) {
    if (!cam || typeof cam !== 'object') continue;
    const name = (typeof cam.name === 'string' && cam.name.trim()) || 'Untitled job';
    const key = normalizeName(name);

    let target = byName.get(key);
    if (target) {
      report.projectsMatched += 1;
    } else {
      target = {
        ...makeProject({
          id: `p_mig_${String(cam.id ?? name).slice(0, 24)}_${now}`,
          name,
          template: ProjectTemplate.CUSTOM,
          createdAt: toTimestamp(cam.created ?? cam.createdAt, now),
        }),
        migratedFrom: MIGRATION_SOURCE,
      };
      projects.push(target);
      byName.set(key, target);
      report.projectsCreated += 1;
    }
    if (cam.id != null) byLegacyId.set(String(cam.id), target);
  }

  // Pass 2 — place every photo.
  let unfiled = null;
  const ensureUnfiled = () => {
    if (unfiled) return unfiled;
    const existing = byName.get(normalizeName(UNFILED_PROJECT_NAME));
    if (existing) { unfiled = existing; return unfiled; }
    unfiled = {
      ...makeProject({
        id: `p_unfiled_${now}`,
        name: UNFILED_PROJECT_NAME,
        template: ProjectTemplate.CUSTOM,
        createdAt: now,
      }),
      migratedFrom: MIGRATION_SOURCE,
    };
    projects.push(unfiled);
    byName.set(normalizeName(UNFILED_PROJECT_NAME), unfiled);
    report.projectsCreated += 1;
    return unfiled;
  };

  for (const legacy of camPhotos) {
    const converted = convertPhoto(legacy, { now });
    if (!converted) { report.photosWithoutImage += 1; continue; }
    if (existingUris.has(converted.uri)) { report.photosAlreadyPresent += 1; continue; }

    // A photo whose project was deleted still has to land somewhere. This is
    // the case that would otherwise silently drop evidence.
    let target = converted.legacyProjectId ? byLegacyId.get(converted.legacyProjectId) : null;
    if (!target) { target = ensureUnfiled(); report.photosUnfiled += 1; }

    target.photos = [...target.photos, converted];
    target.updatedAt = Math.max(Number(target.updatedAt) || 0, converted.capturedAt);
    existingUris.add(converted.uri);
    report.photosMigrated += 1;
  }

  report.complete = true;
  report.nothingToDo = report.photosMigrated === 0 && report.projectsCreated === 0;
  return { projects, report };
};

/**
 * Safety check for the caller: is it safe to clear the legacy keys?
 *
 * Only when every legacy photo that HAS an image is now present in the new
 * store. Deleting the old data because a migration "looked fine" is how photos
 * disappear, so the caller is required to prove it first.
 */
export const legacyStoreIsFullyMigrated = (projects, legacyPhotos) => {
  const uris = new Set();
  for (const p of asArray(projects)) for (const ph of asArray(p.photos)) if (ph?.uri) uris.add(ph.uri);
  const legacy = parseLegacy(legacyPhotos)
    .filter((l) => l && typeof l.uri === 'string' && l.uri.trim());
  return legacy.every((l) => uris.has(l.uri.trim()));
};

/** One sentence for the UI after a migration runs. */
export const migrationMessage = (report) => {
  if (!report || report.nothingToDo) return null;
  const bits = [];
  if (report.photosMigrated) {
    bits.push(`${report.photosMigrated} photo${report.photosMigrated === 1 ? '' : 's'} moved into Projects`);
  }
  if (report.projectsCreated) {
    bits.push(`${report.projectsCreated} project${report.projectsCreated === 1 ? '' : 's'} created`);
  }
  if (report.photosUnfiled) {
    bits.push(`${report.photosUnfiled} filed under "${UNFILED_PROJECT_NAME}" because the original job was gone`);
  }
  return bits.length ? `${bits.join(', ')}.` : null;
};
