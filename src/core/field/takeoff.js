// ─── BLUEPRINT TAKEOFF ───────────────────────────────────────────────────────
// Photograph a plan sheet, get a device count back.
//
// The counts come from a vision model, which means they are an ESTIMATE from a
// photograph of a drawing — not a quantity survey. Two consequences shape this
// module:
//
//   1. Model output is untrusted and is validated hard. A count of "twelve" or
//      -3 or 999999 receptacles has to be rejected before it reaches a material
//      list the user might order from.
//   2. The result is always presented as a starting point to check against the
//      sheet, never as a final takeoff. `confidence` and `needsReview` exist so
//      the screen can say so without the user having to infer it.
//
// Pure module: no React, no network. The screen does the upload; this decides
// what is allowed to come back.

/** Device categories we ask the model to count. Anything else is discarded. */
export const TAKEOFF_ITEMS = Object.freeze([
  { id: 'receptacles', label: 'Receptacles', icon: 'flash', unit: 'ea' },
  { id: 'switches', label: 'Switches', icon: 'toggle', unit: 'ea' },
  { id: 'lights', label: 'Light fixtures', icon: 'bulb', unit: 'ea' },
  { id: 'fans', label: 'Fans', icon: 'aperture', unit: 'ea' },
  { id: 'panels', label: 'Panels', icon: 'grid', unit: 'ea' },
  { id: 'disconnects', label: 'Disconnects', icon: 'power', unit: 'ea' },
  { id: 'smokeDetectors', label: 'Smoke / CO detectors', icon: 'notifications', unit: 'ea' },
  { id: 'dataJacks', label: 'Data / comm jacks', icon: 'wifi', unit: 'ea' },
  { id: 'junctionBoxes', label: 'Junction boxes', icon: 'cube', unit: 'ea' },
]);

export const itemById = (id) => TAKEOFF_ITEMS.find((i) => i.id === id) ?? null;

// A single plan sheet with more than this many of one device is far more likely
// to be a model that lost count than a real drawing, and letting it through
// would put a nonsense number on a material list.
export const MAX_PER_ITEM = 500;
export const MAX_NOTES = 400;
export const MAX_NOTE_LINES = 6;

export const Confidence = { HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW' };
const CONFIDENCES = new Set(Object.values(Confidence));

const cleanText = (v, max) => {
  if (typeof v !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
};

/**
 * A count must be a non-negative whole number within range. Strings that look
 * like numbers are accepted (models return "12" constantly) but anything
 * fractional, negative, absurd, or non-numeric is dropped rather than coerced —
 * a wrong count is worse than a missing one.
 */
const countOf = (v) => {
  const n = typeof v === 'number' ? v : (typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > MAX_PER_ITEM) return null;
  return n;
};

/**
 * Validate a takeoff returned by the model.
 * Returns { ok: true, takeoff } or { ok: false, reason }.
 */
export const validateTakeoff = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'not an object' };

  const source = raw.counts && typeof raw.counts === 'object' ? raw.counts : raw;
  const counts = {};
  const dropped = [];
  for (const item of TAKEOFF_ITEMS) {
    if (!(item.id in source)) continue;
    const n = countOf(source[item.id]);
    if (n === null) { dropped.push(item.id); continue; }
    if (n > 0) counts[item.id] = n;
  }

  if (Object.keys(counts).length === 0) {
    return { ok: false, reason: 'no usable counts came back — try a straighter, better-lit shot of the sheet' };
  }

  const notes = Array.isArray(raw.notes)
    ? raw.notes.slice(0, MAX_NOTE_LINES).map((n) => cleanText(n, MAX_NOTES)).filter(Boolean)
    : (cleanText(raw.notes, MAX_NOTES) ? [cleanText(raw.notes, MAX_NOTES)] : []);

  const confidence = CONFIDENCES.has(raw.confidence) ? raw.confidence : Confidence.LOW;

  return {
    ok: true,
    takeoff: {
      counts,
      dropped,
      notes,
      confidence,
      // A takeoff off a phone photo of a drawing always wants a human pass. The
      // flag is set for anything below HIGH, or whenever we threw a value away,
      // because a dropped value means the model was already unreliable here.
      needsReview: confidence !== Confidence.HIGH || dropped.length > 0,
      sheetLabel: cleanText(raw.sheetLabel, 60),
      createdAt: Date.now(),
    },
  };
};

/** Total device count, for the summary line. */
export const totalDevices = (takeoff) =>
  Object.values(takeoff?.counts ?? {}).reduce((a, b) => a + b, 0);

/** Ordered rows for rendering, in TAKEOFF_ITEMS order rather than object order. */
export const takeoffRows = (takeoff) =>
  TAKEOFF_ITEMS
    .filter((i) => (takeoff?.counts ?? {})[i.id] > 0)
    .map((i) => ({ ...i, count: takeoff.counts[i.id] }));

/**
 * Turn a takeoff into material-estimator lines.
 *
 * Only devices are carried across — the things the drawing actually shows one
 * of. Deliberately NOT estimated here: wire, conduit and box fill, because
 * those depend on routing and lengths that a device count cannot know, and
 * guessing them would put invented footage on a purchase order.
 */
export const takeoffToMaterials = (takeoff) => {
  const rows = takeoffRows(takeoff);
  const materials = [];
  for (const r of rows) {
    materials.push({ item: r.label, qty: r.count, unit: r.unit, from: 'takeoff' });
    // Every device shown needs something to land in. One box per device is the
    // floor, not the answer — the user adjusts.
    if (['receptacles', 'switches', 'lights', 'fans', 'dataJacks'].includes(r.id)) {
      materials.push({ item: `Device box for ${r.label.toLowerCase()}`, qty: r.count, unit: 'ea', from: 'takeoff' });
    }
  }
  return materials;
};

/**
 * The instruction sent with the photo. Kept here, next to the validator, so the
 * shape we ask for and the shape we accept cannot drift apart.
 */
export const takeoffPrompt = () =>
  [
    'You are doing a preliminary electrical device takeoff from a photograph of a plan sheet.',
    'Count only symbols you can actually see on the sheet. Do not infer or estimate quantities that are not drawn.',
    'Reply with JSON only, no prose, in exactly this shape:',
    '{"counts":{"receptacles":0,"switches":0,"lights":0,"fans":0,"panels":0,"disconnects":0,"smokeDetectors":0,"dataJacks":0,"junctionBoxes":0},',
    '"confidence":"HIGH|MEDIUM|LOW","sheetLabel":"e.g. E1.1 First Floor Power","notes":["anything unreadable or ambiguous"]}',
    'Omit any category you cannot count. Use LOW confidence if the image is blurred, skewed, partial, or the legend is not visible.',
  ].join(' ');

/**
 * Pull the JSON object out of a model reply that may be wrapped in prose or a
 * fenced code block. Returns null rather than throwing on anything unparseable.
 */
export const parseTakeoffReply = (text) => {
  if (typeof text !== 'string' || !text.trim()) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
};

export const TAKEOFF_DISCLAIMER =
  'Preliminary count from a photo of a drawing, not a quantity survey. Verify ' +
  'every number against the sheet and the legend before ordering or bidding.';
