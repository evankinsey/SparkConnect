// ─── COMMUNITY: Q&A AND JOBS ─────────────────────────────────────────────────
// Feature-flagged OFF. Models only — no networking, no submission path.
//
// Why moderation is in the model rather than added later: a forum where
// electricians give each other wiring advice is the one place in this app where
// a wrong upvoted answer can get somebody hurt. Voting, flagging, locking and a
// standing verify-with-your-AHJ banner cost nothing on day one and are very
// expensive to retrofit once there is content and habit.

// ─── Q&A ─────────────────────────────────────────────────────────────────────

export const ThreadCategory = {
  CODE: 'CODE',
  TROUBLESHOOTING: 'TROUBLESHOOTING',
  TOOLS: 'TOOLS',
  BUSINESS: 'BUSINESS',
  APPRENTICESHIP: 'APPRENTICESHIP',
  CONTROLS: 'CONTROLS',
  OFF_TOPIC: 'OFF_TOPIC',
};

export const ThreadStatus = {
  OPEN: 'OPEN',
  ANSWERED: 'ANSWERED',
  LOCKED: 'LOCKED',
  REMOVED: 'REMOVED',
};

// Shown on every thread, permanently, non-dismissible.
export const COMMUNITY_SAFETY_BANNER =
  'Community answers are opinions from other users, not verified guidance. Requirements vary ' +
  'by adopted code edition, local amendments, listing instructions and the authority having ' +
  'jurisdiction. Verify before you apply anything you read here, and de-energize before working.';

export const thread = ({
  id, authorId, title, body, category = ThreadCategory.CODE,
  createdAt, photoIds = [], region = null, codeEdition = null,
}) => ({
  id, authorId, title, body, category, createdAt, updatedAt: createdAt,
  photoIds,
  // Region and edition matter more here than anywhere else in the app: "is this
  // legal" has different answers in different places, and a thread without that
  // context invites confidently wrong replies.
  region, codeEdition,
  status: ThreadStatus.OPEN,
  answers: [],
  acceptedAnswerId: null,
  votes: 0,
  flagCount: 0,
  viewCount: 0,
  safetyBanner: COMMUNITY_SAFETY_BANNER,
});

export const answer = ({ id, authorId, body, createdAt, citations = [] }) => ({
  id, authorId, body, createdAt,
  // A citation is a claim. It is displayed as unverified unless it matches the
  // verified knowledge base — the same policy the lessons use (REV-13).
  citations: citations.map((c) => ({ ...c, verified: false })),
  votes: 0,
  flagCount: 0,
  accepted: false,
  removed: false,
});

export const addAnswer = (t, a) => ({
  ...t,
  answers: [...t.answers, a],
  updatedAt: a.createdAt,
  status: t.status === ThreadStatus.OPEN ? ThreadStatus.ANSWERED : t.status,
});

/** Only the thread author accepts an answer. */
export const acceptAnswer = (t, answerId, byUserId) => {
  if (byUserId !== t.authorId) return { ok: false, error: 'Only the person who asked can accept an answer' };
  if (!t.answers.some((a) => a.id === answerId)) return { ok: false, error: 'No such answer' };
  return {
    ok: true,
    thread: {
      ...t,
      acceptedAnswerId: answerId,
      status: ThreadStatus.ANSWERED,
      answers: t.answers.map((a) => ({ ...a, accepted: a.id === answerId })),
    },
  };
};

export const FLAG_THRESHOLD = 3;

/**
 * Flagging hides content at a threshold rather than waiting for a human.
 * On safety-critical content, hiding a good answer briefly is a far cheaper
 * mistake than leaving a dangerous one up overnight.
 */
export const flagAnswer = (t, answerId) => {
  const answers = t.answers.map((a) => {
    if (a.id !== answerId) return a;
    const flagCount = a.flagCount + 1;
    return { ...a, flagCount, removed: flagCount >= FLAG_THRESHOLD };
  });
  return { ...t, answers };
};

export const lockThread = (t, { reason, at }) => ({
  ...t,
  status: ThreadStatus.LOCKED,
  lockedReason: reason,
  lockedAt: at,
});

/**
 * Ranking. Accepted first, then score, then recency.
 * Vote score is damped by flags so a brigaded-but-wrong answer cannot ride to
 * the top on votes alone.
 */
export const rankedAnswers = (t) =>
  t.answers
    .filter((a) => !a.removed)
    .map((a) => ({ ...a, score: a.votes - a.flagCount * 2 }))
    .sort((a, b) => (b.accepted - a.accepted) || (b.score - a.score)
      || String(a.createdAt).localeCompare(String(b.createdAt)));

export const threadNeedsRegion = (t) =>
  t.category === ThreadCategory.CODE && !t.region;

// ─── Jobs board ──────────────────────────────────────────────────────────────

