// ─── QUANTITIES → ESTIMATE → INVOICE ─────────────────────────────────────────
// The bridge between the Material Estimator's field quantities and the document
// layer that already knows how to be an estimate and an invoice.
//
// WHY A BRIDGE AND NOT A NEW MODEL. documents.js already has both documents,
// their status machines, the conversion, secure share tokens and an audit
// trail; money.js already has cents, line items and totals with payments folded
// in. Inventing a second Estimate next to those would give the app two ideas of
// what a job costs, which is the failure that produces an invoice disagreeing
// with the estimate it came from. So this file only does the part that was
// genuinely missing: turning "10 receptacles, 200 ft of romex" into line items
// those models can carry.
//
// Invoice is NOT a separate tool. It is the last stage of the estimator, and
// the conversion is explicit — see documents.convertEstimateToInvoice, which
// refuses anything that has not been accepted and hands the invoice a COPY of
// the line items. An invoice edited afterwards must never rewrite the estimate
// somebody already agreed to.
//
// Pure module: no React, no storage, no network.

import { toCents, lineItem, LineItemKind } from './money.js';

/**
 * The takeoff, as line items.
 *
 * THE ARITHMETIC IS THE ESTIMATOR'S, UNCHANGED. Box counts, breaker counts and
 * the wire allowance are the same expressions the screen has always used —
 * moved here so the estimate and the on-screen list cannot drift apart, not
 * rewritten. Anything altered here changes a number somebody orders against.
 *
 * `unitPriceCents` is 0 by default and stays 0 until a price is supplied. A
 * zero is honest — the app has no price catalogue of its own — and a made-up
 * default would be a number a supplier is quoted against.
 */
export const materialsFromQuantities = (input) => {
  // Defaults only fire for `undefined`; a storage read that found nothing
  // returns null and would throw here.
  const q = input ?? {};
  const n = (v) => {
    const x = Math.floor(Number(v));
    return Number.isFinite(x) && x > 0 ? x : 0;
  };
  const recs = n(q.receptacles);
  const sw = n(q.switches);
  const lights = n(q.lights);
  const fans = n(q.fans);
  const dedicated = n(q.dedicated);
  const homeRuns = n(q.homeRuns);
  const conduitFt = n(q.conduitFt);

  const totalBoxes = recs + sw + lights + fans + dedicated;

  const rows = [
    { key: 'receptacles', name: 'Duplex Receptacles', spec: '15A duplex', qty: recs, unit: 'ea' },
    { key: 'switches', name: 'Single-Pole Switches', spec: '15A single pole', qty: sw, unit: 'ea' },
    { key: 'lights', name: 'Light Fixture Boxes', spec: 'Ceiling box', qty: lights, unit: 'ea' },
    { key: 'fans', name: 'Ceiling Fan Boxes', spec: 'Fan-rated box', qty: fans, unit: 'ea' },
    { key: 'dedicated', name: 'Dedicated Circuit Devices', spec: 'Per dedicated circuit', qty: dedicated, unit: 'ea' },
    { key: 'boxes', name: 'Total Device Boxes', spec: 'One per device', qty: totalBoxes, unit: 'ea' },
    { key: 'breakers', name: 'Circuit Breakers', spec: 'Home runs plus dedicated', qty: homeRuns + dedicated, unit: 'ea' },
    { key: 'wire', name: 'Wire / Conduit Run', spec: 'Run plus 8 ft per home run', qty: conduitFt + homeRuns * 8, unit: 'ft' },
    { key: 'connectors', name: 'Wire Connectors', spec: 'Estimated 4 per box', qty: Math.ceil(totalBoxes * 4), unit: 'bag' },
  ];

  return Object.freeze(
    rows
      .filter((r) => r.qty > 0)
      .map((r, i) => lineItem({
        id: `m${i + 1}-${r.key}`,
        kind: LineItemKind.MATERIAL,
        description: r.name,
        detail: r.spec,
        quantity: r.qty,
        unit: r.unit,
        unitPriceCents: 0,
      })),
  );
};

/** A quantity control that cannot go below zero, whatever it is handed. */
export const stepQuantity = (current, delta, { min = 0, max = 9999 } = {}) => {
  const cur = Number.isFinite(Number(current)) ? Math.floor(Number(current)) : min;
  return Math.max(min, Math.min(max, cur + (Number(delta) || 0)));
};

/** Labour as a line item, or null when none was entered. Both defaults are zero. */
export const labourLine = ({ hours = 0, rate = 0 } = {}) => {
  const h = Number(hours);
  const r = Number(rate);
  if (!Number.isFinite(h) || !Number.isFinite(r) || h <= 0 || r <= 0) return null;
  return lineItem({
    id: 'labour',
    kind: LineItemKind.LABOR,
    description: 'Labour',
    detail: `${h} hr @ ${r.toFixed(2)}/hr`,
    quantity: h,
    unit: 'hr',
    unitPriceCents: toCents(r),
  });
};

/** Everything the estimate carries, materials plus optional labour. */
export const estimateLineItems = (quantities, { labourHours = 0, labourRate = 0 } = {}) => {
  const l = labourLine({ hours: labourHours, rate: labourRate });
  const items = [...materialsFromQuantities(quantities)];
  if (l) items.push(l);
  return Object.freeze(items);
};

