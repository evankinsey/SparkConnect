// ─── SOURCE VERIFICATION IS A RELEASE GATE ───────────────────────────────────
//
// The distinction these tests defend:
//
//   A test proves the app is internally consistent.
//   It cannot prove the source data was transcribed correctly.
//
// Every other test file in this repo asserts the first thing. This one asserts
// that we have not mistaken it for the second.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  VerificationStatus, STATUS_LABEL, DATASETS, DATASET_IDS, datasetById,
  isVerified, unverifiedDatasets, FEATURE_DEPENDENCIES, FEATURE_IDS,
  productionBlockers, isProductionReady, gateNotice, verificationReport,
  BANNED_STATUS_WORDING, PERMITTED_STATUS_WORDING, isPermittedStatusWording,
  RELEASE_OVERRIDE, unverifiedDependencies,
} from '../src/core/verification.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

// ─── The gate ────────────────────────────────────────────────────────────────

test('every dataset transcribed from memory is UNVERIFIED', () => {
  for (const id of DATASET_IDS) {
    const d = datasetById(id);
    if (d.transcribedFrom !== 'memory') continue;
    assert.equal(d.status, VerificationStatus.UNVERIFIED,
      `${id} was transcribed from memory and cannot be anything but unverified`);
    assert.equal(isVerified(id), false);
  }
});

test('a dataset cannot be marked verified without a reviewer, date and edition', () => {
  for (const id of DATASET_IDS) {
    const d = datasetById(id);
    if (d.status !== VerificationStatus.SOURCE_VERIFIED) continue;
    assert.ok(d.reviewer, `${id} claims verification with no named reviewer`);
    assert.ok(d.reviewDate, `${id} claims verification with no date`);
    assert.ok(d.sourceEdition, `${id} claims verification with no source edition`);
  }
});

test('every unverified dataset says how to check it', () => {
  for (const d of unverifiedDatasets()) {
    assert.ok(d.checkInstructions,
      `${d.id} is blocking a release and does not say what to check`);
    assert.ok(d.where, `${d.id} does not say where it lives`);
  }
});

test('the release override ships features WITHOUT marking anything verified', () => {
  // This replaces an assertion that unverified tables block a release. The owner
  // has now accepted that risk explicitly for TestFlight. What the override must
  // never do is let the codebase forget that it did — so this asserts both the
  // shipping and the remembering.
  assert.equal(RELEASE_OVERRIDE.active, true);
  assert.ok(RELEASE_OVERRIDE.authorizedBy && RELEASE_OVERRIDE.date && RELEASE_OVERRIDE.reason,
    'an override with no author, date or reason is indistinguishable from a bug');

  for (const feature of ['conduitFillCalculator', 'voltageDropCalculator', 'boxFillCalculator', 'ampacityCalculator', 'sparkAiCalculationTools', 'dayOneLevel']) {
    assert.equal(isProductionReady(feature), true, `${feature} should ship under the override`);
    assert.deepEqual(productionBlockers(feature), []);
    // Whatever a feature still reads unchecked must stay reportable. A feature
    // whose tables have ALL been checked reports none, and that is the point of
    // doing the checking — it is not a test failure.
    const outstanding = unverifiedDependencies(feature);
    for (const id of outstanding) {
      assert.equal(isVerified(id), false, `${feature} reports ${id} as outstanding but it is verified`);
    }
  }

  // Box fill depends on one table and that table has now been read against the
  // printed 2023 book, so it needs the override for nothing.
  assert.deepEqual(unverifiedDependencies('boxFillCalculator'), [],
    'box fill should be clear on its own merits');
});

test('the override does not verify a single dataset', () => {
  // Originally this froze a count. That was wrong: it made checking a table
  // against the book LOOK like a regression, which is the exact opposite of the
  // behaviour this register is supposed to encourage. What matters is that
  // verification comes only from a recorded review, never from the override.
  for (const d of unverifiedDatasets()) {
    assert.equal(isVerified(d.id), false);
    assert.ok(!d.reviewer && !d.reviewDate,
      `${d.id} is unverified yet carries review metadata`);
  }
  for (const id of DATASET_IDS) {
    const d = datasetById(id);
    if (d.status !== VerificationStatus.SOURCE_VERIFIED) continue;
    // A verified dataset got there by being read, and says who read it.
    assert.ok(d.reviewer && d.reviewDate && d.sourceEdition,
      `${id} claims verification without a full record`);
    assert.ok(d.verifiedRows?.length, `${id} claims verification with no rows recorded`);
  }
  // The override itself touches none of this.
  assert.equal(RELEASE_OVERRIDE.scope.includes('Verification status'), true);
});

test('the in-app notice SURVIVES the override', () => {
  // Shipping unverified numbers is a risk the owner can accept on their own
  // behalf. Hiding it from an electrician standing at a panel is a different
  // thing, and the override deliberately does not do it.
  for (const feature of ['conduitFillCalculator', 'ampacityCalculator', 'sparkAiCalculationTools']) {
    const notice = gateNotice(feature);
    assert.ok(notice, `${feature} ships with no notice at all`);
    assert.equal(notice.shippedUnderOverride, true);
    assert.match(notice.body, /have not yet been checked against a printed source/);
  }
});

