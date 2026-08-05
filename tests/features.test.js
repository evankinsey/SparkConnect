// ─── FEATURE LAYER TESTS ─────────────────────────────────────────────────────
// Troubleshooting, daily challenge, flashcards, Job Cam, assets, materials, community.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SCENARIOS, buildScenario, scenarioIds, answerScenario, deriveSymptom,
  injectFault, FaultKind, scenariosByLesson,
} from '../src/core/training/troubleshooting.js';
import {
  dailyChallenge, formatForDate, ChallengeFormat, answerDailyChallenge,
  upcomingChallenges, beatTheApprentice, scoreBeatTheApprentice,
  BREAKER_CHALLENGES, WIRE_SIZE_CHALLENGES, BEND_CHALLENGES, SPOT_THE_MISTAKE, PRICING_PROMPTS,
} from '../src/core/challenges/daily.js';
import {
  card, review, Grade, isDue, buildSession, accuracyByCategory,
  weakestTopics, missedQueue, deckStats, dailyStudyPlan, START_EASE, MIN_EASE,
} from '../src/core/training/flashcards.js';
import {
  project, photo, ProjectTemplate, PhotoTag, addPhoto, tagPhoto, acceptSuggestedTag,
  beforeAfterPairs, findPhotos, projectStats, toSearchRecords, TEMPLATES,
} from '../src/core/domain/jobcam.js';
import {
  tool, vehicle, insuranceManifest, toolsMissingFromVehicle,
  warrantyFromTerm, warrantyStatus, expiringWarranties,
  maintenanceReminder, completeMaintenance, dueMaintenance, followUpWorklist,
  MaintenanceKind, dayGap, addMonths,
} from '../src/core/domain/assets.js';
import {
  materialListFromDocument, applyPackaging, togglePurchased, listProgress,
  toSupplierText, createPriceCatalogue, priceList,
} from '../src/core/domain/materials.js';
import {
  thread, answer, addAnswer, acceptAnswer, flagAnswer, lockThread, rankedAnswers,
  ThreadStatus, ThreadCategory, threadNeedsRegion, COMMUNITY_SAFETY_BANNER, FLAG_THRESHOLD,
  jobPost, canPublish, publishJob, searchJobs, payStats, JobStatus, JobType,
  ExperienceLevel, MIN_SAMPLE_FOR_PAY_STATS,
} from '../src/core/community/index.js';
import { createInvoice } from '../src/core/domain/documents.js';
import { lineItem, LineItemKind } from '../src/core/domain/money.js';
import { solutionCircuit } from '../src/circuit/lessons/index.js';
import { lessonById } from '../src/circuit/lessons/index.js';

// ═══ TROUBLESHOOTING ═════════════════════════════════════════════════════════

test('every scenario builds and its symptom is derived from the engine', () => {
  for (const id of scenarioIds()) {
    const b = buildScenario(id);
    assert.ok(b, `${id} must build`);
    assert.ok(b.symptom.summary.length > 10, `${id} needs a symptom`);
    assert.ok(b.faultedCircuit.conductors, `${id} needs a faulted circuit`);
  }
  assert.equal(SCENARIOS.length, 6);
});

test('the healthy circuit behaves differently from the faulted one', () => {
  for (const id of scenarioIds()) {
    const b = buildScenario(id);
    const healthy = deriveSymptom(b.healthyCircuit);
    const faulted = b.symptom;
    assert.notEqual(healthy.summary, faulted.summary,
      `${id}: injecting the fault must change observable behaviour`);
  }
});

test('a healthy circuit reports as working from every switch', () => {
  const healthy = deriveSymptom(solutionCircuit(lessonById('three-way-source-at-switch')));
  assert.match(healthy.summary, /works correctly from every switch/);
  assert.equal(healthy.shortPresent, false);
});

test('the short scenario actually trips, and the others do not', () => {
  const short = buildScenario('ts-short-line-neutral');
  assert.equal(short.symptom.shortPresent, true);
  assert.match(short.symptom.summary, /breaker trips/);

  for (const id of scenarioIds().filter((x) => x !== 'ts-short-line-neutral')) {
    assert.equal(buildScenario(id).symptom.shortPresent, false, `${id} must not short`);
  }
});

test('the four-way split-traveler fault leaves exactly one working location', () => {
  const b = buildScenario('ts-4way-split-travelers');
  assert.equal(b.symptom.switchesThatWork.length, 1);
  assert.equal(b.symptom.switchesThatDoNot.length, 2);
  assert.equal(b.symptom.partialControl, true);
});

