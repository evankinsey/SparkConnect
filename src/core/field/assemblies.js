// ─── ASSEMBLIES AND LABOR UNITS ──────────────────────────────────────────────
// The answer to "should Blueprint Takeoff be more like estimating software?"
// Yes — and this is the piece that makes it one.
//
// A device count is not a bid. An estimator does not buy "24 receptacles", they
// buy 24 devices, 24 boxes, 24 plaster rings, 24 plates, the wire to reach
// them, and they price the HOURS to install all of it. That expansion — one
// counted symbol into the full bill of material plus the labor to hang it — is
// an assembly, and it is the whole job of estimating software.
//
// Two honesty rules, both load-bearing:
//
//   1. LABOR UNITS ARE A STARTING POINT, NOT A QUOTE. Real labor units come
//      from NECA MLU or a contractor's own history, vary by crew, and are the
//      contractor's competitive advantage. These are conservative round
//      numbers for a residential/light-commercial rough-in, and every surface
//      that shows them has to say so and let them be overridden.
//
//   2. WIRE IS AN ALLOWANCE, NOT A MEASUREMENT. A device count cannot know
//      routing. The per-device wire figure here is an explicit, labelled
//      ALLOWANCE the estimator adjusts once they know the runs — it is never
//      presented as a measured quantity.
//
// Pure module: no React, no network, no pricing data.

import { TAKEOFF_ITEMS, takeoffRows } from './takeoff.js';

/**
 * Hours per unit, and the material that goes with one counted symbol.
 *
 * `wireAllowanceFt` is per device and deliberately generous-but-labelled: it
 * covers the drop plus makeup, not the homerun. Homeruns are added per circuit
 * by the estimator because a takeoff cannot see the panel location.
 */
export const ASSEMBLIES = Object.freeze({
  receptacles: {
    label: 'Receptacle, 15/20A duplex',
    laborHours: 0.5,
    wireAllowanceFt: 25,
    materials: [
      { item: 'Duplex receptacle', qty: 1, unit: 'ea' },
      { item: 'Device box', qty: 1, unit: 'ea' },
      { item: 'Plaster ring', qty: 1, unit: 'ea' },
      { item: 'Wall plate', qty: 1, unit: 'ea' },
      { item: 'Wire connectors', qty: 3, unit: 'ea' },
    ],
  },
  switches: {
    label: 'Switch, single pole',
    laborHours: 0.45,
    wireAllowanceFt: 25,
    materials: [
      { item: 'Single pole switch', qty: 1, unit: 'ea' },
      { item: 'Device box', qty: 1, unit: 'ea' },
      { item: 'Plaster ring', qty: 1, unit: 'ea' },
      { item: 'Wall plate', qty: 1, unit: 'ea' },
      { item: 'Wire connectors', qty: 3, unit: 'ea' },
    ],
  },
  lights: {
    label: 'Luminaire outlet',
    laborHours: 0.75,
    wireAllowanceFt: 30,
    materials: [
      { item: 'Fixture outlet box', qty: 1, unit: 'ea' },
      { item: 'Fixture whip / connector', qty: 1, unit: 'ea' },
      { item: 'Wire connectors', qty: 3, unit: 'ea' },
    ],
  },
  fans: {
    label: 'Fan outlet, braced',
    laborHours: 1.1,
    wireAllowanceFt: 30,
    materials: [
      { item: 'Fan-rated box with brace', qty: 1, unit: 'ea' },
      { item: 'Wire connectors', qty: 4, unit: 'ea' },
    ],
  },
  panels: {
    label: 'Panelboard set and trim',
    laborHours: 6,
    wireAllowanceFt: 0,
    materials: [
      { item: 'Panelboard', qty: 1, unit: 'ea' },
      { item: 'Panel schedule / labels', qty: 1, unit: 'ea' },
      { item: 'Grounding bar kit', qty: 1, unit: 'ea' },
    ],
  },
  disconnects: {
    label: 'Disconnect switch',
    laborHours: 1.5,
    wireAllowanceFt: 15,
    materials: [
      { item: 'Disconnect switch', qty: 1, unit: 'ea' },
      { item: 'Weatherproof fittings', qty: 2, unit: 'ea' },
    ],
  },
  smokeDetectors: {
    label: 'Smoke / CO detector',
    laborHours: 0.6,
    wireAllowanceFt: 25,
    materials: [
      { item: 'Smoke/CO detector', qty: 1, unit: 'ea' },
      { item: 'Detector box', qty: 1, unit: 'ea' },
      { item: 'Wire connectors', qty: 3, unit: 'ea' },
    ],
  },
  dataJacks: {
    label: 'Data / comm outlet',
    laborHours: 0.5,
    wireAllowanceFt: 40,
    materials: [
      { item: 'Data jack + faceplate', qty: 1, unit: 'ea' },
      { item: 'Low-voltage ring', qty: 1, unit: 'ea' },
    ],
  },
  junctionBoxes: {
    label: 'Junction box',
    laborHours: 0.4,
    wireAllowanceFt: 10,
    materials: [
      { item: 'Junction box + cover', qty: 1, unit: 'ea' },
      { item: 'Wire connectors', qty: 4, unit: 'ea' },
    ],
  },
});

