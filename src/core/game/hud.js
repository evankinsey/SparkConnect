// ─── JOB SITE HUD ────────────────────────────────────────────────────────────
// What is on screen while you are playing, and — the part that actually
// matters on a phone — what is NOT.
//
// THE MISTAKE THIS MODULE EXISTS TO AVOID. The reference mockup is a desktop
// composition: task list, minimap, next-step card, XP bar, currency, crew
// portraits, dialogue and a five-slot dock, all visible at once. It looks
// superb as a still image and it would be claustrophobic on an iPhone — those
// panels cover roughly 40% of a 6.1" screen, and every one of them covers the
// thing you are trying to walk around.
//
// So the layout is a hierarchy, not a copy:
//
//   ALWAYS      level and XP, the current objective, the stick, one action
//               button. Four things. You can play with only these.
//   ONE TAP     task list, minimap, inventory, tutorials. Real panels, opened
//               deliberately, closed by the same tap.
//   TRANSIENT   dialogue and sign-off. Arrives, is read, leaves.
//
// That gives the mockup's visual language without its density.
//
// THE SAFE AREA IS NOT POLISH. The stick sat at `bottom: 0`, which on every
// iPhone since the X puts its lower third under the home indicator — you drag
// down to walk down and the OS eats the gesture or dismisses the app. A control
// you cannot use in the direction you need is a broken control, so the floor
// below is a hard minimum rather than a nicety.
//
// Pure module: no React, no Dimensions, no Platform. The screen passes its
// measurements in and renders what comes back.

export const Panel = Object.freeze({
  NONE: 'NONE',
  TASKS: 'TASKS',
  MAP: 'MAP',
  INVENTORY: 'INVENTORY',
  TUTORIALS: 'TUTORIALS',
  SCORE: 'SCORE',
});

/** The dock, in the order it reads. `always` never collapses on a small screen. */
export const DOCK = Object.freeze([
  Object.freeze({ id: Panel.TASKS, label: 'Tasks', icon: 'list', always: true }),
  Object.freeze({ id: Panel.MAP, label: 'Map', icon: 'map', always: true }),
  Object.freeze({ id: Panel.INVENTORY, label: 'Inventory', icon: 'cube', always: false }),
  Object.freeze({ id: Panel.TUTORIALS, label: 'Learn', icon: 'book', always: false }),
  Object.freeze({ id: Panel.SCORE, label: 'Score', icon: 'trophy', always: false }),
]);

// ─── The glass ───────────────────────────────────────────────────────────────
// One palette, because a HUD assembled from ad-hoc rgba strings is what makes a
// game read as "React Native rectangles" rather than as a designed surface.
// Layering is deliberate: three fill depths, one border, one lift.

export const HUD = Object.freeze({
  // Panel fills, darkest at the back.
  glass: 'rgba(5,10,18,0.88)',
  glassRaised: 'rgba(12,19,30,0.94)',
  glassDeep: 'rgba(3,6,12,0.92)',
  // A single hairline that catches light along the top edge of every panel.
  edge: 'rgba(255,255,255,0.10)',
  edgeStrong: 'rgba(255,255,255,0.18)',

  // Roles, not decorations.
  objective: '#22C55E',   // progress, completion, the path
  warn: '#F59E0B',        // needs you, not yet done
  system: '#3B82F6',      // navigation and app chrome
  danger: '#EF4444',

  text: '#F2F5F8',
  textSec: '#8FA3B8',     // muted blue-grey, not grey
  textDim: 'rgba(242,245,248,0.45)',

  radius: 14,
  radiusSm: 12,
  radiusLg: 18,
});

/**
 * Panel styling as one object, so no screen hand-rolls a glass panel.
 * `raised` is for the sheet that sits over the world; the default sits on it.
 */
