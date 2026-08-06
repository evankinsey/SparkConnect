#!/usr/bin/env node
// ─── ANSWER-KEY AUDIT ────────────────────────────────────────────────────────
//
//   npm run audit:answers
//
// Cross-checks every multiple-choice question against its own explanation.
//
// The failure this catches is specific and nasty: the explanation works the
// problem correctly and the `c:` index points at a different choice. Nothing in
// the app notices, because the explanation is prose and the index is the answer
// key. The learner is marked wrong for being right, reads an explanation that
// contradicts the grade, and — the part that matters — memorises the wrong
// number for the exam and for the field.
//
// It found four real ones on its first run: a three-phase power question whose
// own arithmetic said 18,013 W while the key said 14,400 W; a voltage-drop
// question whose correct answer was not among the choices at all; an LFMC
// length question that named 6 feet and keyed 24 inches; and a conduit-fill
// question that failed an installation the code permits.
//
// Heuristic by nature — prose is prose. It reports suspicions for a human to
// resolve, which is why it is a separate command rather than part of `npm test`.
// A CONFUSED result is usually an explanation that names the distractors while
// explaining why they are wrong; read it before changing anything.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(HERE, '..', 'App.js'), 'utf8');

// The question objects are single-line literals, which makes a line-oriented
// parse honest enough.
const rows = [];
for (const line of src.split('\n')) {
  const m = line.match(/\{id:'([a-z0-9]+)',level:'([^']*)',cat:'([^']*)',q:'(.*?)',ch:\[(.*?)\],c:(\d+),exp:'(.*?)'/);
  if (!m) continue;
  const [, id, level, cat, q, chRaw, c, exp] = m;
  const choices = chRaw.split(/','|",\s*"/).map((s) => s.replace(/^['"]|['"]$/g, ''));
  rows.push({ id, level, cat, q, choices, c: Number(c), exp });
}

if (rows.length === 0) {
  console.error('Parsed no questions — the literal shape in App.js changed.');
  process.exit(1);
}

/** Numbers a human would read as "the answer": 18,013 · 2.25 · 40% · 5.93V */
const numbersIn = (text) => {
  const out = new Set();
  for (const m of String(text).matchAll(/(\d[\d,]*\.?\d*)/g)) {
    const n = Number(m[1].replace(/,/g, ''));
    if (Number.isFinite(n)) out.add(n);
  }
  return out;
};

/** Does this choice contain the value, allowing for rounding and units? */
const choiceMatches = (choice, value) => {
  for (const n of numbersIn(choice)) {
    if (n === value) return true;
    if (value !== 0 && Math.abs(n - value) / Math.abs(value) < 0.02) return true; // 2% rounding
  }
  return false;
};

const suspects = [];

for (const row of rows) {
  const marked = row.choices[row.c];
  if (marked === undefined) {
    suspects.push({ ...row, kind: 'INDEX', why: `c:${row.c} is out of range for ${row.choices.length} choices` });
    continue;
  }

  // Only meaningful when the explanation states numbers and every choice is
  // numeric. Conceptual questions are skipped rather than guessed at.
  const choiceNums = row.choices.flatMap((ch) => [...numbersIn(ch)]);
  if (choiceNums.length < row.choices.length) continue;

  const expNums = [...numbersIn(row.exp)];
  if (expNums.length === 0) continue;

  const hits = row.choices
    .map((ch, i) => ({ i, ch, hit: expNums.some((v) => choiceMatches(ch, v)) }))
    .filter((x) => x.hit);

  if (hits.length === 0) {
    suspects.push({
      ...row, kind: 'ORPHAN',
      why: `the explanation's numbers (${expNums.join(', ')}) appear in NO choice — the question cannot be answered correctly`,
    });
    continue;
  }

  // The strong signal: the explanation lands on exactly one choice, and it is
  // not the one the key marks.
  if (hits.length === 1 && hits[0].i !== row.c) {
    suspects.push({
      ...row, kind: 'MISMATCH',
      why: `explanation points at [${hits[0].i}] "${hits[0].ch}" but the key says [${row.c}] "${marked}"`,
    });
    continue;
  }

  // An explanation landing on more than one choice is arguing with itself. This
  // is how the worst one hid: it worked the problem correctly, got an answer
  // that was not among the choices, then talked itself into a different number
  // in the next sentence. Usually benign (naming the distractors), so it is
  // reported last and separately.
  if (hits.length > 1 && !hits.some((h) => h.i === row.c)) {
    suspects.push({
      ...row, kind: 'CONFUSED',
      why: `the explanation points at ${hits.map((h) => `[${h.i}]`).join(' ')} — none of which is the key [${row.c}]`,
    });
  }
}

const ORDER = ['INDEX', 'ORPHAN', 'MISMATCH', 'CONFUSED'];
suspects.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));

console.log(`\nAudited ${rows.length} questions.\n`);
if (suspects.length === 0) {
  console.log('No answer-key suspicions.\n');
  process.exit(0);
}

for (const s of suspects) {
  console.log(`${s.kind}  ${s.id} · ${s.cat} · ${s.level}`);
  console.log(`  Q: ${s.q}`);
  console.log(`  choices: ${s.choices.map((c, i) => `[${i}]${i === s.c ? '*' : ' '}${c}`).join('  ')}`);
  console.log(`  exp: ${s.exp}`);
  console.log(`  → ${s.why}\n`);
}
console.log(`${suspects.length} question(s) need a human to look at them.\n`);
process.exit(suspects.some((s) => s.kind === 'INDEX' || s.kind === 'ORPHAN' || s.kind === 'MISMATCH') ? 1 : 0);