export const JobType = {
  FULL_TIME: 'FULL_TIME',
  CONTRACT: 'CONTRACT',
  DAY_LABOUR: 'DAY_LABOUR',
  APPRENTICESHIP: 'APPRENTICESHIP',
  SIDE_JOB: 'SIDE_JOB',
};

export const JobStatus = {
  DRAFT: 'DRAFT',
  OPEN: 'OPEN',
  FILLED: 'FILLED',
  EXPIRED: 'EXPIRED',
  REMOVED: 'REMOVED',
};

export const ExperienceLevel = {
  HELPER: 'HELPER',
  APPRENTICE: 'APPRENTICE',
  JOURNEYMAN: 'JOURNEYMAN',
  MASTER: 'MASTER',
  ANY: 'ANY',
};

export const jobPost = ({
  id, posterId, title, description, type = JobType.CONTRACT,
  city = null, state = null, startsAt = null, durationDays = null,
  experienceLevel = ExperienceLevel.ANY,
  payMinCents = null, payMaxCents = null, payUnit = 'HOUR',
  licenseRequired = false, createdAt, expiresAt = null,
}) => ({
  id, posterId, title, description, type,
  city, state, startsAt, durationDays, experienceLevel,
  payMinCents, payMaxCents, payUnit,
  licenseRequired,
  createdAt, updatedAt: createdAt, expiresAt,
  status: JobStatus.DRAFT,
  applicationCount: 0,
  // Only true when the poster's contractor profile carries a verified licence.
  // A jobs board with unverifiable employers is how people get scammed.
  posterVerified: false,
});

/**
 * Pay transparency is enforced, not optional. Posts without a range are the
 * ones that waste tradespeople's time, and allowing them degrades the board for
 * everyone.
 */
export const canPublish = (job) => {
  const problems = [];
  if (!job.title?.trim()) problems.push('A title is required');
  if (!job.description?.trim()) problems.push('A description is required');
  if (!job.state) problems.push('A state is required');
  if (job.payMinCents == null && job.payMaxCents == null) {
    problems.push('A pay rate or range is required');
  }
  if (job.payMinCents != null && job.payMaxCents != null && job.payMinCents > job.payMaxCents) {
    problems.push('The minimum pay cannot exceed the maximum');
  }
  return { ok: problems.length === 0, problems };
};

export const publishJob = (job, { at, expiresInDays = 30 }) => {
  const check = canPublish(job);
  if (!check.ok) return { ok: false, problems: check.problems };
  const expires = new Date(Date.parse(`${at}T00:00:00Z`) + expiresInDays * 86400000)
    .toISOString().slice(0, 10);
  return { ok: true, job: { ...job, status: JobStatus.OPEN, updatedAt: at, expiresAt: expires } };
};

export const jobIsExpired = (job, today) =>
  !!job.expiresAt && String(today) > String(job.expiresAt);

export const searchJobs = (jobs, { state = null, type = null, level = null, today, query = '' } = {}) => {
  const q = query.trim().toLowerCase();
  return jobs
    .filter((j) => j.status === JobStatus.OPEN)
    .filter((j) => !jobIsExpired(j, today))
    .filter((j) => (state ? j.state === state : true))
    .filter((j) => (type ? j.type === type : true))
    .filter((j) => (level && level !== ExperienceLevel.ANY
      ? j.experienceLevel === level || j.experienceLevel === ExperienceLevel.ANY
      : true))
    .filter((j) => (q ? `${j.title} ${j.description} ${j.city ?? ''}`.toLowerCase().includes(q) : true))
    .sort((a, b) => (b.posterVerified - a.posterVerified)
      || String(b.createdAt).localeCompare(String(a.createdAt)));
};

/**
 * Anonymous regional pay data. Aggregate only, and suppressed below a sample
 * size that could identify an individual employer.
 */
export const MIN_SAMPLE_FOR_PAY_STATS = 5;

export const payStats = (jobs, { state, level }) => {
  const relevant = jobs.filter((j) =>
    j.state === state &&
    (level ? j.experienceLevel === level : true) &&
    j.payMinCents != null);

  if (relevant.length < MIN_SAMPLE_FOR_PAY_STATS) {
    return { available: false, sampleSize: relevant.length, minSample: MIN_SAMPLE_FOR_PAY_STATS };
  }

  const mids = relevant
    .map((j) => (j.payMaxCents != null ? (j.payMinCents + j.payMaxCents) / 2 : j.payMinCents))
    .sort((a, b) => a - b);
  const at = (p) => mids[Math.min(mids.length - 1, Math.floor(mids.length * p))];

  return {
    available: true,
    sampleSize: mids.length,
    state,
    level: level ?? 'ALL',
    p25Cents: Math.round(at(0.25)),
    medianCents: Math.round(at(0.5)),
    p75Cents: Math.round(at(0.75)),
    note: 'Based on rates posted in SparkConnect. Not a survey and not advice.',
  };
};
