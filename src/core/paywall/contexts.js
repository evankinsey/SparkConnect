// ─── WHERE THE PAYWALL CAME FROM ─────────────────────────────────────────────
// One product, one price, one entitlement — and a different sentence depending
// on what the person was just doing.
//
// THE POINT. Somebody who has just watched the Job Site tell them their circuit
// was wrong is not in the same frame of mind as somebody who ran out of SparkAI
// answers, and "Upgrade to Pro" is the wrong sentence for both. The feature that
// demonstrated the value should be the feature the headline names, because it is
// the only one the person is currently convinced by.
//
// WHAT DOES NOT CHANGE: the product, the price, the entitlement, the terms. Only
// the pitch. A paywall whose OFFER changes by entry point is a dark pattern; one
// whose ARGUMENT changes is just paying attention.
//
// PRO IS NOT AN AI SUBSCRIPTION. Every headline here sells the thing the person
// hit, and the body sells the whole kit. The AI allowance is one of four
// pillars, not the product — see PILLARS.
//
// Pure module: no React. The paywall renders what this returns.

import { ASK_ALLOWANCE, FREE_PROJECT_LIMIT } from './entitlements.js';

export const Source = Object.freeze({
  SPARKAI_LIMIT: 'sparkai_limit',
  PROJECT_LIMIT: 'project_limit',
  WIRING_SIMULATOR: 'wiring_simulator',
  JOB_SITE: 'job_site',
  BLUEPRINT_TAKEOFF: 'blueprint_takeoff',
  MATERIAL_PRICING: 'material_pricing',
  EXPORT: 'export',
  SETTINGS: 'settings',
});

export const SOURCES = Object.freeze(Object.values(Source));

/**
 * The default pitch, used from Settings and anywhere with no better context.
 *
 * "Your entire electrical field kit. Unlocked." rather than a list of AI
 * features, because the app is much bigger than its assistant and selling it as
 * an AI subscription undersells three quarters of it.
 */
export const DEFAULT_HERO = Object.freeze({
  eyebrow: 'SPARKCONNECT PRO',
  headline: 'Your entire electrical field kit. Unlocked.',
  sub: 'AI assistance, field tools, job documentation and hands-on training — built for electricians.',
});

/**
 * Hero copy per entry point.
 *
 * Each names the thing the person just hit, then widens to the kit. None of them
 * says "upgrade" — that describes what the app wants, not what they get.
 */
export const HEROES = Object.freeze({
  [Source.SPARKAI_LIMIT]: Object.freeze({
    eyebrow: 'SPARKAI',
    headline: 'Keep asking SparkAI.',
    sub: `${ASK_ALLOWANCE.pro.perDay} answers every day, plus the complete SparkConnect toolkit.`,
  }),
  [Source.PROJECT_LIMIT]: Object.freeze({
    eyebrow: 'PROJECTS',
    headline: 'Document every job, not just one.',
    sub: 'Unlimited projects, photos, notes and estimates — all in one place per job.',
  }),
  [Source.WIRING_SIMULATOR]: Object.freeze({
    eyebrow: 'TRAINING',
    headline: 'Wire it wrong here, not on the job.',
    sub: 'Every simulator lesson and fault, plus the whole SparkConnect field kit.',
  }),
  [Source.JOB_SITE]: Object.freeze({
    eyebrow: 'JOB SITE',
    headline: 'Keep learning on the job.',
    sub: 'Every Job Site station, simulator challenge and training tool.',
  }),
  [Source.BLUEPRINT_TAKEOFF]: Object.freeze({
    eyebrow: 'BLUEPRINT TAKEOFF',
    headline: 'Turn plans into numbers faster.',
    sub: 'Unlimited takeoffs, straight into a material list — plus every Pro feature.',
  }),
  [Source.MATERIAL_PRICING]: Object.freeze({
    eyebrow: 'ESTIMATING',
    headline: 'Price the job before you bid it.',
    sub: 'SparkAI material pricing, estimates and invoices, with the rest of the kit.',
  }),
  [Source.EXPORT]: Object.freeze({
    eyebrow: 'EXPORTS',
    headline: 'Hand it over as paperwork.',
    sub: 'Exports and shareable estimates and invoices, plus everything else in Pro.',
  }),
  [Source.SETTINGS]: DEFAULT_HERO,
});

export const heroFor = (source) => HEROES[source] ?? DEFAULT_HERO;

/**
 * The four pillars, in the order they are sold.
 *
 * SparkAI is FIRST but it is one of four. Pro is the premium version of the
 * whole product, and a paywall that lists only AI benefits tells somebody they
 * are buying a chatbot.
 *
 * Nothing unfinished appears here. A benefit that is not production-ready is
 * either absent or explicitly marked, because a paywall is the one screen where
 * an aspiration reads as a promise.
 */
export const PILLARS = Object.freeze([
  Object.freeze({
    id: 'sparkai', icon: 'flash', title: 'SPARKAI',
    lead: `${ASK_ALLOWANCE.pro.perDay} answers every day`,
    sub: 'NEC · Troubleshooting · Photos · Estimates',
  }),
  Object.freeze({
    id: 'training', icon: 'school', title: 'TRAINING',
    lead: 'Practice before you do it in the field',
    sub: 'Wiring Simulator · Job Site · Code practice',
  }),
  Object.freeze({
    id: 'projects', icon: 'camera', title: 'PROJECTS',
    lead: 'Keep the whole job documented',
    sub: 'Photos · Notes · Estimates · Invoices',
  }),
  Object.freeze({
    id: 'tools', icon: 'construct', title: 'ADVANCED TOOLS',
    lead: 'Blueprint Takeoff and saved history',
    sub: 'Takeoff · Material pricing · Advanced workflows',
  }),
]);

/**
 * What free keeps, said out loud on the paywall.
 *
 * A paywall that only lists what is locked reads as a toll gate. Saying which
 * tools stay free forever is both true and the strongest argument that the
 * locked things are worth paying for rather than artificially withheld.
 */
export const FREE_FOREVER = Object.freeze([
  'Pipe bending, voltage drop, ampacity and wire colours',
  'Formula reference and the daily code question',
  `${ASK_ALLOWANCE.free.perDay} SparkAI answers a day`,
  `${FREE_PROJECT_LIMIT} project with photos`,
]);

/**
 * The trial, and the rule that stops it being a lie.
 *
 * Offered on ANNUAL only. StoreKit decides eligibility — somebody who has
 * already used a trial is not eligible, and promising them one produces a
 * purchase sheet that contradicts the button they just pressed.
 *
 * `eligible` must come from the store. There is no default of true.
 */
export const TRIAL_DAYS = 7;

export const ctaFor = ({ eligible = false, plan = 'annual' } = {}) => {
  const trial = eligible === true && plan === 'annual';
  return Object.freeze({
    label: trial ? `Start ${TRIAL_DAYS}-Day Free Trial` : 'Unlock SparkConnect Pro',
    showsTrial: trial,
  });
};

/**
 * Analytics for a paywall view.
 *
 * The SOURCE is the point — it is what lets conversion be measured per feature
 * later, which is the only way to know which part of the app actually sells.
 * Nothing about the question asked, the photo taken or the job worked on is
 * carried: what somebody typed into SparkAI is not conversion telemetry.
 */
export const paywallEvent = ({ source, isPro = false, plan = null } = {}) => Object.freeze({
  event: 'paywall_viewed',
  source: SOURCES.includes(source) ? source : Source.SETTINGS,
  alreadyPro: !!isPro,
  plan: plan ?? null,
});
