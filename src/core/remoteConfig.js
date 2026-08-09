// ─── THE KILL SWITCH ─────────────────────────────────────────────────────────
// Turning a broken feature off without an App Store review.
//
// THE PROBLEM IT SOLVES. `applyRemoteConfig` has existed in the paywall
// registry since RC1 and is correct — it can disable any feature and move any
// free limit. Nothing has ever called it, and nothing has ever fetched a config
// for it to apply. It was a switch with no wire, so "leave room to cut a
// feature off if it does not work" was true in the code and false in the app.
//
// WHY A STATIC FILE AND NOT AN API. The website lives in this repo and deploys
// to Vercel. A JSON file there is edited, redeployed, and live in a minute, with
// no serverless function to write, no secret to hold and nothing to keep running.
// The app polls it; the worst it can do is fail, and failing means the app
// behaves exactly as it shipped.
//
// FAIL OPEN, ALWAYS. Every failure path here returns "no overrides". A kill
// switch that bricks the app when the network is down is worse than the bug it
// was added to contain, and this file is the one place where being unable to
// reach the internet must never remove a feature somebody paid for.
//
// SAFETY FEATURES ARE NOT REMOTELY DISABLEABLE. The registry decides that via
// `otaConfigurable`, and this file cannot widen it — a config that tried to
// switch off a refusal or a disclaimer is ignored by the layer below.

export const CONFIG_URL = 'https://sparkconnect.pro/app-config.json';

/** Older than this and the cached copy is not trusted to still be current. */
export const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** Short on purpose. Startup must never wait on this. */
export const FETCH_TIMEOUT_MS = 4000;

/** A config bigger than this is not our config. */
const MAX_BYTES = 32_000;

export const EMPTY = Object.freeze({ features: Object.freeze({}), notice: null, at: null });

/**
 * Validate a parsed config.
 *
 * Anything unexpected produces EMPTY rather than a partial application. A
 * half-read config is how one malformed key silently disables a feature nobody
 * meant to touch.
 */
export const readConfig = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return EMPTY;
  const features = {};
  const src = raw.features;
  if (src && typeof src === 'object' && !Array.isArray(src)) {
    for (const [id, patch] of Object.entries(src)) {
      if (!patch || typeof patch !== 'object') continue;
      const out = {};
      if (patch.disabled === true) out.disabled = true;
      if (patch.limit === null || (Number.isFinite(patch.limit) && patch.limit >= 0)) out.limit = patch.limit;
      if (Object.keys(out).length) features[id] = Object.freeze(out);
    }
  }
  // One short sentence the app may show. Length-capped because this string is
  // fetched from a file and rendered — a novel in it is a broken screen.
  const notice = typeof raw.notice === 'string' && raw.notice.trim()
    ? raw.notice.trim().slice(0, 240)
    : null;
  return Object.freeze({ features: Object.freeze(features), notice, at: raw.at ?? null });
};

/**
 * Fetch the config. Never throws, never blocks, never removes a feature on failure.
 *
 * @param fetchImpl injected so this stays testable without a network.
 */
export const fetchConfig = async (fetchImpl, { url = CONFIG_URL, timeoutMs = FETCH_TIMEOUT_MS } = {}) => {
  if (typeof fetchImpl !== 'function') return EMPTY;
  try {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    const res = await fetchImpl(url, {
      method: 'GET',
      // A cached kill switch is a kill switch that does not work.
      headers: { 'Cache-Control': 'no-cache' },
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (timer) clearTimeout(timer);
    if (!res || res.ok !== true) return EMPTY;
    const text = await res.text();
    if (typeof text !== 'string' || text.length > MAX_BYTES) return EMPTY;
    return readConfig(JSON.parse(text));
  } catch (e) {
    // Offline, timed out, 404, malformed JSON — all the same answer. The app
    // behaves exactly as it shipped.
    return EMPTY;
  }
};

/** Is a cached config still worth trusting? */
export const cacheIsFresh = (cachedAt, now = Date.now()) => {
  const t = Number(cachedAt);
  return Number.isFinite(t) && t > 0 && (now - t) < CACHE_TTL_MS;
};

/**
 * What to apply on launch.
 *
 * The cache is used while the network answers, so a feature turned off
 * yesterday stays off through a launch with no signal — otherwise the switch
 * only works for people who happen to be online at the moment it matters.
 * A stale cache is discarded, because a config from last month disabling
 * something long since fixed is its own bug.
 */
export const resolveConfig = ({ cached = null, cachedAt = null, fetched = null, now = Date.now() } = {}) => {
  if (fetched && Object.keys(fetched.features ?? {}).length > 0) return fetched;
  if (fetched && fetched.notice) return fetched;
  if (cached && cacheIsFresh(cachedAt, now)) return cached;
  return fetched ?? EMPTY;
};

/** Human summary for the health screen, so a disabled feature is never a mystery. */
export const configSummary = (config) => {
  const ids = Object.keys(config?.features ?? {});
  const off = ids.filter((id) => config.features[id].disabled);
  if (!ids.length) return 'No remote overrides. The app is running as shipped.';
  return `${ids.length} override(s)${off.length ? `, ${off.length} feature(s) disabled: ${off.join(', ')}` : ''}.`;
};
