// ─── KILL SWITCH ─────────────────────────────────────────────────────────────
// Turn a feature off without shipping a build.
//
// The launch reality this exists for: something will misbehave on a device I
// cannot see, at 11pm, and the choice will be between leaving it broken for
// three days waiting on App Review, or having a switch. This is the switch.
//
// FOUR RULES, AND THEY ARE WHAT MAKE IT SAFE TO POINT AT PRODUCTION:
//
// 1. FAIL OPEN, NOT CLOSED. If remote config cannot be reached, features stay
//    ON. A kill switch that dark-launches the whole app whenever the network is
//    bad is a bigger outage than the bug it was meant to contain.
//
// 2. NEVER KILL SAFETY OR ACCESS TO PAID CONTENT. Some things must not be
//    remotely removable — the calculators someone paid for, the disclaimers,
//    restore-purchases. `PROTECTED` is enforced here, so a bad payload cannot
//    take a subscriber's product away or strip a safety notice.
//
// 3. A KILL IS VISIBLE. A feature that vanishes silently reads as a crash. Every
//    kill carries a reason shown to the user, so "Blueprint AI is off while we
//    fix an issue" is what they see rather than a tile that stopped existing.
//
// 4. ONLY A SIGNED-SHAPE PAYLOAD IS OBEYED. Anything malformed is discarded
//    whole rather than partly applied — a half-parsed config is how one typo
//    turns into six features off.
//
// Pure module: no React, no network, no storage. The caller fetches and persists.

import { FEATURE_IDS } from './paywall/registry.js';

/**
 * Things that cannot be killed remotely, whatever the payload says.
 *
 * Two categories, both non-negotiable:
 *   · paid content — killing it is taking something a subscriber bought
 *   · safety and compliance surfaces — killing a disclaimer is worse than
 *     killing the feature it sits under
 */
export const PROTECTED = Object.freeze([
  'CALCULATOR',        // the reason people paid
  'PERMIT',            // safety and compliance guidance
  'restorePurchases',
  'paywall',
  'disclaimers',
  'verificationNotice',
  'settings',
]);

export const isProtected = (id) => PROTECTED.includes(id);

/** What a kill payload may contain. Anything else is ignored. */
const VALID_KEYS = Object.freeze(['killed', 'reason', 'until', 'minBuild', 'maxBuild']);

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Parse a remote payload into a usable config.
 *
 * Returns `{ ok: false }` and NOTHING ELSE on a malformed payload. Partly
 * applying a config you could not fully parse is how a typo in one entry turns
 * into features off that nobody meant to touch.
 */
export const parseKillConfig = (raw) => {
  if (!isPlainObject(raw)) return Object.freeze({ ok: false, reason: 'Not an object', kills: Object.freeze({}) });

  const kills = {};
  for (const [id, value] of Object.entries(raw)) {
    if (!isPlainObject(value)) {
      return Object.freeze({ ok: false, reason: `Entry "${id}" is not an object`, kills: Object.freeze({}) });
    }
    for (const k of Object.keys(value)) {
      if (!VALID_KEYS.includes(k)) {
        return Object.freeze({ ok: false, reason: `Entry "${id}" has unknown key "${k}"`, kills: Object.freeze({}) });
      }
    }
    if (typeof value.killed !== 'boolean') {
      return Object.freeze({ ok: false, reason: `Entry "${id}" has no boolean "killed"`, kills: Object.freeze({}) });
    }
    // A kill with no reason is a feature that vanishes without explanation.
    if (value.killed && typeof value.reason !== 'string') {
      return Object.freeze({ ok: false, reason: `Entry "${id}" kills without a reason`, kills: Object.freeze({}) });
    }
    // Protected ids are dropped rather than failing the whole payload — a
    // mistaken attempt to kill the calculators should not also prevent killing
    // the genuinely broken thing in the same config.
    if (isProtected(id)) continue;

    kills[id] = Object.freeze({
      killed: value.killed,
      reason: typeof value.reason === 'string' ? value.reason.slice(0, 240) : null,
      until: typeof value.until === 'string' ? value.until : null,
      minBuild: Number.isInteger(value.minBuild) ? value.minBuild : null,
      maxBuild: Number.isInteger(value.maxBuild) ? value.maxBuild : null,
    });
  }

  return Object.freeze({ ok: true, reason: null, kills: Object.freeze(kills) });
};

