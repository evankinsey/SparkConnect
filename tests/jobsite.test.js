// ─── JOBSITE WORLD ───────────────────────────────────────────────────────────
// The two failures that would ruin the mode silently: a station walled off
// behind a missing door, and a player who can walk through walls. Both are
// proved here, on the real generated map.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMap, isWall, movePlayer, nearestStation, completeStation,
  emptyJobsiteProgress, isComplete, jobsitePercent, sanitizeProgress,
  STATIONS, SPAWN, MAP_W, MAP_H, PLAYER_RADIUS, Tile, TaskKind,
  pathBetween, distanceFeet, nextObjective,
} from '../src/core/game/jobsite.js';
import { FENCE, YARD, wearAt, coverAt, Cover, groundNoise, onSlab } from '../src/core/game/yard.js';
import { ALL_LESSONS } from '../src/circuit/lessons/index.js';
import {
  CHARACTERS, CAST_IDS, STATION_DIALOGUE, dialogueFor,
} from '../src/core/game/cast.js';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const grid = buildMap();

/** Flood fill from spawn over floor tiles. */
const reachable = () => {
  const seen = new Set();
  const start = `${Math.floor(SPAWN.x)},${Math.floor(SPAWN.y)}`;
  const queue = [start];
  seen.add(start);
  while (queue.length) {
    const [x, y] = queue.pop().split(',').map(Number);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      const key = `${nx},${ny}`;
      if (seen.has(key) || isWall(grid, nx, ny)) continue;
      seen.add(key);
      queue.push(key);
    }
  }
  return seen;
};

test('the map is bounded — the player cannot walk off the site', () => {
  for (let x = 0; x < MAP_W; x++) {
    assert.equal(grid[0][x], Tile.WALL);
    assert.equal(grid[MAP_H - 1][x], Tile.WALL);
  }
  for (let y = 0; y < MAP_H; y++) {
    assert.equal(grid[y][0], Tile.WALL);
    assert.equal(grid[y][MAP_W - 1], Tile.WALL);
  }
});

test('the player spawns on floor, not inside a wall', () => {
  assert.equal(isWall(grid, Math.floor(SPAWN.x), Math.floor(SPAWN.y)), false);
});

test('every station is reachable on foot from spawn', () => {
  const seen = reachable();
  for (const s of STATIONS) {
    const key = `${Math.floor(s.x)},${Math.floor(s.y)}`;
    assert.ok(
      seen.has(key),
      `${s.id} (${s.label}) is walled off at ${key} — a room lost its door`,
    );
  }
});

test('every station sits on floor, not inside a wall', () => {
  for (const s of STATIONS) {
    assert.equal(
      isWall(grid, Math.floor(s.x), Math.floor(s.y)), false,
      `${s.id} is embedded in a wall`,
    );
  }
});

test('every wiring station points at a lesson that exists', () => {
  // Walking into a room and getting an empty screen is the worst outcome in
  // the mode, and a typo in a lesson id is invisible until someone walks there.
  const ids = new Set(ALL_LESSONS.map((l) => l.id));
  for (const s of STATIONS) {
    if (s.task !== TaskKind.WIRING) continue;
    assert.ok(
      ids.has(s.payload.lessonId),
      `${s.id} points at unknown lesson "${s.payload.lessonId}"`,
    );
  }
});

