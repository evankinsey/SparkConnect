// ─── CONDUIT FILL vs NEC ANNEX C ─────────────────────────────────────────────
//
// Annex C is the published answer key. If our areas, our wire sizes, our fill
// percentages and our rounding are all right, `maxConductors` reproduces Table
// C.1 exactly. If any one of them is wrong, a row goes red.
//
// This test exists because the shipped calculator was wrong for a long time and
// nothing noticed. The area table held Chapter 9 Table 4's 40% column while the
// fill math divided by it and then compared the answer to 40% again — requiring
// fill to be 40% of 40%, or 16% of the pipe. Every line read plausibly. Only
// checking the output against the book reveals it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  MAX_FILL, maxFillPercent, CONDUIT_AREA, WIRE_AREA,
  conduitArea, wireArea, fillFor, maxConductors,
} from '../src/core/domain/conduitFill.js';

// NEC Chapter 9, Table C.1 — EMT, THHN/THWN-2, all conductors the same size.
//
// VERIFY THESE AGAINST THE PRINTED BOOK before treating them as gospel. They are
// transcribed, and a transcription error here would silently bless a wrong
// calculator — the exact failure this file exists to prevent. What the module
// derives independently from Chapter 9 Tables 1, 4 and 5 is the primary
// guarantee; this table is the cross-check on that derivation.
//
// The 1/2" #6 cell is the one worth a second look. Two #6 THHN come to 0.1014
// in², and the two-conductor row of Table 1 allows 31% of 0.304 = 0.0942 in².
// So only one fits, even though the 40% row would have allowed two. It is the
// only cell in this table where the 31% rule, rather than the 40% rule, decides.
const TABLE_C1_EMT_THHN = {
  '1/2"':   { 14: 12, 12: 9,  10: 5,  8: 3,  6: 1,  4: 1 },
  '3/4"':   { 14: 22, 12: 16, 10: 10, 8: 6,  6: 4,  4: 2 },
  '1"':     { 14: 35, 12: 26, 10: 16, 8: 9,  6: 7,  4: 4 },
  '1-1/4"': { 14: 61, 12: 45, 10: 28, 8: 16, 6: 12, 4: 7 },
  '1-1/2"': { 14: 84, 12: 61, 10: 38, 8: 22, 6: 16, 4: 10 },
  '2"':     { 14: 138, 12: 101, 10: 63, 8: 36, 6: 26, 4: 16 },
};

test('maxConductors reproduces NEC Table C.1 for EMT with THHN', () => {
  for (const [size, row] of Object.entries(TABLE_C1_EMT_THHN)) {
    for (const [gauge, expected] of Object.entries(row)) {
      assert.equal(
        maxConductors('EMT', size, 'THHN', String(gauge)),
        expected,
        `${size} EMT with #${gauge} THHN: Table C.1 says ${expected}`,
      );
    }
  }
});

test('the specific case the old calculator got wrong', () => {
  // It reported FAIL for four #12 THHN in 1/2" EMT. The code permits nine.
  assert.equal(maxConductors('EMT', '1/2"', 'THHN', '12'), 9);

  const four = fillFor({ conduitType: 'EMT', tradeSize: '1/2"', insulation: 'THHN', gauge: '12', count: 4 });
  assert.equal(four.passed, true, 'four #12 in a 1/2" EMT is legal and must pass');
  assert.ok(four.percent > 17 && four.percent < 18, `expected ~17.5%, got ${four.percent}`);

  const nine = fillFor({ conduitType: 'EMT', tradeSize: '1/2"', insulation: 'THHN', gauge: '12', count: 9 });
  assert.equal(nine.passed, true, 'nine is the published maximum and must pass');
  assert.ok(nine.percent <= 40);

  const ten = fillFor({ conduitType: 'EMT', tradeSize: '1/2"', insulation: 'THHN', gauge: '12', count: 10 });
  assert.equal(ten.passed, false, 'ten must fail');
});

test('three #12 THHN in 1/2" EMT is 13%, not 33%', () => {
  // The old number, 32.7%, came from dividing by the 40% area. It is the share
  // of the ALLOWANCE used, not the fill, and calling it fill made the calculator
  // reject legal work.
  const r = fillFor({ conduitType: 'EMT', tradeSize: '1/2"', insulation: 'THHN', gauge: '12', count: 3 });
  assert.ok(r.percent > 13 && r.percent < 13.2, `expected ~13.1%, got ${r.percent}`);
  assert.equal(r.status, 'pass');
});

