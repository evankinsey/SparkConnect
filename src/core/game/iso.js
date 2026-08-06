// ─── ISOMETRIC PROJECTION ────────────────────────────────────────────────────
// The maths that turns the flat tile grid into a space you appear to walk
// through. Pure and tested, because two things here are correctness problems
// rather than taste problems:
//
//   1. DEPTH ORDER. In an isometric scene there is no z-buffer — things look
//      solid only because they are painted back to front. Get the order wrong
//      and the player renders on top of the wall he is standing behind, which
//      instantly reads as broken.
//
//   2. THE CAMERA. It follows the player and clamps at the edges of the site.
//      A camera that drifts past the map shows empty space and makes the world
//      feel like a texture rather than a building.
//
// The grid, collision and pathfinding are unchanged — this module only decides
// where a world coordinate lands on screen and in what order it is drawn.

/** Half-width and half-height of one tile's diamond, in px, at scale 1. */
export const TILE_W = 64;
export const TILE_H = 32;
/** How tall one "storey" of wall stands, in px. Studs are drawn to this. */
export const WALL_H = 58;

/**
 * World (tile) coordinates → screen. Classic 2:1 isometric.
 * `z` lifts a point off the floor without changing its footprint, which is how
 * a wall gets height and a prop sits on the ground rather than floating.
 */
export const toIso = (x, y, z = 0, scale = 1) => ({
  x: (x - y) * (TILE_W / 2) * scale,
  y: (x + y) * (TILE_H / 2) * scale - z * scale,
});

/**
 * The painter's-algorithm key. Larger draws later, i.e. nearer the viewer.
 *
 * x + y is the diagonal distance from the back corner, which is the correct
 * primary sort for a 2:1 isometric grid. `layer` breaks ties for things
 * occupying the same tile — floor 0, props 1, walls 2, actors 3 — so an actor
 * standing on a floor tile is never painted under it.
 */
export const depthKey = (x, y, layer = 0) => (x + y) * 10 + layer;

export const Layer = { FLOOR: 0, DECAL: 1, PROP: 2, WALL: 3, ACTOR: 4, OVERHEAD: 5 };

/**
 * Sort draw items back to front. Stable within a depth so equal items keep
 * their declared order, which matters for a prop drawn as several pieces.
 */
export const sortByDepth = (items) =>
  items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => (a.it.depth - b.it.depth) || (a.i - b.i))
    .map(({ it }) => it);

/**
 * Camera offset that centres `focus` in a viewport, clamped so the site never
 * floats. Returns the translate to apply to the whole scene.
 *
 * The bounds are computed from the projected corners of the map, not from the
 * tile counts, because an isometric map is a diamond and its screen bounding
 * box is wider than it is tall.
 */
export const isoCamera = (focus, mapW, mapH, viewW, viewH, scale = 1) => {
  const f = toIso(focus.x, focus.y, 0, scale);

  // Projected extent of the whole diamond.
  const corners = [toIso(0, 0, 0, scale), toIso(mapW, 0, 0, scale), toIso(0, mapH, 0, scale), toIso(mapW, mapH, 0, scale)];
  const minX = Math.min(...corners.map((c) => c.x)) - TILE_W * scale;
  const maxX = Math.max(...corners.map((c) => c.x)) + TILE_W * scale;
  const minY = Math.min(...corners.map((c) => c.y)) - WALL_H * scale;
  const maxY = Math.max(...corners.map((c) => c.y)) + TILE_H * scale;

  let tx = viewW / 2 - f.x;
  let ty = viewH / 2 - f.y;

  const worldW = maxX - minX;
  const worldH = maxY - minY;
  // When the site is smaller than the viewport on an axis, centre it instead
  // of clamping — clamping a small map pins it to a corner.
  if (worldW <= viewW) tx = viewW / 2 - (minX + maxX) / 2;
  else tx = Math.min(-minX, Math.max(viewW - maxX, tx));
  if (worldH <= viewH) ty = viewH / 2 - (minY + maxY) / 2;
  else ty = Math.min(-minY, Math.max(viewH - maxY, ty));

  return { tx, ty, scale };
};

