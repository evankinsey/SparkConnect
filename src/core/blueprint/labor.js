// ─── LABOR ───────────────────────────────────────────────────────────────────
// Hours from confirmed device counts, with every number a company can override.
//
// Labor units are the most opinionated part of any estimate and the part every
// contractor believes their own numbers on. So nothing here is authoritative:
// the defaults are a starting point, clearly labelled as such, and the override
// chain is the actual product.
//
//   default unit  →  company library  →  project override
//
// Later specific wins. A company that has run this work for twenty years has
// better numbers than we do, and the software's job is to get out of the way
// while keeping the arithmetic and the audit trail straight.
//
// Units are hours per device, "rough-in plus trim" unless noted, and they are
// deliberately round. Publishing 0.47 hours implies a precision nobody has;
// RSMeans-grade data would slot in through the same override mechanism.
//
// Pure module: no React, no network, no storage.

import { confirmedCounts, reviewSummary } from './device.js';
import { symbolById } from './symbols.js';
import { Basis, BASIS_LABEL } from './estimate.js';

/** Conditions that move real labor and that an estimator adjusts for. */
export const ConditionFactor = Object.freeze({
  NEW_CONSTRUCTION: { id: 'NEW_CONSTRUCTION', label: 'New construction', factor: 1.0 },
  RENOVATION: { id: 'RENOVATION', label: 'Renovation / occupied', factor: 1.35 },
  HIGH_CEILING: { id: 'HIGH_CEILING', label: 'High ceiling / lift required', factor: 1.25 },
  OVERTIME: { id: 'OVERTIME', label: 'Off-hours / night work', factor: 1.15 },
  CONGESTED: { id: 'CONGESTED', label: 'Congested ceiling space', factor: 1.2 },
});

/**
 * Default hours per device. A starting point, not a claim.
 * Anything absent from this table gets no hours and is REPORTED — see
 * `unratedSymbols`. Silently costing an unknown device at zero is how an
 * estimate loses money.
 */
export const DEFAULT_LABOR_UNITS = Object.freeze({
  receptacle: 0.5,
  receptacle_gfci: 0.6,
  receptacle_wp: 0.75,
  receptacle_quad: 0.75,
  floor_box: 2.0,
  switch_single: 0.5,
  switch_three_way: 0.65,
  switch_four_way: 0.8,
  switch_dimmer: 0.6,
  occupancy_sensor: 0.75,
  photocell: 0.5,
  light: 1.0,
  light_emergency: 1.25,
  exit_sign: 1.0,
  junction_box: 0.4,
  pull_box: 1.0,
  data_drop: 0.5,
  smoke_detector: 0.75,
  horn_strobe: 0.75,
  disconnect: 1.5,
});

/**
 * Resolve the unit for one symbol through the override chain, reporting which
 * level supplied it so an estimate can show whose number it used.
 */
export const resolveUnit = (symbolId, { companyUnits = {}, projectUnits = {} } = {}) => {
  if (Object.prototype.hasOwnProperty.call(projectUnits, symbolId)) {
    return { hours: Number(projectUnits[symbolId]), source: 'PROJECT' };
  }
  if (Object.prototype.hasOwnProperty.call(companyUnits, symbolId)) {
    return { hours: Number(companyUnits[symbolId]), source: 'COMPANY' };
  }
  if (Object.prototype.hasOwnProperty.call(DEFAULT_LABOR_UNITS, symbolId)) {
    return { hours: DEFAULT_LABOR_UNITS[symbolId], source: 'DEFAULT' };
  }
  return { hours: null, source: 'NONE' };
};

/**
 * Was a rate actually supplied? Number(null) and Number('') are both 0, and 0
 * is finite — so the obvious guard reads "no rate" as "free".
 */
const hasRate = (rate) =>
  rate !== null && rate !== undefined && rate !== '' && Number.isFinite(Number(rate));

export const combinedFactor = (conditionIds = []) =>
  conditionIds.reduce((acc, id) => acc * (ConditionFactor[id]?.factor ?? 1), 1);

/** Confirmed symbols with no labor unit at any level. Never costed at zero. */
export const unratedSymbols = (devices, options = {}) => {
  const out = [];
  for (const [symbolId, count] of confirmedCounts(devices)) {
    if (resolveUnit(symbolId, options).hours === null) {
      out.push({
        symbolId,
        label: symbolById(symbolId)?.label ?? symbolId,
        count,
        reason: 'No labor unit set. Add one in your company library, or price this scope separately.',
      });
    }
  }
  return out.sort((a, b) => b.count - a.count);
};

/**
 * Build the labor estimate.
 *
 * Returns per-symbol lines plus a total. The total EXCLUDES unrated symbols by
 * construction and says so in `unrated`, so the number is never quietly short.
 */
export const estimateLabor = (devices, options = {}) => {
  const { conditions = [], rate = null } = options;
  const factor = combinedFactor(conditions);
  const counts = confirmedCounts(devices);

  const lines = [];
  let baseHours = 0;

  for (const [symbolId, count] of counts) {
    const { hours, source } = resolveUnit(symbolId, options);
    if (hours === null || !Number.isFinite(hours)) continue;
    const subtotal = hours * count;
    baseHours += subtotal;
    lines.push(Object.freeze({
      symbolId,
      label: symbolById(symbolId)?.label ?? symbolId,
      count,
      unitHours: hours,
      unitSource: source,
      hours: Math.round(subtotal * 100) / 100,
      basis: Basis.ALLOWANCE,
      basisLabel: BASIS_LABEL[Basis.ALLOWANCE],
      derivation: `${count} × ${hours} hr (${source.toLowerCase()} unit)`,
    }));
  }

  const adjusted = baseHours * factor;
  const unrated = unratedSymbols(devices, options);
  const review = reviewSummary(devices);

  return Object.freeze({
    lines: Object.freeze(lines.sort((a, b) => b.hours - a.hours)),
    baseHours: Math.round(baseHours * 100) / 100,
    factor: Math.round(factor * 1000) / 1000,
    conditions: Object.freeze(conditions.map((id) => ConditionFactor[id]).filter(Boolean)),
    totalHours: Math.round(adjusted * 100) / 100,
    // Cost only when a rate was supplied. Inventing a labor rate would be
    // exactly the kind of confident fiction this whole feature is built against.
    //
    // The null check is deliberate and load-bearing: Number(null) is 0 and 0 is
    // finite, so a plain Number.isFinite guard turned "no rate given" into a
    // total cost of $0.00 — a confident, wrong, free estimate. A test caught it.
    rate: hasRate(rate) ? Number(rate) : null,
    totalCost: hasRate(rate) ? Math.round(adjusted * Number(rate) * 100) / 100 : null,
    unrated: Object.freeze(unrated),
    // Same gate as the material estimate: a draft is fine, "final" is not.
    readyToQuote: review.reviewComplete && unrated.length === 0,
    excludes: Object.freeze([
      'Feeder and service work',
      'Conduit installation labor — depends on raceway lengths that are not established',
      'Trenching, core drilling, firestopping, and patching',
      'Testing, commissioning, and closeout documentation',
    ]),
  });
};
