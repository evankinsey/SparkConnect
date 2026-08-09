// ─── QUANTITIES → ESTIMATE → INVOICE ─────────────────────────────────────────
// The failures that matter: an invoice disagreeing with the estimate it came
// from, a payment record implying we took the money, and a guessable public URL.

import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import {
  materialsFromQuantities, stepQuantity, labourLine, estimateLineItems,
  PaymentProvider, activeProvider, onlinePaymentsAvailable,
  OFFLINE_METHODS, OFFLINE_PAYMENT_NOTICE, offlinePayment, balance,
  hostedInvoiceUrl, isPublicSafeToken, SEND_OPTIONS, availableSendOptions,
} from '../src/core/domain/estimateBridge.js';
import { LineItemKind, toCents } from '../src/core/domain/money.js';
import {
  createEstimate, createInvoice, convertEstimateToInvoice,
  EstimateStatus, InvoiceStatus, generateToken, transition,
} from '../src/core/domain/documents.js';

const QTY = { receptacles: 10, switches: 5, lights: 8, fans: 2, dedicated: 3, homeRuns: 6, conduitFt: 200 };

test('the estimator arithmetic is preserved exactly', () => {
  // These are the same expressions the screen has always used. A change here
  // changes a number somebody orders against.
  const items = materialsFromQuantities(QTY);
  const by = Object.fromEntries(items.map((i) => [i.description, i.quantity]));
  assert.equal(by['Duplex Receptacles'], 10);
  assert.equal(by['Total Device Boxes'], 10 + 5 + 8 + 2 + 3);      // 28
  assert.equal(by['Circuit Breakers'], 6 + 3);                      // 9
  assert.equal(by['Wire / Conduit Run'], 200 + 6 * 8);              // 248
  assert.equal(by['Wire Connectors'], Math.ceil(28 * 4));           // 112
});

test('a line with no quantity is left out rather than shown as zero', () => {
  const items = materialsFromQuantities({ receptacles: 4 });
  assert.ok(items.every((i) => i.quantity > 0));
  assert.ok(!items.some((i) => i.description === 'Ceiling Fan Boxes'));
  assert.deepEqual([...materialsFromQuantities({})], []);
  assert.deepEqual([...materialsFromQuantities(null)], []);
});

test('no price is invented', () => {
  // The app has no price catalogue. A plausible default is a number a supplier
  // gets quoted against.
  for (const i of materialsFromQuantities(QTY)) {
    assert.equal(i.unitPriceCents, 0, `${i.description} shipped with a made-up price`);
  }
});

test('a quantity can never go negative', () => {
  assert.equal(stepQuantity(0, -1), 0);
  assert.equal(stepQuantity(3, -5), 0);
  assert.equal(stepQuantity(5, 1), 6);
  assert.equal(stepQuantity(9999, 1), 9999);
  for (const junk of [null, undefined, 'x', NaN, {}]) {
    assert.equal(stepQuantity(junk, -1), 0, `${JSON.stringify(junk)} produced a negative`);
  }
});

test('labour is optional and defaults to nothing', () => {
  assert.equal(labourLine(), null);
  assert.equal(labourLine({ hours: 0, rate: 85 }), null);
  assert.equal(labourLine({ hours: 8, rate: 0 }), null);
  assert.equal(labourLine({ hours: -8, rate: 85 }), null);

  const l = labourLine({ hours: 8, rate: 85 });
  assert.equal(l.kind, LineItemKind.LABOR);
  assert.equal(l.unitPriceCents, toCents(85));
  assert.equal(l.quantity, 8);

  // Materials alone when no labour was entered.
  assert.ok(!estimateLineItems(QTY).some((i) => i.kind === LineItemKind.LABOR));
  assert.ok(estimateLineItems(QTY, { labourHours: 8, labourRate: 85 }).some((i) => i.kind === LineItemKind.LABOR));
});

// ─── The estimate must survive its own invoice ───────────────────────────────

test('an invoice takes a snapshot and never rewrites the estimate', () => {
  // An invoice edited afterwards must not change the estimate somebody already
  // agreed to. That is the whole reason for the copy.
  const at = '2026-08-09T10:00:00Z';
  let est = createEstimate({
    id: 'e1', number: 'EST-1', createdAt: at,
    lineItems: [...estimateLineItems(QTY)],
  });
  est = transition(est, EstimateStatus.SENT, { at }).doc ?? est;
  est = transition(est, EstimateStatus.ACCEPTED, { at }).doc ?? est;

  const res = convertEstimateToInvoice(est, { id: 'i1', number: 'INV-1', at });
  assert.ok(res.invoice, `conversion refused: ${res.error}`);
  assert.equal(res.invoice.sourceEstimateId, 'e1');
  assert.equal(res.invoice.lineItems.length, est.lineItems.length);

  // Mutating the invoice's copy leaves the estimate alone.
  const before = est.lineItems[0].quantity;
  res.invoice.lineItems[0].quantity = 999;
  assert.equal(est.lineItems[0].quantity, before, 'the invoice rewrote its own estimate');
});

