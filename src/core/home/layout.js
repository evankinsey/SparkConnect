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
  { id: 'daily_challenge', kind: CardKind.WIDGET, title: 'Daily Field Challenge', sub: 'Rotates daily — code, bends, faults', icon: 'flame', group: 'Daily' },
  { id: 'daily_question', kind: CardKind.WIDGET, title: 'Daily Code Question', sub: "Today's NEC question", icon: 'school', group: 'Daily' },
  { id: 'streak', kind: CardKind.WIDGET, title: 'Streak & Rank', sub: 'Progress at a glance', icon: 'trophy', group: 'Daily' },

  // Training
  { id: 'wiring_lab', kind: CardKind.SHORTCUT, tab: 'wiringlab', title: 'Wiring Lab', sub: 'Wire it, then test it', icon: 'git-network', group: 'Training' },
  { id: 'troubleshoot', kind: CardKind.SHORTCUT, tab: 'troubleshoot', title: 'Troubleshooting', sub: 'Find the fault', icon: 'build', group: 'Training' },
  { id: 'flashcards', kind: CardKind.SHORTCUT, tab: 'flashcards', title: 'Flashcards', sub: 'Spaced repetition', icon: 'albums', group: 'Training' },
  { id: 'examprep', kind: CardKind.SHORTCUT, tab: 'examprep', title: 'Code Quiz', sub: 'Exam practice', icon: 'ribbon', group: 'Training' },

  // Tools
  { id: 'spark_ai', kind: CardKind.SHORTCUT, tab: 'necai', title: 'Spark AI', sub: 'Electrical field assistant', icon: 'flash', group: 'Tools' },
  { id: 'bend', kind: CardKind.SHORTCUT, tab: 'bend', title: 'Pipe Bending', sub: '90° · offsets · saddles', icon: 'git-branch', group: 'Tools' },
  { id: 'volt', kind: CardKind.SHORTCUT, tab: 'volt', title: 'Voltage Drop', sub: 'Single and three phase', icon: 'trending-down', group: 'Tools' },
  { id: 'boxfill', kind: CardKind.SHORTCUT, tab: 'boxfill', title: 'Box Fill', sub: 'NEC 314.16', icon: 'cube', group: 'Tools' },
  { id: 'conduitfill', kind: CardKind.SHORTCUT, tab: 'conduitfill', title: 'Conduit Fill', sub: 'Chapter 9', icon: 'ellipse', group: 'Tools' },
  { id: 'ampacity', kind: CardKind.SHORTCUT, tab: 'ampacity', title: 'Ampacity', sub: 'Table 310.16', icon: 'speedometer', group: 'Tools' },
  { id: 'wire', kind: CardKind.SHORTCUT, tab: 'wire', title: 'Wire Colors', sub: 'Colour codes + panel view', icon: 'color-palette', group: 'Tools' },
  { id: 'formulas', kind: CardKind.SHORTCUT, tab: 'formulas', title: 'Formulas', sub: "Ohm's Law · 3Φ · motors", icon: 'book', group: 'Tools' },
  { id: 'calculators', kind: CardKind.SHORTCUT, tab: 'calculators', title: 'All Calculators', sub: 'Everything in one list', icon: 'calculator', group: 'Tools' },

  // Work
  { id: 'projects', kind: CardKind.SHORTCUT, tab: 'projects', title: 'Projects', sub: 'Job records and photos', icon: 'folder-open', group: 'Work' },
  { id: 'materials', kind: CardKind.SHORTCUT, tab: 'materials', title: 'Material List', sub: 'Build it, send it', icon: 'cart', group: 'Work' },
  { id: 'community', kind: CardKind.SHORTCUT, tab: 'community', title: 'Community', sub: 'Questions and jobs', icon: 'people', group: 'Work' },
  { id: 'jobcam', kind: CardKind.SHORTCUT, tab: 'jobcam', title: 'Job Cam', sub: 'Document the job', icon: 'camera', group: 'Work' },
  { id: 'estimator', kind: CardKind.SHORTCUT, tab: 'estimator', title: 'Estimator', sub: 'Material and labour', icon: 'hammer', group: 'Work' },
]);

export const CARD_IDS = HOME_CARDS.map((c) => c.id);
export const cardById = (id) => HOME_CARDS.find((c) => c.id === id) ?? null;

/** Sensible starting Home. Everything else is one tap away in Customize. */
export const DEFAULT_LAYOUT = Object.freeze([
  'daily_challenge', 'wiring_lab', 'spark_ai', 'bend', 'troubleshoot', 'calculators',
]);

// ONB-04 — role tunes the default order. It never hides anything permanently
// (ONB-05); every card stays available in Customize.
export const ROLE_LAYOUTS = Object.freeze({
  apprentice: ['daily_challenge', 'wiring_lab', 'flashcards', 'bend', 'wire', 'spark_ai'],
  journeyman: ['daily_challenge', 'calculators', 'troubleshoot', 'spark_ai', 'bend', 'jobcam'],
  foreman: ['jobcam', 'estimator', 'calculators', 'spark_ai', 'daily_challenge', 'volt'],
  contractor: ['estimator', 'jobcam', 'spark_ai', 'calculators', 'daily_challenge', 'bend'],
  instructor: ['daily_challenge', 'examprep', 'wiring_lab', 'troubleshoot', 'flashcards', 'streak'],
  student: ['daily_challenge', 'wiring_lab', 'flashcards', 'examprep', 'troubleshoot', 'streak'],
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