test('open-conductor faults produce a dead load', () => {
  for (const id of ['ts-single-pole-open-switched-leg', 'ts-single-pole-no-neutral']) {
    const b = buildScenario(id);
    assert.equal(b.symptom.alwaysOff, true, `${id} should be dead in every position`);
  }
});

test('fault injection is pure and does not mutate the source conductors', () => {
  const circuit = solutionCircuit(lessonById('single-pole-source-at-switch'));
  const before = circuit.conductors.length;
  injectFault(circuit.conductors, { kind: FaultKind.OPEN_CONDUCTOR, target: { role: 'NEUTRAL' } });
  assert.equal(circuit.conductors.length, before, 'the original list is untouched');
});

test('grading reveals the explanation only on a correct answer', () => {
  const s = SCENARIOS[0];
  const wrong = answerScenario(s.id, (s.correctChoice + 1) % s.choices.length);
  assert.equal(wrong.correct, false);
  assert.equal(wrong.explanation, null, 'a wrong answer must not give away the answer');
  assert.ok(wrong.hint);

  const right = answerScenario(s.id, s.correctChoice);
  assert.equal(right.correct, true);
  assert.ok(right.explanation);
  assert.ok(right.whatToInspect.length > 0);
});

test('every scenario has four choices, a valid correct index and inspection steps', () => {
  for (const s of SCENARIOS) {
    assert.equal(s.choices.length, 4, `${s.id}`);
    assert.ok(s.correctChoice >= 0 && s.correctChoice < 4, `${s.id}`);
    assert.ok(s.whatToInspect.length >= 2, `${s.id}`);
    assert.ok(s.commonMistake, `${s.id}`);
    assert.ok(s.safetyNote.includes('de-energize'), `${s.id} needs safety language`);
  }
});

test('scenarios group by lesson for a catalog', () => {
  const groups = scenariosByLesson();
  assert.ok(groups.length >= 3);
  assert.ok(groups.every((g) => g.scenarios.length > 0));
});

// ═══ DAILY CHALLENGE ═════════════════════════════════════════════════════════

test('the format rotates and covers every type over 10 days', () => {
  const seen = new Set();
  for (let i = 0; i < 10; i++) seen.add(formatForDate(new Date(2026, 7, 5 + i)));
  assert.ok(seen.size >= 6, `expected variety, saw ${seen.size} formats`);
  assert.ok(seen.has(ChallengeFormat.SPOT_THE_MISTAKE));
  assert.ok(seen.has(ChallengeFormat.TROUBLESHOOT));
  assert.ok(seen.has(ChallengeFormat.WHAT_WOULD_YOU_CHARGE));
});

test('the same date always yields the same challenge', () => {
  const a = dailyChallenge(new Date(2026, 7, 5, 6, 0));
  const b = dailyChallenge(new Date(2026, 7, 5, 23, 30));
  assert.deepEqual(a, b, 'a challenge must not change during the day');
});

test('every challenge in a 30-day window is well formed', () => {
  for (let i = 0; i < 30; i++) {
    const c = dailyChallenge(new Date(2026, 7, 5 + i));
    assert.ok(c.title, `day ${i} needs a title`);
    assert.ok(c.prompt, `day ${i} needs a prompt`);
    assert.ok(c.xp > 0, `day ${i} needs XP`);
    if (c.kind === 'MULTIPLE_CHOICE') {
      assert.ok(Array.isArray(c.choices) && c.choices.length >= 2, `day ${i} needs choices`);
      assert.ok(c.correct >= 0 && c.correct < c.choices.length, `day ${i} has a bad answer index`);
      assert.ok(c.explanation, `day ${i} needs an explanation`);
    }
  }
});

test('answering awards full XP when right and partial when wrong', () => {
  const c = dailyChallenge(new Date(2026, 7, 5));
  const right = answerDailyChallenge(c, c.correct);
  assert.equal(right.correct, true);
  assert.equal(right.xpAwarded, c.xp);

  const wrong = answerDailyChallenge(c, (c.correct + 1) % c.choices.length);
  assert.equal(wrong.correct, false);
  assert.ok(wrong.xpAwarded > 0 && wrong.xpAwarded < c.xp, 'trying still counts for something');
});

