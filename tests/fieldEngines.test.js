// ─── PANEL ENGINE + BENDING TESTS ────────────────────────────────────────────
// Two claims worth proving:
//
//   · the panel engine catches a shared neutral on one phase — the fault that
//     overloads a neutral without tripping either breaker
//   · the bending geometry matches numbers a person can check on paper, and the
//     rolling offset reports the ROLL ANGLE rather than only the hypotenuse

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  emptyPanel, addCircuit, PanelType, Phase, phaseForPosition,
} from '../src/core/field/panelSchedule.js';
import {
  analyzePanel, panelReport, capacity, suggestPositions, setNeutralGroup, neutralGroups,
  checkNeutralGroup, circuitAmps, panelVoltage, Severity, CONTINUOUS_MULTIPLIER,
  IMBALANCE_WARNING, DEMAND_FACTOR_NOTE,
} from '../src/core/field/panelEngine.js';
import {
  offsetMultiplier, shrinkPerInch, bendGeometry, offset, rollingOffset,
  threePointSaddle, fourPointSaddle, toleranceCheck, checkAgainstTarget,
  cutLength, materialTakeoff, BEND_LEVELS, levelById, toDeg, toRad, isBendableAngle,
  STOCK_LENGTH_IN, USABLE_OFFCUT_IN,
} from '../src/core/field/bending.js';

const near = (a, b, tol = 1e-6, msg) => assert.ok(Math.abs(a - b) <= tol, msg ?? `${a} !≈ ${b}`);

// ─── Panel: the shared-neutral check ─────────────────────────────────────────

const panelWith = (specs, base = {}) => {
  let p = emptyPanel({ size: 42, panelType: PanelType.SINGLE_SPLIT, mainAmps: 200, ...base });
  for (const s of specs) {
    const r = addCircuit(p, s);
    assert.ok(r.ok, `fixture failed: ${r.reason}`);
    p = r.panel;
  }
  return p;
};

test('positions 1 and 3 are the same phase — which is what makes this checkable', () => {
  assert.equal(phaseForPosition(1), Phase.A);
  assert.equal(phaseForPosition(2), Phase.A);
  assert.equal(phaseForPosition(3), Phase.B);
  assert.equal(phaseForPosition(5), Phase.A);
  // So 1 and 5 collide, 1 and 3 do not.
});

test('a shared neutral on one phase is CRITICAL', () => {
  // Positions 1 and 5 are both phase A on a split-phase panel.
  let p = panelWith([
    { start: 1, poles: 1, amps: 20, description: 'Kitchen recept', loadVa: 1920 },
    { start: 5, poles: 1, amps: 20, description: 'Kitchen recept', loadVa: 1920 },
  ]);
  p = setNeutralGroup(p, 'c1', 'N1');
  p = setNeutralGroup(p, 'c5', 'N1');

  const findings = analyzePanel(p);
  const critical = findings.filter((f) => f.severity === Severity.CRITICAL);
  const sameLeg = critical.find((f) => f.code === 'MWBC_SAME_PHASE');
  assert.ok(sameLeg, 'the engine must catch two shared-neutral circuits on one phase');
  assert.match(sameLeg.title, /phase A/);
  assert.match(sameLeg.detail, /SUM/);
  assert.deepEqual([...sameLeg.circuitIds].sort(), ['c1', 'c5']);
  assert.equal(findings[0].severity, Severity.CRITICAL, 'worst finding must sort first');
});

test('the same two circuits on opposite phases are fine', () => {
  let p = panelWith([
    { start: 1, poles: 1, amps: 20, loadVa: 1920 },   // A
    { start: 3, poles: 1, amps: 20, loadVa: 1920 },   // B
  ]);
  p = setNeutralGroup(p, 'c1', 'N1');
  p = setNeutralGroup(p, 'c3', 'N1');
  const codes = analyzePanel(p).map((f) => f.code);
  assert.ok(!codes.includes('MWBC_SAME_PHASE'), 'opposite legs are the correct arrangement');
});

test('a shared neutral needs a simultaneous disconnect', () => {
  let p = panelWith([
    { start: 1, poles: 1, amps: 20, loadVa: 1000 },
    { start: 3, poles: 1, amps: 20, loadVa: 1000 },
  ]);
  p = setNeutralGroup(p, 'c1', 'N1');
  p = setNeutralGroup(p, 'c3', 'N1');
  const warn = analyzePanel(p).find((f) => f.code === 'MWBC_NO_SIMULTANEOUS_DISCONNECT');
  assert.ok(warn, 'two single-pole breakers on one neutral need a handle tie');
  assert.equal(warn.severity, Severity.WARNING);

  // Handle-tied: satisfied.
  p = { ...p, circuits: p.circuits.map((c) => ({ ...c, handleTie: true })) };
  assert.ok(!analyzePanel(p).some((f) => f.code === 'MWBC_NO_SIMULTANEOUS_DISCONNECT'));
});