/**
 * Is this tile within the drawn window? An isometric site is mostly off-screen
 * at any moment, and drawing every tile of it as SVG nodes is the difference
 * between a smooth walk and a slideshow.
 */
export const inView = (x, y, cam, viewW, viewH, pad = 3) => {
  const p = toIso(x, y, 0, cam.scale);
  const sx = p.x + cam.tx;
  const sy = p.y + cam.ty;
  const padX = TILE_W * cam.scale * pad;
  const padY = (TILE_H + WALL_H) * cam.scale * pad;
  return sx > -padX && sx < viewW + padX && sy > -padY && sy < viewH + padY;
};

/** The four screen-space corners of one floor tile's diamond. */
export const tileDiamond = (x, y, scale = 1) => {
  const c = toIso(x, y, 0, scale);
  const hw = (TILE_W / 2) * scale;
  const hh = (TILE_H / 2) * scale;
  return [
    { x: c.x, y: c.y - hh },
    { x: c.x + hw, y: c.y },
    { x: c.x, y: c.y + hh },
    { x: c.x - hw, y: c.y },
  ];
};

export const diamondPath = (x, y, scale = 1) => {
  const p = tileDiamond(x, y, scale);
  return `M ${p[0].x} ${p[0].y} L ${p[1].x} ${p[1].y} L ${p[2].x} ${p[2].y} L ${p[3].x} ${p[3].y} Z`;
};

/**
 * Which way the player is facing, from a movement vector. Isometric screen-up
 * is world north-west, so the eight compass directions map onto the diamond
 * rather than onto the screen axes — without this the character faces the
 * wrong way every time you walk "up".
 */
export const facingFrom = (dx, dy) => {
  if (!dx && !dy) return null;
  const ang = Math.atan2(dy, dx) * (180 / Math.PI);
  if (ang >= -22.5 && ang < 22.5) return 'E';
  if (ang >= 22.5 && ang < 67.5) return 'SE';
  if (ang >= 67.5 && ang < 112.5) return 'S';
  if (ang >= 112.5 && ang < 157.5) return 'SW';
  if (ang >= 157.5 || ang < -157.5) return 'W';
  if (ang >= -157.5 && ang < -112.5) return 'NW';
  if (ang >= -112.5 && ang < -67.5) return 'N';
  return 'NE';
};

/**
 * Joystick vector from a drag. Returns a unit-ish vector with a dead zone, so
 * resting a thumb on the stick does not creep, and a magnitude the caller can
 * use for walk speed.
 *
 * The old four-button pad positioned its up and down arrows with only a `top`
 * or `bottom` value, which in React Native leaves `left` at 0 — both vertical
 * arrows sat in the left corner, overlapping the left arrow. That is why
 * vertical movement "did not work": the buttons were not where they looked.
 */
export const joystickVector = (dx, dy, radius, deadZone = 0.18) => {
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { x: 0, y: 0, magnitude: 0 };
  const clamped = Math.min(len, radius);
  const mag = clamped / radius;
  if (mag < deadZone) return { x: 0, y: 0, magnitude: 0 };
  // Rescale so the dead zone does not eat the low end of the range.
  const scaled = (mag - deadZone) / (1 - deadZone);
  return { x: (dx / len) * scaled, y: (dy / len) * scaled, magnitude: scaled };
};

/**
 * Screen-space drag → world movement. Screen right is world +x−y, screen down
 * is world +x+y; without this conversion the stick moves the player diagonally
 * relative to the floor and the whole thing feels drunk.
 */
export const screenToWorldVector = (sx, sy) => {
  const wx = (sy / (TILE_H / 2) + sx / (TILE_W / 2)) / 2;
  const wy = (sy / (TILE_H / 2) - sx / (TILE_W / 2)) / 2;
  const len = Math.hypot(wx, wy);
  if (len < 1e-6) return { x: 0, y: 0 };
  return { x: wx / len, y: wy / len };
};
