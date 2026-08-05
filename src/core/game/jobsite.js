// ─── JOBSITE WORLD ───────────────────────────────────────────────────────────
// A walkable job site: rooms you enter, stations you walk up to, and a task at
// each one. The task IS the app — walk into the kitchen and the wiring
// simulator opens on the kitchen lesson; walk to the bench and it is the pipe
// bender. The world is the wrapper, never a second copy of the tool.
//
// Pure module: no React, no storage, no rendering. Collision, proximity and
// progress are all decided here so they can be tested without a device, and so
// a rendering bug can never let the player walk through a wall.
//
// The map is GENERATED, not hand-drawn as ASCII art. Every room is a wall
// rectangle with a carved door opening onto the shared yard, which makes
// "every station is reachable from spawn" true by construction — and
// tests/jobsite.test.js proves it with a flood fill anyway.

export const Tile = { FLOOR: 0, WALL: 1 };

export const MAP_W = 26;
export const MAP_H = 14;

/** Where the player stands on entry — the yard, outside every room. */
export const SPAWN = { x: 12.5, y: 6.5 };

/** How close the player must be to a station before it can be started. */
export const INTERACT_RANGE = 1.35;

/** Player half-width used for wall collision. Slightly under half a tile so
 *  doorways are comfortable to walk through with a thumb on a d-pad. */
export const PLAYER_RADIUS = 0.34;

// ─── Rooms ───────────────────────────────────────────────────────────────────
// x,y = top-left of the wall rectangle. doorX = column of the gap carved in
// the bottom wall. Interior is (w-2) x (h-2).

const ROOMS = [
  { id: 'kitchen',  x: 3,  y: 2, w: 5, h: 4, doorX: 5,  label: 'Kitchen' },
  { id: 'living',   x: 10, y: 2, w: 6, h: 4, doorX: 12, label: 'Living Room' },
  { id: 'bedroom',  x: 18, y: 2, w: 5, h: 4, doorX: 20, label: 'Bedroom' },
  { id: 'garage',   x: 3,  y: 8, w: 6, h: 4, doorX: 5,  label: 'Garage / Panel' },
  { id: 'bath',     x: 11, y: 8, w: 5, h: 4, doorX: 13, label: 'Bathroom' },
  { id: 'hall',     x: 17, y: 8, w: 5, h: 4, doorX: 19, label: 'Hallway' },
];

/** Build the tile grid. Deterministic — same map every time. */
export const buildMap = () => {
  const grid = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(Tile.FLOOR));

  // Site boundary.
  for (let x = 0; x < MAP_W; x++) { grid[0][x] = Tile.WALL; grid[MAP_H - 1][x] = Tile.WALL; }
  for (let y = 0; y < MAP_H; y++) { grid[y][0] = Tile.WALL; grid[y][MAP_W - 1] = Tile.WALL; }

  for (const r of ROOMS) {
    for (let x = r.x; x < r.x + r.w; x++) {
      grid[r.y][x] = Tile.WALL;
      grid[r.y + r.h - 1][x] = Tile.WALL;
    }
    for (let y = r.y; y < r.y + r.h; y++) {
      grid[y][r.x] = Tile.WALL;
      grid[y][r.x + r.w - 1] = Tile.WALL;
    }
    grid[r.y + r.h - 1][r.doorX] = Tile.FLOOR; // door onto the yard
  }
  return grid;
};

export const isWall = (grid, tx, ty) => {
  if (ty < 0 || ty >= MAP_H || tx < 0 || tx >= MAP_W) return true;
  return grid[ty][tx] === Tile.WALL;
};

// ─── Stations ────────────────────────────────────────────────────────────────
// `task` is what the screen launches. `payload` is handed to that screen so the
// station opens the right lesson rather than a menu.

export const TaskKind = {
  WIRING: 'WIRING',
  TROUBLESHOOT: 'TROUBLESHOOT',
  BEND: 'BEND',
  JOBCAM: 'JOBCAM',
  QUIZ: 'QUIZ',
};

const roomCenter = (id) => {
  const r = ROOMS.find((x) => x.id === id);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 - 0.3 };
};

