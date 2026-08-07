// ─── CONDUIT BENDING ─────────────────────────────────────────────────────────
// The geometry, separated from the calculator screen so it can be tested,
// animated, and checked against a tape measure.
//
// The screen already does the textbook arithmetic — multiplier × depth, and so
// on. Three things it does not do, and they are the three that decide whether
// the pipe fits:
//
//   1. THE ROLLING OFFSET IS ONE OFFSET, IN A TILTED PLANE. Everyone learns
//      "true offset = √(rise² + roll²)" and stops there. The part that gets
//      missed is the ROLL ANGLE — how far around the pipe axis the second bend
//      must be rotated relative to the first. Bend both marks in the same plane
//      and you have a plain offset going the wrong direction. This file
//      computes that angle.
//
//   2. GAIN AND TAKE-UP ARE REAL LENGTHS. A bend does not add its two legs; the
//      arc is shorter than the corner it replaces. Cut to the sum of the legs
//      and the pipe is long by the gain on every bend.
//
//   3. THE SHRINK ON AN OFFSET SHORTENS THE RUN. The pipe between two offset
//      bends is longer than the straight distance it spans, so every downstream
//      measurement moves. Missing it is why an offset lands short of the box.
//
// Everything here is trigonometry on the user's own numbers. No table lookups,
// so nothing in this file depends on the source-verification register — except
// the take-up and gain constants, which are bender-specific and are treated as
// user-supplied with documented defaults rather than as facts.
//
// Pure module: no React, no storage.

export const DEG = Math.PI / 180;
export const toRad = (deg) => deg * DEG;
export const toDeg = (rad) => rad / DEG;

// ─── Multipliers ─────────────────────────────────────────────────────────────

/**
 * `Math.sin(Math.PI)` is 1.22e-16, not 0 — so a bare `sin <= 0` guard lets 180°
 * through and hands back a multiplier of 8e15 instead of refusing. Bound the
 * angle itself: an offset bend lives strictly between "not a bend" and "doubled
 * back on itself".
 */
export const isBendableAngle = (angleDeg) =>
  Number.isFinite(angleDeg) && angleDeg > 0 && angleDeg < 180;

/**
 * The offset multiplier is not a magic number from a chart — it is 1/sin(angle).
 * Computing it means any angle works, including the ones a bender has no mark
 * for, and it means the 22.5° multiplier is 2.613 rather than "about 2.6".
 */
export const offsetMultiplier = (angleDeg) => {
  if (!isBendableAngle(angleDeg)) return null;
  const s = Math.sin(toRad(angleDeg));
  if (!Number.isFinite(s) || s <= 0) return null;
  return 1 / s;
};

/** How much the run shortens per inch of offset depth: (1/sin − 1/tan). */
export const shrinkPerInch = (angleDeg) => {
  if (!isBendableAngle(angleDeg)) return null;
  const a = toRad(angleDeg);
  const s = Math.sin(a);
  const t = Math.tan(a);
  if (!Number.isFinite(s) || s <= 0 || !Number.isFinite(t) || t === 0) return null;
  return (1 / s) - (1 / t);
};

export const COMMON_ANGLES = Object.freeze([10, 22.5, 30, 45, 60]);

// ─── Bender geometry ─────────────────────────────────────────────────────────

/**
 * Take-up and gain belong to the BENDER and the conduit, not to the maths. They
 * are stamped on the tool and vary by manufacturer, so they are inputs with
 * documented defaults, never asserted constants.
 *
 * `centerlineRadius` is what the geometry actually needs; take-up is the number
 * printed on the shoe.
 */
export const bender = ({ label = 'Custom', centerlineRadius, takeUp = null } = {}) => {
  if (!Number.isFinite(centerlineRadius) || centerlineRadius <= 0) return null;
  return Object.freeze({ label, centerlineRadius, takeUp });
};

/**
 * Arc length through a bend, and the "gain" — how much shorter the bent pipe is
 * than the two legs measured to their theoretical corner.
 *
 * For a bend of angle θ and centreline radius R:
 *   arc     = R · θ
 *   tangent = R · tan(θ/2)     (corner to where the bend starts)
 *   gain    = 2·tangent − arc
 */
