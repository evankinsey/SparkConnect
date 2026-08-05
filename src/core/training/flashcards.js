// ─── FLASHCARDS WITH SPACED REPETITION ───────────────────────────────────────
// Requirements: TOOL-06 (spaced repetition, weakest topics, missed-question review)
//
// SM-2, simplified. The full algorithm's precision is wasted here — an
// electrician studying for a licence exam needs "show me the ones I keep getting
// wrong, more often" and not a research-grade memory model.
//
// The important property: intervals grow multiplicatively for cards you know and
// collapse to same-day for cards you don't. That is what makes 15 minutes of
// study beat an hour of re-reading everything.

export const Grade = {
  AGAIN: 0,   // did not know it
  HARD: 1,    // knew it, slowly, unsure
  GOOD: 2,    // knew it
  EASY: 3,    // instant
};

export const MIN_EASE = 1.3;
export const START_EASE = 2.5;

export const card = ({ id, front, back, category = 'General', ref = null, editions = null }) => ({
  id, front, back, category, ref,
  editions,              // null = applies to every code edition
  repetitions: 0,
  ease: START_EASE,
  intervalDays: 0,
  dueOn: null,           // null = never studied, so it is due immediately
  lapses: 0,
  lastGrade: null,
  lastStudiedAt: null,
});

const addDays = (iso, days) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

/**
 * Grade a card and schedule the next review.
 *
 * AGAIN resets the card to same-day and drops its ease — a card you just missed
 * should come back in this session, not next week.
 */
export const review = (c, grade, today) => {
  if (grade === Grade.AGAIN) {
    return {
      ...c,
      repetitions: 0,
      lapses: c.lapses + 1,
      ease: Math.max(MIN_EASE, c.ease - 0.2),
      intervalDays: 0,
      dueOn: today,          // again, today
      lastGrade: grade,
      lastStudiedAt: today,
    };
  }

  const repetitions = c.repetitions + 1;

  // Ease drifts with performance: consistently easy cards stretch out fast,
  // consistently hard ones stay close even when answered correctly.
  const easeDelta = grade === Grade.HARD ? -0.15 : grade === Grade.EASY ? 0.15 : 0;
  const ease = Math.max(MIN_EASE, c.ease + easeDelta);

  let intervalDays;
  if (repetitions === 1) intervalDays = 1;
  else if (repetitions === 2) intervalDays = 6;
  else intervalDays = Math.round(c.intervalDays * ease);

  if (grade === Grade.HARD) intervalDays = Math.max(1, Math.round(intervalDays * 0.6));

  return {
    ...c,
    repetitions,
    ease,
    intervalDays,
    dueOn: addDays(today, intervalDays),
    lastGrade: grade,
    lastStudiedAt: today,
  };
};

export const isDue = (c, today) => c.dueOn === null || String(c.dueOn) <= String(today);

/**
 * Build a study session.
 *
 * New cards are capped so a first session is finishable. A deck that opens with
 * 400 unseen cards gets abandoned; twenty gets finished, and finishing is what
 * builds the habit.
 */
export const buildSession = (cards, { today, limit = 20, newCardLimit = 5, category = null, edition = null } = {}) => {
  const eligible = cards
    .filter((c) => (category ? c.category === category : true))
    .filter((c) => (edition && c.editions ? c.editions.includes(edition) : true));

  const due = eligible.filter((c) => c.dueOn !== null && isDue(c, today));
  const fresh = eligible.filter((c) => c.dueOn === null);

  // Lapsed cards first — the ones you keep missing are the ones worth the time.
  due.sort((a, b) => (b.lapses - a.lapses) || String(a.dueOn).localeCompare(String(b.dueOn)));

  const session = [...due.slice(0, Math.max(0, limit - Math.min(newCardLimit, fresh.length)))];
  session.push(...fresh.slice(0, Math.min(newCardLimit, Math.max(0, limit - session.length))));

  return {
    cards: session.slice(0, limit),
    dueCount: due.length,
    newCount: fresh.length,
    totalEligible: eligible.length,
  };
};

// ─── Weak-area analysis (TOOL-06) ────────────────────────────────────────────

/**
 * Accuracy by category, worst first.
 * Cards never studied are excluded — "0% on a category you have not opened" is
 * noise, not a weakness.
 */
export const accuracyByCategory = (cards) => {
  const byCategory = new Map();

  for (const c of cards) {
    if (c.lastGrade === null) continue;
    if (!byCategory.has(c.category)) byCategory.set(c.category, { studied: 0, lapses: 0, mature: 0 });
    const entry = byCategory.get(c.category);
    entry.studied++;
    entry.lapses += c.lapses;
    if (c.intervalDays >= 21) entry.mature++;
  }

  return [...byCategory.entries()]
    .map(([category, e]) => ({
      category,
      studied: e.studied,
      lapses: e.lapses,
      mature: e.mature,
      // Lapses per studied card. Lower is better.
      lapseRate: e.studied ? e.lapses / e.studied : 0,
      retention: e.studied ? Math.round((e.mature / e.studied) * 100) : 0,
    }))
    .sort((a, b) => b.lapseRate - a.lapseRate);
};

export const weakestTopics = (cards, count = 3) =>
  accuracyByCategory(cards).filter((c) => c.lapses > 0).slice(0, count);

/** Cards missed at least once and not yet mature — the review queue. */
export const missedQueue = (cards) =>
  cards
    .filter((c) => c.lapses > 0 && c.intervalDays < 21)
    .sort((a, b) => b.lapses - a.lapses);

export const deckStats = (cards, today) => {
  const studied = cards.filter((c) => c.lastGrade !== null);
  return {
    total: cards.length,
    new: cards.filter((c) => c.dueOn === null).length,
    due: cards.filter((c) => c.dueOn !== null && isDue(c, today)).length,
    learning: studied.filter((c) => c.intervalDays > 0 && c.intervalDays < 21).length,
    mature: studied.filter((c) => c.intervalDays >= 21).length,
    lapsed: cards.filter((c) => c.lapses > 0).length,
  };
};

/**
 * TOOL-06 — a 10-minute daily plan.
 * Sized by cards rather than by minutes, using a rough 15 seconds per card, and
 * honest that it is an estimate.
 */
export const dailyStudyPlan = (cards, { today, minutes = 10 }) => {
  const perCard = 15;
  const limit = Math.max(5, Math.round((minutes * 60) / perCard));
  const session = buildSession(cards, { today, limit });
  const weak = weakestTopics(cards);
  return {
    minutes,
    cards: session.cards,
    estimatedSeconds: session.cards.length * perCard,
    dueCount: session.dueCount,
    focusSuggestion: weak.length
      ? `Your weakest area right now is ${weak[0].category}.`
      : null,
  };
};
