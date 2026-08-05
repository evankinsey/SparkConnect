// ─── CIRCUIT ENGINE TESTS ────────────────────────────────────────────────────
// Requirements: NNR-13, SIM-13, SIM-14, SIM-15, REV-01, REV-02, REV-03, REV-04, TST-01
// Run: npm test        (node --test, no dependencies — see docs/v1.1/DECISIONS.md D-05)

import test from 'node:test';
import assert from 'node:assert/strict';

import { conductor, terminalId as T, ConductorRole } from '../src/circuit/model.js';
import { truthTable, toggleAnalysis, solveState } from '../src/circuit/solver.js';
import { validate, Category } from '../src/circuit/validator.js';
import { ReviewStatus, isProductionVisible, applyHumanApproval, pendingReview } from '../src/circuit/review.js';
import {
  ALL_LESSONS, lessonById, buildCircuit, solutionCircuit, productionLessons,
} from '../src/circuit/lessons/index.js';

const lesson = (id) => {
  const l = lessonById(id);
  assert.ok(l, `lesson ${id} must exist`);
  return l;
};

// Replace one conductor in a solution to build an invalid variant.
const withoutWire = (wires, predicate) => wires.filter((w) => !predicate(w));
const swapEnd = (wires, predicate, newTerminal) =>
  wires.map((w) => (predicate(w) ? { ...w, toTerminal: newTerminal } : w));

// ─── Every lesson's known-good solution must validate ────────────────────────

test('REV-02: every lesson solution passes validation', () => {
  for (const l of ALL_LESSONS) {
    const result = validate(solutionCircuit(l), l.expectations);
    assert.equal(result.valid, true,
      `${l.id} should be valid but reported: ${result.errors.map((e) => e.message).join('; ')}`);
  }
});

test('REV-04: lesson definitions are structurally complete (snapshot of required fields)', () => {
  for (const l of ALL_LESSONS) {
    for (const field of [
      'id', 'title', 'difficulty', 'description', 'learningObjectives', 'components',
      'allowedWireTypes', 'expectations', 'solution', 'hintSteps', 'safetyNotes',
      'referenceNotes', 'featureFlag', 'lessonVersion',
    ]) {
      assert.ok(l[field] !== undefined && l[field] !== null, `${l.id} missing ${field}`);
    }
    assert.equal(l.hintSteps.length, 5, `${l.id} needs 5 graduated hints (SCR-01)`);
    assert.deepEqual(l.hintSteps.map((h) => h.level), [1, 2, 3, 4, 5], `${l.id} hint levels must be 1..5`);
    assert.ok(l.safetyNotes.length >= 3, `${l.id} needs safety language (REV-12)`);
  }
});

// ─── Truth tables (SIM-14, REV-01) ───────────────────────────────────────────

test('TST-01 single-pole: 2 states, load follows the switch exactly', () => {
  const l = lesson('single-pole-source-at-switch');
  const { rows } = truthTable(solutionCircuit(l));
  assert.equal(rows.length, 2, 'one two-position switch = 2 states');
  assert.deepEqual(rows.map((r) => r.anyLoadEnergized), [false, true]);
  assert.ok(rows.every((r) => !r.shortCircuit));
});

test('TST-01 single-pole source-at-light: same truth table, different topology (SIM-15)', () => {
  const a = truthTable(solutionCircuit(lesson('single-pole-source-at-switch')));
  const b = truthTable(solutionCircuit(lesson('single-pole-source-at-light')));
  assert.deepEqual(
    a.rows.map((r) => r.anyLoadEnergized),
    b.rows.map((r) => r.anyLoadEnergized),
    'both single-pole topologies must produce identical behaviour',
  );
});

