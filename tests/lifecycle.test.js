// ─── LIFECYCLE + FIELD INTELLIGENCE TESTS ────────────────────────────────────
// The two claims that matter:
//
//   · a stage is derived from evidence, so it cannot go stale, and a job that
//     went quiet for three years still shows the right thing
//   · a correction can be traced — "this takeoff was wrong, what else is wrong"
//     has a real answer, including which of those went to the customer

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  lifecycle, timeline, timelineText, atMs, STAGES, STAGE_IDS, stageById, EventKind, DAY_MS,
} from '../src/core/domain/lifecycle.js';
import {
  deriveArtifact, lineage, downstreamOf, impactReport, supersededWork,
  availableHandoffs, intelligenceReport, validateGraph, TOOLS, HANDOFFS, toolById,
  PayloadKind, ARTIFACT_PAYLOAD, CUSTOMER_FACING, INTELLIGENCE_NOTE,
} from '../src/core/domain/fieldIntelligence.js';
import { hydrate, emptyWorld } from '../src/core/domain/projectHub.js';
import { project, photo, addPhoto, ProjectTemplate } from '../src/core/domain/jobcam.js';
import { attachArtifact, createArtifact, ArtifactKind } from '../src/core/domain/projectArtifacts.js';
import { createInvoice, createEstimate, recordPayment } from '../src/core/domain/documents.js';
import { lineItem, PaymentMethod } from '../src/core/domain/money.js';
import { dailyLog, crewEntry } from '../src/core/domain/dailyLog.js';

const T = (iso) => Date.parse(iso);
const START = '2026-01-05T09:00:00.000Z';

const bare = () => hydrate(project({
  id: 'p1', name: 'Reyes panel upgrade', template: ProjectTemplate.PANEL_UPGRADE, createdAt: START,
}));

// ─── Timestamps ──────────────────────────────────────────────────────────────

test('the three timestamp formats in the app all normalise', () => {
  assert.equal(atMs(1700000000000), 1700000000000);
  assert.equal(atMs('2026-01-05T09:00:00.000Z'), T('2026-01-05T09:00:00.000Z'));
  assert.equal(atMs('2026-01-05'), T('2026-01-05T00:00:00.000Z'), 'a bare date is midnight UTC');
});

test('an unparseable timestamp is null, never zero', () => {
  // Zero would sort to 1970 and pin the record to the bottom of the job forever.
  assert.equal(atMs(null), null);
  assert.equal(atMs(''), null);
  assert.equal(atMs('sometime last week'), null);
  assert.equal(atMs(NaN), null);
  assert.equal(atMs({}), null);
});

// ─── Stages are derived ──────────────────────────────────────────────────────

test('every stage is declared completely', () => {
  for (const s of STAGES) {
    assert.ok(s.id && s.label && s.icon && s.describe, `${s.id} incomplete`);
    assert.equal(typeof s.evidence, 'function');
  }
  assert.equal(new Set(STAGE_IDS).size, STAGE_IDS.length);
  assert.equal(stageById('ARRIVAL').label, 'Arrival');
  assert.equal(stageById('nope'), null);
});

test('the lifecycle covers the stages the brief listed', () => {
  for (const id of ['ARRIVAL', 'ESTIMATE', 'PERMIT', 'MATERIALS', 'WORK',
    'INSPECTION', 'COMPLETION', 'WARRANTY', 'SERVICE']) {
    assert.ok(STAGE_IDS.includes(id), `no stage for ${id}`);
  }
});

test('a new project is at Arrival and nowhere else', () => {
  const l = lifecycle(bare());
  assert.equal(l.current.id, 'ARRIVAL');
  assert.equal(l.reachedCount, 1);
  assert.equal(l.next.id, 'ESTIMATE');
  assert.equal(l.gaps.length, 0);
});

test('a stage is reached because evidence exists, not because anyone said so', () => {
  let p = bare();
  const world = { ...emptyWorld(),
    estimates: [{ ...createEstimate({ id: 'e1', number: 'EST-1', createdAt: '2026-01-08T00:00:00Z' }), projectId: 'p1' }] };
  const before = lifecycle(p, world);
  assert.equal(before.stages.find((s) => s.id === 'ESTIMATE').reached, true);
  assert.equal(before.stages.find((s) => s.id === 'ESTIMATE').at, T('2026-01-08T00:00:00Z'));

  // Nothing anywhere set a status field.
  assert.equal(p.status, undefined);
  p = addPhoto(p, photo({ id: 'ph1', uri: 'f://a', capturedAt: '2026-01-10T00:00:00Z', folderId: 'f1', tags: [] }));
  assert.equal(lifecycle(p, world).stages.find((s) => s.id === 'WORK').reached, true);
});

