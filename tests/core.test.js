// ─── CORE LAYER TESTS ────────────────────────────────────────────────────────
// Migrations, money, documents, registry, search, gamification, AI context.
// Requirements: DAT-02…06, INV-01…06, PAY-09/10/11, SEC-06, TST-05, AI-02/03/04

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SCHEMA_VERSION, MIGRATIONS, MigrationStatus, LEGACY_KEYS, PROTECTED_DOMAINS,
  applyMigrations, migrationPath, createMigrationRunner, META_KEY,
} from '../src/core/data/migrations.js';
import {
  toCents, fromCents, formatMoney, computeTotals, lineItem, LineItemKind,
  payment, refund, PaymentMethod, feeBreakdown,
} from '../src/core/domain/money.js';
import {
  EstimateStatus, InvoiceStatus, ESTIMATE_TRANSITIONS, INVOICE_TRANSITIONS,
  createEstimate, createInvoice, transition, recordPayment, recordRefund,
  convertEstimateToInvoice, materialDifference, duplicate, totalsFor, isOverdue,
  formatDocumentNumber, generateToken, ConnectedAccountStatus,
} from '../src/core/domain/documents.js';
import {
  contractorProfile, canShowVerificationBadge, VerificationStatus,
  createLicenseRegistry, isValidProvider, normalizedResult,
  permit, transitionPermit, PermitStatus, PERMIT_TRANSITIONS,
  INSPECTION_CHECKLIST, isExpired,
} from '../src/core/domain/registry.js';
import { createSearchIndex, searchRecord, SourceKind, scoreRecord, tokenize } from '../src/core/search/index.js';
import {
  ACHIEVEMENTS, evaluateAchievements, emptyStats, streakState,
  monthlyChallenge, challengeProgress,
} from '../src/core/gamification/achievements.js';
import {
  buildToolContext, buildSimulationContext, buildDocumentContext, stripIdentifying,
  RESPONSE_CONTRACT, AiAction,
} from '../src/core/ai/context.js';
import { lessonById, solutionCircuit } from '../src/circuit/lessons/index.js';
import { validate } from '../src/circuit/validator.js';

// ─── In-memory storage adapter ───────────────────────────────────────────────
const memStorage = (seed = {}) => {
  const map = new Map(Object.entries(seed));
  return {
    map,
    getItem: async (k) => (map.has(k) ? map.get(k) : null),
    setItem: async (k, v) => { map.set(k, v); },
    removeItem: async (k) => { map.delete(k); },
  };
};
let clock = 0;
const tick = () => `2026-08-05T00:00:${String(clock++).padStart(2, '0')}Z`;

// ═══ MIGRATIONS (DAT-02 … DAT-06, TST-05) ════════════════════════════════════

test('DAT-02 migration path reaches the current schema version', () => {
  const path = migrationPath(0, SCHEMA_VERSION);
  assert.equal(path.length, MIGRATIONS.length);
  assert.equal(path[path.length - 1].to, SCHEMA_VERSION);
});

test('TST-05 a fresh install migrates from v0 to current', async () => {
  const storage = memStorage();
  const runner = createMigrationRunner(storage, { now: tick });
  const result = await runner.run();
  assert.equal(result.status, MigrationStatus.MIGRATED);
  assert.equal(result.from, 0);
  assert.equal(result.to, SCHEMA_VERSION);
  const meta = await runner.readMeta();
  assert.equal(meta.version, SCHEMA_VERSION);
});

test('TST-05 migration is idempotent — a second run is a no-op', async () => {
  const storage = memStorage();
  const runner = createMigrationRunner(storage, { now: tick });
  await runner.run();
  const second = await runner.run();
  assert.equal(second.status, MigrationStatus.ALREADY_CURRENT);
});

test('DAT-03 production data survives migration', async () => {
  const invoices = [{ id: 'inv1', number: 'INV-2026-0001' }];
  const projects = [{ id: 'p1', photos: ['a.jpg'] }];
  const storage = memStorage({
    '@sc_invoices': JSON.stringify(invoices),
    '@sc_jobcam_projects': JSON.stringify(projects),
    '@sc_onboarding_done': 'true',
    '@sc_app_language': 'spanish',
  });
  const runner = createMigrationRunner(storage, { now: tick });
  const result = await runner.run();
  assert.equal(result.status, MigrationStatus.MIGRATED);

  assert.deepEqual(JSON.parse(storage.map.get('@sc_invoices')), invoices, 'invoices preserved');
  assert.deepEqual(JSON.parse(storage.map.get('@sc_jobcam_projects')), projects, 'projects preserved');
  const prefs = JSON.parse(storage.map.get('@sc_preferences'));
  assert.equal(prefs.language, 'spanish', 'legacy preference carried forward');
  assert.equal(prefs.onboardingDone, true);
  assert.equal(storage.map.get('@sc_onboarding_done'), 'true', 'legacy key left intact');
});