test('TST-01 three-way: 4 states, XOR behaviour, toggles from both locations', () => {
  const l = lesson('three-way-source-at-switch');
  const circuit = solutionCircuit(l);
  const { rows } = truthTable(circuit);
  assert.equal(rows.length, 4, 'two three-way switches = 4 states');

  // The defining property: output changes whenever exactly one switch changes.
  const byVector = new Map(rows.map((r) => [r.stateVector.join(''), r.anyLoadEnergized]));
  assert.equal(byVector.get('00'), byVector.get('11'), '00 and 11 must match');
  assert.equal(byVector.get('01'), byVector.get('10'), '01 and 10 must match');
  assert.notEqual(byVector.get('00'), byVector.get('01'), 'flipping one switch must change the load');

  const analysis = toggleAnalysis(circuit);
  assert.equal(analysis.everySwitchControlsLoad, true);
  assert.equal(analysis.alwaysOn, false);
  assert.equal(analysis.alwaysOff, false);
  assert.ok(rows.every((r) => !r.shortCircuit));
});

test('TST-01 three-way source-at-light: identical truth table to source-at-switch', () => {
  const a = truthTable(solutionCircuit(lesson('three-way-source-at-switch')));
  const b = truthTable(solutionCircuit(lesson('three-way-source-at-light')));
  assert.deepEqual(a.rows.map((r) => r.anyLoadEnergized), b.rows.map((r) => r.anyLoadEnergized));
});

test('TST-01 four-way: all 8 combinations tested, load toggles from every location', () => {
  const l = lesson('four-way-three-location');
  const circuit = solutionCircuit(l);
  const { rows } = truthTable(circuit);
  assert.equal(rows.length, 8, 'three two-position switches = 8 states (LSN-04)');

  // With a correctly wired four-way the load state is a pure function of the
  // PARITY of the three switch positions. Which parity means "on" depends on
  // which traveler screw the pair happens to land on, and both are valid
  // (SIM-15) — so anchor to the observed 000 state rather than hardcoding it.
  const baseline = rows.find((r) => r.stateVector.join('') === '000').anyLoadEnergized;
  for (const r of rows) {
    const parity = r.stateVector.reduce((a, b) => a ^ b, 0);
    assert.equal(r.anyLoadEnergized, parity === 0 ? baseline : !baseline,
      `state ${r.stateVector.join('')} should follow switch parity`);
  }
  assert.ok(rows.some((r) => r.anyLoadEnergized) && rows.some((r) => !r.anyLoadEnergized),
    'both on and off states must be reachable');

  const analysis = toggleAnalysis(circuit);
  assert.equal(analysis.everySwitchControlsLoad, true, 'load must toggle from all three locations');
  assert.ok(rows.every((r) => !r.shortCircuit));
});

test('TST-01 four-way straight/cross internal behaviour is distinguishable', () => {
  const l = lesson('four-way-three-location');
  const circuit = solutionCircuit(l);
  const straight = solveState(circuit, { sw1: 0, sw4: 0, sw2: 0 });
  const crossed = solveState(circuit, { sw1: 0, sw4: 1, sw2: 0 });
  assert.notEqual(straight.anyLoadEnergized, crossed.anyLoadEnergized,
    'the four-way alone must change the outcome');
});

// ─── Invalid circuits (REV-03, TST-01) ───────────────────────────────────────

test('TST-01 common-terminal reversal is rejected', () => {
  const l = lesson('three-way-source-at-switch');
  // Land the line on a traveler screw instead of the common, and take the feed
  // to the lamp off a traveler too — the classic common/traveler reversal.
  const wires = solutionCircuit(l).conductors
    .map((w) => (w.fromTerminal === T('src', 'hot') ? { ...w, toTerminal: T('sw1', 't1') } : w))
    .map((w) => (w.fromTerminal === T('sw2', 'com') ? { ...w, fromTerminal: T('sw2', 't1') } : w));
  const result = validate(buildCircuit(l, wires), l.expectations);
  assert.equal(result.valid, false, 'reversed common must not validate');
});

test('TST-01 open traveler is rejected and reported as a traveler fault', () => {
  const l = lesson('three-way-source-at-switch');
  const wires = withoutWire(solutionCircuit(l).conductors, (w) => w.role === ConductorRole.TRAVELER_B);
  const result = validate(buildCircuit(l, wires), l.expectations);
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => e.category === Category.SWITCHING || e.category === Category.CONTINUITY),
    'an open traveler must surface as a switching or continuity fault',
  );
});

