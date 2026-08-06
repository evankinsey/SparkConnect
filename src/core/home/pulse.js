// ─── HOME PULSE ──────────────────────────────────────────────────────────────
// The thin line that makes Home feel alive. One sentence, rotating.
//
// Two constraints from the brief, both taken literally: "Not large. Very thin."
// and "Don't clutter the Home screen." So this is a single line of text and an
// icon, never a card, and there is only ever ONE on screen.
//
// The rule that shapes the content: every line is derived from something the
// app actually knows about THIS user — their streak, their own completions,
// today's question. Nothing here invents a community statistic. A made-up
// "electricians saved 4,000 hours this week" is the kind of thing that feels
// alive for a week and then makes the whole app feel fake, and it cannot be
// backed by anything without a server counting real events.
//
// Pure module: no React, no storage, no network.

export const PulseKind = {
  STREAK: 'STREAK',
  PROGRESS: 'PROGRESS',
  TIP: 'TIP',
  NUDGE: 'NUDGE',
};

/**
 * Field tips. Short, true, and about doing the work — not about the app.
 * Deliberately not code citations: a one-line NEC claim with no article and no
 * edition is exactly the kind of thing that gets repeated wrong on a job site.
 */
export const FIELD_TIPS = Object.freeze([
  'Test your tester on a known live circuit before you trust it on a dead one.',
  'Label the panel while you remember what you pulled. You will not tomorrow.',
  'Torque matters. A loose lug is a heater.',
  'Photograph the wall before the drywall goes on. You will thank yourself.',
  'The neutral is a current-carrying conductor. Treat it like one.',
  'If you did not lock it out, it is not off.',
  'Strip length is spec, not preference. Check the device.',
  'Wire nuts are not a splice on their own — the twist is the connection.',
  'Count your conductors before you pick the box, not after.',
  'A voltage tester tells you it is live. Only a lockout tells you it is safe.',
]);

/**
 * Build the pulse line.
 *
 * @param ctx.streak            consecutive days
 * @param ctx.jobsitePercent    0-100
 * @param ctx.answeredToday     has the daily question been answered
 * @param ctx.dayIndex          rotates the tip; caller passes day-of-year
 */
export const buildPulse = (ctx = {}) => {
  const streak = Number.isFinite(ctx.streak) && ctx.streak > 0 ? Math.floor(ctx.streak) : 0;
  const sitePct = Number.isFinite(ctx.jobsitePercent) ? Math.max(0, Math.min(100, Math.floor(ctx.jobsitePercent))) : 0;
  const dayIndex = Number.isFinite(ctx.dayIndex) ? Math.floor(Math.abs(ctx.dayIndex)) : 0;

  // Priority order: the thing most worth saying today.
  if (!ctx.answeredToday) {
    return { kind: PulseKind.NUDGE, icon: 'school', text: "Today's code question is up.", tab: 'home' };
  }
  if (streak >= 2) {
    return {
      kind: PulseKind.STREAK,
      icon: 'flame',
      text: `${streak} day streak. Keep it going.`,
      tab: null,
    };
  }
  if (sitePct > 0 && sitePct < 100) {
    return {
      kind: PulseKind.PROGRESS,
      icon: 'hammer',
      text: `Job site ${sitePct}% signed off. The crew is waiting.`,
      tab: 'jobsite',
    };
  }
  if (sitePct >= 100) {
    return { kind: PulseKind.PROGRESS, icon: 'trophy', text: 'Whole site signed off. Nice work.', tab: 'jobsite' };
  }
  return {
    kind: PulseKind.TIP,
    icon: 'bulb',
    text: FIELD_TIPS[dayIndex % FIELD_TIPS.length],
    tab: null,
  };
};

/** Day of year, so the tip changes daily without storing anything. */
export const dayIndexFor = (date = new Date()) => {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  return Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start) / 86400000);
};
