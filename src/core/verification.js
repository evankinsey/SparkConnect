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
    label: 'NEC Table 314.16(B)(1) — box fill volume allowances',
    where: 'App.js · CONDUCTOR_VOL, src/core/ai/tools.js · BOX_VOLUME',
    status: VerificationStatus.SOURCE_VERIFIED,
    transcribedFrom: 'NEC 2023, Table 314.16(B)(1), printed page 70-198',
    sourceEdition: '2023',
    reviewDate: '2026-08-07',
    reviewer: "App owner, against the printed 2023 NEC in their possession. The edition is the owner's attestation rather than a photographed title page — recorded that way on purpose so a later auditor knows which part was read and which part was stated.",
    verifiedRows: Object.freeze([
      'Free space within box for each conductor, in cubic inches — 18 AWG 1.50, '
      + '16 AWG 1.75, 14 AWG 2.00, 12 AWG 2.25, 10 AWG 2.50, 8 AWG 3.00, 6 AWG 5.00. '
      + 'All seven match the shipped values exactly.',
    ]),
    note: 'The table is titled 314.16(B)(1) in the 2023 edition. Our label said 314.16(B); '
      + 'corrected here so a citation points at something that exists.',
    checkInstructions: 'Confirmed 2026-08-07. Re-check on the next code cycle.',
  }),
  'table-240-4-d': dataset({
    id: 'table-240-4-d',
    label: 'NEC 240.4(D) — small-conductor overcurrent limits',
    where: 'src/core/ai/tools.js · SMALL_CONDUCTOR_LIMIT',
    status: VerificationStatus.SOURCE_VERIFIED,
    transcribedFrom: 'NEC 2023, 240.4(D)(1) through (D)(8), printed page 70-124',
    sourceEdition: '2023',
    reviewDate: '2026-08-07',
    reviewer: "App owner, against the printed 2023 NEC in their possession. The edition is the owner's attestation rather than a photographed title page — recorded that way on purpose so a later auditor knows which part was read and which part was stated.",
    verifiedRows: Object.freeze([
      'Copper — 240.4(D)(4) 14 AWG 15 A, 240.4(D)(6) 12 AWG 20 A, 240.4(D)(8) 10 AWG 30 A. '
      + 'All three match the shipped values exactly.',
    ]),
    outstandingRows: Object.freeze([
      'Aluminium and copper-clad aluminium are printed alongside — 12 AWG 15 A, 10 AWG 25 A — '
      + 'and are NOT in the app. The calculator is copper-only and does not claim otherwise, '
      + 'but anyone extending it to aluminium must use these and not the copper column.',
      '18 and 16 AWG copper (7 A and 10 A) carry conditions about listed and marked devices '
      + 'and continuous load, so they are not a plain lookup and are deliberately absent.',
    ]),
    checkInstructions: 'Confirmed 2026-08-07. Re-check on the next code cycle.',
  }),
  'conductor-resistance': dataset({
    id: 'conductor-resistance',
    label: 'Conductor resistance, ohms per 1000 ft',
    where: 'App.js · VD_RES, src/core/ai/tools.js · VD_RESISTANCE',
    // STILL UNVERIFIED, and the reason is worth stating because the rows below
    // were all confirmed against print on 2026-08-07.
    //
    // The register refuses a verified status without a named source EDITION, and
    // the photograph of Table 8 does not show one — page 70-728 is a page
    // number, not a year. Table 8's resistances are stable across recent
    // editions, which is exactly the reasoning that makes assuming it tempting
    // and wrong: "probably unchanged" is how a table gets attributed to an
    // edition nobody checked. One photo of the title page closes this out.
    status: VerificationStatus.SOURCE_VERIFIED,
    transcribedFrom: 'NEC 2023, Chapter 9 Table 8 — Conductor Properties, printed page 70-728',
    sourceEdition: '2023',
    reviewDate: '2026-08-07',
    reviewer: "App owner, against the printed 2023 NEC in their possession. The edition is the owner's attestation rather than a photographed title page — recorded that way on purpose so a later auditor knows which part was read and which part was stated.",
    verifiedRows: Object.freeze([
      'Uncoated copper, STRANDED, ohm/kFT — 14 AWG 3.14, 12 AWG 1.98, 10 AWG 1.24, '
      + '8 AWG 0.778, 6 AWG 0.491, 4 AWG 0.308, 2 AWG 0.194, 1 AWG 0.154. '
      + 'All eight match the shipped values exactly (checked 2026-08-07 against a '
      + 'photograph of the printed page). Edition confirmed as 2023.',
    ]),
    note: 'Chapter 9 Table 8 values. Drives every voltage-drop answer in the app.\n'
      + 'STRANDED, NOT SOLID. Table 8 lists both for 14–8 AWG and they differ by about 2% '
      + '(14 AWG is 3.07 solid against 3.14 stranded). The app uses the stranded figure '
      + 'throughout, which reports the slightly LARGER drop — the safe direction to be wrong '
      + 'in, and the right default for conduit work. A solid #14 in NM cable will calculate '
      + 'marginally conservative, which is intended rather than an oversight.',
    outstandingRows: Object.freeze([
      '3 AWG (0.245) and every size 1/0 and larger are on the printed page but not in the app. '
      + 'Not wrong, just absent — the calculator stops at 1 AWG.',
      'Coated copper and aluminum columns are unused by the app and were not transcribed.',
    ]),
    checkInstructions: 'Confirmed. Re-check if the voltage-drop calculator is extended past 1 AWG.',
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

/**
 * RELEASE OVERRIDE.
 *
 * Ships features whose source tables have not been checked against print. A
 * deliberate, recorded decision by the app owner — not a bug, not a default,
 * and one line to reverse.
 *
 * What it DOES: unblocks feature rendering, so the calculators and the SparkAI
 * tools are usable.
 *
 * What it deliberately does NOT do:
 *   · mark anything verified. `isVerified` is untouched, the register still
 *     records exactly what has and has not been checked, and the evidence
 *     contract on every answer still reports UNVERIFIED.
 *   · remove the in-app notice. Shipping unverified numbers is a risk the owner
 *     can accept on their own behalf. Hiding that from an electrician standing
 *     at a panel is a different thing, and this does not do it.
 *
 * Set `active: false` to restore the gate.
 */
export const RELEASE_OVERRIDE = Object.freeze({
  active: true,
  authorizedBy: 'App owner',
  date: '2026-08-07',
  reason: 'TestFlight distribution. Source-table review is under way — the EMT '
    + 'rows of Chapter 9 Table 4 are confirmed against print; the remaining ten '
    + 'datasets are not.',
  scope: 'Unblocks feature rendering only. Verification status, the evidence '
    + 'contract and the in-app notice are unchanged.',
});

/**
 * Datasets holding a feature back. Empty means it is clear to ship.
 *
 * Under an active override this returns empty for a REGISTERED feature, while
 * `unverifiedDependencies` keeps reporting the truth. The two are separate on
 * purpose so nothing downstream loses sight of what is still unchecked.
 */
export const productionBlockers = (featureId) => {
  if (RELEASE_OVERRIDE.active && Object.prototype.hasOwnProperty.call(FEATURE_DEPENDENCIES, featureId)) {
    return [];
  }
  return (FEATURE_DEPENDENCIES[featureId] ?? []).filter((id) => !isVerified(id));
};

/** What a feature actually reads that is still unchecked — override or not. */
export const unverifiedDependencies = (featureId) =>
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
  // Keyed off what is actually unchecked, NOT off the blockers. Under a release
  // override the feature ships and this notice still appears — the whole reason
  // the two are separate functions.
  const blockers = unverifiedDependencies(featureId);
  if (blockers.length === 0) return null;
  const labels = blockers.map((id) => datasetById(id)?.label ?? id);
  return Object.freeze({
    featureId,
    status: VerificationStatus.UNVERIFIED,
    statusLabel: STATUS_LABEL.UNVERIFIED,
    headline: 'Technical review pending',
    body: 'The arithmetic here is tested, but the code table values it reads have not yet been checked against a printed source by a qualified reviewer. Verify any result against the NEC edition adopted by your AHJ before relying on it.',
    datasets: Object.freeze(labels),
    shippedUnderOverride: RELEASE_OVERRIDE.active,
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
  override: RELEASE_OVERRIDE.active ? RELEASE_OVERRIDE : null,
  features: Object.freeze(FEATURE_IDS.map((id) => Object.freeze({
    id,
    ready: isProductionReady(id),
    blockers: Object.freeze(productionBlockers(id)),
    // Always the truth, override or not.
    unverified: Object.freeze(unverifiedDependencies(id)),
  }))),
  unverifiedCount: unverifiedDatasets().length,
  blockedFeatures: FEATURE_IDS.filter((id) => !isProductionReady(id)).length,
});

/** Reject wording that implies an approval nobody gave. */
export const isPermittedStatusWording = (text) => {
  const s = String(text ?? '').toLowerCase();
  return !BANNED_STATUS_WORDING.some((banned) => s.includes(banned));
};