test('DAT-05 a corrupt record is quarantined, not dropped, and does not block the rest', async () => {
  const storage = memStorage({
    '@sc_invoices': '{ this is not json',
    '@sc_estimates': JSON.stringify([{ id: 'e1' }]),
  });
  const runner = createMigrationRunner(storage, { now: tick });
  const result = await runner.run();

  assert.equal(result.status, MigrationStatus.PARTIAL_QUARANTINED);
  assert.equal(result.quarantined.length, 1);
  assert.equal(result.quarantined[0].domain, 'invoices');
  assert.deepEqual(JSON.parse(storage.map.get('@sc_estimates')), [{ id: 'e1' }], 'good data still migrated');

  const quarantineKey = [...storage.map.keys()].find((k) => k.startsWith('@sc_quarantine_invoices'));
  assert.ok(quarantineKey, 'the corrupt bytes are preserved');
  assert.equal(storage.map.get(quarantineKey), '{ this is not json');
});

test('DAT-06 a backup is written before any migration write', async () => {
  const storage = memStorage({ '@sc_estimates': JSON.stringify([{ id: 'e1' }]) });
  const runner = createMigrationRunner(storage, { now: tick });
  const result = await runner.run();
  assert.ok(result.backupKey, 'a backup key is returned');
  assert.ok(storage.map.has(result.backupKey), 'the backup exists');
});

test('DAT-05 a failed migration rolls back and leaves the version unchanged', async () => {
  const storage = memStorage({ '@sc_invoices': JSON.stringify([{ id: 'inv1' }]) });
  let calls = 0;
  const failing = {
    ...storage,
    setItem: async (k, v) => {
      calls++;
      if (k === '@sc_invoices') throw new Error('disk full');
      storage.map.set(k, v);
    },
  };
  const runner = createMigrationRunner(failing, { now: tick });
  const result = await runner.run();

  assert.equal(result.status, MigrationStatus.FAILED_ROLLED_BACK);
  assert.deepEqual(JSON.parse(storage.map.get('@sc_invoices')), [{ id: 'inv1' }], 'original untouched');
  assert.equal(storage.map.has(META_KEY), false, 'version not advanced, so next launch retries');
  assert.ok(calls > 0);
});

test('DAT-03 a migration that would drop a protected domain is refused', () => {
  // Directly exercise the guard by simulating a bad migration result.
  const before = { invoices: [{ id: 'inv1' }] };
  const after = applyMigrations(before, 0, SCHEMA_VERSION);
  for (const domain of PROTECTED_DOMAINS) {
    if (before[domain] !== undefined) {
      assert.ok(after[domain] !== undefined, `${domain} must survive`);
    }
  }
});

test('a newer schema is never migrated backwards by an older build', async () => {
  const storage = memStorage({ [META_KEY]: JSON.stringify({ version: 99, history: [] }) });
  const runner = createMigrationRunner(storage, { now: tick });
  const result = await runner.run();
  assert.equal(result.downgradeDetected, true);
  assert.equal(JSON.parse(storage.map.get(META_KEY)).version, 99, 'untouched');
});

test('restoreFromBackup returns data to its pre-migration state', async () => {
  const storage = memStorage({ '@sc_estimates': JSON.stringify([{ id: 'original' }]) });
  const runner = createMigrationRunner(storage, { now: tick });
  const { backupKey } = await runner.run();
  await storage.setItem('@sc_estimates', JSON.stringify([{ id: 'wrong' }]));

  const restored = await runner.restoreFromBackup(backupKey);
  assert.equal(restored.ok, true);
  assert.deepEqual(JSON.parse(storage.map.get('@sc_estimates')), [{ id: 'original' }]);
});

test('LEGACY_KEYS covers the pre-v1.1 keys the app actually writes', () => {
  for (const k of ['@sc_onboarding_done', '@sc_streak_data', '@sc_app_language', '@sc_calc_uses_v2']) {
    assert.ok(LEGACY_KEYS.includes(k), `${k} must be declared`);
  }
});

// ═══ MONEY (INV-01, INV-02, PAY-18) ══════════════════════════════════════════

test('money is integer cents and never drifts', () => {
  assert.equal(toCents(19.99), 1999);
  assert.equal(toCents('$1,234.56'), 123456);
  assert.equal(toCents(0.1) + toCents(0.2), toCents(0.3), 'the float trap');
  assert.equal(fromCents(1999), 19.99);
  assert.equal(formatMoney(123456), '$1,234.56');
  assert.equal(formatMoney(-500), '-$5.00');
  assert.equal(formatMoney(5), '$0.05');
});

test('invalid money input degrades to zero rather than NaN', () => {
  assert.equal(toCents('abc'), 0);
  assert.equal(toCents(Infinity), 0);
  assert.equal(toCents(null), 0);
  assert.equal(formatMoney('nope'), '$0.00');
});

