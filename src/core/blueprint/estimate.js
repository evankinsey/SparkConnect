// ─── ESTIMATING ENGINE ───────────────────────────────────────────────────────
// Verified devices in, material and labor out, with the uncertainty attached to
// each line rather than buried in a footer.
//
// The design decision that matters: a quantity and its basis are ONE value. You
// cannot obtain a number from this module without also obtaining how it was
// arrived at, because they are the same object. A caller cannot accidentally
// render "412 ft of 1/2 EMT" without also having in hand the fact that it is an
// allowance derived from device count and not a measurement.
//
// That is what separates estimating software a contractor will bid from a demo.
// Power Design does not lose money because a number was wrong; they lose money
// because a number looked more certain than it was.
//
// Pure module: no React, no network, no storage.

import { confirmedCounts, reviewSummary, DeviceState } from './device.js';
import { symbolById, isCountable, CountBasis } from './symbols.js';

/**
 * How a quantity was arrived at. Every line carries exactly one of these and
 * the UI is expected to show it next to the number, not in a legend.
 */
export const Basis = Object.freeze({
  // Counted from devices a human confirmed. The strongest thing we can say.
  COUNTED: 'COUNTED',
  // Arithmetic on counted quantities — two mud rings per device, etc. Exact
  // given the count, so it inherits the count's standing.
  CALCULATED: 'CALCULATED',
  // A rule-of-thumb allowance. Defensible for pricing, wrong for ordering.
  ALLOWANCE: 'ALLOWANCE',
  // Cannot be known from a plan view at all. Present so the omission is
  // visible on the estimate instead of being discovered on site.
  FIELD_VERIFY: 'FIELD_VERIFY',
  // Deliberately outside this estimate's scope.
  EXCLUDED: 'EXCLUDED',
});

export const BASIS_LABEL = Object.freeze({
  [Basis.COUNTED]: 'Counted',
  [Basis.CALCULATED]: 'Calculated',
  [Basis.ALLOWANCE]: 'Estimated — allowance',
  [Basis.FIELD_VERIFY]: 'Requires field verification',
  [Basis.EXCLUDED]: 'Not included',
});

/** Can this line be handed to a supplier as an order quantity? */
export const isOrderable = (basis) => basis === Basis.COUNTED || basis === Basis.CALCULATED;

const line = (id, description, qty, unit, basis, opts = {}) => Object.freeze({
  id,
  description,
  // null quantity is meaningful: FIELD_VERIFY and EXCLUDED lines appear on the
  // estimate with no number, which is the honest rendering of "we do not know".
  qty: qty === null ? null : Math.max(0, Math.round((Number(qty) || 0) * 100) / 100,),
  unit,
  basis,
  basisLabel: BASIS_LABEL[basis],
  orderable: isOrderable(basis) && qty !== null,
  // Why this number is what it is, in one sentence a foreman can check.
  derivation: opts.derivation ?? null,
  fromSymbols: Object.freeze(opts.fromSymbols ?? []),
  category: opts.category ?? 'Material',
});

/**
 * Material assembly per device type: what one of these costs you in parts.
 *
 * Editable and extensible — a company with its own standards overrides this
 * wholesale via `estimateMaterials(devices, { assemblies })`. Nothing downstream
 * hardcodes a device type, so adding one is adding a key here.
 *
 * Quantities are per device. `basis` says what kind of claim each part is.
 */
