// ─── DETECTED DEVICE ─────────────────────────────────────────────────────────
// The object every later stage operates on. One object, one lifecycle.
//
// The rule this file exists to enforce: a device carries where it came from,
// and that provenance cannot be forged by a later stage. An estimator must be
// able to ask "did a person actually confirm this?" and get a truthful answer,
// because that is the difference between a number a contractor can bid and a
// number a model produced from a photograph.
//
// So `origin` is set at construction and never changes; `state` moves only
// through the transitions in verification.js; and a device that a human has not
// touched can never report itself as CONFIRMED.
//
// Pure module: no React, no network, no storage.

import { resolveSymbol, symbolById, isCountable, CountBasis } from './symbols.js';

/** Where this device came from. Set once, never rewritten. */
export const Origin = Object.freeze({
  AI: 'AI',               // a recognizer proposed it
  HUMAN: 'HUMAN',         // a person placed it by hand
  IMPORTED: 'IMPORTED',   // came from a schedule, CSV, or another system
});

/**
 * Review lifecycle. Only CONFIRMED devices reach an estimate.
 *
 * PROPOSED  → a recognizer suggested it, nobody has looked
 * CONFIRMED → a human accepted it (or placed it themselves)
 * REJECTED  → a human said it is not there; kept, not deleted, so the count is
 *             auditable and a mis-click is recoverable
 * FLAGGED   → needs a decision: low confidence, ambiguous, or overlapping
 */
export const DeviceState = Object.freeze({
  PROPOSED: 'PROPOSED',
  CONFIRMED: 'CONFIRMED',
  REJECTED: 'REJECTED',
  FLAGGED: 'FLAGGED',
});

/**
 * Confidence bands. Numeric confidence is kept, but the band is what the UI
 * shows: "0.73" invites false precision from a model that cannot actually
 * calibrate itself to two decimal places.
 */
export const ConfidenceBand = Object.freeze({
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
});

/** Below this, a detection is flagged for review rather than proposed. */
export const REVIEW_THRESHOLD = 0.75;
/** Below this, a detection is not worth showing at all. */
export const FLOOR_THRESHOLD = 0.35;

export const bandFor = (confidence) => {
  const c = Number(confidence);
  if (!Number.isFinite(c)) return ConfidenceBand.LOW;
  if (c >= 0.9) return ConfidenceBand.HIGH;
  if (c >= REVIEW_THRESHOLD) return ConfidenceBand.MEDIUM;
  return ConfidenceBand.LOW;
};

const clamp01 = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
};

const finiteOr = (n, fallback) => {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
};

let seq = 0;
/** Deterministic-enough id. Not a UUID — these live inside one project. */
const nextId = (prefix = 'dev') => `${prefix}_${(seq += 1).toString(36)}${Date.now().toString(36).slice(-4)}`;

/**
 * Normalise a bounding box. Always returns a box with non-negative size, so
 * downstream geometry (overlap, zoom-to-device) cannot divide by zero or
 * produce a negative area from a model that emitted x2 < x1.
 */
export const normalizeBox = (box) => {
  const x1 = finiteOr(box?.x1 ?? box?.x, 0);
  const y1 = finiteOr(box?.y1 ?? box?.y, 0);
  const x2 = finiteOr(box?.x2, x1 + finiteOr(box?.w, 0));
  const y2 = finiteOr(box?.y2, y1 + finiteOr(box?.h, 0));
  return Object.freeze({
    x1: Math.min(x1, x2), y1: Math.min(y1, y2),
    x2: Math.max(x1, x2), y2: Math.max(y1, y2),
  });
};

export const boxArea = (box) => Math.max(0, box.x2 - box.x1) * Math.max(0, box.y2 - box.y1);

export const boxCenter = (box) => ({ x: (box.x1 + box.x2) / 2, y: (box.y1 + box.y2) / 2 });

/** Intersection over union — how much two detections are the same detection. */
export const iou = (a, b) => {
  const ix = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
  const iy = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  const inter = ix * iy;
  const union = boxArea(a) + boxArea(b) - inter;
  return union <= 0 ? 0 : inter / union;
};