test('a two-pole breaker is its own simultaneous disconnect', () => {
  let p = panelWith([{ start: 1, poles: 2, amps: 20, loadVa: 2000 }]);
  p = setNeutralGroup(p, 'c1', 'N1');
  const codes = analyzePanel(p).map((f) => f.code);
  assert.ok(!codes.includes('MWBC_NO_SIMULTANEOUS_DISCONNECT'));
});

test('three circuits cannot share a neutral on a split-phase panel', () => {
  let p = panelWith([
    { start: 1, poles: 1, amps: 20, loadVa: 500 },
    { start: 3, poles: 1, amps: 20, loadVa: 500 },
    { start: 5, poles: 1, amps: 20, loadVa: 500 },
  ]);
  for (const id of ['c1', 'c3', 'c5']) p = setNeutralGroup(p, id, 'N1');
  const f = analyzePanel(p).find((x) => x.code === 'MWBC_TOO_MANY');
  assert.ok(f, 'two phases cannot carry three ungrounded conductors on one neutral');
  assert.equal(f.severity, Severity.CRITICAL);

  // On a three-phase panel it is legitimate.
  let wye = panelWith([
    { start: 1, poles: 1, amps: 20, loadVa: 500 },
    { start: 3, poles: 1, amps: 20, loadVa: 500 },
    { start: 5, poles: 1, amps: 20, loadVa: 500 },
  ], { panelType: PanelType.THREE_WYE });
  for (const id of ['c1', 'c3', 'c5']) wye = setNeutralGroup(wye, id, 'N1');
  assert.ok(!analyzePanel(wye).some((x) => x.code === 'MWBC_TOO_MANY'));
  assert.ok(!analyzePanel(wye).some((x) => x.code === 'MWBC_SAME_PHASE'), 'A, B and C are all different');
});

test('a lone circuit in a neutral group is flagged as incomplete, not as a fault', () => {
  let p = panelWith([{ start: 1, poles: 1, amps: 20, loadVa: 500 }]);
  p = setNeutralGroup(p, 'c1', 'N1');
  const f = analyzePanel(p).find((x) => x.code === 'MWBC_SINGLE_MEMBER');
  assert.equal(f.severity, Severity.ADVISORY);
  assert.equal(neutralGroups(p).size, 1);

  // Clearing the group removes the finding.
  const cleared = setNeutralGroup(p, 'c1', null);
  assert.equal(neutralGroups(cleared).size, 0);
});

test('checkNeutralGroup is callable on its own', () => {
  const members = [
    { id: 'a', phases: [Phase.A], poles: 1 },
    { id: 'b', phases: [Phase.A], poles: 1 },
  ];
  const out = checkNeutralGroup({ panelType: PanelType.SINGLE_SPLIT }, 'N1', members);
  assert.ok(out.some((f) => f.code === 'MWBC_SAME_PHASE'));
});

// ─── Panel: loads, balance, capacity ─────────────────────────────────────────

test('a three-pole load uses the √3 form, not line-to-line alone', () => {
  const p = panelWith([{ start: 1, poles: 3, amps: 30, loadVa: 10000 }], { panelType: PanelType.THREE_WYE });
  const c = p.circuits[0];
  const amps = circuitAmps(p, c);
  near(amps, 10000 / (208 * Math.sqrt(3)), 1e-9);
  assert.ok(amps < 10000 / 208, 'dividing by V_LL alone would overstate the current by 73%');

  const single = panelWith([{ start: 1, poles: 1, amps: 20, loadVa: 1200 }]);
  near(circuitAmps(single, single.circuits[0]), 10, 1e-9);
  assert.equal(circuitAmps(single, { loadVa: 0 }), null, 'no load entered is not zero amps');
});

test('panel voltage defaults by type and is overridable', () => {
  assert.deepEqual(panelVoltage({ panelType: PanelType.SINGLE_SPLIT }), { lineToNeutral: 120, lineToLine: 240 });
  assert.deepEqual(panelVoltage({ panelType: PanelType.THREE_WYE }), { lineToNeutral: 120, lineToLine: 208 });
  assert.deepEqual(panelVoltage({ panelType: PanelType.THREE_WYE, voltage: { lineToNeutral: 277, lineToLine: 480 } }),
    { lineToNeutral: 277, lineToLine: 480 });
});

