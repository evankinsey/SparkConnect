// ─── MATERIAL LIST GENERATOR ─────────────────────────────────────────────────
// Estimate → shopping list → supplier order.
//
// The workflow this replaces: writing an estimate, then separately writing a
// materials list from memory at 6am in the supply house car park. Everything
// needed is already in the estimate.
//
// Pricing note: this module NEVER invents a price. A material list carries the
// prices a contractor entered on their own estimate, plus optional prices from a
// supplied catalogue. There is no built-in price database, because a wrong price
// in a shopping list costs real money and regional variation is enormous.

import { LineItemKind } from './money.js';

export const Unit = {
  EACH: 'EACH', FOOT: 'FOOT', HUNDRED_FEET: 'HUNDRED_FEET',
  BOX: 'BOX', ROLL: 'ROLL', SPOOL: 'SPOOL', LENGTH: 'LENGTH',
};

// Common packaging, so a list can round up to what a supplier actually sells.
export const PACKAGING = Object.freeze({
  '#12 THHN': { unit: Unit.SPOOL, packSize: 500, packUnit: Unit.FOOT },
  '#14 THHN': { unit: Unit.SPOOL, packSize: 500, packUnit: Unit.FOOT },
  '#12-2 NM': { unit: Unit.ROLL, packSize: 250, packUnit: Unit.FOOT },
  '#14-2 NM': { unit: Unit.ROLL, packSize: 250, packUnit: Unit.FOOT },
  '1/2 EMT': { unit: Unit.LENGTH, packSize: 10, packUnit: Unit.FOOT },
  '3/4 EMT': { unit: Unit.LENGTH, packSize: 10, packUnit: Unit.FOOT },
  '1 EMT': { unit: Unit.LENGTH, packSize: 10, packUnit: Unit.FOOT },
});

export const materialItem = ({
  id, description, quantity = 0, unit = Unit.EACH,
  unitPriceCents = null, sourceLineItemId = null, category = 'GENERAL', notes = '',
}) => ({
  id, description, quantity, unit, unitPriceCents, sourceLineItemId, category, notes,
  purchased: false,
});

/**
 * Build a material list from an estimate or invoice.
 *
 * Only MATERIAL line items are pulled — labour is not something you buy. Items
 * with the same description are merged so "12 boxes" and "8 boxes" become "20
 * boxes" rather than two lines to reconcile in the aisle.
 */
export const materialListFromDocument = (doc, { id, createdAt, wastePercent = 0 } = {}) => {
  const merged = new Map();

  for (const li of doc.lineItems ?? []) {
    if (li.kind !== LineItemKind.MATERIAL) continue;
    const key = li.description.trim().toLowerCase();
    const existing = merged.get(key);
    if (existing) {
      existing.quantity += li.quantity;
      existing.sourceLineItemIds.push(li.id);
      // Keep the highest unit price seen — under-budgeting is the worse error.
      // A null on either side means "not priced yet" and must not be read as 0.
      if (li.unitPriceCents != null) {
        existing.unitPriceCents = existing.unitPriceCents == null
          ? li.unitPriceCents
          : Math.max(existing.unitPriceCents, li.unitPriceCents);
      }
    } else {
      merged.set(key, {
        id: `${id}-${merged.size + 1}`,
        description: li.description.trim(),
        quantity: li.quantity,
        unit: Unit.EACH,
        unitPriceCents: li.unitPriceCents ?? null,
        sourceLineItemIds: [li.id],
        category: 'GENERAL',
        purchased: false,
      });
    }
  }

  const items = [...merged.values()].map((item) => {
    // Integer math on purpose. `200 * 1.1` is 220.00000000000003, and
    // Math.ceil turns that into an extra length of EMT on every order.
    const withWaste = wastePercent > 0
      ? Math.ceil((item.quantity * (100 + wastePercent)) / 100)
      : item.quantity;
    return { ...item, quantity: withWaste, baseQuantity: item.quantity };
  });

  return {
    id,
    createdAt,
    sourceDocumentId: doc.id,
    sourceDocumentNumber: doc.number,
    wastePercent,
    items,
    // Only meaningful if every item carried a price. A partial total is worse
    // than no total, because it looks authoritative.
    estimatedTotalCents: items.every((i) => i.unitPriceCents != null)
      ? items.reduce((sum, i) => sum + Math.round(i.quantity * i.unitPriceCents), 0)
      : null,
    pricesComplete: items.every((i) => i.unitPriceCents != null),
  };
};