export const STATIONS = Object.freeze([
  {
    id: 'st-bedroom', ...roomCenter('bedroom'), room: 'Bedroom',
    icon: 'bulb',
    label: 'Single-pole light',
    brief: 'Standard switch loop, feed at the switch. Get the light working.',
    task: TaskKind.WIRING, payload: { lessonId: 'single-pole-source-at-switch' },
    xp: 50,
  },
  {
    id: 'st-kitchen', ...roomCenter('kitchen'), room: 'Kitchen',
    icon: 'flash',
    label: 'Switch loop at the light',
    brief: 'Feed lands at the fixture, not the switch. Run the loop right.',
    task: TaskKind.WIRING, payload: { lessonId: 'single-pole-source-at-light' },
    xp: 60,
  },
  {
    id: 'st-living', ...roomCenter('living'), room: 'Living Room',
    icon: 'git-network',
    label: 'Three-way lighting',
    brief: 'Two doorways, one light. Wire the three-way pair.',
    task: TaskKind.WIRING, payload: { lessonId: 'three-way-source-at-switch' },
    xp: 90,
  },
  {
    id: 'st-bath', ...roomCenter('bath'), room: 'Bathroom',
    icon: 'water',
    label: 'Three-way, feed at the fixture',
    brief: 'Same pair of switches, supply lands at the light instead.',
    task: TaskKind.WIRING, payload: { lessonId: 'three-way-source-at-light' },
    xp: 100,
  },
  {
    id: 'st-hall', ...roomCenter('hall'), room: 'Hallway',
    icon: 'swap-horizontal',
    label: 'Four-way, three locations',
    brief: 'Three switches, one hall light. The four-way goes in the middle.',
    task: TaskKind.WIRING, payload: { lessonId: 'four-way-three-location' },
    xp: 120,
  },
  {
    id: 'st-garage', ...roomCenter('garage'), room: 'Garage / Panel',
    icon: 'build',
    label: 'Service call',
    brief: 'Customer says a light is acting up. Find the fault.',
    task: TaskKind.TROUBLESHOOT, payload: {},
    xp: 80,
  },
  {
    id: 'st-bench', x: 23.5, y: 9.5, room: 'Yard',
    icon: 'git-branch',
    label: 'Bending bench',
    brief: 'The run needs an offset around the beam. Work out the marks.',
    task: TaskKind.BEND, payload: {},
    xp: 40,
  },
  {
    id: 'st-truck', x: 23.5, y: 6.5, room: 'Yard',
    icon: 'camera',
    label: 'Document the job',
    brief: 'Before you leave: photograph the rough-in.',
    task: TaskKind.JOBCAM, payload: {},
    xp: 30,
  },
]);

export const stationById = (id) => STATIONS.find((s) => s.id === id) ?? null;

// ─── Movement ────────────────────────────────────────────────────────────────

/**
 * Move the player, resolving each axis separately against the wall grid.
 * Axis-separate resolution is what lets you slide along a wall instead of
 * sticking to it, which is the difference between "walkable" and "annoying".
 * Returns the new position; never returns a position inside a wall.
 */
export const movePlayer = (grid, pos, dx, dy) => {
  let { x, y } = pos;
  const r = PLAYER_RADIUS;

  if (dx !== 0) {
    const nx = x + dx;
    const edge = nx + Math.sign(dx) * r;
    if (!isWall(grid, Math.floor(edge), Math.floor(y - r)) &&
        !isWall(grid, Math.floor(edge), Math.floor(y + r))) {
      x = nx;
    }
  }
  if (dy !== 0) {
    const ny = y + dy;
    const edge = ny + Math.sign(dy) * r;
    if (!isWall(grid, Math.floor(x - r), Math.floor(edge)) &&
        !isWall(grid, Math.floor(x + r), Math.floor(edge))) {
      y = ny;
    }
  }
  return { x, y };
};

/** The station the player is close enough to start, or null. Nearest wins. */
export const nearestStation = (pos, stations = STATIONS, range = INTERACT_RANGE) => {
  let best = null;
  let bestD = Infinity;
  for (const s of stations) {
    const d = Math.hypot(s.x - pos.x, s.y - pos.y);
    if (d <= range && d < bestD) { best = s; bestD = d; }
  }
  return best;
};

// ─── Progress ────────────────────────────────────────────────────────────────

export const emptyJobsiteProgress = () => ({ completed: [], xp: 0 });

/**
 * Coerce anything loaded from storage into a usable progress object.
 *
 * `JSON.parse` succeeding does not mean the shape is right — a save written by
 * an older build, a truncated write, or a hand-edited value all parse fine and
 * then blow up at `progress.completed.length` on the first render. That is the
 * same class of bug that made builds 6-13 close on launch, so it is handled
 * here rather than trusted.
 */
export const sanitizeProgress = (raw) => {
  if (!raw || typeof raw !== 'object') return emptyJobsiteProgress();
  const known = new Set(STATIONS.map((s) => s.id));
  const completed = Array.isArray(raw.completed)
    ? [...new Set(raw.completed.filter((id) => known.has(id)))]
    : [];
  // XP is recomputed from what was actually completed, so a tampered or stale
  // number can never survive a reload.
  const xp = completed.reduce((sum, id) => sum + (stationById(id)?.xp ?? 0), 0);
  return { completed, xp };
};

/** Idempotent: finishing a station twice does not pay twice. */
export const completeStation = (progress, stationId) => {
  const p = progress ?? emptyJobsiteProgress();
  if (p.completed.includes(stationId)) return p;
  const s = stationById(stationId);
  if (!s) return p;
  return { completed: [...p.completed, stationId], xp: p.xp + s.xp };
};

export const isComplete = (progress, stationId) =>
  !!progress && progress.completed.includes(stationId);

export const jobsitePercent = (progress) => {
  const done = progress?.completed?.length ?? 0;
  return Math.round((done / STATIONS.length) * 100);
};

export { ROOMS };
