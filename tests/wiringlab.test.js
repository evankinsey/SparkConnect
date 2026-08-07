// ─── THE SIMULATOR: TAP-TO-CONNECT AND CONDUCTOR INSPECTION ──────────────────
// Two properties matter more than any feature here:
//   1. expert mode must not highlight the answer
//   2. every electrical claim on a conductor must come from the solver

import test from 'node:test';
import assert from 'node:assert/strict';

import { ALL_LESSONS, solutionCircuit } from '../src/circuit/lessons/index.js';
import { ConductorRole } from '../src/circuit/model.js';
import { buildGuide } from '../src/circuit/guided.js';
import {
  Mode, Highlight, beginConnection, canConnect, completeConnection,
  highlights, connectionRun, removeConductor,
} from '../src/circuit/connectFlow.js';
import {
  Energization, energizationOf, expectedReadings, whyItLandsHere,
  inspectConductor, referencesFor,
} from '../src/circuit/wireDetail.js';

const lesson = (id) => ALL_LESSONS.find((l) => l.id === id);
const singlePole = () => solutionCircuit(lesson('single-pole-source-at-switch'));
const threeWay = () => solutionCircuit(lesson('three-way-source-at-switch'));

const wireOfRole = (circuit, role) => circuit.conductors.find((c) => c.role === role);

// ─── Tap to connect ──────────────────────────────────────────────────────────

test('expert mode highlights the end you are holding and nothing else', () => {
  const c = threeWay();
  const from = c.conductors[0].fromTerminal;
  const sel = beginConnection(c, from, { mode: Mode.EXPERT, role: ConductorRole.TRAVELER_A });
  const h = highlights(c, sel);

  assert.equal(h.get(from), Highlight.SELECTED);
  // THE line that keeps this a simulator. Light up the legal destinations and
  // wiring a three-way becomes "tap the green one" — somebody can finish every
  // lesson without learning what a common screw is.
  const candidates = [...h.values()].filter((v) => v === Highlight.CANDIDATE);
  assert.equal(candidates.length, 0, 'expert mode must not point at the answer');
});

test('guided mode narrows to devices, never to a terminal', () => {
  const l = lesson('three-way-source-at-switch');
  const c = solutionCircuit(l);
  const guide = buildGuide(l);
  const traveler = guide.remaining.find((g) => g.role === ConductorRole.TRAVELER_A);

  const sel = beginConnection({ ...c, conductors: [] }, traveler.fromTerminal, {
    mode: Mode.GUIDED, role: ConductorRole.TRAVELER_A, guide,
  });
  const h = highlights({ ...c, conductors: [] }, sel);

  const hinted = [...h.entries()].filter(([, v]) => v === Highlight.CANDIDATE).map(([id]) => id);
  assert.ok(hinted.length > 0, 'guided mode is allowed to help');
  // "The traveler lands somewhere on this switch" is a lesson. "The traveler
  // lands here" is transcription.
  assert.ok(hinted.length > 1, 'a single highlighted terminal would be the answer');
  const devices = new Set(hinted.map((id) => id.split('.')[0]));
  assert.ok(devices.size >= 1);
  assert.equal(devices.has(traveler.fromTerminal.split('.')[0]), false,
    'the device you are already on is not a destination hint');
});

test('the mechanical refusals are things you can see for yourself', () => {
  const c = threeWay();
  const from = c.conductors[0].fromTerminal;
  const sel = beginConnection(c, from, { mode: Mode.EXPERT });

  assert.match(canConnect(c, sel, from).reason, /two different ends/);
  const sameDevice = c.components
    .find((x) => x.id === from.split('.')[0])
    .terminals.find((t) => t.id !== from);
  assert.match(canConnect(c, sel, sameDevice.id).reason, /same device/);
  // A run that already exists.
  const existing = beginConnection(c, c.conductors[0].fromTerminal, { mode: Mode.EXPERT });
  assert.match(canConnect(c, existing, c.conductors[0].toTerminal).reason, /already a conductor/);
});

