// ─── RUNNING OUT OF ANSWERS ──────────────────────────────────────────────────
// The app does not meter SparkAI — the server does, and the app finds out by
// receiving a 429. So everything it says at that moment is a claim about a
// number it did not count.
//
// The first bug ever reported on this project was exactly that: the server cut
// a free user off after three answers and the app said "you've used your 5".

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { limitMessage, limitLine, kindFrom, LimitKind } from '../src/core/paywall/limitMessage.js';

test('no number is stated unless the SERVER supplied one', () => {
  const blind = limitMessage({ reason: 'daily_limit_reached' });
  assert.doesNotMatch(blind.body, /\d/,
    `a count was invented with nothing to back it: "${blind.body}"`);
  assert.match(blind.body, /answers for today/);

  // With a server figure, saying it is fine — it came from the thing that counted.
  const told = limitMessage({ reason: 'daily_limit_reached', serverLimit: 3 });
  assert.match(told.body, /\b3 answers\b/);
});

test('a garbage figure is not repeated back at the user', () => {
  for (const junk of [null, undefined, 0, -1, NaN, 'lots', {}, Infinity]) {
    const m = limitMessage({ reason: 'daily_limit_reached', serverLimit: junk });
    assert.doesNotMatch(m.body, /\d/, `"${junk}" leaked into the message`);
  }
});

test('the monthly ceiling is not described as the daily one', () => {
  // "You've used your answers for today" when the DAILY allowance still has
  // room is a support ticket, and a confusing one.
  const m = limitMessage({ reason: 'monthly_fair_use_reached' });
  assert.equal(m.kind, LimitKind.MONTHLY);
  assert.doesNotMatch(m.body, /for today/);
  assert.match(m.body, /month/i);
});

test('an unreadable 429 still says something true', () => {
  // An empty body, a proxy error page, an older server that sends no reason.
  for (const reason of [null, undefined, '', 'something_new_we_do_not_know']) {
    const m = limitMessage({ reason });
    assert.equal(m.kind, LimitKind.UNKNOWN);
    assert.ok(m.title && m.body, 'a 429 with no reason produced no message');
    assert.doesNotMatch(m.body, /\d/);
  }
});

test('the offer matches who is asking', () => {
  assert.equal(limitMessage({ reason: 'daily_limit_reached', isPro: false }).offer, 'pro');
  assert.equal(limitMessage({ reason: 'daily_limit_reached', isPro: true }).offer, 'packs');
  // Never sell Pro to somebody who already has it.
  assert.doesNotMatch(limitMessage({ reason: 'daily_limit_reached', isPro: true }).body, /Pro raises/);
});

test('kindFrom only recognises reasons the server actually sends', () => {
  assert.equal(kindFrom('daily_limit_reached'), LimitKind.DAILY);
  assert.equal(kindFrom('monthly_fair_use_reached'), LimitKind.MONTHLY);
  assert.equal(kindFrom('DAILY_LIMIT_REACHED'), LimitKind.DAILY);
  assert.equal(kindFrom('rate_limited'), LimitKind.UNKNOWN);
});

test('the app no longer hardcodes a limit into the message', () => {
  // The regression. FREE_ASK_LIMIT is the app's constant; the cutoff is the
  // server's. Interpolating one into a sentence about the other is the bug.
  const app = fs.readFileSync('App.js', 'utf8');
  // Comment lines are excluded: the note explaining this bug quotes the old
  // string, and a scanner that cannot tell a warning from the thing it warns
  // about will fail on its own documentation.
  const code = app.split('\n').filter((l) => !/^\s*(\*|\/\/)/.test(l)).join('\n');
  assert.doesNotMatch(code, /used your \$\{FREE_ASK_LIMIT\}/,
    'the app is asserting its own limit again');
  assert.match(app, /limitLine\(/, 'the honest message is not being used');
  // And the 429 body has to actually be read, or there is never a server figure.
  assert.match(app, /res\.status === 429/);
  assert.match(app, /lastLimit = \{ reason, serverLimit \}/,
    'the 429 body is discarded, so the reason can never reach the user');
});

test('limitLine is one sentence and never empty', () => {
  for (const isPro of [true, false]) {
    for (const reason of ['daily_limit_reached', 'monthly_fair_use_reached', null]) {
      const line = limitLine({ reason, isPro });
      assert.ok(line.length > 30, `too thin: "${line}"`);
      assert.doesNotMatch(line, /undefined|null|NaN/);
    }
  }
});