test('"What would you charge" has no right answer and pays for participating', () => {
  const day = [...Array(30).keys()]
    .map((i) => new Date(2026, 7, 5 + i))
    .find((d) => formatForDate(d) === ChallengeFormat.WHAT_WOULD_YOU_CHARGE);
  const c = dailyChallenge(day);
  assert.equal(c.kind, 'FREEFORM_NUMBER');
  assert.equal(c.correct, undefined, 'there must be no answer key');
  assert.match(c.note, /No right answer/);

  const answered = answerDailyChallenge(c, 4500);
  assert.equal(answered.correct, null);
  assert.equal(answered.complete, true);
  assert.equal(answered.xpAwarded, c.xp);
  assert.equal(answerDailyChallenge(c, 0).complete, false);
});

test('upcoming challenges can be prefetched for offline use', () => {
  const week = upcomingChallenges(new Date(2026, 7, 5), 7);
  assert.equal(week.length, 7);
  assert.equal(new Set(week.map((d) => d.date)).size, 7, 'seven distinct days');
});

test('every content bank answer index is valid', () => {
  for (const bank of [BREAKER_CHALLENGES, WIRE_SIZE_CHALLENGES, BEND_CHALLENGES, SPOT_THE_MISTAKE]) {
    for (const q of bank) {
      assert.ok(q.correct >= 0 && q.correct < q.choices.length, `${q.id} bad index`);
      assert.ok(q.explanation && q.ref, `${q.id} needs explanation and ref`);
    }
  }
  assert.ok(PRICING_PROMPTS.every((p) => p.job.length > 40));
});

test('Beat the Apprentice scores speed and produces share text', () => {
  const c = beatTheApprentice(new Date(2026, 7, 5));
  assert.equal(c.timeLimitSeconds, 15);

  const fast = scoreBeatTheApprentice({ correct: true, elapsedSeconds: 5 });
  assert.equal(fast.beat, true);
  assert.equal(fast.shareable, true);
  assert.ok(fast.xp > 50, 'speed pays');
  assert.match(fast.shareText, /Can you beat that/);

  const slow = scoreBeatTheApprentice({ correct: true, elapsedSeconds: 12 });
  assert.equal(slow.beat, false);
  assert.ok(slow.xp >= 50, 'a correct slow answer still pays');

  const wrong = scoreBeatTheApprentice({ correct: false, elapsedSeconds: 3 });
  assert.equal(wrong.shareable, false);
});

// ═══ FLASHCARDS ══════════════════════════════════════════════════════════════

const deck = () => [
  card({ id: 'c1', front: 'Max VD on a branch circuit?', back: '3%', category: 'Voltage Drop' }),
  card({ id: 'c2', front: '#12 Cu max OCPD?', back: '20 A', category: 'Overcurrent' }),
  card({ id: 'c3', front: 'EGC for 20 A?', back: '#14 Cu', category: 'Grounding' }),
];

test('a new card is due immediately', () => {
  const c = deck()[0];
  assert.equal(c.dueOn, null);
  assert.equal(isDue(c, '2026-08-05'), true);
});

test('intervals grow for cards you know', () => {
  let c = deck()[0];
  c = review(c, Grade.GOOD, '2026-08-05');
  assert.equal(c.intervalDays, 1);
  c = review(c, Grade.GOOD, '2026-08-06');
  assert.equal(c.intervalDays, 6);
  const third = review(c, Grade.GOOD, '2026-08-12');
  assert.ok(third.intervalDays > 6, 'the third correct review stretches further out');
  assert.equal(third.dueOn, addMonthsSafe('2026-08-12', third.intervalDays));
});

test('AGAIN resets the card to today and lowers ease', () => {
  let c = deck()[0];
  c = review(c, Grade.GOOD, '2026-08-05');
  c = review(c, Grade.GOOD, '2026-08-06');
  const missed = review(c, Grade.AGAIN, '2026-08-12');

  assert.equal(missed.intervalDays, 0);
  assert.equal(missed.dueOn, '2026-08-12', 'a missed card comes back the same day');
  assert.equal(missed.repetitions, 0);
  assert.equal(missed.lapses, 1);
  assert.ok(missed.ease < START_EASE);
});

test('ease never falls below the floor', () => {
  let c = deck()[0];
  for (let i = 0; i < 20; i++) c = review(c, Grade.AGAIN, '2026-08-05');
  assert.ok(c.ease >= MIN_EASE);
});