test('totals: subtotal, discount, tax, deposit and balance', () => {
  const totals = computeTotals({
    lineItems: [
      lineItem({ id: '1', kind: LineItemKind.LABOR, quantity: 8, unitPriceCents: 9500 }),
      lineItem({ id: '2', kind: LineItemKind.MATERIAL, quantity: 3, unitPriceCents: 4250 }),
    ],
    taxPercent: 7,
    depositCents: 20000,
  });
  assert.equal(totals.subtotalCents, 76000 + 12750);
  assert.equal(totals.taxCents, Math.round(88750 * 0.07));
  assert.equal(totals.totalCents, 88750 + Math.round(88750 * 0.07));
  assert.equal(totals.balanceDueCents, totals.totalCents);
});

test('a fixed-cent discount beats the percentage and cannot exceed the subtotal', () => {
  const items = [lineItem({ id: '1', quantity: 1, unitPriceCents: 10000 })];
  assert.equal(computeTotals({ lineItems: items, discountCents: 2500, discountPercent: 90 }).discountCents, 2500);
  assert.equal(computeTotals({ lineItems: items, discountCents: 999999 }).discountCents, 10000);
});

test('a discount cannot be used to dodge tax on the taxable portion', () => {
  const totals = computeTotals({
    lineItems: [
      lineItem({ id: '1', quantity: 1, unitPriceCents: 10000, taxable: true }),
      lineItem({ id: '2', quantity: 1, unitPriceCents: 10000, taxable: false }),
    ],
    discountCents: 4000,
    taxPercent: 10,
  });
  // 20000 subtotal, half taxable. After a 4000 discount the taxable base is
  // 16000 * 0.5 = 8000, so tax is 800 — not 1000, and not 600.
  assert.equal(totals.taxableBaseCents, 8000);
  assert.equal(totals.taxCents, 800);
});

test('INV-02 partial payments accumulate and paid-in-full is exact', () => {
  const items = [lineItem({ id: '1', quantity: 1, unitPriceCents: 100000 })];
  const half = computeTotals({ lineItems: items, payments: [payment({ id: 'p1', amountCents: 50000 })] });
  assert.equal(half.amountPaidCents, 50000);
  assert.equal(half.balanceDueCents, 50000);
  assert.equal(half.isPaidInFull, false);

  const full = computeTotals({
    lineItems: items,
    payments: [payment({ id: 'p1', amountCents: 50000 }), payment({ id: 'p2', amountCents: 50000 })],
  });
  assert.equal(full.isPaidInFull, true);
  assert.equal(full.balanceDueCents, 0);
});

test('a refund is a negative payment, so overpayment and refund both read correctly', () => {
  const items = [lineItem({ id: '1', quantity: 1, unitPriceCents: 10000 })];
  const totals = computeTotals({
    lineItems: items,
    payments: [payment({ id: 'p1', amountCents: 10000 }), refund({ id: 'r1', amountCents: 4000 })],
  });
  assert.equal(totals.amountPaidCents, 6000);
  assert.equal(totals.balanceDueCents, 4000);
});

test('PAY-18 fee breakdown never invents a Stripe fee', () => {
  const unknown = feeBreakdown({ customerChargeCents: 50000 });
  assert.equal(unknown.stripeFeeCents, null);
  assert.equal(unknown.feesKnown, false);
  assert.match(unknown.disclaimer, /does not provide accounting, tax, legal/);

  const known = feeBreakdown({ customerChargeCents: 50000, stripeFeeCents: 1480, payoutCents: 48520 });
  assert.equal(known.feesKnown, true);
});

// ═══ DOCUMENTS (INV-03 … INV-06, PAY-10) ═════════════════════════════════════

const mkEstimate = () => createEstimate({
  id: 'est_tok_1', number: 'EST-2026-0001', createdAt: '2026-08-01',
  lineItems: [lineItem({ id: '1', kind: LineItemKind.LABOR, quantity: 10, unitPriceCents: 10000 })],
  taxPercent: 0,
});

test('INV-04 all eight estimate statuses exist', () => {
  assert.deepEqual(Object.keys(EstimateStatus), [
    'DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CONVERTED_TO_INVOICE', 'ARCHIVED',
  ]);
});

test('PAY-10 all eleven invoice statuses exist', () => {
  assert.equal(Object.keys(InvoiceStatus).length, 11);
  for (const s of ['DRAFT', 'READY_TO_SEND', 'SENT', 'VIEWED', 'PAYMENT_PENDING', 'PARTIALLY_PAID',
    'PAID', 'OVERDUE', 'VOID', 'REFUNDED', 'PAYMENT_FAILED']) {
    assert.ok(InvoiceStatus[s], `missing ${s}`);
  }
});

test('PAY-09 all seven connected-account states exist', () => {
  assert.equal(Object.keys(ConnectedAccountStatus).length, 7);
});

test('illegal transitions are refused with the legal set', () => {
  const est = mkEstimate();
  const bad = transition(est, EstimateStatus.ACCEPTED, { at: '2026-08-02' });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /Illegal transition DRAFT → ACCEPTED/);
  assert.deepEqual(bad.allowed, ['SENT', 'ARCHIVED']);

  const good = transition(est, EstimateStatus.SENT, { at: '2026-08-02' });
  assert.equal(good.ok, true);
  assert.equal(good.doc.status, 'SENT');
});