test('a continuous load is checked at 125%', () => {
  // 16 A continuous on a 20 A breaker: 16 × 1.25 = 20, exactly at the limit.
  const ok = panelWith([{ start: 1, poles: 1, amps: 20, loadVa: 16 * 120 }]);
  ok.circuits[0].continuous = true;
  assert.ok(!analyzePanel(ok).some((f) => f.code === 'CONTINUOUS_UNDERSIZED'), '125% of 16 A is exactly 20 A');

  // 17 A continuous needs 21.25 A.
  const under = panelWith([{ start: 1, poles: 1, amps: 20, loadVa: 17 * 120 }]);
  under.circuits[0].continuous = true;
  const f = analyzePanel(under).find((x) => x.code === 'CONTINUOUS_UNDERSIZED');
  assert.ok(f);
  assert.match(f.detail, /1\.25/);
  assert.equal(CONTINUOUS_MULTIPLIER, 1.25);
});

test('capacity never treats an unentered load as zero', () => {
  const p = panelWith([
    { start: 1, poles: 1, amps: 20, loadVa: 1200 },
    { start: 3, poles: 1, amps: 20 },                 // no load entered
  ]);
  const cap = capacity(p);
  assert.equal(cap.connectedVa, 1200);
  assert.equal(cap.circuitsWithoutLoad, 1);
  assert.equal(cap.complete, false, 'a total missing a circuit must say so');

  const flagged = analyzePanel(p).find((f) => f.code === 'LOADS_UNKNOWN');
  assert.ok(flagged, 'the report must say the numbers are partial');
});

test('demand factors are applied only when supplied, never invented', () => {
  const p = panelWith([{ start: 1, poles: 1, amps: 20, loadVa: 10000 }]);
  const bare = capacity(p);
  assert.equal(bare.demandVa, null, 'no factors supplied means no demand figure');
  assert.equal(bare.demandFactorsSupplied, false);
  assert.match(bare.demandNote, /does not ship Article 220/);
  assert.equal(DEMAND_FACTOR_NOTE.includes('checked against the printed source'), true);

  const withFactor = capacity(p, { demandFactors: { c1: 0.35 } });
  assert.equal(withFactor.demandVa, 3500);
  assert.equal(withFactor.factorsApplied, 1);

  // A circuit with no factor is carried at 100%, not dropped.
  const partial = capacity(
    panelWith([{ start: 1, poles: 1, amps: 20, loadVa: 1000 }, { start: 3, poles: 1, amps: 20, loadVa: 1000 }]),
    { demandFactors: { c1: 0.5 } },
  );
  assert.equal(partial.demandVa, 1500);
});

test('capacity reports loading against the main and with growth', () => {
  // 24 000 VA on a 240 V single-phase service = 100 A.
  const p = panelWith([
    { start: 1, poles: 2, amps: 50, loadVa: 12000 },
    { start: 5, poles: 2, amps: 50, loadVa: 12000 },
  ]);
  const cap = capacity(p, { futureGrowthPercent: 25 });
  near(cap.amps, 100, 0.05);
  assert.equal(cap.percentOfMain, 50);
  near(cap.withGrowthAmps, 125, 0.05);
  assert.equal(cap.percentOfMainWithGrowth, 63);
  near(cap.headroomAmps, 100, 0.05);
});

test('imbalance and over-main are reported, not judged', () => {
  const p = panelWith([
    { start: 1, poles: 1, amps: 20, loadVa: 5000 },   // A
    { start: 3, poles: 1, amps: 20, loadVa: 500 },    // B
  ]);
  const f = analyzePanel(p).find((x) => x.code === 'PHASE_IMBALANCE');
  assert.ok(f);
  assert.equal(f.severity, Severity.WARNING, `90% imbalance exceeds the ${IMBALANCE_WARNING}% threshold`);
  assert.match(f.detail, /A 5000 VA/);
});

test('suggestPositions puts the next breaker on the lighter phase', () => {
  const p = panelWith([{ start: 1, poles: 1, amps: 20, loadVa: 5000 }]);   // loads phase A
  const options = suggestPositions(p, 1);
  assert.ok(options.length > 0);
  assert.equal(options[0].phases[0], Phase.B, 'the first suggestion should balance, not fill in order');
  assert.ok(!options.some((o) => o.positions.includes(1)), 'an occupied position is never suggested');

  const twoPole = suggestPositions(p, 2);
  assert.equal(twoPole[0].positions.length, 2);
  assert.equal(new Set(twoPole[0].phases).size, 2, 'a two-pole spans two phases');
});