test('EASY stretches further than HARD', () => {
  const base = review(review(deck()[0], Grade.GOOD, '2026-08-05'), Grade.GOOD, '2026-08-06');
  const easy = review(base, Grade.EASY, '2026-08-12');
  const hard = review(base, Grade.HARD, '2026-08-12');
  assert.ok(easy.intervalDays > hard.intervalDays);
});

test('a session caps new cards so the first sitting is finishable', () => {
  const many = Array.from({ length: 200 }, (_, i) =>
    card({ id: `n${i}`, front: `q${i}`, back: `a${i}`, category: 'Bulk' }));
  const session = buildSession(many, { today: '2026-08-05', limit: 20, newCardLimit: 5 });
  assert.equal(session.cards.length, 5, 'only the new-card allowance is offered');
  assert.equal(session.newCount, 200);
});

test('lapsed cards come first in a session', () => {
  let cards = deck();
  cards[0] = review(review(cards[0], Grade.AGAIN, '2026-08-01'), Grade.AGAIN, '2026-08-02');
  cards[1] = review(cards[1], Grade.GOOD, '2026-08-01');
  cards[2] = review(cards[2], Grade.GOOD, '2026-08-01');

  const session = buildSession(cards, { today: '2026-08-10', limit: 10, newCardLimit: 0 });
  assert.equal(session.cards[0].id, 'c1', 'the card with the most lapses leads');
});

test('weakest topics rank by lapse rate and ignore unstudied categories', () => {
  let cards = deck();
  cards[0] = review(review(cards[0], Grade.AGAIN, '2026-08-01'), Grade.AGAIN, '2026-08-02');
  cards[1] = review(cards[1], Grade.GOOD, '2026-08-01');

  const weak = weakestTopics(cards);
  assert.equal(weak[0].category, 'Voltage Drop');
  assert.ok(!accuracyByCategory(cards).some((c) => c.category === 'Grounding'),
    'an unstudied category is not reported as weak');
});

test('the missed queue holds cards you keep getting wrong', () => {
  let cards = deck();
  cards[0] = review(cards[0], Grade.AGAIN, '2026-08-01');
  assert.deepEqual(missedQueue(cards).map((c) => c.id), ['c1']);
});

test('deck stats separate new, due, learning and mature', () => {
  let cards = deck();
  cards[0] = review(cards[0], Grade.GOOD, '2026-08-01');
  const stats = deckStats(cards, '2026-08-10');
  assert.equal(stats.total, 3);
  assert.equal(stats.new, 2);
  assert.equal(stats.learning, 1);
  assert.equal(stats.mature, 0);
});

test('the 10-minute plan is sized to the time available', () => {
  const many = Array.from({ length: 100 }, (_, i) =>
    card({ id: `n${i}`, front: `q${i}`, back: `a${i}` }));
  const plan = dailyStudyPlan(many, { today: '2026-08-05', minutes: 10 });
  assert.ok(plan.estimatedSeconds <= 10 * 60 + 15);
  assert.ok(plan.cards.length > 0);
});

// ═══ JOB CAM ═════════════════════════════════════════════════════════════════

test('templates seed folders and a suggested shot list', () => {
  const p = project({ id: 'p1', name: 'Smith panel', template: ProjectTemplate.PANEL_UPGRADE, createdAt: '2026-08-05' });
  assert.equal(p.folders.length, TEMPLATES.PANEL_UPGRADE.folders.length);
  assert.ok(p.suggestedShots.length > 0, 'an empty state that teaches');
  assert.equal(p.archived, false);
});

test('suggested tags never apply themselves', () => {
  let p = project({ id: 'p1', name: 'x', createdAt: '2026-08-05' });
  const ph = { ...photo({ id: 'ph1', uri: 'f', capturedAt: '2026-08-05' }), suggestedTags: [PhotoTag.PANEL] };
  p = addPhoto(p, ph);

  assert.deepEqual(p.photos[0].tags, [], 'a suggestion is not a tag');
  p = acceptSuggestedTag(p, 'ph1', PhotoTag.PANEL);
  assert.deepEqual(p.photos[0].tags, [PhotoTag.PANEL]);
  assert.deepEqual(p.photos[0].suggestedTags, []);
});

