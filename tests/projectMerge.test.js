// ─── PROJECTS ABSORBS JOB CAM ────────────────────────────────────────────────
// One property matters more than every other test in this file: no photo is
// ever lost. A jobsite photo is unrecoverable evidence, and a user cannot tell
// that one is missing until they need it in an argument about a change order.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  mergeJobCamIntoProjects, convertPhoto, parseLegacy, legacyStoreIsFullyMigrated,
  migrationMessage, UNFILED_PROJECT_NAME, MIGRATION_SOURCE,
} from '../src/core/domain/projectMerge.js';
import { project as makeProject, ProjectTemplate } from '../src/core/domain/jobcam.js';
import {
  ArtifactKind, createArtifact, readPayload, attachArtifact, removeArtifact,
  saveToProject, projectOverview, projectTimeline, artifactsOfKind,
  MAX_PAYLOAD_CHARS, MAX_ARTIFACTS, KIND_LABEL,
} from '../src/core/domain/projectArtifacts.js';

// The exact shape JobCamScreen writes to AsyncStorage today.
const legacyProjects = [
  { id: '1710000000000', name: 'Starbucks Ybor', created: '3/9/2024' },
  { id: '1710500000000', name: 'Miller service call', created: '3/15/2024' },
];
const legacyPhotos = [
  { id: 'ph1', projectId: '1710000000000', uri: 'file://a.jpg', label: 'Panel', note: 'before', timestamp: 1710000001000 },
  { id: 'ph2', projectId: '1710000000000', uri: 'file://b.jpg', label: 'Rough-in', note: '', timestamp: 1710000002000 },
  { id: 'ph3', projectId: '1710500000000', uri: 'file://c.jpg', label: '', note: 'meter', timestamp: 1710500001000 },
];

const photosIn = (projects) => projects.flatMap((p) => p.photos ?? []);

// ─── The guarantee ───────────────────────────────────────────────────────────

test('every legacy photo survives the merge', () => {
  const { projects, report } = mergeJobCamIntoProjects([], legacyProjects, legacyPhotos);
  assert.equal(report.photosMigrated, 3);
  assert.equal(photosIn(projects).length, 3);
  for (const uri of ['file://a.jpg', 'file://b.jpg', 'file://c.jpg']) {
    assert.ok(photosIn(projects).some((p) => p.uri === uri), `${uri} was lost`);
  }
});

test('a photo whose project was deleted goes to Unfiled, never to nowhere', () => {
  const orphaned = [...legacyPhotos, {
    id: 'ph4', projectId: 'deleted-job', uri: 'file://orphan.jpg', label: 'x', timestamp: 1,
  }];
  const { projects, report } = mergeJobCamIntoProjects([], legacyProjects, orphaned);

  assert.equal(report.photosMigrated, 4, 'the orphan is migrated, not dropped');
  assert.equal(report.photosUnfiled, 1);
  const unfiled = projects.find((p) => p.name === UNFILED_PROJECT_NAME);
  assert.ok(unfiled, 'an Unfiled project is created to catch it');
  assert.ok(unfiled.photos.some((p) => p.uri === 'file://orphan.jpg'));
});

test('a photo with no projectId at all still lands somewhere', () => {
  const { projects, report } = mergeJobCamIntoProjects([], [], [
    { id: 'x', uri: 'file://loose.jpg', timestamp: 5 },
  ]);
  assert.equal(report.photosMigrated, 1);
  assert.ok(photosIn(projects).some((p) => p.uri === 'file://loose.jpg'));
});

test('running the migration twice changes nothing', () => {
  const first = mergeJobCamIntoProjects([], legacyProjects, legacyPhotos);
  const second = mergeJobCamIntoProjects(first.projects, legacyProjects, legacyPhotos);

  assert.equal(second.report.photosMigrated, 0);
  assert.equal(second.report.photosAlreadyPresent, 3);
  assert.equal(photosIn(second.projects).length, 3, 'no duplicates on a second run');
  assert.equal(second.projects.length, first.projects.length);
  assert.equal(second.report.nothingToDo, true);
});

