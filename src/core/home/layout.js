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
  { id: 'streak', kind: CardKind.WIDGET, title: 'Streak', sub: 'Days in a row', icon: 'flame', group: 'Daily' },

  // Training
  { id: 'wiring_lab', kind: CardKind.SHORTCUT, tab: 'wiringlab', title: 'Wiring Simulator', sub: 'Wire it, then test it', icon: 'git-network', group: 'Training' },
  { id: 'troubleshoot', kind: CardKind.SHORTCUT, tab: 'troubleshoot', title: 'Troubleshooting', sub: 'Find the fault', icon: 'build', group: 'Training' },
  // The job site game had NO card here at all. It was reachable from exactly one
  // hardcoded banner on Home, which meant it could not be customized, could not
  // be found by anyone who scrolled past the banner once, and did not exist as
  // far as the catalog was concerned.
  { id: 'jobsite', kind: CardKind.SHORTCUT, tab: 'jobsite', title: 'Job Site', sub: 'Walk the site, do the work', icon: 'business', group: 'Training' },
  { id: 'flashcards', kind: CardKind.SHORTCUT, tab: 'flashcards', title: 'Flashcards', sub: 'Spaced repetition', icon: 'albums', group: 'Training' },
  { id: 'examprep', kind: CardKind.SHORTCUT, tab: 'examprep', title: 'Code Quiz', sub: 'Exam practice', icon: 'ribbon', group: 'Training' },
  { id: 'learn', kind: CardKind.SHORTCUT, tab: 'learn', title: 'Study Paths', sub: 'Apprentice to master, in order', icon: 'school', group: 'Training' },

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
  { id: 'projects', kind: CardKind.SHORTCUT, tab: 'projects', title: 'Projects', sub: 'Everything on one job', icon: 'folder-open', group: 'Work' },
  { id: 'materials', kind: CardKind.SHORTCUT, tab: 'materials', title: 'Material List', sub: 'Build it, send it', icon: 'cart', group: 'Work' },
  { id: 'community', kind: CardKind.SHORTCUT, tab: 'community', title: 'Community', sub: 'Questions and jobs', icon: 'people', group: 'Work' },
  // Job Cam is the camera inside a project now, so the card points at Projects.
  // Kept under its own id so a saved layout holding 'jobcam' still resolves
  // instead of vanishing from that user's Home.
  { id: 'jobcam', kind: CardKind.SHORTCUT, tab: 'projects', title: 'Job Cam', sub: 'Photos, inside your projects', icon: 'camera', group: 'Work' },
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

// ─── ALL TOOLS ───────────────────────────────────────────────────────────────
//
// The fix for the bug that migrateLayout below only patched.
//
// Discovery must never depend on a saved list. `migrateLayout` gets new cards
// in front of existing users once, which is worth having, but it is a patch on
// a broken premise: that a tool is reachable only if its id happens to be in an
// array written on the day the user first opened the app.
//
// So Home has two zones now.
//
//   YOUR HOME  — the saved layout. The user's arrangement, theirs to order.
//   ALL TOOLS  — this. Every navigable card in the catalog, always, whatever is
//                saved, whatever Customize says.
//
// Customize controls order and favourites. It no longer controls whether a tool
// exists. Adding a row to HOME_CARDS is now the ONLY thing needed to make a
// feature reachable — no migration entry, no version bump, no user action.

/**
 * Display order for the tools list. Ids not named here still appear, after
 * these, in catalog order — so forgetting to add an id costs you placement,
 * never visibility. That asymmetry is deliberate: the failure mode of this
 * list must be "in the wrong place", never "gone".
 */
export const ALL_TOOLS_ORDER = Object.freeze([
  'spark_ai',
  'calculators',
  'wiring_lab', 'troubleshoot', 'jobsite',
  'projects', 'jobcam', 'estimator',
  'permits', 'blueprint', 'panelschedule', 'materials',
  'bend', 'volt', 'ampacity', 'boxfill', 'conduitfill', 'wire', 'formulas',
  'learn', 'flashcards', 'examprep',
  'community',
]);

/**
 * Every card a user can actually navigate to.
 *
 * Widgets are excluded because they are not destinations — `streak` and
 * `daily_question` render their own content on Home and tapping them goes
 * nowhere. Listing them here would produce rows that look tappable and are not.
 */
export const allTools = () => {
  const navigable = HOME_CARDS.filter((c) => c.kind === CardKind.SHORTCUT && c.tab);
  const rank = (id) => {
    const i = ALL_TOOLS_ORDER.indexOf(id);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return navigable
    .map((card, i) => ({ card, i }))
    .sort((a, b) => (rank(a.card.id) - rank(b.card.id)) || (a.i - b.i))
    .map(({ card }) => card);
};

/** The same list, grouped for section headers, groups in first-appearance order. */
export const allToolsGrouped = () => {
  const groups = new Map();
  for (const card of allTools()) {
    if (!groups.has(card.group)) groups.set(card.group, []);
    groups.get(card.group).push(card);
  }
  return [...groups.entries()].map(([group, cards]) => ({ group, cards }));
};

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

/**
 * Home layout schema version. Bump it to put a new card into existing users'
 * OWN strip, at the top of Home, rather than only in All Tools.
 *
 * This is now a promotion mechanism, not a safety net. Since `allTools()` above
 * renders the whole catalog unconditionally, a card that is never listed here
 * is still one scroll away — it just does not jump the queue into the user's
 * curated strip. Reserve that for things worth interrupting someone over.
 *
 * The original bug, for the record: `useHomeLayout` restores the SAVED layout
 * and `sanitizeLayout` keeps only ids already in it, so every card added after
 * a user's first launch was invisible to them forever. Blueprint Takeoff,
 * Permit Assistant and Panel Schedule were all lost that way and looked like
 * they had never shipped.
 */
export const LAYOUT_VERSION = 3;

/**
 * Cards introduced in each version. A user migrating from an older version gets
 * everything introduced after it appended to their layout, once.
 *
 * Appended, never prepended: a returning user's own arrangement is theirs, and
 * new things belong at the end where they are discoverable without shoving the
 * user's choices down the screen.
 */
export const CARDS_INTRODUCED_IN = Object.freeze({
  2: ['blueprint', 'permits', 'panelschedule'],
  // The job site game existed for several releases with no catalog entry at all.
  // It is worth a place in the strip rather than only in All Tools.
  3: ['jobsite'],
});

/**
 * Bring a saved layout up to date. Returns the same array when there is nothing
 * to add, so callers can skip a write.
 */
export const migrateLayout = (saved, fromVersion = 1) => {
  const base = sanitizeLayout(saved);
  const from = Number.isFinite(fromVersion) ? fromVersion : 1;
  if (from >= LAYOUT_VERSION) return base;

  const additions = [];
  for (let v = from + 1; v <= LAYOUT_VERSION; v++) {
    for (const id of CARDS_INTRODUCED_IN[v] ?? []) {
      if (cardById(id) && !base.includes(id) && !additions.includes(id)) additions.push(id);
    }
  }
  if (additions.length === 0) return base;
  // sanitizeLayout does NOT enforce MAX_CARDS, so the cap is applied here.
  // A user sitting at the cap has curated their Home deliberately; silently
  // pushing three more cards past the limit they were given is worse than
  // leaving them to add what they want from Customize.
  return sanitizeLayout([...base, ...additions]).slice(0, MAX_CARDS);
};
