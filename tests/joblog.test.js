// ─── THE VISUAL JOB LOG ──────────────────────────────────────────────────────
// The screen has to answer "what did I photograph on this job?" — and the
// checklist has to know the difference between a photo you can still take and
// one the building already buried.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  Stage, STAGES, stageById, stagesForProject, STAGES_FOR_TEMPLATE,
  Coverage, documentationChecklist,
  recentPhotos, photoLabel, whenLabel, projectCard,
  CAPTURE_TAGS, captureDraft, captureBlocker, captureToPhoto,
  showExplainer, EXPLAINER, EXPLAINER_RETIRES_AFTER,
} from '../src/core/domain/jobLog.js';
import { PhotoTag } from '../src/core/domain/jobcam.js';

const pic = (tags, capturedAt, extra = {}) => ({
  id: `p${capturedAt}`, uri: `file://${capturedAt}.jpg`, capturedAt, tags, note: '', ...extra,
});

test('stages are ordered the way a building buries them', () => {
  const orders = STAGES.map((s) => s.order);
  assert.deepEqual([...orders].sort((a, b) => a - b), orders, 'stages are out of order');
  assert.equal(STAGES[0].id, Stage.UNDERGROUND, 'underground is buried first');
  // Every stage that can be buried says what buries it — that sentence is the
  // whole argument for taking the photo now.
  for (const s of STAGES) {
    assert.ok(s.why, `${s.id} never says why it matters`);
    if (s.order <= 4) assert.ok(s.buriedBy, `${s.id} does not say what covers it`);
  }
});

test('a job is never nagged about a stage it does not have', () => {
  // A service call has no underground and no rough-in.
  const service = stagesForProject({ template: 'SERVICE_CALL' }).map((s) => s.id);
  assert.ok(!service.includes(Stage.UNDERGROUND));
  assert.ok(!service.includes(Stage.ROUGH_IN));
  assert.ok(service.includes(Stage.PANEL));

  const build = stagesForProject({ template: 'NEW_CONSTRUCTION' }).map((s) => s.id);
  assert.ok(build.includes(Stage.UNDERGROUND));

  // An unknown template still produces a working checklist.
  assert.ok(stagesForProject({ template: 'NOPE' }).length > 0);
  assert.ok(stagesForProject(null).length > 0);
});

test('a missed stage is separated from one you can still shoot', () => {
  // THE POINT. Telling somebody to photograph the underground on a job that has
  // drywall up is advice they cannot take, and an app that keeps nagging about
  // impossible things gets muted.
  const proj = {
    template: 'NEW_CONSTRUCTION',
    photos: [
      // Rough-in shot, underground never was. The job has moved past underground.
      pic([PhotoTag.ROUGH_IN], '2026-08-01T10:00:00Z'),
    ],
  };
  const c = documentationChecklist(proj);
  const byId = Object.fromEntries(c.rows.map((r) => [r.id, r]));

  assert.equal(byId[Stage.UNDERGROUND].state, Coverage.MISSED, 'underground is still being demanded');
  assert.equal(byId[Stage.ROUGH_IN].state, Coverage.DONE);
  assert.equal(byId[Stage.ABOVE_CEILING].state, Coverage.URGENT, 'the next stage is not being pushed');
  assert.equal(byId[Stage.FINAL].state, Coverage.AHEAD);

  assert.ok(c.missed.some((r) => r.id === Stage.UNDERGROUND));
  assert.ok(c.urgent.length > 0);
});

test('the nudge is about what can still be done, never a scolding', () => {
  const proj = { template: 'NEW_CONSTRUCTION', photos: [pic([PhotoTag.ROUGH_IN], '2026-08-01T10:00:00Z')] };
  const c = documentationChecklist(proj);
  assert.match(c.nudge, /before it is covered/i);
  // The missed one is recorded but not thrown at them a second time.
  assert.doesNotMatch(c.nudge, /underground/i);
  assert.doesNotMatch(c.nudge, /should have|you failed|too late/i);
});

test('a job with nothing shot yet has missed nothing', () => {
  const c = documentationChecklist({ template: 'NEW_CONSTRUCTION', photos: [] });
  assert.equal(c.missed.length, 0, 'a job that has not started cannot have missed a stage');
  assert.equal(c.doneCount, 0);
  assert.equal(c.percent, 0);
  assert.ok(c.urgent.length > 0, 'nothing is being suggested to somebody at the start');
});

test('a fully documented job says so instead of finding fault', () => {
  const photos = stagesForProject({ template: 'SERVICE_CALL' })
    .map((s, i) => pic([s.tag], `2026-08-0${i + 1}T10:00:00Z`));
  const c = documentationChecklist({ template: 'SERVICE_CALL', photos });
  assert.equal(c.percent, 100);
  assert.match(c.nudge, /Every stage on this job is documented/);
});

test('junk input never produces a broken checklist', () => {
  for (const bad of [null, undefined, {}, { photos: null }, { photos: [{}] }]) {
    const c = documentationChecklist(bad);
    assert.ok(c.rows.length > 0);
    assert.ok(c.percent >= 0 && c.percent <= 100);
  }
});

// ─── The camera roll ─────────────────────────────────────────────────────────