test('station ids are unique', () => {
  const ids = STATIONS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('movement is blocked by walls and never lands inside one', () => {
  // Walk hard into the site boundary from just inside it.
  let pos = { x: 1.5, y: 6.5 };
  for (let i = 0; i < 40; i++) pos = movePlayer(grid, pos, -0.25, 0);
  assert.ok(pos.x - PLAYER_RADIUS >= 1, `walked into the west fence: x=${pos.x}`);
  assert.equal(isWall(grid, Math.floor(pos.x), Math.floor(pos.y)), false);
});

test('a wall stops movement on that axis only — you slide, not stick', () => {
  const pos = { x: 1.5, y: 6.5 };
  const slid = movePlayer(grid, pos, -1, 0.25); // west blocked, south open
  assert.ok(slid.y > pos.y, 'vertical movement should survive a horizontal block');
});

test('walking the whole map never puts the player inside a wall', () => {
  let pos = { ...SPAWN };
  let seed = 7;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 4000; i++) {
    pos = movePlayer(grid, pos, (rand() - 0.5) * 0.5, (rand() - 0.5) * 0.5);
    assert.equal(
      isWall(grid, Math.floor(pos.x), Math.floor(pos.y)), false,
      `ended up inside a wall at ${pos.x},${pos.y} on step ${i}`,
    );
  }
});

test('nearestStation returns null in open yard and the station when close', () => {
  assert.equal(nearestStation({ x: 12.5, y: 6.5 }), null);
  const s = STATIONS[0];
  const found = nearestStation({ x: s.x + 0.2, y: s.y + 0.2 });
  assert.equal(found?.id, s.id);
});

test('nearestStation picks the nearer of two candidates', () => {
  const a = { id: 'a', x: 0, y: 0 };
  const b = { id: 'b', x: 1, y: 0 };
  assert.equal(nearestStation({ x: 0.9, y: 0 }, [a, b])?.id, 'b');
  assert.equal(nearestStation({ x: 0.1, y: 0 }, [a, b])?.id, 'a');
});

test('completing a station pays XP once, not twice', () => {
  const s = STATIONS[0];
  let p = emptyJobsiteProgress();
  p = completeStation(p, s.id);
  assert.equal(p.xp, s.xp);
  assert.ok(isComplete(p, s.id));
  p = completeStation(p, s.id);
  assert.equal(p.xp, s.xp, 'replaying a finished station must not pay again');
  assert.equal(p.completed.length, 1);
});

test('an unknown station id cannot inflate progress', () => {
  const p = completeStation(emptyJobsiteProgress(), 'st-does-not-exist');
  assert.equal(p.xp, 0);
  assert.equal(p.completed.length, 0);
});

test('percent runs 0 to 100 across every station', () => {
  let p = emptyJobsiteProgress();
  assert.equal(jobsitePercent(p), 0);
  for (const s of STATIONS) p = completeStation(p, s.id);
  assert.equal(jobsitePercent(p), 100);
});

// ─── Cast ────────────────────────────────────────────────────────────────────
// The crew from the series brief the work. Three ways that breaks silently:
// a station with no character, a character with no portrait file, and a
// portrait map that drifts from the cast list.

test('every station has a character briefing it', () => {
  for (const s of STATIONS) {
    const d = dialogueFor(s.id);
    assert.ok(d, `${s.id} has nobody to hand out the job`);
    assert.ok(CHARACTERS[d.character], `${s.id} names unknown character "${d.character}"`);
    assert.ok(d.brief && d.brief.length > 10, `${s.id} brief is empty`);
    assert.ok(d.done && d.done.length > 5, `${s.id} has no sign-off line`);
  }
});

test('no dialogue is written for a station that does not exist', () => {
  const ids = new Set(STATIONS.map((s) => s.id));
  for (const stationId of Object.keys(STATION_DIALOGUE)) {
    assert.ok(ids.has(stationId), `dialogue written for missing station "${stationId}"`);
  }
});

test('every character has a portrait file on disk', () => {
  for (const id of CAST_IDS) {
    const file = join(root, 'assets', 'cast', `${id}.png`);
    assert.ok(existsSync(file), `${id} has no portrait at assets/cast/${id}.png`);
  }
});

test('the portrait map and the cast list agree exactly', () => {
  // castImages.js cannot be imported here (it requires PNGs), so read it as
  // text — the point is that the two lists never drift apart.
  const src = readFileSync(join(root, 'src', 'screens', 'castImages.js'), 'utf8');
  const mapped = [...src.matchAll(/^\s{2}(\w+):\s*require\(/gm)].map((m) => m[1]);
  assert.deepEqual(mapped.sort(), [...CAST_IDS].sort());
});

test('every character is actually used on the site', () => {
  const used = new Set(Object.values(STATION_DIALOGUE).map((d) => d.character));
  for (const id of CAST_IDS) {
    assert.ok(used.has(id), `${id} was drawn into the cast but never appears on the job site`);
  }
});

test('corrupt or stale saved progress cannot crash the screen', () => {
  // Everything here parses as JSON but is the wrong shape. Each must come back
  // as something `progress.completed.length` can be read from.
  for (const bad of [null, undefined, 42, 'nope', [], {}, { completed: 'x' }, { completed: null, xp: 9 }]) {
    const p = sanitizeProgress(bad);
    assert.ok(Array.isArray(p.completed), `completed not an array for ${JSON.stringify(bad)}`);
    assert.equal(typeof p.xp, 'number');
  }
});

test('sanitizeProgress drops unknown stations and recomputes XP', () => {
  const s = STATIONS[0];
  const p = sanitizeProgress({ completed: [s.id, 'st-ghost', s.id], xp: 999999 });
  assert.deepEqual(p.completed, [s.id], 'unknown and duplicate ids must be dropped');
  assert.equal(p.xp, s.xp, 'XP is recomputed, so a tampered total cannot survive');
});

// ─── Wayfinding ──────────────────────────────────────────────────────────────
// The route is drawn on screen, so a path through a wall is not a cosmetic
// bug — it tells the player to walk somewhere they cannot walk.

test('a route never passes through a wall', () => {
  const grid = buildMap();
  for (const st of STATIONS) {
    const path = pathBetween(grid, SPAWN, st);
    assert.ok(path.length > 0, `no route to ${st.id}`);
    for (const p of path) {
      assert.equal(isWall(grid, Math.floor(p.x), Math.floor(p.y)), false,
        `route to ${st.id} crosses a wall at ${p.x},${p.y}`);
    }
  }
});

test('a route starts at the player and ends on the station', () => {
  const grid = buildMap();
  const st = STATIONS[0];
  const path = pathBetween(grid, SPAWN, st);
  assert.deepEqual(path[0], { x: SPAWN.x, y: SPAWN.y });
  assert.equal(path[path.length - 1].x, st.x);
  assert.equal(path[path.length - 1].y, st.y);
});

test('every step of a route is adjacent to the last', () => {
  const grid = buildMap();
  const path = pathBetween(grid, SPAWN, STATIONS[4]);
  for (let i = 1; i < path.length; i++) {
    const d = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    assert.ok(d <= 1.6, `jump of ${d} between steps ${i - 1} and ${i}`);
  }
});

test('an unreachable or invalid target returns no route rather than a lie', () => {
  const grid = buildMap();
  assert.deepEqual(pathBetween(grid, SPAWN, { x: 0, y: 0 }), [], 'target inside the boundary wall');
  assert.deepEqual(pathBetween(grid, { x: 0, y: 0 }, SPAWN), [], 'starting inside a wall');
  assert.deepEqual(pathBetween(grid, SPAWN, { x: -5, y: -5 }), []);
});

test('the objective is the nearest station still to be signed off', () => {
  const first = nextObjective(SPAWN, emptyJobsiteProgress());
  assert.ok(first, 'a fresh site has an objective');
  const done = { completed: [first.id], xp: 0 };
  assert.notEqual(nextObjective(SPAWN, done).id, first.id, 'a finished station is not the objective');
  const all = { completed: STATIONS.map((s) => s.id), xp: 0 };
  assert.equal(nextObjective(SPAWN, all), null, 'a finished site has no objective');
});

test('distance is reported in feet and grows with separation', () => {
  const near = distanceFeet({ x: 0, y: 0 }, { x: 1, y: 0 });
  const far = distanceFeet({ x: 0, y: 0 }, { x: 10, y: 0 });
  assert.ok(far > near && near > 0);
  assert.equal(distanceFeet({ x: 3, y: 3 }, { x: 3, y: 3 }), 0);
});

// ─── The yard ────────────────────────────────────────────────────────────────
// Ground is graded from the FENCE, not from the building. Grading it from the
// building parked the work truck, the trailer and the dumpster on a lawn —
// which the exterior prop list makes obvious the moment anybody checks it, and
// which nobody checks by reading.

const yardWear = (x, y) => wearAt(x, y, { mapW: MAP_W, mapH: MAP_H });

test('nothing with wheels is parked on grass', () => {
  // Every vehicle and every material drop, at the coordinates the screen
  // actually places them.
  const laydown = [
    ['work truck', -3.2, 6.5], ['work truck', -3.2, 8.8],
    ['site trailer', -3.5, 2.5], ['dumpster', 28.5, 4.5],
    ['pallet', -2.6, 11.4], ['pallet', -1.6, 11.4],
  ];
  for (const [what, x, y] of laydown) {
    assert.ok(yardWear(x, y) > 0.66,
      `the ${what} at ${x},${y} is standing on grass`);
  }
});

test('the fenced yard is worn, and grass starts outside the fence', () => {
  // Inside the fence is a laydown yard. A site this size is compacted within a
  // week, and a lawn inside the fence is the thing that looked wrong.
  for (const [x, y] of [[-2, 7], [-4, 3], [27, 7], [13, -2], [13, 15]]) {
    assert.ok(yardWear(x, y) > 0.55, `inside the fence at ${x},${y} is not worn`);
  }
  // Well beyond it, nothing drives.
  for (const [x, y] of [[-9, 7], [33, 7], [13, -6], [13, 19]]) {
    assert.ok(yardWear(x, y) < 0.33, `outside the fence at ${x},${y} is still dirt`);
  }
});

test('the yard bounds are derived from the fence, not typed twice', () => {
  // YARD is computed from the same FENCE the screen draws, so moving a run
  // moves the ground with it.
  assert.ok(FENCE.length >= 4, 'the site is not enclosed');
  assert.equal(YARD.x0, Math.min(...FENCE.map((f) => f.x)) - 0.5);
  assert.ok(YARD.x1 - YARD.x0 > MAP_W, 'the yard is narrower than the building');
  assert.ok(YARD.y1 - YARD.y0 > MAP_H, 'the yard is shorter than the building');
  assert.ok(YARD.x0 < 0 && YARD.y0 < 0, 'the yard does not extend past the map origin');
});

test('walking out of the building crosses yard, then verge, then grass', () => {
  // In that order, with no jump straight from dirt to lawn — a hard edge there
  // is the fence drawn a second time.
  const band = (w) => (w > 0.66 ? 2 : w > 0.33 ? 1 : 0);
  const walk = [];
  for (let x = 0; x >= -10; x--) walk.push(band(yardWear(x, 7)));
  assert.equal(walk[0], 2, 'the ground against the wall is not worn');
  assert.equal(walk[walk.length - 1], 0, 'it never reaches grass');
  assert.ok(walk.includes(1), 'there is no verge — dirt meets lawn at a hard line');
  // Monotonic: it never gets MORE worn as you walk away from the building.
  for (let i = 1; i < walk.length; i++) {
    assert.ok(walk[i] <= walk[i - 1], `the ground gets more worn further out at step ${i}`);
  }
});

// ─── The pad ─────────────────────────────────────────────────────────────────
// Build 33 shipped a commercial shell with a lawn down the middle of it.
//
// The screen decided "is this tile indoors?" by asking whether it fell inside
// one of the six ROOMS. Everything else — every corridor, which is most of the
// floor and ALL of the floor you actually walk on — answered no and was drawn
// through the outdoor branch, which paints turf and grass tufts. The map is a
// walled envelope; there is no outdoors inside it.

test('every walkable tile in the building is on the slab, corridors included', () => {
  const grid = buildMap();
  const off = [];
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (grid[y][x] === Tile.WALL) continue;
      if (!onSlab(x, y, { mapW: MAP_W, mapH: MAP_H })) off.push(`${x},${y}`);
    }
  }
  assert.deepEqual(off, [], `walkable tiles drawn as ground, not slab: ${off.join(' ')}`);
});

