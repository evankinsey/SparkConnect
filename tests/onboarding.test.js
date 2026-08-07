// ─── ONBOARDING ──────────────────────────────────────────────────────────────
// One rule holds this file together: every question must change something, and
// the change must be nameable. The previous flow failed that in three separate
// ways and shipped anyway — because nothing checked.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  StepId, STEPS, EFFECTS, ROLES, FOCUS, TOTAL_STEPS,
  roleById, focusById, stepById,
  beginOnboarding, answer, canAdvance, advance, back, progress,
  previewFor, outcome, offerFor,
} from '../src/core/onboarding/flow.js';
import { ROLE_LAYOUTS, CARD_IDS, layoutForRole } from '../src/core/home/layout.js';

const run = (answers) => {
  let s = beginOnboarding();
  for (const [k, v] of Object.entries(answers)) s = answer(s, k, v);
  return s;
};

// ─── The rule ────────────────────────────────────────────────────────────────

test('every question changes something, and something consumes it', () => {
  // A question whose answer the app ignores is a tax charged in the one place
  // a person is most likely to quit. Worse than no question: it teaches them
  // their input does not matter here.
  for (const step of STEPS) {
    if (step.kind === 'DEMO') { assert.equal(step.effect, null); continue; }
    assert.ok(step.effect, `${step.id} asks for something and changes nothing`);
    const e = EFFECTS[step.effect];
    assert.ok(e, `${step.id} declares an effect that does not exist`);
    assert.ok(e.consumedBy, `${e.id} is consumed by nothing`);
    assert.ok(e.describe, `${e.id} cannot be described to a user`);
  }
});

test('every role personalises — none falls through to the default', () => {
  // The old flow offered `master` and `diy`, neither of which is a key in
  // ROLE_LAYOUTS, so those users silently got the default layout. Drift like
  // that is invisible without this test.
  const def = layoutForRole(null);
  for (const r of ROLES) {
    assert.ok(ROLE_LAYOUTS[r.id], `${r.id} is not a key in ROLE_LAYOUTS`);
    assert.notDeepEqual(layoutForRole(r.id), def, `${r.id} resolves to the default layout`);
  }
});

test('every card a role promises actually exists', () => {
  for (const r of ROLES) {
    for (const id of layoutForRole(r.id)) {
      assert.ok(CARD_IDS.includes(id), `${r.id} pins "${id}", which is not a real card`);
    }
  }
});

test('the preview is read from the real layout, so it cannot drift', () => {
  for (const r of ROLES) {
    const p = previewFor(r.id);
    assert.deepEqual([...p.cards], layoutForRole(r.id));
    assert.ok(p.promise, `${r.id} does not say what will change`);
  }
  assert.equal(previewFor('not-a-role'), null);
});

// ─── Getting through it ──────────────────────────────────────────────────────

test('only the legal step can stop you', () => {
  // A step a person cannot get past is a step they close the app on.
  let s = beginOnboarding();
  for (let i = 0; i < TOTAL_STEPS; i++) {
    const step = STEPS[i];
    if (step.required) {
      assert.equal(canAdvance(s), false, `${step.id} let an unanswered required step through`);
      s = answer(s, step.id, true);
    }
    assert.equal(canAdvance(s), true, `${step.id} blocked a skippable step`);
    s = advance(s);
  }
  assert.equal(s.done, true);
});

test('exactly one step is mandatory, and it is the record, not the sale', () => {
  const required = STEPS.filter((s) => s.required);
  assert.equal(required.length, 1);
  assert.equal(required[0].id, StepId.LEGAL);
  // The offer must never be the thing you cannot get past.
  assert.equal(stepById(StepId.TRIAL).required, false);
  assert.equal(stepById(StepId.TRIAL).skippable, true);
});

test('skipping everything still produces a working app', () => {
  let s = beginOnboarding();
  s = answer(s, StepId.LEGAL, true);
  const o = outcome(s);
  assert.equal(o.skippedAll, true);
  assert.equal(o.role, null);
  assert.ok(o.layout.length > 0, 'a user who answered nothing still needs a Home');
  assert.equal(o.openAt, 'home');
  assert.equal(o.startedTrial, false);
  assert.equal(o.acceptedTerms, true);
});

test('value comes before the ask', () => {
  // Nothing is requested until something has been given.
  const proof = STEPS.findIndex((s) => s.id === StepId.PROOF);
  const trial = STEPS.findIndex((s) => s.id === StepId.TRIAL);
  const notify = STEPS.findIndex((s) => s.id === StepId.NOTIFY);
  assert.ok(proof < trial, 'the trial is asked for before anything is shown');
  assert.ok(proof < notify, 'a permission prompt before any context is the one people deny forever');
  assert.equal(stepById(StepId.PROOF).effect, null, 'the value moment asks for nothing');
});

test('you can go back, and back never discards an answer', () => {
  // Step 0 is the disclaimer, so getting anywhere means accepting first.
  let s = run({ [StepId.LEGAL]: true, [StepId.ROLE]: 'journeyman' });
  s = advance(s);
  assert.equal(s.index, 1);
  assert.equal(stepById(STEPS[1].id).id, StepId.ROLE);

  s = advance(s);
  assert.equal(s.index, 2);
  s = back(s);
  assert.equal(s.index, 1);
  assert.equal(s.answers[StepId.ROLE], 'journeyman', 'going back must not discard an answer');
  assert.equal(s.answers[StepId.LEGAL], true, 'nor the acceptance');

  assert.equal(back(beginOnboarding()).index, 0, 'back from the first step stays put');
  assert.equal(progress(beginOnboarding()), 0);
});

// ─── What comes out ──────────────────────────────────────────────────────────

