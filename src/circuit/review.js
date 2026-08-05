// ─── TECHNICAL REVIEW GATE ───────────────────────────────────────────────────
// Requirements: REV-06, REV-07, REV-08, REV-10, REV-14, DOD-13, DOD-16, NNR-08
//
// The single most important safety control in this codebase.
//
// A lesson is reachable in production only when a QUALIFIED HUMAN has reviewed
// it. Passing truth-table tests proves the engine agrees with the lesson author;
// it does not prove the lesson teaches correct wiring. REV-14 is explicit:
// "No electrical simulation may be production-enabled merely because tests pass."

export const ReviewStatus = {
  DRAFT: 'DRAFT',
  ENGINEERING_TESTED: 'ENGINEERING_TESTED',
  NEEDS_ELECTRICAL_REVIEW: 'NEEDS_ELECTRICAL_REVIEW',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  APPROVED: 'APPROVED',
  RETIRED: 'RETIRED',
};

export const ALL_REVIEW_STATUSES = Object.values(ReviewStatus);

// REV-12 — ships verbatim with every lesson. Do not reword.
export const TRAINING_DISCLAIMER =
  'For training and conceptual reference only. Circuit configurations, conductor ' +
  'identification, box requirements, grounding, device listings, local amendments, ' +
  'and permitted methods may vary. Always verify with the currently adopted NEC, ' +
  'local AHJ, plans/specifications, manufacturer instructions, and qualified ' +
  'supervision. De-energize and verify absence of voltage before work when required.';

// SCR-07 — shown anywhere a rank appears.
export const RANK_DISCLAIMER = 'Training rank only — not a license or certification.';

/**
 * REV-06 — review metadata every lesson must carry.
 * Seeded so that a lesson is INVISIBLE until a human changes it (REV-10).
 * Never populate `technicalReviewer` or `reviewDate` programmatically (DOD-16).
 */
export const seedReview = (overrides = {}) => ({
  technicalReviewStatus: ReviewStatus.NEEDS_ELECTRICAL_REVIEW,
  technicalReviewer: null,
  reviewDate: null,
  reviewerNotes: '',
  lessonVersion: 1,
  referenceNotes: [],
  productionApproved: false,
  ...overrides,
});

/** REV-08 — the gate. Both conditions, no exceptions, no override parameter. */
export const isProductionVisible = (lesson) =>
  lesson?.productionApproved === true &&
  lesson?.technicalReviewStatus === ReviewStatus.APPROVED;

/**
 * Lessons the production UI may show.
 * `includeUnreviewed` exists ONLY for the internal review screen (REV-09) and
 * for tests. It must never be true in a production render path.
 */
export const visibleLessons = (lessons, { includeUnreviewed = false } = {}) =>
  includeUnreviewed ? lessons.slice() : lessons.filter(isProductionVisible);

/** Everything blocking release, for the internal review screen (REV-09). */
export const pendingReview = (lessons) =>
  lessons
    .filter((l) => !isProductionVisible(l))
    .map((l) => ({
      id: l.id,
      title: l.title,
      status: l.technicalReviewStatus,
      lessonVersion: l.lessonVersion,
      productionApproved: l.productionApproved,
      blockers: [
        l.technicalReviewStatus !== ReviewStatus.APPROVED
          ? `technicalReviewStatus is ${l.technicalReviewStatus}, needs APPROVED`
          : null,
        l.productionApproved !== true ? 'productionApproved is not true' : null,
      ].filter(Boolean),
    }));

/**
 * Guard for anything that would mark a lesson approved.
 * Refuses machine approval — approval requires a named human reviewer and a date
 * (REV-10, DOD-16).
 */
export const applyHumanApproval = (lesson, { reviewer, reviewDate, notes = '' }) => {
  if (!reviewer || typeof reviewer !== 'string' || !reviewer.trim()) {
    throw new Error('applyHumanApproval: a named qualified reviewer is required (REV-10 / DOD-16).');
  }
  if (!reviewDate) {
    throw new Error('applyHumanApproval: reviewDate is required (REV-10).');
  }
  return {
    ...lesson,
    technicalReviewStatus: ReviewStatus.APPROVED,
    technicalReviewer: reviewer.trim(),
    reviewDate,
    reviewerNotes: notes,
    productionApproved: true,
  };
};

// REV-11 — the checklist a reviewer works through per lesson.
export const REVIEW_CHECKLIST = [
  'Source path correct?',
  'Load path correct?',
  'Neutral path correct?',
  'Equipment grounding represented?',
  'All switch states tested?',
  'Multiple valid topologies considered?',
  'Conductor re-identification caveats considered?',
  'Manufacturer-specific differences avoided?',
  'NEC references stated carefully?',
  'Local code/AHJ disclaimer included?',
  'Safety language included?',
  'No energized-work encouragement?',
  'Reviewed by qualified electrician/instructor?',
];
