// ─── JOB CAM 2.0 ─────────────────────────────────────────────────────────────
// Photos become project documentation instead of a camera roll.
//
// The organising idea: a photo's value is its CONTEXT, not the image. A picture
// of a wall is worthless; a picture of a wall tagged "rough-in, bedroom 2,
// before drywall, 12 March" is evidence you can bill from and defend an
// inspection with.

export const ProjectTemplate = {
  NEW_CONSTRUCTION: 'NEW_CONSTRUCTION',
  SERVICE_CALL: 'SERVICE_CALL',
  PANEL_UPGRADE: 'PANEL_UPGRADE',
  UNDERGROUND: 'UNDERGROUND',
  CUSTOM: 'CUSTOM',
};

// Each template seeds folders and a suggested-shot list, which is what turns an
// empty state into something that teaches the value of the feature (UI-10).
export const TEMPLATES = Object.freeze({
  NEW_CONSTRUCTION: {
    label: 'New Construction',
    folders: ['Plans', 'Rough-In', 'Concealed Work', 'Trim', 'Inspection', 'Final'],
    suggested: ['Plan sheet', 'Panel location', 'Rough-in before drywall', 'Box heights',
      'Concealed splices', 'Home run labels', 'Inspection sticker', 'Finished devices'],
  },
  SERVICE_CALL: {
    label: 'Service Call',
    folders: ['Before', 'Diagnosis', 'Repair', 'After'],
    suggested: ['Existing condition', 'Panel directory', 'Meter reading', 'Failed component',
      'Replacement installed', 'Work area left clean'],
  },
  PANEL_UPGRADE: {
    label: 'Panel Upgrade',
    folders: ['Before', 'Service', 'Grounding', 'New Panel', 'Inspection'],
    suggested: ['Existing panel and directory', 'Service entrance', 'Meter base',
      'Grounding electrode connections', 'Bonding', 'New panel with directory', 'Labels'],
  },
  UNDERGROUND: {
    label: 'Underground / Sitework',
    folders: ['Trench', 'Conduit', 'Backfill', 'Inspection'],
    suggested: ['Trench depth with tape measure in frame', 'Conduit in trench',
      'Warning tape', 'Sweep radii', 'Backfill', 'As-built measurements from a fixed point'],
  },
  CUSTOM: { label: 'Custom', folders: ['Photos'], suggested: [] },
});

export const PhotoTag = {
  BEFORE: 'BEFORE', AFTER: 'AFTER', PANEL: 'PANEL', ROUGH_IN: 'ROUGH_IN', TRIM: 'TRIM',
  UNDERGROUND: 'UNDERGROUND', CONCEALED: 'CONCEALED', BLUEPRINT: 'BLUEPRINT',
  INSPECTION: 'INSPECTION', WARRANTY: 'WARRANTY', LABEL: 'LABEL', SERVICE: 'SERVICE',
  EV_CHARGER: 'EV_CHARGER', TRANSFORMER: 'TRANSFORMER', CONDUIT: 'CONDUIT', DAMAGE: 'DAMAGE',
};

export const project = ({ id, name, template = ProjectTemplate.CUSTOM, createdAt, customerId = null, address = null }) => {
  const t = TEMPLATES[template] ?? TEMPLATES.CUSTOM;
  return {
    id, name, template, createdAt, updatedAt: createdAt,
    customerId,
    address,            // stays local; never sent to analytics or AI
    folders: t.folders.map((label, i) => ({ id: `f${i + 1}`, label })),
    suggestedShots: t.suggested,
    photos: [],
    archived: false,
    linkedEstimateId: null,
    linkedInvoiceId: null,
  };
};

export const photo = ({
  id, uri, capturedAt, folderId = null, tags = [], note = '',
  voiceNoteUri = null, voiceNoteSeconds = null, pinned = false, favourite = false,
  width = null, height = null,
}) => ({
  id, uri, capturedAt, folderId,
  tags: [...new Set(tags)],
  note, voiceNoteUri, voiceNoteSeconds,
  pinned, favourite,
  width, height,
  // Populated later by on-device classification. Kept separate from `tags` so a
  // user's own tag is never overwritten by a guess.
  suggestedTags: [],
  suggestionConfidence: null,
});