export const bendGeometry = (angleDeg, centerlineRadius) => {
  if (!isBendableAngle(angleDeg)) return null;
  if (!Number.isFinite(centerlineRadius) || centerlineRadius <= 0) return null;
  const a = toRad(angleDeg);
  const arc = centerlineRadius * a;
  const tangent = centerlineRadius * Math.tan(a / 2);
  return Object.freeze({
    angleDeg,
    centerlineRadius,
    arcLength: arc,
    tangentLength: tangent,
    gain: 2 * tangent - arc,
  });
};

// ─── Offsets ─────────────────────────────────────────────────────────────────

/**
 * A plain offset: two equal bends, same plane, opposite directions.
 *
 * @returns marks, travel, shrink, and the developed length of pipe consumed.
 */
export const offset = ({ depth, angleDeg = 30, centerlineRadius = null, firstMarkAt = 0 } = {}) => {
  if (!Number.isFinite(depth) || depth <= 0) return null;
  const mult = offsetMultiplier(angleDeg);
  const shrinkRate = shrinkPerInch(angleDeg);
  if (mult === null || shrinkRate === null) return null;

  const distanceBetweenMarks = depth * mult;
  const shrink = depth * shrinkRate;

  const geo = Number.isFinite(centerlineRadius) && centerlineRadius > 0
    ? bendGeometry(angleDeg, centerlineRadius) : null;

  return Object.freeze({
    kind: 'OFFSET',
    depth,
    angleDeg,
    multiplier: mult,
    distanceBetweenMarks,
    shrink,
    // Where to put the tape, measured from the same end for both marks.
    marks: Object.freeze([
      Object.freeze({ index: 1, at: firstMarkAt, angleDeg, direction: 'UP' }),
      Object.freeze({ index: 2, at: firstMarkAt + distanceBetweenMarks, angleDeg, direction: 'DOWN' }),
    ]),
    // Two bends' worth of gain, when the bender radius is known.
    gainTotal: geo ? geo.gain * 2 : null,
    geometry: geo,
  });
};

// ─── Rolling offset ──────────────────────────────────────────────────────────

/**
 * A rolling offset is a plain offset made in a plane that is tilted around the
 * pipe axis. Two numbers come out of it and both are needed:
 *
 *   TRUE OFFSET   √(rise² + roll²) — the depth to bend, measured in that
 *                 tilted plane, NOT the vertical rise.
 *   ROLL ANGLE    atan2(roll, rise) — how far to rotate the pipe between
 *                 marking and bending, so the offset travels in the right
 *                 direction. This is the number that gets left out, and leaving
 *                 it out is why the pipe comes back the wrong way.
 *
 * `rise` is the vertical displacement, `roll` the horizontal. Both are measured
 * between the same two points on the two runs.
 */
export const rollingOffset = ({ rise, roll, angleDeg = 30, centerlineRadius = null, firstMarkAt = 0 } = {}) => {
  const r = Number.isFinite(rise) ? rise : null;
  const h = Number.isFinite(roll) ? roll : null;
  if (r === null || h === null) return null;
  if (r < 0 || h < 0) return null;
  if (r === 0 && h === 0) return null;

  const trueOffset = Math.hypot(r, h);
  // atan2(roll, rise): 0° is straight up, 90° is straight across.
  const rollAngleDeg = toDeg(Math.atan2(h, r));

  const base = offset({ depth: trueOffset, angleDeg, centerlineRadius, firstMarkAt });
  if (!base) return null;

  return Object.freeze({
    ...base,
    kind: 'ROLLING_OFFSET',
    rise: r,
    roll: h,
    trueOffset,
    rollAngleDeg,
    // Said in words, because the number alone gets misread as the bend angle.
    rollInstruction: h === 0
      ? 'No roll — this is a straight vertical offset.'
      : r === 0
        ? 'Rolled a full 90°: the offset is entirely sideways.'
        : `Rotate the pipe ${round(rollAngleDeg)}° from vertical before bending, and keep that `
          + 'rotation identical for both bends. The bend angle stays '
          + `${angleDeg}° — the roll is rotation about the pipe, not a different bend.`,
    // The two bends still make a plain offset of `trueOffset` in the rolled plane.
    depthInRolledPlane: trueOffset,
  });
};