export const DEFAULT_ASSEMBLIES = Object.freeze({
  receptacle: [
    { item: 'device_box', qty: 1, unit: 'ea', basis: Basis.CALCULATED },
    { item: 'mud_ring', qty: 1, unit: 'ea', basis: Basis.CALCULATED },
    { item: 'receptacle_15a', qty: 1, unit: 'ea', basis: Basis.COUNTED },
    { item: 'plate', qty: 1, unit: 'ea', basis: Basis.CALCULATED },
    { item: 'wirenut', qty: 4, unit: 'ea', basis: Basis.ALLOWANCE },
  ],
  receptacle_gfci: [
    { item: 'device_box', qty: 1, unit: 'ea', basis: Basis.CALCULATED },
    { item: 'mud_ring', qty: 1, unit: 'ea', basis: Basis.CALCULATED },
    { item: 'receptacle_gfci', qty: 1, unit: 'ea', basis: Basis.COUNTED },
    { item: 'plate', qty: 1, unit: 'ea', basis: Basis.CALCULATED },
    { item: 'wirenut', qty: 4, unit: 'ea', basis: Basis.ALLOWANCE },
  ],
  receptacle_wp: [
    { item: 'device_box', qty: 1, unit: 'ea', basis: Basis.CALCULATED },
    { item: 'receptacle_gfci', qty: 1, unit: 'ea', basis: Basis.COUNTED },
    { item: 'plate_wp_inuse', qty: 1, unit: 'ea', basis: Basis.CALCULATED },
    { item: 'wirenut', qty: 4, unit: 'ea', basis: Basis.ALLOWANCE },
  ],
  floor_box: [
    { item: 'floor_box', qty: 1, unit: 'ea', basis: Basis.COUNTED },
    { item: 'receptacle_15a', qty: 1, unit: 'ea', basis: Basis.CALCULATED },
    { item: 'wirenut', qty: 4, unit: 'ea', basis: Basis.ALLOWANCE },
  ],
  switch_single: [
    { item: 'device_box', qty: 1, unit: 'ea', basis: Basis.CALCULATED },
    { item: 'mud_ring', qty: 1, unit: 'ea', basis: Basis.CALCULATED },
    { item: 'switch_1p', qty: 1, unit: 'ea', basis: Basis.COUNTED },
    { item: 'plate', qty: 1, unit: 'ea', basis: Basis.CALCULATED },
    { item: 'wirenut', qty: 3, unit: 'ea', basis: Basis.ALLOWANCE },
  ],
  switch_three_way: [
    { item: 'device_box', qty: 1, unit: 'ea', basis: Basis.CALCULATED },
    { item: 'mud_ring', qty: 1, unit: 'ea', basis: Basis.CALCULATED },
    { item: 'switch_3w', qty: 1, unit: 'ea', basis: Basis.COUNTED },
    { item: 'plate', qty: 1, unit: 'ea', basis: Basis.CALCULATED },
    { item: 'wirenut', qty: 4, unit: 'ea', basis: Basis.ALLOWANCE },
  ],
  switch_four_way: [
    { item: 'device_box', qty: 1, unit: 'ea', basis: Basis.CALCULATED },
    { item: 'mud_ring', qty: 1, unit: 'ea', basis: Basis.CALCULATED },
    { item: 'switch_4w', qty: 1, unit: 'ea', basis: Basis.COUNTED },
    { item: 'plate', qty: 1, unit: 'ea', basis: Basis.CALCULATED },
    { item: 'wirenut', qty: 5, unit: 'ea', basis: Basis.ALLOWANCE },
  ],
  switch_dimmer: [
    { item: 'device_box', qty: 1, unit: 'ea', basis: Basis.CALCULATED },
    { item: 'mud_ring', qty: 1, unit: 'ea', basis: Basis.CALCULATED },
    { item: 'dimmer', qty: 1, unit: 'ea', basis: Basis.COUNTED },
    { item: 'plate', qty: 1, unit: 'ea', basis: Basis.CALCULATED },
  ],
  occupancy_sensor: [
    { item: 'device_box', qty: 1, unit: 'ea', basis: Basis.CALCULATED },
    { item: 'occ_sensor', qty: 1, unit: 'ea', basis: Basis.COUNTED },
    { item: 'plate', qty: 1, unit: 'ea', basis: Basis.CALCULATED },
  ],
  photocell: [{ item: 'photocell', qty: 1, unit: 'ea', basis: Basis.COUNTED }],
  light: [
    { item: 'fixture_box', qty: 1, unit: 'ea', basis: Basis.CALCULATED },
    { item: 'fixture_whip', qty: 1, unit: 'ea', basis: Basis.ALLOWANCE },
    { item: 'wirenut', qty: 3, unit: 'ea', basis: Basis.ALLOWANCE },
  ],
  light_emergency: [
    { item: 'fixture_box', qty: 1, unit: 'ea', basis: Basis.CALCULATED },
    { item: 'fixture_whip', qty: 1, unit: 'ea', basis: Basis.ALLOWANCE },
  ],
  exit_sign: [
    { item: 'fixture_box', qty: 1, unit: 'ea', basis: Basis.CALCULATED },
    { item: 'fixture_whip', qty: 1, unit: 'ea', basis: Basis.ALLOWANCE },
  ],
  junction_box: [{ item: 'junction_box', qty: 1, unit: 'ea', basis: Basis.COUNTED },
    { item: 'blank_cover', qty: 1, unit: 'ea', basis: Basis.CALCULATED }],
  pull_box: [{ item: 'pull_box', qty: 1, unit: 'ea', basis: Basis.COUNTED }],
  data_drop: [
    { item: 'device_box', qty: 1, unit: 'ea', basis: Basis.CALCULATED },
    { item: 'mud_ring', qty: 1, unit: 'ea', basis: Basis.CALCULATED },
    { item: 'data_jack', qty: 1, unit: 'ea', basis: Basis.COUNTED },
    { item: 'plate', qty: 1, unit: 'ea', basis: Basis.CALCULATED },
  ],
  smoke_detector: [{ item: 'fixture_box', qty: 1, unit: 'ea', basis: Basis.CALCULATED }],
  horn_strobe: [{ item: 'device_box', qty: 1, unit: 'ea', basis: Basis.CALCULATED }],
  disconnect: [{ item: 'disconnect', qty: 1, unit: 'ea', basis: Basis.COUNTED }],
  // Deliberately empty: these are engineered items priced from the schedule and
  // the submittal, not from a symbol on a floor plan. An empty assembly is a
  // statement, and `unpricedSymbols` below reports it rather than hiding it.
  panel: [],
  subpanel: [],
  transformer: [],
  motor: [],
  vfd: [],
  ev_charger: [],
  receptacle_special: [],
  receptacle_quad: [
    { item: 'device_box', qty: 1, unit: 'ea', basis: Basis.CALCULATED },
    { item: 'mud_ring', qty: 1, unit: 'ea', basis: Basis.CALCULATED },
    { item: 'receptacle_15a', qty: 2, unit: 'ea', basis: Basis.CALCULATED },
    { item: 'plate', qty: 1, unit: 'ea', basis: Basis.CALCULATED },
  ],
  fa_device: [],
});