export const panelStyle = ({ raised = false, deep = false } = {}) => Object.freeze({
  backgroundColor: deep ? HUD.glassDeep : raised ? HUD.glassRaised : HUD.glass,
  borderRadius: raised ? HUD.radiusLg : HUD.radius,
  borderWidth: 1,
  borderColor: raised ? HUD.edgeStrong : HUD.edge,
  // Restrained on purpose. A heavy drop shadow on a dark panel over a dark
  // world reads as a smudge, not as depth.
  shadowColor: '#000',
  shadowOpacity: raised ? 0.45 : 0.3,
  shadowRadius: raised ? 18 : 10,
  shadowOffset: { width: 0, height: raised ? 8 : 4 },
  elevation: raised ? 12 : 6,
});

// ─── Safe geometry ───────────────────────────────────────────────────────────

/** Below this the home indicator owns the gesture, whatever we draw there. */
export const HOME_INDICATOR_MIN = 34;

/**
 * Breathing room above it, so the stick's lower travel is still reachable.
 *
 * Raised from 22 after playing build 33: clearing the home indicator is the
 * floor, not the target. A stick resting that close to the bottom edge is one
 * you steer with the very tip of a thumb, and pulling DOWN — walking south, the
 * direction you use most on a map that is wider than it is tall — runs out of
 * screen before it runs out of deflection.
 */
export const STICK_FLOOR = 46;

/**
 * Where the stick's rest position goes.
 *
 * `bottom` is measured from the bottom of the screen and is never smaller than
 * the home indicator plus clearance — the whole point. The stick radius is
 * added because the value positions the CENTRE, and a centre placed at the
 * floor puts half the control inside it.
 */
export const stickAnchor = (input) => {
  const { width, height, side = 'left', inset = 0, radius = 62 } = input ?? {};
  const w = Number.isFinite(width) && width > 0 ? width : 390;
  const h = Number.isFinite(height) && height > 0 ? height : 844;
  const safe = Math.max(Number.isFinite(inset) ? inset : 0, HOME_INDICATOR_MIN);
  const bottom = safe + STICK_FLOOR + radius;
  const margin = radius + 24;
  return Object.freeze({
    side,
    radius,
    // Distance from the bottom edge to the CENTRE of the stick.
    bottom,
    x: side === 'left' ? margin : w - margin,
    y: h - bottom,
    // Everything the STICK occupies, measured from the bottom.
    reserved: bottom + radius,
    // Where the dock sits: BESIDE the stick, not above it.
    //
    // Stacking the dock on top of the stick pushed it a fifth of the way up the
    // screen, so it floated across the middle of the world with the stick's
    // travel underneath it — which is both ugly and unplayable, because the
    // stick then had nowhere to go. The dock belongs on the same band as the
    // stick, clear of the home indicator and no higher.
    dockBottom: safe + 8,
    // The horizontal room left for it once the stick has taken its side.
    dockInset: radius * 2 + 34,
  });
};

/**
 * Is this control clear of the home indicator?
 *
 * Exported so a test can assert it rather than a person remembering to check
 * on a device they happen to own.
 */
export const clearsHomeIndicator = (bottomPx, controlRadius = 0, inset = HOME_INDICATOR_MIN) =>
  Number.isFinite(bottomPx) && (bottomPx - controlRadius) >= Math.max(inset, HOME_INDICATOR_MIN);

// ─── Density ─────────────────────────────────────────────────────────────────

/**
 * How much HUD this screen can carry.
 *
 * An iPhone SE is 320pt wide with a 568pt-tall screen. The mockup's stack of
 * panels on that is most of the display. `compact` is what tells the screen to
 * collapse secondary cards into the dock rather than draw them.
 */
