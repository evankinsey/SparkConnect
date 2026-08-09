// ─── THE VISUAL JOB LOG ──────────────────────────────────────────────────────
// Projects answers one question the moment it opens: what did I photograph on
// this job?
//
// It used to answer a different one — "what is a project and why should you
// make one" — in two paragraphs of explanatory copy that never went away, above
// a list of names with photo COUNTS rather than photos. A documentation tool
// whose main screen contains no documentation is a filing cabinet with the
// drawers welded shut.
//
// Hierarchy: CAMERA → RECENT PHOTOS → PROJECTS → CHECKLIST. Calculations,
// notes and reports live inside a project rather than competing with the
// photography on the way in.
//
// ── The idea worth keeping ──────────────────────────────────────────────────
//
// "Photograph it before it gets covered" was on the old screen as a sentence.
// A sentence is not a behaviour. What makes it a behaviour is that the app
// knows the stages are CHRONOLOGICAL AND IRREVERSIBLE: once the slab is poured
// the underground is gone, once the rock is up the rough-in is gone, and no
// amount of care next week gets either back. So the checklist does not merely
// report what is missing — it reports what is missing AND still possible, and
// separates it from what is already lost. Those are different problems and only
// one of them is actionable.
//
// Pure module: no React, no storage, no camera.

import { PhotoTag, photosInFolder } from './jobcam.js';

// ─── Stages, in the order a building buries them ─────────────────────────────

/**
 * The documentation stages, earliest-buried first.
 *
 * This is NOT the folder list. Folders are where a photo files; stages are what
 * a building does to your evidence over time. A service call has no rough-in
 * and a panel swap has no underground, so `appliesTo` keeps a checklist from
 * nagging somebody about a stage their job never had.
 */
export const Stage = Object.freeze({
  UNDERGROUND: 'UNDERGROUND',
  ROUGH_IN: 'ROUGH_IN',
  ABOVE_CEILING: 'ABOVE_CEILING',
  PANEL: 'PANEL',
  BEFORE_COVER: 'BEFORE_COVER',
  INSPECTION: 'INSPECTION',
  FINAL: 'FINAL',
});

export const STAGES = Object.freeze([
  Object.freeze({
    id: Stage.UNDERGROUND, label: 'Underground', tag: PhotoTag.UNDERGROUND, order: 0,
    buriedBy: 'backfill and the pour',
    why: 'Once it is covered the only record of depth, separation and the route is your photo.',
  }),
  Object.freeze({
    id: Stage.ROUGH_IN, label: 'Rough-in', tag: PhotoTag.ROUGH_IN, order: 1,
    buriedBy: 'drywall',
    why: 'Box heights, staples, home runs and what is in each bay. Gone the day the rock goes up.',
  }),
  Object.freeze({
    id: Stage.ABOVE_CEILING, label: 'Above ceiling', tag: PhotoTag.CONCEALED, order: 2,
    buriedBy: 'the grid and tile',
    why: 'Junction boxes have to stay accessible, and you will be asked where they are.',
  }),
  Object.freeze({
    id: Stage.PANEL, label: 'Panel', tag: PhotoTag.PANEL, order: 3,
    buriedBy: 'the deadfront and the directory',
    why: 'The inside of the can, before the cover goes on and the labels are your only clue.',
  }),
  Object.freeze({
    id: Stage.BEFORE_COVER, label: 'Before cover', tag: PhotoTag.CONCEALED, order: 4,
    buriedBy: 'trim and finishes',
    why: 'The last look at anything that is about to be closed up.',
  }),
  Object.freeze({
    id: Stage.INSPECTION, label: 'Inspection', tag: PhotoTag.INSPECTION, order: 5,
    buriedBy: null,
    why: 'The sticker, the sign-off, and anything the inspector pointed at.',
  }),
  Object.freeze({
    id: Stage.FINAL, label: 'Final', tag: PhotoTag.AFTER, order: 6,
    buriedBy: null,
    why: 'What you handed over, in the state you handed it over in.',
  }),
]);

