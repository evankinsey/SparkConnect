// ─── WIRE ROUTING ────────────────────────────────────────────────────────────
// The invariant: no conductor is ever drawn across a component body.
//
// This is not a cosmetic test. A correctly wired circuit was reported as having
// three faults it did not have, because the switched leg was drawn as one
// bezier that passed over the neutral splice on its way to the luminaire. The
// netlist was right and the picture lied. On this screen a wire you cannot
// trace is a wire that teaches the wrong thing.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  CORRIDOR, LANE_GAP, MAX_LANES, rowsFrom, rowIndexFor, laneY,
  crossesAnyBox, verticalChannel, routeWire, assignLanes, toPath, routedPath,
} from '../src/circuit/routing.js';
import { lessonById } from '../src/circuit/lessons/index.js';

// The real single-pole layout: five components, wrapping into two rows at phone
// width. This is the geometry the field report was looking at.
const boxes = {
  src:  { x: 0,   y: 8,   w: 150, h: 132 },
  sw1:  { x: 164, y: 8,   w: 144, h: 132 },
  lamp: { x: 0,   y: 186, w: 124, h: 132 },
  nBox: { x: 138, y: 186, w: 144, h: 100 },
  gBox: { x: 0,   y: 364, w: 186, h: 100 },
};
const anchorFor = (id, box, i, n) => ({ x: box.x + (box.w * (i + 1)) / (n + 1), y: box.y + box.h - 18 });
const anchors = {
  'src.hot': anchorFor('src', boxes.src, 0, 3),
  'src.neutral': anchorFor('src', boxes.src, 1, 3),
  'src.ground': anchorFor('src', boxes.src, 2, 3),
  'sw1.a': anchorFor('sw1', boxes.sw1, 0, 3),
  'sw1.b': anchorFor('sw1', boxes.sw1, 1, 3),
  'sw1.gnd': anchorFor('sw1', boxes.sw1, 2, 3),
  'lamp.hot': anchorFor('lamp', boxes.lamp, 0, 3),
  'lamp.neu': anchorFor('lamp', boxes.lamp, 1, 3),
  'lamp.gnd': anchorFor('lamp', boxes.lamp, 2, 3),
  'nBox.p1': anchorFor('nBox', boxes.nBox, 0, 3),
  'nBox.p2': anchorFor('nBox', boxes.nBox, 1, 3),
  'gBox.p1': anchorFor('gBox', boxes.gBox, 0, 4),
  'gBox.p2': anchorFor('gBox', boxes.gBox, 1, 4),
  'gBox.p3': anchorFor('gBox', boxes.gBox, 2, 4),
};
const W = 340;

// ─── The invariant ───────────────────────────────────────────────────────────

test('NO conductor is drawn across a component body', () => {
  const wires = lessonById('single-pole-source-at-switch').solution();
  const lanes = assignLanes(wires.map((w, i) => ({ ...w, id: `w${i}` })), anchors, boxes);

  for (const [i, w] of wires.entries()) {
    const points = routeWire(anchors[w.fromTerminal], anchors[w.toTerminal], {
      boxes, lane: lanes.get(`w${i}`) ?? 0, width: W,
    });
    assert.equal(
      crossesAnyBox(points, boxes, { ignore: [w.fromTerminal.split('.')[0], w.toTerminal.split('.')[0]] }),
      false,
      `${w.fromTerminal} → ${w.toTerminal} is drawn through a device it does not connect to`,
    );
  }
});

test('the exact wire from the field report clears the neutral splice', () => {
  // sw1.b → lamp.hot is the switched leg. Drawn as one bezier it passed over
  // nBox and looked like it landed there. It must now miss it entirely.
  const points = routeWire(anchors['sw1.b'], anchors['lamp.hot'], { boxes, width: W });
  assert.equal(crossesAnyBox(points, { nBox: boxes.nBox }), false,
    'the switched leg must not be drawn over the neutral splice');
  assert.equal(crossesAnyBox(points, { gBox: boxes.gBox }), false);
});

