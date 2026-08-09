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
