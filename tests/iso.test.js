// ─── ISOMETRIC PROJECTION ────────────────────────────────────────────────────
// Two correctness problems, not taste problems: depth order (there is no
// z-buffer, so wrong order paints the player through a wall) and the camera
// (a camera that drifts past the map shows empty space).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  TILE_W, TILE_H, WALL_H, Layer,
  toIso, depthKey, sortByDepth, isoCamera, inView,
  tileDiamond, diamondPath, facingFrom, joystickVector, screenToWorldVector,
} from '../src/core/game/iso.js';
import { MAP_W, MAP_H, SPAWN } from '../src/core/game/jobsite.js';

test('the projection is 2:1 isometric and the origin is the origin', () => {
  assert.deepEqual(toIso(0, 0), { x: 0, y: 0 });
  // One step +x goes right and down half a tile height.
  assert.deepEqual(toIso(1, 0), { x: TILE_W / 2, y: TILE_H / 2 });
  // One step +y goes left and down — that is what makes it a diamond.
  assert.deepEqual(toIso(0, 1), { x: -TILE_W / 2, y: TILE_H / 2 });
  // Equal x and y cancel horizontally: straight down the screen.
  assert.equal(toIso(3, 3).x, 0);
});

test('z lifts a point without moving its footprint', () => {
  const ground = toIso(4, 4, 0);
  const up = toIso(4, 4, WALL_H);
  assert.equal(up.x, ground.x, 'height must not shift a wall sideways');
  assert.equal(up.y, ground.y - WALL_H);
});

test('depth sorts back to front along the isometric diagonal', () => {
  // A tile further from the back corner must paint later.
  assert.ok(depthKey(5, 5) > depthKey(2, 2));
  assert.ok(depthKey(0, 9) > depthKey(0, 3));
  // Equal diagonals tie, and the layer breaks it.
  assert.equal(depthKey(3, 4, Layer.FLOOR) < depthKey(4, 3, Layer.ACTOR), true);
});

test('an actor on a tile always paints above that tile floor and props', () => {
  const x = 6, y = 6;
  const floor = depthKey(x, y, Layer.FLOOR);
  const prop = depthKey(x, y, Layer.PROP);
  const wall = depthKey(x, y, Layer.WALL);
  const actor = depthKey(x, y, Layer.ACTOR);
  assert.ok(floor < prop && prop < wall && wall < actor,
    'same-tile layering must be floor < prop < wall < actor');
});

test('a wall in front of the player paints after him, one behind paints before', () => {
  const player = { x: 5, y: 5 };
  const behind = depthKey(4, 4, Layer.WALL);
  const front = depthKey(6, 6, Layer.WALL);
  const p = depthKey(player.x, player.y, Layer.ACTOR);
  assert.ok(behind < p, 'a wall behind must be painted first, so he stands in front of it');
  assert.ok(front > p, 'a wall in front must be painted last, so it occludes him');
});

test('sortByDepth is stable within equal depths', () => {
  const items = [
    { id: 'a', depth: 5 }, { id: 'b', depth: 1 },
    { id: 'c', depth: 5 }, { id: 'd', depth: 3 },
  ];
  assert.deepEqual(sortByDepth(items).map((i) => i.id), ['b', 'd', 'a', 'c']);
});

test('the camera centres the player on a large map', () => {
  const cam = isoCamera({ x: 13, y: 7 }, MAP_W, MAP_H, 390, 844);
  const p = toIso(13, 7);
  // A mid-map focus should not be clamped, so it lands dead centre.
  assert.ok(Math.abs((p.x + cam.tx) - 195) < 1, 'player is horizontally centred');
});

test('the camera clamps so the site never floats off the edge', () => {
  const viewW = 390, viewH = 844;
  for (const focus of [{ x: 0.6, y: 0.6 }, { x: MAP_W - 0.6, y: MAP_H - 0.6 }, { x: 0.6, y: MAP_H - 0.6 }]) {
    const cam = isoCamera(focus, MAP_W, MAP_H, viewW, viewH);
    assert.ok(Number.isFinite(cam.tx) && Number.isFinite(cam.ty));
    // The far map corners must never both sit inside the viewport with slack
    // on the same side — that would mean empty space is showing.
    const corners = [toIso(0, 0), toIso(MAP_W, 0), toIso(0, MAP_H), toIso(MAP_W, MAP_H)];
    const xs = corners.map((c) => c.x + cam.tx);
    assert.ok(Math.min(...xs) <= 0 + TILE_W, 'left edge of the site is not pulled inside the screen');
  }
});

test('culling keeps the near tiles and drops the far ones', () => {
  const cam = isoCamera(SPAWN, MAP_W, MAP_H, 390, 844);
  assert.equal(inView(Math.floor(SPAWN.x), Math.floor(SPAWN.y), cam, 390, 844), true);
  assert.equal(inView(999, 999, cam, 390, 844), false);
});

test('a tile diamond has four corners and a closed path', () => {
  const d = tileDiamond(2, 3);
  assert.equal(d.length, 4);
  const path = diamondPath(2, 3);
  assert.match(path, /^M .* L .* L .* L .* Z$/);
});

test('facing maps a movement vector onto the eight compass points', () => {
  assert.equal(facingFrom(0, 0), null);
  assert.equal(facingFrom(1, 0), 'E');
  assert.equal(facingFrom(0, 1), 'S');
  assert.equal(facingFrom(-1, 0), 'W');
  assert.equal(facingFrom(0, -1), 'N');
  assert.equal(facingFrom(1, 1), 'SE');
  assert.equal(facingFrom(-1, -1), 'NW');
});

test('the joystick has a dead zone and never exceeds unit length', () => {
  const R = 50;
  assert.equal(joystickVector(0, 0, R).magnitude, 0);
  assert.equal(joystickVector(3, 0, R).magnitude, 0, 'a resting thumb must not creep');
  const far = joystickVector(500, 0, R);
  assert.ok(far.magnitude <= 1.0001 && far.magnitude > 0.9, 'a long drag saturates at full speed');
  assert.ok(Math.hypot(far.x, far.y) <= 1.0001);
});

test('the joystick reaches full speed in every direction, including vertical', () => {
  // The old pad could not move the player up or down. Whatever replaces it has
  // to prove all four, or the same bug ships again.
  const R = 50;
  for (const [dx, dy, name] of [[0, -R, 'up'], [0, R, 'down'], [-R, 0, 'left'], [R, 0, 'right']]) {
    const v = joystickVector(dx, dy, R);
    assert.ok(v.magnitude > 0.9, `${name} produced no movement`);
  }
});

test('screen drag converts to a world vector, so up-screen walks up-floor', () => {
  const up = screenToWorldVector(0, -1);
  assert.ok(up.x < 0 && up.y < 0, 'screen up is world north-west on an iso grid');
  const right = screenToWorldVector(1, 0);
  assert.ok(right.x > 0 && right.y < 0, 'screen right is world +x -y');
  const len = Math.hypot(right.x, right.y);
  assert.ok(Math.abs(len - 1) < 1e-6, 'the result is a unit vector');
  assert.deepEqual(screenToWorldVector(0, 0), { x: 0, y: 0 });
});
