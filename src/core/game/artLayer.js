// ─── ART LAYER ───────────────────────────────────────────────────────────────
// One seam between "what is in the world" and "how it is drawn", so the vector
// art can be replaced with raster sprites a piece at a time without touching a
// line of gameplay.
//
// WHY A SEAM AND NOT A REWRITE. The world today is `react-native-svg` — a few
// hundred rects and circles. That medium has a ceiling: the look people are
// asking for is authored in 3D and baked to sprites, which is how the games it
// is being compared to are actually made. Getting there means new art arriving
// over weeks, one prop at a time, from outside this repo.
//
// The dangerous version of that is a branch that swaps the renderer wholesale
// and lands with collision, pathfinding and save state all touched at once. So
// instead: every drawable is looked up by NAME. A name resolves to a raster
// sprite when the atlas has one and to the existing vector component when it
// does not. Both can be true on the same frame — a slab that is raster next to
// a ladder that is still vector — which is what makes the migration
// incremental rather than a cutover.
//
// WHAT THIS FILE MAY NEVER DO. It never decides where anything is, what is
// solid, what a station wants, or what the camera does. It answers one
// question: given a name, what draws it. If a change here can alter a walk
// path, the seam is in the wrong place.
//
// Pure module: no React, no Image, no require of an asset. The screen holds the
// atlas and this decides what to reach for.

/**
 * Every drawable in the world, by name.
 *
 * This list IS the art order. A name here with no atlas entry and no vector
 * component is a hole, and `missingArt()` reports it rather than letting a prop
 * silently render as nothing.
 */
export const ART = Object.freeze([
  // Ground and structure
  'SlabTile', 'StudWall', 'BarJoist', 'DoorOpening',
  // People
  'Worker',
  // Electrical
  'Panelboard', 'JBox', 'EmtRun',
  // Site material and tools
  'AFrameLadder', 'WireReel', 'GangBox', 'MaterialCart', 'PrintTable',
  'DrywallStack', 'SafetyCone', 'Pallet',
  // Exterior
  'WorkTruck', 'Dumpster', 'SiteTrailer', 'Tree', 'Palm', 'FenceRun',
  // Markers
  'ObjectiveMarker', 'DoneMarker',
]);

/**
 * What each name is, dimensionally. The single source of truth for the art
 * order, the packer, and the renderer at once.
 *
 * `tiles` is the footprint the collision grid in props.js already uses — art
 * that disagrees with it is art drawn over a box the player cannot walk
 * through. `anchor` is where the sprite sits on its tile as a 0-1 fraction:
 * 0.5/0.85 is centred with the base near the bottom, which is right for
 * anything standing up; flat things sit at 0.5/0.5; a marker anchors at its
 * point.
 */
export const ART_SPEC = Object.freeze({
  SlabTile:        { tiles: [1, 1], anchor: [0.5, 0.5] },
  StudWall:        { tiles: [1, 1], anchor: [0.5, 0.5] },
  BarJoist:        { tiles: [1, 1], anchor: [0.5, 0.5] },
  DoorOpening:     { tiles: [1, 1], anchor: [0.5, 0.5] },
  Worker:          { tiles: [1, 1], anchor: [0.5, 0.7] },
  Panelboard:      { tiles: [1, 1], anchor: [0.5, 0.8] },
  JBox:            { tiles: [1, 1], anchor: [0.5, 0.6] },
  EmtRun:          { tiles: [1, 1], anchor: [0.5, 0.5] },
  AFrameLadder:    { tiles: [1, 1], anchor: [0.5, 0.75] },
  WireReel:        { tiles: [1, 1], anchor: [0.5, 0.7] },
  GangBox:         { tiles: [2, 1], anchor: [0.5, 0.8] },
  MaterialCart:    { tiles: [1, 1], anchor: [0.5, 0.75] },
  PrintTable:      { tiles: [1, 1], anchor: [0.5, 0.7] },
  DrywallStack:    { tiles: [1, 1], anchor: [0.5, 0.8] },
  SafetyCone:      { tiles: [1, 1], anchor: [0.5, 0.8] },
  Pallet:          { tiles: [2, 1], anchor: [0.5, 0.6] },
  WorkTruck:       { tiles: [2, 3], anchor: [0.5, 0.6] },
  Dumpster:        { tiles: [2, 2], anchor: [0.5, 0.7] },
  SiteTrailer:     { tiles: [3, 2], anchor: [0.5, 0.7] },
  Tree:            { tiles: [2, 2], anchor: [0.5, 0.7] },
  Palm:            { tiles: [2, 2], anchor: [0.5, 0.7] },
  FenceRun:        { tiles: [1, 1], anchor: [0.5, 0.5] },
  ObjectiveMarker: { tiles: [1, 1], anchor: [0.5, 1.0] },
  DoneMarker:      { tiles: [1, 1], anchor: [0.5, 1.0] },
});

