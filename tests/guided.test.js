// ─── GUIDED MODE ─────────────────────────────────────────────────────────────
// The guided walk must be able to complete every production lesson, tolerate
// equivalent splice points, and coach without printing answers.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ALL_LESSONS, buildCircuit, lessonById } from '../src/circuit/lessons/index.js';
import { validate } from '../src/circuit/validator.js';
import { ConductorRole } from '../src/circuit/model.js';
import {
  buildGuide, remainingRoles, promptForRole, matchGuidedTap, guideDone, roleName,
} from '../src/circuit/guided.js';

test('every lesson yields a guide covering its full solution', () => {
  for (const lesson of ALL_LESSONS) {
    const g = buildGuide(lesson);
    assert.equal(g.total, lesson.solution().length, lesson.id);
    assert.equal(g.remaining.length, g.total, lesson.id);
    for (const step of g.remaining) assert.ok(roleName(step.role), `${lesson.id} names ${step.role}`);
  }
});

test('walking the solution through guided taps completes every lesson with a valid circuit', () => {
  for (const lesson of ALL_LESSONS) {
    const components = lesson.components();
    let { remaining } = buildGuide(lesson);
    const wires = [];
    for (const step of lesson.solution()) {
      const r = matchGuidedTap(components, remaining, step.role, step.fromTerminal, step.toTerminal);
      assert.ok(r.ok, `${lesson.id}: ${step.role} ${step.fromTerminal}→${step.toTerminal} should match, got ${JSON.stringify(r)}`);
      remaining = remaining.filter((c) => c.key !== r.consumedKey);
      wires.push({ id: `w${wires.length}`, ...r.conductor });
    }
    assert.ok(guideDone(remaining), lesson.id);
    const result = validate(buildCircuit(lesson, wires), lesson.expectations);
    assert.ok(result.valid, `${lesson.id} guided build must pass the validator: ${JSON.stringify(result.failures?.slice(0, 2))}`);
  }
});

test('an equivalent splice point is accepted — p3 instead of p2 is the same node', () => {
  const lesson = lessonById('single-pole-source-at-switch');
  const components = lesson.components();
  const { remaining } = buildGuide(lesson);
  // Solution runs nBox.p2 → lamp.neu. The user taps nBox.p3 instead.
  const r = matchGuidedTap(components, remaining, ConductorRole.NEUTRAL, 'nBox.p3', 'lamp.neu');
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.conductor.fromTerminal, 'nBox.p3', 'the user keeps their splice point');
});

test('right endpoints, wrong conductor type coaches on the role without revealing it', () => {
  const lesson = lessonById('single-pole-source-at-switch');
  const components = lesson.components();
  const { remaining } = buildGuide(lesson);
  // src.hot → sw1.a is the LINE run; the user tries it as a neutral.
  const r = matchGuidedTap(components, remaining, ConductorRole.NEUTRAL, 'src.hot', 'sw1.a');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'role');
  assert.ok(!/line|hot \(line\)/i.test(r.coach.replace('not with the neutral', '')), 'must not name the correct role');
});

test('wrong endpoints coach names a device, never the full run', () => {
  const lesson = lessonById('single-pole-source-at-switch');
  const components = lesson.components();
  const { remaining } = buildGuide(lesson);
  const r = matchGuidedTap(components, remaining, ConductorRole.LINE, 'lamp.hot', 'lamp.neu');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'endpoints');
  assert.ok(r.coach.length > 10 && !r.coach.includes('→'), 'coach is prose, not the answer');
});

test('half-right taps are told which end is right', () => {
  const lesson = lessonById('single-pole-source-at-switch');
  const components = lesson.components();
  const { remaining } = buildGuide(lesson);
  // LINE runs src.hot → sw1.a. Tap src.hot but land it on the lamp.
  const r = matchGuidedTap(components, remaining, ConductorRole.LINE, 'src.hot', 'lamp.hot');
  assert.equal(r.ok, false);
  assert.match(r.coach, /One end is right/);
});

test('an exhausted role tells the user to move on', () => {
  const lesson = lessonById('single-pole-source-at-switch');
  const components = lesson.components();
  let { remaining } = buildGuide(lesson);
  const line = lesson.solution().find((c) => c.role === ConductorRole.LINE);
  const first = matchGuidedTap(components, remaining, ConductorRole.LINE, line.fromTerminal, line.toTerminal);
  remaining = remaining.filter((c) => c.key !== first.consumedKey);
  const again = matchGuidedTap(components, remaining, ConductorRole.LINE, line.fromTerminal, line.toTerminal);
  assert.equal(again.ok, false);
  assert.match(again.coach, /already run/);
});

test('remainingRoles counts chips for the chooser', () => {
  const lesson = lessonById('single-pole-source-at-switch');
  const { remaining } = buildGuide(lesson);
  const chips = remainingRoles(remaining);
  const ground = chips.find((c) => c.role === ConductorRole.EQUIPMENT_GROUND);
  assert.equal(ground.count, 3, 'three ground bonds in the single-pole lesson');
  for (const chip of chips) assert.ok(chip.label);
});

test('every role has a prompt that does not name terminals', () => {
  for (const role of Object.values(ConductorRole)) {
    const p = promptForRole(role);
    assert.ok(p.length > 10);
    // Terminal ids look like `sw1.a` — a dot with word characters either side.
    // Sentence-ending periods are fine.
    assert.ok(!/\w\.\w/.test(p), `prompt for ${role} must not contain terminal ids: ${p}`);
  }
});
