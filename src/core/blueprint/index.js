// ─── BLUEPRINT AI ────────────────────────────────────────────────────────────
// One import surface for the feature, and an honest statement of what is built.
//
// READ THIS BEFORE BUILDING UI ON TOP OF IT.
//
// The foundation is real and tested. The recognizer is not. Specifically:
//
//   BUILT, TESTED, PRODUCTION-SHAPED
//     - the symbol library (closed vocabulary, extensible by one row)
//     - the device object, its lifecycle, and its audit trail
//     - the human verification layer (accept/reject/relabel/merge/split)
//     - material estimating with per-line basis and visible exclusions
//     - labor estimating with the default → company → project override chain
//     - grounded query, which cannot answer from anything but confirmed devices
//     - the pipeline gate that refuses to estimate before review is complete
//
//   NOT BUILT
//     - symbol recognition. There is no CV model here. `recognition.js` defines
//       the contract and hardens whatever a recognizer returns; something has to
//       be plugged into it.
//     - PDF/image preprocessing: page detection, deskew, rotation correction,
//       contrast. These need native imaging that is not in this bundle.
//
// The reason the gap is declared in code rather than buried in a ticket: a
// pipeline that silently no-ops a stage is indistinguishable from one that ran
// it, and on a takeoff that difference is a wrong number nobody can trace.
// `pipelineStatus()` reports maturity per stage so the UI can say "deskew is not
// running" instead of implying it did.

export * from './symbols.js';
export * from './device.js';
export * from './verification.js';
export * from './estimate.js';
export * from './labor.js';
export * from './query.js';
export * from './pipeline.js';
export * from './recognition.js';

import { Stage, Maturity, registerStage, pipelineStatus } from './pipeline.js';
import { legacyCountAdapter } from './recognition.js';
import { reviewSummary } from './device.js';

/**
 * Register what actually exists today.
 *
 * IMPORT and VERIFY are real: importing is holding a file reference, and
 * verification is entirely this codebase's own logic. PREPROCESS is honestly
 * absent. RECOGNIZE runs through the legacy whole-sheet count until a real
 * recognizer is plugged in, and is marked ADAPTER_ONLY so nothing presents it
 * as located-symbol detection.
 */
export const registerDefaultStages = () => {
  registerStage({
    stage: Stage.IMPORT,
    name: 'File reference',
    maturity: Maturity.IMPLEMENTED,
    consumes: 'a file uri',
    produces: 'a document',
    run: (doc, { sourceUri, pages } = {}) => ({
      ...(sourceUri ? { sourceUri } : {}),
      ...(pages ? { pages } : {}),
    }),
  });

  registerStage({
    stage: Stage.PREPROCESS,
    name: 'Sheet preparation',
    maturity: Maturity.NOT_STARTED,
    consumes: 'a document',
    produces: 'deskewed, contrast-corrected page images',
    notes: 'Page detection, deskew, rotation and contrast are not implemented. Sheets are passed through untouched, which lowers recognition quality on photographed plans.',
    run: () => ({
      warnings: ['Sheets were not deskewed or contrast-corrected. A photographed plan will recognise worse than a flat PDF.'],
    }),
  });

  registerStage({
    stage: Stage.RECOGNIZE,
    name: 'Whole-sheet count (legacy adapter)',
    maturity: Maturity.ADAPTER_ONLY,
    consumes: 'page images',
    produces: 'proposed devices',
    notes: 'No symbol-recognition model is present. This adapter carries counts from the existing vision takeoff, which returns quantities with no positions — every line is flagged for a human to locate and confirm.',
    run: (doc, { counts, page = 1 } = {}) => {
      if (!counts) return { warnings: ['No recognition input was supplied. Nothing was added.'] };
      const { devices, warnings } = legacyCountAdapter(counts, { page });
      return { devices: [...doc.devices, ...devices], warnings };
    },
  });

  registerStage({
    stage: Stage.VERIFY,
    name: 'Human review',
    maturity: Maturity.IMPLEMENTED,
    consumes: 'proposed devices',
    produces: 'confirmed devices',
    run: (doc, { devices } = {}) => (devices ? { devices } : {}),
  });

  registerStage({
    stage: Stage.ESTIMATE,
    name: 'Material and labor estimate',
    maturity: Maturity.IMPLEMENTED,
    consumes: 'confirmed devices',
    produces: 'estimate lines with basis',
    run: () => ({}),
  });

  return pipelineStatus();
};

/**
 * What the UI should tell the user about this feature's own reliability, right
 * now, given a document. Not a static disclaimer — it changes as stages get
 * built and as review progresses.
 */
export const featureHonesty = (doc) => {
  const status = pipelineStatus();
  const gaps = status.filter((s) => s.maturity !== Maturity.IMPLEMENTED && s.notes);
  const review = reviewSummary(doc?.devices ?? []);

  return Object.freeze({
    stages: Object.freeze(status),
    gaps: Object.freeze(gaps.map((g) => Object.freeze({ stage: g.stage, note: g.notes }))),
    reviewComplete: review.reviewComplete,
    outstanding: review.outstanding,
    // The one sentence that has to appear wherever a total does.
    disclaimer: 'SparkConnect assists with takeoff. It is not an engineer and this is not a stamped design. '
      + 'Every quantity is a starting point to check against the drawings and the field before it is bid or ordered.',
  });
};
