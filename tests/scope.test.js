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
  'src/circuit/guided.js',
  'src/circuit/inspect.js',
  'src/core/training/generated.js',
  'src/core/game/packs.js',
  'src/screens/topdownArt.js',
  'src/core/game/topdown.js',
  'src/core/game/fieldTasks.js',
  'src/core/paywall/entitlements.js',
  'src/screens/FieldTaskScreen.js',
  'src/core/field/permits.js',
  'src/core/field/takeoff.js',
  'src/screens/PermitScreen.js',
  'src/screens/BlueprintScreen.js',
  'src/screens/PanelScheduleScreen.js',
  'src/screens/ContractorConnectScreen.js',
  'src/core/field/assemblies.js',
  'src/core/field/panelSchedule.js',
  'src/core/field/priceBook.js',
  'src/core/growth/referrals.js',
  'src/core/learn/curriculum.js',
  'src/core/home/pulse.js',
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

// ─── Nested PII (regression) ─────────────────────────────────────────────────
// The flat `customerName` allowlist was correct while every caller flattened
// its payload. A project record carries `customer: { name, phone, email }` and
// a daily log carries `crew: [{ name }]` — inner keys that matched nothing, so
// the whole branch survived stripping. Containers are named now.

test('a nested customer record does not survive stripping', async () => {
  const { stripIdentifying } = await import('../src/core/ai/context.js');
  const stripped = stripIdentifying({
    id: 'p1',
    name: 'Reyes panel upgrade',
    address: '14 Mill Road',
    customer: { name: 'Ana Reyes', phone: '555-0100', email: 'ana@example.com' },
    loadVa: 2400,
  });
  assert.equal(stripped.customer, undefined, 'the customer subtree must not reach a model');
  assert.equal(stripped.address, undefined);
  assert.equal(stripped.loadVa, 2400, 'the electrical facts must survive');
  assert.equal(stripped.name, 'Reyes panel upgrade', 'the job name is not identifying on its own');
});

test('crew names in a daily log do not survive stripping', async () => {
  const { stripIdentifying } = await import('../src/core/ai/context.js');
  const stripped = stripIdentifying({
    date: '2026-03-02',
    crew: [{ name: 'Evan', role: 'JW', minutes: 480 }],
    authorName: 'Evan',
    visitors: 'Inspector walked the rough',
    workPerformed: 'Set panel',
  });
  assert.equal(stripped.crew, undefined);
  assert.equal(stripped.authorName, undefined);
  assert.equal(stripped.visitors, undefined);
  assert.equal(stripped.date, '2026-03-02');
});

test('every identifying key in the project shapes is covered', async () => {
  const { stripIdentifying } = await import('../src/core/ai/context.js');
  const { hydrate, setCustomer, setAddress } = await import('../src/core/domain/projectHub.js');
  const { project } = await import('../src/core/domain/jobcam.js');

  let p = hydrate(project({ id: 'p1', name: 'Job', template: 'CUSTOM', createdAt: '2026-01-01T00:00:00Z' }));
  p = setCustomer(p, { name: 'Ana Reyes', phone: '555-0100', email: 'ana@example.com', company: 'Reyes LLC' });
  p = setAddress(p, '14 Mill Road');

  const json = JSON.stringify(stripIdentifying(p));
  for (const secret of ['Ana Reyes', '555-0100', 'ana@example.com', 'Reyes LLC', '14 Mill Road']) {
    assert.ok(!json.includes(secret), `"${secret}" reached the model payload`);
  }
});

// ─── Conditional hooks ───────────────────────────────────────────────────────
// Build 36 crashed the moment onboarding finished, on the paywall, and the
// paywall had nothing to do with it.
//
// App returns early for the splash screen and again for onboarding. A
// React.useMemo written below those returns runs on some renders and not
// others: during onboarding the component returns before reaching it, then the
// render after onboarding completes reaches it, the hook count changes between
// two renders of the same component, and React throws inside App's own render.
//
// It is invisible in review — the hook sits right next to the code that uses
// it, which is where you would put it — and invisible in tests, because no
// test renders App. It is trivial to see from the source, so this sees it.

test('no React hook is called after an early return in App', () => {
  const src = readFileSync(new URL('../App.js', import.meta.url), 'utf8');
  const lines = src.split('\n');

  // The main component: the last top-level `export default function App(` or
  // the component that owns the splash/onboarding early returns.
  const start = lines.findIndex((l) => /^\s{2}if \(!splashDone\) \{/.test(l));
  assert.ok(start > 0, 'the splash early return moved — check what replaced it');

  const offenders = [];
  for (let i = start; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*(\/\/|\*)/.test(l.trim())) continue;
    const m = l.match(/\b(?:React\.)?(use[A-Z][A-Za-z]*)\s*\(/);
    // useRef/useState inside a nested component defined later in the file are
    // fine; only the top-level indentation of App's own body counts.
    if (m && /^ {2}(?:const|let|var)?\s*/.test(l) && /^ {2}\S/.test(l)) {
      offenders.push(`${i + 1}: ${l.trim().slice(0, 90)}`);
    }
  }
  assert.deepEqual(offenders, [],
    `hook(s) called after App's early returns — these run conditionally and React will throw when the branch flips:\n  ${offenders.join('\n  ')}`);
});
