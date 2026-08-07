// ─── ASK WITHOUT LEAVING ─────────────────────────────────────────────────────
// Answering a question in the screen that asked it.
//
// THE BUG THIS EXISTS FOR: you open the Permit Assistant, ask it to find your
// AHJ, and the app throws you into the SparkAI chat. When you come back the
// Permit Assistant has forgotten what you were doing. You have lost the half-
// filled form AND you now have to copy the answer across by hand. The feature
// that was supposed to save a phone call cost you the screen you were on.
//
// It is the same bug everywhere the app "asks SparkAI": navigation is being
// used as a way to run a request, and navigation destroys state.
//
// THE RULE: a request has an ORIGIN, the origin never moves, and the answer
// comes back to it. The chat is one place an answer can land, not the only one.
//
//   FILL    the origin named a field, and the answer is one value for it.
//           Lands in the field, marked as a SUGGESTION, never as confirmed.
//   BUBBLE  a short answer, shown where it was asked.
//   PANEL   long enough to need room, still on the same screen.
//
// AND IT MUST SURVIVE LEAVING ANYWAY. People switch apps mid-request. A request
// is keyed by its origin and kept, so walking away and coming back shows the
// answer that arrived while you were gone rather than starting over.
//
// THE AUTHORITY RULE STILL HOLDS, and this is where it would be easiest to
// break: filling a field directly with model output is exactly how an unchecked
// value ends up looking like a confirmed one. Anything delivered by FILL is
// marked SUGGESTED and carries the sentence saying so. The user confirming it
// is a separate act, and only that act makes it usable.
//
// Pure module: no React, no navigation, no network. The screen supplies the
// asker and renders the result.

import { refusalWithActions } from './nextActions.js';

export const Delivery = Object.freeze({
  FILL: 'FILL',       // one value, into the field that asked for it
  BUBBLE: 'BUBBLE',   // short answer, next to the question
  PANEL: 'PANEL',     // longer answer, same screen
});

export const AskState = Object.freeze({
  IDLE: 'IDLE',
  PENDING: 'PENDING',
  READY: 'READY',
  FAILED: 'FAILED',
});

/**
 * Where the question came from, and what it wants back.
 *
 * `field` is the whole reason FILL exists. A screen that says "I asked on
 * behalf of the codeEdition field" gets the answer put there; a screen that
 * does not gets a bubble. Neither navigates.
 */
export const origin = ({ tab, label, field = null, recordAs = null, context = null } = {}) => {
  if (!tab) return null;
  return Object.freeze({
    tab,
    label: label ?? tab,
    field,
    // Which stored field a confirmed answer would eventually land in. Carried
    // so the confirm step knows where to write, not so the answer can skip it.
    recordAs: recordAs ?? field,
    context: context ?? null,
    key: `${tab}:${field ?? 'general'}`,
  });
};

/** How long an answer stays worth showing when you come back to the screen. */
export const STALE_AFTER_MS = 30 * 60 * 1000;

const req = (o, question, extra = {}) => Object.freeze({
  key: o.key,
  origin: o,
  question: String(question ?? ''),
  state: AskState.PENDING,
  startedAt: Date.now(),
  answer: null,
  refusal: null,
  error: null,
  ...extra,
});

/**
 * Start a request. Returns the pending record — the caller renders a spinner
 * IN PLACE and stays exactly where it is.
 */
export const beginAsk = (o, question, { now = Date.now() } = {}) => {
  if (!o || !String(question ?? '').trim()) return null;
  return Object.freeze({ ...req(o, question), startedAt: now });
};

/**
 * Decide how an answer should come back.
 *
 * Ordering matters: a field that asked for one value gets FILL even when the
 * answer is long, because the point of asking from a form is landing in the
 * form. Length only decides between a bubble and a panel.
 */
export const deliveryFor = (request, answer) => {
  if (!request || !answer) return Delivery.BUBBLE;
  if (request.origin.field && answer.provenance !== 'REFUSED') return Delivery.FILL;
  const len = String(answer.text ?? '').length;
  return len > 220 ? Delivery.PANEL : Delivery.BUBBLE;
};

