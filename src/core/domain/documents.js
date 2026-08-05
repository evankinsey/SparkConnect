// ─── ESTIMATES AND INVOICES ──────────────────────────────────────────────────
// Requirements: INV-01 … INV-06, PAY-09, PAY-10, PAY-11, SEC-06
//
// Two state machines plus a conversion that never mutates the source estimate
// (INV-05). Transitions are declared as data so an illegal transition is
// impossible rather than merely discouraged.

import { computeTotals, payment as mkPayment, refund as mkRefund, PaymentKind } from './money.js';

// ─── Statuses ────────────────────────────────────────────────────────────────

export const EstimateStatus = {
  DRAFT: 'DRAFT',
  SENT: 'SENT',
  VIEWED: 'VIEWED',
  ACCEPTED: 'ACCEPTED',
  DECLINED: 'DECLINED',
  EXPIRED: 'EXPIRED',
  CONVERTED_TO_INVOICE: 'CONVERTED_TO_INVOICE',
  ARCHIVED: 'ARCHIVED',
};

export const InvoiceStatus = {
  DRAFT: 'DRAFT',
  READY_TO_SEND: 'READY_TO_SEND',
  SENT: 'SENT',
  VIEWED: 'VIEWED',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
  VOID: 'VOID',
  REFUNDED: 'REFUNDED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
};

// PAY-09 — contractor Stripe connection states.
export const ConnectedAccountStatus = {
  NOT_CONNECTED: 'NOT_CONNECTED',
  ONBOARDING_STARTED: 'ONBOARDING_STARTED',
  INFORMATION_REQUIRED: 'INFORMATION_REQUIRED',
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  ENABLED: 'ENABLED',
  RESTRICTED: 'RESTRICTED',
  DISCONNECTED: 'DISCONNECTED',
};

// ─── Legal transitions ───────────────────────────────────────────────────────

