// ─── BLUEPRINT AI ────────────────────────────────────────────────────────────
// These tests are about one property: a number cannot reach an estimate unless
// a human put it there. Everything else in this feature is convenience.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SYMBOLS, SYMBOL_IDS, symbolById, resolveSymbol, isCountable, alternativesFor,
  CountBasis, Discipline,
} from '../src/core/blueprint/symbols.js';
import {
  createDevice, Origin, DeviceState, ConfidenceBand, bandFor, REVIEW_THRESHOLD,
  normalizeBox, iou, confirmedCounts, reviewSummary, isCounted, needsReview,
} from '../src/core/blueprint/device.js';
import {
  accept, reject, relabel, merge, split, addManual, acceptAll, flag,
  reviewQueue, duplicateCandidates, canTransition, ReviewAction, setLocation,
} from '../src/core/blueprint/verification.js';
import {
  Basis, BASIS_LABEL, isOrderable, estimateMaterials, scopeExclusions,
  unpricedSymbols, buildEstimate, DEFAULT_ASSEMBLIES,
} from '../src/core/blueprint/estimate.js';
import {
  estimateLabor, resolveUnit, unratedSymbols, combinedFactor, DEFAULT_LABOR_UNITS,
} from '../src/core/blueprint/labor.js';
import {
  answer, breakdown, locate, groundingContext, symbolFromQuery, AnswerKind,
} from '../src/core/blueprint/query.js';
import {
  Stage, STAGE_ORDER, Maturity, createDocument, registerStage, clearStages,
  runStage, run, canRun, verifyComplete, withStageComplete, pipelineStatus,
} from '../src/core/blueprint/pipeline.js';
import {
  normalizeDetection, normalizeResponse, dedupeWithinPass, legacyCountAdapter,
  MAX_DETECTIONS_PER_PAGE,
} from '../src/core/blueprint/recognition.js';

const det = (symbolId, conf, box, page = 1) =>
  createDevice({ symbolId, confidence: conf, box, page, origin: Origin.AI });

const box = (x, y, s = 10) => ({ x1: x, y1: y, x2: x + s, y2: y + s });

// ─── The symbol library ──────────────────────────────────────────────────────

test('every symbol is well formed and the library is a closed vocabulary', () => {
  for (const s of SYMBOLS) {
    assert.ok(s.id && s.label, JSON.stringify(s));
    assert.ok(Object.values(Discipline).includes(s.discipline), `${s.id} has a bogus discipline`);
    assert.ok(Object.values(CountBasis).includes(s.basis), `${s.id} has a bogus basis`);
    for (const alt of s.confusableWith) {
      assert.ok(symbolById(alt), `${s.id} lists unknown confusable "${alt}"`);
    }
  }
  assert.equal(new Set(SYMBOL_IDS).size, SYMBOL_IDS.length, 'symbol ids must be unique');
});

test('an unrecognised symbol becomes UNKNOWN, never a guess and never a drop', () => {
  assert.equal(resolveSymbol('probably a receptacle').id, 'unknown');
  assert.equal(resolveSymbol(null).id, 'unknown');
  assert.equal(resolveSymbol(42).id, 'unknown');
  assert.equal(resolveSymbol('').id, 'unknown');
  // Real ones still resolve, including by plan tag.
  assert.equal(resolveSymbol('receptacle_gfci').id, 'receptacle_gfci');
  assert.equal(resolveSymbol('GFCI').id, 'receptacle_gfci');
  assert.equal(resolveSymbol('S3').id, 'switch_three_way');
});

test('things that cannot honestly be counted are not countable', () => {
  assert.equal(isCountable('receptacle'), true);
  assert.equal(isCountable('conduit_run'), false, 'raceway length is not a count');
  assert.equal(isCountable('home_run'), false);
  assert.equal(isCountable('panel_schedule'), false);
  assert.equal(isCountable('unknown'), false, 'an unidentified mark must never be counted');
});

