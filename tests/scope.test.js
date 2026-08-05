// ─── SCOPE GUARD ─────────────────────────────────────────────────────────────
// The launch crash that killed builds 6-13 was invisible to every other check:
// a Snack export dropped two closing braces in App.js, ~1,400 lines of
// components slid inside a catch block, and the file STILL PARSED because two
// stray closers at the bottom re-balanced it. Metro bundled it, Hermes compiled
// it, 232 tests passed - and the first render on a phone died with
// "ReferenceError: Property 'SplashScreen' doesn't exist".
//
// This test is the guard for that entire class of bug: it walks every
// identifier reference in the launch-critical files and fails if any of them
// resolves to no binding - i.e. if any component, style sheet, or helper has
// slipped out of the scope its call sites can see.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const parser = require(join(root, 'node_modules/@babel/parser'));
const traverse = require(join(root, 'node_modules/@babel/traverse')).default;

// Values the runtime provides that no module declares.
const RUNTIME_GLOBALS = new Set([
  '__DEV__', 'global', 'globalThis', 'require', 'module', 'exports',
  'console', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'setImmediate', 'clearImmediate', 'queueMicrotask', 'fetch', 'alert',
  'Promise', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Math', 'JSON',
  'Date', 'RegExp', 'Error', 'TypeError', 'RangeError', 'SyntaxError',
  'ReferenceError', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Symbol', 'Proxy',
  'Reflect', 'Infinity', 'NaN', 'undefined', 'isNaN', 'isFinite', 'parseInt',
  'parseFloat', 'encodeURIComponent', 'decodeURIComponent', 'encodeURI',
  'decodeURI', 'Intl', 'AbortController', 'FormData', 'URL', 'URLSearchParams',
  'TextEncoder', 'TextDecoder', 'atob', 'btoa', 'structuredClone',
  'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'navigator',
  'AggregateError', 'BigInt', 'ArrayBuffer', 'DataView', 'Uint8Array',
  'Int8Array', 'Uint16Array', 'Int16Array', 'Uint32Array', 'Int32Array',
  'Float32Array', 'Float64Array', 'arguments', 'XMLHttpRequest', 'Blob',
  'FileReader', 'WebSocket', 'crypto',
]);

const FILES = [
  'App.js',
  'index.js',
  'src/ErrorBoundary.js',
  'src/ErrorScreen.js',
  'src/errorTrap.js',
  'src/SparkPaywall.js',
  'src/dailyNotifications.js',
  'src/screens/WiringLabScreen.js',
  'src/screens/TroubleshootScreen.js',
  'src/screens/CircuitCanvas.js',
  'src/screens/JobsiteScreen.js',
  'src/screens/castImages.js',
  'src/screens/FlashcardsScreen.js',
  'src/screens/HomeCards.js',
  'src/screens/ProjectsScreen.js',
  'src/screens/MaterialsScreen.js',
  'src/screens/CommunityScreen.js',
];

function unresolvedReferences(file) {
  const src = readFileSync(join(root, file), 'utf8');
  const ast = parser.parse(src, { sourceType: 'module', plugins: ['jsx'] });
  const bad = [];
  traverse(ast, {
    ReferencedIdentifier(path) {
      const { name } = path.node;
      if (RUNTIME_GLOBALS.has(name)) return;
      if (path.scope.hasBinding(name, /* noGlobals */ true)) return;
      // JSX member roots and import-created bindings are covered by
      // hasBinding; anything left is a genuine dangling reference.
      bad.push(`${name} at ${file}:${path.node.loc.start.line}`);
    },
  });
  return bad;
}

for (const file of FILES) {
  test(`every identifier in ${file} resolves to a binding`, () => {
    const bad = unresolvedReferences(file);
    assert.deepEqual(
      bad.slice(0, 20),
      [],
      `Dangling references (component defined in the wrong scope?):\n  ${bad.join('\n  ')}`,
    );
  });
}
