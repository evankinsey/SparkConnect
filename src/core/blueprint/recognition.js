// ─── RECOGNITION ADAPTER ─────────────────────────────────────────────────────
// The boundary between a model and everything that matters.
//
// BE CLEAR ABOUT WHAT THIS IS. There is no symbol-recognition model in this
// repository. Training or shipping one is a real computer-vision project, not
// an afternoon, and pretending otherwise is the exact failure mode this feature
// is supposed to be immune to.
//
// What IS built here, and is production-quality:
//
//   - the contract a recognizer must satisfy
//   - hard normalization of whatever it returns, because model output is
//     untrusted input in the same sense a network request body is
//   - the adapter that wraps the existing whole-sheet vision takeoff so the
//     pipeline has a working RECOGNIZE stage today
//
// The guarantee this file provides: no matter what comes back from a model —
// unknown symbol names, negative confidence, boxes with x2 < x1, thousands of
// duplicate detections, a string where a number belongs — what leaves this
// module is a well-formed device array where every entry is PROPOSED or
// FLAGGED, never CONFIRMED. A model cannot promote its own output.
//
// Pure module: no React, no network. The caller performs the request.

import { createDevice, Origin, DeviceState, FLOOR_THRESHOLD, iou } from './device.js';
import { resolveSymbol, isKnownSymbol } from './symbols.js';
import { Maturity } from './pipeline.js';

/** A single sheet's worth of detections is capped. Past this, the model lost count. */
export const MAX_DETECTIONS_PER_PAGE = 2000;
/** Detections overlapping more than this from ONE model pass are the same thing. */
export const SELF_DUPLICATE_IOU = 0.85;

/**
 * Normalize one raw detection. Returns null when it cannot be salvaged into
 * something a human could review.
 */
export const normalizeDetection = (raw, { page = 1 } = {}) => {
  if (!raw || typeof raw !== 'object') return null;

  const symbol = resolveSymbol(raw.symbol ?? raw.symbolId ?? raw.type ?? raw.label);
  const confidence = Number(raw.confidence ?? raw.score ?? 0);

  // A box is required. A detection without coordinates cannot be reviewed,
  // cannot be zoomed to, and cannot be checked — so it is not a detection, it
  // is a rumour.
  const box = raw.box ?? raw.bbox ?? raw.bounds;
  if (!box || typeof box !== 'object') return null;

  const safeConfidence = Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0;
  if (safeConfidence < FLOOR_THRESHOLD) return null;

  return createDevice({
    symbolId: symbol.id,
    page: Number(raw.page ?? page) || page,
    box,
    rotation: raw.rotation,
    confidence: safeConfidence,
    origin: Origin.AI,
    tagText: typeof raw.text === 'string' ? raw.text : null,
    room: typeof raw.room === 'string' ? raw.room : null,
    meta: {
      // Kept so a low-confidence review can show what the model actually said,
      // including a symbol name we do not recognise.
      rawSymbol: typeof (raw.symbol ?? raw.type) === 'string' ? (raw.symbol ?? raw.type) : null,
      unmatchedSymbol: !isKnownSymbol(raw.symbol ?? raw.symbolId ?? raw.type ?? ''),
    },
  });
};

/** Drop detections a single pass emitted twice for the same mark. */
export const dedupeWithinPass = (devices, threshold = SELF_DUPLICATE_IOU) => {
  const kept = [];
  for (const d of devices) {
    const clash = kept.find((k) => k.page === d.page && iou(k.box, d.box) >= threshold);
    if (!clash) { kept.push(d); continue; }
    // Same mark twice: keep the more confident reading, and remember the other
    // symbol so review can offer it as the alternative.
    if (d.confidence > clash.confidence) {
      kept[kept.indexOf(clash)] = Object.freeze({
        ...d,
        meta: Object.freeze({ ...d.meta, alsoRead: clash.symbolId }),
      });
    }
  }
  return kept;
};