/** Round quantities up to purchasable packs where packaging is known. */
export const applyPackaging = (list) => ({
  ...list,
  items: list.items.map((item) => {
    const pack = Object.entries(PACKAGING)
      .find(([name]) => item.description.toLowerCase().includes(name.toLowerCase()));
    if (!pack) return item;
    const [, spec] = pack;
    const packs = Math.ceil(item.quantity / spec.packSize);
    return {
      ...item,
      packaging: {
        packs,
        packSize: spec.packSize,
        packUnit: spec.packUnit,
        totalOrdered: packs * spec.packSize,
        surplus: packs * spec.packSize - item.quantity,
      },
    };
  }),
});

export const togglePurchased = (list, itemId) => ({
  ...list,
  items: list.items.map((i) => (i.id === itemId ? { ...i, purchased: !i.purchased } : i)),
});

export const listProgress = (list) => {
  const total = list.items.length;
  const done = list.items.filter((i) => i.purchased).length;
  return { total, done, remaining: total - done, percent: total ? Math.round((done / total) * 100) : 0 };
};

/**
 * Plain-text export for a text message or email to a supplier. Deliberately
 * boring: suppliers read texts, not app links, and this has to survive being
 * pasted anywhere.
 */
export const toSupplierText = (list, { businessName = '', reference = '' } = {}) => {
  const lines = [];
  if (businessName) lines.push(businessName);
  lines.push(`Material list${reference ? ` — ${reference}` : ''}`);
  lines.push('');
  for (const item of list.items) {
    const qty = item.packaging
      ? `${item.packaging.packs} × ${item.packaging.packSize} ${item.packaging.packUnit.toLowerCase()}`
      : `${item.quantity}`;
    lines.push(`${qty}  ${item.description}`);
  }
  if (list.wastePercent > 0) {
    lines.push('', `Quantities include ${list.wastePercent}% waste allowance.`);
  }
  return lines.join('\n');
};

// ─── Price catalogue (shape only) ────────────────────────────────────────────
//
// Deliberately empty. A material price database needs a real regional data
// source with a refresh date; inventing prices would produce a contractor
// quoting a job on numbers we made up. The interface exists so a real source can
// be plugged in without touching the list generator.

export const priceEntry = ({ sku, description, unit, priceCents, region, observedAt, source }) => ({
  sku, description, unit, priceCents, region, observedAt, source,
  // Prices go stale fast. The UI must show the age, not just the number.
  staleAfterDays: 30,
});

export const isPriceStale = (entry, today, dayGapFn) =>
  !entry?.observedAt || dayGapFn(entry.observedAt, today) > (entry.staleAfterDays ?? 30);

export const createPriceCatalogue = () => {
  const providers = [];
  return {
    register: (provider) => {
      if (typeof provider?.lookup !== 'function') throw new Error('A price provider needs a lookup() function');
      providers.push(provider);
      return provider.id;
    },
    lookup: async (description, region) => {
      for (const p of providers) {
        const hit = await p.lookup(description, region);
        if (hit) return hit;
      }
      return null;   // no guess, no fabricated price
    },
    providerCount: () => providers.length,
  };
};

/** Attach catalogue prices to a list, marking which came from where. */
export const priceList = async (list, catalogue, region) => {
  const items = [];
  for (const item of list.items) {
    if (item.unitPriceCents != null) { items.push({ ...item, priceSource: 'ESTIMATE' }); continue; }
    const hit = await catalogue.lookup(item.description, region);
    items.push(hit
      ? { ...item, unitPriceCents: hit.priceCents, priceSource: hit.source, priceObservedAt: hit.observedAt }
      : { ...item, priceSource: null });
  }
  return {
    ...list,
    items,
    pricesComplete: items.every((i) => i.unitPriceCents != null),
    estimatedTotalCents: items.every((i) => i.unitPriceCents != null)
      ? items.reduce((sum, i) => sum + Math.round(i.quantity * i.unitPriceCents), 0)
      : null,
  };
};
