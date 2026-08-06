// ─── HOME LAYOUT ─────────────────────────────────────────────────────────────
// Requirements: UI-11, ONB-04 · "customize your home screen"
//
// Home is a list of cards the user chooses and orders. Everything — the daily
// challenge, a game, a calculator — is a card with an id. Adding a feature to
// Home later means adding a row to the catalog, not editing a screen.
//
// Pure: no React, no storage. The screen renders what this returns.

export const CardKind = {
  WIDGET: 'WIDGET',       // renders its own content (challenge, streak)
  SHORTCUT: 'SHORTCUT',   // navigates to a tab
};

/**
 * Everything that can live on Home.
 * `tab` must be a real entry in App.js VALID_TABS for SHORTCUT cards.
 */
export const HOME_CARDS = Object.freeze([
  // Widgets
  // daily_challenge was removed from the catalog on purpose: with the Daily
  // Code Question pinned to the top of Home it read as the same widget twice.
  // sanitizeLayout drops unknown ids, so saved layouts self-heal on load.
  { id: 'daily_question', kind: CardKind.WIDGET, title: 'Daily Code Question', sub: "Today's NEC question", icon: 'school', group: 'Daily' },
  { id: 'streak', kind: CardKind.WIDGET, title: 'Streak & Rank', sub: 'Progress at a glance', icon: 'trophy', group: 'Daily' },

  // Training
  { id: 'wiring_lab', kind: CardKind.SHORTCUT, tab: 'wiringlab', title: 'Wiring Simulator', sub: 'Wire it, then test it', icon: 'git-network', group: 'Training' },
  { id: 'troubleshoot', kind: CardKind.SHORTCUT, tab: 'troubleshoot', title: 'Troubleshooting', sub: 'Find the fault', icon: 'build', group: 'Training' },
  { id: 'flashcards', kind: CardKind.SHORTCUT, tab: 'flashcards', title: 'Flashcards', sub: 'Spaced repetition', icon: 'albums', group: 'Training' },
  { id: 'examprep', kind: CardKind.SHORTCUT, tab: 'examprep', title: 'Code Quiz', sub: 'Exam practice', icon: 'ribbon', group: 'Training' },

  // Tools
  { id: 'spark_ai', kind: CardKind.SHORTCUT, tab: 'necai', title: 'SparkAI', sub: 'Electrical field assistant', icon: 'flash', group: 'Tools' },
  { id: 'bend', kind: CardKind.SHORTCUT, tab: 'bend', title: 'Pipe Bending', sub: '90° · offsets · saddles', icon: 'git-branch', group: 'Tools' },
  { id: 'volt', kind: CardKind.SHORTCUT, tab: 'volt', title: 'Voltage Drop', sub: 'Single and three phase', icon: 'trending-down', group: 'Tools' },
  { id: 'boxfill', kind: CardKind.SHORTCUT, tab: 'boxfill', title: 'Box Fill', sub: 'NEC 314.16', icon: 'cube', group: 'Tools' },
  { id: 'conduitfill', kind: CardKind.SHORTCUT, tab: 'conduitfill', title: 'Conduit Fill', sub: 'Chapter 9', icon: 'ellipse', group: 'Tools' },
  { id: 'ampacity', kind: CardKind.SHORTCUT, tab: 'ampacity', title: 'Ampacity', sub: 'Table 310.16', icon: 'speedometer', group: 'Tools' },
  { id: 'wire', kind: CardKind.SHORTCUT, tab: 'wire', title: 'Wire Colors', sub: 'Colour codes + panel view', icon: 'color-palette', group: 'Tools' },
  { id: 'formulas', kind: CardKind.SHORTCUT, tab: 'formulas', title: 'Formulas', sub: "Ohm's Law · 3Φ · motors", icon: 'book', group: 'Tools' },
  { id: 'calculators', kind: CardKind.SHORTCUT, tab: 'calculators', title: 'All Calculators', sub: 'Everything in one list', icon: 'calculator', group: 'Tools' },
  { id: 'permits', kind: CardKind.SHORTCUT, tab: 'permits', title: 'Permit Assistant', sub: 'What to expect, what to ask', icon: 'document-text', group: 'Work' },
  { id: 'blueprint', kind: CardKind.SHORTCUT, tab: 'blueprint', title: 'Blueprint Takeoff', sub: 'Shoot the sheet, count devices', icon: 'documents', group: 'Work' },
  { id: 'panelschedule', kind: CardKind.SHORTCUT, tab: 'panelschedule', title: 'Panel Schedule', sub: 'Build it, balance it, share it', icon: 'grid', group: 'Work' },

  // Work
  { id: 'projects', kind: CardKind.SHORTCUT, tab: 'projects', title: 'Projects', sub: 'Job records and photos', icon: 'folder-open', group: 'Work' },
  { id: 'materials', kind: CardKind.SHORTCUT, tab: 'materials', title: 'Material List', sub: 'Build it, send it', icon: 'cart', group: 'Work' },
  { id: 'community', kind: CardKind.SHORTCUT, tab: 'community', title: 'Community', sub: 'Questions and jobs', icon: 'people', group: 'Work' },
  { id: 'jobcam', kind: CardKind.SHORTCUT, tab: 'jobcam', title: 'Job Cam', sub: 'Document the job', icon: 'camera', group: 'Work' },
  { id: 'estimator', kind: CardKind.SHORTCUT, tab: 'estimator', title: 'Estimator', sub: 'Material and labour', icon: 'hammer', group: 'Work' },
]);