export const ESTIMATE_TRANSITIONS = Object.freeze({
  DRAFT: ['SENT', 'ARCHIVED'],
  SENT: ['VIEWED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'ARCHIVED'],
  VIEWED: ['ACCEPTED', 'DECLINED', 'EXPIRED', 'ARCHIVED'],
  ACCEPTED: ['CONVERTED_TO_INVOICE', 'ARCHIVED'],
  DECLINED: ['ARCHIVED'],
  EXPIRED: ['SENT', 'ARCHIVED'],           // re-send a lapsed estimate
  CONVERTED_TO_INVOICE: ['ARCHIVED'],      // terminal apart from archiving
  ARCHIVED: [],
});

export const INVOICE_TRANSITIONS = Object.freeze({
  DRAFT: ['READY_TO_SEND', 'VOID'],
  READY_TO_SEND: ['SENT', 'DRAFT', 'VOID'],
  SENT: ['VIEWED', 'PAYMENT_PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'PAYMENT_FAILED', 'VOID'],
  VIEWED: ['PAYMENT_PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'PAYMENT_FAILED', 'VOID'],
  PAYMENT_PENDING: ['PAID', 'PARTIALLY_PAID', 'PAYMENT_FAILED', 'OVERDUE', 'VOID'],
  PARTIALLY_PAID: ['PAID', 'PAYMENT_PENDING', 'PAYMENT_FAILED', 'OVERDUE', 'REFUNDED', 'VOID'],
  PAID: ['REFUNDED'],                      // a paid invoice may only be refunded
  OVERDUE: ['PAYMENT_PENDING', 'PARTIALLY_PAID', 'PAID', 'PAYMENT_FAILED', 'VOID'],
  PAYMENT_FAILED: ['PAYMENT_PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID'],
  REFUNDED: [],
  VOID: [],
});

export const canTransition = (map, from, to) => (map[from] ?? []).includes(to);

// ─── Identifiers (SEC-06) ────────────────────────────────────────────────────

/**
 * Human-facing document numbers are sequential per contractor — customers expect
 * INV-0001. That is fine because they are never the addressable identity.
 *
 * The `id` used in URLs, payment sessions and lookups is a random token, so a
 * customer cannot walk to another customer's invoice by decrementing a number
 * (SEC-06 "avoid sequential publicly exposed invoice IDs", SEC-08).
 */
export const formatDocumentNumber = (prefix, sequence, year) =>
  `${prefix}-${year}-${String(sequence).padStart(4, '0')}`;

const DEFAULT_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1

export const generateToken = (randomBytes, length = 22) => {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += DEFAULT_ALPHABET[bytes[i] % DEFAULT_ALPHABET.length];
  return out;
};

// ─── Entities (INV-01) ───────────────────────────────────────────────────────

export const customer = ({ id, name = '', email = null, phone = null, address = null }) =>
  ({ id, name, email, phone, address });

export const emptyDocument = ({
  id, number, kind, createdAt,
  contractorName = '', contractorLicense = null, logoUri = null,
  customer: cust = null,
  lineItems = [], taxPercent = 0, discountPercent = 0, discountCents = null,
  depositCents = 0, payments = [],
  issueDate = null, dueDate = null, paymentTerms = null, expiresAt = null,
  scopeOfWork = '', exclusions = '', customerMessage = '',
  internalNotes = [], customerNotes = [],
  status,
}) => ({
  id, number, kind, createdAt, updatedAt: createdAt,
  contractorName, contractorLicense, logoUri,
  customer: cust,
  lineItems, taxPercent, discountPercent, discountCents,
  depositCents, payments,
  issueDate, dueDate, paymentTerms, expiresAt,
  scopeOfWork, exclusions, customerMessage,
  internalNotes, customerNotes,
  status,
  sourceEstimateId: null,
  convertedInvoiceId: null,
  connectedAccountStatus: ConnectedAccountStatus.NOT_CONNECTED,
  auditTrail: [{ at: createdAt, event: 'CREATED', detail: kind }],
});

export const createEstimate = (props) =>
  emptyDocument({ ...props, kind: 'ESTIMATE', status: EstimateStatus.DRAFT });

export const createInvoice = (props) =>
  emptyDocument({ ...props, kind: 'INVOICE', status: InvoiceStatus.DRAFT });

export const totalsFor = (doc) => computeTotals({
  lineItems: doc.lineItems,
  discountPercent: doc.discountPercent,
  discountCents: doc.discountCents,
  taxPercent: doc.taxPercent,
  depositCents: doc.depositCents,
  payments: doc.payments,
});

// ─── Transitions (INV-06) ────────────────────────────────────────────────────

const appendAudit = (doc, event, detail, at) => ({
  ...doc,
  updatedAt: at,
  auditTrail: [...doc.auditTrail, { at, event, detail }],
});

/**
 * Move a document to a new status.
 * @returns {{ok: true, doc} | {ok: false, error, allowed}}
 */
export const transition = (doc, to, { at, detail = null } = {}) => {
  const map = doc.kind === 'ESTIMATE' ? ESTIMATE_TRANSITIONS : INVOICE_TRANSITIONS;
  if (!canTransition(map, doc.status, to)) {
    return {
      ok: false,
      error: `Illegal transition ${doc.status} → ${to}`,
      allowed: map[doc.status] ?? [],
    };
  }
  const next = appendAudit({ ...doc, status: to }, 'STATUS_CHANGED', detail ?? `${doc.status} → ${to}`, at);
  return { ok: true, doc: next };
};

/**
 * Record a payment and derive the resulting status.
 *
 * PAY-11 — a manual record is a contractor's assertion, not proof from Stripe.
 * When Stripe is the source, the caller passes the webhook-verified payment; this
 * function never infers success from a redirect.
 */
export const recordPayment = (doc, paymentProps, { at }) => {
  if (doc.kind !== 'INVOICE') return { ok: false, error: 'Payments apply to invoices only' };
  if (doc.status === InvoiceStatus.VOID) return { ok: false, error: 'Cannot pay a void invoice' };

  const p = mkPayment({ ...paymentProps, recordedAt: at });
  if (p.amountCents <= 0) return { ok: false, error: 'Payment amount must be positive' };

  const withPayment = { ...doc, payments: [...doc.payments, p] };
  const totals = totalsFor(withPayment);
  const target = totals.isPaidInFull ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID;

  const map = INVOICE_TRANSITIONS;
  const next = canTransition(map, doc.status, target)
    ? { ...withPayment, status: target }
    : withPayment; // already PAID, or in a state that does not move — keep the record

  return {
    ok: true,
    doc: appendAudit(next, 'PAYMENT_RECORDED', `${p.kind} ${p.method} ${p.amountCents}`, at),
    totals,
  };
};

export const recordRefund = (doc, refundProps, { at }) => {
  if (doc.kind !== 'INVOICE') return { ok: false, error: 'Refunds apply to invoices only' };
  const r = mkRefund({ ...refundProps, recordedAt: at });
  const withRefund = { ...doc, payments: [...doc.payments, r] };
  const totals = totalsFor(withRefund);

  const target = totals.amountPaidCents <= 0 ? InvoiceStatus.REFUNDED : InvoiceStatus.PARTIALLY_PAID;
  const next = canTransition(INVOICE_TRANSITIONS, doc.status, target)
    ? { ...withRefund, status: target }
    : withRefund;

  return { ok: true, doc: appendAudit(next, 'REFUND_RECORDED', String(r.amountCents), at), totals };
};

export const addNote = (doc, { text, visibility = 'INTERNAL', at }) => {
  const note = { text, at };
  const next = visibility === 'CUSTOMER'
    ? { ...doc, customerNotes: [...doc.customerNotes, note] }
    : { ...doc, internalNotes: [...doc.internalNotes, note] };
  return appendAudit(next, 'NOTE_ADDED', visibility, at);
};

// ─── Duplication and conversion (INV-05, INV-06) ─────────────────────────────

export const duplicate = (doc, { id, number, at }) => ({
  ...doc,
  id,
  number,
  createdAt: at,
  updatedAt: at,
  status: doc.kind === 'ESTIMATE' ? EstimateStatus.DRAFT : InvoiceStatus.DRAFT,
  payments: [],
  sourceEstimateId: null,
  convertedInvoiceId: null,
  auditTrail: [{ at, event: 'DUPLICATED', detail: `from ${doc.number}` }],
});

/**
 * INV-05 — convert an ACCEPTED estimate into a NEW invoice.
 *
 * The estimate is not mutated into an invoice. Both records survive: the invoice
 * points back via `sourceEstimateId`, the estimate forward via
 * `convertedInvoiceId`, and both keep their audit trails.
 *
 * @returns {{ok: true, invoice, estimate} | {ok: false, error}}
 */
export const convertEstimateToInvoice = (estimate, { id, number, at, dueDate = null }) => {
  if (estimate.kind !== 'ESTIMATE') return { ok: false, error: 'Not an estimate' };
  if (estimate.status !== EstimateStatus.ACCEPTED) {
    return { ok: false, error: `Only an ACCEPTED estimate converts (this one is ${estimate.status})` };
  }

  const invoice = {
    ...createInvoice({
      id,
      number,
      createdAt: at,
      contractorName: estimate.contractorName,
      contractorLicense: estimate.contractorLicense,
      logoUri: estimate.logoUri,
      customer: estimate.customer,
      lineItems: estimate.lineItems.map((i) => ({ ...i })), // copied, not shared
      taxPercent: estimate.taxPercent,
      discountPercent: estimate.discountPercent,
      discountCents: estimate.discountCents,
      depositCents: estimate.depositCents,
      issueDate: at,
      dueDate,
      paymentTerms: estimate.paymentTerms,
      scopeOfWork: estimate.scopeOfWork,
      exclusions: estimate.exclusions,
      customerMessage: estimate.customerMessage,
    }),
    sourceEstimateId: estimate.id,
    auditTrail: [{ at, event: 'CONVERTED_FROM_ESTIMATE', detail: estimate.number }],
  };

  const updatedEstimate = appendAudit(
    { ...estimate, status: EstimateStatus.CONVERTED_TO_INVOICE, convertedInvoiceId: id },
    'CONVERTED_TO_INVOICE', number, at,
  );

  return { ok: true, invoice, estimate: updatedEstimate };
};

/**
 * INV-05 — warn when the invoice has drifted materially from the accepted
 * estimate. The contractor may still change quantities and pricing; they just
 * should not do it by accident after the customer said yes.
 */
export const materialDifference = (estimate, invoice, { thresholdPercent = 5 } = {}) => {
  const before = totalsFor(estimate).totalCents;
  const after = totalsFor(invoice).totalCents;
  if (before === 0) return { differs: after !== 0, beforeCents: before, afterCents: after, percent: null };

  const percent = ((after - before) / before) * 100;
  return {
    differs: Math.abs(percent) >= thresholdPercent,
    beforeCents: before,
    afterCents: after,
    deltaCents: after - before,
    percent: Math.round(percent * 10) / 10,
    thresholdPercent,
  };
};

/** Derive OVERDUE without a background job: pure, evaluated on read. */
export const isOverdue = (invoice, today) => {
  if (!invoice.dueDate) return false;
  if ([InvoiceStatus.PAID, InvoiceStatus.VOID, InvoiceStatus.REFUNDED].includes(invoice.status)) return false;
  return String(today) > String(invoice.dueDate);
};
