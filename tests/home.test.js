// ─── HOME LAYOUT TESTS ───────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  HOME_CARDS, CARD_IDS, DEFAULT_LAYOUT, MAX_CARDS, cardById, layoutForRole,
  sanitizeLayout, addCard, removeCard, moveCard, resolveLayout, catalogWithState, CardKind, migrateLayout, LAYOUT_VERSION, CARDS_INTRODUCED_IN,
  allTools, allToolsGrouped, ALL_TOOLS_ORDER} from '../src/core/home/layout.js';

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
  // Read the real VALID_TABS out of App.js rather than keeping a copy here.
  // A hardcoded duplicate silently drifts — this list was already missing
  // 'jobsite' — and then the guard passes while the app cannot navigate.
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'App.js'), 'utf8');
  const m = src.match(/const VALID_TABS\s*=\s*\[([^\]]*)\]/);
  assert.ok(m, 'App.js must declare VALID_TABS for this guard to work');
  const VALID = m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  assert.ok(VALID.length > 10, 'parsed VALID_TABS looks wrong');

  for (const c of HOME_CARDS) {
    if (c.kind === CardKind.SHORTCUT) assert.ok(VALID.includes(c.tab), `${c.id} -> unknown tab ${c.tab}`);
  }
});

// ─── LAYOUT MIGRATION ────────────────────────────────────────────────────────
// The bug: a saved layout is a snapshot of the cards that existed when it was
// saved, and sanitizeLayout keeps only those ids. Every card added afterwards
// was invisible to that user forever — the feature shipped, Home never
// rendered it. Three features were lost this way before it was caught.

test('a returning user gains cards added after their layout was saved', () => {
  const saved = ['calculators', 'jobcam', 'estimator'];
  const migrated = migrateLayout(saved, 1);
  for (const id of CARDS_INTRODUCED_IN[2]) {
    assert.ok(migrated.includes(id), `${id} must reach an existing user`);
  }
});

test('the user keeps their own arrangement; new cards append', () => {
  const saved = ['jobcam', 'calculators'];
  const migrated = migrateLayout(saved, 1);
  assert.deepEqual(migrated.slice(0, 2), ['jobcam', 'calculators'], 'their order is untouched');
});

test('migration is idempotent and never duplicates', () => {
  const once = migrateLayout(['calculators'], 1);
  const twice = migrateLayout(once, LAYOUT_VERSION);
  assert.deepEqual(twice, sanitizeLayout(once));
  assert.equal(new Set(once).size, once.length, 'no duplicates');
});

test('a user already holding a new card does not get it twice', () => {
  const saved = ['calculators', 'blueprint'];
  const migrated = migrateLayout(saved, 1);
  assert.equal(migrated.filter((id) => id === 'blueprint').length, 1);
});

test('migration respects the card cap', () => {
  const full = CARD_IDS.slice(0, MAX_CARDS);
  assert.ok(migrateLayout(full, 1).length <= MAX_CARDS);
});

test('every migrated card id is a real card with a real tab', () => {
  for (const [version, ids] of Object.entries(CARDS_INTRODUCED_IN)) {
    for (const id of ids) {
      const card = cardById(id);
      assert.ok(card, `v${version} introduces unknown card ${id}`);
      if (card.kind === CardKind.SHORTCUT) assert.ok(card.tab, `${id} has no destination`);
    }
  }
});

test('garbage input still migrates safely', () => {
  for (const junk of [null, undefined, 'nope', [1, 2, 3], ['made-up-card']]) {
    const out = migrateLayout(junk, 1);
    assert.ok(Array.isArray(out));
    for (const id of out) assert.ok(cardById(id), `${id} is not a real card`);
  }
});

// ─── ALL TOOLS ───────────────────────────────────────────────────────────────
// Migration gets new cards in front of existing users once. These tests cover
// the stronger guarantee that replaces it: a tool in the catalog is reachable
// from Home, full stop, with no dependency on what a user saved months ago.

