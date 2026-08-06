// ─── WIRE ROUTING ────────────────────────────────────────────────────────────
// Where a conductor is DRAWN, as distinct from where it lands.
//
// This exists because of a real field report. Someone looked at a correctly
// wired single-pole circuit and reported three faults that were not there. The
// netlist was right; the picture was wrong. The switched leg was drawn as one
// bezier from the switch to the luminaire, and that curve passed straight over
// the neutral splice box on its way — so the wire appeared to land in the
// splice. A reviewer with electrical knowledge misread it. An apprentice has no
// chance.
//
// On this screen, routing is a correctness feature. A drawing that cannot be
// traced is not a diagram, it is decoration.
//
// Two rules produce readable wire:
//
//   1. NEVER cross a component body. Conductors travel in the corridors
//      between rows and approach every terminal from below, which is the one
//      direction that is always clear — terminals sit on the bottom edge.
//   2. Parallel runs get their own lane. Two conductors sharing a corridor at
//      the same depth are indistinguishable, and "indistinguishable" is how the
//      original misreading happened.
//
// Pure module: no React, no SVG. Returns geometry; the canvas draws it.

/** Vertical space reserved under each row for conductors.
 *  MUST match CORRIDOR in CircuitCanvas.layoutComponents — a test pins them
 *  together, because a lane wider than the gap draws into the next row. */
export const CORRIDOR = 46;
/** Gap between adjacent lanes within a corridor. */
export const LANE_GAP = 7;
/** How far a lane may sink before it would collide with the next row. */
export const MAX_LANES = 5;
/** Corner rounding. Big enough to read as a wire, small enough to stay square. */
export const RADIUS = 6;

/**
 * Rows, derived from the boxes. Components laid out on the same y are one row,
 * and each row owns the corridor beneath it.
 */
export const rowsFrom = (boxes) => {
  const byTop = new Map();
  for (const b of Object.values(boxes)) {
    const key = Math.round(b.y);
    if (!byTop.has(key)) byTop.set(key, { top: b.y, bottom: b.y + b.h, boxes: [] });
    const row = byTop.get(key);
    row.bottom = Math.max(row.bottom, b.y + b.h);
    row.boxes.push(b);
    byTop.set(key, row);
  }
  return [...byTop.values()].sort((a, b) => a.top - b.top);
};

/** Which row does this point sit in? */
export const rowIndexFor = (rows, y) => {
  for (let i = 0; i < rows.length; i++) {
    if (y >= rows[i].top - 1 && y <= rows[i].bottom + 1) return i;
  }
  // Below every row: belongs to the last corridor.
  return rows.length - 1;
};

/** The y of a lane inside the corridor under `rowIndex`. */
export const laneY = (rows, rowIndex, lane = 0) => {
  const row = rows[Math.max(0, Math.min(rowIndex, rows.length - 1))];
  if (!row) return 0;
  return row.bottom + 10 + (lane % MAX_LANES) * LANE_GAP;
};

const overlapsBox = (box, x1, y1, x2, y2) => {
  const minX = Math.min(x1, x2); const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2); const maxY = Math.max(y1, y2);
  return maxX > box.x && minX < box.x + box.w && maxY > box.y && minY < box.y + box.h;
};

/** Does this polyline cross any component body? The invariant, as a function. */
export const crossesAnyBox = (points, boxes, { ignore = [] } = {}) => {
  const list = Object.entries(boxes)
    .filter(([id]) => !ignore.includes(id))
    .map(([, b]) => b);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]; const b = points[i + 1];
    for (const box of list) {
      if (overlapsBox(box, a.x, a.y, b.x, b.y)) return true;
    }
  }
  return false;
};

/**
 * Find a clear vertical channel to move between corridors.
 *
 * Prefers a gap between boxes near `preferX`, then the margins. A conductor
 * changing rows has to get past a row of devices, and the only honest way is to
 * go around them rather than through.
 */