export const CARD_IDS = HOME_CARDS.map((c) => c.id);
export const cardById = (id) => HOME_CARDS.find((c) => c.id === id) ?? null;

/** Sensible starting Home. The Daily Question, Quick Tools, Wiring Simulator
 *  and Sparky search are pinned by HomeScreen itself, so the default strip
 *  covers the work side. Everything else is one tap away in Customize. */
export const DEFAULT_LAYOUT = Object.freeze([
  'calculators', 'jobcam', 'estimator',
]);

// ONB-04 — role tunes the default order. It never hides anything permanently
// (ONB-05); every card stays available in Customize.
export const ROLE_LAYOUTS = Object.freeze({
  apprentice: ['flashcards', 'examprep', 'bend', 'wire'],
  journeyman: ['calculators', 'bend', 'jobcam', 'volt'],
  foreman: ['jobcam', 'estimator', 'calculators', 'projects'],
  contractor: ['estimator', 'jobcam', 'calculators', 'projects'],
  instructor: ['examprep', 'flashcards', 'streak', 'calculators'],
  student: ['flashcards', 'examprep', 'streak', 'wire'],
});

export const layoutForRole = (role) =>
  [...(ROLE_LAYOUTS[String(role ?? '').toLowerCase()] ?? DEFAULT_LAYOUT)];

/** Drops unknown ids and duplicates, so a stale saved layout can never break Home. */
export const sanitizeLayout = (ids) => {
  if (!Array.isArray(ids)) return [...DEFAULT_LAYOUT];
  const seen = new Set();
  const out = [];
  for (const id of ids) {
    if (typeof id !== 'string' || seen.has(id) || !CARD_IDS.includes(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
};

export const MAX_CARDS = 12;

export const addCard = (layout, id) => {
  const current = sanitizeLayout(layout);
  if (current.includes(id) || !CARD_IDS.includes(id) || current.length >= MAX_CARDS) return current;
  return [...current, id];
};

export const removeCard = (layout, id) => sanitizeLayout(layout).filter((x) => x !== id);

export const moveCard = (layout, id, direction) => {
  const current = sanitizeLayout(layout);
  const i = current.indexOf(id);
  if (i < 0) return current;
  const j = direction === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= current.length) return current;
  const next = [...current];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
};

/** Resolved cards for rendering. */
export const resolveLayout = (ids) => sanitizeLayout(ids).map(cardById).filter(Boolean);

/** Catalog for the Customize screen, grouped, with an `on` flag. */
export const catalogWithState = (layout) => {
  const current = sanitizeLayout(layout);
  const groups = new Map();
  for (const card of HOME_CARDS) {
    if (!groups.has(card.group)) groups.set(card.group, []);
    groups.get(card.group).push({ ...card, on: current.includes(card.id) });
  }
  return [...groups.entries()].map(([group, cards]) => ({ group, cards }));
};