/**
 * Normalize a whole recognizer response.
 * Always returns { devices, warnings } — never throws on bad model output.
 */
export const normalizeResponse = (raw, { page = 1 } = {}) => {
  const warnings = [];
  const rows = Array.isArray(raw) ? raw : Array.isArray(raw?.detections) ? raw.detections : null;

  if (!rows) {
    return { devices: [], warnings: ['The recognizer returned nothing usable. Nothing was added.'] };
  }

  if (rows.length > MAX_DETECTIONS_PER_PAGE) {
    warnings.push(`The recognizer returned ${rows.length} detections for one sheet, past the ${MAX_DETECTIONS_PER_PAGE} cap. The result was discarded rather than truncated — a truncated takeoff looks complete and is not.`);
    return { devices: [], warnings };
  }

  const normalized = rows.map((r) => normalizeDetection(r, { page })).filter(Boolean);
  const dropped = rows.length - normalized.length;
  if (dropped > 0) {
    warnings.push(`${dropped} detection${dropped === 1 ? '' : 's'} discarded for missing coordinates or confidence below the floor.`);
  }

  const deduped = dedupeWithinPass(normalized);
  if (deduped.length < normalized.length) {
    warnings.push(`${normalized.length - deduped.length} overlapping duplicate${normalized.length - deduped.length === 1 ? '' : 's'} collapsed.`);
  }

  const unknown = deduped.filter((d) => d.symbolId === 'unknown').length;
  if (unknown > 0) {
    warnings.push(`${unknown} symbol${unknown === 1 ? '' : 's'} could not be identified and ${unknown === 1 ? 'is' : 'are'} flagged for you to label.`);
  }

  return { devices: deduped, warnings };
};

/**
 * The contract. Any recognizer — a hosted vision model, an on-device model, a
 * vector-PDF parser — satisfies this and the pipeline does not care which.
 *
 * `detect` receives { sourceUri, page } and returns raw rows. It is the ONLY
 * part that performs I/O, and it lives outside this module on purpose.
 */
export const createRecognizer = ({ name, detect, maturity = Maturity.ADAPTER_ONLY, notes = null }) => Object.freeze({
  name,
  maturity,
  notes,
  async recognize(doc, { page = 1 } = {}) {
    let raw;
    try {
      raw = await detect({ sourceUri: doc.sourceUri, page });
    } catch (err) {
      // A failed recognizer must produce an empty takeoff, never a partial one.
      return { devices: [], warnings: [`Recognition failed: ${err?.message ?? 'unknown error'}. No devices were added.`] };
    }
    return normalizeResponse(raw, { page });
  },
});

/**
 * Adapter for the existing whole-sheet vision takeoff (src/core/field/takeoff.js).
 *
 * That path returns counts per category with no coordinates. Coordinates are
 * what make a detection reviewable, so this deliberately does NOT invent boxes
 * to satisfy the schema — it produces one FLAGGED placeholder per category
 * carrying the count, which a human resolves by placing or confirming devices.
 *
 * Fabricating positions to make the data model look satisfied would be lying to
 * our own review screen, and the review screen is the safety mechanism.
 */
export const legacyCountAdapter = (counts, { page = 1 } = {}) => {
  const devices = [];
  const warnings = [
    'This takeoff came from a whole-sheet count with no symbol positions. Each line is a claimed quantity to confirm against the drawing, not a set of located devices.',
  ];

  for (const [key, value] of Object.entries(counts ?? {})) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) continue;
    const symbol = resolveSymbol(key);
    devices.push(createDevice({
      symbolId: symbol.id,
      page,
      box: { x1: 0, y1: 0, x2: 0, y2: 0 },
      // Low by construction: a number from a photograph with no position is the
      // weakest evidence this system accepts, and it must sort to the top of
      // the review queue.
      confidence: 0.4,
      origin: Origin.AI,
      meta: { legacyCount: n, positionless: true },
    }));
  }

  return { devices, warnings };
};

export { DeviceState };
