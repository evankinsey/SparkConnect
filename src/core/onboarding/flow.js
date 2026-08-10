// ─── ONBOARDING ──────────────────────────────────────────────────────────────
// The first ninety seconds, arranged for conversion without lying to anybody.
//
// WHAT WAS ACTUALLY WRONG. `src/OnboardingFlow.js` collected a role and a list
// of favourite tools across four screens — and it was imported at App.js:8 and
// NEVER RENDERED. The app shows a disclaimer screen instead. So:
//
//   · `@sc_role` has never been written, which means `layoutForRole()` has
//     fallen through to the default layout for every user since launch
//   · the tool picker's answers went nowhere even in the dead flow
//   · two of its six roles (`master`, `diy`) are not keys in ROLE_LAYOUTS, so
//     even if it had rendered, those users got the default anyway
//
// THE RULE THIS MODULE IS BUILT ON: every question must change something, and
// the change must be nameable. A question whose answer the app ignores is a tax
// charged in the one place a person is most likely to quit, and it is worse
// than no question — it teaches them their input does not matter here.
//
// Each step declares an `effect`, and `EFFECTS` maps each one to the thing it
// actually moves. A test fails if a step declares an effect nothing consumes.
//
// THE ORDERING RULE THAT OUTRANKS CONVERSION: the disclaimer is first, and
// nothing that puts electrical content on screen may come before it. An earlier
// draft had it at step four, behind a demo showing a real code question with a
// real NEC citation — which is electrical guidance handed to somebody who had
// not yet agreed the app does not replace licensed supervision. `orderingFault()`
// checks this and a test fails on it, because "remember to keep it first" is not
// a mechanism.
//
// THE REST OF THE SHAPE, and none of it requires a dark pattern:
//
//   1. Say what the app will not do, and get that on the record.
//   2. Ask the one question that changes the app, and show it changing.
//   3. Give something real before asking for anything — a working answer, not
//      a promise of one.
//   4. Ask for the trial once, after value, with the free path in plain sight.
//
// WHAT IS DELIBERATELY ABSENT: no fake "building your personalised plan"
// progress bar, no countdown, no pre-ticked trial, no fake install counts, no
// "97% of electricians" statistic. Every one of those converts, and every one
// of them is a promise the rest of this app spends its life not making.
//
// Pure module: no React, no storage, no navigation.

import { ROLE_LAYOUTS, layoutForRole } from '../home/layout.js';
import { FREE_LIMITS, PRO_LIMITS, Feature, proAskAllowanceLabel } from '../paywall/entitlements.js';

export const StepId = Object.freeze({
  ROLE: 'ROLE',
  FOCUS: 'FOCUS',
  PROOF: 'PROOF',
  LEGAL: 'LEGAL',
  NOTIFY: 'NOTIFY',
  TRIAL: 'TRIAL',
});

/**
 * What an answer is allowed to change.
 *
 * `consumedBy` names the thing that reads it. This is the honesty mechanism:
 * an effect nobody consumes is a question nobody should be asked.
 */
export const EFFECTS = Object.freeze({
  HOME_LAYOUT: {
    id: 'HOME_LAYOUT',
    consumedBy: 'src/core/home/layout.js — layoutForRole()',
    describe: 'which tools sit at the top of Home',
  },
  FIRST_SCREEN: {
    id: 'FIRST_SCREEN',
    consumedBy: 'App.js — the tab opened after onboarding',
    describe: 'where the app opens the first time',
  },
  DAILY_NOTIFICATION: {
    id: 'DAILY_NOTIFICATION',
    consumedBy: 'App.js — enableDailyQuestionNotifications()',
    describe: 'whether the daily code question notifies you',
  },
  ENTITLEMENT: {
    id: 'ENTITLEMENT',
    consumedBy: 'src/purchases.js — purchaseProduct()',
    describe: 'your plan',
  },
  LEGAL_ACCEPTANCE: {
    id: 'LEGAL_ACCEPTANCE',
    consumedBy: 'App.js — @sc_onboarding_done',
    describe: 'recorded acceptance of the terms',
  },
});