test('recent photos come from every project, newest first, carrying the job name', () => {
  // A bare thumbnail grid is unreadable. "ROUGH-IN · Westview Office" is not.
  const feed = recentPhotos([
    { id: 'a', name: 'Westview Office', photos: [pic([PhotoTag.ROUGH_IN], '2026-08-09T14:00:00Z')] },
    { id: 'b', name: 'Riverside', photos: [pic([PhotoTag.PANEL], '2026-08-09T15:00:00Z')] },
  ]);
  assert.equal(feed.length, 2);
  assert.equal(feed[0].projectName, 'Riverside', 'not sorted newest first');
  assert.equal(feed[0].label, 'PANEL');
  assert.equal(feed[1].label, 'ROUGH-IN');
  for (const p of feed) assert.ok(p.projectName && p.uri);
});

test('a photo with no file is never put in the grid', () => {
  const feed = recentPhotos([{ id: 'a', name: 'X', photos: [{ id: 'p1', tags: [] }] }]);
  assert.equal(feed.length, 0, 'a thumbnail with no image is an empty box');
  assert.deepEqual([...recentPhotos(null)], []);
  assert.deepEqual([...recentPhotos([], 5)], []);
});

test('an untagged photo says so rather than pretending', () => {
  assert.equal(photoLabel({ tags: [] }), 'UNTAGGED');
  assert.equal(photoLabel({ tags: [PhotoTag.PANEL] }), 'PANEL');
  assert.equal(photoLabel(null), 'UNTAGGED');
});

test('captions read like speech, not timestamps', () => {
  const now = new Date('2026-08-09T15:00:00Z');
  assert.equal(whenLabel('2026-08-08T10:00:00Z', now), 'Yesterday');
  assert.match(whenLabel('2026-08-05T10:00:00Z', now), /day$/i);
  assert.equal(whenLabel(null, now), '');
  assert.equal(whenLabel('nonsense', now), '');
});

test('a project card leads with a photo, and an empty one says what to shoot', () => {
  const card = projectCard({
    id: 'a', name: 'Westview', address: 'Tampa, FL',
    photos: [pic([], '2026-08-01T10:00:00Z'), pic([], '2026-08-09T10:00:00Z')],
  });
  assert.ok(card.cover, 'a project card with no cover is a row of text');
  assert.equal(card.photoCount, 2);
  assert.equal(card.emptyNote, null);

  // Pinned wins over most recent.
  const pinnedCard = projectCard({
    id: 'b', name: 'X',
    photos: [pic([], '2026-08-01T10:00:00Z', { pinned: true }), pic([], '2026-08-09T10:00:00Z')],
  });
  assert.match(pinnedCard.cover, /2026-08-01/);

  const empty = projectCard({ id: 'c', name: 'New job', photos: [] });
  assert.equal(empty.cover, null);
  assert.match(empty.emptyNote, /No photos yet/);
});

// ─── Capture ─────────────────────────────────────────────────────────────────

test('the tag list is thumb-sized, not a taxonomy', () => {
  assert.ok(CAPTURE_TAGS.length <= 8, 'too many choices for a crawlspace');
  for (const t of CAPTURE_TAGS) assert.ok(t.label && t.id);
});

test('a photo cannot be saved without a project to find it in', () => {
  assert.match(captureBlocker(captureDraft({ uri: 'file://a.jpg' })), /Pick a project/);
  assert.match(captureBlocker(captureDraft({})), /No photo/);
  assert.equal(captureBlocker(captureDraft({ uri: 'file://a.jpg', projectId: 'p1' })), null);
  assert.equal(captureToPhoto(captureDraft({ uri: 'file://a.jpg' })), null);
});

test('asking the AI about somebody else\'s panel is opt-in', () => {
  // A photo of a customer's panel is theirs. Sending it anywhere is a thing
  // somebody chooses, not a default they fail to notice.
  assert.equal(captureDraft({ uri: 'x' }).askAi, false);
  assert.equal(captureDraft({ uri: 'x', askAi: true }).askAi, true);
});

test('a capture tag lands as a real tag, never as a guess', () => {
  // suggestedTags exists for machine guesses and must stay separate from what
  // the user actually said.
  const p = captureToPhoto(captureDraft({
    uri: 'file://a.jpg', projectId: 'p1', tagId: Stage.PANEL, area: 'Electrical Room', note: '200A main',
  }));
  assert.deepEqual(p.tags, [PhotoTag.PANEL]);
  assert.match(p.note, /Electrical Room/);
  assert.match(p.note, /200A main/);
  assert.equal(p.suggestedTags, undefined, 'a user tag must not be written as a suggestion');

  // "Other" is a real answer and produces no tag rather than a wrong one.
  const other = captureToPhoto(captureDraft({ uri: 'file://a.jpg', projectId: 'p1', tagId: 'OTHER' }));
  assert.deepEqual(other.tags, []);
});

test('the explainer retires once somebody has used the feature', () => {
  // Onboarding copy that never leaves is a permanent tax on the people who use
  // a feature most.
  assert.equal(showExplainer([]), true);
  assert.equal(showExplainer([{ photos: [1, 2] }]), true);
  assert.equal(showExplainer([{ photos: new Array(EXPLAINER_RETIRES_AFTER).fill(1) }]), false);
  assert.equal(showExplainer([{ photos: [1] }, { photos: [1, 2] }]), false, 'counts across projects');
  assert.match(EXPLAINER.sub, /before it gets covered/i);
});