test('a stage is dated by the FIRST qualifying record, not the last', () => {
  const p = addPhoto(
    addPhoto(bare(), photo({ id: 'a', uri: 'f://a', capturedAt: '2026-03-01T00:00:00Z', folderId: 'f1', tags: [] })),
    photo({ id: 'b', uri: 'f://b', capturedAt: '2026-01-20T00:00:00Z', folderId: 'f1', tags: [] }),
  );
  const work = lifecycle(p).stages.find((s) => s.id === 'WORK');
  assert.equal(work.at, T('2026-01-20T00:00:00Z'), 'work started in January, not March');
});

test('completion means paid in full, not invoiced', () => {
  const invoice = { ...createInvoice({ id: 'i1', number: 'INV-1', createdAt: '2026-02-01T00:00:00Z' }),
    projectId: 'p1',
    lineItems: [lineItem({ id: 'l1', description: 'Panel', quantity: 1, unitPriceCents: 250000 })] };

  const raised = lifecycle(bare(), { ...emptyWorld(), invoices: [invoice] });
  const stage = raised.stages.find((s) => s.id === 'COMPLETION');
  assert.equal(stage.reached, false, 'raising an invoice is not completing a job');
  assert.match(stage.detail, /not yet paid/);

  const settled = recordPayment(invoice,
    { id: 'pay1', amountCents: 250000, method: PaymentMethod.CHECK },
    { at: '2026-02-20T00:00:00Z' });
  assert.equal(settled.ok, true, settled.error);
  const done = lifecycle(bare(), { ...emptyWorld(), invoices: [{ ...settled.doc, projectId: 'p1' }] });
  assert.equal(done.stages.find((s) => s.id === 'COMPLETION').reached, true);
});

test('an out-of-order job reports a gap, never an error', () => {
  // Material bought, invoice paid, no permit ever recorded.
  const settled = recordPayment(
    { ...createInvoice({ id: 'i1', number: 'INV-1', createdAt: '2026-02-01T00:00:00Z' }),
      lineItems: [lineItem({ id: 'l1', description: 'x', quantity: 1, unitPriceCents: 1000 })] },
    { id: 'pay1', amountCents: 1000, method: PaymentMethod.CASH }, { at: '2026-02-10T00:00:00Z' },
  );
  assert.equal(settled.ok, true, settled.error);
  const paid = { ...settled.doc, projectId: 'p1' };

  const l = lifecycle(bare(), { ...emptyWorld(), invoices: [paid] });
  assert.equal(l.current.id, 'COMPLETION', 'the furthest stage reached is the current one');
  const gapIds = l.gaps.map((g) => g.id);
  assert.ok(gapIds.includes('PERMIT'), 'the missing permit shows as a gap');
  assert.ok(gapIds.includes('ESTIMATE'));
  assert.ok(!gapIds.includes('WARRANTY'), 'stages ahead of the current one are not gaps');
});

test('the timeline never closes — a service call lands on the same job', () => {
  const paidAt = '2026-02-20T00:00:00.000Z';
  const invoice = { ...createInvoice({ id: 'i1', number: 'INV-1', createdAt: '2026-02-01T00:00:00Z' }),
    projectId: 'p1',
    lineItems: [lineItem({ id: 'l1', description: 'x', quantity: 1, unitPriceCents: 1000 })],
    payments: [{ id: 'pay1', amountCents: 1000, method: PaymentMethod.CASH, recordedAt: paidAt }],
    updatedAt: paidAt };

  const world = { ...emptyWorld(), invoices: [invoice],
    logs: [dailyLog({ projectId: 'p1', date: '2029-06-14', workPerformed: 'Breaker replaced under warranty',
      crew: [crewEntry({ name: 'Evan', minutes: 120 })] })] };

  const l = lifecycle(bare(), world);
  const service = l.stages.find((s) => s.id === 'SERVICE');
  assert.equal(service.reached, true, 'a call-out three years later is a service visit');
  assert.equal(l.open, true, 'the job is never closed');
  assert.ok(l.elapsedDays > 1000, `three years of history, got ${l.elapsedDays} days`);
});