// ─── Saddles ─────────────────────────────────────────────────────────────────

/**
 * Three-point saddle over an obstruction. The centre bend is twice the side
 * bends, and the classic 45/22.5/22.5 is just the case where that works out to
 * a 2.5× multiplier.
 */
export const threePointSaddle = ({ depth, centerAngleDeg = 45, centerlineRadius = null, centerMarkAt = null } = {}) => {
  if (!Number.isFinite(depth) || depth <= 0) return null;
  if (!isBendableAngle(centerAngleDeg)) return null;
  const sideAngle = centerAngleDeg / 2;
  const mult = offsetMultiplier(sideAngle);
  if (mult === null) return null;

  // Distance from the centre mark out to each side mark.
  const sideDistance = depth * mult;
  const center = Number.isFinite(centerMarkAt) ? centerMarkAt : sideDistance;
  const shrinkRate = shrinkPerInch(sideAngle);

  return Object.freeze({
    kind: 'SADDLE_3',
    depth,
    centerAngleDeg,
    sideAngleDeg: sideAngle,
    multiplier: mult,
    sideDistance,
    shrink: shrinkRate === null ? null : depth * shrinkRate,
    marks: Object.freeze([
      Object.freeze({ index: 1, at: center - sideDistance, angleDeg: sideAngle, direction: 'UP' }),
      Object.freeze({ index: 2, at: center, angleDeg: centerAngleDeg, direction: 'DOWN' }),
      Object.freeze({ index: 3, at: center + sideDistance, angleDeg: sideAngle, direction: 'UP' }),
    ]),
    geometry: Number.isFinite(centerlineRadius) && centerlineRadius > 0
      ? bendGeometry(centerAngleDeg, centerlineRadius) : null,
  });
};

/** Four-point saddle: two offsets back to back, with a flat run over the top. */
export const fourPointSaddle = ({ depth, obstructionWidth, angleDeg = 22.5, firstMarkAt = 0 } = {}) => {
  if (!Number.isFinite(depth) || depth <= 0) return null;
  if (!Number.isFinite(obstructionWidth) || obstructionWidth < 0) return null;
  const mult = offsetMultiplier(angleDeg);
  if (mult === null) return null;
  const legDistance = depth * mult;

  return Object.freeze({
    kind: 'SADDLE_4',
    depth,
    obstructionWidth,
    angleDeg,
    multiplier: mult,
    legDistance,
    marks: Object.freeze([
      Object.freeze({ index: 1, at: firstMarkAt, angleDeg, direction: 'UP' }),
      Object.freeze({ index: 2, at: firstMarkAt + legDistance, angleDeg, direction: 'DOWN' }),
      Object.freeze({ index: 3, at: firstMarkAt + legDistance + obstructionWidth, angleDeg, direction: 'DOWN' }),
      Object.freeze({ index: 4, at: firstMarkAt + legDistance * 2 + obstructionWidth, angleDeg, direction: 'UP' }),
    ]),
  });
};

// ─── Tolerance ───────────────────────────────────────────────────────────────

/**
 * What a marking error costs at the far end.
 *
 * The useful fact is that error does not stay where it was made: a mark placed
 * `e` off on an offset moves the finished depth by e·sin(θ). At 30° that is half
 * the error, at 10° it is a sixth — which is why shallow-angle offsets are
 * forgiving to mark and steep ones are not.
 */
export const DEFAULT_TOLERANCE_IN = 0.125;

