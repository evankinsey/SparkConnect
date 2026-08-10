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

// ─── Backdating hours ────────────────────────────────────────────────────────
// "You should be able to retroactively record dates for OJT" — and the reason
// it matters is that nobody writes hours up on the clock. They go in on the
// drive home, on Sunday night, or the week before a review. A ledger that can
// only say "now" turns a week of catching up into five entries all dated today,
// and that is the version somebody has to defend to their programme.

import {
  todayISO, shiftDay, isLoggableDay, recentDays, dayLabel, byDayDesc,
  hoursEntry, hoursThisWeek,
} from '../src/core/career/apprenticeship.js';

test('today is the LOCAL calendar day, not the UTC one', () => {
  // The bug this replaces: `new Date().toISOString().slice(0,10)` is the UTC
  // day. 7pm in New York is already tomorrow in UTC, so hours logged on the
  // drive home were filed under tomorrow's date.
  const evening = new Date(2026, 7, 10, 21, 30, 0); // 9:30pm local, 10 Aug
  assert.equal(todayISO(evening), '2026-08-10');
  const earlyHours = new Date(2026, 0, 1, 0, 30, 0); // 12:30am local, 1 Jan
  assert.equal(todayISO(earlyHours), '2026-01-01');
});

test('shiftDay walks the calendar, including across months and years', () => {
  assert.equal(shiftDay('2026-08-10', -1), '2026-08-09');
  assert.equal(shiftDay('2026-08-01', -1), '2026-07-31');
  assert.equal(shiftDay('2026-01-01', -1), '2025-12-31');
  assert.equal(shiftDay('2024-03-01', -1), '2024-02-29', 'leap day');
});

test('a day in the future cannot be logged', () => {
  const now = new Date(2026, 7, 10, 12, 0, 0);
  assert.equal(isLoggableDay('2026-08-10', now), true, 'today is fine');
  assert.equal(isLoggableDay('2026-08-09', now), true, 'yesterday is the whole point');
  assert.equal(isLoggableDay('2026-08-11', now), false, 'nobody worked tomorrow');
  assert.equal(isLoggableDay('not-a-date', now), false);
  assert.equal(isLoggableDay('', now), false);
  assert.equal(isLoggableDay(null, now), false);
});

test('a supplied bad date is REFUSED, never quietly replaced with today', () => {
  const now = new Date(2026, 7, 10, 12, 0, 0);
  // Falling back to today is worse than refusing: the entry saves, looks
  // right, and is filed under a day the work did not happen on.
  assert.equal(hoursEntry({ hours: 8, date: '2026-08-11' }, now), null, 'future date');
  assert.equal(hoursEntry({ hours: 8, date: 'yesterday' }, now), null, 'unparseable');
  // Omitting it entirely still means today, which is the common case.
  assert.equal(hoursEntry({ hours: 8 }, now).date, '2026-08-10');
  // And a real backdated entry goes in untouched.
  assert.equal(hoursEntry({ hours: 6.5, date: '2026-07-28' }, now).date, '2026-07-28');
});

test('recentDays offers the last fortnight, newest first', () => {
  const now = new Date(2026, 7, 10, 12, 0, 0); // Monday 10 Aug 2026
  const days = recentDays(14, now);
  assert.equal(days.length, 14);
  assert.equal(days[0].iso, '2026-08-10');
  assert.equal(days[0].offset, 0);
  assert.equal(days[13].iso, '2026-07-28');
  assert.equal(new Set(days.map((d) => d.iso)).size, 14, 'no repeated days');
  for (const d of days) assert.equal(isLoggableDay(d.iso, now), true, `${d.iso} is offered but not loggable`);
});

test('the entry list reads in the order the work happened, not the order it was typed', () => {
  // Catching up on a week means typing Friday before Tuesday. Insertion order
  // would show Friday above Tuesday above Thursday, which reads as a mistake.
  const typed = [
    { id: 'a', date: '2026-08-07', hours: 8 },
    { id: 'b', date: '2026-08-04', hours: 8 },
    { id: 'c', date: '2026-08-10', hours: 6 },
  ];
  assert.deepEqual(byDayDesc(typed).map((e) => e.id), ['c', 'a', 'b']);
  assert.deepEqual(typed.map((e) => e.id), ['a', 'b', 'c'], 'must not sort in place');
});

test('hoursThisWeek is bounded at both ends', () => {
  const now = new Date(2026, 7, 10, 12, 0, 0);
  const entries = [
    { date: '2026-08-10', hours: 8 },   // today
    { date: '2026-08-05', hours: 8 },   // inside the window
    { date: '2026-08-03', hours: 8 },   // seven days back — outside
    { date: '2026-09-01', hours: 99 },  // a mistyped future date
  ];
  assert.equal(hoursThisWeek(entries, now), 16);
});

test('a backdated day reads as a day, not as a timestamp', () => {
  const now = new Date(2026, 7, 10, 12, 0, 0);
  assert.equal(dayLabel('2026-08-10', now), 'Today');
  assert.equal(dayLabel('2026-08-09', now), 'Yesterday');
  assert.match(dayLabel('2026-08-04', now), /Aug/);
  assert.match(dayLabel('2025-11-02', now), /2025/, 'an older year has to say which year');
  assert.equal(dayLabel('garbage', now), 'garbage', 'never hide a value it cannot parse');
});
