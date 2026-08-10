// ─── GETTING INTO THE TRADE ──────────────────────────────────────────────────
// The failure mode here is not a wrong answer, it is a confident one. A stale
// application window or an invented phone number costs somebody a year, and
// nothing in the app can check either.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  Path, PATHS, pathById, FIRST_STEPS, hoursProgress, comparison,
  AI_RULES, CAREER_DISCLAIMER, careerHome,
} from '../src/core/career/apprenticeship.js';
import { findOutcomePromise } from '../src/core/connect/index.js';

test('all three routes are covered, not just the union one', () => {
  // Listing IBEW alone quietly tells a non-union apprentice, or somebody in a
  // state with little union presence, that there is no route for them.
  for (const id of [Path.IBEW, Path.IEC, Path.ABC]) {
    assert.ok(pathById(id), `${id} is missing`);
  }
  assert.ok(PATHS.some((p) => p.kind === 'Union'));
  assert.ok(PATHS.filter((p) => p.kind.startsWith('Non-union')).length >= 2);
});

test('every path states its trade-offs, not just its strengths', () => {
  // A career page that only lists upsides is a recruitment ad. Somebody
  // choosing between these deserves to know what each one costs them.
  for (const p of PATHS) {
    assert.ok(p.tradeoffs.length >= 2, `${p.id} lists no real trade-offs`);
    assert.ok(p.strengths.length >= 2, `${p.id} lists no strengths`);
    assert.ok(p.what && p.oneLine, `${p.id} never says what it is`);
  }
});

test('no contact details are shipped — only the official locator', () => {
  // THE POINT. A phone number and an application window are the two facts that
  // change most and matter most, and nothing here can verify either. We send
  // people to the page the organisation maintains instead of a copy that rots.
  const blob = JSON.stringify(PATHS);
  assert.doesNotMatch(blob, /\(\d{3}\)\s*\d{3}-\d{4}/, 'a phone number was shipped');
  assert.doesNotMatch(blob, /\d{3}-\d{3}-\d{4}/, 'a phone number was shipped');
  assert.doesNotMatch(blob, /\b\d{5}(-\d{4})?\b/, 'a postal address was shipped');
  assert.doesNotMatch(blob, /applications? (open|close)s? (in|on) \w+ \d/i, 'a dated window was shipped');

  for (const p of PATHS) {
    if (p.locator) {
      assert.match(p.locator, /^https:\/\//, `${p.id} locator is not a secure url`);
      assert.ok(p.locatorLabel, `${p.id} has a locator with no label`);
    }
  }
});

test('hour counts are ranges with a hedge, never a single hard number', () => {
  // Programmes set their own. Somebody turning up expecting 8,000 and finding
  // 10,000 was told wrong by us.
  for (const p of PATHS) {
    assert.ok(p.hoursNote, `${p.id} says nothing about hours`);
    assert.match(p.hoursNote, /typically|set by/i, `${p.id} states hours as fact: ${p.hoursNote}`);
  }
});

test('nothing anywhere promises an outcome', () => {
  // We place nobody and have no relationship with any of these organisations.
  const everything = JSON.stringify([PATHS, FIRST_STEPS, AI_RULES, CAREER_DISCLAIMER, comparison()]);
  assert.equal(findOutcomePromise(everything), null);
  assert.match(CAREER_DISCLAIMER, /not affiliated/i);
  assert.match(CAREER_DISCLAIMER, /no say in who any programme accepts/i);
  assert.match(CAREER_DISCLAIMER, /confirm every detail/i);
});

test('the first step is the calendar, because that is what people lose a year to', () => {
  assert.match(FIRST_STEPS[0], /when applications open/i);
});

test('the AI may help without inventing the facts that decide a year', () => {
  const joined = AI_RULES.join(' ');
  assert.match(joined, /Never state an application deadline/i);
  assert.match(joined, /phone number/i);
  assert.match(joined, /Never say whether somebody will be accepted/i);
  // It is still allowed to be useful.
  assert.match(joined, /You may help/i);
});

test('hours track against the user programme, not a number we invented', () => {
  // Every programme sets its own target, so the module does arithmetic on the
  // user's number rather than shipping one as truth.
  const unset = hoursProgress({ logged: 1200 });
  assert.equal(unset.known, false);
  assert.equal(unset.remaining, null);
  assert.match(unset.note, /Programmes differ/i);

  const p = hoursProgress({ logged: 2000, target: 8000 });
  assert.equal(p.remaining, 6000);
  assert.equal(p.percent, 25);
  assert.equal(p.known, true);

  // Overshooting does not produce a negative remainder or 130%.
  const over = hoursProgress({ logged: 9000, target: 8000 });
  assert.equal(over.remaining, 0);
  assert.equal(over.percent, 100);
  assert.match(over.note, /Your programme signs off, not this app/);

  // Junk in never produces junk out.
  for (const bad of [null, {}, { logged: -5, target: -5 }, { logged: 'x', target: 'y' }]) {
    const r = hoursProgress(bad);
    assert.ok(r.percent >= 0 && r.percent <= 100);
    assert.ok(r.logged >= 0);
  }
});

test('the comparison is derived, so it cannot disagree with the pages', () => {
  const c = comparison();
  assert.equal(c.length, PATHS.length);
  for (const row of c) {
    const p = pathById(row.id);
    assert.equal(row.hoursNote, p.hoursNote, `${row.id}: the table and the page disagree`);
    assert.equal(row.name, p.name);
  }
  // The union row is the only one where pay is not employer-negotiated.
  assert.match(c.find((r) => r.id === Path.IBEW).payNote, /scale/i);
});

test('a screen gets everything in one call, disclaimer included', () => {
  const h = careerHome();
  assert.equal(h.paths.length, PATHS.length);
  assert.ok(h.firstSteps.length > 0);
  assert.equal(h.disclaimer, CAREER_DISCLAIMER);
});
