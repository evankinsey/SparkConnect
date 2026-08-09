// ─── ROLE-AWARE HOME ─────────────────────────────────────────────────────────
// Onboarding asks what somebody does. Until now that answer seeded the Home
// layout once, at install, and then never paid rent again.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ROLE_SUGGESTIONS, SUGGESTED_ROLES, suggestionsForRole, ROLE_LAYOUTS,
  cardById, CARD_IDS, sanitizeLayout,
} from '../src/core/home/layout.js';
import {
  HoursKind, hoursKind, hoursKindForRole, hoursEntry, totalHours,
  hoursThisWeek, hoursProgress,
} from '../src/core/career/apprenticeship.js';

test('every suggested card exists and is reachable', () => {
  // A suggestion pointing at a card that is not in the catalog is a dead row,
  // and one pointing at a tab with no screen is a dead link.
  for (const [role, list] of Object.entries(ROLE_SUGGESTIONS)) {
    assert.ok(list.length > 0, `${role} suggests nothing`);
    for (const s of list) {
      assert.ok(CARD_IDS.includes(s.id), `${role} suggests unknown card ${s.id}`);
      assert.ok(cardById(s.id), `${role}: ${s.id} does not resolve`);
    }
  }
});

test('every suggestion carries a reason, not a shrug', () => {
  // "Suggested for you" is unarguable, which means it is also unpersuasive.
  for (const [role, list] of Object.entries(ROLE_SUGGESTIONS)) {
    for (const s of list) {
      assert.ok(s.why && s.why.length > 24, `${role}/${s.id} has no real reason`);
      assert.doesNotMatch(s.why, /suggested for you|recommended|popular|everyone/i,
        `${role}/${s.id} says nothing`);
    }
  }
});

test('a role is offered what its stage actually needs', () => {
  // The whole point: an apprentice needs somewhere to log OJT hours and a
  // contractor does not.
  const app = suggestionsForRole('apprentice', []).map((c) => c.id);
  assert.ok(app.includes('hours'), 'an apprentice is not offered an hours log');

  const con = suggestionsForRole('contractor', []).map((c) => c.id);
  assert.ok(!con.includes('hours'), 'a contractor of fifteen years is nagged about OJT');
  assert.ok(con.includes('estimator'));

  const fore = suggestionsForRole('foreman', []).map((c) => c.id);
  assert.ok(fore.includes('projects'));
});

test('a card already on Home is never suggested again', () => {
  const before = suggestionsForRole('apprentice', []);
  const after = suggestionsForRole('apprentice', ['hours']);
  assert.ok(before.some((c) => c.id === 'hours'));
  assert.ok(!after.some((c) => c.id === 'hours'), 'suggested something already added');
  assert.equal(after.length, before.length - 1);
});

test('an unknown or missing role suggests nothing rather than something', () => {
  // An empty state saying "you are set up" beats a panel padded with cards
  // nobody chose to suggest.
  for (const r of [null, undefined, '', 'not_a_role', 42, {}]) {
    assert.deepEqual([...suggestionsForRole(r, [])], [], `${JSON.stringify(r)} produced suggestions`);
  }
});

test('every role in the layout table can also be suggested for', () => {
  for (const role of Object.keys(ROLE_LAYOUTS)) {
    assert.ok(SUGGESTED_ROLES.includes(role), `${role} has a layout but no suggestions`);
  }
});

test('role layouts still only contain real cards', () => {
  for (const [role, ids] of Object.entries(ROLE_LAYOUTS)) {
    assert.deepEqual(sanitizeLayout(ids), [...ids], `${role} layout holds an unknown card`);
  }
});

// ─── The hours ledger ────────────────────────────────────────────────────────

test('one mechanism serves both stages', () => {
  // An apprentice proves OJT, a licensed electrician proves CE. Same ledger.
  assert.equal(hoursKindForRole('apprentice'), HoursKind.OJT);
  assert.equal(hoursKindForRole('student'), HoursKind.OJT);
  assert.equal(hoursKindForRole('journeyman'), HoursKind.CONTINUING_ED);
  assert.equal(hoursKindForRole('contractor'), HoursKind.CONTINUING_ED);
  // An unknown role still gets a working screen.
  assert.ok(hoursKind(hoursKindForRole(null)).label);
});

test('no hour target is ever shipped as a fact', () => {
  // Programmes and state boards each set their own and they change. Printing
  // 8,000 as a default is a guess wearing the clothes of a fact, and somebody
  // plans a year around it.
  const blob = JSON.stringify([hoursKind(HoursKind.OJT), hoursKind(HoursKind.CONTINUING_ED)]);
  assert.match(hoursKind(HoursKind.OJT).targetPrompt, /\?$/, 'the target is asked for, not stated');
  assert.match(hoursKind(HoursKind.CONTINUING_ED).targetHint, /state board/i);
  assert.doesNotMatch(blob, /requires exactly|must be 8,?000|is 8,?000 hours/i);
  // Nothing is tracked until the user supplies their own number.
  assert.equal(hoursProgress({ logged: 100 }).known, false);
});

test('an impossible entry is refused rather than recorded', () => {
  // A typo in a record somebody will be asked to prove is worse than a
  // rejected entry.
  for (const bad of [{ hours: 0 }, { hours: -4 }, { hours: 25 }, { hours: 'x' }, {}, null]) {
    assert.equal(hoursEntry(bad), null, `accepted ${JSON.stringify(bad)}`);
  }
  const e = hoursEntry({ hours: 8.5, category: 'Commercial', note: 'panel change' });
  assert.equal(e.hours, 8.5);
  assert.match(e.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(e.category, 'Commercial');
});

test('totals and the weekly figure are arithmetic on what was logged', () => {
  const today = new Date('2026-08-09');
  const entries = [
    { hours: 8, date: '2026-08-09' },
    { hours: 6.5, date: '2026-08-05' },
    { hours: 10, date: '2026-06-01' },  // outside the week
  ];
  assert.equal(totalHours(entries), 24.5);
  assert.equal(hoursThisWeek(entries, today), 14.5);
  assert.equal(totalHours(null), 0);
  assert.equal(hoursThisWeek([], today), 0);

  const p = hoursProgress({ logged: totalHours(entries), target: 8000 });
  assert.equal(p.remaining, 7975.5);
  assert.equal(p.known, true);
});
