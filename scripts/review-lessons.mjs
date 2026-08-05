#!/usr/bin/env node
// ─── LESSON TECHNICAL REVIEW CLI ─────────────────────────────────────────────
// Requirements: REV-08, REV-09, REV-10, REV-14, DOD-16
//
//   npm run lessons:review              list the queue and what each lesson claims
//   npm run lessons:review -- <id>      print one lesson in full for review
//   npm run lessons:approve -- <id> --reviewer "Name, Lic #12345" --date 2026-08-05
//
// Approval writes an APPROVALS.json record. It refuses to run without a named
// reviewer and a date, because DOD-16 forbids marking a lesson approved without
// an actual reviewer — including by an engineer in a hurry, including by me.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { ALL_LESSONS, lessonById, solutionCircuit } from '../src/circuit/lessons/index.js';
import { validate } from '../src/circuit/validator.js';
import { truthTable } from '../src/circuit/solver.js';
import { REVIEW_CHECKLIST, ReviewStatus } from '../src/circuit/review.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const APPROVALS_PATH = join(HERE, '..', 'docs', 'v1.1', 'APPROVALS.json');

const readApprovals = () => {
  if (!existsSync(APPROVALS_PATH)) return {};
  try { return JSON.parse(readFileSync(APPROVALS_PATH, 'utf8')); } catch { return {}; }
};

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));

const approvals = readApprovals();
const statusOf = (lesson) => approvals[lesson.id]?.technicalReviewStatus ?? lesson.technicalReviewStatus;
const approvedOf = (lesson) => approvals[lesson.id]?.productionApproved ?? lesson.productionApproved;

// ─── list ────────────────────────────────────────────────────────────────────
if (positional.length === 0 && !flag('approve')) {
  console.log('\nSparkConnect — wiring lesson review queue\n');
  console.log('  id                              ver  status                    visible');
  console.log('  ' + '-'.repeat(74));
  for (const l of ALL_LESSONS) {
    const st = statusOf(l);
    const visible = approvedOf(l) === true && st === ReviewStatus.APPROVED;
    console.log(`  ${l.id.padEnd(31)} ${String(l.lessonVersion).padEnd(4)} ${st.padEnd(25)} ${visible ? 'YES' : 'no'}`);
  }
  const pending = ALL_LESSONS.filter((l) => !(approvedOf(l) === true && statusOf(l) === ReviewStatus.APPROVED));
  console.log(`\n  ${pending.length} of ${ALL_LESSONS.length} awaiting review.`);
  console.log('\n  Inspect one:  npm run lessons:review -- <id>');
  console.log('  Approve one:  npm run lessons:approve -- <id> --reviewer "Name, Lic #12345" --date YYYY-MM-DD\n');
  process.exit(0);
}

const id = positional[0];
const lesson = lessonById(id);
if (!lesson) {
  console.error(`\n  No lesson "${id}". Run without arguments to list them.\n`);
  process.exit(1);
}

// ─── approve ─────────────────────────────────────────────────────────────────
if (args.includes('--approve')) {
  const reviewer = flag('reviewer');
  const date = flag('date');
  const notes = flag('notes') ?? '';

  if (!reviewer || !reviewer.trim()) {
    console.error('\n  Refused: --reviewer is required.');
    console.error('  A wiring lesson may only be approved by a named qualified reviewer (DOD-16).\n');
    process.exit(1);
  }
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error('\n  Refused: --date YYYY-MM-DD is required.\n');
    process.exit(1);
  }

  approvals[lesson.id] = {
    technicalReviewStatus: ReviewStatus.APPROVED,
    technicalReviewer: reviewer.trim(),
    reviewDate: date,
    reviewerNotes: notes,
    productionApproved: true,
    lessonVersion: lesson.lessonVersion,
    approvedAt: new Date().toISOString(),
  };
  writeFileSync(APPROVALS_PATH, `${JSON.stringify(approvals, null, 2)}\n`);

  console.log(`\n  ${lesson.id} APPROVED by ${reviewer.trim()} on ${date}`);
  console.log(`  Recorded in docs/v1.1/APPROVALS.json (lesson version ${lesson.lessonVersion}).`);
  console.log('\n  It is still gated by its feature flag: ' + lesson.featureFlag);
  console.log('  Note: changing the lesson bumps its version and voids this approval.\n');
  process.exit(0);
}

// ─── inspect ─────────────────────────────────────────────────────────────────
const circuit = solutionCircuit(lesson);
const result = validate(circuit, lesson.expectations);
const table = truthTable(circuit);

console.log(`\n${'='.repeat(78)}`);
console.log(`  ${lesson.title}`);
console.log(`  ${lesson.id} · version ${lesson.lessonVersion} · ${lesson.difficulty}`);
console.log(`${'='.repeat(78)}\n`);
console.log(`  ${lesson.description}\n`);

console.log('  LEARNING OBJECTIVES');
lesson.learningObjectives.forEach((o) => console.log(`    - ${o}`));

console.log('\n  TOPOLOGY');
for (const c of lesson.components()) {
  console.log(`    ${c.id.padEnd(8)} ${c.type}`);
  for (const t of c.terminals) console.log(`        ${t.localId.padEnd(8)} ${t.semanticRole.padEnd(22)} ${t.label}`);
}

console.log('\n  REFERENCE SOLUTION');
for (const w of circuit.conductors) console.log(`    ${w.fromTerminal.padEnd(16)} -> ${w.toTerminal.padEnd(16)} ${w.role}`);

console.log(`\n  TRUTH TABLE  (${table.switchIds.join(', ')})`);
console.log(`    ${'state'.padEnd(12)} load     short`);
for (const row of table.rows) {
  console.log(`    ${row.stateVector.join('').padEnd(12)} ${(row.anyLoadEnergized ? 'ON' : 'off').padEnd(8)} ${row.shortCircuit ? 'SHORT' : '-'}`);
}

console.log(`\n  ENGINE VERDICT: ${result.valid ? 'valid' : 'INVALID'}`);
if (!result.valid) result.errors.forEach((e) => console.log(`    ${e.category}: ${e.message}`));

console.log('\n  HINT SEQUENCE');
lesson.hintSteps.forEach((h) => console.log(`    ${h.level}. ${h.text}`));

console.log('\n  REFERENCES');
for (const r of lesson.referenceNotes) {
  console.log(`    [${r.verified ? 'verified' : 'NEEDS VERIFICATION'}] ${r.label}${r.ref ? ` — ${r.ref}` : ''}`);
}

console.log('\n  SAFETY LANGUAGE');
lesson.safetyNotes.forEach((s) => console.log(`    - ${s}`));

console.log('\n  REVIEWER CHECKLIST');
REVIEW_CHECKLIST.forEach((q, i) => console.log(`    ${String(i + 1).padStart(2)}. [ ] ${q}`));

console.log(`\n  Current status: ${statusOf(lesson)}   production visible: ${approvedOf(lesson) === true && statusOf(lesson) === ReviewStatus.APPROVED ? 'YES' : 'no'}`);
console.log('\n  To approve:');
console.log(`    npm run lessons:approve -- ${lesson.id} --reviewer "Your Name, Lic #" --date YYYY-MM-DD\n`);