/**
 * Is this feature available right now?
 *
 * `reachable: false` means remote config could not be fetched. Everything stays
 * on — rule 1. The one thing worse than a broken feature is an app that turns
 * itself off on a bad connection.
 */
export const featureState = (id, {
  config = null, reachable = true, build = null, now = Date.now(),
} = {}) => {
  const on = (extra = {}) => Object.freeze({
    id, available: true, killed: false, reason: null, ...extra,
  });

  if (isProtected(id)) return on({ protectedFromKill: true });
  if (!reachable || !config?.ok) return on({ usingDefaults: true });

  const k = config.kills?.[id];
  if (!k || !k.killed) return on();

  // Build-scoped kills, so a bug in build 28 can be switched off without
  // punishing everyone who already updated to 29.
  if (k.minBuild !== null && Number.isInteger(build) && build < k.minBuild) return on();
  if (k.maxBuild !== null && Number.isInteger(build) && build > k.maxBuild) return on();

  // Expiry, so a temporary kill does not become permanent because somebody
  // forgot to remove it.
  if (k.until) {
    const t = Date.parse(k.until);
    if (!Number.isNaN(t) && now > t) return on({ expiredKill: true });
  }

  return Object.freeze({
    id,
    available: false,
    killed: true,
    // Always something to show. Rule 3.
    reason: k.reason || 'Temporarily unavailable while we fix an issue.',
    until: k.until,
  });
};

/** Every feature's state, for a screen that renders a list of tiles. */
export const allStates = (options = {}) =>
  Object.freeze(Object.fromEntries(
    [...FEATURE_IDS, ...PROTECTED].map((id) => [id, featureState(id, options)]),
  ));

/**
 * What a user sees where a killed feature used to be.
 *
 * Not an error. A feature that is deliberately off is a different thing from a
 * crash, and saying so is the difference between "they are on it" and "this app
 * is broken".
 */
export const killedNotice = (state) => {
  if (!state?.killed) return null;
  return Object.freeze({
    title: 'Paused',
    body: state.reason,
    detail: state.until
      ? 'This is temporary and will come back on its own.'
      : 'This will come back in an update.',
    // The rest of the app is unaffected, and the user should be told that
    // rather than left wondering.
    reassurance: 'Everything else works normally.',
  });
};

export const KILL_SWITCH_NOTE =
  'Features can be switched off remotely without an App Store release. Calculators, the Permit '
  + 'Assistant, purchases and every safety notice are exempt and cannot be removed this way.';

// ─── WHAT A KILL ACTUALLY HIDES ──────────────────────────────────────────────
// A feature turned off from the website used to hide its SCREEN and nothing
// else. The Home tile stayed exactly where it was, still saying "Contractor
// Connect · Opportunities, qualifiers, licences", and tapping it landed on
// "Temporarily unavailable". That is not hidden — it is advertised and then
// withdrawn, which reads worse than leaving the feature switched on.
//
// So the tab→feature map lives here rather than inside the router, and Home
// reads the same map. One list, two consumers, no way for them to disagree.

export const TAB_FEATURE = Object.freeze({
  necai: 'SPARK_AI',
  jobsite: 'JOBSITE',
  wiringlab: 'WIRING_LESSON',
  troubleshoot: 'TROUBLESHOOT',
  blueprint: 'BLUEPRINT',
  projects: 'JOB_CAM',
  jobcam: 'JOB_CAM',
  connect: 'CONTRACTOR_CONNECT',
});

/**
 * Should this destination be hidden from menus and shortcuts entirely?
 *
 * Only tabs on TAB_FEATURE can be hidden. Home, Settings and the calculators
 * are deliberately absent, so no config — however wrong — can leave somebody
 * with no way back or take away the tools they paid for.
 */
export const isTabHidden = (tab, registry) => {
  const feature = TAB_FEATURE[tab];
  if (!feature) return false;
  return registry?.[feature]?.disabled === true;
};

/** The predicate Home filters its cards with. Safe when config never arrived. */
export const tabHider = (registry) => (tab) => isTabHidden(tab, registry);