test('ambiguous symbols offer real alternatives, not a text box', () => {
  const alts = alternativesFor('receptacle').map((s) => s.id);
  assert.ok(alts.includes('receptacle_gfci'));
  assert.ok(alts.every((id) => symbolById(id)));
});

// ─── The device object ───────────────────────────────────────────────────────

test('an AI detection can never be born CONFIRMED', () => {
  for (const conf of [0.4, 0.75, 0.9, 0.99, 1]) {
    const d = det('receptacle', conf, box(0, 0));
    assert.notEqual(d.state, DeviceState.CONFIRMED,
      `confidence ${conf} must not confirm itself — only a human confirms`);
  }
});

test('a human-placed device starts confirmed, because a person put it there', () => {
  const d = createDevice({ symbolId: 'receptacle', box: box(0, 0), origin: Origin.HUMAN });
  assert.equal(d.state, DeviceState.CONFIRMED);
  assert.equal(d.confidence, 1);
});

test('low confidence and unknown symbols are flagged, not quietly proposed', () => {
  assert.equal(det('receptacle', 0.5, box(0, 0)).state, DeviceState.FLAGGED);
  assert.equal(det('receptacle', 0.95, box(0, 0)).state, DeviceState.PROPOSED);
  assert.equal(det('nonsense-symbol', 0.99, box(0, 0)).state, DeviceState.FLAGGED,
    'an unidentified symbol is flagged however confident the model claims to be');
});

test('confidence bands never overstate what a model can calibrate', () => {
  assert.equal(bandFor(0.95), ConfidenceBand.HIGH);
  assert.equal(bandFor(0.8), ConfidenceBand.MEDIUM);
  assert.equal(bandFor(0.5), ConfidenceBand.LOW);
  assert.equal(bandFor('garbage'), ConfidenceBand.LOW, 'unparseable confidence is LOW, not HIGH');
  assert.equal(bandFor(undefined), ConfidenceBand.LOW);
});

test('a malformed bounding box cannot produce negative geometry', () => {
  const b = normalizeBox({ x1: 100, y1: 100, x2: 10, y2: 10 });
  assert.ok(b.x2 >= b.x1 && b.y2 >= b.y1, 'a reversed box must be corrected, not propagated');
  assert.deepEqual(normalizeBox({}), { x1: 0, y1: 0, x2: 0, y2: 0 });
  assert.deepEqual(normalizeBox({ x1: NaN, y1: 'x', x2: undefined, y2: null }),
    { x1: 0, y1: 0, x2: 0, y2: 0 });
});

test('overlap is measured, so duplicates can be found rather than assumed', () => {
  assert.equal(iou(normalizeBox(box(0, 0)), normalizeBox(box(0, 0))), 1);
  assert.equal(iou(normalizeBox(box(0, 0)), normalizeBox(box(100, 100))), 0);
  assert.ok(iou(normalizeBox(box(0, 0)), normalizeBox(box(5, 5))) > 0);
});

// ─── The gate: only humans confirm ───────────────────────────────────────────

test('counts include ONLY what a human confirmed', () => {
  const devices = [
    det('receptacle', 0.99, box(0, 0)),      // PROPOSED
    det('receptacle', 0.99, box(50, 0)),     // PROPOSED
    det('receptacle', 0.5, box(100, 0)),     // FLAGGED
  ];
  assert.equal(confirmedCounts(devices).size, 0, 'nothing is counted before review');

  const reviewed = devices.map(accept);
  assert.equal(confirmedCounts(reviewed).get('receptacle'), 3);
});

test('a rejected device is kept for audit but never counted', () => {
  const devices = [accept(det('receptacle', 0.99, box(0, 0))), det('receptacle', 0.99, box(50, 0))];
  const after = [devices[0], reject(devices[1])];
  assert.equal(confirmedCounts(after).get('receptacle'), 1);
  assert.equal(after.length, 2, 'rejection marks, it does not delete');
  assert.equal(after[1].state, DeviceState.REJECTED);
});