export const assemblyFor = (itemId) => ASSEMBLIES[itemId] ?? null;

export const LABOR_DISCLAIMER =
  'Labor units are conservative starting points for residential and light ' +
  'commercial rough-in, not a quote. Replace them with your own historical ' +
  'units before you bid.';

export const WIRE_DISCLAIMER =
  'Wire is an ALLOWANCE per device covering the drop and makeup, not a measured ' +
  'quantity. It does not include homeruns. Adjust once you know the routing.';

/** Round to two decimals without float noise. */
const r2 = (n) => Math.round(n * 100) / 100;

/**
 * Expand a validated takeoff into a bill of material plus labor.
 *
 * @param takeoff       from validateTakeoff()
 * @param opts.laborRatePerHour   dollars; only used for the labor subtotal
 * @param opts.wasteFactor        0.10 = 10% added to wire only
 * @param opts.laborOverrides     { [itemId]: hours } to use a contractor's own units
 */
export const expandTakeoff = (takeoff, {
  laborRatePerHour = 0,
  wasteFactor = 0.1,
  laborOverrides = {},
} = {}) => {
  const rows = takeoffRows(takeoff);
  const materialMap = new Map();
  const laborRows = [];
  let wireFt = 0;
  let totalHours = 0;

  const addMaterial = (item, qty, unit) => {
    const key = `${item}|${unit}`;
    materialMap.set(key, { item, unit, qty: (materialMap.get(key)?.qty ?? 0) + qty });
  };

  for (const row of rows) {
    const asm = assemblyFor(row.id);
    if (!asm) continue;

    for (const m of asm.materials) addMaterial(m.item, m.qty * row.count, m.unit);
    wireFt += (asm.wireAllowanceFt ?? 0) * row.count;

    const override = laborOverrides[row.id];
    const hoursEach = typeof override === 'number' && Number.isFinite(override) && override >= 0
      ? override
      : asm.laborHours;
    const hours = r2(hoursEach * row.count);
    totalHours += hours;
    laborRows.push({
      id: row.id,
      label: asm.label,
      count: row.count,
      hoursEach,
      hours,
      overridden: hoursEach !== asm.laborHours,
    });
  }

  const waste = Number.isFinite(wasteFactor) && wasteFactor >= 0 ? wasteFactor : 0;
  const wireWithWaste = Math.ceil(wireFt * (1 + waste));
  if (wireWithWaste > 0) {
    addMaterial(`Branch wire allowance (incl. ${Math.round(waste * 100)}% waste)`, wireWithWaste, 'ft');
  }

  const rate = Number.isFinite(laborRatePerHour) && laborRatePerHour > 0 ? laborRatePerHour : 0;
  totalHours = r2(totalHours);

  return {
    materials: [...materialMap.values()].sort((a, b) => a.item.localeCompare(b.item)),
    labor: laborRows,
    totalHours,
    laborRatePerHour: rate,
    laborSubtotal: r2(totalHours * rate),
    wireAllowanceFt: wireWithWaste,
    wasteFactor: waste,
    // Carried through so the screen cannot show a bid without the caveat.
    needsReview: !!takeoff?.needsReview,
    laborDisclaimer: LABOR_DISCLAIMER,
    wireDisclaimer: WIRE_DISCLAIMER,
  };
};

/**
 * Estimator-facing summary line. Deliberately says "hours", not "price", when
 * no rate has been entered — an estimate of zero dollars is worse than none.
 */
export const expansionSummary = (exp) => {
  if (!exp) return '';
  const parts = [`${exp.materials.length} material lines`, `${exp.totalHours} labor hours`];
  if (exp.laborRatePerHour > 0) parts.push(`$${exp.laborSubtotal.toFixed(2)} labor`);
  return parts.join(' · ');
};
