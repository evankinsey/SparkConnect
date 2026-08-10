// ─── THE YARD ────────────────────────────────────────────────────────────────
// What the ground outside the building is, and why it is that.
//
// This started life inside the screen, which was the wrong place twice over:
// it could not be tested without a renderer, and being untestable is how it
// shipped with the work truck, the site trailer and the dumpster all parked on
// a lawn. Ground cover is world layout — the same category as the collision
// grid and the prop placements — so it lives with them.
//
// THE MODEL. A commercial site inside its fence is a laydown yard: it is where
// the truck backs in, where the material drops, where the dumpster sits, and a
// site that size is compacted to dirt within a week. Grass belongs OUTSIDE the
// fence, where nothing drives. Grading the ground by distance to the BUILDING
// instead — which is the obvious thing to write — puts lawn exactly where the
// vehicles are, because the vehicles are parked away from the building.
//
// Pure module: no React, no rendering.

/**
 * The temporary fence, as world data.
 *
 * The screen draws these and the ground is graded from them, so the fence and
 * the dirt cannot disagree. Moving a run moves the ground with it.
 */
export const FENCE = Object.freeze([
  Object.freeze({ dir: 'H', x: -5, y: -2.2, len: 10 }),
  Object.freeze({ dir: 'H', x: 6, y: -2.2, len: 10 }),
  Object.freeze({ dir: 'H', x: 17, y: -2.2, len: 12 }),
  Object.freeze({ dir: 'H', x: -5, y: 15.4, len: 34 }),
  Object.freeze({ dir: 'V', x: -5.2, y: -2, len: 17 }),
  Object.freeze({ dir: 'V', x: 29.4, y: -2, len: 17 }),
]);

/** The enclosed yard, derived from the fence rather than typed a second time. */
export const YARD = Object.freeze({
  x0: Math.min(...FENCE.map((f) => f.x)) - 0.5,
  x1: Math.max(...FENCE.map((f) => (f.dir === 'H' ? f.x + f.len : f.x))) + 0.5,
  y0: Math.min(...FENCE.map((f) => f.y)) - 0.5,
  y1: Math.max(...FENCE.map((f) => (f.dir === 'V' ? f.y + f.len : f.y))) + 0.5,
});

/**
 * Deterministic noise from a tile's own coordinates.
 *
 * Ground that reshuffles its own grass as you walk past is worse than ground
 * with a pattern in it, so nothing outdoors is allowed to use Math.random.
 */
export const groundNoise = (x, y, salt = 0) => {
  let h = ((Math.round(x) + 1013) * 73856093)
    ^ ((Math.round(y) + 2477) * 19349663)
    ^ ((salt + 11) * 83492791);
  h = (h ^ (h >>> 13)) >>> 0;
  return h / 4294967295;
};

export const Cover = Object.freeze({
  YARD: 'YARD',     // compacted dirt and gravel — inside the fence
  VERGE: 'VERGE',   // scruffy, half-driven — just outside it
  GRASS: 'GRASS',   // undeveloped
});

/**
 * How travelled a patch of ground is, 0 (turf) to 1 (bare).
 *
 * The jitter is what stops the bands rendering as concentric rectangles: axis
 * distance to a rectangular yard is itself rectangular, and a hard step around
 * the whole site reads as a diagram of a site rather than a site.
 */
export const wearAt = (x, y, { mapW = 26, mapH = 14 } = {}) => {
  const outside = Math.max(YARD.x0 - x, x - YARD.x1, YARD.y0 - y, y - YARD.y1);
  const jitter = (groundNoise(x, y, 5) - 0.5) * 1.6;

  if (outside + jitter > 0) {
    // A verge for the first couple of tiles, then undeveloped ground. Dirt
    // meeting lawn at a hard line is the fence drawn a second time.
    return Math.max(0.02, 0.62 - (outside + jitter) * 0.3);
  }

  // Inside: worn everywhere, most worn against the walls where the crew and
  // the material actually go in and out.
  const dx = x < 0 ? -x : x > mapW - 1 ? x - (mapW - 1) : 0;
  const dy = y < 0 ? -y : y > mapH - 1 ? y - (mapH - 1) : 0;
  const toBuilding = Math.hypot(dx, dy) + jitter;
  return toBuilding <= 1.2 ? 0.95 : Math.max(0.7, 0.95 - (toBuilding - 1.2) * 0.05);
};

export const coverAt = (x, y, opts) => {
  const w = wearAt(x, y, opts);
  return w > 0.66 ? Cover.YARD : w > 0.33 ? Cover.VERGE : Cover.GRASS;
};

/**
 * Is this tile on the poured pad?
 *
 * THE BUG THIS EXISTS TO KILL. The screen decided this with "is it inside one
 * of the six ROOMS", which is not the same question and is wrong everywhere the
 * two differ. The map is a walled envelope — perimeter studs on all four sides
 * — so everything between the rooms is CORRIDOR, inside the building, standing
 * on the same slab. Grading it as "not a room" sent it down the outdoor branch,
 * which draws turf with grass tufts. The result was a commercial shell with a
 * lawn growing down the middle of it, and it was most of the floor you actually
 * walk on, because the corridors are where you walk.
 *
 * The pad is the map footprint. Outside it is the apron ring, which is graded
 * by `wearAt` and is genuinely ground. There is no third case: every exterior
 * prop on this level — trucks, trailer, dumpster, trees — is placed beyond the
 * footprint precisely because inside it is a building.
 */
export const onSlab = (x, y, { mapW = 26, mapH = 14 } = {}) =>
  x >= 0 && y >= 0 && x < mapW && y < mapH;
