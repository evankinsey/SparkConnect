#!/usr/bin/env node
// Reports the state of every key the app needs. See docs/v1.1/KEYS-SETUP.md
//   npm run config:check              both platforms
//   npm run config:check -- android   one platform

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateConfig, formatConfigReport } from '../src/core/config/validate.js';

const HERE = dirname(fileURLToPath(import.meta.url));

// keys.js is a React Native module, so it is parsed rather than imported — this
// script must run under plain Node with no bundler.
const readKeys = () => {
  const out = {};
  try {
    const src = readFileSync(join(HERE, '..', 'src', 'config', 'keys.js'), 'utf8');
    for (const m of src.matchAll(/export\s+const\s+(\w+)\s*=\s*['"]([^'"]*)['"]/g)) {
      out[m[1]] = m[2];
    }
  } catch {
    console.error('  Could not read src/config/keys.js\n');
  }
  return out;
};

const keys = readKeys();
const platforms = process.argv[2] ? [process.argv[2]] : ['ios', 'android'];
let failed = false;

console.log('');
for (const platform of platforms) {
  const result = validateConfig(keys, { platform });
  console.log(formatConfigReport(result, { platform }));
  console.log('');
  if (!result.ok) failed = true;
}

if (failed) {
  console.log('  Fix: docs/v1.1/KEYS-SETUP.md\n');
  process.exit(1);
}
