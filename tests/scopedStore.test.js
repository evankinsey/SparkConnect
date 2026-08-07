// ─── SCOPED STORE TESTS ──────────────────────────────────────────────────────
// This migration runs against data a user has right now — a material list they
// typed on site. The only guarantee that matters is that it is still there
// afterwards, and that it was not filed under a job it does not belong to.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  readScoped, writeScoped, recordFor, upsertRecord, removeRecord,
  attachUnfiled, allRecords, UNFILED, SCOPED_VERSION, LegacyAdapters,
} from '../src/core/domain/scopedStore.js';

// The same adapter the screens use. Testing a copy would prove nothing about
// what ships.
const materialsLegacy = LegacyAdapters.materials;

// ─── The migration ───────────────────────────────────────────────────────────

test('an existing single-blob save survives, as the unfiled record', () => {
  const legacy = JSON.stringify({ items: [{ name: '1/2 EMT', qty: 60 }], waste: 10 });
  const { records, migrated } = readScoped(legacy, { legacyToRecord: materialsLegacy });

  assert.equal(migrated, true);
  assert.equal(records.length, 1);
  assert.equal(records[0].projectId, UNFILED, 'it must not be filed under a job nobody chose');
  assert.deepEqual(records[0].items, [{ name: '1/2 EMT', qty: 60 }]);
  assert.equal(records[0].waste, 10);
});

test('migrating twice does not duplicate or lose the record', () => {
  const legacy = JSON.stringify({ items: [{ name: '#12 THHN', qty: 500 }], waste: 0 });
  const first = readScoped(legacy, { legacyToRecord: materialsLegacy });
  const written = writeScoped(first.records);
  const second = readScoped(written, { legacyToRecord: materialsLegacy });

  assert.equal(second.migrated, false, 'already-scoped data is not re-migrated');
  assert.equal(second.records.length, 1);
  assert.deepEqual(second.records[0].items, first.records[0].items);
});

test('an empty or corrupt store is empty, not a crash', () => {
  for (const raw of [null, undefined, '', 'not json', '{', '[[[']) {
    const { records } = readScoped(raw, { legacyToRecord: materialsLegacy });
    assert.deepEqual(records, [], `failed on ${JSON.stringify(raw)}`);
  }
});

test('a legacy blob with nothing worth keeping migrates to nothing', () => {
  const { records, migrated } = readScoped(JSON.stringify({ items: [] }), { legacyToRecord: materialsLegacy });
  assert.deepEqual(records, []);
  assert.equal(migrated, false);
});

test('a record missing a projectId reads as unfiled rather than being dropped', () => {
  const raw = JSON.stringify({ version: SCOPED_VERSION, records: [{ items: [1] }, 'junk', null, { projectId: 'p1', items: [2] }] });
  const { records } = readScoped(raw);
  assert.equal(records.length, 2, 'non-objects are dropped, real records are not');
  assert.equal(records[0].projectId, UNFILED);
  assert.equal(records[1].projectId, 'p1');
});

// ─── One record per job ──────────────────────────────────────────────────────

test('upsert replaces rather than appends', () => {
  let records = upsertRecord([], 'p1', { items: [1] });
  records = upsertRecord(records, 'p1', { items: [1, 2] });
  assert.equal(records.length, 1, 'a job has one list, not a pile of them');
  assert.deepEqual(records[0].items, [1, 2]);

  records = upsertRecord(records, 'p2', { items: [9] });
  assert.equal(records.length, 2);
  assert.deepEqual(recordFor(records, 'p1').items, [1, 2], 'p2 must not disturb p1');
  assert.deepEqual(recordFor(records, 'p2').items, [9]);
});