test('the lifecycle refuses transitions that are not real', () => {
  assert.equal(canTransition(DeviceState.PROPOSED, DeviceState.CONFIRMED), true);
  assert.equal(canTransition(DeviceState.CONFIRMED, DeviceState.REJECTED), true,
    'a mis-tap at 6am must be undoable');
  assert.equal(canTransition(DeviceState.FLAGGED, DeviceState.PROPOSED), false,
    'a flagged device cannot slide back to unreviewed');
});

test('every action leaves an audit trail', () => {
  const d = det('receptacle', 0.99, box(0, 0));
  const confirmed = accept(d);
  assert.equal(confirmed.history.length, d.history.length + 1);
  const last = confirmed.history[confirmed.history.length - 1];
  assert.equal(last.action, ReviewAction.ACCEPT);
  assert.equal(last.by, Origin.HUMAN);
  assert.equal(last.to, DeviceState.CONFIRMED);
});

test('relabelling is a confirmation and takes the human confidence', () => {
  const d = det('receptacle', 0.6, box(0, 0));
  const fixed = relabel(d, 'receptacle_gfci');
  assert.equal(fixed.symbolId, 'receptacle_gfci');
  assert.equal(fixed.state, DeviceState.CONFIRMED);
  assert.equal(fixed.confidence, 1,
    "a human's correction carries the human's certainty, not the model's");
  assert.match(fixed.history.at(-1).detail, /receptacle → receptacle_gfci/);
});

test('merge keeps every parent and explains where the count went', () => {
  const a = det('receptacle', 0.9, box(0, 0));
  const b = det('receptacle', 0.85, box(2, 2));
  const merged = merge([a, b], [a.id, b.id]);
  assert.equal(merged.length, 2, 'nothing is destroyed');
  assert.equal(confirmedCounts(merged).get('receptacle'), 1);
  const survivor = merged.find((d) => d.state === DeviceState.CONFIRMED);
  const absorbed = merged.find((d) => d.state === DeviceState.REJECTED);
  assert.deepEqual([...survivor.meta.mergedFrom], [a.id, b.id]);
  assert.equal(absorbed.meta.mergedInto, survivor.id);
});

test('split turns one box into several confirmed devices', () => {
  const one = det('receptacle', 0.9, box(0, 0, 40));
  const after = split([one], one.id, [
    { box: box(0, 0) }, { box: box(10, 0) }, { box: box(20, 0) }, { box: box(30, 0) },
  ]);
  assert.equal(confirmedCounts(after).get('receptacle'), 4);
  assert.equal(after.find((d) => d.id === one.id).state, DeviceState.REJECTED);
  assert.equal(after.filter((d) => d.meta.splitFrom === one.id).length, 4);
});

test('the review queue puts the costly mistakes first', () => {
  const devices = [
    det('receptacle', 0.99, box(0, 0)),
    det('conduit_run', 0.95, box(10, 0)),
    det('unknown-thing', 0.9, box(20, 0)),
    det('receptacle', 0.5, box(30, 0)),
  ];
  const q = reviewQueue(devices);
  assert.equal(q[0].symbolId, 'unknown', 'unidentified marks are worst and go first');
  assert.equal(q.at(-1).confidence, 0.99, 'a confident ordinary receptacle goes last');
});

test('duplicates are reported for a human, never merged automatically', () => {
  const a = det('receptacle', 0.9, box(0, 0));
  const b = det('receptacle', 0.9, box(1, 1));
  const candidates = duplicateCandidates([a, b]);
  assert.equal(candidates.length, 1);
  assert.ok(candidates[0].iou > 0.6);
  // Two genuinely adjacent devices look identical to one detected twice, and
  // only a person reading the drawing can tell.
  assert.equal(confirmedCounts([a, b]).size, 0, 'nothing was auto-resolved');
});

// ─── Recognition normalization ───────────────────────────────────────────────