test('a half-finished migration completes without duplicating what it already did', () => {
  // Simulates the app being killed after one photo was written.
  const partial = mergeJobCamIntoProjects([], legacyProjects, [legacyPhotos[0]]);
  const finished = mergeJobCamIntoProjects(partial.projects, legacyProjects, legacyPhotos);

  assert.equal(finished.report.photosMigrated, 2);
  assert.equal(finished.report.photosAlreadyPresent, 1);
  assert.equal(photosIn(finished.projects).length, 3);
});

test('a legacy job merges into an existing project of the same name', () => {
  const existing = [{ ...makeProject({ id: 'p1', name: 'Starbucks Ybor', createdAt: 1 }), photos: [] }];
  const { projects, report } = mergeJobCamIntoProjects(existing, legacyProjects, legacyPhotos);

  assert.equal(report.projectsMatched, 1, 'it recognised the same job');
  const starbucks = projects.filter((p) => p.name === 'Starbucks Ybor');
  assert.equal(starbucks.length, 1, 'no duplicate project was created');
  assert.equal(starbucks[0].photos.length, 2);
});

test('name matching ignores case and whitespace', () => {
  const existing = [{ ...makeProject({ id: 'p1', name: '  starbucks ybor ', createdAt: 1 }), photos: [] }];
  const { report } = mergeJobCamIntoProjects(existing, legacyProjects, legacyPhotos);
  assert.equal(report.projectsMatched, 1);
});

// ─── Malformed input cannot lose data ────────────────────────────────────────

test('corrupt storage does not throw and does not discard the rest', () => {
  assert.deepEqual(parseLegacy('{not json'), []);
  assert.deepEqual(parseLegacy(null), []);
  assert.deepEqual(parseLegacy(''), []);
  assert.deepEqual(parseLegacy('{"a":1}'), [], 'an object is not a list of projects');

  const { projects, report } = mergeJobCamIntoProjects([], '{corrupt', JSON.stringify(legacyPhotos));
  assert.equal(report.photosMigrated, 3, 'photos survive even when the project list is unreadable');
  assert.ok(projects.find((p) => p.name === UNFILED_PROJECT_NAME));
});

test('storage handed in as JSON strings works the same as arrays', () => {
  const { report } = mergeJobCamIntoProjects(
    [], JSON.stringify(legacyProjects), JSON.stringify(legacyPhotos));
  assert.equal(report.photosMigrated, 3);
});

test('a row with no image is counted, not silently ignored', () => {
  const { report } = mergeJobCamIntoProjects([], legacyProjects, [
    ...legacyPhotos, { id: 'bad', projectId: '1710000000000', label: 'no uri' },
  ]);
  assert.equal(report.photosWithoutImage, 1);
  assert.equal(report.photosMigrated, 3);
});

test('junk entries cannot crash the merge', () => {
  const { report } = mergeJobCamIntoProjects(
    [], [null, 42, { name: '' }, ...legacyProjects],
    [null, 'nope', { uri: 5 }, ...legacyPhotos],
  );
  assert.equal(report.photosMigrated, 3);
});

test('the label and note are preserved together, not one or the other', () => {
  const converted = convertPhoto({ id: 'p', uri: 'file://x.jpg', label: 'Panel', note: 'before drywall', timestamp: 10 });
  assert.match(converted.note, /Panel/);
  assert.match(converted.note, /before drywall/);
  assert.equal(converted.migratedFrom, MIGRATION_SOURCE);
});

test('legacy timestamps in either format survive', () => {
  assert.equal(convertPhoto({ uri: 'file://a', timestamp: 1710000000000 }).capturedAt, 1710000000000);
  assert.equal(convertPhoto({ uri: 'file://a', timestamp: '2024-03-09T00:00:00Z' }).capturedAt, Date.parse('2024-03-09T00:00:00Z'));
  assert.ok(Number.isFinite(convertPhoto({ uri: 'file://a' }, { now: 999 }).capturedAt));
});

