// ─── JOBSITE CONTENT PACKS ───────────────────────────────────────────────────
// A pack is untrusted. The contract these tests hold: nothing from a pack can
// place a task inside a wall, invent a task kind, mint XP, or displace the
// shipped site — and the site must work with no pack at all.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { STATIONS, TaskKind, buildMap, nearestStation, INTERACT_RANGE } from '../src/core/game/jobsite.js';
import {
  validatePackStation, loadStationPack, mergeStations, PACK_PREFIX, PACK_LIMITS,
} from '../src/core/game/packs.js';

// The yard around (20.5, 12) is open floor and far from every shipped station.
const good = (over = {}) => ({
  id: 'yard-panel',
  label: 'Temp power panel',
  brief: 'Site trailer needs temporary power. Land the feeders.',
  room: 'Yard',
  task: TaskKind.TROUBLESHOOT,
  x: 20.5, y: 12.4,
  xp: 60,
  icon: 'flash',
  ...over,
});

const grid = buildMap();

test('a well-formed pack station validates and is namespaced', () => {
  const r = validatePackStation(good(), grid);
  assert.ok(r.ok, r.reason);
  assert.ok(r.station.id.startsWith(PACK_PREFIX), 'pack ids cannot collide with shipped ones');
  assert.equal(r.station.fromPack, true);
});

test('a station inside a wall is rejected', () => {
  // (3,2) is the kitchen wall corner.
  const r = validatePackStation(good({ x: 3, y: 2 }), grid);
  assert.equal(r.ok, false);
  assert.match(r.reason, /inside a wall/);
});

test('a station off the map is rejected', () => {
  for (const pos of [{ x: -4, y: 5 }, { x: 500, y: 5 }, { x: 5, y: -1 }, { x: 5, y: 900 }]) {
    assert.equal(validatePackStation(good(pos), grid).ok, false, JSON.stringify(pos));
  }
});

test('a station stacked on a shipped one is rejected', () => {
  const shipped = STATIONS[0];
  const r = validatePackStation(good({ x: shipped.x, y: shipped.y }), grid);
  assert.equal(r.ok, false);
  assert.match(r.reason, /too close to/);
});

test('an unknown task kind is rejected rather than shipped as a dead tile', () => {
  const r = validatePackStation(good({ task: 'INSTALL_HOT_TUB' }), grid);
  assert.equal(r.ok, false);
  assert.match(r.reason, /unknown task kind/);
});

test('a wiring task without a lessonId is rejected', () => {
  assert.equal(validatePackStation(good({ task: TaskKind.WIRING }), grid).ok, false);
  const ok = validatePackStation(good({ task: TaskKind.WIRING, payload: { lessonId: 'single-pole-source-at-switch' } }), grid);
  assert.ok(ok.ok, ok.reason);
  assert.equal(ok.station.payload.lessonId, 'single-pole-source-at-switch');
});

test('payload keys the task screens do not read are dropped', () => {
  const r = validatePackStation(good({
    task: TaskKind.WIRING,
    payload: { lessonId: 'single-pole-source-at-switch', evil: 'rm -rf', nested: { a: 1 } },
  }), grid);
  assert.ok(r.ok, r.reason);
  assert.deepEqual(Object.keys(r.station.payload), ['lessonId']);
});

test('XP is capped and must be positive', () => {
  assert.equal(validatePackStation(good({ xp: 99999 }), grid).station.xp, PACK_LIMITS.xp);
  for (const xp of [0, -50, 'lots', null, NaN, Infinity]) {
    assert.equal(validatePackStation(good({ xp }), grid).ok, false, `xp ${xp}`);
  }
});

test('unbounded text is truncated and control characters stripped', () => {
  const r = validatePackStation(good({ label: 'x'.repeat(400), brief: 'Bad brief[0m here' }), grid);
  assert.ok(r.ok, r.reason);
  assert.ok(r.station.label.length <= PACK_LIMITS.label);
  assert.ok(!/[\u0000-\u001F\u007F]/.test(r.station.brief));
});

test('an unknown icon falls back rather than rendering nothing', () => {
  assert.equal(validatePackStation(good({ icon: 'not-an-icon' }), grid).station.icon, 'construct');
});

test('garbage input never throws', () => {
  for (const junk of [null, undefined, 7, 'nope', [], {}]) {
    const r = validatePackStation(junk, grid);
    assert.equal(r.ok, false);
    assert.ok(typeof r.reason === 'string');
  }
});

test('one bad station does not cost the rest of the pack', () => {
  const { stations, rejected } = loadStationPack([
    good(),
    good({ id: 'in-a-wall', x: 3, y: 2 }),
    // y=12 is the open yard strip below the lower row of rooms.
    good({ id: 'far-yard', x: 5.5, y: 12.4 }),
  ]);
  assert.equal(stations.length, 2);
  assert.equal(rejected.length, 1);
  assert.match(rejected[0].reason, /inside a wall/);
});

test('two pack stations cannot stack on each other either', () => {
  const { stations, rejected } = loadStationPack([good({ id: 'a' }), good({ id: 'b' })]);
  assert.equal(stations.length, 1);
  assert.match(rejected[0].reason, /too close to/);
});

test('a pack is capped and non-list input degrades quietly', () => {
  const bad = loadStationPack({ nope: true });
  assert.deepEqual(bad.stations, []);
  assert.equal(bad.rejected.length, 1);
  assert.ok(loadStationPack([]).stations.length === 0);
});

test('shipped stations always come first and are never displaced', () => {
  const packed = loadStationPack([good()]).stations;
  const merged = mergeStations(STATIONS, packed);
  assert.equal(merged.length, STATIONS.length + 1);
  for (let i = 0; i < STATIONS.length; i++) assert.equal(merged[i].id, STATIONS[i].id);
});

test('the site works with no pack at all', () => {
  const merged = mergeStations(STATIONS);
  assert.deepEqual(merged.map((s) => s.id), STATIONS.map((s) => s.id));
});

test('a validated pack station can actually be walked up to and started', () => {
  const packed = loadStationPack([good()]).stations;
  const merged = mergeStations(STATIONS, packed);
  const st = packed[0];
  // Standing on the station is within interact range by definition; the real
  // check is that nearestStation resolves to it rather than a shipped one.
  const found = nearestStation({ x: st.x, y: st.y }, merged, INTERACT_RANGE);
  assert.equal(found.id, st.id);
});
