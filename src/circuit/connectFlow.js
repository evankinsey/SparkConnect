// ─── TAP ONE END, THEN THE OTHER ─────────────────────────────────────────────
// The interaction underneath "tap a conductor, watch it highlight, tap where it
// goes, watch it run".
//
// THE TRAP THIS MODULE IS BUILT TO AVOID. The obvious implementation is: when
// somebody picks a terminal, light up the terminals a conductor could go to.
// That feels helpful and it destroys the exercise. Once the legal destinations
// glow, wiring a three-way stops being "where does the traveler land" and
// becomes "tap the green one" — and a person can complete every lesson in the
// app without ever learning what a common screw is.
//
// So highlighting is MODE-DEPENDENT, and that is the whole design:
//
//   EXPERT   every terminal is tappable and NOTHING is scored on screen. You
//            run what you think is right and you test it. Wrong connections are
//            allowed to be made — being able to build it wrong is the only
//            reason building it right means anything.
//
//   GUIDED   the current conductor's role is known, so the app may narrow to
//            the DEVICES that role touches. Never to a single terminal: "the
//            traveler lands somewhere on this switch" is a lesson, "the
//            traveler lands HERE" is a transcription exercise.
//
// The refusals below are all MECHANICAL — a terminal joined to itself, a
// duplicate run, a terminal that does not exist. None of them encodes whether
// the connection is electrically right, because that answer belongs to the
// solver at test time, not to the finger that is mid-tap.
//
// Pure module: no React, no animation. `connectionRun()` returns the endpoints
// and the role; drawing it is the screen's job.

import { ConductorRole, componentIndex, terminalIndex } from './model.js';
import { roleName } from './guided.js';

export const Mode = Object.freeze({
  EXPERT: 'EXPERT',
  GUIDED: 'GUIDED',
});

export const Highlight = Object.freeze({
  SELECTED: 'SELECTED',       // the end you are holding
  CANDIDATE: 'CANDIDATE',     // guided mode only, and only ever device-level
  OCCUPIED: 'OCCUPIED',       // already has this exact run on it
  NONE: 'NONE',
});

const componentOf = (terminalId) => String(terminalId ?? '').split('.')[0];

const runKey = (a, b) => [a, b].sort().join('~');

/** Every conductor already run, as unordered endpoint keys. */
const existingRuns = (circuit) =>
  new Set((circuit?.conductors ?? []).map((c) => runKey(c.fromTerminal, c.toTerminal)));

/**
 * Pick up one end.
 *
 * `role` is what the user chose to run. In guided mode it drives the device
 * hints; in expert mode it is carried along and used for nothing else.
 */
export const beginConnection = (circuit, fromTerminalId, { mode = Mode.EXPERT, role = ConductorRole.UNSPECIFIED, guide = null } = {}) => {
  if (!circuit) return null;
  const tIndex = terminalIndex(circuit.components);
  if (!tIndex.has(fromTerminalId)) return null;

  return Object.freeze({
    from: fromTerminalId,
    role,
    mode,
    guideKeys: Object.freeze((guide?.remaining ?? []).map((c) => ({
      key: c.key, role: c.role, from: c.fromTerminal, to: c.toTerminal,
    }))),
  });
};

export const cancelConnection = () => null;

/**
 * Can this be the other end?
 *
 * Mechanical checks only. `{ ok: false, reason }` is always something a person
 * can see for themselves once it is said — never "that is the wrong screw".
 */
export const canConnect = (circuit, selection, toTerminalId) => {
  if (!circuit || !selection) return { ok: false, reason: 'Nothing is selected.' };
  const tIndex = terminalIndex(circuit.components);
  if (!tIndex.has(toTerminalId)) return { ok: false, reason: 'That is not a terminal.' };

  if (toTerminalId === selection.from) {
    return { ok: false, reason: 'A conductor needs two different ends. Tap somewhere else, or tap this one again to let go.' };
  }
  if (componentOf(toTerminalId) === componentOf(selection.from)) {
    // Jumpering two screws on one device is a real thing people do and it is
    // never what a lesson wants, so it is refused with the reason rather than
    // silently ignored.
    return { ok: false, reason: 'Both ends are on the same device. A conductor runs between devices.' };
  }
  if (existingRuns(circuit).has(runKey(selection.from, toTerminalId))) {
    return { ok: false, reason: 'There is already a conductor between those two points.' };
  }
  return { ok: true, reason: null };
};

