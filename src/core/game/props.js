// ─── WHAT ELSE IS ON THE SITE ────────────────────────────────────────────────
// Ladders, pallets, gang boxes, conduit bundles, a lift and temp power.
//
// The site reads as a floor plan with six rooms and nothing in it, and a real
// one never looks like that. You step over conduit, you go round a pallet, the
// lift is parked where somebody left it, and the temp power pole is the first
// thing on site and the last thing off.
//
// THE CONSTRAINT THAT MAKES THIS SAFE TO ADD: the world already guarantees
// every station is reachable from spawn, and tests/jobsite.test.js proves it
// with a flood fill. Dropping solid objects into that world can quietly break
// the guarantee — and it breaks it for one player on one route, which is
// exactly the kind of bug that ships. So:
//
//   · solid props are placed only in the two-tile-tall yard, never in a
//     one-tile corridor where a single crate severs the map
//   · nothing may sit on a door landing, a station, or spawn
//   · buildSiteMap() is what collision uses, and the same flood fill runs
//     against it
//
// A test asserts all four. The placement is hand-chosen and machine-checked,
// which is the right way round: a human decides where a pallet looks right, and
// the machine decides whether it made the site unwalkable.
//
// Pure module: no React, no rendering. Positions and footprints only — what a
// ladder looks like is the screen's business.

import { Tile, MAP_W, MAP_H, buildMap, isWall, SPAWN, STATIONS } from './jobsite.js';

export const PropKind = Object.freeze({
  LADDER: 'LADDER',
  PALLET: 'PALLET',
  GANG_BOX: 'GANG_BOX',
  CONDUIT: 'CONDUIT',
  LIFT: 'LIFT',
  TEMP_POWER: 'TEMP_POWER',
  SPOOL: 'SPOOL',
  SAWHORSE: 'SAWHORSE',
  DEBRIS: 'DEBRIS',
});

/**
 * The site, as placed.
 *
 * `solid` props take tiles out of the walkable grid. Everything else is
 * something you walk over or past — clutter you notice rather than clutter you
 * navigate, which is most of it.
 *
 * `look` is one true sentence about the object. Deliberately descriptive: this
 * is set dressing, and set dressing that starts stating requirements is
 * narrative content asserting electrical facts, which the app forbids
 * everywhere else and forbids here too.
 */
export const PROPS = Object.freeze([
  // ── The yard. Two tiles tall, so a solid object still leaves a way past. ──
  {
    id: 'p-ladder-yard', kind: PropKind.LADDER, x: 3, y: 7, w: 1, h: 1, solid: true,
    label: 'Extension ladder',
    look: 'Laid flat against the wall. Somebody was in the ceiling this morning.',
  },
  {
    id: 'p-pallet', kind: PropKind.PALLET, x: 6, y: 7, w: 2, h: 1, solid: true,
    label: 'Pallet of fixtures',
    look: 'Still shrink-wrapped, still on the pallet, still in the way.',
  },
  {
    id: 'p-conduit-bundle', kind: PropKind.CONDUIT, x: 14, y: 7, w: 2, h: 1, solid: true,
    label: 'Bundle of conduit',
    look: 'Strapped in a bundle by the wall, waiting to be cut and threaded.',
  },
  {
    id: 'p-lift', kind: PropKind.LIFT, x: 17, y: 7, w: 2, h: 1, solid: true,
    label: 'Scissor lift',
    look: 'Parked and plugged in overnight. Nobody moves it without the key.',
  },
  {
    id: 'p-gangbox', kind: PropKind.GANG_BOX, x: 21, y: 7, w: 2, h: 1, solid: true,
    label: 'Gang box',
    look: 'Padlocked. The tools that walk off are the ones left out of it.',
  },

  // ── Along the top of the yard: the things that arrive first. ──
  {
    id: 'p-temp-power', kind: PropKind.TEMP_POWER, x: 1, y: 1, w: 1, h: 1, solid: false,
    label: 'Temporary power',
    look: 'The pole that goes up before anything else and comes down last.',
  },
  {
    id: 'p-spools', kind: PropKind.SPOOL, x: 22, y: 1, w: 2, h: 1, solid: false,
    label: 'Wire spools',
    look: 'Three spools on a rack, two of them nearly empty.',
  },

  // ── Inside the rooms: clutter you step over, never round. ──
  {
    id: 'p-sawhorse-living', kind: PropKind.SAWHORSE, x: 14, y: 4, w: 1, h: 1, solid: false,
    label: 'Sawhorses',
    look: 'A door blank across two horses. The site desk.',
  },
  {
    id: 'p-debris-kitchen', kind: PropKind.DEBRIS, x: 6, y: 4, w: 1, h: 1, solid: false,
    label: 'Offcuts and packaging',
    look: 'Cable offcuts, staples and torn packaging. Somebody has to sweep it.',
  },
  {
    id: 'p-ladder-garage', kind: PropKind.LADDER, x: 7, y: 10, w: 1, h: 1, solid: false,
    label: 'Step ladder',
    look: 'Open in front of the panel, which is where it lives.',
  },
  {
    id: 'p-debris-hall', kind: PropKind.DEBRIS, x: 20, y: 10, w: 1, h: 1, solid: false,
    label: 'Drywall stack',
    look: 'Leaning against the wall, covering the boxes behind it.',
  },
]);

