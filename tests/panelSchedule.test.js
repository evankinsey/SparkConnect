// ─── PANEL SCHEDULE ──────────────────────────────────────────────────────────
// The load-bearing fact: a two-pole breaker must land on two DIFFERENT phases.
// A schedule that gets this wrong balances on paper and trips in the field.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PANEL_SIZES, Phase, PanelType, phaseForPosition, positionsFor,
  emptyPanel, addCircuit, removeCircuit, phaseLoads, imbalancePercent,
  scheduleRows, spareCount, scheduleText,
} from '../src/core/field/panelSchedule.js';

test('positions 1 and 2 share a phase, 1 and 3 do not', () => {
  // 1 and 2 are the same horizontal row off the same bus stab; 3 drops to the
  // next stab. This is the whole geometry of a panelboard.
  assert.equal(phaseForPosition(1), Phase.A);
  assert.equal(phaseForPosition(2), Phase.A);
  assert.equal(phaseForPosition(3), Phase.B);
  assert.equal(phaseForPosition(4), Phase.B);
  assert.equal(phaseForPosition(5), Phase.A);
});

test('three-phase panels rotate A B C down the stabs', () => {
  const t = PanelType.THREE_WYE;
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 7].map((n) => phaseForPosition(n, t)),
    [Phase.A, Phase.A, Phase.B, Phase.B, Phase.C, Phase.C, Phase.A],
  );
});

test('a multi-pole breaker skips a position so it lands on different phases', () => {
  assert.deepEqual(positionsFor(1, 1), [1]);
  assert.deepEqual(positionsFor(1, 2), [1, 3]);
  assert.deepEqual(positionsFor(2, 3), [2, 4, 6]);
  assert.deepEqual(positionsFor(0, 2), [], 'position zero is not a thing');
});

test('a two-pole breaker actually gets two different phases', () => {
  const r = addCircuit(emptyPanel({ size: 12 }), { start: 1, poles: 2, amps: 30, description: 'Dryer', loadVa: 5000 });
  assert.ok(r.ok, r.reason);
  assert.deepEqual(r.panel.circuits[0].phases, [Phase.A, Phase.B]);
  assert.deepEqual(r.panel.circuits[0].positions, [1, 3]);
});

test('a collision is refused, never silently overwritten', () => {
  let p = addCircuit(emptyPanel({ size: 12 }), { start: 1, poles: 2, amps: 30 }).panel;
  const clash = addCircuit(p, { start: 3, poles: 1, amps: 20 });
  assert.equal(clash.ok, false);
  assert.match(clash.reason, /already used/);
  assert.equal(p.circuits.length, 1, 'the panel is unchanged after a refusal');
});

test('a breaker cannot run past the end of the panel', () => {
  const r = addCircuit(emptyPanel({ size: 12 }), { start: 11, poles: 2, amps: 30 });
  assert.equal(r.ok, false);
  assert.match(r.reason, /past the end/);
});

test('a three-pole breaker is refused on a split-phase panel', () => {
  const r = addCircuit(emptyPanel({ size: 42 }), { start: 1, poles: 3, amps: 60 });
  assert.equal(r.ok, false);
  assert.match(r.reason, /three-phase panel/);
  assert.ok(addCircuit(emptyPanel({ size: 42, panelType: PanelType.THREE_WYE }), { start: 1, poles: 3, amps: 60 }).ok);
});

test('a missing or nonsense breaker size is refused', () => {
  for (const amps of [0, -20, NaN, Infinity, 'twenty', null, undefined]) {
    assert.equal(addCircuit(emptyPanel(), { start: 1, amps }).ok, false, `amps ${amps}`);
  }
});

test('a multi-pole load splits across the phases it lands on', () => {
  let p = emptyPanel({ size: 12 });
  p = addCircuit(p, { start: 1, poles: 2, amps: 30, loadVa: 5000 }).panel;
  const loads = phaseLoads(p);
  assert.equal(loads.A, 2500);
  assert.equal(loads.B, 2500);
  assert.equal(imbalancePercent(p), 0, 'a 240V load is balanced by definition');
});

test('imbalance is reported as a number, not a pass or fail', () => {
  let p = emptyPanel({ size: 12 });
  p = addCircuit(p, { start: 1, poles: 1, amps: 20, loadVa: 1000 }).panel;   // A
  p = addCircuit(p, { start: 3, poles: 1, amps: 20, loadVa: 500 }).panel;    // B
  assert.equal(phaseLoads(p).A, 1000);
  assert.equal(phaseLoads(p).B, 500);
  assert.equal(imbalancePercent(p), 50);
  assert.equal(imbalancePercent(emptyPanel()), 0, 'an empty panel is not infinitely unbalanced');
});

test('schedule rows cover every position and mark continuations', () => {
  const p = addCircuit(emptyPanel({ size: 12 }), { start: 1, poles: 2, amps: 30, description: 'Dryer' }).panel;
  const rows = scheduleRows(p);
  assert.equal(rows.length, 12);
  assert.equal(rows[0].isContinuation, false, 'position 1 prints the description');
  assert.equal(rows[2].isContinuation, true, 'position 3 is the second pole');
  assert.equal(rows[1].circuit, null, 'position 2 is still spare');
  assert.equal(rows[0].side, 'L');
  assert.equal(rows[1].side, 'R');
});

test('spares count positions, not breakers', () => {
  const p = addCircuit(emptyPanel({ size: 12 }), { start: 1, poles: 2, amps: 30 }).panel;
  assert.equal(spareCount(p), 10, 'a two-pole breaker consumes two spaces');
});

test('an odd panel size falls back rather than rendering a broken panel', () => {
  assert.ok(PANEL_SIZES.includes(emptyPanel({ size: 37 }).size));
  assert.equal(emptyPanel({ panelType: 'MADE_UP' }).panelType, PanelType.SINGLE_SPLIT);
  assert.equal(emptyPanel({ mainAmps: -5 }).mainAmps, 200);
});

test('the text schedule carries the loads and a verify-before-submitting line', () => {
  let p = emptyPanel({ size: 12, name: 'Panel A' });
  p = addCircuit(p, { start: 1, poles: 2, amps: 30, description: 'Dryer', loadVa: 5000 }).panel;
  const txt = scheduleText(p);
  assert.match(txt, /Panel A/);
  assert.match(txt, /Dryer/);
  assert.match(txt, /Spare/);
  assert.match(txt, /Phase load/);
  assert.match(txt, /Verify against the installed panel/);
});

test('removing a circuit frees its positions', () => {
  let p = addCircuit(emptyPanel({ size: 12 }), { start: 1, poles: 2, amps: 30 }).panel;
  p = removeCircuit(p, p.circuits[0].id);
  assert.equal(spareCount(p), 12);
  assert.ok(addCircuit(p, { start: 3, poles: 1, amps: 20 }).ok, 'position 3 is usable again');
});

test('garbage panels never throw', () => {
  for (const junk of [null, undefined, {}, { circuits: null }]) {
    assert.doesNotThrow(() => { phaseLoads(junk); imbalancePercent(junk); spareCount(junk); scheduleText(junk); });
  }
});
