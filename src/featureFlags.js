// ─── FEATURE FLAGS (React Native wrapper) ────────────────────────────────────
// Requirements: FLG-01 … FLG-13, DOD-09
//
// Resolution rules live in ./flags/core.js so they can be unit tested. This file
// only adds persistence and the module-level cache.
//
// FLG-13 requires that Stripe payment creation or a bad lesson can be switched
// off WITHOUT an App Store rebuild — that is what `applyRemoteFlags` is for.
// Until a backend exists (docs/v1.1/DECISIONS.md D-01) nothing calls it and the
// defaults hold, which is the safe direction to fail.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULTS, FLAG_NAMES, HARD_LOCKED_OFF, sanitize, resolve, resolveAll, isLessonFlagEnabled,
} from './flags/core';

const STORAGE_REMOTE = '@sc_flags_remote_v1';
const STORAGE_LOCAL = '@sc_flags_local_v1';

let _remote = {};
let _local = {};
let _loaded = false;

const isDev = () => typeof __DEV__ !== 'undefined' && __DEV__ === true;
const context = () => ({ remote: _remote, local: _local, isDev: isDev() });

export const loadFlags = async () => {
  try {
    const [remoteRaw, localRaw] = await Promise.all([
      AsyncStorage.getItem(STORAGE_REMOTE),
      AsyncStorage.getItem(STORAGE_LOCAL),
    ]);
    _remote = sanitize(remoteRaw ? JSON.parse(remoteRaw) : {});
    _local = sanitize(localRaw ? JSON.parse(localRaw) : {});
  } catch (e) {
    _remote = {};
    _local = {};
  }
  _loaded = true;
  return allFlags();
};

/**
 * FLG-13 — apply a remote kill-switch payload. Cached so the last known remote
 * state survives an offline launch (NNR-12).
 */
export const applyRemoteFlags = async (payload) => {
  _remote = sanitize(payload);
  try { await AsyncStorage.setItem(STORAGE_REMOTE, JSON.stringify(_remote)); } catch (e) { /* offline is fine */ }
  return allFlags();
};

/** Dev-only override. Ignored in production builds. */
export const setLocalOverride = async (name, value) => {
  if (!isDev()) return allFlags();
  if (!FLAG_NAMES.includes(name) || typeof value !== 'boolean') return allFlags();
  _local = { ..._local, [name]: value };
  try { await AsyncStorage.setItem(STORAGE_LOCAL, JSON.stringify(_local)); } catch (e) { /* ignore */ }
  return allFlags();
};

export const clearLocalOverrides = async () => {
  _local = {};
  try { await AsyncStorage.removeItem(STORAGE_LOCAL); } catch (e) { /* ignore */ }
  return allFlags();
};

export const isEnabled = (name) => resolve(name, context());
export const allFlags = () => resolveAll(context());
export const isLessonEnabled = (lesson) => isLessonFlagEnabled(lesson, context());
export const flagsLoaded = () => _loaded;

export { DEFAULTS, FLAG_NAMES, HARD_LOCKED_OFF };
