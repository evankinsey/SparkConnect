// ─── TOP-DOWN CAMERA ─────────────────────────────────────────────────────────
// The contract that the isometric version could not meet: up on the stick moves
// the player toward the top of the screen, with no conversion in between.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  TILE, toScreen, followCamera, tileVisible, stickToWorld, facing4, readStick,
  knobOffset, floatingOrigin,
} from '../src/core/game/topdown.js';
import { MAP_W, MAP_H, SPAWN } from '../src/core/game/jobsite.js';

test('screen axes are world axes — this is the whole reason for the rewrite', () => {
  assert.deepEqual(stickToWorld(0, -1), { x: 0, y: -1 }, 'stick up must be world up');
  assert.deepEqual(stickToWorld(0, 1), { x: 0, y: 1 }, 'stick down must be world down');
  assert.deepEqual(stickToWorld(-1, 0), { x: -1, y: 0 });
  assert.deepEqual(stickToWorld(1, 0), { x: 1, y: 0 });
});

test('pushing up moves the player toward the top of the screen', () => {
  // Walk one tile "up" in world terms and confirm the projected y decreases.
  const before = toScreen(10, 10);
  const v = stickToWorld(0, -1);
  const after = toScreen(10 + v.x, 10 + v.y);
  assert.ok(after.y < before.y, 'up must decrease screen y');
  assert.equal(after.x, before.x, 'up must not drift sideways');
});

test('the projection is a straight scale, with no diagonal skew', () => {
  assert.deepEqual(toScreen(0, 0), { x: 0, y: 0 });
  assert.deepEqual(toScreen(1, 0), { x: TILE, y: 0 });
  assert.deepEqual(toScreen(0, 1), { x: 0, y: TILE });
});

test('the player is kept below centre so you see where you are going', () => {
  const viewW = 390, viewH = 844;
  const cam = followCamera({ x: 13, y: 7 }, MAP_W, MAP_H, viewW, viewH);
  const p = toScreen(13, 7);
  const screenY = p.y + cam.ty;
  assert.ok(screenY > viewH * 0.5, 'the player sits below the middle');
  assert.ok(screenY < viewH * 0.7, 'but not so low the controls cover him');
});

test('the camera leaves exterior visible past the building, not a void', () => {
  const viewW = 390, viewH = 844;
  // Stand in the far corner; the clamp must still allow apron beyond the map.
  const cam = followCamera({ x: 0.6, y: 0.6 }, MAP_W, MAP_H, viewW, viewH, { margin: 6 });
  const origin = toScreen(0, 0);
  assert.ok(origin.x + cam.tx > 0, 'there is room to the left of tile zero for exterior');
  assert.ok(origin.y + cam.ty > 0, 'there is room above tile zero for exterior');
});

test('the camera follows and does not show the whole map at once', () => {
  const viewW = 390, viewH = 844;
  const a = followCamera({ x: 4, y: 4 }, MAP_W, MAP_H, viewW, viewH);
  const b = followCamera({ x: 20, y: 10 }, MAP_W, MAP_H, viewW, viewH);
  assert.notEqual(a.tx, b.tx, 'the camera moves with the player');
  // At this zoom the site is wider than the phone, which is what keeps the
  // player large instead of a speck on a full-map view.
  assert.ok(MAP_W * TILE > viewW, 'the map must not fit on screen at once');
});

test('culling drops tiles that are nowhere near the viewport', () => {
  const cam = followCamera(SPAWN, MAP_W, MAP_H, 390, 844);
  assert.equal(tileVisible(Math.floor(SPAWN.x), Math.floor(SPAWN.y), cam, 390, 844), true);
  assert.equal(tileVisible(500, 500, cam, 390, 844), false);
});

test('facing picks the dominant axis, so a sprite never flickers on a diagonal', () => {
  assert.equal(facing4(0, 0), null);
  assert.equal(facing4(0, -1), 'up');
  assert.equal(facing4(0, 1), 'down');
  assert.equal(facing4(-1, 0), 'left');
  assert.equal(facing4(1, 0), 'right');
  assert.equal(facing4(0.9, 0.3), 'right', 'mostly-horizontal reads as horizontal');
  assert.equal(facing4(0.3, -0.9), 'up');
});

test('the stick reaches full speed in all four directions', () => {
  const R = 60;
  for (const [dx, dy, name] of [[0, -R, 'up'], [0, R, 'down'], [-R, 0, 'left'], [R, 0, 'right']]) {
    assert.ok(readStick(dx, dy, R).magnitude > 0.9, `${name} produced no movement`);
  }
});

test('the stick has a dead zone and saturates at one', () => {
  const R = 60;
  assert.equal(readStick(0, 0, R).magnitude, 0);
  assert.equal(readStick(4, 0, R).magnitude, 0, 'a resting thumb must not creep');
  const far = readStick(900, 0, R);
  assert.ok(far.magnitude <= 1.0001 && far.magnitude > 0.95);
  assert.ok(Math.hypot(far.x, far.y) <= 1.0001, 'never faster than full tilt');
});

test('diagonals are supported and are not a speed boost', () => {
  const R = 60;
  const diag = readStick(R, R, R);
  assert.ok(diag.x > 0 && diag.y > 0, 'diagonal movement works');
  assert.ok(Math.hypot(diag.x, diag.y) <= 1.0001, 'diagonal is not faster than cardinal');
});

test('the knob stays inside its base', () => {
  const R = 50;
  const k = knobOffset(500, 500, R);
  assert.ok(Math.hypot(k.x, k.y) <= R + 1e-6);
  assert.deepEqual(knobOffset(0, 0, R), { x: 0, y: 0 }, 'released stick recenters');
});

test('a floating stick only arms inside its control zone', () => {
  const W = 390, H = 844;
  assert.ok(floatingOrigin(60, 700, W, H, { side: 'left' }), 'lower-left arms it');
  assert.equal(floatingOrigin(60, 100, W, H, { side: 'left' }), null, 'the top of the screen does not');
  assert.equal(floatingOrigin(340, 700, W, H, { side: 'left' }), null, 'nor the opposite corner');
  assert.ok(floatingOrigin(340, 700, W, H, { side: 'right' }), 'left-handed mode mirrors it');
});