/** Display names and units for the parts an assembly can reference. */
export const CATALOG = Object.freeze({
  device_box: { label: '4" square box', unit: 'ea' },
  fixture_box: { label: 'Fixture / octagon box', unit: 'ea' },
  junction_box: { label: 'Junction box', unit: 'ea' },
  pull_box: { label: 'Pull box', unit: 'ea' },
  floor_box: { label: 'Floor box assembly', unit: 'ea' },
  mud_ring: { label: 'Mud ring', unit: 'ea' },
  plate: { label: 'Device plate', unit: 'ea' },
  plate_wp_inuse: { label: 'WP in-use cover', unit: 'ea' },
  blank_cover: { label: 'Blank cover', unit: 'ea' },
  receptacle_15a: { label: 'Receptacle', unit: 'ea' },
  receptacle_gfci: { label: 'GFCI receptacle', unit: 'ea' },
  switch_1p: { label: 'Single-pole switch', unit: 'ea' },
  switch_3w: { label: 'Three-way switch', unit: 'ea' },
  switch_4w: { label: 'Four-way switch', unit: 'ea' },
  dimmer: { label: 'Dimmer', unit: 'ea' },
  occ_sensor: { label: 'Occupancy sensor', unit: 'ea' },
  photocell: { label: 'Photocell', unit: 'ea' },
  data_jack: { label: 'Data jack + insert', unit: 'ea' },
  disconnect: { label: 'Disconnect switch', unit: 'ea' },
  fixture_whip: { label: 'Fixture whip', unit: 'ea' },
  wirenut: { label: 'Wire connectors', unit: 'ea' },
});

/**
 * Build the material estimate.
 *
 * Only CONFIRMED devices contribute, and that is structural: `confirmedCounts`
 * cannot return an unreviewed device. There is no flag to override it.
 */
export const estimateMaterials = (devices, { assemblies = DEFAULT_ASSEMBLIES, catalog = CATALOG } = {}) => {
  const counts = confirmedCounts(devices);
  const totals = new Map();   // item → { qty, basis, fromSymbols }

  for (const [symbolId, n] of counts) {
    for (const part of assemblies[symbolId] ?? []) {
      const cur = totals.get(part.item) ?? { qty: 0, basis: part.basis, fromSymbols: new Set() };
      cur.qty += part.qty * n;
      // A line built from mixed bases takes the weakest one. An allowance mixed
      // into a calculated total makes the whole line an allowance — rounding
      // that up to "calculated" is exactly the overclaim this module prevents.
      if (part.basis === Basis.ALLOWANCE) cur.basis = Basis.ALLOWANCE;
      cur.fromSymbols.add(symbolId);
      totals.set(part.item, cur);
    }
  }

  const lines = [...totals.entries()].map(([item, v]) => line(
    item,
    catalog[item]?.label ?? item,
    v.qty,
    catalog[item]?.unit ?? 'ea',
    v.basis,
    {
      fromSymbols: [...v.fromSymbols],
      derivation: `From ${[...v.fromSymbols].map((s) => `${counts.get(s)} × ${symbolById(s)?.label ?? s}`).join(', ')}`,
    },
  ));

  return lines.sort((a, b) => a.description.localeCompare(b.description));
};