/**
 * Roles.
 *
 * EVERY ID HERE IS A KEY IN ROLE_LAYOUTS. That is not a coincidence to be
 * maintained by hand — a test asserts it, because the previous list drifted and
 * two roles silently stopped personalising anything.
 *
 * No emoji. A trade app that opens with a row of emoji reads as a toy, and the
 * people most likely to bounce at this screen are the ones who have already
 * decided electrical apps are toys.
 */
export const ROLES = Object.freeze([
  {
    id: 'apprentice',
    label: 'Apprentice',
    sub: 'Learning, and getting asked questions on site',
    // What they see first, in their words rather than in feature names.
    promise: 'Study tools and the simulator go to the top.',
    firstScreen: 'learn',
  },
  {
    id: 'journeyman',
    label: 'Journeyman',
    sub: 'Licensed and working',
    promise: 'Calculators and the bender go to the top.',
    firstScreen: 'calculators',
  },
  {
    id: 'foreman',
    label: 'Foreman',
    sub: 'Running a crew',
    promise: 'Job Cam, projects and estimating go to the top.',
    firstScreen: 'projects',
  },
  {
    id: 'contractor',
    label: 'Contractor',
    sub: 'Running the business',
    promise: 'Estimating, projects and documentation go to the top.',
    firstScreen: 'projects',
  },
  {
    id: 'instructor',
    label: 'Instructor',
    sub: 'Teaching the trade',
    promise: 'Exam prep and the question bank go to the top.',
    firstScreen: 'examprep',
  },
  {
    id: 'student',
    label: 'Student',
    sub: 'Pre-apprenticeship or trade school',
    promise: 'Flashcards and exam prep go to the top.',
    firstScreen: 'learn',
  },
]);

export const roleById = (id) => ROLES.find((r) => r.id === id) ?? null;

/**
 * The second question, and the last one.
 *
 * Two questions is the budget. Every additional screen between download and
 * first value costs more than the personalisation it buys, and the honest
 * version of a long quiz is a short one.
 */
/**
 * `suggest` is what Home offers them, in their words rather than the tab's.
 *
 * The tab is NOT where the app opens — see outcome(). It is what gets pointed
 * at once they are somewhere they can orient themselves.
 */
export const FOCUS = Object.freeze([
  { id: 'code', label: 'Getting code answers fast', tab: 'necai',
    suggest: 'Ask SparkAI your first code question' },
  { id: 'calc', label: 'Running the numbers on site', tab: 'calculators',
    suggest: 'Run your first calculation' },
  { id: 'learn', label: 'Getting better at the trade', tab: 'wiringlab',
    suggest: 'Wire your first circuit in the simulator' },
  { id: 'jobs', label: 'Keeping my jobs documented', tab: 'projects',
    suggest: 'Start your first job and take a photo' },
]);

export const focusById = (id) => FOCUS.find((f) => f.id === id) ?? null;

/**
 * The steps, in order.
 *
 * `skippable` matters: a step a person cannot get past is a step they close the
 * app on. Only the legal acceptance is mandatory, and it is mandatory because
 * it is a record rather than a conversion device.
 */
