// ─── ASKING FOR A PRICE ──────────────────────────────────────────────────────
// Turning a filled-in material estimator into a question worth answering.
//
// WHAT WAS THERE: the "Get Local Price Estimate" button built this string —
//
//   `material pricing estimate electrician supply ${zip} THHN wire conduit EMT boxes`
//
// — and navigated to the chat tab with it. Two things are wrong and they
// compound.
//
// 1. IT IS NOT A QUESTION. It is a bag of search keywords, which is what you
//    type into a search engine that matches tokens, not what you hand a model
//    that answers sentences. Nothing in it asks for anything.
//
// 2. IT CARRIES NONE OF THE QUANTITIES. The screen above the button says, in
//    plain words, "SparkAI will estimate local material costs based on your
//    quantities above" — and then sends ten receptacles, five switches, eight
//    fixtures and two hundred feet of pipe precisely nowhere. The answer could
//    not have been about this job, because the job was never in the request.
//    The screen was promising something it did not do.
//
// And then it navigated away, losing the form.
//
// This module only builds the question. The screen keeps the answer in place —
// see inlineAsk.js, which exists for the same underlying bug.
//
// Pure module: no React, no network, no navigation.

/** What the estimator collects, in the order a supply house would read it. */
const LINES = Object.freeze([
  { key: 'receptacles', label: 'duplex receptacles' },
  { key: 'switches', label: 'single-pole switches' },
  { key: 'lights', label: 'light fixtures' },
  { key: 'fans', label: 'ceiling fans (fan-rated boxes)' },
  { key: 'dedicated', label: 'dedicated circuits' },
  { key: 'homeRuns', label: 'home runs' },
]);

const count = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

/** A five-digit US ZIP, or null. Never passed through unchecked. */
export const normalizeZip = (zip) => {
  const s = String(zip ?? '').trim();
  return /^\d{5}$/.test(s) ? s : null;
};

/**
 * The takeoff as a sentence, or null when nothing was entered.
 *
 * Returning null matters: a request with no quantities is the bug this module
 * was written for, so it is refused at the source rather than sent empty.
 */
export const takeoffSummary = (q = {}) => {
  const parts = LINES
    .map(({ key, label }) => ({ n: count(q[key]), label }))
    .filter(({ n }) => n > 0)
    .map(({ n, label }) => `${n} ${label}`);

  const feet = count(q.conduitFt);
  if (feet > 0) parts.push(`about ${feet} ft of conduit or cable`);

  return parts.length ? parts.join(', ') : null;
};

/**
 * The question actually sent.
 *
 * Written as a request a person would make out loud, because that is what the
 * model is good at answering. It asks for a per-unit breakdown rather than one
 * total — a single number cannot be checked against a supplier quote, and a
 * line-item list can.
 *
 * The location clause is dropped entirely when the ZIP is not five digits.
 * Saying "in my area" to a model invites it to invent an area, and a made-up
 * region silently makes every price in the answer wrong.
 */
export const buildPriceQuestion = (q = {}) => {
  const takeoff = takeoffSummary(q);
  if (!takeoff) return null;

  const zip = normalizeZip(q.zip);
  const where = zip ? ` for a job in ZIP code ${zip}` : '';

  return `I am pricing a residential rough-in${where}. The takeoff is: ${takeoff}. `
    + 'Give me an estimated material cost broken down by line item — devices, boxes, '
    + 'wire or cable, breakers and connectors — with a rough unit price for each and a '
    + 'total at the end. Note anything that commonly moves the price, and say plainly '
    + 'where you are uncertain rather than guessing a number.';
};

/**
 * Why the button is disabled, in words the user can act on.
 *
 * A dead button with no explanation is the same failure as an answer with no
 * question behind it: the screen knows something the person does not.
 */
export const priceAskBlocker = (q = {}) => {
  if (!takeoffSummary(q)) return 'Enter at least one quantity above and SparkAI can price it.';
  return null;
};

/**
 * What the answer is, and what it is not.
 *
 * Model-written prices are not a quote and must never read like one. This is a
 * NARRATIVE answer under the authority rule — it may discuss cost, it may not
 * be treated as a number the app stands behind.
 */
export const PRICE_DISCLAIMER =
  'Estimated by SparkAI, not quoted. Material prices move weekly and by supplier — '
  + 'confirm with your supply house before you order.';
