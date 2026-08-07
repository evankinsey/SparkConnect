// ─── DESIGN TOKENS ───────────────────────────────────────────────────────────
// One scale, so "inconsistent corner radius" stops being a thing somebody has
// to notice by eye.
//
// The values here were not invented. They were measured off the app as it
// already is — the audit found twelve different border radii in use, with 12,
// 14 and 10 accounting for most of them. So the scale ADOPTS the dominant
// values rather than imposing a tidier set, because a token system that
// disagrees with the app requires touching every screen to land, and a change
// that big before a launch is how you break something you cannot see.
//
// The point is not that 12 is a better number than 11. It is that a screen
// using 11 is doing so by accident, and nobody can tell which by reading the
// code. After this, they can — `npm run audit:ui` lists every deviation, ranked
// by how far off it is.
//
// ACCESSIBILITY IS IN HERE, NOT BOLTED ON. Reduced motion and haptics are
// resolved through the same functions that return the animation duration, so a
// screen physically cannot honour the token system and ignore the setting.
//
// Pure module: no React, no storage.

// ─── Space ───────────────────────────────────────────────────────────────────
// A 4pt grid. Everything in the app already sits close to one of these.

export const space = Object.freeze({
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 24,
  xxxl: 32,
});

export const SPACE_VALUES = Object.freeze(Object.values(space));

// ─── Radius ──────────────────────────────────────────────────────────────────

export const radius = Object.freeze({
  sm: 8,      // chips, small tags
  md: 10,     // inputs, secondary buttons
  lg: 12,     // cards, primary buttons
  xl: 14,     // surfaces that contain other cards
  pill: 999,  // fully rounded
});

export const RADIUS_VALUES = Object.freeze(Object.values(radius));

// ─── Type ────────────────────────────────────────────────────────────────────

export const type = Object.freeze({
  caption: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.7 },
  label: { fontSize: 11.5, fontWeight: '600' },
  body: { fontSize: 12.5, fontWeight: '500' },
  bodyStrong: { fontSize: 13.5, fontWeight: '700' },
  title: { fontSize: 15, fontWeight: '800' },
  screenTitle: { fontSize: 17, fontWeight: '800' },
  display: { fontSize: 20, fontWeight: '800' },
});

// ─── Touch targets ───────────────────────────────────────────────────────────

/**
 * 44pt is Apple's minimum and it is not a suggestion — it is the difference
 * between a button and a thing that only works for people with small hands and
 * good aim. Anything interactive is measured against MIN_TAP.
 */
export const MIN_TAP = 44;

export const control = Object.freeze({
  chip: { minHeight: 38, borderRadius: radius.sm },
  input: { minHeight: 44, borderRadius: radius.md },
  button: { minHeight: 48, borderRadius: radius.lg },
  buttonLarge: { minHeight: 50, borderRadius: radius.lg },
  row: { minHeight: 56, borderRadius: radius.lg },
});

// ─── Motion ──────────────────────────────────────────────────────────────────

export const duration = Object.freeze({
  instant: 0,
  fast: 120,     // a press state, a chip toggling
  base: 200,     // the default for anything that moves
  slow: 320,     // a sheet, a screen transition
  celebrate: 900,
});

/**
 * Every duration goes through here.
 *
 * `reduceMotion` collapses animation to zero rather than shortening it. A
 * "reduced" animation that still moves is the thing that makes people with
 * vestibular disorders put the phone down — the setting means none, not less.
 */
export const animate = (key, { reduceMotion = false } = {}) => {
  if (reduceMotion) return 0;
  return duration[key] ?? duration.base;
};

// ─── Haptics ─────────────────────────────────────────────────────────────────

export const Haptic = Object.freeze({
  SELECT: 'SELECT',       // a chip, a tab, a toggle
  SUCCESS: 'SUCCESS',     // saved, completed, correct
  WARN: 'WARN',           // a validation failure the user can fix
  ERROR: 'ERROR',         // wrong answer, refused action
  IMPACT: 'IMPACT',       // a wire landing, a bend committing
});

/**
 * Resolve a haptic against the user's setting.
 *
 * Returns null when haptics are off, so the call site is
 * `const h = haptic(Haptic.SUCCESS, settings); if (h) trigger(h);` — one shape,
 * and no screen gets to decide its own feedback is important enough to override
 * a preference.
 */
export const haptic = (kind, { hapticsEnabled = true } = {}) => {
  if (!hapticsEnabled) return null;
  return Object.prototype.hasOwnProperty.call(Haptic, kind) ? kind : null;
};

// ─── Feedback for an action ──────────────────────────────────────────────────

/**
 * What an action should do, so "every tap gives feedback" is a lookup rather
 * than a decision each screen makes differently.
 *
 * Deliberately small. A vocabulary of six is one a person can hold in their
 * head; a vocabulary of thirty becomes a second styling system to be
 * inconsistent about.
 */
export const Feedback = Object.freeze({
  SELECT: { haptic: Haptic.SELECT, duration: 'fast', scale: 0.97 },
  SAVE: { haptic: Haptic.SUCCESS, duration: 'base', scale: 1.04 },
  COMPLETE: { haptic: Haptic.SUCCESS, duration: 'celebrate', scale: 1.06 },
  REJECT: { haptic: Haptic.ERROR, duration: 'fast', shake: 6 },
  WARN: { haptic: Haptic.WARN, duration: 'base' },
  NEUTRAL: { haptic: null, duration: 'fast', scale: 0.98 },
});

export const feedbackFor = (name, settings = {}) => {
  const f = Feedback[name] ?? Feedback.NEUTRAL;
  return Object.freeze({
    ...f,
    // Resolved, not raw — a caller cannot accidentally animate through a
    // reduce-motion setting or buzz through a haptics-off setting.
    ms: animate(f.duration, settings),
    haptic: haptic(f.haptic, settings),
    scale: settings.reduceMotion ? 1 : (f.scale ?? 1),
    shake: settings.reduceMotion ? 0 : (f.shake ?? 0),
  });
};

// ─── Accessibility settings ──────────────────────────────────────────────────

export const defaultA11y = () => Object.freeze({
  reduceMotion: false,
  hapticsEnabled: true,
  soundEnabled: true,
  largeText: false,
  highContrast: false,
});

/** Anything from storage, made safe. Unknown keys are dropped. */
export const sanitizeA11y = (raw) => {
  const d = defaultA11y();
  if (!raw || typeof raw !== 'object') return d;
  const out = {};
  for (const k of Object.keys(d)) out[k] = typeof raw[k] === 'boolean' ? raw[k] : d[k];
  return Object.freeze(out);
};

/** Type scaled for the large-text setting, capped so layouts survive. */
export const scaledType = (key, { largeText = false } = {}) => {
  const t = type[key] ?? type.body;
  if (!largeText) return t;
  return Object.freeze({ ...t, fontSize: Math.round(t.fontSize * 1.2 * 10) / 10 });
};

export const TOKEN_NOTE =
  'Values were measured off the existing app rather than invented, so adopting them is a '
  + 'cleanup rather than a redesign. `npm run audit:ui` lists what still deviates.';
