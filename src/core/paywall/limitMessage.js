// ─── WHAT TO SAY WHEN THE ANSWERS RUN OUT ────────────────────────────────────
// The app does not meter SparkAI. The SERVER does — there is no client gate,
// and the one that used to exist was inert. So the app finds out it has run out
// by receiving a 429, and everything it says at that moment is a claim about a
// number it did not count.
//
// THE BUG THIS EXISTS TO KILL. The old message was:
//
//     `You've used your ${FREE_ASK_LIMIT} free answers for today.`
//
// FREE_ASK_LIMIT is the app's constant. The cutoff is the server's. When those
// disagree — which they do right now, and did in the very first bug report of
// this project — the user is cut off after three answers and told they used
// five. They are not confused about the feature; they are being told a number
// that is false, by the app, at the exact moment they are annoyed.
//
// THE RULE: state a number only when the SERVER supplied it. Otherwise say the
// true thing without one. "You've used your free answers for today" is correct
// whatever the server is enforcing, and it stops being a lie the moment the
// two systems disagree.
//
// Pure module: no React, no network.

export const LimitKind = Object.freeze({
  DAILY: 'daily_limit_reached',
  MONTHLY: 'monthly_fair_use_reached',
  UNKNOWN: 'unknown',
});

export const kindFrom = (reason) => {
  const r = String(reason ?? '').toLowerCase();
  if (r === LimitKind.DAILY) return LimitKind.DAILY;
  if (r === LimitKind.MONTHLY) return LimitKind.MONTHLY;
  return LimitKind.UNKNOWN;
};

/**
 * A count is only usable if the server gave it to us.
 *
 * `serverLimit` is what the backend reported — from `remainingQuestions` on an
 * earlier successful answer, or from the 429 body. The app's own constant is
 * deliberately NOT accepted here: passing it would reintroduce the whole bug.
 */
const usableCount = (serverLimit) => {
  const n = Number(serverLimit);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
};

/**
 * What the user is told when a request comes back 429.
 *
 * @param reason       the `error` field from the 429 body, if any
 * @param serverLimit  a per-day figure the SERVER reported, or null
 * @param isPro        changes the offer, not the fact
 */
export const limitMessage = ({ reason = null, serverLimit = null, isPro = false } = {}) => {
  const kind = kindFrom(reason);
  const n = usableCount(serverLimit);

  if (kind === LimitKind.MONTHLY) {
    return {
      kind,
      title: 'That is this month’s included answers',
      body: 'The daily allowance resets tomorrow, and the monthly one at the start of next month. '
        + 'An answer pack works straight away if you need one now.',
      offer: 'packs',
    };
  }

  // Daily, or a 429 with nothing readable in it — same thing to the user.
  const used = n
    ? `You’ve used your ${n} answers for today.`
    : 'You’ve used your answers for today.';

  return {
    kind,
    title: 'Back tomorrow',
    body: isPro
      ? `${used} It resets overnight, and an answer pack works straight away.`
      : `${used} It resets overnight — Pro raises it, and an answer pack works straight away.`,
    offer: isPro ? 'packs' : 'pro',
  };
};

/** One line, for places that only have room for one. */
export const limitLine = (input) => {
  const m = limitMessage(input);
  return `${m.title}. ${m.body}`;
};
