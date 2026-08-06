// ─── HUMAN VERIFICATION ──────────────────────────────────────────────────────
// The stage that stands between a model's opinion and a number someone bids.
//
// Two rules govern everything here.
//
//   1. A device becomes CONFIRMED only by a human action. There is no code path
//      that promotes a detection on confidence alone, however high. "The model
//      was 0.99 sure" is not a person having looked at the sheet.
//
//   2. Nothing is destroyed. Reject marks, it does not delete. Merge keeps both
//      parents. Split records what it came from. An estimate that changed has to
//      be explainable months later when the job is being argued about, and you
//      cannot explain a count from data that was thrown away.
//
// Every function is pure and returns new objects. The screen holds the array.
//
// Pure module: no React, no network, no storage.

import {
  DeviceState, Origin, createDevice, normalizeBox, boxCenter, iou,
  bandFor, REVIEW_THRESHOLD,
} from './device.js';
import { resolveSymbol, symbolById } from './symbols.js';

/** Actions a human can take. Recorded verbatim in device history. */
export const ReviewAction = Object.freeze({
  ACCEPT: 'ACCEPT',
  REJECT: 'REJECT',
  RELABEL: 'RELABEL',
  MERGE: 'MERGE',
  SPLIT: 'SPLIT',
  FLAG: 'FLAG',
  ADD: 'ADD',
  EDIT_LOCATION: 'EDIT_LOCATION',
});

/** Transitions the lifecycle permits. Anything else is a bug, not a feature. */
const ALLOWED = Object.freeze({
  [DeviceState.PROPOSED]: [DeviceState.CONFIRMED, DeviceState.REJECTED, DeviceState.FLAGGED],
  [DeviceState.FLAGGED]: [DeviceState.CONFIRMED, DeviceState.REJECTED],
  // Confirmed and rejected are both reversible — a person who mis-taps at 6am
  // on a jobsite must be able to undo it, and an audit trail makes that safe.
  [DeviceState.CONFIRMED]: [DeviceState.REJECTED, DeviceState.FLAGGED],
  [DeviceState.REJECTED]: [DeviceState.CONFIRMED, DeviceState.FLAGGED],
});

export const canTransition = (from, to) => (ALLOWED[from] ?? []).includes(to);

const stamp = (device, action, to, by, detail = null) => Object.freeze({
  at: detail?.at ?? null,
  action,
  from: device.state,
  to,
  by,
  detail: detail?.note ?? null,
});

/**
 * Move a device to a new state. Returns the device unchanged when the
 * transition is not allowed, rather than throwing — a review screen should not
 * crash because a stale tap arrived twice.
 */
const transition = (device, to, action, by = Origin.HUMAN, detail = null) => {
  if (device.state === to && action !== ReviewAction.RELABEL) return device;
  if (!canTransition(device.state, to)) return device;
  return Object.freeze({
    ...device,
    state: to,
    history: Object.freeze([...device.history, stamp(device, action, to, by, detail)]),
  });
};

export const accept = (device, detail) =>
  transition(device, DeviceState.CONFIRMED, ReviewAction.ACCEPT, Origin.HUMAN, detail);

export const reject = (device, detail) =>
  transition(device, DeviceState.REJECTED, ReviewAction.REJECT, Origin.HUMAN, detail);

export const flag = (device, detail) =>
  transition(device, DeviceState.FLAGGED, ReviewAction.FLAG, Origin.HUMAN, detail);

/**
 * Change what a detection is. Relabelling is itself a confirmation: the person
 * looked at the sheet, disagreed with the model, and said what is actually
 * there. Confidence becomes 1 because it is now a human's statement, not a
 * model's — keeping the model's 0.42 next to a human's correction would be
 * reporting the wrong thing's uncertainty.
 */
export const relabel = (device, symbolId, detail) => {
  const symbol = resolveSymbol(symbolId);
  if (symbol.id === device.symbolId && device.state === DeviceState.CONFIRMED) return device;
  const next = Object.freeze({
    ...device,
    symbolId: symbol.id,
    confidence: 1,
    band: bandFor(1),
    state: DeviceState.CONFIRMED,
    history: Object.freeze([...device.history, Object.freeze({
      at: detail?.at ?? null,
      action: ReviewAction.RELABEL,
      from: device.state,
      to: DeviceState.CONFIRMED,
      by: Origin.HUMAN,
      detail: `${device.symbolId} → ${symbol.id}${detail?.note ? ` · ${detail.note}` : ''}`,
    })]),
  });
  return next;
};

/** Set room / panel / circuit. Location is context, not a state change. */
export const setLocation = (device, { room, panel, circuit } = {}, detail) => Object.freeze({
  ...device,
  room: room === undefined ? device.room : room,
  panel: panel === undefined ? device.panel : panel,
  circuit: circuit === undefined ? device.circuit : circuit,
  history: Object.freeze([...device.history, Object.freeze({
    at: detail?.at ?? null,
    action: ReviewAction.EDIT_LOCATION,
    from: device.state,
    to: device.state,
    by: Origin.HUMAN,
    detail: detail?.note ?? null,
  })]),
});

/**
 * Merge duplicates into one device.
 *
 * The survivor keeps the union of the boxes and the parents' ids. The others
 * are REJECTED rather than removed, with a note pointing at the survivor, so a
 * count that dropped by two can be explained without guessing.
 */