test('garbage from a model cannot become a device', () => {
  assert.equal(normalizeDetection(null), null);
  assert.equal(normalizeDetection({}), null, 'no box means not reviewable, so not a detection');
  assert.equal(normalizeDetection({ symbol: 'receptacle' }), null);
  assert.equal(normalizeDetection({ symbol: 'receptacle', box: box(0, 0), confidence: 0.1 }), null,
    'below the floor it is noise');
  assert.equal(normalizeDetection({ symbol: 'receptacle', box: box(0, 0), confidence: -5 }), null);
});

test('a hostile or broken response yields an empty takeoff, never a partial one', () => {
  assert.deepEqual(normalizeResponse(null).devices, []);
  assert.deepEqual(normalizeResponse('nope').devices, []);
  assert.deepEqual(normalizeResponse({}).devices, []);

  const flood = Array.from({ length: MAX_DETECTIONS_PER_PAGE + 1 },
    () => ({ symbol: 'receptacle', box: box(0, 0), confidence: 0.9 }));
  const res = normalizeResponse(flood);
  assert.equal(res.devices.length, 0, 'a truncated takeoff looks complete and is not');
  assert.match(res.warnings.join(' '), /discarded rather than truncated/);
});

test('normalized detections are never confirmed, whatever the model claimed', () => {
  const { devices } = normalizeResponse([
    { symbol: 'receptacle', box: box(0, 0), confidence: 1 },
    { symbol: 'receptacle', box: box(50, 0), confidence: 0.99 },
  ]);
  assert.equal(devices.length, 2);
  assert.ok(devices.every((d) => d.state !== DeviceState.CONFIRMED));
  assert.ok(devices.every((d) => d.origin === Origin.AI));
});

test('one pass emitting the same mark twice collapses it', () => {
  const a = det('receptacle', 0.7, box(0, 0));
  const b = det('receptacle_gfci', 0.9, box(0, 0));
  const kept = dedupeWithinPass([a, b]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].symbolId, 'receptacle_gfci', 'the more confident reading survives');
  assert.equal(kept[0].meta.alsoRead, 'receptacle', 'the other reading is remembered for review');
});

test('the legacy count adapter refuses to invent positions', () => {
  const { devices, warnings } = legacyCountAdapter({ receptacles: 12, switches: 4 });
  assert.ok(devices.length > 0);
  assert.ok(devices.every((d) => d.meta.positionless === true));
  assert.ok(devices.every((d) => d.state === DeviceState.FLAGGED),
    'a positionless count is the weakest evidence and must be reviewed');
  assert.match(warnings.join(' '), /not a set of located devices/);
});

// ─── Estimating ──────────────────────────────────────────────────────────────

const confirmedSet = () => [
  ...Array.from({ length: 10 }, (_, i) => accept(det('receptacle', 0.95, box(i * 20, 0)))),
  ...Array.from({ length: 3 }, (_, i) => accept(det('receptacle_gfci', 0.95, box(i * 20, 50)))),
  ...Array.from({ length: 4 }, (_, i) => accept(det('switch_single', 0.95, box(i * 20, 100)))),
  accept(det('panel', 0.95, box(0, 200))),
];

test('an estimate is built only from confirmed devices', () => {
  const mixed = [
    accept(det('receptacle', 0.95, box(0, 0))),
    det('receptacle', 0.95, box(20, 0)),          // unreviewed
    reject(det('receptacle', 0.95, box(40, 0))),  // rejected
  ];
  const lines = estimateMaterials(mixed);
  const recep = lines.find((l) => l.id === 'receptacle_15a');
  assert.equal(recep.qty, 1, 'only the confirmed one contributes');
});

test('every material line carries how it was derived', () => {
  for (const l of estimateMaterials(confirmedSet())) {
    assert.ok(Object.values(Basis).includes(l.basis), `${l.id} has no basis`);
    assert.equal(l.basisLabel, BASIS_LABEL[l.basis]);
    assert.ok(l.derivation, `${l.id} must explain itself`);
    assert.equal(l.orderable, isOrderable(l.basis));
  }
});