export const density = ({ width, height } = {}) => {
  const w = Number.isFinite(width) && width > 0 ? width : 390;
  const h = Number.isFinite(height) && height > 0 ? height : 844;
  const compact = w < 375 || h < 700;
  return Object.freeze({
    compact,
    // On a compact screen only the two `always` dock slots are drawn; the rest
    // move into the Score panel rather than being deleted.
    dock: Object.freeze(compact ? DOCK.filter((d) => d.always) : DOCK),
    // The world must keep the majority of the screen. This is the budget the
    // layout is checked against.
    maxHudFraction: compact ? 0.26 : 0.34,
    showNextStepCard: !compact,
    minimapSize: compact ? 92 : 118,
  });
};

/**
 * What is on screen right now.
 *
 * The ALWAYS set is fixed and short. Everything else is a consequence of what
 * the player opened or what just happened, which is what keeps the world
 * visible by default instead of by luck.
 */
export const hudLayout = ({
  openPanel = Panel.NONE,
  dialogue = null,
  nearStation = null,
  objective = null,
  size = {},
} = {}) => {
  const d = density(size);
  // Dialogue owns the lower band while it is up. Drawing the objective chip
  // underneath it stacks two dark cards on the one strip of world the player
  // is walking through.
  const showDialogue = !!dialogue;
  return Object.freeze({
    density: d,
    always: Object.freeze({
      level: true,
      objective: !showDialogue && !!objective,
      stick: true,
      action: !!nearStation,
    }),
    panel: openPanel,
    // A panel and a dialogue at once is two modal things fighting. The panel
    // wins because the player asked for it.
    dialogue: showDialogue && openPanel === Panel.NONE,
    // The next-step card is the first thing to go on a small screen — its
    // content is already in the task list and the objective chip.
    nextStep: d.showNextStepCard && !showDialogue && openPanel === Panel.NONE && !!objective,
  });
};

export const togglePanel = (current, next) =>
  (current === next ? Panel.NONE : next);

// ─── Motion ──────────────────────────────────────────────────────────────────

/**
 * Durations in ms. Every one is short: this is feedback, not choreography, and
 * an animation you wait for on the fiftieth repetition is a cost.
 *
 * `reduced` collapses everything to zero rather than to "fast". A person who
 * has asked the OS for less motion has asked for none, not for a brisk version.
 */
export const MOTION = Object.freeze({
  taskCheck: 260,
  xpFill: 520,
  markerPulse: 1400,
  dialogueIn: 220,
  dialogueOut: 160,
  pressScale: 90,
  panelIn: 200,
  minimapMarker: 300,
});

/**
 * The route line, as data.
 *
 * A flat stroke tells you where the path is. What actually helps is knowing
 * which WAY along it to go, and that comes from movement — dashes travelling
 * toward the objective. Reduced Motion gets the same line with the dashes
 * standing still, which still reads directionally because of the taper.
 *
 * `t` is the world tick. The offset counts DOWN because an SVG dash offset
 * moving negative makes the dashes appear to travel forward along the path.
 */
export const ROUTE = Object.freeze({
  glow: 'rgba(34,197,94,0.18)',
  body: 'rgba(34,197,94,0.34)',
  core: '#22C55E',
  dash: 26,
  gap: 18,
});

export const routeStyle = (t = 0, { reduceMotion = false, tile = 72 } = {}) => {
  const period = ROUTE.dash + ROUTE.gap;
  const offset = reduceMotion ? 0 : -(((Number(t) || 0) * 1.6) % period);
  return Object.freeze({
    // Slim. A heavy stripe covers the floor it is drawn over and stops
    // reading as a route somebody walks — the reference art is a thin
    // confident line, and the glow is what makes a thin line legible.
    glowWidth: tile * 0.26,
    bodyWidth: tile * 0.15,
    coreWidth: tile * 0.055,
    dashArray: [ROUTE.dash, ROUTE.gap],
    dashOffset: offset,
    // The core pulses gently so the line has life even when the player is
    // standing still. Held above 0.72 so it never reads as fading out.
    coreOpacity: reduceMotion ? 0.95 : 0.86 + Math.sin((Number(t) || 0) * 0.12) * 0.12,
    ...ROUTE,
  });
};

