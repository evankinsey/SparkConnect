// ─── INTRODUCTIONS ───────────────────────────────────────────────────────────
// The MVP has no open messaging, deliberately. What it has is Request
// Introduction: applicant → mutual interest → platform introduction. That
// keeps spam out, and it keeps a person (Evan, at first) in the loop on every
// early match — which is both the moderation story and the ops story.
//
// Pure module: no React, no network, no storage.

export const IntroStatus = Object.freeze({
  REQUESTED: 'REQUESTED',
  ACCEPTED: 'ACCEPTED',
  DECLINED: 'DECLINED',
  INTRODUCED: 'INTRODUCED',   // the platform actually connected the two parties
  MATCHED: 'MATCHED',         // both sides confirmed they are proceeding together
  CLOSED: 'CLOSED',
});

/** Legal transitions. Anything not listed is refused. */
const TRANSITIONS = Object.freeze({
  REQUESTED: Object.freeze(['ACCEPTED', 'DECLINED', 'CLOSED']),
  ACCEPTED: Object.freeze(['INTRODUCED', 'CLOSED']),
  DECLINED: Object.freeze(['CLOSED']),
  INTRODUCED: Object.freeze(['MATCHED', 'CLOSED']),
  MATCHED: Object.freeze(['CLOSED']),
  CLOSED: Object.freeze([]),
});

const isNonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

let _n = 0;
const mintId = (now) => { _n = (_n + 1) % 10000; return `intro_${now.toString(36)}_${_n.toString(36)}`; };

/**
 * Create an introduction request.
 * `subject` names what the intro is about — an opportunity id or a profile id
 * — because an introduction about nothing is just unsolicited contact.
 */
export const createIntroRequest = ({
  senderId, recipientId, subjectKind, subjectId, message = '',
} = {}, { now = Date.now() } = {}) => {
  const problems = [];
  if (!isNonEmpty(senderId)) problems.push('senderId');
  if (!isNonEmpty(recipientId)) problems.push('recipientId');
  if (senderId === recipientId) problems.push('senderId === recipientId');
  if (!['OPPORTUNITY', 'BUSINESS_NEED', 'QUALIFIER_PROFILE', 'CONTRACTOR_PROFILE'].includes(subjectKind)) {
    problems.push('subjectKind');
  }
  if (!isNonEmpty(subjectId)) problems.push('subjectId');
  if (problems.length) return { ok: false, problems: Object.freeze(problems), intro: null };

  return {
    ok: true,
    problems: Object.freeze([]),
    intro: Object.freeze({
      id: mintId(now),
      senderId,
      recipientId,
      subjectKind,
      subjectId,
      message: isNonEmpty(message) ? message.replace(/\s+/g, ' ').trim().slice(0, 1000) : '',
      status: IntroStatus.REQUESTED,
      createdAt: new Date(now).toISOString(),
      adminReviewRequired: false,
      events: Object.freeze([
        Object.freeze({ at: new Date(now).toISOString(), to: IntroStatus.REQUESTED, by: senderId }),
      ]),
    }),
  };
};

/**
 * Advance an introduction. Refuses illegal jumps — REQUESTED cannot leap to
 * MATCHED, because the states in between are where the platform (and early on,
 * a human) actually does its job.
 */
export const advanceIntro = (intro, to, { by = null, at = null, note = null } = {}) => {
  if (!intro) return { ok: false, reason: 'No introduction.', intro: null };
  if (!Object.prototype.hasOwnProperty.call(IntroStatus, to)) {
    return { ok: false, reason: `Unknown status: ${to}`, intro };
  }
  const allowed = TRANSITIONS[intro.status] ?? [];
  if (!allowed.includes(to)) {
    return { ok: false, reason: `Cannot move ${intro.status} → ${to}.`, intro };
  }
  // INTRODUCED is the platform's move, not a participant's. Requiring an
  // actor id here is what makes "who introduced these two?" answerable later.
  if (to === IntroStatus.INTRODUCED && !isNonEmpty(by)) {
    return { ok: false, reason: 'An introduction is made by the platform — it needs an actor id.', intro };
  }
  return {
    ok: true,
    reason: null,
    intro: Object.freeze({
      ...intro,
      status: to,
      events: Object.freeze([
        ...intro.events,
        Object.freeze({ at: at ?? null, to, by, note }),
      ]),
    }),
  };
};

export const markForAdminReview = (intro, reason) => intro
  ? Object.freeze({ ...intro, adminReviewRequired: true, adminReviewReason: reason ?? null })
  : null;

/** Mutual interest = the recipient accepted. That is the gate to INTRODUCED. */
export const hasMutualInterest = (intro) =>
  intro?.status === IntroStatus.ACCEPTED
  || intro?.status === IntroStatus.INTRODUCED
  || intro?.status === IntroStatus.MATCHED;