/** The tile is 72 logical px; @3x is the most a phone can actually show. */
export const TILE_PX = 72;
export const ATLAS_SCALE = 3;

export const specFor = (name) => ART_SPEC[name] ?? null;

export const Source = Object.freeze({
  RASTER: 'RASTER',
  VECTOR: 'VECTOR',
  MISSING: 'MISSING',
});

/**
 * The manifest an art pack ships.
 *
 * `{ [name]: { x, y, w, h, anchorX, anchorY, scale } }` in atlas pixels, with
 * the anchor as a 0..1 fraction of the sprite. Anchors matter: a ladder is
 * anchored at its feet and a marker at its point, and getting that wrong makes
 * every prop float or sink by half its height.
 */
export const isValidSprite = (s) => !!s
  && Number.isFinite(s.x) && Number.isFinite(s.y)
  && Number.isFinite(s.w) && s.w > 0
  && Number.isFinite(s.h) && s.h > 0;

const DEFAULT_ANCHOR = Object.freeze({ x: 0.5, y: 0.85 });

/**
 * Normalise one manifest entry.
 *
 * A malformed entry is DROPPED rather than half-used. Half-using it renders a
 * sprite at a wrong size or position, which looks like an art bug and costs a
 * round trip to the artist to disprove.
 */
export const readSprite = (raw) => {
  if (!isValidSprite(raw)) return null;
  const ax = Number.isFinite(raw.anchorX) ? Math.max(0, Math.min(1, raw.anchorX)) : DEFAULT_ANCHOR.x;
  const ay = Number.isFinite(raw.anchorY) ? Math.max(0, Math.min(1, raw.anchorY)) : DEFAULT_ANCHOR.y;
  return Object.freeze({
    x: raw.x, y: raw.y, w: raw.w, h: raw.h,
    anchorX: ax, anchorY: ay,
    // Tiles the sprite covers. 1 means one 72px tile wide.
    scale: Number.isFinite(raw.scale) && raw.scale > 0 ? raw.scale : 1,
  });
};

/**
 * Build a resolver from whatever art exists right now.
 *
 * `atlas` is `{ image, sprites }` or null. `vector` is the map of existing
 * components. Neither is required — with no atlas the world renders exactly as
 * it does today, which is the property that makes this safe to land before any
 * art arrives.
 */
export const artLayer = ({ atlas = null, vector = {} } = {}) => {
  const sprites = {};
  if (atlas && atlas.sprites) {
    for (const name of ART) {
      const s = readSprite(atlas.sprites[name]);
      if (s) sprites[name] = s;
    }
  }

  const resolve = (name) => {
    if (sprites[name]) {
      return Object.freeze({ name, source: Source.RASTER, sprite: sprites[name], image: atlas.image });
    }
    if (vector[name]) {
      return Object.freeze({ name, source: Source.VECTOR, Component: vector[name] });
    }
    return Object.freeze({ name, source: Source.MISSING });
  };

  return Object.freeze({
    resolve,
    hasRaster: (name) => !!sprites[name],
    // What the art pack still owes, and what is already done. Reported rather
    // than discovered on a device.
    coverage: () => {
      const raster = ART.filter((n) => sprites[n]);
      const vectorOnly = ART.filter((n) => !sprites[n] && vector[n]);
      const missing = ART.filter((n) => !sprites[n] && !vector[n]);
      return Object.freeze({
        total: ART.length,
        raster: Object.freeze(raster),
        vectorOnly: Object.freeze(vectorOnly),
        missing: Object.freeze(missing),
        percentRaster: Math.round((raster.length / ART.length) * 100),
        complete: missing.length === 0,
      });
    },
  });
};

/** Names with no art of any kind. A non-empty result is a bug, not a to-do. */
export const missingArt = (vector = {}, atlas = null) =>
  artLayer({ atlas, vector }).coverage().missing;

