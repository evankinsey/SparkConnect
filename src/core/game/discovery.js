// ─── DISCOVERY ───────────────────────────────────────────────────────────────
// A room you have not walked into yet does not show you what is in it.
//
// THE PROBLEM THIS SOLVES. A phone is roughly 1:2.2 and a room here is 1.25:1,
// so the viewport is about one room wide and nearly three rooms tall. No zoom
// setting wins that: tighten it enough to frame one room vertically and you are
// down to 3.4 tiles across, which is narrower than the room you are standing
// in. The building will always be visible past the room you occupy.
//
// So the fix is not the camera, it is what a not-yet-visited room RENDERS as.
//
// WHAT STAYS VISIBLE, AND WHY. The framing does. On a real job you walk in with
// the prints — you know where the walls are before you have been anywhere, and
// hiding them would be a puzzle-game conceit rather than a jobsite one. What
// you genuinely do not know is what is waiting in each room: which stations,
// whose crew, what material is stacked where. That is what stays dark.
//
// Pure module: no React, no storage. The screen renders what this decides.

/** Rooms are discovered by standing in them, so a room needs its own bounds. */
export const inRoom = (room, x, y) => !!room
  && x >= room.x - 0.5 && x < room.x + room.w + 0.5
  && y >= room.y - 0.5 && y < room.y + room.h + 0.5;

export const roomAt = (rooms, x, y) => (rooms ?? []).find((r) => inRoom(r, x, y)) ?? null;

/**
 * What the player can currently see of a room.
 *
 * SHELL is the interesting state: the walls are drawn, the contents are not.
 * A binary seen/unseen would either hide the building or give the room away.
 */
export const Visibility = Object.freeze({
  SEEN: 'SEEN',     // walked into it — everything renders
  SHELL: 'SHELL',   // on the prints, never entered — framing only
});

export const emptyDiscovery = () => Object.freeze([]);

/**
 * Coerce whatever came out of storage into a list of real room ids.
 *
 * Same discipline as sanitizeProgress: a save from an older build, a truncated
 * write or a hand-edited value all parse fine and then break a render. An
 * unknown id is dropped rather than trusted.
 */
export const sanitizeDiscovered = (raw, rooms = []) => {
  const known = new Set(rooms.map((r) => r.id));
  if (!Array.isArray(raw)) return emptyDiscovery();
  return Object.freeze([...new Set(raw.filter((id) => known.has(id)))]);
};

/** Idempotent. Returns the SAME array when nothing changed, so React can skip. */
export const discover = (discovered, roomId) => {
  const list = Array.isArray(discovered) ? discovered : [];
  if (!roomId || list.includes(roomId)) return list;
  return Object.freeze([...list, roomId]);
};

/** Reveal whatever room the player is standing in. */
export const discoverAt = (discovered, rooms, x, y) => {
  const r = roomAt(rooms, x, y);
  return r ? discover(discovered, r.id) : (discovered ?? emptyDiscovery());
};

export const isDiscovered = (discovered, roomId) =>
  Array.isArray(discovered) && discovered.includes(roomId);

export const visibilityOf = (discovered, roomId) =>
  (isDiscovered(discovered, roomId) ? Visibility.SEEN : Visibility.SHELL);

/**
 * Should a thing at this position be drawn?
 *
 * Anything OUTSIDE every room is always drawn — the yard, the fence, the
 * exterior props, the corridors between rooms. Hiding those would leave the
 * player standing in a void between rooms, which is the opposite of the
 * feeling being built. Only room CONTENTS are held back.
 */
export const showsContents = (discovered, rooms, x, y) => {
  const r = roomAt(rooms, x, y);
  return !r || isDiscovered(discovered, r.id);
};

/** How dark an unentered room reads. Not black — the framing has to stay legible. */
export const SHELL_SHADE = 0.62;

export const shadeFor = (discovered, roomId) =>
  (isDiscovered(discovered, roomId) ? 0 : SHELL_SHADE);

/**
 * Progress through the building, as a number worth showing.
 *
 * Rooms explored is a different axis from stations completed — you can have
 * walked the whole job and finished none of it — and it is the one that says
 * "there is more building over there".
 */
export const explored = (discovered, rooms = []) => {
  const total = rooms.length;
  const seen = (discovered ?? []).length;
  return Object.freeze({
    seen,
    total,
    percent: total === 0 ? 100 : Math.round((seen / total) * 100),
    complete: seen >= total,
    remaining: Object.freeze(rooms.filter((r) => !isDiscovered(discovered, r.id)).map((r) => r.id)),
  });
};