test('an estimate is never silently turned into an invoice', () => {
  // Conversion is explicit and refuses anything not accepted.
  const at = '2026-08-09T10:00:00Z';
  const draft = createEstimate({ id: 'e2', number: 'EST-2', createdAt: at, lineItems: [] });
  const res = convertEstimateToInvoice(draft, { id: 'i2', number: 'INV-2', at });
  assert.equal(res.ok, false);
  assert.match(res.error, /ACCEPTED/);
});

// ─── Money we did not take ───────────────────────────────────────────────────

test('no online payment button can appear until a provider exists', () => {
  assert.equal(onlinePaymentsAvailable(), false);
  assert.equal(activeProvider().id, 'NONE');
  assert.equal(activeProvider().online, false);
  // And nothing here pretends we hold payment credentials.
  const blob = JSON.stringify(PaymentProvider);
  assert.doesNotMatch(blob, /card|cvv|routing|account number/i);
});

test('a recorded payment never implies SparkConnect processed it', () => {
  const p = offlinePayment({ amount: 1000, method: 'CASH' });
  assert.equal(p.processedBySparkConnect, false, 'the record must say who did not take the money');
  assert.match(OFFLINE_PAYMENT_NOTICE, /did not process it/i);
  assert.match(OFFLINE_PAYMENT_NOTICE, /no card or bank details/i);
  assert.deepEqual(OFFLINE_METHODS.map((m) => m.id), ['CASH', 'CHECK', 'OTHER']);
});

test('a payment record refuses a typo rather than storing one', () => {
  // This record settles a billing dispute. A wrong number in it is worse than
  // a rejected entry.
  for (const bad of [{ amount: 0 }, { amount: -50 }, { amount: 'x' }, {}, null]) {
    assert.equal(offlinePayment(bad), null, `accepted ${JSON.stringify(bad)}`);
  }
  assert.equal(offlinePayment({ amount: 100, method: 'BITCOIN' }), null, 'accepted an unknown method');
});

test('partial payment leaves the right balance and does not settle the invoice', () => {
  const total = toCents(2500);
  const b = balance({ totalCents: total, payments: [offlinePayment({ amount: 1000 })] });
  assert.equal(b.amountPaidCents, toCents(1000));
  assert.equal(b.amountDueCents, toCents(1500));
  assert.equal(b.partiallyPaid, true);
  assert.equal(b.paidInFull, false);

  const full = balance({ totalCents: total, payments: [offlinePayment({ amount: 2500 })] });
  assert.equal(full.paidInFull, true);
  assert.equal(full.amountDueCents, 0);

  // Overpayment never renders as a negative amount due.
  const over = balance({ totalCents: total, payments: [offlinePayment({ amount: 3000 })] });
  assert.equal(over.amountDueCents, 0);
  assert.equal(over.overpaidCents, toCents(500));

  assert.equal(balance().amountDueCents, 0);
  assert.equal(balance({ totalCents: total, payments: null }).amountDueCents, total);
});

// ─── The public link ─────────────────────────────────────────────────────────

test('a public invoice URL is never built from a database id', () => {
  // A sequential id in a public URL lets anybody walk the customer list by
  // adding one. That is a breach with a nice UI.
  assert.equal(hostedInvoiceUrl('1'), null);
  assert.equal(hostedInvoiceUrl('INV-1007'), null, 'an invoice number is guessable');
  assert.equal(hostedInvoiceUrl(''), null);
  assert.equal(hostedInvoiceUrl(null), null);
  assert.equal(isPublicSafeToken('42'), false);

  // Crypto is INJECTED rather than imported by the module, so a pure model
  // stays testable and the platform decides where entropy comes from.
  const token = generateToken((n) => randomBytes(n), 22);
  assert.ok(isPublicSafeToken(token), `generated token was rejected: ${token}`);
  assert.match(hostedInvoiceUrl(token), /^https:\/\/sparkconnect\.pro\/i\//);
  // The stable public domain, not a deployment-protected preview host.
  assert.doesNotMatch(hostedInvoiceUrl(token), /vercel\.app/);
});

test('no send option is offered before it works', () => {
  // A button that does nothing is a bug report; a missing one is a roadmap.
  const none = availableSendOptions({ hasToken: false, pdfReady: false }).map((o) => o.id);
  assert.ok(!none.includes('LINK'), 'offered a link with no token');
  assert.ok(!none.includes('BOTH'));

  const linkOnly = availableSendOptions({ hasToken: true, pdfReady: false }).map((o) => o.id);
  assert.ok(linkOnly.includes('LINK'));
  assert.ok(!linkOnly.includes('PDF'), 'offered a PDF that is not built');

  assert.equal(SEND_OPTIONS.length, 3);
});