test('before/after pairs are found within a folder', () => {
  let p = project({ id: 'p1', name: 'x', template: ProjectTemplate.SERVICE_CALL, createdAt: '2026-08-05' });
  const folderId = p.folders[0].id;
  p = addPhoto(p, photo({ id: 'b1', uri: 'a', capturedAt: '2026-08-05', folderId, tags: [PhotoTag.BEFORE] }));
  p = addPhoto(p, photo({ id: 'a1', uri: 'b', capturedAt: '2026-08-05', folderId, tags: [PhotoTag.AFTER] }));

  const pairs = beforeAfterPairs(p);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].before.id, 'b1');
  assert.equal(pairs[0].after.id, 'a1');
});

test('photos can be filtered by tag, folder and text', () => {
  let p = project({ id: 'p1', name: 'x', createdAt: '2026-08-05' });
  p = addPhoto(p, photo({ id: '1', uri: 'a', capturedAt: '2026-08-05', tags: [PhotoTag.PANEL], note: 'main lugs' }));
  p = addPhoto(p, photo({ id: '2', uri: 'b', capturedAt: '2026-08-05', tags: [PhotoTag.TRIM] }));

  assert.equal(findPhotos(p, { tags: [PhotoTag.PANEL] }).length, 1);
  assert.equal(findPhotos(p, { query: 'lugs' }).length, 1);
  assert.equal(findPhotos(p, { query: 'nothing' }).length, 0);
});

test('project stats flag untagged photos', () => {
  let p = project({ id: 'p1', name: 'x', createdAt: '2026-08-05' });
  p = addPhoto(p, photo({ id: '1', uri: 'a', capturedAt: '2026-08-05' }));
  p = tagPhoto(p, '1', [PhotoTag.PANEL]);
  p = addPhoto(p, photo({ id: '2', uri: 'b', capturedAt: '2026-08-05' }));
  const s = projectStats(p);
  assert.equal(s.photoCount, 2);
  assert.equal(s.untagged, 1);
});

test('photos become global-search records', () => {
  let p = project({ id: 'p1', name: 'Smith panel', createdAt: '2026-08-05' });
  p = addPhoto(p, photo({ id: '1', uri: 'a', capturedAt: '2026-08-05', tags: [PhotoTag.PANEL], note: 'main lugs' }));
  const records = toSearchRecords(p);
  assert.equal(records[0].kind, 'PHOTO');
  assert.equal(records[0].title, 'main lugs');
  assert.equal(records[0].subtitle, 'Smith panel');
});

// ═══ ASSETS: TOOLS, WARRANTY, MAINTENANCE ════════════════════════════════════

test('the insurance manifest totals value and flags gaps', () => {
  const tools = [
    tool({ id: 't1', name: 'Hole hawg', brand: 'Milwaukee', serialNumber: 'ABC', purchasePriceCents: 45000 }),
    tool({ id: 't2', name: 'Meter', brand: 'Fluke', purchasePriceCents: 32000 }),
  ];
  const m = insuranceManifest(tools, { asOf: '2026-08-05' });
  assert.equal(m.itemCount, 2);
  assert.equal(m.declaredValueCents, 77000);
  assert.deepEqual(m.itemsMissingSerial, ['t2']);
});

test('a van check reports missing and unexpected tools', () => {
  const v = { ...vehicle({ id: 'v1', name: 'Van 1' }), toolIds: ['t1', 't2'] };
  const tools = [tool({ id: 't1', name: 'A' }), tool({ id: 't2', name: 'B' }), tool({ id: 't3', name: 'C' })];
  const check = toolsMissingFromVehicle(v, tools, { scannedToolIds: ['t1', 't3'] });
  assert.equal(check.complete, false);
  assert.equal(check.missing[0].id, 't2');
  assert.equal(check.unexpected[0].id, 't3');
});

test('a warranty term computes its own expiry and status', () => {
  const w = warrantyFromTerm({ id: 'w1', description: 'Panel', installedAt: '2026-01-15', termMonths: 12 });
  assert.equal(w.expiresAt, '2027-01-15');
  assert.equal(warrantyStatus(w, '2026-06-01'), 'ACTIVE');
  assert.equal(warrantyStatus(w, '2026-12-20'), 'EXPIRING_SOON');
  assert.equal(warrantyStatus(w, '2027-02-01'), 'EXPIRED');
});

test('expiring warranties are listed soonest first', () => {
  const ws = [
    warrantyFromTerm({ id: 'later', description: 'A', installedAt: '2025-10-01', termMonths: 12 }),  // expires 2026-10-01
    warrantyFromTerm({ id: 'sooner', description: 'B', installedAt: '2025-09-01', termMonths: 12 }), // expires 2026-09-01
  ];
  const soon = expiringWarranties(ws, '2026-08-25', 60);
  assert.equal(soon.length, 2);
  assert.equal(soon[0].id, 'sooner');
  assert.equal(soon[1].id, 'later');
});