// ─── The timeline ────────────────────────────────────────────────────────────

const busyProject = () => {
  let p = bare();
  p = addPhoto(p, photo({ id: 'ph1', uri: 'f://a', capturedAt: '2026-01-20T00:00:00Z', folderId: 'f1', tags: ['ROUGH_IN'] }));
  p = attachArtifact(p, createArtifact({
    kind: ArtifactKind.CALCULATION, title: 'Voltage drop', summary: '2.1%', savedAt: T('2026-01-22T00:00:00Z'),
  }));
  return p;
};

test('the timeline merges every source in one order', () => {
  const world = { ...emptyWorld(),
    logs: [dailyLog({ projectId: 'p1', date: '2026-01-21', workPerformed: 'Rough-in' })],
    permits: [{ projectId: 'p1', id: 'pm1', number: 'E-1', ahj: 'City', status: 'ISSUED',
      createdAt: '2026-01-15T00:00:00Z', inspections: [{ kind: 'ROUGH_IN', result: 'PASSED', scheduledFor: '2026-01-25' }] }] };

  const tl = timeline(busyProject(), world);
  const kinds = new Set(tl.events.map((e) => e.kind));
  for (const k of [EventKind.STAGE, EventKind.PHOTO, EventKind.ARTIFACT, EventKind.LOG, EventKind.PERMIT, EventKind.INSPECTION]) {
    assert.ok(kinds.has(k), `timeline is missing ${k} events`);
  }
  // Newest first by default, and strictly ordered.
  for (let i = 1; i < tl.events.length; i++) assert.ok(tl.events[i - 1].at >= tl.events[i].at, 'out of order');

  const oldestFirst = timeline(busyProject(), world, { newestFirst: false });
  assert.ok(oldestFirst.events[0].at <= oldestFirst.events[oldestFirst.events.length - 1].at);
});

test('an undated record is kept aside, not dated to 1970', () => {
  const p = addPhoto(bare(), photo({ id: 'ph9', uri: 'f://x', capturedAt: null, folderId: 'f1', tags: [] }));
  const tl = timeline(p);
  assert.ok(tl.undated.some((e) => e.id === 'ph9'), 'the photo must survive');
  assert.ok(!tl.events.some((e) => e.id === 'ph9'), 'and must not be sorted as 1970');
  // The WORK stage is reached — there IS a photo — but nothing can date it, so
  // it lands beside the photo rather than being given a made-up timestamp.
  assert.ok(tl.undated.some((e) => e.kind === EventKind.STAGE && e.stage === 'WORK'));
  assert.equal(tl.count, tl.events.length + tl.undated.length);
  assert.match(timelineText(tl), /UNDATED/);
});

test('the timeline groups by year so a quiet stretch can be scrolled past', () => {
  const world = { ...emptyWorld(), logs: [
    dailyLog({ projectId: 'p1', date: '2026-01-21' }),
    dailyLog({ projectId: 'p1', date: '2029-06-14' }),
  ] };
  const tl = timeline(busyProject(), world);
  const years = tl.years.map((y) => y.year);
  assert.deepEqual(years, [2029, 2026], 'newest year first');
  assert.equal(tl.years.reduce((n, y) => n + y.count, 0), tl.events.length);
});

test('stage events are marked so the spine can be drawn differently', () => {
  const tl = timeline(busyProject());
  const stages = tl.events.filter((e) => e.kind === EventKind.STAGE);
  assert.ok(stages.length >= 2);
  for (const s of stages) assert.ok(STAGE_IDS.includes(s.stage));
  assert.match(timelineText(tl), /● /, 'stage rows render with a different marker');
});

// ─── The graph ───────────────────────────────────────────────────────────────

test('every handoff is consistent with the tools it connects', () => {
  assert.deepEqual(validateGraph(), [], 'the tool graph has broken edges');
  assert.equal(new Set(TOOLS.map((t) => t.id)).size, TOOLS.length);
  assert.equal(new Set(HANDOFFS.map((h) => h.id)).size, HANDOFFS.length);
  for (const t of TOOLS) {
    assert.ok(Array.isArray(t.consumes) && Array.isArray(t.produces), `${t.id} malformed`);
    for (const k of [...t.consumes, ...t.produces]) {
      assert.ok(Object.values(PayloadKind).includes(k), `${t.id} uses unknown payload ${k}`);
    }
  }
});

