// ─── TOP-DOWN CAMERA ─────────────────────────────────────────────────────────
// Straight overhead. Screen up IS world up.
//
// This replaces the isometric projection for one reason that outweighs the
// extra depth iso bought: with a diagonal projection, pushing the stick up
// walks the player diagonally across the floor, and no amount of art fixes a
// control scheme that argues with the camera.
//
// Depth now comes from drop shadows, wall thickness and lighting rather than
// from the projection — which is how most top-down mobile games do it anyway.
//
// Pure module: no React.

/** Pixels per world tile. Large on purpose — the player must read as a person. */
export const TILE = 72;

/** How much of the site is visible. Smaller = closer in. */
export const ZOOM = 1;

/** World → screen, before the camera translate. */
export const toScreen = (x, y, scale = ZOOM) => ({ x: x * TILE * scale, y: y * TILE * scale });

/**
 * Camera that follows the player.
 *
 * The player sits slightly BELOW centre (0.56 of the viewport height) because
 * you walk forward more than backward, and giving the top of the screen more
 * room means you see where you are going rather than where you have been.
 *
 * `margin` is how much exterior is visible past the building footprint. It is
 * deliberately generous: the old camera clamped hard at the map edge, which is
 * what produced the black void — there was nothing beyond the last tile.
 */
export const followCamera = (focus, mapW, mapH, viewW, viewH, { scale = ZOOM, margin = 6, lead = 0.56 } = {}) => {
  const p = toScreen(focus.x, focus.y, scale);
  const worldW = mapW * TILE * scale;
  const worldH = mapH * TILE * scale;
  const m = margin * TILE * scale;

  let tx = viewW / 2 - p.x;
  let ty = viewH * lead - p.y;

  // Clamp against the world PLUS its exterior apron, so the edge of the
  // building is never the edge of the world.
  const minTx = viewW - (worldW + m);
  const maxTx = m;
  const minTy = viewH - (worldH + m);
  const maxTy = m;

  tx = worldW + m * 2 <= viewW ? (viewW - worldW) / 2 : Math.min(maxTx, Math.max(minTx, tx));
  ty = worldH + m * 2 <= viewH ? (viewH - worldH) / 2 : Math.min(maxTy, Math.max(minTy, ty));

  return { tx, ty, scale };
};

/** Is this tile worth drawing? Culling is what keeps a big map smooth. */
export const tileVisible = (x, y, cam, viewW, viewH, pad = 2) => {
  const s = TILE * cam.scale;
  const sx = x * s + cam.tx;
  const sy = y * s + cam.ty;
  return sx > -s * pad && sx < viewW + s * pad && sy > -s * pad && sy < viewH + s * pad;
};

/**
 * Stick → world movement, top-down. This is the whole point of the rewrite:
 * screen up is world up, one to one, no conversion. Up on the stick moves the
 * player toward the top of the screen.
 */
export const stickToWorld = (sx, sy) => ({ x: sx, y: sy });

/** Four-way facing from a movement vector — which sprite to draw. */
export const facing4 = (dx, dy) => {
  if (!dx && !dy) return null;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
};

/**
 * Joystick reading. Dead zone stops a resting thumb creeping; the magnitude
 * is rescaled past the dead zone so the slow end of the range is still usable.
 */
export const readStick = (dx, dy, radius, deadZone = 0.16) => {
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { x: 0, y: 0, magnitude: 0 };
  const mag = Math.min(len, radius) / radius;
  if (mag < deadZone) return { x: 0, y: 0, magnitude: 0 };
  const scaled = (mag - deadZone) / (1 - deadZone);
  return { x: (dx / len) * scaled, y: (dy / len) * scaled, magnitude: scaled };
};

/**
 * Where the knob is drawn: clamped to the base, following the finger.
 */
export const knobOffset = (dx, dy, radius) => {
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { x: 0, y: 0 };
  const c = Math.min(len, radius);
  return { x: (dx / len) * c, y: (dy / len) * c };
};

/**
 * A floating stick: the base appears wherever the thumb first lands inside the
 * control zone, rather than at a fixed spot the thumb has to hunt for.
 * Returns null when the touch is outside the zone, so the caller can ignore it.
 */
/**
 * Where the floating stick's base lands.
 *
 * CLAMPED, and that is the fix rather than a refinement. Returning the raw
 * touch point put the base wherever the thumb happened to land — including
 * three quarters of the way down the screen and an inch from the edge, which
 * is exactly where a thumb lands when you are holding a phone one-handed. The
 * base was then drawn half off-screen and the knob ran out of travel before it
 * ran out of deflection, so pushing down or outward stopped registering and
 * the swipe went off the edge.
 *
 * `margin` is the stick's own radius plus its travel. Keeping the whole base
 * inside the viewport means every direction has the same throw, which is the
 * difference between a stick that works one-handed and one you have to
 * re-grip for.
 */
export const floatingOrigin = (touchX, touchY, viewW, viewH, {
  side = 'left', zone = 0.5, margin = 74, bottomInset = 96,
} = {}) => {
  const inX = side === 'left' ? touchX < viewW * zone : touchX > viewW * (1 - zone);
  const inY = touchY > viewH * 0.45;
  if (!inX || !inY) return null;

  const clamp = (v, lo, hi) => (hi < lo ? (lo + hi) / 2 : Math.min(Math.max(v, lo), hi));
  return {
    x: clamp(touchX, margin, viewW - margin),
    // bottomInset keeps the base clear of the home indicator and the dock, so
    // pulling the knob down does not hand the gesture to the system.
    y: clamp(touchY, viewH * 0.45, viewH - bottomInset - margin),
  };
};