export const merge = (devices, ids, { symbolId = null, at = null } = {}) => {
  const chosen = devices.filter((d) => ids.includes(d.id));
  if (chosen.length < 2) return devices;

  const [first] = chosen;
  const box = normalizeBox({
    x1: Math.min(...chosen.map((d) => d.box.x1)),
    y1: Math.min(...chosen.map((d) => d.box.y1)),
    x2: Math.max(...chosen.map((d) => d.box.x2)),
    y2: Math.max(...chosen.map((d) => d.box.y2)),
  });
  const survivorSymbol = resolveSymbol(symbolId ?? first.symbolId);

  const survivor = Object.freeze({
    ...first,
    symbolId: survivorSymbol.id,
    box,
    confidence: 1,
    band: bandFor(1),
    state: DeviceState.CONFIRMED,
    meta: Object.freeze({ ...first.meta, mergedFrom: Object.freeze(chosen.map((d) => d.id)) }),
    history: Object.freeze([...first.history, Object.freeze({
      at, action: ReviewAction.MERGE, from: first.state, to: DeviceState.CONFIRMED,
      by: Origin.HUMAN, detail: `merged ${chosen.length} detections`,
    })]),
  });

  return devices.map((d) => {
    if (d.id === survivor.id) return survivor;
    if (!ids.includes(d.id)) return d;
    return Object.freeze({
      ...d,
      state: DeviceState.REJECTED,
      meta: Object.freeze({ ...d.meta, mergedInto: survivor.id }),
      history: Object.freeze([...d.history, Object.freeze({
        at, action: ReviewAction.MERGE, from: d.state, to: DeviceState.REJECTED,
        by: Origin.HUMAN, detail: `merged into ${survivor.id}`,
      })]),
    });
  });
};

/**
 * Split one detection into several — a model that drew one box around a bank of
 * four receptacles. The original is REJECTED with a pointer to its children, so
 * the count goes from 1 to 4 in a way that can be read back.
 */
export const split = (devices, id, parts, { at = null } = {}) => {
  const source = devices.find((d) => d.id === id);
  if (!source || !Array.isArray(parts) || parts.length < 2) return devices;

  const children = parts.map((part, i) => {
    const child = createDevice({
      symbolId: part.symbolId ?? source.symbolId,
      page: source.page,
      box: part.box ?? source.box,
      confidence: 1,
      origin: Origin.HUMAN,          // a person asserted this one exists
      room: source.room,
      panel: source.panel,
      circuit: source.circuit,
      meta: { splitFrom: source.id, splitIndex: i },
    });
    return child;
  });

  const rejected = Object.freeze({
    ...source,
    state: DeviceState.REJECTED,
    meta: Object.freeze({ ...source.meta, splitInto: Object.freeze(children.map((c) => c.id)) }),
    history: Object.freeze([...source.history, Object.freeze({
      at, action: ReviewAction.SPLIT, from: source.state, to: DeviceState.REJECTED,
      by: Origin.HUMAN, detail: `split into ${children.length}`,
    })]),
  });

  return [...devices.map((d) => (d.id === id ? rejected : d)), ...children];
};

/** Place a device by hand. Starts CONFIRMED — a person put it there. */
export const addManual = (devices, { symbolId, page, box, room, panel, circuit }) => [
  ...devices,
  createDevice({ symbolId, page, box, room, panel, circuit, origin: Origin.HUMAN, confidence: 1 }),
];

export const acceptAll = (devices, predicate = () => true) =>
  devices.map((d) => (d.state === DeviceState.PROPOSED && predicate(d) ? accept(d) : d));

/**
 * The review queue, worst first.
 *
 * Order matters more than it looks: an estimator working through 300 detections
 * gives the most attention to the first screen. Unknown symbols and ambiguous
 * ones cost the most if they are wrong, so they go first, and confidently-
 * detected ordinary receptacles go last.
 */
export const reviewQueue = (devices) => {
  const rank = (d) => {
    if (d.symbolId === 'unknown') return 0;
    if (d.state === DeviceState.FLAGGED) return 1;
    if (symbolById(d.symbolId)?.requiresFieldVerification) return 2;
    if (d.confidence < REVIEW_THRESHOLD) return 3;
    return 4;
  };
  return devices
    .filter((d) => d.state === DeviceState.PROPOSED || d.state === DeviceState.FLAGGED)
    .map((d, i) => ({ d, i }))
    .sort((a, b) => (rank(a.d) - rank(b.d)) || (a.d.confidence - b.d.confidence) || (a.i - b.i))
    .map(({ d }) => d);
};

/**
 * Detections that overlap enough to be worth asking about, as review items.
 * Reported, never auto-merged: two receptacles genuinely 6 inches apart on a
 * large-scale sheet look exactly like one detected twice, and only a person
 * looking at the drawing can tell.
 */
export const duplicateCandidates = (devices, threshold = 0.6) => {
  const live = devices.filter((d) => d.state !== DeviceState.REJECTED);
  const out = [];
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i]; const b = live[j];
      if (a.page !== b.page) continue;
      const overlap = iou(a.box, b.box);
      if (overlap < threshold) continue;
      out.push({
        ids: [a.id, b.id],
        iou: overlap,
        sameSymbol: a.symbolId === b.symbolId,
        centers: [boxCenter(a.box), boxCenter(b.box)],
      });
    }
  }
  return out.sort((x, y) => y.iou - x.iou);
};