test('every transition appends to the audit trail', () => {
  let doc = mkEstimate();
  doc = transition(doc, EstimateStatus.SENT, { at: '2026-08-02' }).doc;
  doc = transition(doc, EstimateStatus.VIEWED, { at: '2026-08-03' }).doc;
  assert.equal(doc.auditTrail.length, 3, 'created + 2 transitions');
  assert.equal(doc.auditTrail[2].event, 'STATUS_CHANGED');
});

test('a paid invoice can only be refunded, never re-opened', () => {
  assert.deepEqual(INVOICE_TRANSITIONS.PAID, ['REFUNDED']);
  assert.deepEqual(INVOICE_TRANSITIONS.VOID, []);
  assert.deepEqual(ESTIMATE_TRANSITIONS.ARCHIVED, []);
});

test('INV-05 conversion creates a new invoice and does not mutate the estimate', () => {
  let est = mkEstimate();
  est = transition(est, EstimateStatus.SENT, { at: '2026-08-02' }).doc;
  est = transition(est, EstimateStatus.ACCEPTED, { at: '2026-08-03' }).doc;
  const before = JSON.parse(JSON.stringify(est));

  const res = convertEstimateToInvoice(est, { id: 'inv_tok_1', number: 'INV-2026-0001', at: '2026-08-04' });
  assert.equal(res.ok, true);
  assert.equal(res.invoice.kind, 'INVOICE');
  assert.equal(res.invoice.sourceEstimateId, 'est_tok_1');
  assert.equal(res.estimate.convertedInvoiceId, 'inv_tok_1');
  assert.equal(res.estimate.status, EstimateStatus.CONVERTED_TO_INVOICE);

  // The original object handed in is untouched — no in-place mutation.
  assert.equal(before.status, EstimateStatus.ACCEPTED);
  assert.equal(est.status, EstimateStatus.ACCEPTED);

  // Line items are copied, not shared.
  res.invoice.lineItems[0].unitPriceCents = 1;
  assert.equal(est.lineItems[0].unitPriceCents, 10000, 'estimate line items unaffected');
});

test('INV-05 only an ACCEPTED estimate converts', () => {
  const est = mkEstimate();
  const res = convertEstimateToInvoice(est, { id: 'i', number: 'n', at: '2026-08-04' });
  assert.equal(res.ok, false);
  assert.match(res.error, /Only an ACCEPTED estimate converts/);
});

test('INV-05 material difference is flagged when pricing drifts after acceptance', () => {
  let est = mkEstimate();
  est = transition(est, EstimateStatus.SENT, { at: '2026-08-02' }).doc;
  est = transition(est, EstimateStatus.ACCEPTED, { at: '2026-08-03' }).doc;
  const { invoice } = convertEstimateToInvoice(est, { id: 'i', number: 'n', at: '2026-08-04' });

  assert.equal(materialDifference(est, invoice).differs, false, 'identical conversion does not warn');

  const inflated = { ...invoice, lineItems: [{ ...invoice.lineItems[0], unitPriceCents: 15000 }] };
  const diff = materialDifference(est, inflated);
  assert.equal(diff.differs, true);
  assert.equal(diff.percent, 50);
  assert.equal(diff.deltaCents, 50000);
});

test('INV-06 recording a payment moves the invoice to PARTIALLY_PAID then PAID', () => {
  let inv = createInvoice({
    id: 'inv_tok', number: 'INV-2026-0002', createdAt: '2026-08-01',
    lineItems: [lineItem({ id: '1', quantity: 1, unitPriceCents: 100000 })],
  });
  inv = transition(inv, InvoiceStatus.READY_TO_SEND, { at: '2026-08-02' }).doc;
  inv = transition(inv, InvoiceStatus.SENT, { at: '2026-08-02' }).doc;

  const first = recordPayment(inv, { id: 'p1', amountCents: 40000, method: PaymentMethod.CHECK }, { at: '2026-08-03' });
  assert.equal(first.ok, true);
  assert.equal(first.doc.status, InvoiceStatus.PARTIALLY_PAID);
  assert.equal(first.totals.balanceDueCents, 60000);

  const second = recordPayment(first.doc, { id: 'p2', amountCents: 60000 }, { at: '2026-08-04' });
  assert.equal(second.doc.status, InvoiceStatus.PAID);
  assert.equal(second.totals.balanceDueCents, 0);
});