test('a line mixing an allowance with a count is an allowance', () => {
  // Wire connectors are an allowance everywhere they appear, so a total built
  // from several device types must not round itself up to CALCULATED.
  const lines = estimateMaterials(confirmedSet());
  const nuts = lines.find((l) => l.id === 'wirenut');
  assert.equal(nuts.basis, Basis.ALLOWANCE);
  assert.equal(nuts.orderable, false, 'you do not order from an allowance');
});

test('device counts are orderable and connectors are not', () => {
  const lines = estimateMaterials(confirmedSet());
  assert.equal(lines.find((l) => l.id === 'receptacle_15a').orderable, true);
  assert.equal(lines.find((l) => l.id === 'receptacle_gfci').qty, 3);
  assert.equal(lines.find((l) => l.id === 'wirenut').orderable, false);
});

test('what is NOT estimated appears on the estimate', () => {
  const ex = scopeExclusions(confirmedSet());
  const ids = ex.map((l) => l.id);
  for (const required of ['branch_wire', 'feeder', 'home_run', 'conduit']) {
    assert.ok(ids.includes(required), `${required} must be visible as a scope statement`);
  }
  assert.equal(ex.find((l) => l.id === 'feeder').basis, Basis.EXCLUDED);
  assert.equal(ex.find((l) => l.id === 'feeder').qty, null, 'no number is the honest number');
  assert.ok(ex.every((l) => l.derivation), 'every exclusion says why');
});

test('wire is only allowanced once a plan scale is verified', () => {
  const without = scopeExclusions(confirmedSet(), { planScaleVerified: false });
  const with_ = scopeExclusions(confirmedSet(), { planScaleVerified: true });
  assert.equal(without.find((l) => l.id === 'branch_wire').basis, Basis.FIELD_VERIFY);
  assert.equal(with_.find((l) => l.id === 'branch_wire').basis, Basis.ALLOWANCE);
});

test('engineered items are reported as priced-separately, not forgotten', () => {
  const unpriced = unpricedSymbols(confirmedSet());
  assert.ok(unpriced.some((u) => u.symbolId === 'panel'));
  assert.ok(unpriced.every((u) => u.reason));
});

test('an estimate is not quotable while anything is unreviewed', () => {
  const partial = [...confirmedSet(), det('receptacle', 0.95, box(500, 500))];
  const est = buildEstimate(partial);
  assert.equal(est.readyToQuote, false);
  assert.equal(est.review.outstanding, 1);

  assert.equal(buildEstimate(confirmedSet()).readyToQuote, true);
});

test('assemblies are overridable without touching the engine', () => {
  const custom = { ...DEFAULT_ASSEMBLIES, receptacle: [{ item: 'device_box', qty: 2, unit: 'ea', basis: Basis.CALCULATED }] };
  const lines = estimateMaterials(confirmedSet(), { assemblies: custom });
  assert.equal(lines.find((l) => l.id === 'device_box').qty, 10 * 2 + 3 + 4);
  assert.equal(lines.find((l) => l.id === 'receptacle_15a'), undefined,
    'a company that does not want that line does not get it');
});

// ─── Labor ───────────────────────────────────────────────────────────────────

test('labor units resolve through the override chain, most specific first', () => {
  assert.deepEqual(resolveUnit('receptacle'), { hours: DEFAULT_LABOR_UNITS.receptacle, source: 'DEFAULT' });
  assert.deepEqual(resolveUnit('receptacle', { companyUnits: { receptacle: 0.4 } }),
    { hours: 0.4, source: 'COMPANY' });
  assert.deepEqual(resolveUnit('receptacle', { companyUnits: { receptacle: 0.4 }, projectUnits: { receptacle: 0.3 } }),
    { hours: 0.3, source: 'PROJECT' });
  assert.deepEqual(resolveUnit('transformer'), { hours: null, source: 'NONE' });
});

test('a device with no labor unit is reported, never costed at zero', () => {
  const labor = estimateLabor(confirmedSet());
  assert.ok(labor.unrated.some((u) => u.symbolId === 'panel'));
  assert.equal(labor.readyToQuote, false, 'unrated scope blocks a final number');
  assert.ok(labor.unrated.every((u) => u.reason));
});