test('TST-01 traveler crossover still works — it is electrically equivalent (SIM-15)', () => {
  const l = lesson('three-way-source-at-switch');
  // Swap which traveler lands on which screw at the far switch. Real-world this
  // is fine: the pair is symmetric. The engine must NOT flag it.
  const wires = solutionCircuit(l).conductors.map((w) => {
    if (w.toTerminal === T('sw2', 't1')) return { ...w, toTerminal: T('sw2', 't2') };
    if (w.toTerminal === T('sw2', 't2')) return { ...w, toTerminal: T('sw2', 't1') };
    return w;
  });
  const result = validate(buildCircuit(l, wires), l.expectations);
  assert.equal(result.valid, true, 'a swapped traveler pair is a valid equivalent solution');
});

test('TST-01 missing neutral at the load is rejected', () => {
  const l = lesson('three-way-source-at-light');
  const wires = withoutWire(solutionCircuit(l).conductors, (w) => w.toTerminal === T('lamp', 'neu'));
  const result = validate(buildCircuit(l, wires), l.expectations);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.category === Category.CONTINUITY),
    'missing neutral must be a continuity fault');
});

test('TST-01 missing switched leg is rejected', () => {
  const l = lesson('single-pole-source-at-switch');
  const wires = withoutWire(solutionCircuit(l).conductors, (w) => w.role === ConductorRole.SWITCHED_HOT);
  const result = validate(buildCircuit(l, wires), l.expectations);
  assert.equal(result.valid, false);
});

test('TST-01 direct line-neutral short path is detected', () => {
  const l = lesson('single-pole-source-at-switch');
  const wires = [
    ...solutionCircuit(l).conductors,
    conductor(T('src', 'hot'), T('nBox', 'p3'), ConductorRole.LINE), // hot straight onto the neutral splice
  ];
  const result = validate(buildCircuit(l, wires), l.expectations);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.category === Category.SHORT), 'must report a short path');
});

test('TST-01 duplicate invalid connections are flagged', () => {
  const l = lesson('single-pole-source-at-switch');
  const wires = [
    ...solutionCircuit(l).conductors,
    conductor(T('src', 'hot'), T('sw1', 'a'), ConductorRole.LINE), // same pair twice
  ];
  const result = validate(buildCircuit(l, wires), l.expectations);
  assert.ok(result.findings.some((f) => f.rule === 'NO_DUPLICATE_CONDUCTOR'));
});

test('TST-01 a conductor landing on itself is rejected', () => {
  const l = lesson('single-pole-source-at-switch');
  const wires = [...solutionCircuit(l).conductors, conductor(T('sw1', 'a'), T('sw1', 'a'), ConductorRole.LINE)];
  const result = validate(buildCircuit(l, wires), l.expectations);
  assert.ok(result.findings.some((f) => f.rule === 'NO_SELF_LOOP'));
});

test('TST-01 invalid endpoint common (four-way at an endpoint) is rejected', () => {
  const l = lesson('four-way-three-location');
  // Split the traveler pair: send one traveler around the four-way entirely.
  const wires = swapEnd(
    solutionCircuit(l).conductors,
    (w) => w.fromTerminal === T('sw1', 't2') && w.toTerminal === T('sw4', 'in2'),
    T('sw2', 't2'),
  );
  const result = validate(buildCircuit(l, wires), l.expectations);
  assert.equal(result.valid, false, 'a split traveler pair must not validate');
});

test('TST-01 missing equipment ground is rejected', () => {
  const l = lesson('three-way-source-at-switch');
  const wires = withoutWire(solutionCircuit(l).conductors, (w) => w.toTerminal === T('lamp', 'gnd'));
  const result = validate(buildCircuit(l, wires), l.expectations);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.category === Category.GROUNDING));
});

test('SIM-10: colour never makes a circuit correct', () => {
  const l = lesson('three-way-source-at-switch');
  // Take a genuinely broken circuit (open traveler) and relabel every conductor
  // as the "right" role with the "right" colour. It must still fail.
  const broken = withoutWire(solutionCircuit(l).conductors, (w) => w.role === ConductorRole.TRAVELER_B);
  const painted = broken.map((w) => ({ ...w, role: ConductorRole.TRAVELER_A, displayColor: '#DC2626' }));
  const result = validate(buildCircuit(l, painted), l.expectations);
  assert.equal(result.valid, false, 'recolouring a broken circuit must not make it valid');
});

