// ─── PIPELINE ────────────────────────────────────────────────────────────────
// The stage contract. AI never touches business logic; business logic never
// calls a model.
//
//   import → preprocess → recognize → verify → confirmed set → estimate → project
//
// Each stage is a pure function from one frozen artifact to the next, declared
// here with what it consumes and produces. That is what makes them replaceable:
// swapping the recognizer for a better model, or for a vector-PDF parser that
// needs no model at all, changes one registration and nothing downstream.
//
// The pipeline also enforces the ordering rule that the whole feature rests on:
// ESTIMATE cannot run on a document whose VERIFY stage has not completed. Not
// by convention — `run()` refuses.
//
// Pure module: no React, no network, no storage.

import { reviewSummary, DeviceState } from './device.js';

export const Stage = Object.freeze({
  IMPORT: 'IMPORT',
  PREPROCESS: 'PREPROCESS',
  RECOGNIZE: 'RECOGNIZE',
  VERIFY: 'VERIFY',
  ESTIMATE: 'ESTIMATE',
  PROJECT: 'PROJECT',
});

export const STAGE_ORDER = Object.freeze([
  Stage.IMPORT, Stage.PREPROCESS, Stage.RECOGNIZE, Stage.VERIFY, Stage.ESTIMATE, Stage.PROJECT,
]);

/**
 * Implementation maturity, declared per stage and surfaced in the UI.
 *
 * This exists because the honest answer for some stages today is "the interface
 * is real, the implementation is not". A feature that quietly no-ops a stage
 * looks identical to one that ran it — and on a takeoff, "deskew ran" versus
 * "deskew silently did nothing" is the difference between a good count and a
 * bad one. Declaring it makes the gap visible instead of discoverable.
 */
export const Maturity = Object.freeze({
  IMPLEMENTED: 'IMPLEMENTED',
  ADAPTER_ONLY: 'ADAPTER_ONLY',   // contract defined, real work not built yet
  NOT_STARTED: 'NOT_STARTED',
});

const registry = new Map();

/**
 * Register a stage implementation.
 * `run` must be pure: same input, same output, no I/O.
 */
export const registerStage = ({ stage, name, maturity, run, produces, consumes, notes = null }) => {
  if (!STAGE_ORDER.includes(stage)) throw new Error(`Unknown stage: ${stage}`);
  if (typeof run !== 'function') throw new Error(`Stage ${stage} needs a run function`);
  registry.set(stage, Object.freeze({ stage, name, maturity, run, produces, consumes, notes }));
  return registry.get(stage);
};

export const getStage = (stage) => registry.get(stage) ?? null;
export const registeredStages = () => STAGE_ORDER.map((s) => registry.get(s) ?? null);

/** What is actually built, for an honest status panel. */
export const pipelineStatus = () => STAGE_ORDER.map((stage) => {
  const impl = registry.get(stage);
  return Object.freeze({
    stage,
    name: impl?.name ?? null,
    maturity: impl?.maturity ?? Maturity.NOT_STARTED,
    notes: impl?.notes ?? null,
  });
});

export const clearStages = () => registry.clear();   // tests only

/**
 * A document moving through the pipeline. Frozen at every step; a stage returns
 * a new one rather than mutating, so any stage's output can be replayed.
 */
export const createDocument = ({ id, sourceUri = null, pages = 1, meta = {} } = {}) => Object.freeze({
  id: id ?? `doc_${Date.now().toString(36)}`,
  sourceUri,
  pages: Math.max(1, Math.floor(Number(pages) || 1)),
  devices: Object.freeze([]),
  completedStages: Object.freeze([]),
  // Set when a human established the drawing scale. Until then, nothing
  // measured in feet may be presented as a quantity — see estimate.js.
  planScaleVerified: false,
  warnings: Object.freeze([]),
  meta: Object.freeze({ ...meta }),
});

export const withStageComplete = (doc, stage, patch = {}) => Object.freeze({
  ...doc,
  ...patch,
  devices: Object.freeze(patch.devices ?? doc.devices),
  warnings: Object.freeze([...doc.warnings, ...(patch.warnings ?? [])]),
  completedStages: Object.freeze([...new Set([...doc.completedStages, stage])]),
});

/** Has this document cleared every stage up to and including `stage`? */
export const hasCompleted = (doc, stage) => doc.completedStages.includes(stage);

/**
 * The gate. VERIFY is complete only when a human has resolved every detection —
 * `reviewSummary.reviewComplete` — not when the verify screen was merely opened.
 */
export const verifyComplete = (doc) => reviewSummary(doc.devices).reviewComplete;

export const canRun = (doc, stage) => {
  const index = STAGE_ORDER.indexOf(stage);
  if (index <= 0) return { ok: true };

  const previous = STAGE_ORDER[index - 1];
  if (!hasCompleted(doc, previous)) {
    return { ok: false, reason: `${stage} needs ${previous} to finish first.` };
  }
  if (stage === Stage.ESTIMATE && !verifyComplete(doc)) {
    const { outstanding } = reviewSummary(doc.devices);
    return {
      ok: false,
      reason: `${outstanding} detection${outstanding === 1 ? '' : 's'} still unreviewed. An estimate built on unconfirmed detections is a guess wearing a total.`,
    };
  }
  return { ok: true };
};

/**
 * Run one stage. Returns { ok, doc, reason } — never throws for an ordering
 * problem, because "you cannot estimate yet" is a normal state to render, not
 * an exception to catch.
 */
export const runStage = (doc, stage, input = {}) => {
  const impl = registry.get(stage);
  if (!impl) return { ok: false, doc, reason: `No implementation registered for ${stage}.` };

  const gate = canRun(doc, stage);
  if (!gate.ok) return { ok: false, doc, reason: gate.reason };

  const patch = impl.run(doc, input) ?? {};
  return { ok: true, doc: withStageComplete(doc, stage, patch), reason: null };
};

/** Run stages in order, stopping at the first that cannot proceed. */
export const run = (doc, stages = STAGE_ORDER, input = {}) => {
  let current = doc;
  const trace = [];
  for (const stage of stages) {
    const result = runStage(current, stage, input);
    trace.push({ stage, ok: result.ok, reason: result.reason });
    if (!result.ok) return { doc: current, trace, stoppedAt: stage };
    current = result.doc;
  }
  return { doc: current, trace, stoppedAt: null };
};

export { DeviceState };
