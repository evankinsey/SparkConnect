// ─── CONTENT AUTHORITY ───────────────────────────────────────────────────────
// The boundary between what a language model may write and what only the
// deterministic engine may decide.
//
// SparkConnect teaches people how to wire buildings. Someone can copy what this
// app shows them into a real panel in a real building. So the split below is
// not a style preference and it is not a quality tier — it is the line between
// content that is merely wrong and content that can get somebody killed.
//
// The rule, stated once:
//
//   A model may invent the STORY. It may never invent the ELECTRICITY.
//
// It may name the customer, describe the room, set the time of day, and phrase
// the complaint. It may not decide a wire size, a breaker size, where a neutral
// goes, which screw the line lands on, or what the fix is. Those come from
// src/circuit/solver.js, which is deterministic and cannot hallucinate, or from
// content a qualified human reviewed and signed.
//
// Pure module: no React, no network, no storage.

/**
 * Field names that carry electrical truth. If a generated payload contains any
 * of these — at any depth — it is rejected outright.
 *
 * This list is deliberately broad and deliberately paranoid. A false positive
 * costs us one discarded generation. A false negative ships a hallucinated
 * conductor size to an apprentice.
 */
export const ELECTRICAL_FIELDS = Object.freeze([
  // Conductors and their sizing
  'awg', 'wireSize', 'wireGauge', 'conductorSize', 'conductor', 'conductors',
  'ampacity', 'ampacityTable', 'derating', 'adjustmentFactor',

  // Overcurrent protection
  'breaker', 'breakerSize', 'ocpd', 'ocpdSize', 'ampRating', 'amperage',
  'fuse', 'fuseSize', 'interruptRating', 'aic',

  // Grounding and bonding — the whole family
  'ground', 'grounding', 'groundingMethod', 'egc', 'bonding', 'bondingJumper',
  'groundingElectrode', 'gec',

  // The grounded conductor. Getting this wrong is the fault that leaves a
  // fixture energized with the switch off.
  'neutral', 'neutralRouting', 'groundedConductor', 'mwbc', 'sharedNeutral',
  'handleTie',

  // Switching topology
  'switchLeg', 'switchedHot', 'travelers', 'traveler', 'common', 'commonScrew',
  'polarity', 'lineSide', 'loadSide', 'lineLoad', 'terminal', 'terminals',
  'screw', 'screws',

  // Transformers, services, distribution
  'transformer', 'transformerWiring', 'primary', 'secondary', 'phasing',
  'phase', 'voltage', 'voltageDrop', 'serviceSize', 'panelSchedule',
  'circuitDirectory', 'loadCalculation', 'loadCalc', 'demandFactor',

  // Anything that is the answer rather than the question
  'circuit', 'topology', 'netlist', 'wiring', 'diagram', 'schematic',
  'solution', 'correctAnswer', 'fix', 'remedy', 'rootCause', 'repair',
  'steps', 'procedure', 'troubleshootingSteps',

  // Code references. An invented citation is the most durable kind of wrong,
  // because it survives being screenshotted and passed around a jobsite.
  'nec', 'necRef', 'necArticle', 'article', 'codeRef', 'codeSection',
  'ref', 'reference', 'citation', 'table', 'tableRef',
]);

const ELECTRICAL = new Set(ELECTRICAL_FIELDS.map((f) => f.toLowerCase()));

/** Is this key one the model is forbidden to write? */
export const isElectricalField = (key) =>
  typeof key === 'string' && ELECTRICAL.has(key.toLowerCase());

/**
 * Every forbidden path inside a payload, deepest-first traversal.
 * Returns dotted paths like `scenario.hints.0.necRef` so a rejection message
 * can say exactly what tripped it.
 */
export const electricalFieldsIn = (value, path = '', seen = new WeakSet()) => {
  if (value === null || typeof value !== 'object') return [];
  if (seen.has(value)) return []; // cycles in untrusted input are not a crash
  seen.add(value);

  const hits = [];
  if (Array.isArray(value)) {
    value.forEach((item, i) => hits.push(...electricalFieldsIn(item, `${path}${path ? '.' : ''}${i}`, seen)));
    return hits;
  }
  for (const [key, child] of Object.entries(value)) {
    const here = `${path}${path ? '.' : ''}${key}`;
    if (isElectricalField(key)) hits.push(here);
    hits.push(...electricalFieldsIn(child, here, seen));
  }
  return hits;
};

export class ElectricalAuthorityError extends Error {
  constructor(paths, source) {
    super(`Generated content may not set electrical fields: ${paths.join(', ')}`);
    this.name = 'ElectricalAuthorityError';
    this.paths = paths;
    this.source = source ?? null;
  }
}

/**
 * The gate every generation path must pass through.
 *
 * Throws rather than returning false on purpose: a caller that forgets to check
 * a boolean fails open, and failing open is the one thing this module exists to
 * prevent. A caller that forgets to catch gets a loud crash in development and
 * a discarded generation in production — both are safe outcomes.
 *
 * @param patch  the object a model produced
 * @param source label for the error, e.g. 'troubleshooting-pack'
 */
export const assertNarrativeOnly = (patch, source) => {
  const hits = electricalFieldsIn(patch);
  if (hits.length) throw new ElectricalAuthorityError(hits, source);
  return patch;
};

/**
 * Non-throwing form for batch paths that filter a list of candidates.
 * Returns the kept items and the rejections, so a caller can log what it
 * dropped instead of silently swallowing it.
 */
export const partitionNarrativeOnly = (items, source) => {
  const kept = [];
  const rejected = [];
  for (const item of Array.isArray(items) ? items : []) {
    const hits = electricalFieldsIn(item);
    if (hits.length) rejected.push({ item, paths: hits, source: source ?? null });
    else kept.push(item);
  }
  return { kept, rejected };
};

/**
 * The exact words the app says when it is not confident. There is one of these,
 * it is used everywhere, and it never softens into a guess with a hedge on it.
 *
 * "Probably a loose neutral" is worse than silence, because the reader keeps the
 * first half of the sentence and drops the hedge.
 */
export const CANNOT_VERIFY =
  "I can't verify this. Check the NEC or ask a licensed instructor before acting on it.";

/**
 * Confidence floor for anything electrical. Below this, callers return
 * CANNOT_VERIFY instead of the answer — no partial credit, no hedged version.
 */
export const CONFIDENCE_FLOOR = 0.85;

export const meetsConfidenceFloor = (confidence) =>
  typeof confidence === 'number' && Number.isFinite(confidence) && confidence >= CONFIDENCE_FLOOR;