test('completing maintenance rolls the reminder forward — the recurring-revenue loop', () => {
  const r = maintenanceReminder({
    id: 'm1', kind: MaintenanceKind.GENERATOR_SERVICE, lastServicedAt: '2025-09-01',
  });
  assert.equal(r.intervalMonths, 12);
  assert.equal(r.nextDueAt, '2026-09-01');

  const done = completeMaintenance(r, { servicedAt: '2026-09-03' });
  assert.equal(done.nextDueAt, '2027-09-03', 'the next call is already booked');
});

test('maintenance defaults carry a not-a-code-requirement disclaimer', () => {
  const r = maintenanceReminder({ id: 'm1', kind: MaintenanceKind.SURGE_PROTECTOR, lastServicedAt: '2026-01-01' });
  assert.match(r.disclaimer, /not code requirements/i);
});

test('the follow-up worklist merges maintenance and warranties, overdue first', () => {
  const reminders = [maintenanceReminder({ id: 'm1', kind: MaintenanceKind.GENERATOR_SERVICE, lastServicedAt: '2025-08-01' })];
  const warranties = [warrantyFromTerm({ id: 'w1', description: 'Panel', installedAt: '2025-09-10', termMonths: 12 })];

  const work = followUpWorklist({ warranties, reminders, today: '2026-08-25', withinDays: 40 });
  assert.ok(work.length >= 1);
  assert.ok(work[0].daysUntil <= work[work.length - 1].daysUntil, 'sorted by urgency');
  assert.ok(work.some((w) => w.type === 'MAINTENANCE'));
});

test('day arithmetic handles month and year boundaries', () => {
  assert.equal(dayGap('2026-08-31', '2026-09-01'), 1);
  assert.equal(dayGap('2026-12-31', '2027-01-01'), 1);
  assert.equal(dayGap('2026-09-01', '2026-08-31'), -1);
  assert.equal(addMonths('2026-01-31', 1).slice(0, 7), '2026-03');
});

// ═══ MATERIALS ═══════════════════════════════════════════════════════════════

const docWithMaterials = () => createInvoice({
  id: 'i1', number: 'INV-1', createdAt: '2026-08-05',
  lineItems: [
    lineItem({ id: 'l1', kind: LineItemKind.MATERIAL, description: '1/2 EMT', quantity: 120, unitPriceCents: 320 }),
    lineItem({ id: 'l2', kind: LineItemKind.MATERIAL, description: '1/2 EMT', quantity: 80, unitPriceCents: 340 }),
    lineItem({ id: 'l3', kind: LineItemKind.LABOR, description: 'Rough-in', quantity: 16, unitPriceCents: 9500 }),
    lineItem({ id: 'l4', kind: LineItemKind.MATERIAL, description: '4in square box', quantity: 25, unitPriceCents: 210 }),
  ],
});

test('a material list pulls only materials and merges duplicates', () => {
  const list = materialListFromDocument(docWithMaterials(), { id: 'ml1', createdAt: '2026-08-05' });
  assert.equal(list.items.length, 2, 'labour excluded, duplicate EMT merged');
  const emt = list.items.find((i) => i.description === '1/2 EMT');
  assert.equal(emt.quantity, 200);
  assert.equal(emt.unitPriceCents, 340, 'the higher price is kept');
});

test('a waste allowance rounds quantities up', () => {
  const list = materialListFromDocument(docWithMaterials(), { id: 'ml1', createdAt: '2026-08-05', wastePercent: 10 });
  const emt = list.items.find((i) => i.description === '1/2 EMT');
  assert.equal(emt.quantity, 220);
  assert.equal(emt.baseQuantity, 200);
});

test('packaging rounds up to what a supplier actually sells', () => {
  const list = applyPackaging(materialListFromDocument(docWithMaterials(), { id: 'ml1', createdAt: '2026-08-05' }));
  const emt = list.items.find((i) => i.description === '1/2 EMT');
  assert.equal(emt.packaging.packs, 20, '200 ft / 10 ft lengths');
  assert.equal(emt.packaging.surplus, 0);
});

