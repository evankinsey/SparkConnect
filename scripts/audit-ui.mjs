#!/usr/bin/env node
// ─── UI CONSISTENCY AUDIT ────────────────────────────────────────────────────
// Finds the "developer made" tells that are actually measurable.
//
// Polish is mostly a judgement call, and a script cannot tell you a screen feels
// wrong. What it CAN tell you is that this app uses twelve different corner
// radii, that four buttons are below the minimum tap target, and exactly which
// lines they are on — which turns a vague "audit every screen" into a list
// somebody can work through in an evening.
//
// Reports, never rewrites. A codemod that reshapes every screen the night before
// a release is how you ship a layout bug you cannot see.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { radius, space, MIN_TAP, RADIUS_VALUES, SPACE_VALUES } from '../src/design/tokens.js';

const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  if (f === 'node_modules') return [];
  return statSync(p).isDirectory() ? walk(p) : (p.endsWith('.js') ? [p] : []);
});

const FILES = [...walk('src/screens'), 'App.js'];

const findings = [];
const add = (severity, file, line, rule, detail) =>
  findings.push({ severity, file, line, rule, detail });

const nearest = (v, allowed) =>
  allowed.reduce((best, a) => (Math.abs(a - v) < Math.abs(best - v) ? a : best), allowed[0]);

for (const file of FILES) {
  const src = readFileSync(file, 'utf8');
  const lines = src.split('\n');

  lines.forEach((text, i) => {
    const line = i + 1;

    // ── Corner radius off the scale ──
    for (const m of text.matchAll(/borderRadius:\s*([0-9.]+)/g)) {
      const v = Number(m[1]);
      if (v >= 100) continue;                        // intentional pill
      if (RADIUS_VALUES.includes(v)) continue;
      add('MEDIUM', file, line, 'radius',
        `borderRadius ${v} is not on the scale — nearest token is ${nearest(v, RADIUS_VALUES.filter((r) => r < 100))}`);
    }

    // ── Tap targets below the minimum ──
    for (const m of text.matchAll(/minHeight:\s*([0-9.]+)/g)) {
      const v = Number(m[1]);
      if (v >= MIN_TAP) continue;
      // Only interesting when the element is interactive.
      const around = lines.slice(Math.max(0, i - 6), i + 3).join(' ');
      if (!/TouchableOpacity|Pressable|onPress/.test(around)) continue;
      add('HIGH', file, line, 'tap-target',
        `minHeight ${v} on a touchable is below the ${MIN_TAP}pt minimum`);
    }

    // ── Touchable with no height floor at all ──
    if (/<TouchableOpacity/.test(text)) {
      const block = lines.slice(i, i + 8).join(' ');
      if (!/minHeight|hitSlop|padding|style=\{styles/.test(block)) {
        add('MEDIUM', file, line, 'tap-target',
          'TouchableOpacity with no minHeight, padding or hitSlop — likely a small target');
      }
    }

    // ── Odd spacing ──
    for (const m of text.matchAll(/\b(?:padding|margin)(?:Top|Bottom|Left|Right|Horizontal|Vertical)?:\s*([0-9.]+)/g)) {
      const v = Number(m[1]);
      if (v === 0 || SPACE_VALUES.includes(v)) continue;
      if (v > 48) continue;                          // deliberate large gaps
      add('LOW', file, line, 'spacing',
        `${v} is off the 4pt grid — nearest token is ${nearest(v, SPACE_VALUES)}`);
    }

    // ── Animation with a hardcoded duration ──
    for (const m of text.matchAll(/duration:\s*([0-9]+)/g)) {
      add('MEDIUM', file, line, 'motion',
        `hardcoded duration ${m[1]} — should go through animate() so reduce-motion is honoured`);
    }

    // ── Colour literals outside the theme ──
    for (const m of text.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
      if (/#fff\b|#ffffff\b|#000\b|#000000\b/i.test(m[0])) continue;  // pure black/white on brand buttons
      add('LOW', file, line, 'colour',
        `${m[0]} is a literal — dark mode is driven by the C theme object`);
    }
  });
}

// ─── Report ──────────────────────────────────────────────────────────────────

const RANK = { HIGH: 0, MEDIUM: 1, LOW: 2 };
findings.sort((a, b) => RANK[a.severity] - RANK[b.severity] || a.file.localeCompare(b.file) || a.line - b.line);

const byRule = {};
const byFile = {};
for (const f of findings) {
  byRule[f.rule] = (byRule[f.rule] ?? 0) + 1;
  byFile[f.file] = (byFile[f.file] ?? 0) + 1;
}

const counts = { HIGH: 0, MEDIUM: 0, LOW: 0 };
for (const f of findings) counts[f.severity] += 1;

console.log('SPARKCONNECT — UI CONSISTENCY AUDIT');
console.log(`${FILES.length} files scanned\n`);

console.log('BY RULE');
console.log('───────');
for (const [rule, n] of Object.entries(byRule).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${rule}`);
}

console.log('\nWORST FILES');
console.log('───────────');
for (const [file, n] of Object.entries(byFile).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
  console.log(`  ${String(n).padStart(4)}  ${file}`);
}

const high = findings.filter((f) => f.severity === 'HIGH');
if (high.length) {
  console.log('\nHIGH — fix before release');
  console.log('─────────────────────────');
  for (const f of high.slice(0, 25)) {
    console.log(`  ${f.file}:${f.line}  ${f.detail}`);
  }
  if (high.length > 25) console.log(`  … and ${high.length - 25} more`);
}

console.log(`\n${counts.HIGH} high · ${counts.MEDIUM} medium · ${counts.LOW} low`);
console.log('\nThis reports; it does not rewrite. A codemod across every screen the night');
console.log('before a release is how you ship a layout bug nobody can see in a diff.');

// Only a tap target below the minimum is worth failing a build over.
process.exit(counts.HIGH > 0 ? 1 : 0);