// ─── The delete guard ────────────────────────────────────────────────────────

test('legacy storage may only be cleared once every photo is provably present', () => {
  const { projects } = mergeJobCamIntoProjects([], legacyProjects, legacyPhotos);
  assert.equal(legacyStoreIsFullyMigrated(projects, legacyPhotos), true);

  // One photo missing from the new store means it is NOT safe to delete.
  const missingOne = projects.map((p) => ({ ...p, photos: (p.photos ?? []).slice(1) }));
  assert.equal(legacyStoreIsFullyMigrated(missingOne, legacyPhotos), false,
    'deleting the source because a migration "looked fine" is how photos disappear');
  assert.equal(legacyStoreIsFullyMigrated([], legacyPhotos), false);
});

test('the user is told what happened', () => {
  const { report } = mergeJobCamIntoProjects([], legacyProjects, legacyPhotos);
  const msg = migrationMessage(report);
  assert.match(msg, /3 photos moved into Projects/);
  assert.equal(migrationMessage({ nothingToDo: true }), null, 'silence when nothing changed');
});

// ─── Artifacts ───────────────────────────────────────────────────────────────

test('an artifact is a frozen snapshot, not a live join', () => {
  const source = { volts: 240, drop: 3.1 };
  const art = createArtifact({
    kind: ArtifactKind.CALCULATION, title: 'Voltage drop — feeder',
    summary: '3.1% at 240V', payload: source,
  });
  source.drop = 99;   // the caller mutates their object afterwards
  assert.equal(readPayload(art).drop, 3.1,
    'the number in the March proposal must still read as the March number');
});

test('an unknown artifact kind is refused rather than stored untyped', () => {
  assert.equal(createArtifact({ kind: 'NONSENSE', title: 'x' }), null);
  assert.equal(createArtifact({}), null);
  const { artifact, reason } = saveToProject([], 'p1', { kind: 'NONSENSE' });
  assert.equal(artifact, null);
  assert.match(reason, /Unknown artifact kind/);
});

test('an oversized or unserialisable payload drops the payload, never the record', () => {
  const huge = createArtifact({
    kind: ArtifactKind.ESTIMATE, title: 'Big', summary: 'kept',
    payload: { blob: 'x'.repeat(MAX_PAYLOAD_CHARS + 100) },
  });
  assert.equal(huge.payload, null);
  assert.equal(huge.payloadDropped, true);
  assert.equal(huge.summary, 'kept', 'the human-readable part survives');

  const circular = {}; circular.self = circular;
  const cyc = createArtifact({ kind: ArtifactKind.NOTE, title: 'c', payload: circular });
  assert.equal(cyc.payloadDropped, true);
  assert.ok(cyc.id);
});

test('saving to a project that is gone reports it instead of throwing', () => {
  const { projects, artifact, reason } = saveToProject(
    [{ id: 'p1', artifacts: [] }], 'missing', { kind: ArtifactKind.NOTE, title: 'x' });
  assert.equal(artifact, null);
  assert.match(reason, /no longer exists/);
  assert.equal(projects.length, 1, 'nothing was changed');
});

test('save to project attaches without mutating the original', () => {
  const before = [{ id: 'p1', name: 'Job', artifacts: [], photos: [] }];
  const { projects, artifact } = saveToProject(before, 'p1', {
    kind: ArtifactKind.TAKEOFF, title: 'Sheet E-101', summary: '42 devices',
  });
  assert.equal(before[0].artifacts.length, 0, 'the input array is untouched');
  assert.equal(projects[0].artifacts.length, 1);
  assert.equal(projects[0].artifacts[0].id, artifact.id);
});