test('turning the override off restores the gate exactly', () => {
  // "One line to reverse" has to be a fact, not a comment.
  const wouldBlock = FEATURE_DEPENDENCIES.conduitFillCalculator.filter((id) => !isVerified(id));
  assert.ok(wouldBlock.length > 0, 'with the override off, conduit fill is blocked by its two tables');
  assert.deepEqual(wouldBlock, unverifiedDependencies('conduitFillCalculator'));
});

test('a feature with no unverified dependency is clear to ship', () => {
  assert.equal(isProductionReady('blueprintEstimator'), true,
    'the estimator computes from user-confirmed objects, not from a transcribed table');
  assert.equal(isProductionReady('wiringSimulator'), true,
    'the solver is derived from first principles, not transcribed');
  assert.deepEqual(productionBlockers('wiringSimulator'), []);
});

test('an unknown feature is never production ready', () => {
  assert.equal(isProductionReady('somethingMadeUp'), false,
    'defaulting an unregistered feature to ready is how a gate gets bypassed');
  assert.deepEqual(productionBlockers('somethingMadeUp'), []);
});

test('every dataset a feature names actually exists', () => {
  for (const [feature, deps] of Object.entries(FEATURE_DEPENDENCIES)) {
    for (const id of deps) {
      assert.ok(datasetById(id), `${feature} depends on "${id}", which is not a registered dataset`);
    }
  }
});

test('DERIVED status inherits, so it cannot launder an unverified source', () => {
  const derived = { ...DATASETS['ch9-table-4'], status: VerificationStatus.DERIVED, dependsOn: ['ch9-table-5'] };
  assert.equal(isVerified('ch9-table-5'), false);
  // Directly exercise the inheritance rule the register uses.
  assert.equal(derived.dependsOn.every(isVerified), false);
});

// ─── The notice a gated feature shows ────────────────────────────────────────

test('a gated feature has a notice that is accurate in both directions', () => {
  const n = gateNotice('conduitFillCalculator');
  assert.ok(n);
  assert.equal(n.headline, 'Technical review pending');
  // It must not imply the numbers are wrong...
  assert.ok(!/incorrect|wrong|unreliable/i.test(n.body));
  // ...nor that anyone has approved them.
  assert.ok(isPermittedStatusWording(n.body + n.headline));
  assert.match(n.body, /have not yet been checked against a printed source/);
  assert.match(n.body, /adopted by your AHJ/);
  assert.ok(n.datasets.length > 0, 'it names what is pending');
});

test('a clear feature has no notice at all', () => {
  assert.equal(gateNotice('wiringSimulator'), null);
  assert.equal(gateNotice('blueprintEstimator'), null);
});

// ─── The wording rule ────────────────────────────────────────────────────────

test('"Safety Verified" is banned everywhere in the codebase', () => {
  // Passing automated tests is not professional approval, and that phrasing
  // reads as though it were.
  const walk = (dir, out = []) => {
    for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const rel = join(dir, e.name);
      if (e.isDirectory()) walk(rel, out);
      else if (/\.(js|jsx|md)$/.test(e.name)) out.push(rel);
    }
    return out;
  };

  // The ban is on CLAIMING these things, not on the words appearing in a
  // sentence that denies them. "It cannot prove the lesson teaches code-compliant
  // practice" is the opposite of an overclaim and has to stay legal, so a hit is
  // only an offence when nothing nearby negates it.
  const NEGATORS = /\b(not|never|cannot|can't|no claim|no guarantee|does not|do not|nor|rather than|instead of|banned|forbidden|must not)\b/i;

  // Two legitimate reasons a banned phrase appears in the source, both of which
  // are the opposite of an overclaim:
  //   - a disclaimer that denies it ("No Guarantee of Code Compliance")
  //   - a deliberately WRONG multiple-choice distractor
  // Distractors live inside a `ch:[...]` array, which is what this skips.
  const inQuizChoices = (text, at) => {
    const before = text.lastIndexOf('ch:[', at);
    if (before === -1) return false;
    const close = text.indexOf(']', before);
    return close > at;
  };

  const offenders = [];
  for (const file of [...walk('src'), ...walk('docs'), 'App.js']) {
    // The register and this test legitimately spell the banned strings out.
    if (file.includes('verification.js') || file.includes('verification.test.js')) continue;
    const text = read(file);
    const lower = text.toLowerCase();
    for (const banned of BANNED_STATUS_WORDING) {
      let from = 0;
      for (;;) {
        const at = lower.indexOf(banned, from);
        if (at === -1) break;
        from = at + banned.length;
        if (inQuizChoices(text, at)) continue;
        const window = text.slice(Math.max(0, at - 200), at + banned.length + 60);
        if (!NEGATORS.test(window)) {
          offenders.push(`${file}: "${banned}" used as a claim — ${window.trim().slice(0, 120)}`);
        }
      }
    }
  }
  assert.deepEqual(offenders, [], offenders.join('\n\n'));
});