export const addPhoto = (proj, p) => ({
  ...proj,
  photos: [...proj.photos, p],
  updatedAt: p.capturedAt,
});

export const tagPhoto = (proj, photoId, tags) => ({
  ...proj,
  photos: proj.photos.map((p) =>
    p.id === photoId ? { ...p, tags: [...new Set([...p.tags, ...tags])] } : p),
});

export const setFolder = (proj, photoId, folderId) => ({
  ...proj,
  photos: proj.photos.map((p) => (p.id === photoId ? { ...p, folderId } : p)),
});

export const togglePinned = (proj, photoId) => ({
  ...proj,
  photos: proj.photos.map((p) => (p.id === photoId ? { ...p, pinned: !p.pinned } : p)),
});

/**
 * Accept a suggested tag. Suggestions never apply themselves — an auto-tag that
 * is wrong on an inspection photo is worse than no tag at all.
 */
export const acceptSuggestedTag = (proj, photoId, tag) => ({
  ...proj,
  photos: proj.photos.map((p) => (p.id === photoId
    ? { ...p, tags: [...new Set([...p.tags, tag])], suggestedTags: p.suggestedTags.filter((t) => t !== tag) }
    : p)),
});

/** Photos in a folder, pinned first, then newest. */
export const photosInFolder = (proj, folderId) =>
  proj.photos
    .filter((p) => p.folderId === folderId)
    .sort((a, b) => (b.pinned - a.pinned) || String(b.capturedAt).localeCompare(String(a.capturedAt)));

export const findPhotos = (proj, { tags = [], folderId = null, favouritesOnly = false, query = '' } = {}) => {
  const q = query.trim().toLowerCase();
  return proj.photos.filter((p) => {
    if (folderId && p.folderId !== folderId) return false;
    if (favouritesOnly && !p.favourite) return false;
    if (tags.length && !tags.every((t) => p.tags.includes(t))) return false;
    if (q && !`${p.note} ${p.tags.join(' ')}`.toLowerCase().includes(q)) return false;
    return true;
  });
};

/**
 * Before/after pairs within a folder — the most shareable artefact Job Cam
 * produces, and the one contractors actually want to send a customer.
 */
export const beforeAfterPairs = (proj) => {
  const pairs = [];
  for (const folder of proj.folders) {
    const inFolder = proj.photos.filter((p) => p.folderId === folder.id);
    const before = inFolder.filter((p) => p.tags.includes(PhotoTag.BEFORE));
    const after = inFolder.filter((p) => p.tags.includes(PhotoTag.AFTER));
    const n = Math.min(before.length, after.length);
    for (let i = 0; i < n; i++) {
      pairs.push({ folderId: folder.id, folderLabel: folder.label, before: before[i], after: after[i] });
    }
  }
  return pairs;
};

/** Suggested shots not yet covered by any tag — a live checklist. */
export const missingShots = (proj) => {
  const covered = new Set(proj.photos.flatMap((p) => p.tags));
  const tagFor = (shot) => shot.toUpperCase().replace(/[^A-Z]+/g, '_');
  return proj.suggestedShots.filter((s) => !covered.has(tagFor(s)));
};

export const projectStats = (proj) => ({
  photoCount: proj.photos.length,
  taggedCount: proj.photos.filter((p) => p.tags.length > 0).length,
  withNotes: proj.photos.filter((p) => p.note || p.voiceNoteUri).length,
  folders: proj.folders.length,
  pairs: beforeAfterPairs(proj).length,
  // A documentation-quality nudge rather than a score: untagged photos are the
  // ones that will be useless in six months.
  untagged: proj.photos.filter((p) => p.tags.length === 0).length,
});

/** Search records so Job Cam appears in global search (SourceKind.PHOTO). */
export const toSearchRecords = (proj) =>
  proj.photos.map((p) => ({
    id: `${proj.id}:${p.id}`,
    kind: 'PHOTO',
    title: p.note || p.tags.join(', ') || 'Untitled photo',
    subtitle: proj.name,
    keywords: [...p.tags, proj.name],
    route: `jobcam/${proj.id}/${p.id}`,
    updatedAt: p.capturedAt,
    body: '',
  }));
