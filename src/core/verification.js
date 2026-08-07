// ─── SOURCE DATA VERIFICATION ────────────────────────────────────────────────
// The register of every number in this app that came from a printed table, and
// whether a qualified person has actually checked it against that table.
//
// THE DISTINCTION THIS FILE EXISTS FOR:
//
//   A test proves the app is INTERNALLY CONSISTENT.
//   It cannot prove the SOURCE DATA was transcribed correctly.
//
// tests/conduitFill.test.js asserts that maxConductors() reproduces Annex C
// Table C.1 cell by cell. That is a real and useful guarantee — it pins the
// areas, the wire sizes, the Table 1 percentages and the Note 7 rounding
// together, so none of them can drift independently. What it does NOT do is
// prove Table C.1 was transcribed right, because the expected values in that
// test were written from memory by the same process that wrote the code.
//
// A green test suite on mis-transcribed data means the app consistently returns
// the wrong number. That is worse than an obviously broken one, because it
// looks trustworthy.
//
// So: every manually transcribed dataset is declared here with its status, and
// any production feature that depends on an unverified one is held OFF by
// `productionBlockers()`. Verification is a release gate implemented in the
// engine, not a line on somebody's checklist.
//
// Pure module: no React, no storage.

export const VerificationStatus = Object.freeze({
  // Transcribed into the repo, internally consistent, NOT checked against the
  // printed source by a qualified person. Cannot back a production feature.
  UNVERIFIED: 'UNVERIFIED',
  // Checked row by row against a legally obtained printed source by a named
  // qualified reviewer, with the edition and date recorded.
  SOURCE_VERIFIED: 'SOURCE_VERIFIED',
  // Derived from another dataset by code rather than transcribed. Inherits the
  // status of what it derives from.
  DERIVED: 'DERIVED',
  // Not source data. Arithmetic, definitions, or app-internal values.
  NOT_APPLICABLE: 'NOT_APPLICABLE',
});

export const STATUS_LABEL = Object.freeze({
  UNVERIFIED: 'Technical review pending',
  SOURCE_VERIFIED: 'Source data verified',
  DERIVED: 'Derived from source data',
  NOT_APPLICABLE: 'Not source data',
});

/**
 * Wording rules for anything shown to a user about content status.
 *
 * "Safety Verified" is banned. It reads as professional approval, and passing
 * automated tests is not professional approval. The permitted vocabulary says
 * exactly what happened and no more.
 */
export const BANNED_STATUS_WORDING = Object.freeze([
  'safety verified', 'safety-verified', 'code compliant', 'code-compliant',
  'certified', 'approved by', 'guaranteed', 'nec approved', 'inspector approved',
]);

export const PERMITTED_STATUS_WORDING = Object.freeze([
  'Internally tested',
  'Source data verified',
  'Technical review pending',
  'Reviewed by',
  'Jurisdiction verification required',
]);

const dataset = (def) => Object.freeze({
  ...def,
  // Everything a reviewer needs to do the check, and everything an auditor
  // needs to know it was done.
  reviewer: def.reviewer ?? null,
  reviewDate: def.reviewDate ?? null,
  sourceEdition: def.sourceEdition ?? null,
  dependsOn: Object.freeze(def.dependsOn ?? []),
});

/**
 * Every manually transcribed dataset in SparkConnect.
 *
 * Adding a table to the codebase without adding it here is caught by a test
 * that scans for numeric tables in the domain modules.
 */