test('what brought you here beats what you do', () => {
  // "What brought you here" is the more specific of the two answers, so it
  // wins for the opening screen.
  const o = outcome(run({ [StepId.ROLE]: 'contractor', [StepId.FOCUS]: 'learn' }));
  assert.equal(o.openAt, focusById('learn').tab);
  // With no focus, the role decides.
  assert.equal(outcome(run({ [StepId.ROLE]: 'contractor' })).openAt, roleById('contractor').firstScreen);
});

test('the outcome carries nothing that is not consumed', () => {
  const o = outcome(run({
    [StepId.ROLE]: 'foreman', [StepId.FOCUS]: 'jobs',
    [StepId.LEGAL]: true, [StepId.NOTIFY]: true, [StepId.TRIAL]: false,
  }));
  // Nothing is collected for a dashboard.
  assert.deepEqual(Object.keys(o).sort(), [
    'acceptedTerms', 'layout', 'notifications', 'openAt', 'role', 'skippedAll', 'startedTrial',
  ].sort());
  assert.equal(o.role, 'foreman');
  assert.equal(o.notifications, true);
  assert.equal(o.startedTrial, false);
});

test('every focus opens somewhere the app can actually go', () => {
  for (const f of FOCUS) {
    assert.ok(f.tab, `${f.id} opens nowhere`);
    assert.equal(typeof f.label, 'string');
  }
});

// ─── The offer, and the things it must not do ────────────────────────────────

test('the offer always shows a real way past it', () => {
  for (const r of [...ROLES.map((x) => x.id), null]) {
    const o = offerFor(r);
    assert.ok(o.freeAlternative, `${r}: no way out of the offer`);
    assert.match(o.freeNote, /calculator/i, 'say what stays free');
    assert.ok(o.benefits.length >= 3);
    // Terms stated wherever a trial is offered — App Store requirement and
    // basic decency.
    assert.match(o.terms, /\$7\.99/);
    assert.match(o.terms, /cancel/i);
    assert.match(o.terms, /nothing is charged until/i);
  }
});

test('benefits are reasons, not tier contents', () => {
  const learner = offerFor('apprentice');
  const pro = offerFor('contractor');
  assert.notDeepEqual([...learner.benefits], [...pro.benefits], 'the offer should know who it is talking to');
  // "Ask as many times as you need in a day" beats "unlimited SparkAI".
  assert.ok(learner.benefits.some((b) => /as many times as you need/i.test(b)));
});

test('none of the pressure tactics are present', () => {
  // Every one of these converts. Every one is a promise the rest of the app
  // spends its life not making.
  const all = JSON.stringify([STEPS, ROLES, FOCUS, ...ROLES.map((r) => offerFor(r.id))]);
  for (const banned of [
    /only \d+ (left|spots)/i,
    /expires? in/i,
    /limited time/i,
    /\d+% of (electricians|users|people)/i,
    /join \d[\d,]* /i,
    /don't miss/i,
    /act now/i,
    /building your (personalis|personaliz)/i,
  ]) {
    assert.doesNotMatch(all, banned, `pressure tactic present: ${banned}`);
  }
  // And no banned compliance language leaked into onboarding copy.
  for (const banned of [/code.compliant/i, /guarantee/i, /certified/i]) {
    assert.doesNotMatch(all, banned, `banned claim: ${banned}`);
  }
});

test('no emoji in the role list', () => {
  // A trade app that opens with a row of emoji reads as a toy, and the people
  // most likely to bounce here already believe electrical apps are toys.
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  for (const r of ROLES) {
    assert.doesNotMatch(r.label, emoji, `${r.id} label carries an emoji`);
    assert.doesNotMatch(r.sub, emoji);
  }
});

test('two questions is the budget', () => {
  // Every screen between download and first value costs more than the
  // personalisation it buys.
  const asks = STEPS.filter((s) => s.kind === 'CHOICE');
  assert.ok(asks.length <= 2, `${asks.length} questions before value is too many`);
});

// ─── The disclaimer comes first ──────────────────────────────────────────────

test('nothing electrical is shown before the terms are accepted', async () => {
  const { orderingFault } = await import('../src/core/onboarding/flow.js');
  // This was wrong once. The demo screen puts a real NEC citation in front of
  // somebody, and it had drifted ahead of the acceptance it depends on — a
  // legal gate sitting behind the exact thing it exists to gate.
  assert.equal(orderingFault(), null);

  // And the check actually catches it, rather than passing vacuously.
  const broken = [
    { id: 'DEMO', showsElectricalContent: true, effect: null },
    { id: 'LEGAL', effect: 'LEGAL_ACCEPTANCE' },
  ];
  const fault = orderingFault(broken);
  assert.equal(fault.step, 'DEMO');
  assert.match(fault.reason, /before the terms are accepted/);

  // A flow with no acceptance step at all is also a fault.
  assert.match(orderingFault([{ id: 'X', effect: null }]).reason, /No step records acceptance/);
});

test('the disclaimer is the first screen, and it cannot be skipped', () => {
  assert.equal(STEPS[0].id, StepId.LEGAL);
  assert.equal(STEPS[0].required, true);
  assert.equal(STEPS[0].skippable, false);
  // Leading with the limits is the product's argument, not an apology — so the
  // copy states what the app will not do rather than listing obligations.
  assert.match(STEPS[0].title, /will not do/i);
});

test('a user cannot reach any other screen without accepting', () => {
  const s = beginOnboarding();
  assert.equal(s.index, 0);
  assert.equal(canAdvance(s), false, 'the very first screen must hold');
  assert.equal(advance(s).index, 0, 'advancing without accepting must be a no-op');
  assert.equal(canAdvance(answer(s, StepId.LEGAL, true)), true);
});