export const toleranceCheck = ({ angleDeg, markError = DEFAULT_TOLERANCE_IN, angleErrorDeg = 1, depth = null } = {}) => {
  if (!isBendableAngle(angleDeg)) return null;
  const s = Math.sin(toRad(angleDeg));
  if (!Number.isFinite(s) || s <= 0) return null;

  const depthErrorFromMark = Math.abs(markError) * s;
  // An angle off by δ moves the finished depth by roughly depth · δ_rad / tan θ:
  // shallow angles put the marks far apart, so a degree of overbend travels.
  const t = Math.tan(toRad(angleDeg));
  const depthErrorFromAngle = depth !== null && Number.isFinite(depth) && t !== 0
    ? Math.abs(depth * toRad(angleErrorDeg) / t)
    : null;

  return Object.freeze({
    angleDeg,
    markError,
    angleErrorDeg,
    depthErrorFromMark,
    depthErrorFromAngle,
    totalDepthError: depthErrorFromAngle === null
      ? depthErrorFromMark
      : depthErrorFromMark + depthErrorFromAngle,
    // Shallower angles hide marking error and magnify angle error; the reverse
    // at steep angles. Worth saying, because it decides which angle to pick.
    note: angleDeg <= 22.5
      ? 'A shallow angle forgives marking error but punishes a sloppy bend angle — the marks are far apart, so a degree of overbend travels a long way.'
      : angleDeg >= 45
        ? 'A steep angle keeps the marks close and the shrink small, but every fraction of an inch of marking error shows up almost one-for-one in the finished depth.'
        : 'A middle angle: marking error and angle error contribute about equally.',
  });
};

/** Did the bend land? Pass the measured depth back in. */
export const checkAgainstTarget = ({ target, measured, tolerance = DEFAULT_TOLERANCE_IN }) => {
  if (!Number.isFinite(target) || !Number.isFinite(measured)) return null;
  const error = measured - target;
  const within = Math.abs(error) <= Math.abs(tolerance);
  return Object.freeze({
    target,
    measured,
    error,
    within,
    tolerance,
    verdict: within ? 'Within tolerance'
      : error > 0 ? `Overbent by ${round(Math.abs(error))}"` : `Underbent by ${round(Math.abs(error))}"`,
    // Which way to correct, in the words used at the bender.
    correction: within ? null
      : error > 0 ? 'Open the bend slightly, or move the mark toward the bender.'
        : 'Add a little more bend, or move the mark away from the bender.',
  });
};

// ─── Cut length and waste ────────────────────────────────────────────────────

/**
 * How long to cut the stick, accounting for what every bend gives back.
 *
 * `segments` are the straight lengths between bends, measured to the corners.
 * The developed length is their sum MINUS the gain of each bend, because the arc
 * is shorter than the corner it replaces.
 */
export const cutLength = ({ segments = [], bends = [], centerlineRadius = null } = {}) => {
  const straight = segments.filter(Number.isFinite).reduce((a, b) => a + b, 0);
  let gain = 0;
  let unknownBends = 0;
  for (const b of bends) {
    const r = Number.isFinite(b?.centerlineRadius) ? b.centerlineRadius : centerlineRadius;
    const geo = Number.isFinite(r) && r > 0 ? bendGeometry(b?.angleDeg ?? b, r) : null;
    if (geo) gain += geo.gain;
    else unknownBends += 1;
  }
  return Object.freeze({
    straightTotal: straight,
    gainTotal: gain,
    developedLength: straight - gain,
    unknownBends,
    // Without a bender radius the gain cannot be computed, and the developed
    // length is just the sum of the legs — which is longer than the real pipe.
    exact: unknownBends === 0 && bends.length > 0,
    note: unknownBends
      ? `${unknownBends} bend${unknownBends === 1 ? ' has' : 's have'} no bender radius, so their gain is not included. Cut long and trim.`
      : null,
  });
};

export const STOCK_LENGTH_IN = 120;   // a 10-foot stick

/**
 * Material for a set of pipe runs, and what falls on the floor.
 *
 * Cuts are packed longest-first into sticks — the same thing a person does by
 * eye, and it beats cutting in list order often enough to matter on a big pull.
 * Offcuts long enough to be worth keeping are reported separately from waste,
 * because a 40" drop is stock and a 3" drop is scrap.
 */
export const USABLE_OFFCUT_IN = 24;