test('labor arithmetic is right and condition factors compound', () => {
  const devices = Array.from({ length: 10 }, (_, i) => accept(det('receptacle', 0.95, box(i * 20, 0))));
  const plain = estimateLabor(devices);
  assert.equal(plain.baseHours, 10 * DEFAULT_LABOR_UNITS.receptacle);
  assert.equal(plain.totalHours, plain.baseHours);

  const reno = estimateLabor(devices, { conditions: ['RENOVATION'] });
  assert.equal(reno.factor, 1.35);
  assert.ok(Math.abs(reno.totalHours - plain.baseHours * 1.35) < 0.01);

  assert.ok(Math.abs(combinedFactor(['RENOVATION', 'HIGH_CEILING']) - 1.35 * 1.25) < 1e-9);
  assert.equal(combinedFactor(['NOT_A_REAL_CONDITION']), 1, 'an unknown condition is neutral');
});

test('no labor cost appears without a rate someone supplied', () => {
  const devices = [accept(det('receptacle', 0.95, box(0, 0)))];
  assert.equal(estimateLabor(devices).totalCost, null, 'inventing a labor rate is fiction');
  assert.equal(estimateLabor(devices, { rate: 100 }).totalCost, DEFAULT_LABOR_UNITS.receptacle * 100);
});

// ─── Grounded query ──────────────────────────────────────────────────────────

test('a question is answered from confirmed devices or not at all', () => {
  const devices = confirmedSet();
  const a = answer('how many GFCIs are there', devices);
  assert.equal(a.kind, AnswerKind.COUNT);
  assert.equal(a.count, 3);
  assert.equal(a.evidence.length, 3, 'the answer carries the devices behind it');
});

test('an unfinished review produces a refusal, not a number that will change', () => {
  const devices = [...confirmedSet(), det('receptacle_gfci', 0.9, box(900, 900))];
  const a = answer('count the gfcis', devices);
  assert.equal(a.kind, AnswerKind.UNANSWERABLE);
  assert.equal(a.confident, false);
  assert.match(a.text, /still unreviewed/);
});

test('the assistant refuses what a plan view cannot answer', () => {
  const a = answer('how many feet of conduit run to panel A', confirmedSet());
  assert.equal(a.kind, AnswerKind.UNANSWERABLE);
  assert.match(a.reason, /not something that can be counted from a plan view/);

  const b = answer('what is the flux capacitor count', confirmedSet());
  assert.equal(b.kind, AnswerKind.UNANSWERABLE);
});

test('a genuine zero is an answer, because the device set is the whole authority', () => {
  const l = locate('exit signs', confirmedSet());
  assert.equal(l.confident, true);
  assert.match(l.text, /No confirmed exit sign/);
});

test('query matching prefers the more specific device', () => {
  assert.equal(symbolFromQuery('gfci receptacle').id, 'receptacle_gfci');
  assert.equal(symbolFromQuery('three way switch').id, 'switch_three_way');
  assert.equal(symbolFromQuery('outlets').id, 'receptacle');
  assert.equal(symbolFromQuery(''), null);
  assert.equal(symbolFromQuery(null), null);
});

test('the grounding context hands the model counts and rules, never raw detections', () => {
  const ctx = groundingContext([...confirmedSet(), det('receptacle', 0.9, box(900, 900))]);
  assert.equal(ctx.confirmedCounts.receptacle, 10, 'the unreviewed one is not in the counts');
  assert.equal(ctx.unreviewed, 1);
  assert.ok(ctx.rules.some((r) => /never/i.test(r)));
  assert.equal(JSON.stringify(ctx).includes('confidence'), false,
    'model confidence must not leak into the assistant context');
});

test('breakdown totals match the confirmed counts exactly', () => {
  const b = breakdown(confirmedSet());
  assert.equal(b.total, 18);
  assert.equal(b.rows.find((r) => r.symbolId === 'receptacle').count, 10);
  assert.equal(b.rows[0].count >= b.rows.at(-1).count, true, 'sorted by count');
});

