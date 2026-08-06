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

test('features depending on unverified tables are NOT production ready', () => {
  // The release blocker, asserted directly. If someone marks a dataset verified
  // without doing the work, this test goes green — which is why the test above
  // requires a named reviewer to make that claim at all.
  for (const feature of ['conduitFillCalculator', 'voltageDropCalculator', 'boxFillCalculator', 'ampacityCalculator', 'sparkAiCalculationTools', 'dayOneLevel']) {
    assert.equal(isProductionReady(feature), false,
      `${feature} reads a table nobody has checked against the printed source`);
    assert.ok(productionBlockers(feature).length > 0);
  }
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
  assert.ok(r.blockedFeatures > 0);
  for (const d of r.datasets) {
    assert.ok(d.label && d.where && d.statusLabel);
    assert.equal(typeof d.verified, 'boolean');
  }
});

test('the Annex C cross-check is registered as unverified, not treated as proof', () => {
  const d = datasetById('annex-c-table-c1');
  assert.equal(isVerified('annex-c-table-c1'), false);
  assert.match(d.note, /one cell.*was already found wrong|1\/2" with #6/i);
  // That one wrong cell on first transcription is the strongest available
  // evidence that recalled tables need checking, so it stays in the record.
});

// ─── The two gates are independent ───────────────────────────────────────────

test('a feature flag being ON does not clear the source-data gate', async () => {
  const { canRenderInProduction } = await import('../src/flags/core.js');
  const verification = await import('../src/core/verification.js');

  // Flag deliberately forced on, the way a product decision would.
  const context = { remote: { wiringSimulationsEnabled: true } };

  const clear = canRenderInProduction('wiringSimulationsEnabled', 'wiringSimulator', context, verification);
  assert.equal(clear.allowed, true, 'the solver reads no transcribed table');

  const gated = canRenderInProduction('wiringSimulationsEnabled', 'conduitFillCalculator', context, verification);
  assert.equal(gated.allowed, false,
    'a product decision that the feature is finished cannot answer whether the numbers are right');
  assert.ok(gated.blockers.length > 0);
  assert.match(gated.reason, /not been checked against a printed source/);
});

test('the source-data gate cannot be satisfied by turning a flag on', async () => {
  const { canRenderInProduction } = await import('../src/flags/core.js');
  const verification = await import('../src/core/verification.js');
  for (const remote of [{}, { conduitFillEnabled: true }, { everything: true }]) {
    const r = canRenderInProduction('wiringSimulationsEnabled', 'ampacityCalculator', { remote: { wiringSimulationsEnabled: true, ...remote } }, verification);
    assert.equal(r.allowed, false);
  }
});