export const DATASETS = Object.freeze({
  'ch9-table-4': dataset({
    id: 'ch9-table-4',
    label: 'NEC Chapter 9, Table 4 — conduit internal areas',
    where: 'src/core/domain/conduitFill.js · CONDUIT_AREA',
    status: VerificationStatus.UNVERIFIED,
    transcribedFrom: 'memory',
    note: 'Total internal areas for EMT, IMC, RMC and PVC-40, half-inch through two-inch. Previously held the 40% column by mistake, which is exactly the class of error a source check catches.',
    checkInstructions: 'Compare all 24 values against the printed Table 4, total-area column, for the adopted edition.',
    // Partial check, recorded because it is real and because it is NOT enough.
    //
    // A photograph of the printed Article 358 block confirmed all six EMT total
    // areas exactly. The same page also showed the 40% column carrying
    // 0.122 / 0.213 / 0.346 / 0.598 / 0.814 / 1.342 — precisely the values this
    // table used to hold as "conduit area", which independently confirms the
    // original defect rather than relying on the diagnosis being remembered
    // correctly.
    //
    // The status stays UNVERIFIED. Three of the four conduit types are on the
    // continuation page and were not seen, and the edition of the copy
    // photographed was not established. Clearing a dataset on a quarter of it
    // would be the same mistake as clearing it on a green test suite.
    verifiedRows: Object.freeze([
      'EMT (Article 358) total area, 1/2"-2" — confirmed against printed Table 4',
    ]),
    outstandingRows: Object.freeze([
      'IMC (Article 342) total areas — continuation page not seen',
      'RMC (Article 344) total areas — continuation page not seen',
      'PVC Schedule 40 (Article 352) total areas — continuation page not seen',
      'Edition of the photographed copy not established',
    ]),
  }),
  'ch9-table-5': dataset({
    id: 'ch9-table-5',
    label: 'NEC Chapter 9, Table 5 — conductor areas',
    where: 'src/core/domain/conduitFill.js · WIRE_AREA',
    status: VerificationStatus.UNVERIFIED,
    transcribedFrom: 'memory',
    checkInstructions: 'Compare THHN and XHHW areas, 14 AWG through 2/0, against printed Table 5.',
  }),
  'annex-c-table-c1': dataset({
    id: 'annex-c-table-c1',
    label: 'NEC Annex C, Table C.1 — EMT conductor counts',
    where: 'tests/conduitFill.test.js · TABLE_C1_EMT_THHN',
    status: VerificationStatus.UNVERIFIED,
    transcribedFrom: 'memory',
    note: 'Used as the cross-check on the fill engine. One cell (1/2" with #6) was already found wrong on first transcription, which is the strongest available argument that the rest need checking too.',
    checkInstructions: 'Compare all 36 cells against printed Table C.1, THHN column.',
  }),
  'table-250-66': dataset({
    id: 'table-250-66',
    label: 'NEC Table 250.66 — grounding electrode conductor sizing',
    where: 'App.js · exam questions gb07, sf04',
    status: VerificationStatus.UNVERIFIED,
    transcribedFrom: 'memory',
    note: 'Two shipped questions were corrected from #2 to #4 for a 3/0 Cu service on the strength of a recalled table. The correction is believed right and has not been checked against the book.',
    checkInstructions: 'Confirm the 2/0-or-3/0 row gives 4 AWG copper, and confirm the rows either side.',
  }),
  'table-250-122': dataset({
    id: 'table-250-122',
    label: 'NEC Table 250.122 — equipment grounding conductor sizing',
    where: 'src/core/content/dailyQuestions.js · q16',
    status: VerificationStatus.UNVERIFIED,
    transcribedFrom: 'memory',
    note: 'A shipped daily question was corrected from #14 to #12 for a 20 A circuit. Same situation: believed right, not source-checked.',
    checkInstructions: 'Confirm the 15 A, 20 A, 60 A and 100 A rows for copper.',
  }),
  'table-310-16': dataset({
    id: 'table-310-16',
    label: 'NEC Table 310.16 — allowable ampacities',
    where: 'src/core/ai/tools.js · derating base ampacities',
    status: VerificationStatus.UNVERIFIED,
    transcribedFrom: 'memory',
    checkInstructions: 'Confirm the 90°C column for 14 through 6 AWG copper.',
  }),
  'table-310-15-c-1': dataset({
    id: 'table-310-15-c-1',
    label: 'NEC Table 310.15(C)(1) — adjustment factors',
    where: 'src/core/ai/tools.js · adjustmentFactor',
    status: VerificationStatus.UNVERIFIED,
    transcribedFrom: 'memory',
    checkInstructions: 'Confirm the 4-6, 7-9, 10-20, 21-30, 31-40 and 41+ bands.',
  }),
  'table-314-16-b': dataset({
    id: 'table-314-16-b',
    label: 'NEC Table 314.16(B) — box fill volume allowances',
    where: 'App.js · CONDUCTOR_VOL, src/core/ai/tools.js · BOX_VOLUME',
    status: VerificationStatus.UNVERIFIED,
    transcribedFrom: 'memory',
    checkInstructions: 'Confirm 18 AWG through 6 AWG volume allowances.',
  }),
  'table-240-4-d': dataset({
    id: 'table-240-4-d',
    label: 'NEC 240.4(D) — small-conductor overcurrent limits',
    where: 'src/core/ai/tools.js · SMALL_CONDUCTOR_LIMIT',
    status: VerificationStatus.UNVERIFIED,
    transcribedFrom: 'memory',
    checkInstructions: 'Confirm 14 AWG = 15 A, 12 AWG = 20 A, 10 AWG = 30 A copper.',
  }),
  'conductor-resistance': dataset({
    id: 'conductor-resistance',
    label: 'Conductor resistance, ohms per 1000 ft',
    where: 'App.js · VD_RES, src/core/ai/tools.js · VD_RESISTANCE',
    status: VerificationStatus.UNVERIFIED,
    transcribedFrom: 'memory',
    note: 'Chapter 9 Table 8 values. Drives every voltage-drop answer in the app.',
    checkInstructions: 'Confirm uncoated copper DC resistance for 14 AWG through 1 AWG against Table 8.',
  }),
  'nec-citations': dataset({
    id: 'nec-citations',
    label: 'NEC citation whitelist — section numbers and topics',
    where: 'src/nec/citations.js · CITATIONS',
    status: VerificationStatus.UNVERIFIED,
    transcribedFrom: 'memory',
    note: 'The topics are written in our own words, so nothing here reproduces NFPA text. What needs checking is that each section NUMBER exists and covers what we say it does.',
    checkInstructions: 'Confirm each section number exists in the adopted edition and covers the stated topic.',
  }),
  'circuit-engine': dataset({
    id: 'circuit-engine',
    label: 'Circuit solver and validator',
    where: 'src/circuit/solver.js, src/circuit/validator.js',
    status: VerificationStatus.NOT_APPLICABLE,
    note: 'Connectivity and switching logic, derived from first principles rather than transcribed from a table. Its lessons still go through the human review gate in review.js, which is a separate control.',
  }),
});

