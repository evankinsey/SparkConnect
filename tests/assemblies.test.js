// ─── ASSEMBLIES ──────────────────────────────────────────────────────────────
// Turning a device count into a bill of material plus labor is what makes the
// takeoff estimating software. The contract: nothing invented, wire always
// labelled as an allowance, and a contractor's own labor units always win.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TAKEOFF_ITEMS, validateTakeoff, Confidence } from '../src/core/field/takeoff.js';
import {
  ASSEMBLIES, assemblyFor, expandTakeoff, expansionSummary,
  LABOR_DISCLAIMER, WIRE_DISCLAIMER,
} from '../src/core/field/assemblies.js';

const takeoffOf = (counts, over = {}) =>
  validateTakeoff({ counts, confidence: Confidence.HIGH, ...over }).takeoff;

test('every takeoff category has an assembly, or the expansion silently loses it', () => {
  for (const item of TAKEOFF_ITEMS) {
    const asm = assemblyFor(item.id);
    assert.ok(asm, `${item.id} counted but has no assembly`);
    assert.ok(asm.label, `${item.id} label`);
    assert.ok(asm.laborHours > 0, `${item.id} labor hours`);
    assert.ok(Array.isArray(asm.materials) && asm.materials.length >= 1, `${item.id} materials`);
    for (const m of asm.materials) {
      assert.ok(m.item && m.unit && m.qty > 0, `${item.id} material line incomplete`);
    }
  }
});

test('one receptacle expands to its full bill of material', () => {
  const exp = expandTakeoff(takeoffOf({ receptacles: 1 }));
  const items = exp.materials.map((m) => m.item);
  for (const expected of ['Duplex receptacle', 'Device box', 'Plaster ring', 'Wall plate']) {
    assert.ok(items.includes(expected), `missing ${expected}`);
  }
  assert.equal(exp.totalHours, ASSEMBLIES.receptacles.laborHours);
});

test('quantities scale with the count and merge across assemblies', () => {
  const exp = expandTakeoff(takeoffOf({ receptacles: 10, switches: 5 }));
  const boxes = exp.materials.find((m) => m.item === 'Device box');
  // Receptacles and switches both use a device box — they must merge, not
  // appear twice, or the estimator orders the same box under two lines.
  assert.equal(boxes.qty, 15);
  assert.equal(exp.materials.filter((m) => m.item === 'Device box').length, 1);
});

test('labor totals correctly across mixed devices', () => {
  const exp = expandTakeoff(takeoffOf({ receptacles: 10, lights: 4 }));
  const expected = 10 * ASSEMBLIES.receptacles.laborHours + 4 * ASSEMBLIES.lights.laborHours;
  assert.equal(exp.totalHours, Math.round(expected * 100) / 100);
});

test("a contractor's own labor units override ours and are flagged as theirs", () => {
  const exp = expandTakeoff(takeoffOf({ receptacles: 10 }), { laborOverrides: { receptacles: 0.3 } });
  assert.equal(exp.totalHours, 3);
  assert.equal(exp.labor[0].overridden, true);
  // A zero-hour override is legitimate (owner-furnished, installed by others).
  assert.equal(expandTakeoff(takeoffOf({ receptacles: 10 }), { laborOverrides: { receptacles: 0 } }).totalHours, 0);
});

test('a nonsense override falls back to the default rather than breaking the bid', () => {
  for (const bad of [-5, NaN, Infinity, 'fast', null]) {
    const exp = expandTakeoff(takeoffOf({ receptacles: 10 }), { laborOverrides: { receptacles: bad } });
    assert.equal(exp.totalHours, 10 * ASSEMBLIES.receptacles.laborHours, `override ${bad}`);
    assert.equal(exp.labor[0].overridden, false);
  }
});

test('wire is an allowance, is labelled as one, and carries waste', () => {
  const exp = expandTakeoff(takeoffOf({ receptacles: 10 }), { wasteFactor: 0.1 });
  const base = 10 * ASSEMBLIES.receptacles.wireAllowanceFt;
  assert.equal(exp.wireAllowanceFt, Math.ceil(base * 1.1));
  const wire = exp.materials.find((m) => /wire allowance/i.test(m.item));
  assert.ok(wire, 'wire must appear as a line');
  assert.match(wire.item, /allowance/i, 'the word allowance must be on the line itself');
  assert.equal(wire.unit, 'ft');
  assert.match(exp.wireDisclaimer, /not a measured quantity/i);
  assert.match(exp.wireDisclaimer, /homeruns/i);
});

test('a panel adds no wire allowance, because a takeoff cannot know the feeder', () => {
  const exp = expandTakeoff(takeoffOf({ panels: 1 }));
  assert.equal(exp.wireAllowanceFt, 0);
  assert.ok(!exp.materials.some((m) => /wire allowance/i.test(m.item)));
});

test('labor money only appears once a rate is entered', () => {
  const none = expandTakeoff(takeoffOf({ receptacles: 10 }));
  assert.equal(none.laborSubtotal, 0);
  assert.ok(!/\$/.test(expansionSummary(none)), 'no rate means no dollar figure');

  const priced = expandTakeoff(takeoffOf({ receptacles: 10 }), { laborRatePerHour: 95 });
  assert.equal(priced.laborSubtotal, Math.round(5 * 95 * 100) / 100);
  assert.match(expansionSummary(priced), /\$/);
});

test('a bad rate or waste factor degrades safely', () => {
  for (const rate of [-40, NaN, 'lots', null, Infinity]) {
    assert.equal(expandTakeoff(takeoffOf({ receptacles: 1 }), { laborRatePerHour: rate }).laborSubtotal, 0);
  }
  for (const waste of [-1, NaN, 'ten percent', null]) {
    const exp = expandTakeoff(takeoffOf({ receptacles: 1 }), { wasteFactor: waste });
    assert.equal(exp.wasteFactor, 0);
  }
});

test('the review flag survives into the expansion', () => {
  const low = validateTakeoff({ counts: { receptacles: 5 }, confidence: Confidence.LOW }).takeoff;
  assert.equal(expandTakeoff(low).needsReview, true, 'a shaky count must not become a confident bid');
});

test('the labor disclaimer refuses to call itself a quote', () => {
  assert.match(LABOR_DISCLAIMER, /not a quote/i);
  assert.match(LABOR_DISCLAIMER, /your own historical/i);
  assert.match(WIRE_DISCLAIMER, /allowance/i);
});

test('an empty takeoff expands to nothing rather than throwing', () => {
  for (const junk of [null, undefined, {}, { counts: {} }]) {
    const exp = expandTakeoff(junk);
    assert.deepEqual(exp.materials, []);
    assert.equal(exp.totalHours, 0);
  }
});