export const motion = (reduced = false) => {
  if (!reduced) return MOTION;
  const off = {};
  for (const k of Object.keys(MOTION)) off[k] = 0;
  return Object.freeze(off);
};

/** Pressed-button scale. Small enough to feel, too small to look bouncy. */
export const PRESS_SCALE = 0.96;

// ─── Progression readouts ────────────────────────────────────────────────────

/**
 * Level from total XP.
 *
 * Each level costs a little more than the last, and the curve is gentle: this
 * is a training app with a job site in it, so levelling is a readout of work
 * done, not a treadmill that needs feeding. Nothing gates on level.
 */
export const XP_BASE = 400;
export const XP_STEP = 200;

export const levelFor = (totalXp = 0) => {
  const xp = Number.isFinite(totalXp) && totalXp > 0 ? Math.floor(totalXp) : 0;
  let level = 1;
  let spent = 0;
  let need = XP_BASE;
  // Bounded rather than while(true): a corrupted save with a huge number must
  // not spin here.
  while (xp - spent >= need && level < 99) {
    spent += need;
    level += 1;
    need += XP_STEP;
  }
  return Object.freeze({ level, into: xp - spent, needed: need, total: xp });
};

/**
 * The XP bar.
 *
 * Clamped at both ends, because a bar rendering at 104% or -3% is a visual bug
 * that only shows up on the one save file that hit it.
 */
export const xpBar = ({ xp = 0, into = 0, needed = 0, level = 1 } = {}) => {
  const cur = Number.isFinite(into) && into > 0 ? into : 0;
  const need = Number.isFinite(needed) && needed > 0 ? needed : 0;
  const pct = need > 0 ? Math.max(0, Math.min(100, Math.round((cur / need) * 100))) : 0;
  return Object.freeze({
    level: Number.isFinite(level) && level > 0 ? Math.floor(level) : 1,
    total: Number.isFinite(xp) && xp > 0 ? Math.floor(xp) : 0,
    into: cur,
    needed: need,
    percent: pct,
    label: need > 0 ? `${cur} / ${need}` : `${cur}`,
  });
};

/**
 * The currency counter.
 *
 * Shown as a foundation and NOT spendable while credits are off. A counter you
 * cannot spend is a promise; a shop that takes a currency the app has not
 * shipped is a broken purchase. `spendable` is what a screen checks before
 * drawing anything that takes it.
 */
export const currency = ({ balance = 0, enabled = false } = {}) => Object.freeze({
  balance: Number.isFinite(balance) && balance > 0 ? Math.floor(balance) : 0,
  enabled: !!enabled,
  spendable: false,
  visible: !!enabled,
  note: enabled ? null : 'Not in play yet.',
});

/** Task list rollup. Derived, so the header can never disagree with the rows. */
export const taskProgress = (tasks = []) => {
  const list = Array.isArray(tasks) ? tasks : [];
  const done = list.filter((t) => t?.done).length;
  return Object.freeze({
    done,
    total: list.length,
    percent: list.length ? Math.round((done / list.length) * 100) : 0,
    label: `${done}/${list.length}`,
    allDone: list.length > 0 && done === list.length,
  });
};

/** The completion screen, once every station is signed off. */
export const completion = ({ tasks = [], xpEarned = 0, elapsedMs = 0 } = {}) => {
  const p = taskProgress(tasks);
  const mins = Math.max(0, Math.round((Number(elapsedMs) || 0) / 60000));
  return Object.freeze({
    ready: p.allDone,
    headline: 'Job signed off',
    sub: `${p.total} stations, ${Math.max(0, Math.floor(xpEarned))} XP`,
    // Time is reported, never scored. A stopwatch on electrical work teaches
    // somebody to hurry, and the whole product argues the opposite.
    timeNote: mins > 0 ? `${mins} min on site` : null,
    tasks: Object.freeze([...tasks]),
  });
};
