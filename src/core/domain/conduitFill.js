// ─── CONDUIT FILL ────────────────────────────────────────────────────────────
// NEC Chapter 9, Tables 1, 4 and 5.
//
// Extracted from App.js because the numbers were wrong in a way that reading the
// code would never reveal: the area table held the 40% column while the fill
// calculation divided by it and then compared the answer to 40% again. Every
// individual line looked reasonable. The result told an electrician that a 1/2"
// EMT holds three #12 THHN when the code permits nine.
//
// The only defence against that class of mistake is checking the output against
// the published answer key, which is what Annex C is. `maxConductors` below
// reproduces Table C.1 exactly, and the test asserts it row by row. If someone
// edits an area, a wire size, or the rounding rule, the table stops matching.
//
// Pure module: no React, no storage.

/** Chapter 9, Table 1 — maximum fill as a percentage of TOTAL area. */
export const MAX_FILL = Object.freeze({ 1: 53, 2: 31, 3: 40 });

/** The Table 1 row that applies to a given conductor count. */
export const maxFillPercent = (count) => {
  const n = Math.max(1, Math.floor(Number(count) || 0));
  return n === 1 ? MAX_FILL[1] : n === 2 ? MAX_FILL[2] : MAX_FILL[3];
};

/**
 * Chapter 9, Table 4 — TOTAL internal cross-sectional area, in².
 * Not the 40% column. The percentage is taken against the whole pipe.
 */
export const CONDUIT_AREA = Object.freeze({
  EMT:      Object.freeze({ '1/2"': 0.304, '3/4"': 0.533, '1"': 0.864, '1-1/4"': 1.496, '1-1/2"': 2.036, '2"': 3.356 }),
  IMC:      Object.freeze({ '1/2"': 0.342, '3/4"': 0.586, '1"': 0.959, '1-1/4"': 1.647, '1-1/2"': 2.225, '2"': 3.630 }),
  RMC:      Object.freeze({ '1/2"': 0.314, '3/4"': 0.549, '1"': 0.887, '1-1/4"': 1.526, '1-1/2"': 2.071, '2"': 3.408 }),
  'PVC-40': Object.freeze({ '1/2"': 0.285, '3/4"': 0.508, '1"': 0.832, '1-1/4"': 1.453, '1-1/2"': 1.986, '2"': 3.291 }),
});

/** Chapter 9, Table 5 — conductor area including insulation, in². */
export const WIRE_AREA = Object.freeze({
  THHN: Object.freeze({ '14': 0.0097, '12': 0.0133, '10': 0.0211, '8': 0.0366, '6': 0.0507, '4': 0.0824, '2': 0.1158, '1/0': 0.1855, '2/0': 0.2223 }),
  XHHW: Object.freeze({ '14': 0.0139, '12': 0.0181, '10': 0.0243, '8': 0.0437, '6': 0.0590, '4': 0.0814, '2': 0.1146, '1/0': 0.1825, '2/0': 0.2190 }),
});

export const conduitArea = (type, size) => CONDUIT_AREA[type]?.[size] ?? null;
export const wireArea = (insulation, gauge) => WIRE_AREA[insulation]?.[gauge] ?? null;

/**
 * Fill for `count` identical conductors.
 * Returns null when either lookup misses, so a caller shows "no data" instead
 * of a confident zero.
 */
export const fillFor = ({ conduitType, tradeSize, insulation, gauge, count }) => {
  const ca = conduitArea(conduitType, tradeSize);
  const wa = wireArea(insulation, gauge);
  const n = Math.max(1, Math.floor(Number(count) || 0));
  if (!ca || !wa) return null;

  const used = wa * n;
  const limit = maxFillPercent(n);
  const percent = (used / ca) * 100;

  return {
    wireArea: wa,
    totalWireArea: used,
    conduitArea: ca,
    // Area the code actually allows, so the UI can say "0.122 of 0.304 in²"
    // rather than only a percentage.
    allowedArea: ca * (limit / 100),
    percent,
    limit,
    passed: percent <= limit,
    // A warning band below the limit: legal, but nothing left for the next
    // change order, and unpleasant to pull.
    status: percent > limit ? 'fail' : percent > limit * 0.85 ? 'warn' : 'pass',
  };
};

/**
 * Maximum conductors of one size — this is what Annex C tabulates, and it is
 * the check that proves the areas above are right.
 *
 * Chapter 9, Note 7: when every conductor is the same size, a calculation
 * ending in a decimal of 0.8 or larger rounds UP. That note is why Table C.1
 * says 22 #14 THHN in 3/4" EMT when the raw division gives 21.98.
 */
export const maxConductors = (conduitType, tradeSize, insulation, gauge) => {
  const ca = conduitArea(conduitType, tradeSize);
  const wa = wireArea(insulation, gauge);
  if (!ca || !wa) return null;

  // The fill limit depends on the count, and the count is what we are solving
  // for. Resolve it by trying each Table 1 row against its own conductor count.
  const fits = (n) => wa * n <= ca * (maxFillPercent(n) / 100);
  if (!fits(1)) return 0;
  if (!fits(2)) return 1;

  const raw = (ca * (MAX_FILL[3] / 100)) / wa;
  const whole = Math.floor(raw);
  const rounded = raw - whole >= 0.8 ? whole + 1 : whole;
  return Math.max(2, rounded);
};