test('expert mode lets you build it wrong', () => {
  const c = { ...threeWay(), conductors: [] };
  // A traveler onto a common screw is the single most common three-way fault,
  // and being able to make it is the only reason getting it right means
  // anything. Nothing here may refuse it.
  const a = c.components.find((x) => x.type === 'SWITCH_THREE_WAY');
  const b = c.components.filter((x) => x.type === 'SWITCH_THREE_WAY')[1];
  const travelerScrew = a.terminals.find((t) => t.semanticRole === 'SWITCH_TRAVELER');
  const commonScrew = b.terminals.find((t) => t.semanticRole === 'SWITCH_COMMON');

  const sel = beginConnection(c, travelerScrew.id, { mode: Mode.EXPERT, role: ConductorRole.TRAVELER_A });
  const res = completeConnection(c, sel, commonScrew.id);
  assert.equal(res.ok, true, 'the simulator must allow a wrong connection');
  assert.equal(res.conductor.role, ConductorRole.TRAVELER_A);
});

test('a completed run carries enough to narrate the animation', () => {
  const c = threeWay();
  const run = connectionRun(c, c.conductors[0]);
  assert.ok(run.from.device && run.to.device);
  assert.ok(run.roleLabel);
  assert.match(run.narration, /to /);
});

test('a run can be taken back out', () => {
  const c = threeWay();
  const after = removeConductor(c, c.conductors[0]);
  assert.equal(after.conductors.length, c.conductors.length - 1);
  assert.equal(removeConductor(null, null), null);
});

test('nothing throws on a terminal that does not exist', () => {
  const c = threeWay();
  assert.equal(beginConnection(c, 'nope.1'), null);
  assert.equal(beginConnection(null, 'x'), null);
  const sel = beginConnection(c, c.conductors[0].fromTerminal, {});
  assert.equal(canConnect(c, sel, 'nope.1').ok, false);
  assert.equal(canConnect(c, null, 'x').ok, false);
  assert.equal(connectionRun(c, { fromTerminal: 'nope.1', toTerminal: 'nope.2' }), null);
});

// ─── What a conductor reads ──────────────────────────────────────────────────

test('a switched leg is not floating when the switch is off', () => {
  const c = singlePole();
  const sw = wireOfRole(c, ConductorRole.SWITCHED_HOT);
  const states = expectedReadings(c, sw).map((r) => r.energization);

  assert.ok(states.includes(Energization.HOT), 'hot with the switch closed');
  // The point. The lamp ties the switched leg to the grounded conductor, so a
  // meter reads a solid zero rather than a floating number. Calling this OPEN
  // would teach somebody to expect the wrong reading on every service call.
  assert.ok(states.includes(Energization.PULLED_LOW), 'tied low through the lamp with the switch open');
  assert.equal(states.includes(Energization.OPEN), false);
});

test('exactly one traveler is hot at a time', () => {
  const c = threeWay();
  const a = expectedReadings(c, wireOfRole(c, ConductorRole.TRAVELER_A));
  const b = expectedReadings(c, wireOfRole(c, ConductorRole.TRAVELER_B));
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) {
    const bothHot = a[i].energization === Energization.HOT && b[i].energization === Energization.HOT;
    assert.equal(bothHot, false, 'a three-way steers between the travelers, it does not feed both');
  }
  assert.ok(a.some((r) => r.energization === Energization.HOT));
  assert.ok(b.some((r) => r.energization === Energization.HOT));
});

test('the line and the neutral do not change with switch position', () => {
  const c = threeWay();
  // One collapsed row rather than four identical ones — four identical rows is
  // how somebody learns to stop reading the panel.
  const line = expectedReadings(c, wireOfRole(c, ConductorRole.LINE));
  assert.equal(line.length, 1);
  assert.match(line[0].positions, /every switch position/i);
  assert.equal(line[0].energization, Energization.HOT);

  const n = expectedReadings(c, wireOfRole(c, ConductorRole.NEUTRAL));
  assert.equal(n[0].energization, Energization.GROUNDED);

  const g = expectedReadings(c, wireOfRole(c, ConductorRole.EQUIPMENT_GROUND));
  assert.equal(g[0].energization, Energization.BONDED);
});

