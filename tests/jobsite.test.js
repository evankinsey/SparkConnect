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
} from '../src/core/game/jobsite.js';
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
