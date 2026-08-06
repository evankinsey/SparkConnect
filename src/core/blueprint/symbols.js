// ─── SYMBOL LIBRARY ──────────────────────────────────────────────────────────
// What Blueprint AI is allowed to believe it saw.
//
// This is a closed vocabulary on purpose. A recognizer that can emit any string
// can emit "GFCI-ish thing" or "probably a receptacle", and once that reaches a
// material list nobody can tell an estimate from a guess. Recognition output is
// matched against this table and anything unmatched becomes UNKNOWN, which is a
// real state a human resolves — not a silent drop and not a confident label.
//
// Expandable by design: adding a device is adding a row here plus its material
// assembly in materials.js. No other file changes. That is the extensibility
// the spec asks for, and it is why nothing downstream switches on a symbol id.
//
// Pure module: no React, no network, no storage.

/** Discipline, so a fire-alarm takeoff can be separated from power. */
export const Discipline = Object.freeze({
  POWER: 'POWER',
  LIGHTING: 'LIGHTING',
  FIRE_ALARM: 'FIRE_ALARM',
  LOW_VOLTAGE: 'LOW_VOLTAGE',
  DISTRIBUTION: 'DISTRIBUTION',
  MECHANICAL: 'MECHANICAL',
  ANNOTATION: 'ANNOTATION',
});

/**
 * How a symbol is counted. This drives the estimator and it is the difference
 * between a number you can order from and a number you cannot.
 *
 *   EACH        a countable device. A takeoff quantity is a real count.
 *   LINEAR      measured along a path. Requires a plan scale to mean anything.
 *   SCHEDULE    a reference to a table (panel schedule, keynote). Never a count.
 *   ANNOTATION  text and tags. Context for a human, never a material line.
 */
export const CountBasis = Object.freeze({
  EACH: 'EACH',
  LINEAR: 'LINEAR',
  SCHEDULE: 'SCHEDULE',
  ANNOTATION: 'ANNOTATION',
});

const sym = (id, label, discipline, opts = {}) => Object.freeze({
  id,
  label,
  discipline,
  basis: opts.basis ?? CountBasis.EACH,
  // Plain-language description shown in the review UI, so a first-year can tell
  // whether the thing the model circled is the thing it says it is.
  describes: opts.describes ?? label,
  // Common plan abbreviations. Used as a hint to the recognizer and to match
  // text tags near a symbol — never as proof on their own.
  tags: Object.freeze(opts.tags ?? []),
  // Devices whose symbols look alike on a sheet. When the recognizer is not
  // confident, these are what the review UI offers instead of a free-text box.
  confusableWith: Object.freeze(opts.confusableWith ?? []),
  // Set when a device cannot be counted from a plan view with any honesty.
  requiresFieldVerification: opts.requiresFieldVerification === true,
});