export const STEPS = Object.freeze([
  {
    id: StepId.LEGAL,
    kind: 'CONSENT',
    // FIRST, AND IT HAS TO BE FIRST. This sat at position four for one draft,
    // behind the value demo — which shows a real code question with a real NEC
    // citation. That is electrical guidance handed to somebody who has not yet
    // agreed the app does not replace licensed supervision, which puts a legal
    // gate behind the exact thing it exists to gate.
    //
    // It also belongs here on the merits. The product's whole thesis is that it
    // tells you its limits before you find them, and an app that opens by
    // saying what it will not do is making its argument, not apologising. What
    // made the old version a bounce was that it read as a wall of legal text —
    // that is a copy problem, and the copy is fixed rather than the position.
    title: 'What this app will not do',
    sub: 'SparkConnect shows its working and tells you when it cannot. Here is where it stops.',
    effect: EFFECTS.LEGAL_ACCEPTANCE.id,
    skippable: false,
    required: true,
    // Anything that puts electrical content on screen must come after this.
    showsElectricalContent: false,
  },
  {
    id: StepId.ROLE,
    kind: 'CHOICE',
    title: 'What do you do?',
    sub: 'This changes what the app puts in front of you. You can change it later in Settings.',
    effect: EFFECTS.HOME_LAYOUT.id,
    skippable: true,
    required: false,
  },
  {
    id: StepId.FOCUS,
    kind: 'CHOICE',
    title: 'What brought you here?',
    sub: 'Whatever you pick is where the app opens the first time.',
    effect: EFFECTS.FIRST_SCREEN.id,
    skippable: true,
    required: false,
  },
  {
    id: StepId.PROOF,
    kind: 'DEMO',
    // The value moment, and it is a REAL answer computed by the shipped engine
    // rather than a picture of one. Nothing is asked for on this screen.
    title: 'Here is what an answer looks like.',
    sub: 'Every number shows what went into it, how it was worked out, and where it came from.',
    effect: null,
    skippable: true,
    required: false,
    // A real code question with a real NEC citation. Flagged so the ordering
    // rule is enforced by a test rather than by whoever edits this next.
    showsElectricalContent: true,
  },
  {
    id: StepId.NOTIFY,
    kind: 'PERMISSION',
    // Asked AFTER they have seen the daily question is a real thing, and with
    // the reason attached. A permission prompt on launch, before any context,
    // is the one people deny permanently.
    title: 'One code question a day?',
    sub: 'A single question each morning, with the reasoning. No other notifications, ever.',
    effect: EFFECTS.DAILY_NOTIFICATION.id,
    skippable: true,
    required: false,
  },
  {
    id: StepId.TRIAL,
    kind: 'OFFER',
    title: 'Try Pro free for 3 days',
    sub: 'Everything unlocked. Cancel any time in the App Store.',
    effect: EFFECTS.ENTITLEMENT.id,
    skippable: true,
    required: false,
  },
]);

/**
 * Is anything electrical shown before it has been agreed to?
 *
 * Returns the offending step, or null. This exists because the ordering was
 * wrong once and nothing noticed: the demo screen puts a real NEC citation in
 * front of somebody, and it had drifted ahead of the acceptance it depends on.
 *
 * A comment saying "keep the disclaimer first" is not a mechanism. This is.
 */
export const orderingFault = (steps = STEPS) => {
  const consentAt = steps.findIndex((s) => s.effect === EFFECTS.LEGAL_ACCEPTANCE.id);
  if (consentAt < 0) return { step: null, reason: 'No step records acceptance at all.' };
  const early = steps.findIndex((s, i) => s.showsElectricalContent && i < consentAt);
  if (early >= 0) {
    return {
      step: steps[early].id,
      reason: `${steps[early].id} puts electrical content on screen before the terms are accepted.`,
    };
  }
  return null;
};

export const stepAt = (i) => STEPS[i] ?? null;
export const stepById = (id) => STEPS.find((s) => s.id === id) ?? null;
export const TOTAL_STEPS = STEPS.length;

// ─── State ───────────────────────────────────────────────────────────────────

export const beginOnboarding = () => Object.freeze({
  index: 0,
  answers: Object.freeze({}),
  done: false,
});

export const answer = (state, stepId, value) => Object.freeze({
  ...state,
  answers: Object.freeze({ ...state.answers, [stepId]: value }),
});

/**
 * Can we move on?
 *
 * A required step with no answer holds; everything else lets you through
 * whether you answered or not. Skipping is a first-class outcome, not a
 * failure — a person who skips both questions still gets a working app.
 */
export const canAdvance = (state) => {
  const step = stepAt(state.index);
  if (!step) return false;
  if (!step.required) return true;
  return state.answers[step.id] === true;
};

export const advance = (state) => {
  if (!canAdvance(state)) return state;
  const next = state.index + 1;
  return Object.freeze({ ...state, index: next, done: next >= STEPS.length });
};

export const back = (state) => Object.freeze({
  ...state, index: Math.max(0, state.index - 1), done: false,
});

/** 0..1, for a progress rail. Counts the step you are on as begun, not done. */
export const progress = (state) => state.index / STEPS.length;

// ─── The payoff ──────────────────────────────────────────────────────────────

/**
 * What the role choice will actually do, in the user's own words.
 *
 * Shown on the SAME screen as the choice, the moment it is made. This is the
 * whole mechanism: personalisation only converts when the person watches it
 * happen. A quiz whose result appears three screens later reads as a form.
 */