test('a total is only shown when every price is known', () => {
  const doc = createInvoice({
    id: 'i', number: 'n', createdAt: '2026-08-05',
    lineItems: [
      lineItem({ id: 'a', kind: LineItemKind.MATERIAL, description: 'Box', quantity: 1, unitPriceCents: 100 }),
      lineItem({ id: 'b', kind: LineItemKind.MATERIAL, description: 'Connector', quantity: 1, unitPriceCents: 0 }),
    ],
  });
  const list = materialListFromDocument(doc, { id: 'ml', createdAt: '2026-08-05' });
  assert.equal(list.pricesComplete, true, 'zero is a price');
  assert.equal(list.estimatedTotalCents, 100);
});

test('purchase progress tracks the shopping trip', () => {
  let list = materialListFromDocument(docWithMaterials(), { id: 'ml1', createdAt: '2026-08-05' });
  assert.equal(listProgress(list).percent, 0);
  list = togglePurchased(list, list.items[0].id);
  assert.equal(listProgress(list).done, 1);
});

test('supplier text is plain and paste-safe', () => {
  const list = applyPackaging(materialListFromDocument(docWithMaterials(), { id: 'ml1', createdAt: '2026-08-05' }));
  const text = toSupplierText(list, { businessName: 'Doe Electric', reference: 'Smith job' });
  assert.match(text, /Doe Electric/);
  assert.match(text, /20 × 10 foot {2}1\/2 EMT/);
  assert.ok(!text.includes('<'), 'no markup');
});

test('the price catalogue never invents a price', async () => {
  const cat = createPriceCatalogue();
  assert.equal(await cat.lookup('1/2 EMT', 'FL'), null, 'no providers, no guess');
  assert.equal(cat.providerCount(), 0);

  cat.register({ id: 'test', lookup: async (d) => (d === '1/2 EMT' ? { priceCents: 350, source: 'test', observedAt: '2026-08-01' } : null) });
  const doc = createInvoice({
    id: 'i', number: 'n', createdAt: '2026-08-05',
    lineItems: [lineItem({ id: 'a', kind: LineItemKind.MATERIAL, description: '1/2 EMT', quantity: 10, unitPriceCents: null })],
  });
  const priced = await priceList(materialListFromDocument(doc, { id: 'ml', createdAt: '2026-08-05' }), cat, 'FL');
  assert.equal(priced.items[0].unitPriceCents, 350);
  assert.equal(priced.items[0].priceSource, 'test');
});

// ═══ COMMUNITY ═══════════════════════════════════════════════════════════════

test('every thread carries a permanent safety banner', () => {
  const t = thread({ id: 't1', authorId: 'u1', title: 'Q', body: 'B', createdAt: '2026-08-05' });
  assert.equal(t.safetyBanner, COMMUNITY_SAFETY_BANNER);
  assert.match(t.safetyBanner, /Verify before you apply/);
});

test('a code question without a region is flagged — the answer depends on where you are', () => {
  const t = thread({ id: 't1', authorId: 'u1', title: 'Q', body: 'B', category: ThreadCategory.CODE, createdAt: '2026-08-05' });
  assert.equal(threadNeedsRegion(t), true);
  assert.equal(threadNeedsRegion({ ...t, region: 'FL' }), false);
});

test('answer citations are unverified by default', () => {
  const a = answer({ id: 'a1', authorId: 'u2', body: 'text', createdAt: '2026-08-05', citations: [{ ref: 'NEC 210.8' }] });
  assert.equal(a.citations[0].verified, false, 'a user claim is not a verified citation');
});

test('only the asker can accept an answer', () => {
  let t = thread({ id: 't1', authorId: 'u1', title: 'Q', body: 'B', createdAt: '2026-08-05' });
  t = addAnswer(t, answer({ id: 'a1', authorId: 'u2', body: 'x', createdAt: '2026-08-05' }));

  assert.equal(acceptAnswer(t, 'a1', 'u2').ok, false, 'the answerer cannot accept their own');
  const ok = acceptAnswer(t, 'a1', 'u1');
  assert.equal(ok.ok, true);
  assert.equal(ok.thread.acceptedAnswerId, 'a1');
  assert.equal(ok.thread.status, ThreadStatus.ANSWERED);
});