export const materialTakeoff = ({ cuts = [], stockLength = STOCK_LENGTH_IN, kerf = 0, usableOffcut = USABLE_OFFCUT_IN } = {}) => {
  const valid = cuts.filter((c) => Number.isFinite(c) && c > 0).sort((a, b) => b - a);
  const tooLong = valid.filter((c) => c > stockLength);
  const fits = valid.filter((c) => c <= stockLength);

  const sticks = [];
  for (const cut of fits) {
    const stick = sticks.find((s) => s.remaining >= cut + kerf);
    if (stick) {
      stick.cuts.push(cut);
      stick.remaining -= cut + kerf;
    } else {
      sticks.push({ cuts: [cut], remaining: stockLength - cut });
    }
  }

  const offcuts = sticks.map((s) => s.remaining);
  const usable = offcuts.filter((r) => r >= usableOffcut);
  const scrap = offcuts.filter((r) => r < usableOffcut);
  const totalCut = fits.reduce((a, b) => a + b, 0);
  const totalStock = sticks.length * stockLength;

  return Object.freeze({
    sticksNeeded: sticks.length,
    stockLength,
    sticks: Object.freeze(sticks.map((s) => Object.freeze({
      cuts: Object.freeze([...s.cuts]),
      remaining: round(s.remaining),
      usable: s.remaining >= usableOffcut,
    }))),
    totalCutLength: round(totalCut),
    totalStockLength: totalStock,
    usableOffcuts: Object.freeze(usable.map(round)),
    scrapLength: round(scrap.reduce((a, b) => a + b, 0)),
    wastePercent: totalStock > 0 ? Math.round(((totalStock - totalCut) / totalStock) * 1000) / 10 : 0,
    // A cut longer than a stick is a coupling job, not a cutting-list entry.
    impossibleCuts: Object.freeze(tooLong.map(round)),
    note: tooLong.length
      ? `${tooLong.length} cut${tooLong.length === 1 ? '' : 's'} exceed a ${stockLength}" stick and will need coupling.`
      : null,
  });
};

// ─── Level-by-level training ─────────────────────────────────────────────────
//
// The progression a bending app owes an apprentice. Each level names what it
// teaches and what "done" means, so the training is not a pile of calculators.

export const BEND_LEVELS = Object.freeze([
  { level: 1, id: 'stub90', title: 'The 90° stub', teaches: 'Take-up: the bender eats length, and the mark moves back by it.',
    target: 'Stub to a called height, within 1/8".' },
  { level: 2, id: 'backToBack', title: 'Back-to-back 90s', teaches: 'Measuring to the back of a bend rather than to the end of the pipe.',
    target: 'Two 90s at a called spacing, both legs square.' },
  { level: 3, id: 'offset30', title: 'The 30° offset', teaches: 'The multiplier is 1/sin θ, and the run shrinks.',
    target: 'Offset to depth, and the far end still lands on the mark.' },
  { level: 4, id: 'offsetAngles', title: 'Picking the angle', teaches: 'Shallow forgives the tape and punishes the bend; steep does the reverse.',
    target: 'Same offset at 10°, 22.5° and 45°. Compare the shrink.' },
  { level: 5, id: 'saddle3', title: 'Three-point saddle', teaches: 'Centre bend twice the sides, marks measured from the centre out.',
    target: 'Clear an obstruction with the pipe flat on both sides.' },
  { level: 6, id: 'saddle4', title: 'Four-point saddle', teaches: 'Two offsets back to back with a flat over the top.',
    target: 'Clear a wide obstruction, both runs in line.' },
  { level: 7, id: 'rolling', title: 'The rolling offset', teaches: 'True offset is the hypotenuse; the roll angle is rotation, not bend.',
    target: 'Land a rolling offset in both planes at once.' },
  { level: 8, id: 'concentric', title: 'Concentric bends', teaches: 'Parallel runs need different radii to stay parallel through a turn.',
    target: 'Three pipes through 90°, spacing held the whole way.' },
  { level: 9, id: 'cutList', title: 'Cutting a run', teaches: 'Gain, developed length, and getting it out of the fewest sticks.',
    target: 'A full run cut from a list with under 10% waste.' },
]);

export const levelById = (id) => BEND_LEVELS.find((l) => l.id === id) ?? null;

function round(n) { return Math.round(n * 100) / 100; }

export const BENDING_DISCLAIMER =
  'Geometry from the numbers entered. Take-up, gain and centreline radius belong to your bender and '
  + 'your conduit — check them against the tool before cutting.';