test('the Table 1 rows are applied by conductor count', () => {
  assert.equal(maxFillPercent(1), 53);
  assert.equal(maxFillPercent(2), 31);
  assert.equal(maxFillPercent(3), 40);
  assert.equal(maxFillPercent(9), 40);
  assert.equal(maxFillPercent(0), 53, 'a degenerate count must not produce a bogus limit');

  // A single conductor gets 53%, so it is not judged against the 40% row.
  const one = fillFor({ conduitType: 'EMT', tradeSize: '1/2"', insulation: 'THHN', gauge: '2', count: 1 });
  assert.equal(one.limit, 53);
});

test('stored areas are TOTAL areas, not the 40% column', () => {
  // The regression guard. If someone pastes the 40% column back in, every one
  // of these fails immediately.
  assert.equal(conduitArea('EMT', '1/2"'), 0.304);
  assert.equal(conduitArea('EMT', '2"'), 3.356);
  for (const [type, sizes] of Object.entries(CONDUIT_AREA)) {
    for (const [size, area] of Object.entries(sizes)) {
      assert.ok(area > 0.2, `${type} ${size} = ${area} looks like a 40% figure, not a total area`);
    }
  }
});

test('the four conduit types are four different pipes', () => {
  // RMC used to be a byte-for-byte copy of EMT and PVC-40 was partly RMC's row,
  // so two of the four types were the wrong pipe entirely.
  const half = Object.entries(CONDUIT_AREA).map(([type, s]) => [type, s['1/2"']]);
  const values = half.map(([, v]) => v);
  assert.equal(new Set(values).size, values.length,
    `two conduit types share a 1/2" area: ${JSON.stringify(half)}`);
  // Sanity: rigid is bigger inside than EMT is not true — EMT has thinner walls,
  // so EMT's internal area exceeds PVC-40's and falls short of IMC's.
  assert.ok(conduitArea('IMC', '1/2"') > conduitArea('EMT', '1/2"'));
  assert.ok(conduitArea('PVC-40', '1/2"') < conduitArea('EMT', '1/2"'));
});

test('a missing lookup returns null rather than a confident zero', () => {
  assert.equal(conduitArea('EMT', '6"'), null);
  assert.equal(wireArea('THHN', '4/0'), null);
  assert.equal(fillFor({ conduitType: 'EMT', tradeSize: '6"', insulation: 'THHN', gauge: '12', count: 3 }), null);
  assert.equal(maxConductors('MC', '1/2"', 'THHN', '12'), null);
});

test('a conductor too big for the pipe reports zero, not a negative or a crash', () => {
  assert.equal(maxConductors('EMT', '1/2"', 'THHN', '2/0'), 0);
  const r = fillFor({ conduitType: 'EMT', tradeSize: '1/2"', insulation: 'THHN', gauge: '2/0', count: 1 });
  assert.equal(r.passed, false);
});

test('App.js uses the same areas as this module', () => {
  // The screen still holds its own copy. Until it imports this module, the two
  // must agree — a silent drift here is exactly how the original bug survived.
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'App.js'), 'utf8');
  const m = src.match(/const COND_AREAS=\{(.+?)\};/s);
  assert.ok(m, 'App.js must still declare COND_AREAS for this guard to work');
  for (const [type, sizes] of Object.entries(CONDUIT_AREA)) {
    for (const [size, area] of Object.entries(sizes)) {
      const key = `'${size}':${area}`;
      assert.ok(m[1].includes(key),
        `App.js COND_AREAS is missing ${type} ${size} = ${area} — the screen and the module disagree`);
    }
  }
  const maxFill = src.match(/const MAX_FILL=\{1:(\d+),2:(\d+),3:(\d+)\}/);
  assert.ok(maxFill, 'App.js must declare MAX_FILL');
  assert.deepEqual([Number(maxFill[1]), Number(maxFill[2]), Number(maxFill[3])],
    [MAX_FILL[1], MAX_FILL[2], MAX_FILL[3]]);
});

test('wire areas match Chapter 9 Table 5', () => {
  assert.equal(wireArea('THHN', '14'), 0.0097);
  assert.equal(wireArea('THHN', '12'), 0.0133);
  assert.equal(wireArea('THHN', '10'), 0.0211);
  assert.equal(wireArea('THHN', '8'), 0.0366);
  // XHHW is fatter than THHN in the small sizes, which is the whole reason the
  // insulation type is a separate input.
  for (const g of ['14', '12', '10', '8']) {
    assert.ok(WIRE_AREA.XHHW[g] > WIRE_AREA.THHN[g], `XHHW #${g} should exceed THHN #${g}`);
  }
});
