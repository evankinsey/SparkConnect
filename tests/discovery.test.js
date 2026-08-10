// ─── DISCOVERY ───────────────────────────────────────────────────────────────
// A phone is 1:2.2 and a room here is 1.25:1, so the viewport is one room wide
// and nearly three rooms tall — the building is always visible past the room
// the player occupies, and no zoom setting fixes that. So what changes is what
// an unvisited room RENDERS as, and these are the rules for that.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  Visibility, inRoom, roomAt, emptyDiscovery, sanitizeDiscovered,
  discover, discoverAt, isDiscovered, visibilityOf, showsContents,
  shadeFor, SHELL_SHADE, explored,
} from '../src/core/game/discovery.js';
import {
  ROOMS, STATIONS, SPAWN, buildMap, pathBetween,
} from '../src/core/game/jobsite.js';

test('the prints are never hidden — only what is in the rooms', () => {
  // Every room is on the map from the first frame; an unvisited one is a SHELL,
  // which draws its framing and withholds its contents.
  for (const r of ROOMS) {
    assert.equal(visibilityOf(emptyDiscovery(), r.id), Visibility.SHELL);
  }
  assert.ok(SHELL_SHADE > 0 && SHELL_SHADE < 1,
    'an unvisited room is either invisible or fully lit — neither is the shell');
});

test('walking into a room reveals it, permanently', () => {
  const k = ROOMS.find((r) => r.id === 'kitchen');
  let seen = emptyDiscovery();
  assert.equal(isDiscovered(seen, 'kitchen'), false);

  seen = discoverAt(seen, ROOMS, k.x + 1, k.y + 1);
  assert.equal(isDiscovered(seen, 'kitchen'), true);

  // Leaving does not un-discover it.
  seen = discoverAt(seen, ROOMS, 0, 0);
  assert.equal(isDiscovered(seen, 'kitchen'), true);
});

test('discovery is referentially stable, because it runs every movement tick', () => {
  // It is called ~30 times a second. Returning a fresh array each time would
  // re-render the world on every tick for no reason.
  const k = ROOMS.find((r) => r.id === 'kitchen');
  const seen = discoverAt(emptyDiscovery(), ROOMS, k.x + 1, k.y + 1);
  assert.strictEqual(discoverAt(seen, ROOMS, k.x + 2, k.y + 1), seen,
    'a tick inside an already-known room allocated a new array');
  assert.strictEqual(discover(seen, 'kitchen'), seen);
  assert.strictEqual(discoverAt(seen, ROOMS, 0, 0), seen, 'a tick outside every room allocated');
});

test('space between rooms is always drawn', () => {
  // Corridors, the slab between rooms, the yard. Hiding those would leave the
  // player standing in a void between rooms, which is the opposite of the
  // feeling this exists to build.
  const seen = emptyDiscovery();
  assert.equal(showsContents(seen, ROOMS, SPAWN.x, SPAWN.y), true,
    'the player spawns somewhere that hides its own contents');
  for (const [x, y] of [[-3, 7], [13, 0], [25, 13], [1, 1]]) {
    if (roomAt(ROOMS, x, y)) continue;
    assert.equal(showsContents(seen, ROOMS, x, y), true, `${x},${y} outside a room was hidden`);
  }
});

test('a station is hidden until its own room is entered', () => {
  const seen = emptyDiscovery();
  const inside = STATIONS.filter((s) => roomAt(ROOMS, s.x, s.y));
  assert.ok(inside.length >= 4, 'the stations are not in rooms, so nothing is gated');
  for (const s of inside) {
    assert.equal(showsContents(seen, ROOMS, s.x, s.y), false, `${s.id} is visible from outside`);
  }
  // And revealed once you are in.
  const first = inside[0];
  const after = discoverAt(seen, ROOMS, first.x, first.y);
  assert.equal(showsContents(after, ROOMS, first.x, first.y), true);
});

test('every room is reachable, so the job can always be finished', () => {
  // Discovery must never be able to strand the player: if a room cannot be
  // walked to, it stays dark forever and the job cannot be completed. Asked of
  // the game's OWN pathfinder rather than a flood fill written here, so this
  // tests the map the player actually walks.
  const grid = buildMap();
  let discovered = emptyDiscovery();
  const unreachable = [];
  for (const r of ROOMS) {
    const target = { x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) };
    const path = pathBetween(grid, SPAWN, target);
    if (!path || path.length === 0) { unreachable.push(r.id); continue; }
    for (const step of path) discovered = discoverAt(discovered, ROOMS, step.x, step.y);
  }
  assert.deepEqual(unreachable, [], `these rooms can never be lit: ${unreachable.join(', ')}`);

  const left = explored(discovered, ROOMS);
  assert.equal(left.complete, true,
    `walking to every room did not reveal them all: ${left.remaining.join(', ')}`);
});

test('walking the route to an objective lights the rooms it passes through', () => {
  // The reveal has to happen on the way, not only on arrival — otherwise a
  // player crossing a room to reach another one leaves it dark behind them.
  const grid = buildMap();
  const far = ROOMS.find((r) => r.id === 'hall');
  const path = pathBetween(grid, SPAWN, { x: far.x + 2, y: far.y + 2 });
  assert.ok(path.length > 0);
  let seen = emptyDiscovery();
  for (const step of path) seen = discoverAt(seen, ROOMS, step.x, step.y);
  assert.ok(isDiscovered(seen, 'hall'), 'the destination room stayed dark');
});

test('a corrupt or stale save cannot break the world', () => {
  for (const junk of [null, undefined, 'kitchen', 42, {}, [null], [{ id: 'kitchen' }]]) {
    assert.deepEqual([...sanitizeDiscovered(junk, ROOMS)], [], `choked on ${JSON.stringify(junk)}`);
  }
  // A room id from a future or older map is dropped, not trusted.
  assert.deepEqual([...sanitizeDiscovered(['kitchen', 'attic', 'kitchen'], ROOMS)], ['kitchen']);
});

test('progress through the building is countable and honest', () => {
  assert.equal(explored(emptyDiscovery(), ROOMS).percent, 0);
  const all = ROOMS.map((r) => r.id);
  assert.equal(explored(all, ROOMS).percent, 100);
  assert.equal(explored(all, ROOMS).complete, true);
  const half = explored(all.slice(0, 3), ROOMS);
  assert.equal(half.seen, 3);
  assert.equal(half.remaining.length, ROOMS.length - 3);
});

test('inRoom is generous at the threshold, so a doorway counts as arriving', () => {
  const k = ROOMS.find((r) => r.id === 'kitchen');
  assert.equal(inRoom(k, k.x, k.y), true);
  assert.equal(inRoom(k, k.x - 0.4, k.y + 1), true, 'standing in the doorway did not count');
  assert.equal(inRoom(k, k.x - 2, k.y + 1), false, 'a room revealed from two tiles away');
  assert.equal(inRoom(null, 1, 1), false);
});