test('the permitted wording says what happened and no more', () => {
  for (const phrase of PERMITTED_STATUS_WORDING) {
    assert.ok(isPermittedStatusWording(phrase), `"${phrase}" should be allowed`);
  }
  for (const banned of ['Safety Verified', 'NEC approved', 'code compliant', 'certified']) {
    assert.equal(isPermittedStatusWording(banned), false, `"${banned}" should be rejected`);
  }
});

test('every status has a label that does not overclaim', () => {
  for (const status of Object.values(VerificationStatus)) {
    assert.ok(STATUS_LABEL[status], `${status} has no label`);
    assert.ok(isPermittedStatusWording(STATUS_LABEL[status]));
  }
});

// ─── The register stays honest as the code grows ─────────────────────────────

test('the tables that exist in code are all registered', () => {
  // A new transcribed table added without a register entry is a silent hole in
  // the gate, so the known ones are pinned by where they live.
  const expectations = [
    ['src/core/domain/conduitFill.js', ['ch9-table-4', 'ch9-table-5']],
    ['src/core/ai/tools.js', ['table-310-16', 'table-240-4-d', 'table-310-15-c-1', 'table-314-16-b', 'conductor-resistance']],
    ['src/nec/citations.js', ['nec-citations']],
  ];
  for (const [file, ids] of expectations) {
    for (const id of ids) {
      const d = datasetById(id);
      assert.ok(d, `${id} is not registered`);
      assert.ok(d.where.includes(file.split('/').pop()),
        `${id} says it lives in "${d.where}" but is expected in ${file}`);
    }
  }
});

test('the report is complete enough to run a release from', () => {
  const r = verificationReport();
  assert.equal(r.datasets.length, DATASET_IDS.length);
  assert.equal(r.features.length, FEATURE_IDS.length);
  assert.ok(r.unverifiedCount > 0, 'nothing has been source-checked yet, and the report should say so');
  // The override is on the face of the report, and what each feature is
  // shipping over is still listed against it.
  assert.ok(r.override, 'an active override must not be invisible in the report');
  const cf = r.features.find((f) => f.id === 'conduitFillCalculator');
  assert.equal(cf.ready, true);
  assert.deepEqual(cf.blockers, []);
  assert.ok(cf.unverified.length > 0);
  for (const d of r.datasets) {
    assert.ok(d.label && d.where && d.statusLabel);
    assert.equal(typeof d.verified, 'boolean');
  }
});

test('the Annex C cross-check has been read from print, and remembers what it got wrong', () => {
  const d = datasetById('annex-c-table-c1');
  // Read against printed page 70-778 on 2026-08-07 — all 36 EMT/THHN cells.
  assert.equal(isVerified('annex-c-table-c1'), true);
  assert.equal(d.sourceEdition, '2023');
  assert.ok(d.verifiedRows.some((r) => /all 36 cells/i.test(r)));

  // The cell that was wrong on first transcription stays in the record. It is
  // the strongest available evidence that recalled tables need checking, and
  // verifying the table is not a reason to delete the reason it was checked.
  assert.ok(d.verifiedRows.some((r) => /reads 1, confirming the correction/i.test(r)),
    'the 1/2" with 6 AWG history must survive verification');
});

// ─── The two gates are independent ───────────────────────────────────────────

test('the feature flag remains an independent gate under the override', async () => {
  // The source-data gate is open by owner decision. The FLAG gate is untouched,
  // so the two remain separate questions rather than collapsing into one.
  const { canRenderInProduction } = await import('../src/flags/core.js');
  const verification = await import('../src/core/verification.js');

  const flagOn = canRenderInProduction(
    'wiringSimulationsEnabled', 'conduitFillCalculator',
    { remote: { wiringSimulationsEnabled: true } }, verification);
  assert.equal(flagOn.allowed, true, 'under the override the source gate no longer blocks');

  const flagOff = canRenderInProduction(
    'wiringSimulationsEnabled', 'conduitFillCalculator',
    { remote: { wiringSimulationsEnabled: false } }, verification);
  assert.equal(flagOff.allowed, false, 'the flag still holds it back on its own');
  assert.match(flagOff.reason, /is off/);
});

test('a partial source check is recorded and does not verify the dataset', () => {
  const d = datasetById('ch9-table-4');
  assert.ok(d.verifiedRows?.length, 'the EMT rows really were checked against the printed book');
  assert.ok(d.outstandingRows?.length, 'and what is left is named');
  assert.equal(isVerified('ch9-table-4'), false,
    'clearing a dataset on a quarter of it is the same mistake as clearing it on a green test suite');
  assert.ok(unverifiedDependencies('conduitFillCalculator').includes('ch9-table-4'),
    'and the feature still reports reading it');
});

test('the report surfaces partial progress without moving the gate', () => {
  const row = verificationReport().datasets.find((d) => d.id === 'ch9-table-4');
  assert.ok(row.verifiedRows?.length);
  assert.ok(row.outstandingRows?.length);
  assert.equal(row.verified, false);
});