/**
 * Lines for everything we are NOT estimating, so the omission is on the page.
 *
 * This is the part most takeoff tools skip, and it is the part that causes the
 * argument at bid time. Branch wiring, feeders, conduit and home runs cannot be
 * measured from an un-scaled plan view, so they appear with no quantity and an
 * explicit reason rather than being silently absent.
 */
export const scopeExclusions = (devices, { planScaleVerified = false } = {}) => {
  const counts = confirmedCounts(devices);
  const deviceTotal = [...counts.values()].reduce((a, b) => a + b, 0);
  const out = [];

  out.push(line('branch_wire', 'Branch circuit wire', null, 'ft',
    planScaleVerified ? Basis.ALLOWANCE : Basis.FIELD_VERIFY, {
      category: 'Wire',
      derivation: planScaleVerified
        ? 'Allowance from device count and verified plan scale. Routing, drops and waste are not modelled.'
        : 'No verified plan scale, so no length can be derived. Measure from the sheet or the field.',
    }));

  out.push(line('feeder', 'Feeders', null, 'ft', Basis.EXCLUDED, {
    category: 'Wire',
    derivation: 'Feeder sizing and routing come from the one-line and the panel schedule, not from device symbols.',
  }));

  out.push(line('home_run', 'Home runs', null, 'ft', Basis.FIELD_VERIFY, {
    category: 'Wire',
    derivation: 'Home run length depends on the actual route to the panel. The plan line is a schematic, not a path.',
  }));

  out.push(line('conduit', 'Conduit', null, 'ft', Basis.FIELD_VERIFY, {
    category: 'Raceway',
    derivation: `${deviceTotal} devices confirmed. Raceway length requires a scaled measurement or a field walk.`,
  }));

  out.push(line('supports', 'Straps, supports and fittings', null, 'lot', Basis.ALLOWANCE, {
    category: 'Raceway',
    derivation: 'Carried as a lot allowance. Cannot be counted until raceway lengths are established.',
  }));

  return out;
};

/**
 * Symbols that were confirmed but have no material assembly. Reported so an
 * empty assembly reads as "priced separately", never as "forgot to include".
 */
export const unpricedSymbols = (devices, { assemblies = DEFAULT_ASSEMBLIES } = {}) => {
  const counts = confirmedCounts(devices);
  const out = [];
  for (const [symbolId, n] of counts) {
    const parts = assemblies[symbolId];
    if (!parts || parts.length === 0) {
      out.push({
        symbolId,
        label: symbolById(symbolId)?.label ?? symbolId,
        count: n,
        reason: 'Engineered item — price from the schedule and submittal, not from the plan symbol.',
      });
    }
  }
  return out.sort((a, b) => b.count - a.count);
};

/**
 * The whole estimate, with its own trustworthiness attached.
 *
 * `readyToQuote` is false while any detection is unreviewed. A caller may still
 * render the numbers — a draft is useful — but it may not call them final, and
 * the flag is what the UI keys the disclaimer off.
 */
export const buildEstimate = (devices, options = {}) => {
  const review = reviewSummary(devices);
  const materials = estimateMaterials(devices, options);
  const exclusions = scopeExclusions(devices, options);
  const unpriced = unpricedSymbols(devices, options);
  const counts = confirmedCounts(devices);

  return Object.freeze({
    deviceCounts: Object.freeze([...counts.entries()]
      .map(([symbolId, count]) => Object.freeze({
        symbolId, label: symbolById(symbolId)?.label ?? symbolId, count, basis: Basis.COUNTED,
      }))
      .sort((a, b) => b.count - a.count)),
    materials: Object.freeze(materials),
    exclusions: Object.freeze(exclusions),
    unpriced: Object.freeze(unpriced),
    review,
    readyToQuote: review.reviewComplete,
    // Counted lines a supplier could actually fill. Everything else needs a
    // human decision first, and the split is explicit so a UI cannot blur it.
    orderableLines: materials.filter((l) => l.orderable).length,
    estimatedLines: materials.filter((l) => !l.orderable).length,
  });
};

export { DeviceState, CountBasis, isCountable };