// ─── Taking money without pretending to process it ───────────────────────────

/**
 * Payment providers, as an abstraction with nothing plugged in.
 *
 * SparkConnect processes no card payments and stores no card numbers, CVVs or
 * bank credentials. `NONE` is the only provider that exists, and `online` is
 * false on it — a screen asks this before drawing anything that takes money, so
 * an online payment button cannot appear until a real provider is configured
 * and tested.
 *
 * The abstraction exists so connecting one later is a new entry here rather
 * than a rewrite of Invoice.
 */
export const PaymentProvider = Object.freeze({
  NONE: Object.freeze({
    id: 'NONE',
    label: 'No online payments',
    online: false,
    note: 'SparkConnect does not process payments. Record what you were paid, '
      + 'and the invoice reflects it.',
  }),
});

export const activeProvider = () => PaymentProvider.NONE;
export const onlinePaymentsAvailable = () => activeProvider().online === true;

/**
 * The methods a contractor can RECORD. None of them go through us.
 *
 * "Mark as paid" must never read as though SparkConnect took the money. These
 * are the contractor's own record of a transaction that happened elsewhere, and
 * the wording says so.
 */
export const OFFLINE_METHODS = Object.freeze([
  Object.freeze({ id: 'CASH', label: 'Cash' }),
  Object.freeze({ id: 'CHECK', label: 'Check' }),
  Object.freeze({ id: 'OTHER', label: 'Other' }),
]);

export const OFFLINE_PAYMENT_NOTICE =
  'You are recording a payment you received. SparkConnect did not process it and '
  + 'holds no card or bank details.';

/**
 * A payment the contractor is recording.
 *
 * Refuses zero, negative and non-numeric amounts. A payment record is the thing
 * a billing dispute is settled with, so a typo in it is worse than a rejection.
 */
export const offlinePayment = (input) => {
  const { amount, method = 'CASH', at = null, reference = '', note = '' } = input ?? {};
  const cents = toCents(amount);
  if (!Number.isInteger(cents) || cents <= 0) return null;
  if (!OFFLINE_METHODS.some((m) => m.id === method)) return null;
  return Object.freeze({
    id: `pay${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
    amountCents: cents,
    method,
    // Recorded, never processed. Carried on the record itself so a receipt
    // cannot be rendered without it.
    processedBySparkConnect: false,
    at: at || new Date().toISOString(),
    reference: String(reference ?? '').slice(0, 60),
    note: String(note ?? '').slice(0, 200),
  });
};

/** Amount still owed, and whether that settles it. Never negative. */
export const balance = ({ totalCents = 0, payments = [] } = {}) => {
  const total = Number.isInteger(totalCents) ? totalCents : 0;
  const paid = (Array.isArray(payments) ? payments : [])
    .reduce((sum, p) => sum + (Number.isInteger(p?.amountCents) ? p.amountCents : 0), 0);
  const due = Math.max(0, total - paid);
  return Object.freeze({
    totalCents: total,
    amountPaidCents: paid,
    amountDueCents: due,
    paidInFull: total > 0 && paid >= total,
    partiallyPaid: paid > 0 && paid < total,
    overpaidCents: Math.max(0, paid - total),
  });
};

// ─── The hosted invoice ──────────────────────────────────────────────────────

export const INVOICE_HOST = 'https://sparkconnect.pro';

/**
 * The public link for an invoice.
 *
 * Built from the share TOKEN, never the invoice id. A sequential id in a public
 * URL lets anybody walk the whole customer list by adding one, and the tokens
 * from documents.generateToken exist precisely so that is impossible.
 */
export const hostedInvoiceUrl = (token) => {
  const t = String(token ?? '');
  // Rejected rather than rendered as a broken link. A short or empty token is a
  // bug in the caller, and a guessable URL is a data breach with a nice UI.
  if (t.length < 16 || !/^[A-Za-z0-9_-]+$/.test(t)) return null;
  return `${INVOICE_HOST}/i/${t}`;
};

/** Whether an id is safe to put in a public URL. Exported so a test can assert it. */
export const isPublicSafeToken = (token) => hostedInvoiceUrl(token) !== null;

/** What "Send to Customer" offers. PDF and link only — no payment collection. */
export const SEND_OPTIONS = Object.freeze([
  Object.freeze({ id: 'LINK', label: 'Send payment link', sub: 'A page they can open and read', needsToken: true }),
  Object.freeze({ id: 'PDF', label: 'Send PDF', sub: 'A file they can keep', needsToken: false }),
  Object.freeze({ id: 'BOTH', label: 'Send both', sub: 'Link and file together', needsToken: true }),
]);

/**
 * The send options that actually work right now.
 *
 * A button that does nothing is worse than a missing one: the first is a bug
 * report, the second is a roadmap. Anything not implemented stays off the
 * screen until it is.
 */
export const availableSendOptions = ({ hasToken = false, pdfReady = false } = {}) => Object.freeze(
  SEND_OPTIONS.filter((o) => (o.needsToken ? hasToken : true) && (o.id === 'LINK' ? true : pdfReady || o.id === 'LINK')),
);