/**
 * Where a sprite lands on screen, given the tile it occupies.
 *
 * The anchor is applied here and nowhere else, so a prop cannot be nudged into
 * place by a magic number at one call site and left wrong at another.
 */
export const placeSprite = (sprite, { tileX, tileY, tile }) => {
  const w = tile * sprite.scale;
  const h = w * (sprite.h / sprite.w);
  return Object.freeze({
    width: w,
    height: h,
    left: tileX * tile + tile / 2 - w * sprite.anchorX,
    top: tileY * tile + tile / 2 - h * sprite.anchorY,
  });
};

// ─── Tiling ──────────────────────────────────────────────────────────────────

/**
 * The names that REPEAT across the ground, and therefore need breaking up.
 *
 * A floor is a thousand copies of one image. Any feature in that image — a
 * control joint, a dark patch, a crack — lands at the same place in every copy
 * and the eye assembles it into a grid instantly. That grid is the single most
 * common way a good texture makes a bad floor.
 *
 * Directional art is deliberately NOT on this list. A wall run, a conduit run
 * and a fence have an orientation that means something, and mirroring one
 * breaks the run it belongs to.
 */
export const TILED = Object.freeze(['SlabTile']);

export const isTiled = (name) => TILED.includes(name);

/**
 * A stable, well-spread orientation for a tile.
 *
 * Deterministic from the coordinates, so a floor does not reshuffle itself
 * between frames or between visits — a floor that flickers as you walk is
 * worse than a floor with a grid in it. Same discipline as the existing
 * SlabMarks, which derive their scuffs from the tile coords for the same
 * reason.
 */
export const tileVariant = (x, y, { square = true } = {}) => {
  // A cheap integer hash. The multiplies are odd primes so the low bits move
  // when either coordinate changes by one — an obvious `(x + y) % 4` produces
  // diagonal banding, which is a different pattern rather than no pattern.
  let h = (Math.floor(x) * 73856093) ^ (Math.floor(y) * 19349663);
  h = (h ^ (h >>> 13)) >>> 0;
  return h % (square ? 8 : 4);
};

/**
 * The SVG transform for a variant, applied about the sprite's own centre.
 *
 * Variants 0-3 are the mirrors, which are safe for any aspect ratio. Variants
 * 4-7 add quarter turns and are only offered for square sprites, because
 * rotating a non-square one changes the footprint it was placed on.
 *
 * A quarter turn is what actually kills a grid: mirroring a vertical joint
 * moves it from 75% to 25% and still leaves it vertical in every tile. Turning
 * it lays it flat in half of them.
 */
export const variantTransform = (variant, box) => {
  const b = box ?? {};
  const cx = (b.left ?? 0) + (b.width ?? 0) / 2;
  const cy = (b.top ?? 0) + (b.height ?? 0) / 2;
  // The eight symmetries of a square: four quarter turns, and the same four
  // again mirrored. Written as rotation-then-mirror rather than as a hand-built
  // list, because a hand-built list is how two of the eight end up being the
  // same orientation twice and the variety is quietly halved.
  const v = Math.max(0, Math.floor(Number(variant) || 0)) % 8;
  const rotate = (v % 4) * 90;
  const mirror = v >= 4;

  const parts = [`translate(${cx}, ${cy})`];
  if (rotate) parts.push(`rotate(${rotate})`);
  if (mirror) parts.push('scale(-1, 1)');
  parts.push(`translate(${-cx}, ${-cy})`);
  return parts.join(' ');
};

/**
 * Rules the art itself must satisfy. Shipped as data so the brief handed to an
 * artist and the thing the code expects are the same document.
 */
export const ART_RULES = Object.freeze([
  'Top-down, straight overhead. The camera is 90 degrees and is not changing this release.',
  'Transparent PNG, delivered at @2x and @3x against a 72px tile.',
  'Shadows baked in — a soft contact shadow under anything that stands up.',
  'Directional daylight baked in, consistent across every sprite: one sun, one direction.',
  'Real commercial construction proportions. A gang box is not the size of a pallet.',
  'Walls are framing: two thin tracks with individual studs and open cavity between them. '
    + 'A filled rectangle reads as a shipping container and is what made the last pass fail.',
  'A worker reads as a person from above — hard hat, shoulders, vest, boots. Never a circle with a face.',
  'No black. Exterior ground is dirt, grass or asphalt, never a void.',
]);