test('the corridor between the rooms is slab — this is what grew grass', () => {
  // y=7 is the band the props module calls "the yard": it is the corridor
  // between the two rows of rooms, and every solid prop on the level sits in
  // it. Under the old room-interior test it was lawn.
  for (let x = 1; x < MAP_W - 1; x++) {
    assert.ok(onSlab(x, 7, { mapW: MAP_W, mapH: MAP_H }),
      `the corridor at ${x},7 is not on the slab`);
  }
});

test('the apron outside the footprint is still ground, not paved over', () => {
  // The other half of the fix: widening the slab must not pour concrete across
  // the yard where the trucks and the trailer are parked.
  for (const [x, y] of [[-3, 6], [-4, 2], [28, 4], [13, -3], [MAP_W + 1, 5]]) {
    assert.equal(onSlab(x, y, { mapW: MAP_W, mapH: MAP_H }), false,
      `${x},${y} is outside the building and is being drawn as slab`);
  }
});

test('every exterior prop is placed off the pad', () => {
  // Trucks, trailer, dumpster and trees are positioned in the screen's EXTERIOR
  // list. If one ever drifts onto the footprint it would be parked on concrete
  // inside a building, which is the mirror image of the bug just fixed.
  const src = readFileSync(new URL('../src/screens/JobsiteScreen.js', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf('const EXTERIOR = ['));
  const list = block.slice(0, block.indexOf('];'));
  const coords = [...list.matchAll(/x:\s*(-?[\d.]+),\s*y:\s*(-?[\d.]+)/g)];
  assert.ok(coords.length >= 6, 'could not read the EXTERIOR list');
  for (const [, sx, sy] of coords) {
    const x = Number(sx); const y = Number(sy);
    assert.equal(onSlab(x, y, { mapW: MAP_W, mapH: MAP_H }), false,
      `an exterior prop at ${x},${y} is standing on the building slab`);
  }
});

// ─── The movement stick ──────────────────────────────────────────────────────
// It rendered half off the bottom of the phone in build 33.
//
// The visible circle was laid out with `top: origin.y - STICK_R`, where origin
// is a WINDOW coordinate, inside a container that begins below the "Job Site"
// navigation bar. So the header's height was silently added to it. The tell in
// the screenshot: SWAP SIDE, which was already bottom-anchored, rendered ABOVE
// the stick it labels. Distance from the bottom does not care where the
// container starts, and the container's bottom is the window's bottom.

test('the stick is laid out from the bottom edge, never from the top', () => {
  const src = readFileSync(new URL('../src/screens/JobsiteScreen.js', import.meta.url), 'utf8');
  const i = src.indexOf('function Stick(');
  assert.ok(i > 0, 'the Stick component moved');
  const body = src.slice(i, src.indexOf('\n}', src.indexOf('return (', i)));
  const code = body.split('\n').filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//')).join('\n');
  assert.equal(/top:\s*origin\./.test(code), false,
    'the stick is positioned with `top` again — it will sit a header-height too low');
  assert.ok(/bottom:\s*origin\.bottom/.test(code),
    'the stick is no longer anchored to the bottom edge');
});

test('the floor decides slab-vs-ground from the footprint, not from ROOMS', () => {
  // The predicate that caused it, so reintroducing the old one fails here
  // rather than in a screenshot. `indoor` is allowed to be renamed; what is
  // not allowed is deciding it by asking which room a tile falls in.
  const src = readFileSync(new URL('../src/screens/JobsiteScreen.js', import.meta.url), 'utf8');
  const i = src.indexOf('const indoor = useCallback(');
  assert.ok(i > 0, 'the indoor predicate moved — check what replaced it');
  const body = src.slice(i, src.indexOf('[]', i));
  assert.equal(/ROOMS\.some/.test(body), false,
    'indoor() is testing room membership again — every corridor becomes lawn');
  assert.ok(/onSlab\(/.test(body), 'indoor() no longer asks whether the tile is on the pad');
});