/**
 * Settle a request with an answer.
 *
 * A refusal is delivered inline too, with its routes attached — the worst
 * possible response to "I could not verify that" is to also throw the user out
 * of the screen they were working in.
 */
export const settleAsk = (request, answer, { now = Date.now() } = {}) => {
  if (!request) return null;
  if (!answer) {
    return Object.freeze({
      ...request, state: AskState.FAILED, settledAt: now,
      error: 'No answer came back. Nothing was lost — your work is still here.',
    });
  }

  const refused = answer.provenance === 'REFUSED';
  const delivery = deliveryFor(request, answer);

  return Object.freeze({
    ...request,
    state: AskState.READY,
    settledAt: now,
    delivery: refused ? Delivery.BUBBLE : delivery,
    answer,
    refusal: refused ? refusalWithActions(answer, request.question) : null,
    // What a FILL would write, and how it must be labelled. Never CONFIRMED:
    // filling a field with model output is exactly how an unchecked value ends
    // up looking like a checked one.
    fill: delivery === Delivery.FILL && !refused
      ? Object.freeze({
        field: request.origin.recordAs,
        value: String(answer.text ?? '').trim(),
        standing: 'SUGGESTED',
        notice: 'SparkAI suggested this. It is not confirmed until you check it with the '
          + 'authority — until then the app treats it as provisional.',
        needsConfirmation: true,
      })
      : null,
  });
};

export const failAsk = (request, error, { now = Date.now() } = {}) => request && Object.freeze({
  ...request,
  state: AskState.FAILED,
  settledAt: now,
  // Says the thing a person actually wants to know at that moment.
  error: error || 'That did not come back. Nothing was lost — your work is still here.',
});

// ─── Surviving a trip away ───────────────────────────────────────────────────

/**
 * A small store of requests, keyed by origin.
 *
 * One live request per origin: asking again from the same field replaces the
 * first rather than racing it, because two answers arriving into one field is
 * a worse outcome than a cancelled request.
 */
export const emptyAskStore = () => Object.freeze({ requests: Object.freeze({}) });

export const putAsk = (store, request) => {
  if (!request) return store;
  return Object.freeze({
    requests: Object.freeze({ ...(store?.requests ?? {}), [request.key]: request }),
  });
};

export const clearAsk = (store, key) => {
  const next = { ...(store?.requests ?? {}) };
  delete next[key];
  return Object.freeze({ requests: Object.freeze(next) });
};

/**
 * What this screen should show when it mounts.
 *
 * This is the half that fixes "the screen doesn't remember what you were
 * doing". A request that finished while the user was elsewhere is still here,
 * still attached to the field it was for.
 */
export const askFor = (store, o, { now = Date.now() } = {}) => {
  if (!store || !o) return null;
  const r = store.requests?.[o.key];
  if (!r) return null;
  // An answer from an hour ago is about a job the user has probably moved on
  // from, and silently filling a field with it is worse than asking again.
  if (r.settledAt && now - r.settledAt > STALE_AFTER_MS) return null;
  return r;
};

export const pendingCount = (store) =>
  Object.values(store?.requests ?? {}).filter((r) => r.state === AskState.PENDING).length;

/**
 * What the origin screen renders, in one call.
 *
 * `keepsScreen` is asserted rather than assumed. It is the property the whole
 * module exists to hold, and a test checks that nothing in here ever returns a
 * navigation target.
 */
export const inlineView = (request) => {
  if (!request) return null;
  return Object.freeze({
    state: request.state,
    question: request.question,
    pending: request.state === AskState.PENDING,
    // Shown in place. Not a full-screen spinner, and not a new screen.
    pendingLabel: request.origin.field
      ? `Looking that up — you can keep working.`
      : 'Working on it…',
    delivery: request.delivery ?? null,
    text: request.answer?.text ?? null,
    fill: request.fill ?? null,
    refusal: request.refusal ?? null,
    error: request.error ?? null,
    // There is no tab here on purpose.
    keepsScreen: true,
  });
};