export const stageById = (id) => STAGES.find((s) => s.id === id) ?? null;

/** Which stages a template's job actually passes through. */
export const STAGES_FOR_TEMPLATE = Object.freeze({
  NEW_CONSTRUCTION: Object.freeze([
    Stage.UNDERGROUND, Stage.ROUGH_IN, Stage.ABOVE_CEILING, Stage.PANEL,
    Stage.BEFORE_COVER, Stage.INSPECTION, Stage.FINAL,
  ]),
  SERVICE_CALL: Object.freeze([Stage.PANEL, Stage.INSPECTION, Stage.FINAL]),
  PANEL_UPGRADE: Object.freeze([Stage.PANEL, Stage.INSPECTION, Stage.FINAL]),
  CUSTOM: Object.freeze([Stage.ROUGH_IN, Stage.PANEL, Stage.BEFORE_COVER, Stage.FINAL]),
});

export const stagesForProject = (proj) => {
  const ids = STAGES_FOR_TEMPLATE[proj?.template] ?? STAGES_FOR_TEMPLATE.CUSTOM;
  return Object.freeze(STAGES.filter((s) => ids.includes(s.id)));
};

// ─── What is still possible, and what is already gone ────────────────────────

/**
 * The checklist, and the part that makes it a behaviour rather than a to-do.
 *
 * `reachedStage` is the furthest stage the job has evidence of. Anything EARLIER
 * than that with no photo is very likely buried already — telling somebody to go
 * photograph the underground on a job that has drywall up is advice they cannot
 * take, and an app that keeps nagging about impossible things gets its
 * notifications turned off.
 *
 * So the same missing stage is reported as URGENT while it can still be shot and
 * as MISSED once it cannot, and only the first is put in front of anybody.
 */
export const Coverage = Object.freeze({
  DONE: 'DONE',
  URGENT: 'URGENT',   // not photographed, still possible — this is the one to act on
  AHEAD: 'AHEAD',     // not photographed, not reached yet
  MISSED: 'MISSED',   // not photographed, and the job has moved past it
});

const photosWithTag = (proj, tag) =>
  (proj?.photos ?? []).filter((p) => Array.isArray(p?.tags) && p.tags.includes(tag));

export const documentationChecklist = (proj) => {
  const stages = stagesForProject(proj);
  const shot = new Map(stages.map((s) => [s.id, photosWithTag(proj, s.tag).length]));

  // The furthest stage with evidence. Nothing shot at all means the job has not
  // started as far as the record is concerned, so nothing is "missed" yet.
  const reached = stages.reduce(
    (max, s) => ((shot.get(s.id) ?? 0) > 0 && s.order > max ? s.order : max),
    -1,
  );

  const rows = stages.map((s) => {
    const count = shot.get(s.id) ?? 0;
    let state = Coverage.DONE;
    if (count === 0) {
      // Nothing shot at all: the FIRST stage of this job is the one to act on.
      // Marking everything AHEAD left a brand-new project suggesting nothing,
      // which is the moment somebody most needs to be told where to start.
      if (reached < 0) state = s.order === stages[0].order ? Coverage.URGENT : Coverage.AHEAD;
      else if (s.order < reached) state = Coverage.MISSED;
      else if (s.order === reached) state = Coverage.URGENT;
      else state = s.order === reached + 1 ? Coverage.URGENT : Coverage.AHEAD;
    }
    return Object.freeze({ ...s, count, state, done: count > 0 });
  });

  const urgent = rows.filter((r) => r.state === Coverage.URGENT);
  const missed = rows.filter((r) => r.state === Coverage.MISSED);
  const done = rows.filter((r) => r.done);

  return Object.freeze({
    rows: Object.freeze(rows),
    urgent: Object.freeze(urgent),
    missed: Object.freeze(missed),
    doneCount: done.length,
    total: rows.length,
    percent: rows.length ? Math.round((done.length / rows.length) * 100) : 0,
    // One sentence for the top of the project. Never scolds about the missed
    // ones — that photo cannot be taken now and saying so twice helps nobody.
    nudge: urgent.length
      ? `Shoot the ${urgent[0].label.toLowerCase()} before it is covered — ${urgent[0].buriedBy ? `${urgent[0].buriedBy} ends it` : 'it will not come round again'}.`
      : done.length === rows.length
        ? 'Every stage on this job is documented.'
        : null,
  });
};

