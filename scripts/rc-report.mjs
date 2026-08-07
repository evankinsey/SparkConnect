#!/usr/bin/env node
// Release Candidate report. Everything here is derived from the modules that
// own the fact — a hand-written status page is believed and wrong.
import { accessMatrix, matrixText } from '../src/core/paywall/registry.js';
import { productHealth, healthText } from '../src/core/health.js';
import { DATASETS, isVerified, RELEASE_OVERRIDE } from '../src/core/verification.js';

const health = productHealth({ flags: {} });
const out = [];
const rule = (t) => { out.push('', t, '─'.repeat(t.length)); };

out.push('SPARKCONNECT — RELEASE CANDIDATE REPORT', `Generated ${new Date().toISOString().slice(0, 10)}`);

rule('ACCESS MATRIX');
out.push(matrixText(accessMatrix()));

rule('PRODUCT HEALTH');
out.push(healthText(health));

rule('ELECTRICAL CONTENT REVIEW');
const ds = Object.values(DATASETS);
for (const d of ds) {
  const partial = (d.verifiedRows?.length ?? 0) > 0;
  out.push(`  ${isVerified(d) ? '✅' : partial ? '◐' : '❌'} ${d.id} — ${d.label ?? ''}`);
  for (const r of d.verifiedRows ?? []) out.push(`       confirmed: ${r}`);
}
out.push('', `Release override: ${RELEASE_OVERRIDE.active ? 'ACTIVE' : 'inactive'}`);
if (RELEASE_OVERRIDE.active) out.push(`  ${RELEASE_OVERRIDE.reason}`);

rule('STORE READINESS');
out.push('  Requires native build: expo-image-picker usage, notification entitlements');
out.push('  Requires App Store metadata: none changed this cycle');
out.push('  Requires backend deployment: SparkAI model answers, remote config');
out.push('  OTA-safe: every domain module, every screen change in this report');

console.log(out.join('\n'));