test('flagging hides an answer at the threshold', () => {
  let t = thread({ id: 't1', authorId: 'u1', title: 'Q', body: 'B', createdAt: '2026-08-05' });
  t = addAnswer(t, answer({ id: 'a1', authorId: 'u2', body: 'dangerous', createdAt: '2026-08-05' }));

  for (let i = 0; i < FLAG_THRESHOLD - 1; i++) t = flagAnswer(t, 'a1');
  assert.equal(t.answers[0].removed, false);
  t = flagAnswer(t, 'a1');
  assert.equal(t.answers[0].removed, true, 'unsafe content hides without waiting for a human');
  assert.equal(rankedAnswers(t).length, 0);
});

test('votes cannot lift a heavily flagged answer above an accepted one', () => {
  let t = thread({ id: 't1', authorId: 'u1', title: 'Q', body: 'B', createdAt: '2026-08-05' });
  t = addAnswer(t, { ...answer({ id: 'good', authorId: 'u2', body: 'ok', createdAt: '2026-08-05' }), votes: 1, accepted: true });
  t = addAnswer(t, { ...answer({ id: 'loud', authorId: 'u3', body: 'no', createdAt: '2026-08-05' }), votes: 50, flagCount: 2 });
  assert.equal(rankedAnswers(t)[0].id, 'good');
});

test('a locked thread records why', () => {
  let t = thread({ id: 't1', authorId: 'u1', title: 'Q', body: 'B', createdAt: '2026-08-05' });
  t = lockThread(t, { reason: 'Unsafe advice', at: '2026-08-06' });
  assert.equal(t.status, ThreadStatus.LOCKED);
  assert.equal(t.lockedReason, 'Unsafe advice');
});

test('a job post cannot publish without pay transparency', () => {
  const j = jobPost({ id: 'j1', posterId: 'u1', title: 'Journeyman', description: 'Panel work', state: 'FL', createdAt: '2026-08-05' });
  const check = canPublish(j);
  assert.equal(check.ok, false);
  assert.ok(check.problems.some((p) => /pay rate or range/.test(p)));

  const withPay = { ...j, payMinCents: 3500, payMaxCents: 4500 };
  assert.equal(canPublish(withPay).ok, true);
  const published = publishJob(withPay, { at: '2026-08-05', expiresInDays: 30 });
  assert.equal(published.job.status, JobStatus.OPEN);
  assert.equal(published.job.expiresAt, '2026-09-04');
});

test('an inverted pay range is rejected', () => {
  const j = jobPost({ id: 'j', posterId: 'u', title: 'T', description: 'D', state: 'FL', createdAt: '2026-08-05',
    payMinCents: 5000, payMaxCents: 3000 });
  assert.ok(canPublish(j).problems.some((p) => /cannot exceed/.test(p)));
});

test('job search excludes expired posts and ranks verified employers first', () => {
  const base = { posterId: 'u', description: 'work', state: 'FL', payMinCents: 4000, createdAt: '2026-08-01' };
  const jobs = [
    { ...jobPost({ id: 'j1', title: 'Unverified', ...base }), status: JobStatus.OPEN, expiresAt: '2026-09-01' },
    { ...jobPost({ id: 'j2', title: 'Verified', ...base }), status: JobStatus.OPEN, expiresAt: '2026-09-01', posterVerified: true },
    { ...jobPost({ id: 'j3', title: 'Old', ...base }), status: JobStatus.OPEN, expiresAt: '2026-08-01' },
  ];
  const found = searchJobs(jobs, { state: 'FL', today: '2026-08-15' });
  assert.equal(found.length, 2, 'the expired post is gone');
  assert.equal(found[0].id, 'j2', 'verified employers rank first');
});

test('pay stats are suppressed below a sample size that could identify an employer', () => {
  const mk = (i) => ({ ...jobPost({ id: `j${i}`, posterId: 'u', title: 'T', description: 'd', state: 'FL', createdAt: '2026-08-01' }),
    payMinCents: 3000 + i * 100, payMaxCents: 4000 + i * 100, experienceLevel: ExperienceLevel.JOURNEYMAN });

  const few = Array.from({ length: MIN_SAMPLE_FOR_PAY_STATS - 1 }, (_, i) => mk(i));
  assert.equal(payStats(few, { state: 'FL' }).available, false);

  const enough = Array.from({ length: 10 }, (_, i) => mk(i));
  const stats = payStats(enough, { state: 'FL' });
  assert.equal(stats.available, true);
  assert.ok(stats.p25Cents <= stats.medianCents && stats.medianCents <= stats.p75Cents);
  assert.match(stats.note, /Not a survey and not advice/);
});

// helper mirroring flashcards' internal date math for one assertion above
function addMonthsSafe(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