// ─── The camera roll ─────────────────────────────────────────────────────────

/**
 * Every photo across every project, newest first.
 *
 * This is the feed the main screen opens on. It is derived rather than stored,
 * so it can never drift out of step with the projects it came from — and it
 * carries the project name down with each photo, because "ROUGH-IN, Westview
 * Office, today" is the caption that makes a grid legible and a bare thumbnail
 * that is not.
 */
export const recentPhotos = (projects = [], limit = 12) => {
  const out = [];
  for (const proj of Array.isArray(projects) ? projects : []) {
    for (const p of proj?.photos ?? []) {
      if (!p?.uri) continue;
      out.push(Object.freeze({
        id: p.id,
        uri: p.uri,
        projectId: proj.id,
        projectName: proj.name,
        capturedAt: p.capturedAt,
        // The overlay caption, in the order it reads: what it is, then where.
        label: photoLabel(p),
        tags: Object.freeze([...(p.tags ?? [])]),
        note: p.note ?? '',
      }));
    }
  }
  return Object.freeze(
    out
      .sort((a, b) => String(b.capturedAt ?? '').localeCompare(String(a.capturedAt ?? '')))
      .slice(0, Math.max(0, limit)),
  );
};

/** The overlay on a thumbnail. A stage tag if it has one, otherwise honest. */
export const photoLabel = (p) => {
  const tags = Array.isArray(p?.tags) ? p.tags : [];
  const stage = STAGES.find((s) => tags.includes(s.tag));
  if (stage) return stage.label.toUpperCase();
  if (tags.length) return String(tags[0]).replace(/_/g, ' ').toUpperCase();
  return 'UNTAGGED';
};

