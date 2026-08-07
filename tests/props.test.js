// ─── SITE CLUTTER ────────────────────────────────────────────────────────────
// Clutter is set dressing until one crate seals a room with a station in it.
// These tests are the reason it is safe to keep adding objects.

import test from 'node:test';
import assert from 'node:assert/strict';

import { Tile, MAP_W, MAP_H, SPAWN, STATIONS, buildMap, isWall } from '../src/core/game/jobsite.js';
import {
  PROPS, PropKind, propById, tilesOf, solidProps, buildSiteMap, propAt,
  protectedTiles, reachableFrom,
} from '../src/core/game/props.js';

const key = (x, y) => `${x},${y}`;

test('every station is still reachable from spawn with the site cluttered', () => {
  // The guarantee the world already made, re-proved against the grid collision
  // ACTUALLY uses. A prop that breaks it breaks it for one player on one route,
  // which is exactly the kind of bug that ships.
  const grid = buildSiteMap();
  const seen = reachableFrom(grid);
  for (const s of STATIONS) {
    assert.ok(seen.has(key(Math.floor(s.x), Math.floor(s.y))),
      `${s.id} is sealed off by clutter`);
  }
});

test('no prop sits on a wall, a door, a station or spawn', () => {
  const base = buildMap();
  const protectedSet = protectedTiles();
  for (const p of PROPS) {
    for (const { x, y } of tilesOf(p)) {
      assert.ok(x > 0 && y > 0 && x < MAP_W - 1 && y < MAP_H - 1, `${p.id} is off the map`);
      assert.equal(base[y][x], Tile.FLOOR, `${p.id} overlaps a wall at ${x},${y}`);
      if (p.solid) {
        assert.equal(protectedSet.has(key(x, y)), false,
          `${p.id} blocks a protected tile at ${x},${y}`);
      }
    }
  }
});

test('solid props never sit in a one-tile corridor', () => {
  // The rule that makes the reachability test pass by design rather than by
  // luck: in the two-tall yard a crate leaves a way past, and in a one-tall
  // corridor it is a wall.
  const base = buildMap();
  for (const p of solidProps()) {
    for (const { x, y } of tilesOf(p)) {
      const above = base[y - 1][x] === Tile.FLOOR;
      const below = base[y + 1][x] === Tile.FLOOR;
      assert.ok(above || below,
        `${p.id} at ${x},${y} is in a one-tile corridor — one crate severs the map`);
    }
  }
});

test('no two props overlap', () => {
  const taken = new Map();
  for (const p of PROPS) {
    for (const { x, y } of tilesOf(p)) {
      const k = key(x, y);
      assert.equal(taken.has(k), false, `${p.id} overlaps ${taken.get(k)} at ${k}`);
      taken.set(k, p.id);
    }
  }
});

test('the clutter layer does not change what the building is', () => {
  // Room geometry is a fixed thing the other tests reason about; clutter is a
  // layer over it. buildMap() must come back untouched.
  const a = buildMap();
  buildSiteMap();
  const b = buildMap();
  assert.deepEqual(a, b, 'buildSiteMap mutated the base map');
});

test('collision sees solid props and ignores the rest', () => {
  const grid = buildSiteMap();
  for (const p of PROPS) {
    for (const { x, y } of tilesOf(p)) {
      assert.equal(isWall(grid, x, y), p.solid === true,
        `${p.id} at ${x},${y} is ${p.solid ? 'not blocking' : 'blocking'} when it should not be`);
    }
  }
});

test('a site has the things a real one has', () => {
  const kinds = new Set(PROPS.map((p) => p.kind));
  for (const k of [PropKind.LADDER, PropKind.PALLET, PropKind.GANG_BOX,
    PropKind.CONDUIT, PropKind.LIFT, PropKind.TEMP_POWER]) {
    assert.ok(kinds.has(k), `no ${k} on site`);
  }
});

test('every prop says what it is, in one true sentence', () => {
  for (const p of PROPS) {
    assert.ok(p.label, `${p.id} has no label`);
    assert.ok(p.look && p.look.length > 12, `${p.id} has nothing to say`);
    // Set dressing that starts stating requirements is narrative content
    // asserting electrical facts, which the app forbids everywhere else.
    assert.doesNotMatch(p.look, /\b\d+\s*(AWG|amp|amps|volt|volts|V|A)\b/i,
      `${p.id} states a specification`);
    assert.doesNotMatch(p.look, /\b(must|shall|required|code requires)\b/i,
      `${p.id} states a requirement`);
  }
});

test('you can ask what you are standing next to', () => {
  const p = PROPS[0];
  const t = tilesOf(p)[0];
  assert.equal(propAt(t.x + 0.5, t.y + 0.5)?.id, p.id);
  assert.equal(propAt(SPAWN.x, SPAWN.y), null, 'spawn is clear');
  assert.equal(propById(p.id).id, p.id);
  assert.equal(propById('nope'), null);
});

test('a multi-tile prop occupies every tile it covers', () => {
  const wide = PROPS.find((p) => p.w > 1);
  assert.ok(wide, 'expected at least one prop wider than a tile');
  assert.equal(tilesOf(wide).length, wide.w * wide.h);
  const grid = buildSiteMap();
  if (wide.solid) for (const t of tilesOf(wide)) assert.equal(isWall(grid, t.x, t.y), true);
});

// ─── The stick ───────────────────────────────────────────────────────────────

test('the stick base never lands where the knob would run off the screen', async () => {
  const { floatingOrigin } = await import('../src/core/game/topdown.js');
  const W = 390, H = 844, margin = 74, bottomInset = 110;

  // A thumb holding the phone one-handed lands in the bottom-left corner. The
  // unclamped version put the base there and drew it half off-screen, so
  // pushing down or outward ran out of travel before it ran out of deflection
  // and the swipe went off the edge.
  const corner = floatingOrigin(6, H - 8, W, H, { side: 'left', margin, bottomInset });
  assert.ok(corner.x >= margin, 'the base is clipped on the left');
  assert.ok(corner.y <= H - bottomInset - margin, 'the base is under the home indicator');

  // Every direction gets the same throw, wherever inside the zone you grab it.
  for (const [x, y] of [[10, H - 5], [180, H - 300], [3, H * 0.5], [120, H - 60]]) {
    const o = floatingOrigin(x, y, W, H, { side: 'left', margin, bottomInset });
    if (!o) continue;
    assert.ok(o.x >= margin && o.x <= W - margin, `x ${o.x} clipped`);
    assert.ok(o.y >= H * 0.45 && o.y <= H - bottomInset - margin, `y ${o.y} clipped`);
  }

  // Still refuses a touch outside its half of the screen, and above the zone.
  assert.equal(floatingOrigin(380, H - 40, W, H, { side: 'left' }), null);
  assert.equal(floatingOrigin(40, 60, W, H, { side: 'left' }), null);

  // A viewport too short for the margins resolves to the middle rather than
  // inverting the clamp and throwing the base off the top.
  const tiny = floatingOrigin(50, 300, 200, 400, { side: 'left', margin: 150, bottomInset: 150 });
  assert.ok(tiny.x >= 0 && tiny.x <= 200);
  assert.ok(Number.isFinite(tiny.y));
});
