// ─── CODE EDITION (React Native wrapper) ─────────────────────────────────────
// Requirements: CODE-02, CODE-03, CODE-06, AI-02
// Pure logic lives in ./nec/editions.js so it can be unit tested.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Edition, EDITION_OPTIONS, DEFAULT_EDITION, normalizeEdition, effectiveEdition,
  editionLabel, resultEditionLabel, adoptedCodeContext, matchesEdition,
  CHANGE_CATEGORIES_2026, REORGANIZATION_NOTE, EDITION_VISIBLE_SURFACES,
} from './nec/editions';

const STORAGE_KEY = '@sc_code_edition';

let _cached = DEFAULT_EDITION;

export const loadCodeEdition = async () => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    _cached = normalizeEdition(raw);
  } catch (e) {
    _cached = DEFAULT_EDITION;
  }
  return _cached;
};

export const setCodeEdition = async (value) => {
  _cached = normalizeEdition(value);
  try { await AsyncStorage.setItem(STORAGE_KEY, _cached); } catch (e) { /* ignore */ }
  return _cached;
};

/** Synchronous read of the last loaded value, for render paths. */
export const getCodeEdition = () => _cached;

export {
  Edition, EDITION_OPTIONS, DEFAULT_EDITION, normalizeEdition, effectiveEdition,
  editionLabel, resultEditionLabel, adoptedCodeContext, matchesEdition,
  CHANGE_CATEGORIES_2026, REORGANIZATION_NOTE, EDITION_VISIBLE_SURFACES,
};