/**
 * Build a device.
 *
 * `origin` decides the starting state and it is the one thing a caller cannot
 * lie about downstream: a HUMAN-placed device starts CONFIRMED because a person
 * put it there; an AI detection starts PROPOSED or FLAGGED and can only become
 * CONFIRMED by passing through verification.js.
 */
export const createDevice = ({
  symbolId, page = 1, box, confidence = 1, origin = Origin.AI,
  rotation = 0, scale = null, room = null, panel = null, circuit = null,
  tagText = null, id = null, meta = {},
} = {}) => {
  const symbol = resolveSymbol(symbolId);
  const conf = origin === Origin.HUMAN ? 1 : clamp01(confidence);
  const state = origin === Origin.HUMAN || origin === Origin.IMPORTED
    ? DeviceState.CONFIRMED
    : conf < REVIEW_THRESHOLD || symbol.id === 'unknown'
      ? DeviceState.FLAGGED
      : DeviceState.PROPOSED;

  return Object.freeze({
    id: id ?? nextId(),
    symbolId: symbol.id,
    page: Math.max(1, Math.floor(finiteOr(page, 1))),
    box: normalizeBox(box ?? {}),
    rotation: finiteOr(rotation, 0),
    scale,
    confidence: conf,
    band: bandFor(conf),
    origin,
    state,
    // Location context, filled by later stages or by a human. Null is honest —
    // it means nobody has established it, not that the device has no room.
    room, panel, circuit,
    tagText: typeof tagText === 'string' ? tagText.slice(0, 120) : null,
    // Audit trail. Every state change appends; nothing is ever removed.
    history: Object.freeze([Object.freeze({ at: null, action: 'DETECTED', from: null, to: state, by: origin })]),
    meta: Object.freeze({ ...meta }),
  });
};

/** Is this device allowed to contribute to a count or an estimate? */
export const isCounted = (device) =>
  device.state === DeviceState.CONFIRMED && isCountable(device.symbolId);

/** Devices a human still has to deal with before an estimate can be trusted. */
export const needsReview = (device) =>
  device.state === DeviceState.FLAGGED || device.state === DeviceState.PROPOSED;

/**
 * Count of confirmed devices by symbol. This is the ONLY way a quantity should
 * reach the estimator — it structurally cannot include a device nobody
 * confirmed, because `isCounted` requires CONFIRMED.
 */
export const confirmedCounts = (devices) => {
  const out = new Map();
  for (const d of devices) {
    if (!isCounted(d)) continue;
    out.set(d.symbolId, (out.get(d.symbolId) ?? 0) + 1);
  }
  return out;
};

/** Everything a review screen needs to tell the user where they stand. */
export const reviewSummary = (devices) => {
  const list = Array.isArray(devices) ? devices : [];
  const byState = { PROPOSED: 0, CONFIRMED: 0, REJECTED: 0, FLAGGED: 0 };
  let lowConfidence = 0;
  let fieldVerification = 0;

  for (const d of list) {
    byState[d.state] = (byState[d.state] ?? 0) + 1;
    if (d.band === ConfidenceBand.LOW && d.state !== DeviceState.REJECTED) lowConfidence += 1;
    if (symbolById(d.symbolId)?.requiresFieldVerification && d.state !== DeviceState.REJECTED) {
      fieldVerification += 1;
    }
  }

  const outstanding = byState.PROPOSED + byState.FLAGGED;
  return {
    total: list.length,
    byState,
    outstanding,
    lowConfidence,
    fieldVerification,
    // The gate on the whole feature: an estimate is not "complete" while a
    // single detection is still unreviewed. The UI may show a draft; it may not
    // call it finished.
    reviewComplete: outstanding === 0 && list.length > 0,
  };
};

/** Detections that are almost certainly the same device seen twice. */
export const findDuplicates = (devices, threshold = 0.6) => {
  const pairs = [];
  const live = devices.filter((d) => d.state !== DeviceState.REJECTED);
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i]; const b = live[j];
      if (a.page !== b.page) continue;
      const overlap = iou(a.box, b.box);
      if (overlap >= threshold) pairs.push({ a: a.id, b: b.id, iou: overlap, sameSymbol: a.symbolId === b.symbolId });
    }
  }
  return pairs;
};

export { CountBasis };
