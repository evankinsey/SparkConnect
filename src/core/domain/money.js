// ─── MONEY ───────────────────────────────────────────────────────────────────
// Requirements: INV-01, INV-02, PAY-14, PAY-17, PAY-18
//
// Every amount is an INTEGER NUMBER OF CENTS. Floats are banned in this file and
// in anything that touches an invoice total: 0.1 + 0.2 !== 0.3, and a contractor
// whose invoice is a cent off looks careless to their customer.
//
// PAY-18 — nothing here estimates Stripe's fees. Processing fees come from
// Stripe's actual transaction data or are not shown at all.

export const CENTS = 100;

export const toCents = (amount) => {
  if (typeof amount === 'number') {
    if (!Number.isFinite(amount)) return 0;
    return Math.round(amount * CENTS);
  }
  if (typeof amount === 'string') {
    const cleaned = amount.replace(/[^0-9.-]/g, '');
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? Math.round(n * CENTS) : 0;
  }
  return 0;
};

export const fromCents = (cents) => (Number.isInteger(cents) ? cents / CENTS : 0);

export const formatMoney = (cents, currency = 'USD') => {
  const n = Number.isInteger(cents) ? cents : 0;
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const symbol = currency === 'USD' ? '$' : '';
  return `${sign}${symbol}${Math.floor(abs / CENTS).toLocaleString('en-US')}.${String(abs % CENTS).padStart(2, '0')}`;
};

/**
 * Apply a percentage to a cent amount with half-up rounding.
 * Kept in one place so tax and discount round identically everywhere.
 */
export const applyPercent = (cents, percent) => {
  if (!Number.isInteger(cents) || !Number.isFinite(percent)) return 0;
  return Math.round((cents * percent) / 100);
};

// ─── Line items (INV-01) ─────────────────────────────────────────────────────

export const LineItemKind = { LABOR: 'LABOR', MATERIAL: 'MATERIAL', OTHER: 'OTHER' };

export const lineItem = ({
  id, kind = LineItemKind.OTHER, description = '', quantity = 1,
  unitPriceCents = 0, taxable = true,
}) => ({
  id,
  kind,
  description,
  quantity: Number.isFinite(quantity) && quantity >= 0 ? quantity : 0,
  unitPriceCents: Number.isInteger(unitPriceCents) ? unitPriceCents : 0,
  taxable: !!taxable,
});

export const lineTotalCents = (item) => Math.round((item.quantity ?? 0) * (item.unitPriceCents ?? 0));

/**
 * Full document arithmetic.
 *
 * Order of operations matters and is fixed here so an estimate and the invoice
 * it converts into can never disagree:
 *   subtotal → discount → taxable base → tax → total → deposit → payments → balance
 *
 * @returns {{subtotalCents, discountCents, taxableBaseCents, taxCents, totalCents,
 *            depositCents, amountPaidCents, balanceDueCents, isPaidInFull, isOverpaid}}
 */
export const computeTotals = ({
  lineItems = [],
  discountPercent = 0,
  discountCents = null,
  taxPercent = 0,
  depositCents = 0,
  payments = [],
} = {}) => {
  const subtotalCents = lineItems.reduce((sum, i) => sum + lineTotalCents(i), 0);

  // An explicit cent discount wins over a percentage, so a contractor can type
  // "knock off $50" without fighting rounding.
  const discount = Number.isInteger(discountCents)
    ? Math.min(Math.max(discountCents, 0), subtotalCents)
    : Math.min(applyPercent(subtotalCents, discountPercent), subtotalCents);

  // Discount is applied proportionally across taxable and non-taxable items, so
  // a discount cannot be used to dodge tax on the taxable portion.
  const taxableSubtotal = lineItems.filter((i) => i.taxable).reduce((sum, i) => sum + lineTotalCents(i), 0);
  const taxableShare = subtotalCents > 0 ? taxableSubtotal / subtotalCents : 0;
  const taxableBaseCents = Math.round((subtotalCents - discount) * taxableShare);

  const taxCents = applyPercent(taxableBaseCents, taxPercent);
  const totalCents = subtotalCents - discount + taxCents;

  const deposit = Number.isInteger(depositCents) ? Math.min(Math.max(depositCents, 0), totalCents) : 0;
  const amountPaidCents = payments.reduce(
    (sum, p) => sum + (Number.isInteger(p.amountCents) ? p.amountCents : 0), 0,
  );

  return {
    subtotalCents,
    discountCents: discount,
    taxableBaseCents,
    taxCents,
    totalCents,
    depositCents: deposit,
    amountPaidCents,
    balanceDueCents: totalCents - amountPaidCents,
    isPaidInFull: amountPaidCents >= totalCents && totalCents > 0,
    isOverpaid: amountPaidCents > totalCents,
  };
};

// ─── Payments (INV-02) ───────────────────────────────────────────────────────

export const PaymentMethod = {
  STRIPE: 'STRIPE',
  CASH: 'CASH',
  CHECK: 'CHECK',
  BANK_TRANSFER: 'BANK_TRANSFER',
  CARD_OFFLINE: 'CARD_OFFLINE',
  OTHER: 'OTHER',
};

export const PaymentKind = { DEPOSIT: 'DEPOSIT', PARTIAL: 'PARTIAL', FINAL: 'FINAL', REFUND: 'REFUND' };

/**
 * A recorded payment. INV-02 requires partial-payment support in the data model
 * even while the first UI only offers "mark paid in full" — so the shape carries
 * it from day one and no migration is needed later.
 */
export const payment = ({
  id, amountCents, method = PaymentMethod.OTHER, kind = PaymentKind.PARTIAL,
  recordedAt, reference = null, note = null,
}) => ({
  id,
  amountCents: Number.isInteger(amountCents) ? amountCents : 0,
  method,
  kind,
  recordedAt,
  reference,   // Stripe payment intent id, check number, etc.
  note,
});

/** A refund is a negative payment, so `amountPaidCents` stays a single sum. */
export const refund = ({ id, amountCents, recordedAt, reference = null, note = null }) =>
  payment({
    id,
    amountCents: -Math.abs(Number.isInteger(amountCents) ? amountCents : 0),
    method: PaymentMethod.STRIPE,
    kind: PaymentKind.REFUND,
    recordedAt,
    reference,
    note,
  });

/**
 * PAY-14/PAY-17 — the fee breakdown shown to a contractor.
 * Every field is optional and omitted unless the real number is known: PAY-18
 * forbids computing Stripe's cut from hardcoded assumptions.
 */
export const feeBreakdown = ({
  customerChargeCents,
  stripeFeeCents = null,
  applicationFeeCents = null,
  payoutCents = null,
} = {}) => ({
  customerChargeCents,
  stripeFeeCents,
  applicationFeeCents,
  payoutCents,
  // If Stripe has not reported the fee yet, say so rather than guessing.
  feesKnown: stripeFeeCents !== null,
  disclaimer: 'SparkConnect does not provide accounting, tax, legal, banking, lending, or payment-processing advice.',
});
