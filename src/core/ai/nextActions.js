// ─── WHAT TO DO INSTEAD ──────────────────────────────────────────────────────
// A refusal that offers nothing is a dead end. This turns it into a route.
//
// The observation this exists for: SparkAI refusing to state Tampa's adopted
// code edition is CORRECT — it does not know, and inventing it would be the
// exact failure the whole app is arranged against. But "I cannot verify that"
// and nothing else leaves the user exactly where they started, and it makes the
// right behaviour feel like a broken feature.
//
// The app can almost always do something adjacent. It has a Permit Assistant
// that records what an AHJ tells you, calculators that compute what the model
// would only have guessed at, and a simulator that demonstrates what a
// paragraph would have described badly. A refusal should hand the user one of
// those.
//
// THE RULE: an action must not smuggle the refused answer back in. Offering
// "open the Permit Assistant" is a route to the authority. Offering "here is
// what Tampa probably uses" is the hallucination wearing a button. Every action
// below routes to a TOOL or an AUTHORITY, never to a claim.
//
// Pure module: no React, no navigation. The screen maps `tab` onto its router.

import { Intent } from './risk.js';

export const ActionKind = Object.freeze({
  TOOL: 'TOOL',             // open a calculator that computes this properly
  AUTHORITY: 'AUTHORITY',   // go and ask whoever actually decides
  LEARN: 'LEARN',           // show it rather than describe it
  REFINE: 'REFINE',         // the question is answerable with more detail
});

const action = (kind, label, detail, tab, extra = {}) =>
  Object.freeze({ kind, label, detail, tab, ...extra });

/**
 * Topic → the tool that computes it.
 *
 * Keyed on words a person actually types. A question the app can compute should
 * never have been sent to a model in the first place, and when one gets here,
 * the calculator is a better answer than any paragraph.
 */
const TOOL_ROUTES = Object.freeze([
  { match: /voltage drop|vd\b|drop over|too far|long run/i,
    label: 'Open Voltage Drop', tab: 'volt',
    detail: 'Enter the load, the distance and the conductor and it works it out.' },
  { match: /conduit fill|how many.*(wires?|conductors?).*(fit|in)|emt fill/i,
    label: 'Open Conduit Fill', tab: 'conduitfill',
    detail: 'Counts against Chapter 9, and shows the fill percentage.' },
  { match: /box fill|cubic inch|box size|too many wires in/i,
    label: 'Open Box Fill', tab: 'boxfill',
    detail: 'Volume allowances per conductor, device and clamp.' },
  { match: /ampacity|derate|derating|current.carrying|temperature correction/i,
    label: 'Open Ampacity', tab: 'ampacity',
    detail: 'Applies the adjustment and correction factors in order.' },
  { match: /bend|offset|saddle|stub|shrink/i,
    label: 'Open Pipe Bending', tab: 'bend',
    detail: 'Marks, multipliers, shrink and the roll angle.' },
  { match: /panel schedule|breaker.*(space|position)|phase balance|multiwire|shared neutral/i,
    label: 'Open Panel Schedule', tab: 'panelschedule',
    detail: 'Checks phase balance and shared neutrals as you build it.' },
]);

const LEARN_ROUTES = Object.freeze([
  { match: /three.way|3.way|four.way|4.way|switch leg|traveler/i,
    label: 'Wire it in the Simulator', tab: 'wiringlab',
    detail: 'Build it and the solver tells you what a meter would read.' },
  { match: /troubleshoot|not working|dead|won.t turn on|flicker|only works when/i,
    label: 'Try a Troubleshooting scenario', tab: 'troubleshoot',
    detail: 'Same fault, with the symptoms and the meter readings.' },
]);

/** Anything about a jurisdiction goes to the jurisdiction. */
const isJurisdictional = (text) =>
  /adopted|edition|amendment|permit|inspector|inspection|ahj|jurisdiction|county|city of|local code|requires? a permit/i
    .test(String(text ?? ''));

/**
 * Actions to offer alongside a refusal.
 *
 * Ordered by how likely each is to actually resolve what the person wanted.
 * Capped at three — a refusal followed by six buttons is a menu, and a menu is
 * what somebody scrolls past.
 */
export const nextActions = (question, { intent = null, refusalReason = null } = {}) => {
  const q = String(question ?? '');
  const out = [];

  // 1. Anything jurisdictional. This is the Tampa case, and it is the one that
  //    most needs a route rather than a shrug.
  if (isJurisdictional(q) || intent === Intent.CODE) {
    out.push(action(ActionKind.AUTHORITY, 'Open Permit Assistant',
      'Look up the authority for this job and record what they tell you, so the app '
      + 'knows it next time.', 'permit'));
  }

  // 2. A tool that computes what was asked.
  for (const r of TOOL_ROUTES) {
    if (r.match.test(q)) { out.push(action(ActionKind.TOOL, r.label, r.detail, r.tab)); break; }
  }

  // 3. Show it rather than describe it.
  for (const r of LEARN_ROUTES) {
    if (r.match.test(q)) { out.push(action(ActionKind.LEARN, r.label, r.detail, r.tab)); break; }
  }

  // 4. Nothing matched. Say what would make the question answerable, rather
  //    than offering a tour of the app.
  if (out.length === 0 && refusalReason) {
    out.push(action(ActionKind.REFINE, 'Add the numbers',
      'Give the conductor size, the load and the distance and this becomes a calculation '
      + 'rather than an opinion.', null, { refine: true }));
  }

  return Object.freeze(out.slice(0, 3));
};

/**
 * The full shape a refusal should render as.
 *
 * `headline` never claims knowledge. It says what the app could not verify, in
 * the words a person would use, and then hands them somewhere to go.
 */
export const refusalWithActions = (refusal, question, options = {}) => {
  if (!refusal) return null;
  const actions = nextActions(question, { ...options, refusalReason: refusal.reason });

  return Object.freeze({
    ...refusal,
    headline: isJurisdictional(question)
      ? 'That depends on the jurisdiction, and I cannot verify it from here'
      : 'I cannot verify that well enough to answer',
    // The reason, kept, because "why" is what makes a refusal trustworthy
    // rather than evasive.
    reason: refusal.reason,
    actions,
    // A refusal with nowhere to go is the thing worth avoiding, so the caller
    // can assert on this rather than hoping.
    hasRoute: actions.length > 0,
  });
};

export { Intent };
