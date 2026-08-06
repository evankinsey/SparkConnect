// ─── JOBSITE CONTENT PACKS ───────────────────────────────────────────────────
// The framework for jobsite tasks that did not ship in the binary — AI-generated
// ones, seasonal campaigns, premium packs.
//
// Same two rules as the troubleshooting packs, for the same reasons:
//
// 1. The game NEVER depends on this. STATIONS in jobsite.js is the handcrafted
//    site and it works with zero network and zero AI. A pack is additive only.
//
// 2. A pack is UNTRUSTED INPUT. Generated text can be malformed or unbounded,
//    and a premium pack arrives over a network. Nothing from a pack is allowed
//    to place a station inside a wall, invent a task kind the app cannot open,
//    hand out arbitrary XP, or collide with a shipped station id.
//
// Pure module: no React, no storage, no network.

import { TaskKind, STATIONS, MAP_W, MAP_H, buildMap, isWall, PLAYER_RADIUS } from './jobsite.js';

export const PACK_PREFIX = 'pack:';

export const PACK_LIMITS = Object.freeze({
  label: 60,
  brief: 240,
  room: 40,
  xp: 150,          // a pack cannot mint more XP per task than the hardest shipped one
  stations: 24,
  minSpacing: 1.6,  // tiles; closer than this and two stations fight over one spot
});

const ICONS = new Set([
  'bulb', 'flash', 'git-network', 'water', 'swap-horizontal', 'build',
  'git-branch', 'camera', 'hammer', 'construct', 'search', 'people',
]);

const clean = (value, max) => {
  if (typeof value !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const s = value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
};

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Validate one station from a pack against the real map.
 *
 * The placement checks are the load-bearing ones. A station the player cannot
 * physically stand next to is a task they can never start — an unwinnable
 * site, and exactly the kind of thing a generator produces cheerfully.
 */
export const validatePackStation = (raw, grid, taken = []) => {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'not an object' };

  const label = clean(raw.label, PACK_LIMITS.label);
  if (!label) return { ok: false, reason: 'label missing' };
  const brief = clean(raw.brief, PACK_LIMITS.brief);
  if (!brief) return { ok: false, reason: 'brief missing' };
  const room = clean(raw.room, PACK_LIMITS.room) ?? 'Yard';

  if (!Object.values(TaskKind).includes(raw.task)) {
    return { ok: false, reason: `unknown task kind ${raw.task}` };
  }

  const x = num(raw.x), y = num(raw.y);
  if (x === null || y === null) return { ok: false, reason: 'position missing' };
  if (x < 1 || y < 1 || x > MAP_W - 1 || y > MAP_H - 1) return { ok: false, reason: 'position is off the map' };

  // Standing room: the tile the station sits on must be walkable, and so must
  // the player's footprint around it.
  const blocked = [
    [x - PLAYER_RADIUS, y - PLAYER_RADIUS], [x + PLAYER_RADIUS, y - PLAYER_RADIUS],
    [x - PLAYER_RADIUS, y + PLAYER_RADIUS], [x + PLAYER_RADIUS, y + PLAYER_RADIUS],
  ].some(([px, py]) => isWall(grid, Math.floor(px), Math.floor(py)));
  if (blocked) return { ok: false, reason: 'station is inside a wall' };

  const clash = [...STATIONS, ...taken].find((s) => Math.hypot(s.x - x, s.y - y) < PACK_LIMITS.minSpacing);
  if (clash) return { ok: false, reason: `too close to ${clash.id}` };

  const xp = num(raw.xp);
  if (xp === null || xp <= 0) return { ok: false, reason: 'xp must be a positive number' };

  // Payload is passed to a task screen, so only the keys those screens read
  // are carried across. Anything else a generator invents is dropped.
  const payload = {};
  if (raw.task === TaskKind.WIRING) {
    const lessonId = clean(raw.payload?.lessonId, 80);
    if (!lessonId) return { ok: false, reason: 'wiring task needs a lessonId' };
    payload.lessonId = lessonId;
  }

  const id = clean(raw.id, 60);
  return {
    ok: true,
    station: {
      id: PACK_PREFIX + (id ? id.replace(/[^\w:-]/g, '-') : `${Math.round(x)}-${Math.round(y)}`),
      fromPack: true,
      x, y, room, label, brief,
      icon: ICONS.has(raw.icon) ? raw.icon : 'construct',
      task: raw.task,
      payload,
      xp: Math.min(Math.round(xp), PACK_LIMITS.xp),
    },
  };
};

/**
 * Validate a whole pack. Bad stations are dropped, not fatal — one bad entry
 * must not cost the rest of the pack.
 */
export const loadStationPack = (raw) => {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.stations) ? raw.stations : null;
  if (!list) return { stations: [], rejected: [{ reason: 'pack is not a list of stations' }] };

  const grid = buildMap();
  const stations = [];
  const rejected = [];
  const seen = new Set();
  for (const entry of list.slice(0, PACK_LIMITS.stations)) {
    const r = validatePackStation(entry, grid, stations);
    if (!r.ok) { rejected.push({ reason: r.reason, label: typeof entry?.label === 'string' ? entry.label.slice(0, 40) : null }); continue; }
    if (seen.has(r.station.id)) { rejected.push({ reason: 'duplicate id', label: r.station.label }); continue; }
    seen.add(r.station.id);
    stations.push(r.station);
  }
  return { stations, rejected };
};

/** Shipped stations first — the reviewed site is what a new player meets. */
export const mergeStations = (handcrafted, packed = []) => [
  ...handcrafted,
  ...packed.filter((p) => !handcrafted.some((h) => h.id === p.id)),
];