test('the chain in the brief exists end to end', () => {
  // Blueprint → Estimator → Materials → Invoice, and Inspection → Warranty → Service.
  const edge = (from, to) => HANDOFFS.some((h) => h.from === from && h.to === to);
  assert.ok(edge('blueprint', 'estimator'));
  assert.ok(edge('estimator', 'materials'));
  assert.ok(edge('materials', 'invoice'));
  assert.ok(edge('inspection', 'warranty'));
  assert.ok(edge('warranty', 'service'));
  assert.ok(toolById('sparkai').consumes.includes(PayloadKind.JOB_CONTEXT));
  assert.ok(Object.values(ARTIFACT_PAYLOAD).every((k) => Object.values(PayloadKind).includes(k)));
});

test('a handoff is only offered when there is real data behind it', () => {
  const empty = availableHandoffs(bare());
  assert.equal(empty.ready.length, 0, 'an empty job can hand nothing off');
  assert.ok(empty.blocked.length > 0);
  for (const b of empty.blocked) assert.ok(b.detail, `${b.id} gives no reason`);

  const withTakeoff = attachArtifact(bare(), createArtifact({
    kind: ArtifactKind.TAKEOFF, title: 'Ground floor', summary: '47 devices',
    payload: { devices: new Array(47).fill({ symbol: 'R' }) }, savedAt: T('2026-01-10T00:00:00Z'),
  }));
  const ready = availableHandoffs(withTakeoff).ready;
  const priced = ready.find((h) => h.id === 'takeoff-to-estimate');
  assert.ok(priced, 'a takeoff should unlock pricing');
  assert.match(priced.detail, /47 devices/, 'the offer should name the real count');
  assert.equal(priced.sourceIds.length, 1);
  assert.equal(priced.tab, 'estimator');
});

// ─── Provenance — the moat ───────────────────────────────────────────────────

const chainedProject = () => {
  let p = bare();
  const takeoff = createArtifact({
    kind: ArtifactKind.TAKEOFF, title: 'Ground floor takeoff', summary: '47 devices', savedAt: T('2026-01-10T00:00:00Z'),
  });
  p = attachArtifact(p, takeoff);

  const estimate = deriveArtifact({
    kind: ArtifactKind.ESTIMATE, title: 'Estimate 1', summary: '$24,000', savedAt: T('2026-01-12T00:00:00Z'),
  }, { from: [takeoff], tool: 'estimator' });
  p = attachArtifact(p, estimate);

  const materials = deriveArtifact({
    kind: ArtifactKind.MATERIAL_LIST, title: 'Material list', summary: '112 lines', savedAt: T('2026-01-13T00:00:00Z'),
  }, { from: [estimate], tool: 'materials' });
  p = attachArtifact(p, materials);

  const invoice = deriveArtifact({
    kind: ArtifactKind.INVOICE, title: 'Invoice INV-1', summary: '$24,000', savedAt: T('2026-02-01T00:00:00Z'),
  }, { from: [estimate, materials], tool: 'invoice' });
  p = attachArtifact(p, invoice);

  return { p, ids: { takeoff: takeoff.id, estimate: estimate.id, materials: materials.id, invoice: invoice.id } };
};

test('a derived artifact records what it came from', () => {
  const { p, ids } = chainedProject();
  const est = p.artifacts.find((a) => a.id === ids.estimate);
  assert.deepEqual(est.meta.derivedFrom, [ids.takeoff]);
  assert.equal(est.meta.derivedBy, 'estimator');

  // An artifact made the ordinary way has no parents and does not pretend to.
  const plain = createArtifact({ kind: ArtifactKind.NOTE, title: 'Note' });
  assert.equal(plain.meta.derivedFrom, undefined);
});

test('lineage walks all the way back to the takeoff', () => {
  const { p, ids } = chainedProject();
  const trace = lineage(p, ids.invoice);
  const ancestorIds = trace.ancestors.map((a) => a.id);
  assert.ok(ancestorIds.includes(ids.estimate));
  assert.ok(ancestorIds.includes(ids.materials));
  assert.ok(ancestorIds.includes(ids.takeoff), 'the trace must reach the original takeoff');
  assert.equal(trace.complete, true);
  assert.equal(lineage(p, 'nope'), null);
});

