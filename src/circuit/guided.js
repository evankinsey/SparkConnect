// ─── GUIDED MODE ─────────────────────────────────────────────────────────────
// Duolingo, not a schematic dump. Guided mode walks a lesson one conductor at
// a time: pick which conductor you are running, then tap where it belongs.
// A wrong tap teaches instead of failing — the coach line names the mistake
// without printing the answer.
//
// Pure module: no React, no storage. Every rule here is testable on Node, and
// the screen stays a renderer. Expert mode is untouched — this file only ever
// CONSUMES a lesson's reference solution, it never grades a circuit; the
// validator still owns correctness at the end.

import { ComponentType, ConductorRole } from './model.js';

// Friendly names for the chooser chips and coach lines. These are trade terms,
// not engine enum names — "Switched leg", not SWITCHED_HOT.
export const ROLE_NAMES = Object.freeze({
  [ConductorRole.LINE]: 'Hot (line)',
  [ConductorRole.SWITCHED_HOT]: 'Switched leg',
  [ConductorRole.TRAVELER_A]: 'Traveler A',
  [ConductorRole.TRAVELER_B]: 'Traveler B',
  [ConductorRole.NEUTRAL]: 'Neutral',
  [ConductorRole.EQUIPMENT_GROUND]: 'Ground',
});

export const roleName = (role) => ROLE_NAMES[role] ?? String(role);

// Terminal ids are `${componentId}.${localId}` (model.terminalId). Component
// ids never contain dots, so the split is safe.
const componentOf = (terminalId) => String(terminalId).split('.')[0];

/**
 * Normalize a terminal for matching. All points on a splice are one node, so
 * landing a conductor on p3 instead of p2 is electrically identical — guided
 * mode must not punish it. Everything else matches on the exact terminal.
 */
const endpointKey = (components, terminalId) => {
  const comp = components.find((c) => c.id === componentOf(terminalId));
  return comp && comp.type === ComponentType.SPLICE ? comp.id : terminalId;
};

const pairKey = (components, a, b) =>
  [endpointKey(components, a), endpointKey(components, b)].sort().join('~');

/** The solution conductors still to be run, as guided-mode state. */
export const buildGuide = (lesson) => {
  const solution = lesson.solution();
  return {
    lessonId: lesson.id,
    total: solution.length,
    remaining: solution.map((c, i) => ({
      key: `g${i}`,
      role: c.role,
      fromTerminal: c.fromTerminal,
      toTerminal: c.toTerminal,
    })),
  };
};

/** Chip data for "Choose your conductor": each role still needed, with count. */
export const remainingRoles = (remaining) => {
  const counts = new Map();
  for (const c of remaining) counts.set(c.role, (counts.get(c.role) ?? 0) + 1);
  return [...counts.entries()].map(([role, count]) => ({ role, count, label: roleName(role) }));
};

/** The step prompt once a conductor type is chosen. Never names the endpoints. */
export const promptForRole = (role) => {
  switch (role) {
    case ConductorRole.LINE: return 'Run the hot. Tap where it starts, then where it lands.';
    case ConductorRole.SWITCHED_HOT: return 'Run the switched leg — the conductor the switch controls.';
    case ConductorRole.TRAVELER_A:
    case ConductorRole.TRAVELER_B: return 'Run a traveler between the three-way switches.';
    case ConductorRole.NEUTRAL: return 'Run the neutral. It is never switched.';
    case ConductorRole.EQUIPMENT_GROUND: return 'Bond a ground. Every device gets one.';
    default: return 'Tap the two points this conductor connects.';
  }
};

const labelFor = (components, terminalId) => {
  const comp = components.find((c) => c.id === componentOf(terminalId));
  return comp?.label ?? 'the device';
};

/**
 * Judge one guided tap-pair. Returns:
 *   { ok: true, conductor: {fromTerminal, toTerminal, role}, consumedKey }
 *   { ok: false, reason: 'role' | 'endpoints', coach }
 *
 * The coach line teaches without printing the answer: a role mistake says the
 * points connect but not with that conductor; an endpoint mistake names where
 * the conductor STARTS (the level-2 nudge), never the full run.
 */
export const matchGuidedTap = (components, remaining, role, termA, termB) => {
  const tapped = pairKey(components, termA, termB);

  const candidates = remaining.filter((c) => c.role === role);
  const exact = candidates.find((c) => pairKey(components, c.fromTerminal, c.toTerminal) === tapped);
  if (exact) {
    return {
      ok: true,
      consumedKey: exact.key,
      // Keep the user's actual terminals (their splice point choice is valid).
      conductor: { fromTerminal: termA, toTerminal: termB, role },
    };
  }

  const otherRole = remaining.find((c) => c.role !== role && pairKey(components, c.fromTerminal, c.toTerminal) === tapped);
  if (otherRole) {
    return {
      ok: false,
      reason: 'role',
      coach: `Those two points do connect in the finished circuit — just not with the ${roleName(role).toLowerCase()}. Look at your conductor choice.`,
    };
  }

  if (candidates.length === 0) {
    return {
      ok: false,
      reason: 'role',
      coach: `Every ${roleName(role).toLowerCase()} is already run. Pick another conductor type.`,
    };
  }

  // Endpoint mistake. If one end was right, say so; otherwise point at the
  // starting device of the nearest un-run conductor of this role.
  const keys = [endpointKey(components, termA), endpointKey(components, termB)];
  const halfRight = candidates.find((c) =>
    keys.includes(endpointKey(components, c.fromTerminal)) || keys.includes(endpointKey(components, c.toTerminal)));
  if (halfRight) {
    const rightEnd = keys.includes(endpointKey(components, halfRight.fromTerminal))
      ? halfRight.fromTerminal : halfRight.toTerminal;
    return {
      ok: false,
      reason: 'endpoints',
      coach: `One end is right — the ${roleName(role).toLowerCase()} does land on the ${labelFor(components, rightEnd)}. Follow it to the other end.`,
    };
  }
  return {
    ok: false,
    reason: 'endpoints',
    coach: `Start at the ${labelFor(components, candidates[0].fromTerminal)} — that is where the next ${roleName(role).toLowerCase()} begins.`,
  };
};

export const guideDone = (remaining) => remaining.length === 0;