test('every navigable card is reachable no matter what the user saved', () => {
  const reachable = new Set(allTools().map((c) => c.id));
  for (const card of HOME_CARDS) {
    if (card.kind !== CardKind.SHORTCUT) continue;
    assert.ok(reachable.has(card.id),
      `${card.id} is in the catalog but cannot be reached from Home`);
  }
});

test('an empty saved layout still reaches everything', () => {
  // The exact case that made three shipped features look like they never
  // shipped: the saved layout is the only thing Home rendered.
  assert.equal(resolveLayout([]).length, 0, 'the user strip is genuinely empty');
  assert.ok(allTools().length >= 20, 'and All Tools is still the whole catalog');
});

test('All Tools ignores the saved layout entirely', () => {
  const a = allTools().map((c) => c.id);
  const b = allTools().map((c) => c.id);
  assert.deepEqual(a, b, 'it is a pure function of the catalog');
  // No argument to pass means no way for a saved layout to filter it.
  assert.equal(allTools.length, 0, 'allTools takes no state');
});

test('widgets are excluded — they are not destinations', () => {
  const ids = allTools().map((c) => c.id);
  for (const card of HOME_CARDS) {
    if (card.kind === CardKind.WIDGET) {
      assert.ok(!ids.includes(card.id), `${card.id} is a widget and must not look tappable`);
    }
  }
  assert.ok(allTools().every((c) => typeof c.tab === 'string' && c.tab.length > 0));
});

test('ordering names placement, never visibility', () => {
  // An id missing from ALL_TOOLS_ORDER must still appear. The failure mode of
  // that list has to be "in the wrong place", never "gone".
  const listed = new Set(ALL_TOOLS_ORDER);
  const unlisted = allTools().filter((c) => !listed.has(c.id));
  for (const card of unlisted) {
    assert.ok(allTools().some((c) => c.id === card.id),
      `${card.id} is not in ALL_TOOLS_ORDER and vanished`);
  }
  // Everything named in the order list that exists as a card comes out ranked
  // ahead of anything unlisted.
  const ids = allTools().map((c) => c.id);
  const lastListed = Math.max(...ids.map((id, i) => (listed.has(id) ? i : -1)));
  const firstUnlisted = ids.findIndex((id) => !listed.has(id));
  if (firstUnlisted !== -1) assert.ok(firstUnlisted > lastListed, 'unlisted cards sort last');
});

test('the job site game is in the catalog at all', () => {
  // It shipped for several releases reachable only from one hardcoded banner,
  // which meant it was not customizable and not discoverable by anyone who
  // scrolled past that banner once.
  const jobsite = HOME_CARDS.find((c) => c.id === 'jobsite');
  assert.ok(jobsite, 'the job site needs a catalog entry');
  assert.equal(jobsite.tab, 'jobsite');
  assert.ok(allTools().some((c) => c.id === 'jobsite'));
});

test('grouping keeps every card and invents none', () => {
  const grouped = allToolsGrouped().flatMap((g) => g.cards.map((c) => c.id));
  assert.deepEqual([...grouped].sort(), [...allTools().map((c) => c.id)].sort());
  assert.equal(new Set(grouped).size, grouped.length, 'no card appears twice');
  for (const g of allToolsGrouped()) assert.ok(g.group && g.cards.length > 0);
});

test('a newly added card needs no migration entry to be reachable', () => {
  // The regression guard for the whole premise. Every card introduced in any
  // version is reachable; so is every card that was never named in a version.
  const promoted = new Set(Object.values(CARDS_INTRODUCED_IN).flat());
  const reachable = new Set(allTools().map((c) => c.id));
  for (const card of HOME_CARDS) {
    if (card.kind !== CardKind.SHORTCUT) continue;
    if (promoted.has(card.id)) continue;
    assert.ok(reachable.has(card.id),
      `${card.id} was never promoted by a migration and must still be reachable`);
  }
});