export const verticalChannel = (rows, fromRow, toRow, preferX, width) => {
  const lo = Math.min(fromRow, toRow);
  const hi = Math.max(fromRow, toRow);

  // Every box the descent would have to pass, i.e. rows strictly between the
  // two corridors, plus the destination row itself.
  const blocking = [];
  for (let i = lo + 1; i <= hi; i++) if (rows[i]) blocking.push(...rows[i].boxes);

  const clearAt = (x) => !blocking.some((b) => x > b.x - 4 && x < b.x + b.w + 4);

  if (clearAt(preferX)) return preferX;

  // Gaps between boxes, nearest to preferX first.
  const spans = blocking.map((b) => [b.x, b.x + b.w]).sort((a, b) => a[0] - b[0]);
  const candidates = [];
  for (let i = 0; i < spans.length - 1; i++) {
    const gapMid = (spans[i][1] + spans[i + 1][0]) / 2;
    if (clearAt(gapMid)) candidates.push(gapMid);
  }
  // Margins, which are clear by construction unless a box starts at x=0.
  const leftMargin = 4;
  const rightMargin = Math.max(width - 4, 4);
  if (clearAt(leftMargin)) candidates.push(leftMargin);
  if (clearAt(rightMargin)) candidates.push(rightMargin);

  if (candidates.length === 0) return preferX;   // nothing is clear; least-bad
  return candidates.sort((a, b) => Math.abs(a - preferX) - Math.abs(b - preferX))[0];
};

/**
 * Route one conductor.
 *
 * Returns the polyline. Same-row runs drop into the shared corridor and come
 * straight back up. Cross-row runs travel their own corridor, change rows in a
 * clear channel, then approach the destination from below.
 */
export const routeWire = (from, to, { boxes = {}, rows = null, lane = 0, width = 360 } = {}) => {
  const r = rows ?? rowsFrom(boxes);
  if (r.length === 0) return [{ x: from.x, y: from.y }, { x: to.x, y: to.y }];

  const fromRow = rowIndexFor(r, from.y);
  const toRow = rowIndexFor(r, to.y);

  // Terminals are on the bottom edge of a device, so dropping straight down
  // from one is always clear and rising straight up into one always is too.
  const startLane = laneY(r, fromRow, lane);
  const endLane = laneY(r, toRow, lane);

  if (fromRow === toRow) {
    return [
      { x: from.x, y: from.y },
      { x: from.x, y: startLane },
      { x: to.x, y: startLane },
      { x: to.x, y: to.y },
    ];
  }

  // Different rows: change rows inside a channel that misses every device, then
  // run the last leg in the DESTINATION's own corridor.
  //
  // The subtlety that a test caught: the horizontal approach has to happen at
  // `endLane`, not at whichever corridor is deeper. Running to the destination
  // in the source's corridor and then rising means climbing past every row in
  // between — which is how a ground conductor going up two rows ended up drawn
  // straight through the luminaire and the neutral splice.
  const channelX = verticalChannel(r, fromRow, toRow, to.x, width);

  return [
    { x: from.x, y: from.y },
    { x: from.x, y: startLane },
    { x: channelX, y: startLane },
    { x: channelX, y: endLane },
    { x: to.x, y: endLane },
    { x: to.x, y: to.y },
  ];
};

/**
 * Lane assignment. Conductors that would share a corridor at the same depth get
 * pushed apart, because two wires drawn on top of each other is precisely the
 * ambiguity that caused a correct circuit to be reported as wrong.
 */
export const assignLanes = (wires, anchors, boxes) => {
  const rows = rowsFrom(boxes);
  const used = new Map();   // rowKey → next free lane
  const out = new Map();

  for (const w of wires) {
    const a = anchors[w.fromTerminal];
    const b = anchors[w.toTerminal];
    if (!a || !b) { out.set(w.id, 0); continue; }
    const key = `${rowIndexFor(rows, a.y)}:${rowIndexFor(rows, b.y)}`;
    const lane = used.get(key) ?? 0;
    used.set(key, lane + 1);
    out.set(w.id, lane);
  }
  return out;
};

/** Polyline → SVG path with rounded corners. */
export const toPath = (points, radius = RADIUS) => {
  if (!points || points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

  const len = (p, q) => Math.hypot(q.x - p.x, q.y - p.y);
  const lerp = (p, q, t) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]; const cur = points[i]; const next = points[i + 1];
    const rIn = Math.min(radius, len(prev, cur) / 2);
    const rOut = Math.min(radius, len(cur, next) / 2);
    if (rIn < 0.5 || rOut < 0.5) { d += ` L ${cur.x} ${cur.y}`; continue; }
    const p1 = lerp(cur, prev, rIn / (len(prev, cur) || 1));
    const p2 = lerp(cur, next, rOut / (len(cur, next) || 1));
    d += ` L ${p1.x} ${p1.y} Q ${cur.x} ${cur.y} ${p2.x} ${p2.y}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
};

/** Everything the canvas needs for one conductor. */
export const routedPath = (wire, anchors, boxes, lane = 0, width = 360) => {
  const a = anchors[wire.fromTerminal];
  const b = anchors[wire.toTerminal];
  if (!a || !b) return null;
  const points = routeWire(a, b, { boxes, lane, width });
  return { points, d: toPath(points) };
};