test('the report is renderable and says what it is not', () => {
  const p = panelWith([{ start: 1, poles: 1, amps: 20, loadVa: 1200 }]);
  const r = panelReport(p, { futureGrowthPercent: 20 });
  assert.ok(Array.isArray(r.findings));
  assert.equal(typeof r.counts.CRITICAL, 'number');
  assert.ok(r.capacity && r.balance && Number.isFinite(r.spares));
  assert.match(r.disclaimer, /does not verify the installation/i);

  const empty = panelReport(emptyPanel());
  assert.equal(empty.clean, true);
  assert.equal(empty.worst, null);
});

test('a corrupt panel is reported, not crashed on', () => {
  assert.deepEqual(analyzePanel(null), []);
  assert.deepEqual(analyzePanel({ circuits: 'nope' }), []);
  const doubled = { size: 12, panelType: PanelType.SINGLE_SPLIT, mainAmps: 100, circuits: [
    { id: 'a', positions: [1], poles: 1, amps: 20, phases: [Phase.A], loadVa: 100 },
    { id: 'b', positions: [1], poles: 1, amps: 20, phases: [Phase.A], loadVa: 100 },
  ] };
  assert.ok(analyzePanel(doubled).some((f) => f.code === 'POSITION_CONFLICT'));

  const bridged = { size: 12, panelType: PanelType.SINGLE_SPLIT, mainAmps: 100, circuits: [
    { id: 'x', positions: [1, 3], poles: 2, amps: 30, phases: [Phase.A, Phase.A], loadVa: 1000 },
  ] };
  assert.ok(analyzePanel(bridged).some((f) => f.code === 'MULTIPOLE_SAME_PHASE'));
});

// ─── Bending: the multipliers are trigonometry ───────────────────────────────

test('offset multipliers are 1/sin and match the numbers on the bender', () => {
  near(offsetMultiplier(30), 2, 1e-12, '30° is exactly 2');
  near(offsetMultiplier(45), Math.SQRT2, 1e-12);
  near(offsetMultiplier(60), 2 / Math.sqrt(3), 1e-12);
  near(offsetMultiplier(22.5), 2.6131, 1e-4);
  near(offsetMultiplier(10), 5.7588, 1e-4);
  assert.equal(offsetMultiplier(0), null);
});

test('180° is refused, because sin(180°) is 1.2e-16 and not zero', () => {
  // The bare `sin <= 0` guard let this through and returned 8.2e15.
  assert.equal(offsetMultiplier(180), null);
  assert.equal(shrinkPerInch(180), null);
  assert.equal(bendGeometry(180, 6), null);
  assert.equal(toleranceCheck({ angleDeg: 180 }), null);
  assert.equal(offset({ depth: 6, angleDeg: 180 }), null);
  assert.equal(isBendableAngle(180), false);
  assert.equal(isBendableAngle(0), false);
  assert.equal(isBendableAngle(NaN), false);
  assert.equal(isBendableAngle(30), true);
});

test('shrink per inch matches the published rules of thumb', () => {
  // 30°: 1/sin − 1/tan = 2 − 1.7320 = 0.2679 ≈ 1/4" per inch of offset.
  near(shrinkPerInch(30), 2 - 1 / Math.tan(toRad(30)), 1e-12);
  near(shrinkPerInch(30), 0.2679, 1e-4);
  near(shrinkPerInch(45), 0.4142, 1e-4);
  near(shrinkPerInch(60), 0.5774, 1e-4);
  near(shrinkPerInch(22.5), 0.1989, 1e-4);
});

test('a 6" offset at 30° puts the marks 12" apart and shrinks the run 1.6"', () => {
  const o = offset({ depth: 6, angleDeg: 30 });
  near(o.distanceBetweenMarks, 12, 1e-12);
  near(o.shrink, 6 * 0.26794919, 1e-6);
  assert.equal(o.marks.length, 2);
  assert.equal(o.marks[0].at, 0);
  near(o.marks[1].at, 12, 1e-12);
  assert.equal(o.marks[0].direction, 'UP');
  assert.equal(o.marks[1].direction, 'DOWN');
  assert.equal(offset({ depth: 0 }), null);
  assert.equal(offset({ depth: -3 }), null);
});