test('artifacts are capped so one project cannot blow up storage', () => {
  let proj = { id: 'p', artifacts: [], photos: [] };
  for (let i = 0; i < MAX_ARTIFACTS + 25; i++) {
    proj = attachArtifact(proj, createArtifact({ kind: ArtifactKind.NOTE, title: `n${i}` }));
  }
  assert.equal(proj.artifacts.length, MAX_ARTIFACTS);
  assert.equal(proj.artifacts[0].title, `n${MAX_ARTIFACTS + 24}`, 'newest kept');
});

test('the overview answers what a contractor opens a job to ask', () => {
  let proj = { id: 'p', name: 'Starbucks', artifacts: [], photos: [{ id: 'a', uri: 'x', capturedAt: 5 }] };
  proj = attachArtifact(proj, createArtifact({ kind: ArtifactKind.ESTIMATE, title: 'Bid', savedAt: 10 }));
  proj = attachArtifact(proj, createArtifact({
    kind: ArtifactKind.PERMIT, title: 'Permit', savedAt: 20,
    meta: { permitNumber: 'E-2024-118', ahj: 'Hillsborough County' },
  }));

  const o = projectOverview(proj);
  assert.equal(o.photos, 1);
  assert.equal(o.artifacts, 2);
  assert.equal(o.hasEstimate, true);
  assert.equal(o.hasTakeoff, false);
  assert.equal(o.permitNumber, 'E-2024-118');
  assert.equal(o.ahj, 'Hillsborough County');
  assert.equal(o.lastActivity, 20);
  // An estimate and a takeoff are two routes to the same place, so having one
  // must not nag for the other.
  assert.ok(!o.nextSteps.some((s) => /takeoff/i.test(s)), 'the estimate already covers that step');
  assert.ok(!o.nextSteps.some((s) => /permit/i.test(s)), 'and it does not prompt for what is done');
  assert.ok(o.nextSteps.some((s) => /inspection/i.test(s)), 'but it does prompt for what is missing');

  const bare = projectOverview({ id: 'p', artifacts: [], photos: [] });
  assert.ok(bare.nextSteps.some((s) => /takeoff|estimate/i.test(s)),
    'with neither, it asks for one');
});

test('an empty project prompts instead of sitting blank', () => {
  const steps = projectOverview({ id: 'p', artifacts: [], photos: [] }).nextSteps;
  assert.ok(steps.length >= 3);
  assert.ok(steps.some((s) => /first photo/i.test(s)));
});

test('the timeline interleaves photos and artifacts, newest first', () => {
  const proj = {
    id: 'p',
    photos: [{ id: 'ph', uri: 'x', capturedAt: 15, tags: ['PANEL'] }],
    artifacts: [
      createArtifact({ kind: ArtifactKind.NOTE, title: 'early', savedAt: 10 }),
      createArtifact({ kind: ArtifactKind.INSPECTION, title: 'late', savedAt: 20 }),
    ],
  };
  const rows = projectTimeline(proj);
  assert.deepEqual(rows.map((r) => r.at), [20, 15, 10]);
  assert.equal(rows[1].type, 'photo');
  assert.equal(rows[0].label, KIND_LABEL.INSPECTION);
});

test('removing an artifact leaves everything else alone', () => {
  let proj = { id: 'p', artifacts: [], photos: [] };
  const a = createArtifact({ kind: ArtifactKind.NOTE, title: 'keep' });
  const b = createArtifact({ kind: ArtifactKind.NOTE, title: 'drop' });
  proj = attachArtifact(attachArtifact(proj, a), b);
  proj = removeArtifact(proj, b.id);
  assert.equal(proj.artifacts.length, 1);
  assert.equal(proj.artifacts[0].title, 'keep');
  assert.equal(artifactsOfKind(proj, ArtifactKind.NOTE).length, 1);
});

test('every artifact kind has a label and an icon', () => {
  for (const kind of Object.values(ArtifactKind)) {
    assert.ok(KIND_LABEL[kind], `${kind} has no label`);
    const art = createArtifact({ kind, title: 't' });
    assert.ok(art, `${kind} could not be created`);
    assert.equal(art.kind, kind);
  }
});
