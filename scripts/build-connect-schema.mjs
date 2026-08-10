#!/usr/bin/env node
// ─── GENERATE THE MARKETPLACE MIGRATION ──────────────────────────────────────
// One declaration in src/core/connect/schema.js, one committed .sql, and a
// --check mode that fails CI when they diverge.
//
// The failure this prevents: somebody adds a column in the app's model, forgets
// the migration, and the mismatch surfaces as a runtime error on a device. Or
// worse — somebody adds a table to the SQL by hand, forgets a policy, and ships
// a table that the public anon key can read in full.
//
//   npm run connect:schema         write the migration
//   npm run connect:schema:check   fail if the committed file is stale

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const { toSql, SCHEMA } = await import('../src/core/connect/schema.js');

const OUT = resolve(process.cwd(), 'supabase/migrations/0001_contractor_connect.sql');
const check = process.argv.includes('--check');
const sql = toSql();

// A table with RLS off, or a table whose only protection is that nobody has
// written a query for it yet, is the whole risk of this feature. Refuse to
// generate rather than emit it.
const tablesWithoutRls = SCHEMA.filter(
  (t) => !new RegExp(`alter table public\\.${t.name} enable row level security;`).test(sql),
);
if (tablesWithoutRls.length) {
  console.error(`RLS missing on: ${tablesWithoutRls.map((t) => t.name).join(', ')}`);
  process.exit(1);
}

if (check) {
  if (!existsSync(OUT)) {
    console.error(`Missing ${OUT}. Run: npm run connect:schema`);
    process.exit(1);
  }
  if (readFileSync(OUT, 'utf8') !== sql) {
    console.error('supabase/migrations/0001_contractor_connect.sql is stale.');
    console.error('The schema declaration changed. Run: npm run connect:schema');
    process.exit(1);
  }
  console.log(`Migration matches the declaration — ${SCHEMA.length} tables, RLS on all of them.`);
  process.exit(0);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, sql);
console.log(`Wrote ${OUT} — ${SCHEMA.length} tables, RLS on all of them.`);
