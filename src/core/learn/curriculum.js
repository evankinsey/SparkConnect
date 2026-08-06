// ─── LEARN CURRICULUM ────────────────────────────────────────────────────────
// "Netflix for electricians" — the shelf, not the shows.
//
// This file is the CATALOG and the progression rules. It deliberately does not
// contain lesson content: the tracks below point at things the app can already
// do (wiring lessons, troubleshooting scenarios, flashcards, the code quiz) or
// are marked as not built yet. A track that promises content the app cannot
// deliver is worse than a shorter list, so `available` is a first-class field
// and the screen has to respect it.
//
// Ordering is a real dependency graph, not a vibe: you cannot meaningfully
// study motor controls before you can read a three-way. `requires` encodes
// that, and `unlockedTracks` walks it.
//
// Pure module: no React, no storage.

export const Level = {
  APPRENTICE: 'APPRENTICE',
  JOURNEYMAN: 'JOURNEYMAN',
  FOREMAN: 'FOREMAN',
  MASTER: 'MASTER',
};

export const LEVEL_ORDER = [Level.APPRENTICE, Level.JOURNEYMAN, Level.FOREMAN, Level.MASTER];

export const LEVEL_LABEL = Object.freeze({
  [Level.APPRENTICE]: 'Apprentice',
  [Level.JOURNEYMAN]: 'Journeyman',
  [Level.FOREMAN]: 'Foreman',
  [Level.MASTER]: 'Master',
});

/**
 * `tab` is where the track actually sends you. `available: false` means the
 * shelf shows it as coming, greyed, with no tap target — an honest empty shelf
 * beats a dead link.
 */
export const TRACKS = Object.freeze([
  {
    id: 'fundamentals', title: 'Fundamentals', level: Level.APPRENTICE,
    sub: 'Ohm\'s law, conductors, the tools', icon: 'school',
    tab: 'flashcards', requires: [], available: true,
  },
  {
    id: 'residential-wiring', title: 'Residential Wiring', level: Level.APPRENTICE,
    sub: 'Switch loops, three-way, four-way', icon: 'git-network',
    tab: 'wiringlab', requires: ['fundamentals'], available: true,
  },
  {
    id: 'troubleshooting', title: 'Troubleshooting', level: Level.JOURNEYMAN,
    sub: 'Read the symptom, find the fault', icon: 'build',
    tab: 'troubleshoot', requires: ['residential-wiring'], available: true,
  },
  {
    id: 'code-exam', title: 'Code & Exam Prep', level: Level.JOURNEYMAN,
    sub: 'NEC navigation and practice exams', icon: 'ribbon',
    tab: 'examprep', requires: ['fundamentals'], available: true,
  },
  {
    id: 'estimating', title: 'Estimating', level: Level.FOREMAN,
    sub: 'Takeoff, assemblies, labor units, bids', icon: 'documents',
    tab: 'blueprint', requires: ['residential-wiring'], available: true,
  },
  {
    id: 'permits-inspections', title: 'Permits & Inspections', level: Level.FOREMAN,
    sub: 'What to pull, what to expect, what to ask', icon: 'document-text',
    tab: 'permits', requires: ['residential-wiring'], available: true,
  },
  // Not built. Listed because the shelf is the roadmap, greyed because
  // promising a track the app cannot open is how you lose trust.
  { id: 'commercial', title: 'Commercial', level: Level.JOURNEYMAN, sub: 'Pipe, pull, and panel work at scale', icon: 'business', tab: null, requires: ['residential-wiring'], available: false },
  { id: 'industrial', title: 'Industrial', level: Level.FOREMAN, sub: 'Three phase, transformers, distribution', icon: 'cog', tab: null, requires: ['commercial'], available: false },
  { id: 'motor-controls', title: 'Motor Controls', level: Level.FOREMAN, sub: 'Starters, contactors, ladder logic', icon: 'sync', tab: null, requires: ['industrial'], available: false },
  { id: 'plc', title: 'PLC', level: Level.MASTER, sub: 'Programmable control', icon: 'hardware-chip', tab: null, requires: ['motor-controls'], available: false },
  { id: 'solar-ev', title: 'Solar & EV', level: Level.JOURNEYMAN, sub: 'PV, storage, EVSE', icon: 'sunny', tab: null, requires: ['residential-wiring'], available: false },
  { id: 'fire-alarm', title: 'Fire Alarm', level: Level.JOURNEYMAN, sub: 'Initiating, notification, supervision', icon: 'flame', tab: null, requires: ['commercial'], available: false },
  { id: 'blueprints', title: 'Blueprint Reading', level: Level.JOURNEYMAN, sub: 'Symbols, schedules, one-lines', icon: 'map', tab: null, requires: ['residential-wiring'], available: false },
  { id: 'business', title: 'Business & Leadership', level: Level.MASTER, sub: 'Running crews, running a company', icon: 'people', tab: null, requires: ['estimating'], available: false },
]);

export const trackById = (id) => TRACKS.find((t) => t.id === id) ?? null;

export const tracksByLevel = () =>
  LEVEL_ORDER.map((level) => ({
    level,
    label: LEVEL_LABEL[level],
    tracks: TRACKS.filter((t) => t.level === level),
  })).filter((g) => g.tracks.length > 0);

export const emptyLearnProgress = () => ({ completed: [] });

/** Drop unknown ids so a stale save cannot unlock or break anything. */
export const sanitizeLearnProgress = (raw) => {
  const known = new Set(TRACKS.map((t) => t.id));
  const completed = Array.isArray(raw?.completed)
    ? [...new Set(raw.completed.filter((id) => known.has(id)))]
    : [];
  return { completed };
};

/**
 * A track is unlocked when every prerequisite is complete. Unavailable tracks
 * are never unlocked, regardless of prerequisites — there is nothing to open.
 */
export const isUnlocked = (trackId, progress) => {
  const track = trackById(trackId);
  if (!track || !track.available) return false;
  const done = new Set(sanitizeLearnProgress(progress).completed);
  return track.requires.every((r) => done.has(r));
};

export const unlockedTracks = (progress) => TRACKS.filter((t) => isUnlocked(t.id, progress));

/** The single next thing worth doing — what the shelf should push. */
export const nextUpTrack = (progress) => {
  const done = new Set(sanitizeLearnProgress(progress).completed);
  return TRACKS.find((t) => t.available && !done.has(t.id) && t.requires.every((r) => done.has(r))) ?? null;
};

export const completeTrack = (progress, trackId) => {
  const p = sanitizeLearnProgress(progress);
  if (!trackById(trackId) || p.completed.includes(trackId)) return p;
  return { completed: [...p.completed, trackId] };
};

export const curriculumPercent = (progress) => {
  const total = TRACKS.filter((t) => t.available).length;
  if (total === 0) return 0;
  const done = sanitizeLearnProgress(progress).completed
    .filter((id) => trackById(id)?.available).length;
  return Math.round((done / total) * 100);
};

/** Which level the user is working in, for the header. */
export const currentLevel = (progress) => {
  const done = new Set(sanitizeLearnProgress(progress).completed);
  for (const level of LEVEL_ORDER) {
    const inLevel = TRACKS.filter((t) => t.level === level && t.available);
    if (inLevel.some((t) => !done.has(t.id))) return level;
  }
  return Level.MASTER;
};