test('a deleted parent leaves a visible hole rather than a tidy lie', () => {
  const { p, ids } = chainedProject();
  const pruned = { ...p, artifacts: p.artifacts.filter((a) => a.id !== ids.takeoff) };
  const trace = lineage(pruned, ids.invoice);
  assert.equal(trace.complete, false, 'a broken trace must not report as complete');
  assert.ok(trace.ancestors.some((a) => a.missing), 'the gap is listed, not omitted');
});

test('"the takeoff was wrong — what else is wrong" has an answer', () => {
  const { p, ids } = chainedProject();
  const impact = impactReport(p, ids.takeoff);
  assert.equal(impact.count, 3, 'estimate, material list and invoice all descend from it');
  const ids3 = impact.affected.map((a) => a.id);
  assert.ok(ids3.includes(ids.estimate) && ids3.includes(ids.materials) && ids3.includes(ids.invoice));
  assert.match(impact.summary, /3 records were built on this/);
});

test('the things that went to the customer are called out separately', () => {
  const { p, ids } = chainedProject();
  const impact = impactReport(p, ids.takeoff);
  const facing = impact.customerFacing.map((a) => a.kind);
  assert.ok(facing.includes(ArtifactKind.ESTIMATE));
  assert.ok(facing.includes(ArtifactKind.INVOICE));
  assert.ok(!facing.includes(ArtifactKind.MATERIAL_LIST), 'a material list is internal');
  assert.match(impact.warning, /went to the customer/);
  assert.ok(CUSTOMER_FACING.includes(ArtifactKind.INVOICE));
});

test('a leaf artifact reports no impact rather than no answer', () => {
  const { p, ids } = chainedProject();
  const impact = impactReport(p, ids.invoice);
  assert.equal(impact.count, 0);
  assert.equal(impact.warning, null);
  assert.match(impact.summary, /Nothing was built on this/);
  assert.equal(impactReport(p, 'missing'), null);
});

test('work built on a superseded takeoff is flagged', () => {
  const { p, ids } = chainedProject();
  // A second takeoff of the same plan replaces the first.
  const redone = createArtifact({
    kind: ArtifactKind.TAKEOFF, title: 'Ground floor takeoff v2', summary: '51 devices', savedAt: T('2026-01-20T00:00:00Z'),
  });
  const updated = attachArtifact(p, redone);

  const stale = supersededWork(updated);
  assert.equal(stale.length, 1, 'the estimate was built on the takeoff that got replaced');
  assert.equal(stale[0].id, ids.estimate);
  assert.equal(stale[0].builtOn[0].id, ids.takeoff);
  assert.match(stale[0].note, /has since been replaced/);

  // Before the second takeoff there is nothing stale.
  assert.deepEqual(supersededWork(p), []);
});

test('a cycle in imported data truncates instead of hanging', () => {
  const a = { ...createArtifact({ kind: ArtifactKind.TAKEOFF, title: 'A' }), id: 'A' };
  const b = { ...createArtifact({ kind: ArtifactKind.ESTIMATE, title: 'B' }), id: 'B' };
  const withCycle = { ...bare(), artifacts: [
    { ...a, meta: { ...a.meta, derivedFrom: ['B'] } },
    { ...b, meta: { ...b.meta, derivedFrom: ['A'] } },
  ] };
  const trace = lineage(withCycle, 'A');
  assert.ok(trace.depth <= 2, 'a cycle must terminate');
  assert.ok(downstreamOf(withCycle, 'A').length <= 2);
});

// ─── The report ──────────────────────────────────────────────────────────────

test('the intelligence report says what can happen next and what is out of date', () => {
  const { p } = chainedProject();
  const r = intelligenceReport(p);
  assert.equal(r.connected, true);
  assert.equal(r.derivedCount, 3);
  assert.equal(r.tracedCount, 3);
  assert.ok(r.nextMoves.length > 0);
  assert.match(r.note, /never applied on their own/);
  assert.equal(INTELLIGENCE_NOTE.includes('snapshot'), true);
});

test('a job that has not used the chain is not reported as broken', () => {
  const r = intelligenceReport(bare());
  assert.equal(r.connected, false);
  assert.equal(r.derivedCount, 0);
  assert.deepEqual(r.superseded, []);
  assert.equal(intelligenceReport(null), null);
});