export const previewFor = (roleId) => {
  const role = roleById(roleId);
  if (!role) return null;
  const layout = layoutForRole(role.id);
  return Object.freeze({
    role: role.id,
    promise: role.promise,
    // Real ids from the real layout, so the preview cannot drift from the
    // thing it is previewing.
    cards: Object.freeze(layout),
  });
};

/**
 * Everything the app should do with what it learned.
 *
 * Every field here is consumed by something named in EFFECTS. Nothing is
 * collected for a dashboard.
 */
export const outcome = (state) => {
  const roleId = state.answers[StepId.ROLE] ?? null;
  const focusId = state.answers[StepId.FOCUS] ?? null;
  const role = roleById(roleId);
  const focus = focusById(focusId);

  return Object.freeze({
    // HOME_LAYOUT
    role: role?.id ?? null,
    layout: Object.freeze(layoutForRole(role?.id ?? null)),
    // FIRST_SCREEN — always Home.
    //
    // This used to open the app on whatever tab the FOCUS answer named, so
    // answering "getting better at the trade" launched a first-time user
    // directly into the Wiring Simulator. They never saw Home, never saw that
    // the app has calculators, a daily code question, Projects or Tools, and
    // had no idea how they got where they were or how to leave.
    //
    // Dropping somebody into a deep screen on first launch is disorienting even
    // when the screen is the right guess. Home is the map. What they told us
    // still gets used — it reorders Home (see `layout`) and it becomes a
    // suggestion they can take or ignore, which is the difference between
    // helping and hijacking.
    openAt: 'home',
    // What to OFFER on Home, once, rather than navigate to. Null when they
    // skipped the question — no answer means no suggestion, not a default one.
    suggest: focus
      ? Object.freeze({ tab: focus.tab, label: focus.label, headline: focus.suggest })
      : null,
    // DAILY_NOTIFICATION
    notifications: state.answers[StepId.NOTIFY] === true,
    // ENTITLEMENT
    startedTrial: state.answers[StepId.TRIAL] === true,
    // LEGAL_ACCEPTANCE
    acceptedTerms: state.answers[StepId.LEGAL] === true,
    // A person who skipped everything still gets a working app.
    skippedAll: !roleId && !focusId,
  });
};

// ─── The offer ───────────────────────────────────────────────────────────────

/**
 * What the trial screen says, tailored by role.
 *
 * `benefits` name what someone gets, not what a tier contains. "Unlimited
 * SparkAI" is a feature; "stop rationing questions on a ladder" is a reason.
 *
 * `freeAlternative` is REQUIRED and always visible. An offer screen with no
 * visible way past it converts better and is the thing this product does not
 * get to do.
 */
export const offerFor = (roleId) => {
  const role = roleById(roleId);
  const learning = role?.id === 'apprentice' || role?.id === 'student' || role?.id === 'instructor';

  return Object.freeze({
    headline: 'Try Pro free for 3 days',
    // The allowance is READ from the module that meters it. This screen used to
    // promise SparkAI "without a daily ceiling" and "as many times as you need
    // in a day" — while Pro is metered at 20 a day. It is the last screen
    // somebody reads before being charged, so it is the worst possible place
    // to advertise a limit the product does not honour.
    sub: learning
      ? `The full simulator and troubleshooting libraries, and ${proAskAllowanceLabel()}.`
      : `${proAskAllowanceLabel()}, unlimited projects, and every export.`,
    benefits: Object.freeze(learning
      ? [
        'Every simulator lesson, not just the first two',
        'All 270 troubleshooting scenarios',
        `${proAskAllowanceLabel()} — up from ${FREE_LIMITS[Feature.SPARK_AI].limit} on free`,
        'Keep every job you photograph',
      ]
      : [
        `${proAskAllowanceLabel()} — up from ${FREE_LIMITS[Feature.SPARK_AI].limit} on free`,
        'Unlimited projects, photos and daily logs',
        'Exports scoped for the customer, the GC or the inspector',
        'Every simulator lesson and troubleshooting scenario',
      ]),
    terms: '3 days free, then $7.99/month. Cancel any time in the App Store — '
      + 'nothing is charged until the trial ends.',
    // Always present. Always a real way out.
    freeAlternative: 'Keep using it free',
    freeNote: 'Every calculator stays unlimited on the free plan.',
  });
};

export { ROLE_LAYOUTS };