test('an open conductor is never described as reading zero', () => {
  const c = threeWay();
  const open = expectedReadings(c, wireOfRole(c, ConductorRole.TRAVELER_A))
    .find((r) => r.energization === Energization.OPEN);
  assert.ok(open, 'expected at least one position with a traveler open at both ends');
  // The most useful sentence in the module: a floating conductor next to an
  // energized one shows 40 or 60 volts of nothing, and an apprentice told to
  // expect zero decides the meter is broken.
  assert.match(open.reads, /may still show a number/i);
  assert.match(open.why, /floating/i);
  assert.match(open.why, /low-impedance/i);
  assert.doesNotMatch(open.reads, /^0 V$/);
});

test('a miswired circuit reports what it actually does', () => {
  // Nothing here is written down per lesson, so it stays true when somebody
  // builds it wrong — which is when the readings are worth the most.
  const c = singlePole();
  const broken = { ...c, conductors: c.conductors.filter((w) => w.role !== ConductorRole.NEUTRAL) };
  const sw = wireOfRole(broken, ConductorRole.SWITCHED_HOT);
  const states = expectedReadings(broken, sw).map((r) => r.energization);
  assert.ok(states.includes(Energization.OPEN) || states.includes(Energization.HOT));
  assert.equal(states.includes(Energization.PULLED_LOW), false,
    'with the neutral gone there is nothing to be pulled low by');
});

// ─── The rest of the panel ───────────────────────────────────────────────────

test('inspecting says where it lands without saying whether that is right', () => {
  const c = threeWay();
  const w = wireOfRole(c, ConductorRole.TRAVELER_A);
  const d = inspectConductor(c, w);

  assert.equal(d.kind, 'CONDUCTOR');
  assert.ok(d.summary, 'what a traveler is for');
  assert.ok(d.lands.from.device && d.lands.to.device);
  assert.ok(d.whyHere);
  // Inspecting is always allowed — knowing what a traveler does is not a hint
  // about where this particular one goes.
  assert.equal(d.allowedDuringLesson, true);
  assert.doesNotMatch(d.whyHere, /correct|wrong|should land/i);
});

test('mistakes are consequences, not rules', () => {
  const c = singlePole();
  const n = inspectConductor(c, wireOfRole(c, ConductorRole.NEUTRAL));
  assert.ok(n.mistakes.length > 0);
  // "Do not switch the neutral" is a rule somebody forgets. "The fixture stays
  // energized and whoever changes the bulb finds out" is a thing they remember.
  const switched = n.mistakes.find((m) => /through the switch/i.test(m.mistake));
  assert.match(switched.consequence, /changes the bulb/i);
  for (const m of n.mistakes) assert.ok(m.consequence, 'every mistake says what happens');
});

test('only citations that resolve are offered', () => {
  // An unresolvable citation is indistinguishable from an invented one, and
  // this app drops those everywhere else.
  for (const role of Object.values(ConductorRole)) {
    for (const r of referencesFor(role)) {
      assert.ok(r.ref && r.display, `${role} offered an unresolved citation`);
    }
  }
  assert.ok(referencesFor(ConductorRole.EQUIPMENT_GROUND).length > 0);
  assert.deepEqual([...referencesFor('NOT_A_ROLE')], []);
});

test('the panel separates what was solved from what was written', () => {
  const c = threeWay();
  const d = inspectConductor(c, wireOfRole(c, ConductorRole.LINE));
  // A reader has to be able to tell "the app computed this" from "somebody
  // wrote this", because those deserve different amounts of trust.
  assert.equal(d.computed, true);
  assert.ok(Array.isArray(d.expected));
  assert.ok(Array.isArray(d.mistakes));
  assert.ok(Array.isArray(d.references));
});

test('a conductor with no circuit still explains itself', () => {
  const d = inspectConductor(null, { fromTerminal: 'a.1', toTerminal: 'b.1', role: ConductorRole.NEUTRAL });
  assert.ok(d.summary, 'the definition does not need a circuit');
  assert.deepEqual([...d.expected], [], 'but the readings do');
  assert.equal(inspectConductor(null, null), null);
  assert.equal(energizationOf(null, null), null);
  assert.equal(whyItLandsHere(null, null), null);
});