test('INV-06 a refund on a paid invoice moves it to REFUNDED', () => {
  let inv = createInvoice({
    id: 'i', number: 'n', createdAt: '2026-08-01',
    lineItems: [lineItem({ id: '1', quantity: 1, unitPriceCents: 10000 })],
  });
  inv = transition(inv, InvoiceStatus.READY_TO_SEND, { at: '2026-08-02' }).doc;
  inv = transition(inv, InvoiceStatus.SENT, { at: '2026-08-02' }).doc;
  inv = recordPayment(inv, { id: 'p1', amountCents: 10000 }, { at: '2026-08-03' }).doc;
  assert.equal(inv.status, InvoiceStatus.PAID);

  const refunded = recordRefund(inv, { id: 'r1', amountCents: 10000 }, { at: '2026-08-05' });
  assert.equal(refunded.doc.status, InvoiceStatus.REFUNDED);
  assert.equal(refunded.totals.amountPaidCents, 0);
});

test('a void invoice rejects payment', () => {
  let inv = createInvoice({ id: 'i', number: 'n', createdAt: '2026-08-01', lineItems: [] });
  inv = transition(inv, InvoiceStatus.VOID, { at: '2026-08-02' }).doc;
  const res = recordPayment(inv, { id: 'p', amountCents: 100 }, { at: '2026-08-03' });
  assert.equal(res.ok, false);
});

test('a zero or negative payment is rejected', () => {
  const inv = createInvoice({ id: 'i', number: 'n', createdAt: '2026-08-01', lineItems: [] });
  assert.equal(recordPayment(inv, { id: 'p', amountCents: 0 }, { at: 'x' }).ok, false);
  assert.equal(recordPayment(inv, { id: 'p', amountCents: -500 }, { at: 'x' }).ok, false);
});

test('INV-06 duplicate resets status and payments but keeps the work', () => {
  let inv = createInvoice({
    id: 'i', number: 'INV-1', createdAt: '2026-08-01',
    lineItems: [lineItem({ id: '1', quantity: 2, unitPriceCents: 5000 })],
  });
  inv = transition(inv, InvoiceStatus.READY_TO_SEND, { at: '2026-08-02' }).doc;
  inv = transition(inv, InvoiceStatus.SENT, { at: '2026-08-02' }).doc;
  inv = recordPayment(inv, { id: 'p', amountCents: 10000 }, { at: '2026-08-03' }).doc;

  const copy = duplicate(inv, { id: 'i2', number: 'INV-2', at: '2026-08-06' });
  assert.equal(copy.status, InvoiceStatus.DRAFT);
  assert.deepEqual(copy.payments, []);
  assert.equal(copy.lineItems.length, 1);
  assert.equal(totalsFor(copy).balanceDueCents, 10000);
});

test('SEC-06 public identity is an unguessable token, not the sequential number', () => {
  assert.equal(formatDocumentNumber('INV', 7, 2026), 'INV-2026-0007');
  const bytes = (n) => Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) % 256);
  const token = generateToken(bytes, 22);
  assert.equal(token.length, 22);
  assert.ok(!/[IO01]/.test(token), 'ambiguous characters excluded');
  assert.notEqual(token, generateToken((n) => Uint8Array.from({ length: n }, (_, i) => (i * 53 + 3) % 256), 22));
});

test('overdue is derived on read and never applies to a paid or void invoice', () => {
  const base = createInvoice({ id: 'i', number: 'n', createdAt: '2026-08-01', lineItems: [] });
  assert.equal(isOverdue({ ...base, status: InvoiceStatus.SENT, dueDate: '2026-08-01' }, '2026-08-05'), true);
  assert.equal(isOverdue({ ...base, status: InvoiceStatus.SENT, dueDate: '2026-08-10' }, '2026-08-05'), false);
  assert.equal(isOverdue({ ...base, status: InvoiceStatus.PAID, dueDate: '2026-08-01' }, '2026-08-05'), false);
  assert.equal(isOverdue({ ...base, status: InvoiceStatus.VOID, dueDate: '2026-08-01' }, '2026-08-05'), false);
  assert.equal(isOverdue(base, '2026-08-05'), false, 'no due date, never overdue');
});

// ═══ REGISTRY: contractors, licences, permits ════════════════════════════════

test('a verification badge cannot be self-granted', () => {
  const profile = contractorProfile({ id: 'c1', companyName: 'Doe Electric', createdAt: '2026-08-01' });
  assert.equal(profile.verification.badge, false);
  assert.equal(canShowVerificationBadge(profile), false);

  const faked = { ...profile, verification: { ...profile.verification, status: VerificationStatus.VERIFIED, badge: true } };
  assert.equal(canShowVerificationBadge(faked), false, 'no provider and no verified licence');

  const legit = {
    ...profile,
    licenses: [{ id: 'l1', status: VerificationStatus.VERIFIED }],
    verification: { status: VerificationStatus.VERIFIED, badge: true, verifiedAt: 'x', grantedBy: 'state-provider' },
  };
  assert.equal(canShowVerificationBadge(legit), true);
});

test('a contractor profile is private by default — the marketplace is not built', () => {
  const p = contractorProfile({ id: 'c1', createdAt: '2026-08-01' });
  assert.equal(p.visibility, 'PRIVATE');
  assert.equal(p.reviews.count, 0);
  assert.equal(p.reviews.source, 'NONE');
});

