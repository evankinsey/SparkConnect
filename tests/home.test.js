// ─── HOME LAYOUT TESTS ───────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HOME_CARDS, CARD_IDS, DEFAULT_LAYOUT, MAX_CARDS, cardById, layoutForRole,
  sanitizeLayout, addCard, removeCard, moveCard, resolveLayout, catalogWithState, CardKind,
} from '../src/core/home/layout.js';

test('every card has the fields the renderer needs', () => {
  for (const c of HOME_CARDS) {
    assert.ok(c.id && c.title && c.sub && c.icon && c.group, `${c.id} incomplete`);
    if (c.kind === CardKind.SHORTCUT) assert.ok(c.tab, `${c.id} shortcut needs a tab`);
  }
  assert.equal(new Set(CARD_IDS).size, CARD_IDS.length, 'ids must be unique');
});

test('a stale or hostile saved layout cannot break Home', () => {
  assert.deepEqual(sanitizeLayout(null), [...DEFAULT_LAYOUT]);
  assert.deepEqual(sanitizeLayout('nope'), [...DEFAULT_LAYOUT]);
  assert.deepEqual(sanitizeLayout(['bend', 'deleted_feature', 'bend', 42]), ['bend'],
    'unknown ids, duplicates and non-strings are dropped');
});

test('add, remove and reorder behave', () => {
  let l = ['bend', 'volt'];
  l = addCard(l, 'wiring_lab');
  assert.deepEqual(l, ['bend', 'volt', 'wiring_lab']);
  assert.deepEqual(addCard(l, 'bend'), l, 'no duplicates');
  assert.deepEqual(addCard(l, 'not_real'), l, 'unknown ids rejected');

  assert.deepEqual(removeCard(l, 'volt'), ['bend', 'wiring_lab']);
  assert.deepEqual(moveCard(l, 'wiring_lab', 'up'), ['bend', 'wiring_lab', 'volt']);
  assert.deepEqual(moveCard(l, 'bend', 'up'), l, 'first card cannot move up');
  assert.deepEqual(moveCard(l, 'wiring_lab', 'down'), l, 'last card cannot move down');
});

test('the card count is capped', () => {
  let l = [];
  for (const id of CARD_IDS) l = addCard(l, id);
  assert.equal(l.length, MAX_CARDS);
});

test('role layouts are valid and never permanently hide anything (ONB-05)', () => {
  for (const role of ['apprentice', 'journeyman', 'foreman', 'contractor', 'instructor', 'student']) {
    const l = layoutForRole(role);
    assert.ok(l.length > 0, role);
    assert.deepEqual(sanitizeLayout(l), l, `${role} references only real cards`);
  }
  assert.deepEqual(layoutForRole('unknown-role'), [...DEFAULT_LAYOUT]);
  // Everything stays reachable from Customize regardless of role.
  const groups = catalogWithState(layoutForRole('contractor'));
  assert.equal(groups.flatMap((g) => g.cards).length, HOME_CARDS.length);
});

test('resolveLayout returns renderable cards in order', () => {
  const cards = resolveLayout(['spark_ai', 'bend']);
  assert.deepEqual(cards.map((c) => c.id), ['spark_ai', 'bend']);
  assert.equal(cards[0].tab, 'necai');
});

test('the catalog marks what is already on Home', () => {
  const groups = catalogWithState(['bend']);
  const all = groups.flatMap((g) => g.cards);
  assert.equal(all.find((c) => c.id === 'bend').on, true);
  assert.equal(all.find((c) => c.id === 'volt').on, false);
});

test('every shortcut tab is one App.js knows about', () => {
  const VALID = ['home','bend','volt','wire','formulas','boxfill','conduitfill','ampacity',
    'estimator','necai','examprep','jobcam','settings','calculators','learn','wiringlab',
    'troubleshoot','flashcards','customizehome'];
  for (const c of HOME_CARDS) {
    if (c.kind === CardKind.SHORTCUT) assert.ok(VALID.includes(c.tab), `${c.id} -> unknown tab ${c.tab}`);
  }
});