// ─── The pipeline ────────────────────────────────────────────────────────────

test('the pipeline refuses to estimate before review is finished', () => {
  clearStages();
  registerStage({
    stage: Stage.RECOGNIZE, name: 'test', maturity: Maturity.IMPLEMENTED,
    run: () => ({ devices: [det('receptacle', 0.95, box(0, 0))] }),
  });
  registerStage({ stage: Stage.VERIFY, name: 'test', maturity: Maturity.IMPLEMENTED, run: () => ({}) });
  registerStage({ stage: Stage.ESTIMATE, name: 'test', maturity: Maturity.IMPLEMENTED, run: () => ({}) });

  let doc = createDocument({ id: 'd1' });
  doc = withStageComplete(doc, Stage.IMPORT);
  doc = withStageComplete(doc, Stage.PREPROCESS);

  const recognized = runStage(doc, Stage.RECOGNIZE);
  assert.equal(recognized.ok, true);
  const verified = runStage(recognized.doc, Stage.VERIFY);
  assert.equal(verified.ok, true);

  const blocked = runStage(verified.doc, Stage.ESTIMATE);
  assert.equal(blocked.ok, false);
  assert.match(blocked.reason, /unreviewed/);

  // Confirm the detection and it proceeds.
  const confirmedDoc = withStageComplete(verified.doc, Stage.VERIFY, {
    devices: verified.doc.devices.map(accept),
  });
  assert.equal(verifyComplete(confirmedDoc), true);
  assert.equal(runStage(confirmedDoc, Stage.ESTIMATE).ok, true);
  clearStages();
});

test('stages cannot be skipped', () => {
  clearStages();
  registerStage({ stage: Stage.RECOGNIZE, name: 't', maturity: Maturity.IMPLEMENTED, run: () => ({}) });
  const doc = createDocument({ id: 'd2' });
  const res = runStage(doc, Stage.RECOGNIZE);
  assert.equal(res.ok, false, 'RECOGNIZE needs PREPROCESS first');
  assert.match(res.reason, /PREPROCESS/);
  clearStages();
});

test('an unimplemented stage says so instead of silently doing nothing', () => {
  clearStages();
  const doc = withStageComplete(createDocument({ id: 'd3' }), Stage.IMPORT);
  const res = runStage(doc, Stage.PREPROCESS);
  assert.equal(res.ok, false);
  assert.match(res.reason, /No implementation registered/);

  const status = pipelineStatus();
  assert.equal(status.length, STAGE_ORDER.length);
  assert.ok(status.every((s) => s.maturity === Maturity.NOT_STARTED));
  clearStages();
});

test('run stops at the first stage that cannot proceed and reports where', () => {
  clearStages();
  registerStage({ stage: Stage.IMPORT, name: 't', maturity: Maturity.IMPLEMENTED, run: () => ({}) });
  const { trace, stoppedAt } = run(createDocument({ id: 'd4' }), [Stage.IMPORT, Stage.PREPROCESS]);
  assert.equal(stoppedAt, Stage.PREPROCESS);
  assert.equal(trace[0].ok, true);
  assert.equal(trace[1].ok, false);
  clearStages();
});

// ─── End to end ──────────────────────────────────────────────────────────────