export const SYMBOLS = Object.freeze([
  // ── Power ──
  sym('receptacle', 'Receptacle', Discipline.POWER, {
    tags: ['R', 'REC', 'DUP'], confusableWith: ['receptacle_gfci', 'receptacle_quad', 'floor_box'],
  }),
  sym('receptacle_gfci', 'GFCI receptacle', Discipline.POWER, {
    tags: ['GFI', 'GFCI', 'GF'], confusableWith: ['receptacle', 'receptacle_wp'],
  }),
  sym('receptacle_wp', 'Weatherproof receptacle', Discipline.POWER, {
    tags: ['WP'], confusableWith: ['receptacle_gfci'],
  }),
  sym('receptacle_quad', 'Quad receptacle', Discipline.POWER, {
    tags: ['QUAD'], confusableWith: ['receptacle'],
  }),
  sym('receptacle_special', 'Special-purpose outlet', Discipline.POWER, {
    tags: ['SP', 'SPO'], describes: 'Dedicated or non-standard configuration outlet',
    requiresFieldVerification: true,
  }),
  sym('floor_box', 'Floor box', Discipline.POWER, {
    tags: ['FB'], confusableWith: ['receptacle', 'junction_box'],
  }),
  sym('ev_charger', 'EV charging equipment', Discipline.POWER, { tags: ['EVSE', 'EV'] }),
  sym('motor', 'Motor', Discipline.MECHANICAL, { tags: ['M'] }),
  sym('vfd', 'Variable frequency drive', Discipline.MECHANICAL, { tags: ['VFD'] }),

  // ── Switching ──
  sym('switch_single', 'Single-pole switch', Discipline.LIGHTING, {
    tags: ['S', 'S1'], confusableWith: ['switch_three_way', 'switch_four_way', 'switch_dimmer'],
  }),
  sym('switch_three_way', 'Three-way switch', Discipline.LIGHTING, {
    tags: ['S3'], confusableWith: ['switch_single', 'switch_four_way'],
  }),
  sym('switch_four_way', 'Four-way switch', Discipline.LIGHTING, {
    tags: ['S4'], confusableWith: ['switch_three_way'],
  }),
  sym('switch_dimmer', 'Dimmer', Discipline.LIGHTING, {
    tags: ['SD', 'DIM'], confusableWith: ['switch_single'],
  }),
  sym('occupancy_sensor', 'Occupancy sensor', Discipline.LIGHTING, {
    tags: ['OS', 'OCC'], confusableWith: ['smoke_detector', 'photocell'],
  }),
  sym('photocell', 'Photocell', Discipline.LIGHTING, {
    tags: ['PC'], confusableWith: ['occupancy_sensor'],
  }),

  // ── Lighting ──
  sym('light', 'Light fixture', Discipline.LIGHTING, {
    tags: ['L', 'LT'], confusableWith: ['light_emergency', 'exit_sign'],
  }),
  sym('light_emergency', 'Emergency light', Discipline.LIGHTING, {
    tags: ['EM', 'EL'], confusableWith: ['light', 'exit_sign'],
  }),
  sym('exit_sign', 'Exit sign', Discipline.LIGHTING, {
    tags: ['X', 'EXIT'], confusableWith: ['light_emergency'],
  }),

  // ── Distribution ──
  sym('panel', 'Panelboard', Discipline.DISTRIBUTION, {
    tags: ['P', 'PNL'], confusableWith: ['subpanel', 'disconnect'],
  }),
  sym('subpanel', 'Subpanel', Discipline.DISTRIBUTION, {
    tags: ['SP'], confusableWith: ['panel'],
  }),
  sym('transformer', 'Transformer', Discipline.DISTRIBUTION, { tags: ['XFMR', 'T'] }),
  sym('disconnect', 'Disconnect switch', Discipline.DISTRIBUTION, {
    tags: ['DISC', 'DS'], confusableWith: ['panel', 'junction_box'],
  }),
  sym('junction_box', 'Junction box', Discipline.POWER, {
    tags: ['J', 'JB'], confusableWith: ['pull_box', 'floor_box'],
  }),
  sym('pull_box', 'Pull box', Discipline.POWER, {
    tags: ['PB'], confusableWith: ['junction_box'],
  }),

  // ── Fire alarm ──
  sym('smoke_detector', 'Smoke detector', Discipline.FIRE_ALARM, {
    tags: ['SD', 'S'], confusableWith: ['occupancy_sensor', 'fa_device'],
  }),
  sym('horn_strobe', 'Horn / strobe', Discipline.FIRE_ALARM, {
    tags: ['HS', 'H/S'], confusableWith: ['fa_device'],
  }),
  sym('fa_device', 'Fire alarm device', Discipline.FIRE_ALARM, {
    tags: ['FA'], describes: 'Fire alarm device, type not determined from the symbol',
    requiresFieldVerification: true,
  }),

  // ── Low voltage ──
  sym('data_drop', 'Data / comm outlet', Discipline.LOW_VOLTAGE, {
    tags: ['D', 'DATA', 'TEL'], confusableWith: ['receptacle'],
  }),

  // ── Measured, not counted ──
  sym('conduit_run', 'Conduit run', Discipline.POWER, {
    basis: CountBasis.LINEAR,
    describes: 'A raceway path. Length is meaningless without a verified plan scale.',
    requiresFieldVerification: true,
  }),
  sym('home_run', 'Home run', Discipline.POWER, {
    basis: CountBasis.LINEAR,
    describes: 'Circuit run back to a panel. Length depends on routing, not on the plan line.',
    requiresFieldVerification: true,
  }),

  // ── Reference material, never a material line ──
  sym('panel_schedule', 'Panel schedule', Discipline.ANNOTATION, { basis: CountBasis.SCHEDULE }),
  sym('legend', 'Legend', Discipline.ANNOTATION, { basis: CountBasis.SCHEDULE }),
  sym('keynote', 'Keynote', Discipline.ANNOTATION, { basis: CountBasis.ANNOTATION }),
  sym('general_note', 'General note', Discipline.ANNOTATION, { basis: CountBasis.ANNOTATION }),
  sym('wire_tag', 'Wire / circuit tag', Discipline.ANNOTATION, { basis: CountBasis.ANNOTATION }),

  // ── The honest fallback ──
  // Not an error state. A recognizer that says "something is here and I do not
  // know what" is more useful than one that guesses, because a human can resolve
  // it in two seconds and a wrong label survives to the material list.
  sym('unknown', 'Unidentified symbol', Discipline.ANNOTATION, {
    basis: CountBasis.ANNOTATION,
    describes: 'Something was detected here that does not match a known symbol.',
    requiresFieldVerification: true,
  }),
]);

export const SYMBOL_IDS = Object.freeze(SYMBOLS.map((s) => s.id));
const BY_ID = new Map(SYMBOLS.map((s) => [s.id, s]));

export const symbolById = (id) => BY_ID.get(id) ?? null;
export const isKnownSymbol = (id) => BY_ID.has(id);

export const UNKNOWN_SYMBOL = symbolById('unknown');

/**
 * Coerce recognizer output to a symbol we understand.
 *
 * Never throws and never guesses: an unrecognised id becomes UNKNOWN so a human
 * sees it in review. Silently dropping it would make a device disappear from a
 * count, which is the one failure an estimator cannot detect by reading the
 * output.
 */
export const resolveSymbol = (id) => {
  if (typeof id !== 'string') return UNKNOWN_SYMBOL;
  const direct = BY_ID.get(id.trim());
  if (direct) return direct;
  const lower = id.trim().toLowerCase();
  const byLower = SYMBOLS.find((s) => s.id.toLowerCase() === lower);
  if (byLower) return byLower;
  const byTag = SYMBOLS.find((s) => s.tags.some((t) => t.toLowerCase() === lower));
  return byTag ?? UNKNOWN_SYMBOL;
};

/** Symbols a human should be offered when a detection is ambiguous. */
export const alternativesFor = (id) => {
  const s = symbolById(id);
  if (!s) return [];
  return s.confusableWith.map(symbolById).filter(Boolean);
};

/** Can a quantity of this symbol ever be a defensible count? */
export const isCountable = (id) => symbolById(id)?.basis === CountBasis.EACH;

export const symbolsByDiscipline = (discipline) =>
  SYMBOLS.filter((s) => s.discipline === discipline);