test('the unfiled scope behaves like any other', () => {
  let records = upsertRecord([], UNFILED, { items: ['unfiled'] });
  records = upsertRecord(records, 'p1', { items: ['job'] });
  assert.deepEqual(recordFor(records, UNFILED).items, ['unfiled']);
  assert.deepEqual(recordFor(records, null).items, ['unfiled']);
  assert.deepEqual(recordFor(records, '').items, ['unfiled'], 'an empty id is unfiled, not a job called ""');
  assert.equal(recordFor(records, 'nope'), null);
});

test('removing one job leaves the others alone', () => {
  let records = upsertRecord(upsertRecord([], 'p1', { a: 1 }), 'p2', { a: 2 });
  records = removeRecord(records, 'p1');
  assert.equal(records.length, 1);
  assert.equal(records[0].projectId, 'p2');
});

// ─── Attaching unfiled work ──────────────────────────────────────────────────

test('unfiled work can be attached to a real job', () => {
  const records = upsertRecord([], UNFILED, { items: ['60 ft EMT'] });
  const out = attachUnfiled(records, 'p1');
  assert.equal(out.ok, true);
  assert.equal(out.records.length, 1);
  assert.equal(out.records[0].projectId, 'p1');
  assert.deepEqual(out.records[0].items, ['60 ft EMT']);
  assert.equal(recordFor(out.records, UNFILED), null, 'it moved, it was not copied');
});

test('attaching refuses rather than overwriting a job that already has one', () => {
  let records = upsertRecord([], UNFILED, { items: ['unfiled'] });
  records = upsertRecord(records, 'p1', { items: ['already here'] });

  const out = attachUnfiled(records, 'p1');
  assert.equal(out.ok, false, 'merging two lists silently loses one of them');
  assert.match(out.reason, /already has one/);
  assert.deepEqual(out.records, records, 'nothing changed');
  assert.deepEqual(recordFor(records, 'p1').items, ['already here']);
});

test('attaching with nothing unfiled, or no job, says so', () => {
  assert.equal(attachUnfiled([], 'p1').ok, false);
  assert.match(attachUnfiled([], 'p1').reason, /nothing unfiled/);
  const records = upsertRecord([], UNFILED, { items: [1] });
  assert.equal(attachUnfiled(records, null).ok, false);
  assert.match(attachUnfiled(records, '').reason, /No project selected/);
});

// ─── Round trip ──────────────────────────────────────────────────────────────

test('what is written is what comes back', () => {
  const records = upsertRecord(upsertRecord([], 'p1', { items: [1], waste: 5 }), UNFILED, { items: [2] });
  const back = readScoped(writeScoped(records)).records;
  assert.equal(back.length, 2);
  assert.deepEqual(recordFor(back, 'p1').items, [1]);
  assert.equal(recordFor(back, 'p1').waste, 5);
  assert.deepEqual(recordFor(back, UNFILED).items, [2]);
  assert.equal(allRecords(back).length, 2);
});

test('the hub can read every record by projectId', () => {
  // The shape the project hub consumes: a flat list with projectId on each.
  const records = upsertRecord(upsertRecord([], 'p1', { items: [1, 2, 3] }), 'p2', { items: [4] });
  const mine = records.filter((r) => r.projectId === 'p1');
  assert.equal(mine.length, 1);
  assert.equal(mine[0].items.length, 3);
});

test('the shared adapters agree about what is worth keeping', () => {
  assert.equal(LegacyAdapters.materials({ items: [] }), null, 'an empty list is not a list');
  assert.equal(LegacyAdapters.materials({}), null);
  assert.equal(LegacyAdapters.materials(null), null);
  assert.deepEqual(LegacyAdapters.materials({ items: [1] }), { items: [1], waste: 0 });
  assert.equal(LegacyAdapters.materials({ items: [1], waste: 7 }).waste, 7);

  assert.equal(LegacyAdapters.panel({}), null, 'a panel with no size was never saved');
  assert.equal(LegacyAdapters.panel(null), null);
  assert.equal(LegacyAdapters.panel('nope'), null);
  assert.equal(LegacyAdapters.panel({ size: 42, circuits: [] }).size, 42);
});
