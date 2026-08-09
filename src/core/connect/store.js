// ─── SUBMISSION STORE ────────────────────────────────────────────────────────
// A repository, not a screen talking to AsyncStorage.
//
// The whole point of the shape below is that `list / save / remove / get` are
// the four things a Supabase-backed version would also expose. When there is a
// server, this file gets a second implementation and nothing that calls it
// changes. Writing AsyncStorage keys inline in the screen would have made that
// a rewrite instead of a swap, which is how a "temporary" local-only feature
// becomes permanent.
//
// Storage is INJECTED. That keeps this testable without a device and keeps the
// core directory free of React Native imports, which is the rule that makes the
// eventual ContractorConnect split cheap.
//
// One behaviour worth naming: a read that cannot be parsed returns an empty
// list rather than throwing. A corrupted key must not be able to brick the
// screen — the worst acceptable outcome is that a draft is lost, and the worst
// unacceptable one is that the section never opens again.

import { submissionDraft, SubmissionStatus } from './submissions.js';

export const STORE_KEY = '@sc_connect_submissions_v1';

/** Newest first, and nothing that failed to rehydrate. */
const order = (rows) => [...rows].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));

export const parseStored = (raw) => {
  if (typeof raw !== 'string' || !raw) return Object.freeze([]);
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch { return Object.freeze([]); }
  if (!Array.isArray(parsed)) return Object.freeze([]);
  // submissionDraft is the only constructor, so anything that does not survive
  // it was not a submission — a hand-edited or half-written record cannot enter
  // the app through the back door.
  return Object.freeze(order(parsed.map((r) => submissionDraft(r)).filter(Boolean)));
};

export const serialize = (rows) => JSON.stringify(order(rows ?? []));

/**
 * @param storage `{ getItem, setItem }` — AsyncStorage on a device, a Map in a test.
 */
export const createSubmissionStore = (storage, { key = STORE_KEY } = {}) => {
  const read = async () => {
    try { return parseStored(await storage.getItem(key)); } catch { return Object.freeze([]); }
  };

  const write = async (rows) => {
    try { await storage.setItem(key, serialize(rows)); return true; } catch { return false; }
  };

  return Object.freeze({
    list: read,
    get: async (id) => (await read()).find((r) => r.id === id) ?? null,

    /** Upsert by id. Returns the full list so a screen has one source of truth. */
    save: async (sub) => {
      if (!sub?.id) return await read();
      const rows = (await read()).filter((r) => r.id !== sub.id);
      const next = order([sub, ...rows]);
      await write(next);
      return Object.freeze(next);
    },

    remove: async (id) => {
      const next = (await read()).filter((r) => r.id !== id);
      await write(next);
      return Object.freeze(next);
    },

    /** What the Saved tile counts: anything that has not left the device. */
    unsent: async () => Object.freeze(
      (await read()).filter((r) => r.status !== SubmissionStatus.HANDED_OFF),
    ),
  });
};
