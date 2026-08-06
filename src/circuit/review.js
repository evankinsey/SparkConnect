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
  // Reviewed in-house by the SparkConnect team against the checklist. Ships,
  // and says exactly that to the user. Does NOT claim a licensed individual
  // signed it off.
  APPROVED_INTERNAL: 'APPROVED_INTERNAL',
  // Reviewed by a named qualified electrician or instructor who accepted
  // attribution. Stronger claim, so it needs a name and a date.
  APPROVED: 'APPROVED',
  RETIRED: 'RETIRED',
};

export const ALL_REVIEW_STATUSES = Object.values(ReviewStatus);

/**
 * Who stands behind a lesson. This is the honest core of the whole gate:
 * the app may ship team-reviewed content, but it must never imply that a
 * licensed professional vetted it when none did.
 */
export const ReviewAttribution = {
  INTERNAL_TEAM: 'INTERNAL_TEAM',
  LICENSED_REVIEWER: 'LICENSED_REVIEWER',
};

/** Shown in-app on every lesson carrying only an internal review. */
export const INTERNAL_REVIEW_NOTICE =
  'Reviewed by the SparkConnect team. This lesson has not been independently ' +
  'verified by a licensed electrician. Verify against the code edition adopted ' +
  'in your jurisdiction and your employer\'s procedures before applying it in the field.';

/** Shown when a named qualified reviewer has signed off. */
export const LICENSED_REVIEW_NOTICE = (reviewer, date) =>
  `Technically reviewed by ${reviewer} on ${date}. Local amendments and adopted ` +
  'code editions still vary — always verify with your AHJ.';

/** The attribution line the UI renders for a lesson, whatever its state. */
export const attributionFor = (lesson) => {
  if (lesson?.technicalReviewStatus === ReviewStatus.APPROVED && lesson.technicalReviewer) {
    return {
      label: `Reviewed by ${lesson.technicalReviewer}`,
      notice: LICENSED_REVIEW_NOTICE(lesson.technicalReviewer, lesson.reviewDate),
      attribution: ReviewAttribution.LICENSED_REVIEWER,
      prominent: false,
    };
  }
  if (lesson?.technicalReviewStatus === ReviewStatus.APPROVED_INTERNAL) {
    return {
      label: 'Reviewed by the SparkConnect team',
      notice: INTERNAL_REVIEW_NOTICE,
      attribution: ReviewAttribution.INTERNAL_TEAM,
      // Rendered as a visible banner, not buried in a footer — the whole point
      // is that the user knows what kind of review this had.
      prominent: true,
    };
  }
  return { label: 'Not yet reviewed', notice: INTERNAL_REVIEW_NOTICE, attribution: null, prominent: true };
};

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

// ─── CONTENT FINGERPRINT ─────────────────────────────────────────────────────
//
// An approval is a statement about a specific lesson as it was on the day
// someone read it. `lessonVersion` was supposed to enforce that, but it was
// bumped by hand — so editing a hint, a learning objective or a terminal label
// left the recorded sign-off in place, still claiming to cover text nobody had
// looked at. Every safety control in this file depends on that not happening.
//
// The fingerprint removes the human step. It covers everything an approval is a
// statement ABOUT: the topology, the reference solution, the expectations, the
// hints, the objectives and the citations. Change any of them and the approval
// stops matching, and the lesson goes back to the review queue on its own.
//
// FNV-1a, not a crypto hash: this detects honest edits, and node:crypto is not
// in the React Native bundle. Nothing here is defending against an attacker
// forging a fingerprint — they would just edit the approval record instead.

const fnv1a = (str) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
};

/** Stable stringify — key order must not change the fingerprint. */
const stable = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
};

/**
 * What an approval actually covers. If it is on this list, editing it sends the
 * lesson back for review — which is the point.
 */
export const lessonFingerprint = (lesson) => {
  if (!lesson) return null;
  const components = typeof lesson.components === 'function' ? lesson.components() : [];
  const solution = typeof lesson.solution === 'function' ? lesson.solution() : [];
  return fnv1a(stable({
    id: lesson.id,
    title: lesson.title,
    // Topology and the wiring being taught.
    components: components.map((c) => ({
      id: c.id, type: c.type, label: c.label,
      terminals: (c.terminals ?? []).map((t) => ({ id: t.id, label: t.label, role: t.semanticRole })),
    })),
    solution: solution.map((w) => [w.fromTerminal, w.toTerminal, w.role].sort()),
    expectations: lesson.expectations ?? {},
    // The words a learner reads and acts on.
    learningObjectives: lesson.learningObjectives ?? [],
    hintSteps: (lesson.hintSteps ?? []).map((h) => [h.level, h.text]),
    safetyNotes: lesson.safetyNotes ?? [],
    referenceNotes: (lesson.referenceNotes ?? []).map((n) => [n.label, n.ref, n.verified]),
  }));
};

/**
 * Does the recorded approval still describe this lesson?
 *
 * A record with no fingerprint fails. That is not a migration oversight — an
 * approval written before fingerprints existed cannot prove what it covered,
 * and "we cannot tell" has to resolve to "not approved" in this file.
 */
export const approvalMatchesContent = (lesson, record) =>
  !!record && typeof record.contentFingerprint === 'string' &&
  record.contentFingerprint === lessonFingerprint(lesson);

/**
 * REV-08 — the gate. A lesson ships only when it has been reviewed AND
 * explicitly marked for production. Two independent flags, so neither a stray
 * status edit nor a stray boolean can publish content on its own.
 *
 * Either review level may ship. What differs is what the user is told:
 * `attributionFor()` returns a prominent notice for internally-reviewed
 * lessons, so the claim always matches the reality.
 */
export const isProductionVisible = (lesson) =>
  lesson?.productionApproved === true &&
  (lesson?.technicalReviewStatus === ReviewStatus.APPROVED ||
   lesson?.technicalReviewStatus === ReviewStatus.APPROVED_INTERNAL);

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
 * Sign-off by a named qualified reviewer who accepted attribution.
 * Requires a real name and date, because this is the stronger public claim.
 */
export const applyHumanApproval = (lesson, { reviewer, reviewDate, notes = '' }) => {
  if (!reviewer || typeof reviewer !== 'string' || !reviewer.trim()) {
    throw new Error('applyHumanApproval: a named qualified reviewer is required (REV-10).');
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

/**
 * In-house sign-off. The lesson ships, attributed to the SparkConnect team and
 * carrying a prominent notice that no licensed electrician independently
 * verified it.
 *
 * Requires the checklist to have actually been worked through — `checklistRun`
 * must cover every item in REVIEW_CHECKLIST. That is the substance of the
 * review; the attribution is just how it is described.
 */
export const applyInternalReview = (lesson, { reviewDate, checklistRun = [], notes = '' }) => {
  if (!reviewDate) {
    throw new Error('applyInternalReview: reviewDate is required.');
  }
  const missing = REVIEW_CHECKLIST.filter((q) => !checklistRun.includes(q));
  if (missing.length) {
    throw new Error(
      `applyInternalReview: the checklist is incomplete — ${missing.length} item(s) unanswered. ` +
      'A review that skipped the checklist is not a review.',
    );
  }
  return {
    ...lesson,
    technicalReviewStatus: ReviewStatus.APPROVED_INTERNAL,
    technicalReviewer: 'SparkConnect team',
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