test('a full takeoff: model output → review → estimate that admits what it is', () => {
  // 1. A model returns a mix of good, bad and unidentifiable.
  const { devices, warnings } = normalizeResponse([
    ...Array.from({ length: 6 }, (_, i) => ({ symbol: 'receptacle', box: box(i * 30, 0), confidence: 0.95 })),
    { symbol: 'receptacle', box: box(0, 0), confidence: 0.93 },        // duplicate of the first
    { symbol: 'gfci', box: box(0, 60), confidence: 0.88 },
    { symbol: 'weird squiggle', box: box(0, 120), confidence: 0.91 },  // unidentifiable
    { symbol: 'receptacle', confidence: 0.99 },                        // no box
    { symbol: 'receptacle', box: box(0, 180), confidence: 0.05 },      // noise
  ]);

  assert.ok(warnings.length > 0, 'the user is told what was thrown away');
  assert.equal(devices.length, 8, '6 receptacles + gfci + unknown; dupe, boxless and noise dropped');
  assert.equal(buildEstimate(devices).readyToQuote, false, 'nothing is quotable yet');

  // 2. A human works the queue: the unknown is really a floor box.
  const queue = reviewQueue(devices);
  assert.equal(queue[0].symbolId, 'unknown');
  let working = devices.map((d) => (d.id === queue[0].id ? relabel(d, 'floor_box') : d));
  working = acceptAll(working);

  // 3. Now it estimates.
  const est = buildEstimate(working);
  assert.equal(est.readyToQuote, true);
  assert.equal(est.deviceCounts.find((c) => c.symbolId === 'receptacle').count, 6);
  assert.equal(est.deviceCounts.find((c) => c.symbolId === 'receptacle_gfci').count, 1);
  assert.equal(est.deviceCounts.find((c) => c.symbolId === 'floor_box').count, 1);

  // 4. And it is honest about its own limits.
  assert.ok(est.exclusions.some((l) => l.id === 'conduit' && l.qty === null));
  assert.ok(est.orderableLines > 0);
  assert.ok(est.estimatedLines > 0, 'allowances are visible as allowances');

  // 5. The assistant answers only from this.
  const a = answer('how many receptacles', working);
  assert.equal(a.count, 6);
  assert.equal(a.evidence.length, 6);
});

// ─── Honesty about what is built ─────────────────────────────────────────────

test('the pipeline declares its own gaps instead of silently no-opping', async () => {
  const { registerDefaultStages, featureHonesty } = await import('../src/core/blueprint/index.js');
  clearStages();
  const status = registerDefaultStages();

  const preprocess = status.find((s) => s.stage === Stage.PREPROCESS);
  assert.equal(preprocess.maturity, Maturity.NOT_STARTED,
    'deskew and contrast are not built and must not claim to be');
  assert.ok(preprocess.notes, 'an unbuilt stage has to say what is missing');

  const recognize = status.find((s) => s.stage === Stage.RECOGNIZE);
  assert.equal(recognize.maturity, Maturity.ADAPTER_ONLY,
    'there is no symbol-recognition model, and the status must say so');

  assert.equal(status.find((s) => s.stage === Stage.VERIFY).maturity, Maturity.IMPLEMENTED);
  assert.equal(status.find((s) => s.stage === Stage.ESTIMATE).maturity, Maturity.IMPLEMENTED);

  const honesty = featureHonesty(createDocument({ id: 'h1' }));
  assert.ok(honesty.gaps.length >= 2, 'the gaps are surfaced to the UI, not buried in a ticket');
  assert.match(honesty.disclaimer, /not an engineer/);
  assert.match(honesty.disclaimer, /not a stamped design/);
  clearStages();
});

test('the legacy recognizer never claims to have located anything', async () => {
  const { registerDefaultStages } = await import('../src/core/blueprint/index.js');
  clearStages();
  registerDefaultStages();

  let doc = createDocument({ id: 'h2' });
  doc = runStage(doc, Stage.IMPORT, { sourceUri: 'file://plan.pdf' }).doc;
  doc = runStage(doc, Stage.PREPROCESS).doc;
  assert.match(doc.warnings.join(' '), /not deskewed/,
    'the user is told preprocessing did not happen');

  const recognized = runStage(doc, Stage.RECOGNIZE, { counts: { receptacles: 12 } });
  assert.equal(recognized.ok, true);
  assert.ok(recognized.doc.devices.every((d) => d.meta.positionless));
  assert.ok(recognized.doc.devices.every((d) => d.state === DeviceState.FLAGGED));
  assert.equal(buildEstimate(recognized.doc.devices).readyToQuote, false);
  clearStages();
});
