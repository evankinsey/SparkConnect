// ─── PRICE BOOK ──────────────────────────────────────────────────────────────
// "Search 12/2 NM, get average pricing."
//
// What this file deliberately does NOT do: scrape supplier websites. The brief
// said to use official APIs or other compliant sources and not to scrape in
// ways that violate terms, and that constraint is architectural, not a
// footnote — a scraper would be the fastest way to build this and the fastest
// way to lose the app.
//
// So the price book is SOURCE-AGNOSTIC. Every price carries where it came from
// and when, and the lookup order is:
//
//   1. The contractor's own prices. Their real supplier cost beats any
//      national average, and it is the only number they can actually bid.
//   2. A connected supplier account, once one is wired up. `SUPPLIER_ADAPTERS`
//      is the seam that takes; nothing is hardcoded to a vendor.
//   3. Nothing. An unknown price is left blank rather than guessed, because an
//      invented material cost is worse than a missing one on a bid.
//
// Pure module: no React, no network. An adapter does the fetching; this decides
// what is allowed to become a price.

export const PriceSource = {
  USER: 'USER',            // typed in by the contractor
  SUPPLIER: 'SUPPLIER',    // returned by a connected account
  UNKNOWN: 'UNKNOWN',
};

/**
 * Registered supplier integrations. Empty on purpose: an adapter goes in here
 * only once there is an official API and an agreement behind it. The rest of
 * the app already works with zero adapters.
 */
export const SUPPLIER_ADAPTERS = Object.freeze([]);

export const PRICE_LIMITS = Object.freeze({
  name: 80,
  unit: 16,
  note: 200,
  maxCents: 100000000,   // $1,000,000 a unit — anything above is a typo
  staleDays: 90,
});

const clean = (v, max) => {
  if (typeof v !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max) : s;
};

/** Normalize for matching: case, punctuation and spacing all vary by supplier. */
export const normalizeKey = (name) =>
  clean(name, PRICE_LIMITS.name).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Validate a price entry. Cents only — floats do not belong in money, and
 * money.js already works in cents throughout.
 */
export const priceEntry = ({ name, unit = 'ea', cents, source = PriceSource.USER, at = null, note = '' }) => {
  const cleanName = clean(name, PRICE_LIMITS.name);
  if (!cleanName) return { ok: false, reason: 'name required' };
  if (!Number.isInteger(cents) || cents < 0 || cents > PRICE_LIMITS.maxCents) {
    return { ok: false, reason: 'price must be a whole number of cents within range' };
  }
  if (!Object.values(PriceSource).includes(source)) return { ok: false, reason: 'unknown source' };
  return {
    ok: true,
    entry: {
      key: normalizeKey(cleanName),
      name: cleanName,
      unit: clean(unit, PRICE_LIMITS.unit) || 'ea',
      cents,
      source,
      at: Number.isFinite(at) ? at : Date.now(),
      note: clean(note, PRICE_LIMITS.note),
    },
  };
};

export const emptyPriceBook = () => ({ entries: [] });

/** Upsert by key + unit. A newer price for the same thing replaces the old. */
export const putPrice = (book, entry) => {
  const b = book ?? emptyPriceBook();
  const rest = b.entries.filter((e) => !(e.key === entry.key && e.unit === entry.unit));
  return { entries: [...rest, entry] };
};

export const removePrice = (book, key, unit) => ({
  entries: (book?.entries ?? []).filter((e) => !(e.key === key && e.unit === unit)),
});

/**
 * Look a price up. Contractor prices win over supplier prices for the same
 * item, always — see rule 1 at the top of this file.
 */
export const lookupPrice = (book, name, unit = 'ea', now = Date.now()) => {
  const key = normalizeKey(name);
  const matches = (book?.entries ?? []).filter((e) => e.key === key && e.unit === unit);
  if (matches.length === 0) return { found: false, source: PriceSource.UNKNOWN, cents: null };

  const byPriority = [...matches].sort((a, b) => {
    if (a.source !== b.source) return a.source === PriceSource.USER ? -1 : 1;
    return b.at - a.at;
  });
  const hit = byPriority[0];
  const ageDays = Math.floor((now - hit.at) / 86400000);
  return {
    found: true,
    cents: hit.cents,
    unit: hit.unit,
    source: hit.source,
    at: hit.at,
    ageDays,
    // Copper moves. A three-month-old price is a starting point, not a cost.
    stale: ageDays > PRICE_LIMITS.staleDays,
  };
};

/** Free-text search over the book, for the lookup screen. */
export const searchPrices = (book, query, limit = 25) => {
  const q = normalizeKey(query);
  if (!q) return (book?.entries ?? []).slice(0, limit);
  return (book?.entries ?? [])
    .filter((e) => e.key.includes(q))
    .sort((a, b) => a.key.length - b.key.length)
    .slice(0, limit);
};

/**
 * Price a material list from the book. Unpriced lines come back explicitly
 * unpriced — never zero, which would quietly understate a bid.
 */
export const priceMaterials = (book, materials, now = Date.now()) => {
  const rows = (materials ?? []).map((m) => {
    const hit = lookupPrice(book, m.item, m.unit ?? 'ea', now);
    return {
      ...m,
      unitCents: hit.found ? hit.cents : null,
      extendedCents: hit.found ? Math.round(hit.cents * (m.qty ?? 0)) : null,
      priceSource: hit.source,
      stale: !!hit.stale,
    };
  });
  const priced = rows.filter((r) => r.extendedCents !== null);
  return {
    rows,
    subtotalCents: priced.reduce((sum, r) => sum + r.extendedCents, 0),
    pricedCount: priced.length,
    unpricedCount: rows.length - priced.length,
    // The screen must show this: a subtotal over a partial book is not a total.
    complete: rows.length > 0 && priced.length === rows.length,
    staleCount: rows.filter((r) => r.stale).length,
  };
};

export const PRICE_DISCLAIMER =
  'Prices are the ones you entered or your connected supplier returned. ' +
  'SparkConnect does not scrape supplier sites and does not publish national ' +
  'averages. Unpriced lines are left blank rather than estimated.';