test('a straight bezier between those same terminals DID cross it', () => {
  // Proves the test is measuring the real defect and not a tautology: sample
  // the old curve and confirm it hits the box the new route avoids.
  const a = anchors['sw1.b']; const b = anchors['lamp.hot'];
  const dip = 30;
  const cy = Math.max(a.y, b.y) + dip;
  const sample = [];
  for (let t = 0; t <= 1; t += 0.02) {
    const mt = 1 - t;
    sample.push({
      x: mt * mt * mt * a.x + 3 * mt * mt * t * a.x + 3 * mt * t * t * b.x + t * t * t * b.x,
      y: mt * mt * mt * a.y + 3 * mt * mt * t * cy + 3 * mt * t * t * cy + t * t * t * b.y,
    });
  }
  assert.equal(crossesAnyBox(sample, { nBox: boxes.nBox }), true,
    'the old routing really did draw the switched leg over the neutral splice');
});

// ─── Rows and corridors ──────────────────────────────────────────────────────

test('components on the same y form one row that owns the corridor below it', () => {
  const rows = rowsFrom(boxes);
  assert.equal(rows.length, 3, 'src+sw1, lamp+nBox, gBox');
  assert.equal(rows[0].boxes.length, 2);
  assert.equal(rows[0].bottom, 140);
  assert.ok(rows[1].top > rows[0].bottom, 'rows do not overlap');
});

test('a terminal resolves to the row its device is in', () => {
  const rows = rowsFrom(boxes);
  assert.equal(rowIndexFor(rows, anchors['src.hot'].y), 0);
  assert.equal(rowIndexFor(rows, anchors['lamp.hot'].y), 1);
  assert.equal(rowIndexFor(rows, anchors['gBox.p1'].y), 2);
  assert.equal(rowIndexFor(rows, 99999), 2, 'below everything belongs to the last corridor');
});

test('lanes sit below their row and never inside it', () => {
  const rows = rowsFrom(boxes);
  for (let lane = 0; lane < MAX_LANES; lane++) {
    const y = laneY(rows, 0, lane);
    assert.ok(y > rows[0].bottom, 'a lane is in the corridor, not in the devices');
    assert.ok(y < rows[0].bottom + CORRIDOR, 'and does not reach the next row');
  }
});

test('lanes are spaced so parallel runs stay distinguishable', () => {
  const rows = rowsFrom(boxes);
  assert.equal(laneY(rows, 0, 1) - laneY(rows, 0, 0), LANE_GAP);
  // Wrapping is deliberate: past MAX_LANES we would collide with the next row,
  // so overlap is preferable to drawing through a device.
  assert.equal(laneY(rows, 0, MAX_LANES), laneY(rows, 0, 0));
});

// ─── Route shape ─────────────────────────────────────────────────────────────

test('every terminal is approached from below, which is the clear direction', () => {
  for (const [a, b] of [['sw1.b', 'lamp.hot'], ['src.hot', 'sw1.a'], ['gBox.p3', 'lamp.gnd']]) {
    const pts = routeWire(anchors[a], anchors[b], { boxes, width: W });
    assert.ok(pts[1].y > pts[0].y, `${a} must leave its terminal downward`);
    const last = pts[pts.length - 1]; const penult = pts[pts.length - 2];
    assert.ok(penult.y > last.y, `${b} must be entered from below`);
    assert.equal(penult.x, last.x, 'the final approach is straight up the terminal');
  }
});

test('a same-row run is a simple drop, across, and up', () => {
  const pts = routeWire(anchors['src.hot'], anchors['sw1.a'], { boxes, width: W });
  assert.equal(pts.length, 4);
  assert.equal(pts[0].x, pts[1].x);
  assert.equal(pts[1].y, pts[2].y, 'the horizontal run is level');
  assert.equal(pts[2].x, pts[3].x);
});

test('a cross-row run changes rows in a channel that misses every device', () => {
  const pts = routeWire(anchors['sw1.b'], anchors['lamp.hot'], { boxes, width: W });
  assert.ok(pts.length >= 5, 'it goes around rather than straight through');
  assert.equal(crossesAnyBox(pts, boxes, { ignore: ['sw1', 'lamp'] }), false);
});