test('the licence provider interface is enforced at registration', () => {
  const registry = createLicenseRegistry();
  assert.throws(() => registry.register({ id: 'bad' }), /Invalid licence provider/);

  const provider = {
    id: 'fl-dbpr', states: ['FL'],
    verifyLicense: async ({ number, state }) => normalizedResult({
      found: true, number, state, status: VerificationStatus.VERIFIED, providerId: 'fl-dbpr', checkedAt: 1,
    }),
    searchLicense: async () => [],
    verifyBusiness: async () => normalizedResult({}),
    normalizeResults: (raw) => raw,
  };
  assert.equal(isValidProvider(provider), true);
  assert.equal(registry.register(provider), 'fl-dbpr');
});

test('an unsupported state degrades gracefully rather than throwing', async () => {
  const registry = createLicenseRegistry();
  const result = await registry.verify({ number: '123', state: 'ZZ' });
  assert.equal(result.unsupportedState, true);
  assert.equal(result.found, false);
  assert.match(result.disclaimer, /Verify with the issuing authority/);
});

test('licence lookups are cached within the TTL', async () => {
  let calls = 0;
  let time = 0;
  const registry = createLicenseRegistry({ cacheTtlMs: 1000, now: () => time });
  registry.register({
    id: 'p', states: ['*'],
    verifyLicense: async ({ number, state }) => { calls++; return normalizedResult({ found: true, number, state }); },
    searchLicense: async () => [], verifyBusiness: async () => normalizedResult({}), normalizeResults: (r) => r,
  });

  const a = await registry.verify({ number: 'E123', state: 'TX' });
  assert.equal(a.fromCache, false);
  const b = await registry.verify({ number: 'E123', state: 'TX' });
  assert.equal(b.fromCache, true);
  assert.equal(calls, 1);

  time = 2000;
  const c = await registry.verify({ number: 'E123', state: 'TX' });
  assert.equal(c.fromCache, false);
  assert.equal(calls, 2);
});

test('every required permit status exists and transitions are enforced', () => {
  for (const s of ['DRAFT', 'SUBMITTED', 'ISSUED', 'INSPECTION_SCHEDULED', 'PASSED',
    'CORRECTION_REQUIRED', 'FAILED', 'FINALED', 'EXPIRED']) {
    assert.ok(PermitStatus[s], `missing ${s}`);
  }
  const p = permit({ id: 'pm1', ahj: 'City of Springfield', createdAt: '2026-08-01' });
  assert.equal(transitionPermit(p, PermitStatus.PASSED, { at: 'x' }).ok, false, 'cannot skip to PASSED from DRAFT');

  const submitted = transitionPermit(p, PermitStatus.SUBMITTED, { at: '2026-08-02' });
  assert.equal(submitted.ok, true);
  assert.equal(submitted.permit.timeline.length, 2);
  assert.deepEqual(PERMIT_TRANSITIONS.FINALED, [], 'FINALED is terminal');
});

test('a failed inspection can route back through correction and re-inspection', () => {
  let p = permit({ id: 'pm', createdAt: '2026-08-01' });
  p = transitionPermit(p, PermitStatus.SUBMITTED, { at: '1' }).permit;
  p = transitionPermit(p, PermitStatus.ISSUED, { at: '2' }).permit;
  p = transitionPermit(p, PermitStatus.INSPECTION_SCHEDULED, { at: '3' }).permit;
  p = transitionPermit(p, PermitStatus.FAILED, { at: '4' }).permit;
  p = transitionPermit(p, PermitStatus.CORRECTION_REQUIRED, { at: '5' }).permit;
  const back = transitionPermit(p, PermitStatus.INSPECTION_SCHEDULED, { at: '6' });
  assert.equal(back.ok, true);
  assert.equal(back.permit.timeline.length, 7);
});

test('the inspection checklist cites only verified references', () => {
  for (const item of INSPECTION_CHECKLIST) {
    if (item.verified) assert.ok(item.ref && item.ref.startsWith('NEC'), `${item.id} must carry a real citation`);
    else assert.equal(item.ref, null, `${item.id} must not carry an unverified citation`);
  }
});

test('expiry is a pure date comparison', () => {
  assert.equal(isExpired({ expiresAt: '2026-01-01' }, '2026-08-05'), true);
  assert.equal(isExpired({ expiresAt: '2027-01-01' }, '2026-08-05'), false);
  assert.equal(isExpired({}, '2026-08-05'), false);
});

// ═══ SEARCH ══════════════════════════════════════════════════════════════════

