// ─── INSPECT ─────────────────────────────────────────────────────────────────
// The contract: every conductor, device and terminal the engine can produce has
// an explanation, and none of those explanations leak the answer to a lesson.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ConductorRole, ComponentType, TerminalRole } from '../src/circuit/model.js';
import { ALL_LESSONS } from '../src/circuit/lessons/index.js';
import {
  ROLE_INFO, COMPONENT_INFO, TERMINAL_INFO,
  roleInfo, componentInfo, inspectTerminal, inspectWire,
} from '../src/circuit/inspect.js';

test('every conductor role the engine can produce has an explanation', () => {
  for (const role of Object.values(ConductorRole)) {
    const info = ROLE_INFO[role];
    assert.ok(info, `no copy for conductor role ${role}`);
    assert.ok(info.title && info.summary, `${role} incomplete`);
    assert.ok(info.summary.length > 25, `${role} summary too thin`);
  }
});

test('every component type has an explanation', () => {
  for (const type of Object.values(ComponentType)) {
    const info = COMPONENT_INFO[type];
    assert.ok(info, `no copy for component ${type}`);
    assert.ok(info.title && info.summary && Array.isArray(info.points));
  }
});

test('every terminal role has an explanation', () => {
  for (const role of Object.values(TerminalRole)) {
    assert.ok(TERMINAL_INFO[role], `no copy for terminal role ${role}`);
  }
});

test('every terminal in every production lesson can be inspected', () => {
  // The real guarantee: tapping anything on screen produces a panel, because
  // the panels are built from the same model the canvas draws.
  for (const lesson of ALL_LESSONS) {
    for (const c of lesson.components()) {
      for (const t of c.terminals) {
        const panel = inspectTerminal(c, t, 0);
        assert.ok(panel, `${lesson.id}: ${t.id} produced nothing`);
        assert.ok(panel.heading && panel.summary, `${lesson.id}: ${t.id} incomplete`);
        assert.equal(panel.kind, 'TERMINAL');
      }
    }
  }
});

test('every conductor in every solution can be inspected', () => {
  for (const lesson of ALL_LESSONS) {
    for (const w of lesson.solution()) {
      const panel = inspectWire(w, 'A', 'B');
      assert.ok(panel && panel.heading && panel.summary, `${lesson.id}: ${w.role} incomplete`);
      assert.equal(panel.kind, 'WIRE');
      assert.ok(panel.colorNote, 'a conductor panel should name the usual colour');
    }
  }
});

test('inspecting never reveals where a conductor goes in this lesson', () => {
  // Terminal ids look like sw1.com. Copy that named one would turn inspect
  // into a hint button, which is the one thing it must not become.
  const allCopy = [
    ...Object.values(ROLE_INFO).flatMap((i) => [i.title, i.summary, ...i.points]),
    ...Object.values(COMPONENT_INFO).flatMap((i) => [i.title, i.summary, ...i.points]),
    ...Object.values(TERMINAL_INFO),
  ];
  for (const line of allCopy) {
    assert.ok(!/\b(sw\d|src|lamp|nBox|gBox)\b/.test(line), `copy names a lesson terminal: ${line}`);
    assert.ok(!/\w\.\w{1,4}\b(?!\.)/.test(line.replace(/\b\w+\.\s/g, '')) || !/\bsw\d\./.test(line),
      `copy looks like it contains a terminal id: ${line}`);
  }
});

test('the connection count is reported honestly', () => {
  const lesson = ALL_LESSONS[0];
  const comp = lesson.components()[0];
  const term = comp.terminals[0];
  assert.match(inspectTerminal(comp, term, 0).status, /Nothing landed/);
  assert.match(inspectTerminal(comp, term, 1).status, /1 conductor landed/);
  assert.match(inspectTerminal(comp, term, 3).status, /3 conductors landed/);
});

test('lookups degrade instead of throwing', () => {
  assert.equal(roleInfo('NONSENSE').title, ROLE_INFO[ConductorRole.UNSPECIFIED].title);
  assert.ok(componentInfo('NONSENSE').summary);
  assert.equal(inspectTerminal(null, null), null);
  assert.equal(inspectWire(null), null);
});

test('the switched leg explanation names the symptom of getting it wrong', () => {
  // This is the payoff of inspect: it teaches the failure mode, not just the
  // definition.
  const sw = ROLE_INFO[ConductorRole.SWITCHED_HOT];
  assert.ok(sw.points.some((p) => /always on/i.test(p)));
  const neutral = ROLE_INFO[ConductorRole.NEUTRAL];
  assert.ok(neutral.points.some((p) => /switched neutral/i.test(p)));
  const traveler = ROLE_INFO[ConductorRole.TRAVELER_B];
  assert.ok(traveler.points.some((p) => /common/i.test(p)));
});