export const propById = (id) => PROPS.find((p) => p.id === id) ?? null;

/** Every tile a prop occupies. */
export const tilesOf = (prop) => {
  const out = [];
  for (let dy = 0; dy < prop.h; dy++) {
    for (let dx = 0; dx < prop.w; dx++) out.push({ x: prop.x + dx, y: prop.y + dy });
  }
  return out;
};

export const solidProps = () => PROPS.filter((p) => p.solid);

/**
 * The grid collision should actually use.
 *
 * Separate from `buildMap()` on purpose: the room geometry is a fixed thing
 * that tests reason about, and clutter is a layer over it. Keeping them apart
 * means a prop can be moved without touching what "the building" means.
 */
export const buildSiteMap = () => {
  const grid = buildMap().map((row) => [...row]);
  for (const p of solidProps()) {
    for (const { x, y } of tilesOf(p)) {
      if (y >= 0 && y < MAP_H && x >= 0 && x < MAP_W) grid[y][x] = Tile.WALL;
    }
  }
  return grid;
};

/** The prop the player is standing on or beside, for a "what is this" line. */
export const propAt = (x, y) => {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  return PROPS.find((p) => tilesOf(p).some((t) => t.x === tx && t.y === ty)) ?? null;
};

/**
 * Every tile that must stay walkable whatever gets placed.
 *
 * Doors are the ones worth spelling out: a room's only opening is a single
 * carved tile, and the tile OUTSIDE it is the landing. Block either and the
 * room is sealed with the station inside it.
 */
export const protectedTiles = () => {
  const out = new Set();
  const add = (x, y) => out.add(`${x},${y}`);

  add(Math.floor(SPAWN.x), Math.floor(SPAWN.y));
  for (const s of STATIONS) {
    add(Math.floor(s.x), Math.floor(s.y));
    // The tile you stand on to reach it.
    add(Math.floor(s.x), Math.floor(s.y) + 1);
  }

  // Every door opening in the room walls, plus its landing on the yard side.
  const base = buildMap();
  for (let y = 1; y < MAP_H - 1; y++) {
    for (let x = 1; x < MAP_W - 1; x++) {
      if (base[y][x] !== Tile.FLOOR) continue;
      // A floor tile with wall to its left and right, inside the wall band, is
      // a carved door.
      if (base[y][x - 1] === Tile.WALL && base[y][x + 1] === Tile.WALL) {
        add(x, y);
        add(x, y + 1);
        add(x, y - 1);
      }
    }
  }
  return out;
};

/** Flood fill over a grid, from spawn. Used by the reachability test. */
export const reachableFrom = (grid, start = SPAWN) => {
  const seen = new Set();
  const key = (x, y) => `${x},${y}`;
  const stack = [{ x: Math.floor(start.x), y: Math.floor(start.y) }];
  while (stack.length) {
    const { x, y } = stack.pop();
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue;
    if (seen.has(key(x, y))) continue;
    if (isWall(grid, x, y)) continue;
    seen.add(key(x, y));
    stack.push({ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 });
  }
  return seen;
};