test('the vertical channel avoids the boxes it would otherwise pass through', () => {
  const rows = rowsFrom(boxes);
  const x = verticalChannel(rows, 0, 2, 60, W);
  const blocking = [...rows[1].boxes, ...rows[2].boxes];
  assert.ok(!blocking.some((b) => x > b.x - 4 && x < b.x + b.w + 4),
    `channel at ${x} still runs through a device`);
});

test('routing degrades to a straight line rather than crashing on no layout', () => {
  const pts = routeWire({ x: 0, y: 0 }, { x: 10, y: 10 }, { boxes: {} });
  assert.deepEqual(pts, [{ x: 0, y: 0 }, { x: 10, y: 10 }]);
});

// ─── Lanes ───────────────────────────────────────────────────────────────────

test('conductors sharing a corridor get different lanes', () => {
  const wires = [
    { id: 'a', fromTerminal: 'src.hot', toTerminal: 'sw1.a' },
    { id: 'b', fromTerminal: 'src.neutral', toTerminal: 'sw1.b' },
    { id: 'c', fromTerminal: 'src.ground', toTerminal: 'sw1.gnd' },
  ];
  const lanes = assignLanes(wires, anchors, boxes);
  assert.equal(new Set([...lanes.values()]).size, 3,
    'three parallel runs drawn at the same depth are indistinguishable');
});

test('a wire pointing at a terminal that does not exist does not break the map', () => {
  const lanes = assignLanes([{ id: 'x', fromTerminal: 'ghost.1', toTerminal: 'sw1.a' }], anchors, boxes);
  assert.equal(lanes.get('x'), 0);
  assert.equal(routedPath({ fromTerminal: 'ghost.1', toTerminal: 'sw1.a' }, anchors, boxes), null);
});

// ─── Path generation ─────────────────────────────────────────────────────────

test('the path visits every point in order', () => {
  const pts = routeWire(anchors['sw1.b'], anchors['lamp.hot'], { boxes, width: W });
  const d = toPath(pts);
  assert.match(d, /^M /);
  assert.ok(d.includes('Q'), 'corners are rounded so it reads as wire, not as a wall');
  assert.ok(d.endsWith(`${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`),
    'it must finish exactly on the terminal');
});

test('degenerate polylines produce valid path data', () => {
  assert.equal(toPath([]), '');
  assert.equal(toPath([{ x: 1, y: 2 }]), 'M 1 2');
  assert.equal(toPath([{ x: 0, y: 0 }, { x: 5, y: 0 }]), 'M 0 0 L 5 0');
  // Zero-length segments must not emit NaN into the path.
  const d = toPath([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 5, y: 5 }]);
  assert.ok(!d.includes('NaN'), d);
});

test('routedPath returns both the geometry and the drawable path', () => {
  const r = routedPath({ fromTerminal: 'src.hot', toTerminal: 'sw1.a' }, anchors, boxes, 0, W);
  assert.ok(Array.isArray(r.points) && r.points.length >= 2);
  assert.ok(typeof r.d === 'string' && r.d.startsWith('M '));
});

test('the corridor here matches the corridor the canvas lays out', () => {
  // Two constants describing one gap. If the canvas widens its corridor and
  // this does not follow, lanes are computed for a space that no longer exists
  // and conductors get drawn into the row below.
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'screens', 'CircuitCanvas.js'), 'utf8');
  const m = src.match(/const GAP = \d+,\s*CORRIDOR = (\d+)/);
  assert.ok(m, 'CircuitCanvas must declare CORRIDOR for this guard to work');
  assert.equal(Number(m[1]), CORRIDOR,
    'routing.js and CircuitCanvas disagree about how much room conductors have');
});

test('the canvas routes wires instead of drawing terminal-to-terminal curves', () => {
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'screens', 'CircuitCanvas.js'), 'utf8');
  assert.ok(src.includes('routedPath'), 'the canvas must use the router');
  assert.ok(!/C \$\{a\.x\}/.test(src),
    'the old single-bezier path must be gone, not merely unused');
});