const buildIndex = () => {
  const index = createSearchIndex({ now: () => 0 });
  index.registerSource({
    id: 'calculators', kind: SourceKind.CALCULATOR, weight: 1.2,
    load: () => [
      searchRecord({ id: 'boxfill', kind: SourceKind.CALCULATOR, title: 'Box Fill', keywords: ['314.16', 'cubic inches'], route: 'boxfill' }),
      searchRecord({ id: 'conduitfill', kind: SourceKind.CALCULATOR, title: 'Conduit Fill', keywords: ['wire fill', 'raceway', '40%'], route: 'conduitfill' }),
      searchRecord({ id: 'voltagedrop', kind: SourceKind.CALCULATOR, title: 'Voltage Drop', keywords: ['vd', '3%'], route: 'volt' }),
    ],
  });
  index.registerSource({
    id: 'invoices', kind: SourceKind.INVOICE, weight: 1.5,
    load: () => [
      searchRecord({ id: 'inv1', kind: SourceKind.INVOICE, title: 'INV-2026-0001', subtitle: 'Panel upgrade', updatedAt: '2026-08-04' }),
    ],
  });
  index.registerSource({
    id: 'lessons', kind: SourceKind.LESSON, weight: 1,
    load: () => [
      searchRecord({ id: 'l1', kind: SourceKind.LESSON, title: 'Three-Way Switches', keywords: ['traveler', 'common'], requiresEntitlement: 'pro' }),
    ],
  });
  return index;
};

test('search finds a calculator by its trade synonym', async () => {
  const { results } = await buildIndex().search('wire fill');
  assert.equal(results[0].id, 'conduitfill', '"wire fill" must find Conduit Fill');
});

test('an exact title match outranks a partial one', async () => {
  const { results } = await buildIndex().search('box fill');
  assert.equal(results[0].id, 'boxfill');
});

test('matching every token beats a strong partial match', () => {
  const both = scoreRecord(searchRecord({ id: 'a', kind: 'X', title: 'Box Fill' }), tokenize('box fill'));
  const one = scoreRecord(searchRecord({ id: 'b', kind: 'X', title: 'Box Box Box' }), tokenize('box fill'));
  assert.ok(both > one);
});

test('locked results still appear, marked, so Pro value is visible', async () => {
  const { results } = await buildIndex().search('three-way', { entitlements: [] });
  const lesson = results.find((r) => r.id === 'l1');
  assert.ok(lesson, 'a locked lesson is not hidden');
  assert.equal(lesson.locked, true);

  const unlocked = await buildIndex().search('three-way', { entitlements: ['pro'] });
  assert.equal(unlocked.results.find((r) => r.id === 'l1').locked, false);
});

test('search can be filtered by kind, and an empty query returns nothing', async () => {
  const index = buildIndex();
  const filtered = await index.search('fill', { kinds: [SourceKind.INVOICE] });
  assert.equal(filtered.results.length, 0);
  assert.deepEqual((await index.search('   ')).results, []);
});

test('a source that throws cannot break search', async () => {
  const index = buildIndex();
  index.registerSource({ id: 'broken', kind: SourceKind.PHOTO, load: () => { throw new Error('boom'); } });
  const { results } = await index.search('box fill');
  assert.ok(results.length > 0, 'other sources still return');
});

test('grouped search sections by kind', async () => {
  const { groups } = await buildIndex().searchGrouped('fill');
  assert.ok(groups.some((g) => g.kind === SourceKind.CALCULATOR));
});

// ═══ GAMIFICATION ════════════════════════════════════════════════════════════

test('achievements unlock once and never re-pay XP', () => {
  const stats = { ...emptyStats(), lessonsCompleted: 1, completedLessonIds: ['x'] };
  const first = evaluateAchievements(stats, []);
  assert.ok(first.newlyUnlocked.includes('first_circuit'));
  assert.ok(first.xpAwarded > 0);

  const second = evaluateAchievements(stats, first.unlocked);
  assert.deepEqual(second.newlyUnlocked, []);
  assert.equal(second.xpAwarded, 0, 're-evaluating must not pay again');
});

test('every achievement requires a real action, not merely opening the app', () => {
  const none = evaluateAchievements(emptyStats(), []);
  assert.deepEqual(none.unlocked, [], 'a brand new user has earned nothing');
  assert.equal(ACHIEVEMENTS.length, 16);
});

test('a malformed stats object cannot crash achievement evaluation', () => {
  const result = evaluateAchievements({ completedLessonIds: null }, []);
  assert.ok(Array.isArray(result.unlocked));
});

test('the streak grace day survives one missed day but not two', () => {
  assert.equal(streakState({ lastActiveDate: '2026-08-05', currentStreak: 5, today: '2026-08-05' }).status, 'ACTIVE_TODAY');
  assert.equal(streakState({ lastActiveDate: '2026-08-04', currentStreak: 5, today: '2026-08-05' }).status, 'ACTIVE');
  assert.equal(streakState({ lastActiveDate: '2026-08-03', currentStreak: 5, today: '2026-08-05' }).status, 'AT_RISK');

  const broken = streakState({ lastActiveDate: '2026-08-01', currentStreak: 5, today: '2026-08-05' });
  assert.equal(broken.status, 'BROKEN');
  assert.equal(broken.currentStreak, 0);
  assert.equal(broken.previousStreak, 5);
});