test('SUX-05/SUX-07: failures use approved language and never name the exact fix', () => {
  const l = lesson('three-way-source-at-switch');
  const wires = withoutWire(solutionCircuit(l).conductors, (w) => w.role === ConductorRole.TRAVELER_B);
  const result = validate(buildCircuit(l, wires), l.expectations);
  const approved = [
    'Circuit check failed', 'That path would not operate as intended', 'Possible short path detected',
    'Common terminal appears incorrect', 'One traveler path is incomplete', 'Neutral continuity is missing',
    'Equipment grounding continuity is missing', 'Too many conductors land on one terminal',
    'That conductor role does not belong on this terminal', 'That connection is already made',
    'A required termination is still open', 'The load is energized in every switch position',
    'The load never energizes in any switch position', 'The load cannot be controlled from every switch location',
  ];
  for (const f of result.findings) {
    assert.ok(approved.includes(f.message), `unapproved failure message: "${f.message}"`);
  }
  // SUX-06 — nothing may suggest the user was injured.
  const text = JSON.stringify(result.findings).toLowerCase();
  for (const banned of ['shock', 'electrocut', 'burn', 'injur', 'killed', 'died']) {
    assert.ok(!text.includes(banned), `failure text must not contain "${banned}"`);
  }
});

// ─── Review gate (REV-08, REV-10, REV-14, DOD-13, DOD-16) ────────────────────

test('REV-10: every lesson ships seeded NEEDS_ELECTRICAL_REVIEW with no reviewer', () => {
  for (const l of ALL_LESSONS) {
    assert.equal(l.technicalReviewStatus, ReviewStatus.NEEDS_ELECTRICAL_REVIEW, `${l.id}`);
    assert.equal(l.productionApproved, false, `${l.id}`);
    assert.equal(l.technicalReviewer, null, `${l.id} must not name a reviewer`);
    assert.equal(l.reviewDate, null, `${l.id} must not carry an approval date`);
  }
});

test('REV-08/REV-14: no lesson is production-visible, even though all tests pass', () => {
  assert.deepEqual(productionLessons(), [],
    'passing tests must not make a lesson production-visible');
  assert.equal(pendingReview(ALL_LESSONS).length, ALL_LESSONS.length);
});

test('REV-08: the gate needs BOTH approval flags', () => {
  const base = ALL_LESSONS[0];
  assert.equal(isProductionVisible({ ...base, productionApproved: true }), false);
  assert.equal(isProductionVisible({ ...base, technicalReviewStatus: ReviewStatus.APPROVED }), false);
  assert.equal(isProductionVisible({
    ...base, productionApproved: true, technicalReviewStatus: ReviewStatus.APPROVED,
  }), true);
});

test('DOD-16: approval requires a named human reviewer and a date', () => {
  const base = ALL_LESSONS[0];
  assert.throws(() => applyHumanApproval(base, { reviewDate: '2026-08-05' }), /qualified reviewer/);
  assert.throws(() => applyHumanApproval(base, { reviewer: '   ', reviewDate: '2026-08-05' }), /qualified reviewer/);
  assert.throws(() => applyHumanApproval(base, { reviewer: 'A. Reviewer' }), /reviewDate/);

  const approved = applyHumanApproval(base, { reviewer: 'A. Reviewer', reviewDate: '2026-08-05', notes: 'ok' });
  assert.equal(isProductionVisible(approved), true);
  // The seeded lesson itself must be untouched.
  assert.equal(isProductionVisible(base), false);
});

test('REV-13: no lesson claims an unverified NEC citation as verified', () => {
  for (const l of ALL_LESSONS) {
    for (const r of l.referenceNotes) {
      if (r.verified === false) {
        assert.ok(r.ref === null || typeof r.ref === 'string',
          `${l.id}: unverified references must be labelled, not fabricated`);
      } else {
        assert.ok(typeof r.ref === 'string' && r.ref.length > 0,
          `${l.id}: a verified reference must carry an actual citation`);
      }
    }
  }
});