// ─── Bending: the rolling offset ─────────────────────────────────────────────

test('a rolling offset reports the roll ANGLE, not just the hypotenuse', () => {
  const r = rollingOffset({ rise: 6, roll: 8, angleDeg: 30 });
  near(r.trueOffset, 10, 1e-12, '6-8-10 triangle');
  near(r.rollAngleDeg, toDeg(Math.atan2(8, 6)), 1e-12);
  near(r.rollAngleDeg, 53.13, 0.01);
  // The offset is made to the TRUE offset, in the rolled plane.
  near(r.distanceBetweenMarks, 20, 1e-12, '10" true offset × 2 at 30°');
  assert.equal(r.depthInRolledPlane, r.trueOffset);
  assert.equal(r.angleDeg, 30, 'the bend angle is unchanged by the roll');
  assert.match(r.rollInstruction, /Rotate the pipe/);
  assert.match(r.rollInstruction, /rotation about the pipe, not a different bend/);
});

test('the degenerate rolling offsets are named rather than silently wrong', () => {
  const vertical = rollingOffset({ rise: 6, roll: 0 });
  near(vertical.rollAngleDeg, 0, 1e-12);
  assert.match(vertical.rollInstruction, /No roll/);

  const sideways = rollingOffset({ rise: 0, roll: 6 });
  near(sideways.rollAngleDeg, 90, 1e-12);
  assert.match(sideways.rollInstruction, /full 90/);

  assert.equal(rollingOffset({ rise: 0, roll: 0 }), null, 'no displacement is not a bend');
  assert.equal(rollingOffset({ rise: -1, roll: 4 }), null);
  assert.equal(rollingOffset({ rise: 6 }), null, 'roll is required');
});

// ─── Bending: gain ───────────────────────────────────────────────────────────

test('gain is positive and grows with the angle', () => {
  const g30 = bendGeometry(30, 6);
  const g90 = bendGeometry(90, 6);
  assert.ok(g30.gain > 0, 'the arc is always shorter than the corner it replaces');
  assert.ok(g90.gain > g30.gain);
  // 90° at R=6: arc = 6·π/2 = 9.4248, tangent = 6, gain = 12 − 9.4248 = 2.575.
  near(g90.arcLength, 6 * Math.PI / 2, 1e-9);
  near(g90.tangentLength, 6, 1e-9);
  near(g90.gain, 12 - 6 * Math.PI / 2, 1e-9);
  assert.equal(bendGeometry(0, 6), null);
  assert.equal(bendGeometry(90, 0), null);
});

test('cut length subtracts gain, and says so when it cannot', () => {
  const exact = cutLength({ segments: [24, 24], bends: [{ angleDeg: 90 }], centerlineRadius: 6 });
  near(exact.straightTotal, 48, 1e-9);
  near(exact.developedLength, 48 - (12 - 6 * Math.PI / 2), 1e-9);
  assert.equal(exact.exact, true);
  assert.equal(exact.note, null);

  const unknown = cutLength({ segments: [24, 24], bends: [{ angleDeg: 90 }] });
  assert.equal(unknown.gainTotal, 0);
  assert.equal(unknown.developedLength, 48, 'without a radius the legs are all we have');
  assert.equal(unknown.exact, false);
  assert.match(unknown.note, /Cut long and trim/);
});

// ─── Bending: tolerance ──────────────────────────────────────────────────────

test('marking error costs less at shallow angles', () => {
  const shallow = toleranceCheck({ angleDeg: 10, markError: 0.125 });
  const steep = toleranceCheck({ angleDeg: 60, markError: 0.125 });
  assert.ok(shallow.depthErrorFromMark < steep.depthErrorFromMark,
    'a mark off by 1/8" moves the depth by e·sin θ, so shallow angles forgive it');
  near(shallow.depthErrorFromMark, 0.125 * Math.sin(toRad(10)), 1e-12);
  assert.match(shallow.note, /forgives marking error/);
  assert.match(steep.note, /almost one-for-one/);
});

test('angle error costs more at shallow angles — the opposite trade', () => {
  const shallow = toleranceCheck({ angleDeg: 10, angleErrorDeg: 1, depth: 6 });
  const steep = toleranceCheck({ angleDeg: 60, angleErrorDeg: 1, depth: 6 });
  assert.ok(shallow.depthErrorFromAngle > steep.depthErrorFromAngle,
    'one degree of overbend travels further when the marks are far apart');
  assert.equal(toleranceCheck({ angleDeg: 30 }).depthErrorFromAngle, null, 'needs a depth to compute');
  assert.equal(toleranceCheck({ angleDeg: 0 }), null);
});