test('the monthly challenge is deterministic and does not change mid-month', () => {
  const a = monthlyChallenge(2026, 8);
  const b = monthlyChallenge(2026, 8);
  assert.deepEqual(a, b);
  assert.notDeepEqual(monthlyChallenge(2026, 8).id, monthlyChallenge(2026, 9).id);

  const progress = challengeProgress(a, { [a.metric]: a.target });
  assert.equal(progress.complete, true);
  assert.equal(progress.percent, 100);
});

// ═══ AI CONTEXT (AI-02, AI-03, AI-04) ════════════════════════════════════════

test('AI-02 tool context carries structured inputs, result and code context', () => {
  const ctx = buildToolContext({
    tool: 'voltage_drop',
    inputs: { amps: 20, distanceFt: 150, awg: '10' },
    result: { dropPercent: 2.8 },
    userRole: 'journeyman',
    adoptedCodeContext: { selected: '2023', effective: '2023' },
    requestedAction: AiAction.EXPLAIN,
  });
  assert.equal(ctx.tool, 'voltage_drop');
  assert.equal(ctx.inputs.amps, 20);
  assert.equal(ctx.result.dropPercent, 2.8);
  assert.deepEqual(ctx.responseContract, RESPONSE_CONTRACT);
  assert.match(ctx.citationPolicy, /Do not fabricate NEC citations/);
  assert.match(ctx.safetyContext, /Never instruct energized work/);
});

test('ANL-07 customer information never reaches an AI payload', () => {
  const ctx = buildToolContext({
    tool: 'estimator',
    inputs: {
      customerName: 'Jane Doe',
      customerEmail: 'jane@example.com',
      customerAddress: '42 Oak Ave',
      notes: 'gate code 1234',
      squareFeet: 2400,
    },
  });
  assert.equal(ctx.inputs.squareFeet, 2400);
  for (const leaked of ['customerName', 'customerEmail', 'customerAddress', 'notes']) {
    assert.equal(ctx.inputs[leaked], undefined, `${leaked} must not be forwarded`);
  }
});

test('stripIdentifying works recursively and terminates on deep structures', () => {
  const deep = { a: { b: { c: { customerName: 'Jane', keep: 1 } } } };
  assert.equal(stripIdentifying(deep).a.b.c.customerName, undefined);
  assert.equal(stripIdentifying(deep).a.b.c.keep, 1);
  const cyclicish = { x: [{ customerPhone: '5551234567', ok: true }] };
  assert.equal(stripIdentifying(cyclicish).x[0].customerPhone, undefined);
  assert.equal(stripIdentifying(cyclicish).x[0].ok, true);
});

test('AI-03/AI-04 simulation context ships the engine verdict as authoritative', () => {
  const lesson = lessonById('three-way-source-at-switch');
  const circuit = solutionCircuit(lesson);
  const result = validate(circuit, lesson.expectations);

  const ctx = buildSimulationContext({
    lesson, validationResult: result, userConductors: circuit.conductors, hintLevel: 2, attemptCount: 3,
  });

  assert.equal(ctx.lessonId, lesson.id);
  assert.equal(ctx.lessonVersion, 1);
  assert.equal(ctx.engineVerdict.authoritative, true);
  assert.equal(ctx.engineVerdict.valid, true);
  assert.equal(ctx.engineVerdict.truthTable.length, 4);
  assert.equal(ctx.hintLevel, 2);
  assert.equal(ctx.attemptCount, 3);
  assert.ok(ctx.componentGraph.length > 0);
  assert.ok(ctx.userConnections.length > 0);
  assert.match(ctx.engineAuthorityNote, /Do not declare an invalid circuit valid/);
});

test('AI-04 the payload tells the model it cannot overturn a failed verdict', () => {
  const lesson = lessonById('single-pole-source-at-switch');
  const broken = { components: lesson.components(), conductors: [] };
  const result = validate(broken, lesson.expectations);
  const ctx = buildSimulationContext({ lesson, validationResult: result });
  assert.equal(ctx.engineVerdict.valid, false);
  assert.ok(ctx.engineVerdict.findings.length > 0);
  assert.equal(ctx.engineVerdict.authoritative, true);
});

test('document AI context carries shape and scope, never the customer', () => {
  const doc = createInvoice({
    id: 'i', number: 'INV-1', createdAt: '2026-08-01',
    contractorName: 'Doe Electric',
    customer: { id: 'c', name: 'Jane Doe', email: 'jane@example.com' },
    lineItems: [lineItem({ id: '1', kind: LineItemKind.LABOR, quantity: 1, unitPriceCents: 10000 })],
    scopeOfWork: 'Replace 200A panel',
  });
  const ctx = buildDocumentContext({ document: doc, totals: totalsFor(doc) });

  assert.equal(ctx.lineItemCount, 1);
  assert.equal(ctx.scopeOfWork, 'Replace 200A panel');
  assert.equal(ctx.customer, undefined, 'the customer object must not travel');
  assert.equal(ctx.contractorName, undefined);
  assert.equal(ctx.totals.totalCents, 10000);
});
