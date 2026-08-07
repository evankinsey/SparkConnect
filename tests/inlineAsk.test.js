// ─── ASK WITHOUT LEAVING ─────────────────────────────────────────────────────
// One property above all: asking must never move the user.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  Delivery, AskState, origin, beginAsk, settleAsk, failAsk, deliveryFor,
  emptyAskStore, putAsk, clearAsk, askFor, pendingCount, inlineView, STALE_AFTER_MS,
} from '../src/core/ai/inlineAsk.js';

const permitOrigin = () => origin({
  tab: 'permit', label: 'Permit Assistant', field: 'codeEdition',
});
const plainOrigin = () => origin({ tab: 'boxfill', label: 'Box Fill' });

const answer = (text, provenance = 'MODEL') => ({ text, provenance });

// ─── The property ────────────────────────────────────────────────────────────

test('nothing in an inline ask ever hands back a place to navigate to', () => {
  // Navigation was being used as a way to run a request, and navigation
  // destroys state: you came back to a Permit Assistant that had forgotten
  // the half-filled form AND you still had to copy the answer across by hand.
  const r = settleAsk(beginAsk(permitOrigin(), 'what code does Tampa use'), answer('2023 NEC'));
  const v = inlineView(r);
  assert.equal(v.keepsScreen, true);
  assert.equal(v.tab, undefined, 'a view with a tab is a navigation instruction');
  assert.equal(v.navigate, undefined);
  assert.equal(v.screen, undefined);
});

test('a refusal comes back in place too, with somewhere to go', () => {
  // Throwing somebody out of the screen they were working in is the worst
  // possible response to "I could not verify that".
  const r = settleAsk(
    beginAsk(permitOrigin(), 'what NEC edition does Tampa enforce'),
    { text: 'x', provenance: 'REFUSED', reason: 'Adopted edition is jurisdictional.' },
  );
  assert.equal(r.state, AskState.READY);
  assert.equal(r.delivery, Delivery.BUBBLE, 'a refusal must not silently fill a field');
  assert.equal(r.fill, null);
  assert.ok(r.refusal);
  assert.equal(r.refusal.hasRoute, true);
  assert.equal(inlineView(r).keepsScreen, true);
});

// ─── Where the answer lands ──────────────────────────────────────────────────

test('a field that asked for a value gets the value', () => {
  const r = settleAsk(beginAsk(permitOrigin(), 'adopted edition'), answer('2023 NEC'));
  assert.equal(r.delivery, Delivery.FILL);
  assert.equal(r.fill.field, 'codeEdition');
  assert.equal(r.fill.value, '2023 NEC');
});

test('a filled field is a suggestion, never a confirmation', () => {
  // Filling a field directly with model output is exactly how an unchecked
  // value ends up looking like a checked one. This is the AHJ record's whole
  // Standing model, and inline ask must not be the hole in it.
  const r = settleAsk(beginAsk(permitOrigin(), 'adopted edition'), answer('2023 NEC'));
  assert.equal(r.fill.standing, 'SUGGESTED');
  assert.equal(r.fill.needsConfirmation, true);
  assert.match(r.fill.notice, /not confirmed/i);
  assert.match(r.fill.notice, /provisional/i);
  assert.notEqual(r.fill.standing, 'CONFIRMED');
});

test('a field wins over length, and length decides the rest', () => {
  const long = 'x'.repeat(400);
  // Asking from a form means landing in the form, however long the answer is.
  assert.equal(deliveryFor(beginAsk(permitOrigin(), 'q'), answer(long)), Delivery.FILL);
  // With no field, length is the only thing left to decide on.
  assert.equal(deliveryFor(beginAsk(plainOrigin(), 'q'), answer(long)), Delivery.PANEL);
  assert.equal(deliveryFor(beginAsk(plainOrigin(), 'q'), answer('short')), Delivery.BUBBLE);
});

// ─── Surviving a trip away ───────────────────────────────────────────────────

test('an answer that arrived while you were elsewhere is still there', () => {
  const o = permitOrigin();
  let store = putAsk(emptyAskStore(), beginAsk(o, 'adopted edition'));
  assert.equal(pendingCount(store), 1);

  // User switches apps. The request settles. They come back.
  store = putAsk(store, settleAsk(askFor(store, o), answer('2023 NEC')));
  const back = askFor(store, o);
  assert.equal(back.state, AskState.READY);
  assert.equal(back.fill.value, '2023 NEC');
  assert.equal(pendingCount(store), 0);
});

test('an answer from an hour ago is not quietly poured into a field', () => {
  const o = permitOrigin();
  const settled = settleAsk(beginAsk(o, 'adopted edition'), answer('2023 NEC'), { now: 1000 });
  const store = putAsk(emptyAskStore(), settled);

  assert.ok(askFor(store, o, { now: 1000 + STALE_AFTER_MS - 1 }));
  // Probably a different job by now, and filling the form with it is worse
  // than asking again.
  assert.equal(askFor(store, o, { now: 1000 + STALE_AFTER_MS + 1 }), null);
});

test('asking again from the same field replaces rather than races', () => {
  const o = permitOrigin();
  let store = putAsk(emptyAskStore(), beginAsk(o, 'first'));
  store = putAsk(store, beginAsk(o, 'second'));
  assert.equal(Object.keys(store.requests).length, 1);
  assert.equal(askFor(store, o).question, 'second');
  assert.equal(pendingCount(store), 1, 'two answers arriving into one field is the worse outcome');
});

test('two different origins do not collide', () => {
  let store = putAsk(emptyAskStore(), beginAsk(permitOrigin(), 'a'));
  store = putAsk(store, beginAsk(plainOrigin(), 'b'));
  assert.equal(Object.keys(store.requests).length, 2);
  assert.equal(askFor(store, permitOrigin()).question, 'a');
  assert.equal(askFor(store, plainOrigin()).question, 'b');

  store = clearAsk(store, permitOrigin().key);
  assert.equal(askFor(store, permitOrigin()), null);
  assert.ok(askFor(store, plainOrigin()));
});

// ─── While it runs, and when it breaks ───────────────────────────────────────

test('a pending request says you can keep working', () => {
  const v = inlineView(beginAsk(permitOrigin(), 'adopted edition'));
  assert.equal(v.pending, true);
  assert.match(v.pendingLabel, /keep working/i);
  assert.equal(v.keepsScreen, true);
});

test('a failure reassures rather than alarms', () => {
  const f = failAsk(beginAsk(permitOrigin(), 'q'), null);
  assert.equal(f.state, AskState.FAILED);
  // The thing a person actually wants to know at that moment.
  assert.match(f.error, /your work is still here/i);
  assert.equal(settleAsk(beginAsk(permitOrigin(), 'q'), null).state, AskState.FAILED);
});

test('bad input produces nothing instead of a broken request', () => {
  assert.equal(origin({}), null, 'an origin with no tab is not an origin');
  assert.equal(beginAsk(null, 'q'), null);
  assert.equal(beginAsk(permitOrigin(), '   '), null, 'an empty question is not a question');
  assert.equal(settleAsk(null, answer('x')), null);
  assert.equal(inlineView(null), null);
  assert.equal(askFor(null, permitOrigin()), null);
  assert.equal(askFor(emptyAskStore(), null), null);
});