/**
 * How every terminal should be drawn while one end is held.
 *
 * In EXPERT mode this returns SELECTED for the held terminal and NONE for
 * everything else. That is deliberate and it is the most important line in the
 * file: an expert-mode screen that highlights destinations has quietly become a
 * different, much easier app.
 */
export const highlights = (circuit, selection) => {
  const out = new Map();
  if (!circuit) return out;
  const tIndex = terminalIndex(circuit.components);

  if (!selection) {
    for (const id of tIndex.keys()) out.set(id, Highlight.NONE);
    return out;
  }

  const runs = existingRuns(circuit);
  // Guided mode may narrow to DEVICES the chosen role touches — never to a
  // terminal. "The traveler lands somewhere on this switch" is a lesson; "the
  // traveler lands here" is transcription.
  const hintDevices = selection.mode === Mode.GUIDED
    ? new Set(selection.guideKeys
      .filter((g) => g.role === selection.role)
      .flatMap((g) => [componentOf(g.from), componentOf(g.to)])
      .filter((d) => d !== componentOf(selection.from)))
    : null;

  for (const id of tIndex.keys()) {
    if (id === selection.from) { out.set(id, Highlight.SELECTED); continue; }
    if (runs.has(runKey(selection.from, id))) { out.set(id, Highlight.OCCUPIED); continue; }
    if (hintDevices && hintDevices.has(componentOf(id))) { out.set(id, Highlight.CANDIDATE); continue; }
    out.set(id, Highlight.NONE);
  }
  return out;
};

/**
 * Complete the run.
 *
 * Returns the conductor to add. It does NOT judge whether the connection is
 * correct: an expert-mode user is allowed to build it wrong and find out when
 * they test it, and taking that away removes the only thing that makes building
 * it right mean anything.
 */
export const completeConnection = (circuit, selection, toTerminalId) => {
  const check = canConnect(circuit, selection, toTerminalId);
  if (!check.ok) return Object.freeze({ ok: false, reason: check.reason, conductor: null });

  return Object.freeze({
    ok: true,
    reason: null,
    conductor: Object.freeze({
      fromTerminal: selection.from,
      toTerminal: toTerminalId,
      role: selection.role,
    }),
  });
};

/**
 * The payload for drawing the run.
 *
 * Device labels and the role's own colour note, so the animation can be
 * narrated — "black, supply to the switch" — rather than being a line that
 * appears. Positions are the screen's business; identity is this module's.
 */
export const connectionRun = (circuit, conductor) => {
  if (!circuit || !conductor) return null;
  const cIndex = componentIndex(circuit.components);
  const tIndex = terminalIndex(circuit.components);
  const from = tIndex.get(conductor.fromTerminal);
  const to = tIndex.get(conductor.toTerminal);
  if (!from || !to) return null;

  const end = (t) => Object.freeze({
    terminalId: t.id,
    terminal: t.label || t.localId,
    device: cIndex.get(componentOf(t.id))?.label ?? 'device',
  });

  return Object.freeze({
    role: conductor.role,
    roleLabel: roleName(conductor.role),
    from: end(from),
    to: end(to),
    narration: `${roleName(conductor.role)}: ${cIndex.get(componentOf(from.id))?.label ?? 'device'} `
      + `to ${cIndex.get(componentOf(to.id))?.label ?? 'device'}.`,
  });
};

/** Undo the last run, which is the other half of being allowed to be wrong. */
export const removeConductor = (circuit, conductor) => {
  if (!circuit || !conductor) return circuit;
  const key = runKey(conductor.fromTerminal, conductor.toTerminal);
  return Object.freeze({
    ...circuit,
    conductors: Object.freeze(circuit.conductors.filter(
      (c) => runKey(c.fromTerminal, c.toTerminal) !== key,
    )),
  });
};