test('measuring the finished bend says which way to correct it', () => {
  const over = checkAgainstTarget({ target: 6, measured: 6.5 });
  assert.equal(over.within, false);
  assert.match(over.verdict, /Overbent by 0.5/);
  assert.match(over.correction, /Open the bend/);

  const under = checkAgainstTarget({ target: 6, measured: 5.5 });
  assert.match(under.verdict, /Underbent/);
  assert.match(under.correction, /more bend/);

  const good = checkAgainstTarget({ target: 6, measured: 6.0625 });
  assert.equal(good.within, true);
  assert.equal(good.correction, null);
  assert.equal(checkAgainstTarget({ target: 6, measured: NaN }), null);
});

// ─── Bending: saddles ────────────────────────────────────────────────────────

test('a three-point saddle bends the centre at twice the sides', () => {
  const s = threePointSaddle({ depth: 2, centerAngleDeg: 45 });
  assert.equal(s.sideAngleDeg, 22.5);
  near(s.multiplier, 2.6131, 1e-4);
  near(s.sideDistance, 2 * 2.6131, 1e-3);
  assert.equal(s.marks.length, 3);
  assert.equal(s.marks[1].angleDeg, 45, 'the centre bend is the full angle');
  assert.equal(s.marks[0].angleDeg, 22.5);
  near(s.marks[2].at - s.marks[1].at, s.marks[1].at - s.marks[0].at, 1e-9, 'the side marks are symmetric');
  assert.equal(threePointSaddle({ depth: 0 }), null);
});

test('a four-point saddle is two offsets with a flat between them', () => {
  const s = fourPointSaddle({ depth: 4, obstructionWidth: 12, angleDeg: 22.5 });
  assert.equal(s.marks.length, 4);
  const leg1 = s.marks[1].at - s.marks[0].at;
  const leg2 = s.marks[3].at - s.marks[2].at;
  near(leg1, leg2, 1e-9, 'both offsets are the same');
  near(s.marks[2].at - s.marks[1].at, 12, 1e-9, 'the flat spans the obstruction');
  assert.equal(fourPointSaddle({ depth: 4, obstructionWidth: -1 }), null);
});

// ─── Bending: material ───────────────────────────────────────────────────────

test('cuts are packed into sticks, and offcuts are graded', () => {
  const t = materialTakeoff({ cuts: [70, 50, 45, 30] });
  assert.equal(t.stockLength, STOCK_LENGTH_IN);
  // 70+50 = 120 exactly in one stick; 45+30 = 75 in a second.
  assert.equal(t.sticksNeeded, 2);
  assert.equal(t.totalCutLength, 195);
  assert.equal(t.totalStockLength, 240);
  near(t.wastePercent, 18.8, 0.1);
  assert.equal(t.usableOffcuts.length, 1, 'the 45" drop is stock, not scrap');
  assert.equal(t.usableOffcuts[0], 45);
  assert.equal(t.scrapLength, 0);
});

test('a cut longer than a stick is called out rather than packed', () => {
  const t = materialTakeoff({ cuts: [130, 40] });
  assert.deepEqual(t.impossibleCuts, [130]);
  assert.equal(t.sticksNeeded, 1, 'only the 40" cut is packable');
  assert.match(t.note, /coupling/);
});

test('an empty cut list is not a division by zero', () => {
  const t = materialTakeoff({ cuts: [] });
  assert.equal(t.sticksNeeded, 0);
  assert.equal(t.wastePercent, 0);
  assert.deepEqual(t.usableOffcuts, []);
  assert.equal(USABLE_OFFCUT_IN, 24);
});

// ─── Bending: training ───────────────────────────────────────────────────────

test('the levels build on each other and each names what it teaches', () => {
  assert.ok(BEND_LEVELS.length >= 9);
  BEND_LEVELS.forEach((l, i) => {
    assert.equal(l.level, i + 1, 'levels must be in order');
    assert.ok(l.id && l.title && l.teaches && l.target, `level ${l.level} incomplete`);
  });
  assert.equal(new Set(BEND_LEVELS.map((l) => l.id)).size, BEND_LEVELS.length);
  // The rolling offset comes after plain offsets — it is an offset in a tilted plane.
  assert.ok(levelById('rolling').level > levelById('offset30').level);
  assert.equal(levelById('nope'), null);
});