/** Relative time, for a caption that reads like speech. */
export const whenLabel = (iso, now = new Date()) => {
  const t = new Date(iso || 0).getTime();
  if (!Number.isFinite(t) || t <= 0) return '';
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const day = 86400000;
  if (t >= start.getTime()) {
    return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  if (t >= start.getTime() - day) return 'Yesterday';
  if (t >= start.getTime() - day * 7) {
    return new Date(t).toLocaleDateString([], { weekday: 'long' });
  }
  return new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' });
};

/**
 * A project as a card: cover photo plus a few thumbnails.
 *
 * The cover is the pinned photo if there is one, otherwise the most recent —
 * "most recent" is a better default than "first", because a job in progress
 * looks like what it looks like now.
 */
export const projectCard = (proj, { previews = 3 } = {}) => {
  const photos = (proj?.photos ?? []).filter((p) => p?.uri);
  const sorted = [...photos].sort((a, b) => String(b.capturedAt ?? '').localeCompare(String(a.capturedAt ?? '')));
  const pinned = sorted.find((p) => p.pinned) ?? null;
  return Object.freeze({
    id: proj?.id,
    name: proj?.name ?? 'Untitled',
    address: proj?.address ?? null,
    cover: pinned?.uri ?? sorted[0]?.uri ?? null,
    previews: Object.freeze(sorted.filter((p) => p.uri !== (pinned?.uri ?? sorted[0]?.uri)).slice(0, previews).map((p) => p.uri)),
    photoCount: photos.length,
    updatedAt: proj?.updatedAt ?? null,
    // A project with no photos is not a failure, it is a project that has not
    // been to site yet, and it should say the useful thing rather than "0".
    emptyNote: photos.length === 0 ? 'No photos yet — start with the panel or the rough-in.' : null,
  });
};

// ─── Capture ─────────────────────────────────────────────────────────────────

/**
 * What is asked immediately after the shutter.
 *
 * Tagging at capture is the entire difference between this and the camera roll.
 * A photo tagged three weeks later is tagged from memory; one tagged while you
 * are still standing in front of the thing is tagged from the thing.
 *
 * Kept SHORT on purpose. Eight choices you can hit with a thumb in a dark
 * crawlspace, not a taxonomy.
 */
export const CAPTURE_TAGS = Object.freeze([
  { id: Stage.ROUGH_IN, label: 'Rough-in', tag: PhotoTag.ROUGH_IN },
  { id: Stage.PANEL, label: 'Panel', tag: PhotoTag.PANEL },
  { id: Stage.UNDERGROUND, label: 'Underground', tag: PhotoTag.UNDERGROUND },
  { id: Stage.ABOVE_CEILING, label: 'Above ceiling', tag: PhotoTag.CONCEALED },
  { id: Stage.BEFORE_COVER, label: 'Before cover', tag: PhotoTag.CONCEALED },
  { id: Stage.INSPECTION, label: 'Inspection', tag: PhotoTag.INSPECTION },
  { id: 'PROBLEM', label: 'Problem', tag: PhotoTag.DAMAGE },
  { id: 'OTHER', label: 'Other', tag: null },
]);

/**
 * The draft between the shutter and Save.
 *
 * `askAi` defaults OFF. A photo of somebody's panel is theirs, and sending it
 * anywhere has to be a thing they chose rather than a default they did not
 * notice — every other toggle in this app that touches somebody else's property
 * works the same way.
 */
export const captureDraft = ({ uri, projectId = null, tagId = null, area = '', note = '', askAi = false } = {}) =>
  Object.freeze({
    uri: uri ?? null,
    projectId,
    tagId,
    area: String(area ?? '').slice(0, 60),
    note: String(note ?? '').slice(0, 200),
    askAi: !!askAi,
  });

/** Can this be saved, and if not, what is missing? */
export const captureBlocker = (draft) => {
  if (!draft?.uri) return 'No photo to save.';
  if (!draft.projectId) return 'Pick a project so this photo can be found later.';
  return null;
};

/** The draft as the fields `addPhoto` expects. Tags land in `tags`, never in `suggestedTags`. */
export const captureToPhoto = (draft) => {
  if (captureBlocker(draft)) return null;
  const t = CAPTURE_TAGS.find((c) => c.id === draft.tagId);
  const noteParts = [];
  if (draft.area) noteParts.push(draft.area);
  if (draft.note) noteParts.push(draft.note);
  return Object.freeze({
    uri: draft.uri,
    tags: t?.tag ? [t.tag] : [],
    note: noteParts.join(' — '),
    area: draft.area || null,
  });
};

// ─── The explainer that goes away ────────────────────────────────────────────

/**
 * Whether to still explain what this tab is for.
 *
 * Onboarding copy that never leaves is a permanent tax on the people who use a
 * feature most. Once somebody has photographed a few things they have
 * understood it, and the space belongs to their work instead.
 */
export const EXPLAINER_RETIRES_AFTER = 3;

export const showExplainer = (projects = []) => {
  const total = (Array.isArray(projects) ? projects : [])
    .reduce((n, p) => n + (p?.photos?.length ?? 0), 0);
  return total < EXPLAINER_RETIRES_AFTER;
};

export const EXPLAINER = Object.freeze({
  headline: 'Make documentation a habit',
  sub: 'Photograph it before it gets covered. Future you — and your inspector — will thank you.',
  points: Object.freeze([
    { icon: 'camera', label: 'Fast capture', sub: 'One tap, tagged on the spot' },
    { icon: 'folder', label: 'Organised', sub: 'By project and stage' },
    { icon: 'time', label: 'Always ready', sub: 'Find it a year later' },
  ]),
});