export const DATASET_IDS = Object.freeze(Object.keys(DATASETS));
export const datasetById = (id) => DATASETS[id] ?? null;

export const isVerified = (id) => {
  const d = datasetById(id);
  if (!d) return false;
  if (d.status === VerificationStatus.NOT_APPLICABLE) return true;
  if (d.status === VerificationStatus.SOURCE_VERIFIED) return true;
  if (d.status === VerificationStatus.DERIVED) return d.dependsOn.every(isVerified);
  return false;
};

export const unverifiedDatasets = () =>
  DATASET_IDS.map(datasetById).filter((d) => !isVerified(d.id));

/**
 * Which production features depend on which datasets.
 *
 * A feature listed here is held OFF while any of its datasets is unverified.
 * This is the release gate, and it is code rather than a checklist because a
 * checklist is what gets skipped at 11pm before a submission.
 */
export const FEATURE_DEPENDENCIES = Object.freeze({
  conduitFillCalculator: ['ch9-table-4', 'ch9-table-5'],
  voltageDropCalculator: ['conductor-resistance'],
  boxFillCalculator: ['table-314-16-b'],
  ampacityCalculator: ['table-310-16', 'table-310-15-c-1', 'table-240-4-d'],
  sparkAiCalculationTools: ['ch9-table-4', 'ch9-table-5', 'conductor-resistance', 'table-314-16-b', 'table-310-16', 'table-310-15-c-1', 'table-240-4-d'],
  dayOneLevel: ['ch9-table-4', 'ch9-table-5', 'table-314-16-b', 'table-310-16', 'table-240-4-d'],
  blueprintEstimator: [],
  wiringSimulator: ['circuit-engine'],
  necCitationDisplay: ['nec-citations'],
});

export const FEATURE_IDS = Object.freeze(Object.keys(FEATURE_DEPENDENCIES));

/** Datasets holding a feature back. Empty means it is clear to ship. */
export const productionBlockers = (featureId) =>
  (FEATURE_DEPENDENCIES[featureId] ?? []).filter((id) => !isVerified(id));

export const isProductionReady = (featureId) =>
  Object.prototype.hasOwnProperty.call(FEATURE_DEPENDENCIES, featureId)
  && productionBlockers(featureId).length === 0;

/**
 * The banner a gated feature must show. Says what is true — the arithmetic is
 * tested, the source rows have not been checked — without implying the numbers
 * are wrong or that anyone has approved them.
 */
export const gateNotice = (featureId) => {
  const blockers = productionBlockers(featureId);
  if (blockers.length === 0) return null;
  const labels = blockers.map((id) => datasetById(id)?.label ?? id);
  return Object.freeze({
    featureId,
    status: VerificationStatus.UNVERIFIED,
    statusLabel: STATUS_LABEL.UNVERIFIED,
    headline: 'Technical review pending',
    body: 'The arithmetic here is tested, but the code table values it reads have not yet been checked against a printed source by a qualified reviewer. Verify any result against the NEC edition adopted by your AHJ before relying on it.',
    datasets: Object.freeze(labels),
  });
};

/** The whole picture, for a release checklist or an internal screen. */
export const verificationReport = () => Object.freeze({
  datasets: Object.freeze(DATASET_IDS.map((id) => {
    const d = datasetById(id);
    return Object.freeze({
      id: d.id, label: d.label, where: d.where,
      status: d.status, statusLabel: STATUS_LABEL[d.status],
      verified: isVerified(id),
      // Partial checks are recorded and reported, but never count as clearing
      // the dataset. Progress is visible; the gate does not move.
      verifiedRows: d.verifiedRows ?? null,
      outstandingRows: d.outstandingRows ?? null,
      reviewer: d.reviewer, reviewDate: d.reviewDate, sourceEdition: d.sourceEdition,
      checkInstructions: d.checkInstructions ?? null,
    });
  })),
  features: Object.freeze(FEATURE_IDS.map((id) => Object.freeze({
    id, ready: isProductionReady(id), blockers: Object.freeze(productionBlockers(id)),
  }))),
  unverifiedCount: unverifiedDatasets().length,
  blockedFeatures: FEATURE_IDS.filter((id) => !isProductionReady(id)).length,
});

/** Reject wording that implies an approval nobody gave. */
export const isPermittedStatusWording = (text) => {
  const s = String(text ?? '').toLowerCase();
  return !BANNED_STATUS_WORDING.some((banned) => s.includes(banned));
};
