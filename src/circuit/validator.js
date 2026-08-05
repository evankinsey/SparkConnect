// ─── VALIDATION ENGINE ───────────────────────────────────────────────────────
// Requirements: SIM-04, SIM-10, SIM-11, SUX-05, SUX-07, THM-08
//
// Correctness comes from connectivity and function, never from conductor colour
// (SIM-10). Every diagnostic carries:
//   - a `category` so the UI can explain the KIND of mistake without giving away
//     the answer (SUX-05)
//   - `message` drawn from the approved failure vocabulary (SUX-07)
//   - `terminals` so the UI can pulse the right area
//   - `severity` so colour is never the only signal (THM-08)

import { ComponentType, TerminalRole, terminalIndex, loadComponents } from './model.js';
import { truthTable, toggleAnalysis, connectionCounts, solveState } from './solver.js';

export const Severity = { ERROR: 'ERROR', WARNING: 'WARNING', INFO: 'INFO' };

// SUX-07 — the only failure phrasing that ships. Never say the user was shocked
// and never name the specific missing wire here (SUX-05, SUX-06).
export const FailureMessage = {
  CIRCUIT_CHECK_FAILED: 'Circuit check failed',
  WOULD_NOT_OPERATE: 'That path would not operate as intended',
  POSSIBLE_SHORT: 'Possible short path detected',
  COMMON_INCORRECT: 'Common terminal appears incorrect',
  TRAVELER_INCOMPLETE: 'One traveler path is incomplete',
  NEUTRAL_MISSING: 'Neutral continuity is missing',
  GROUND_MISSING: 'Equipment grounding continuity is missing',
  TERMINAL_OVERLOADED: 'Too many conductors land on one terminal',
  ROLE_NOT_ACCEPTED: 'That conductor role does not belong on this terminal',
  DUPLICATE_CONNECTION: 'That connection is already made',
  REQUIRED_TERMINAL_OPEN: 'A required termination is still open',
  LOAD_ALWAYS_ON: 'The load is energized in every switch position',
  LOAD_ALWAYS_OFF: 'The load never energizes in any switch position',
  NOT_TOGGLEABLE: 'The load cannot be controlled from every switch location',
};

export const Category = {
  SHORT: 'SHORT',
  CONTINUITY: 'CONTINUITY',
  GROUNDING: 'GROUNDING',
  SWITCHING: 'SWITCHING',
  TERMINATION: 'TERMINATION',
  ROLE: 'ROLE',
};

const finding = (category, message, opts = {}) => ({
  category,
  message,
  severity: opts.severity ?? Severity.ERROR,
  terminals: opts.terminals ?? [],
  components: opts.components ?? [],
  detail: opts.detail ?? null,
  rule: opts.rule ?? null,
});

// ─── Structural rules (independent of switch position) ───────────────────────

const checkDuplicateAndSelfConnections = (circuit) => {
  const out = [];
  const seen = new Set();
  for (const w of circuit.conductors) {
    if (w.fromTerminal === w.toTerminal) {
      out.push(finding(Category.TERMINATION, FailureMessage.WOULD_NOT_OPERATE, {
        terminals: [w.fromTerminal], rule: 'NO_SELF_LOOP',
        detail: 'A conductor cannot land on the same terminal at both ends.',
      }));
      continue;
    }
    const key = [w.fromTerminal, w.toTerminal].sort().join('::');
    if (seen.has(key)) {
      out.push(finding(Category.TERMINATION, FailureMessage.DUPLICATE_CONNECTION, {
        severity: Severity.WARNING, terminals: [w.fromTerminal, w.toTerminal],
        rule: 'NO_DUPLICATE_CONDUCTOR',
      }));
    }
    seen.add(key);
  }
  return out;
};

const checkTerminalLimits = (circuit) => {
  const out = [];
  const tIndex = terminalIndex(circuit.components);
  for (const [id, count] of connectionCounts(circuit)) {
    const t = tIndex.get(id);
    if (t && count > t.maxConnections) {
      out.push(finding(Category.TERMINATION, FailureMessage.TERMINAL_OVERLOADED, {
        terminals: [id], rule: 'MAX_CONNECTIONS',
        detail: `${t.label}: ${count} conductors, limit ${t.maxConnections}.`,
      }));
    }
  }
  return out;
};

// SIM-10 in its enforcing form: a terminal may REJECT a role (a neutral has no
// business on a traveler screw), but accepting a role never makes a circuit
// correct — only the solver does that.
const checkAcceptedRoles = (circuit) => {
  const out = [];
  const tIndex = terminalIndex(circuit.components);
  for (const w of circuit.conductors) {
    for (const tid of [w.fromTerminal, w.toTerminal]) {
      const t = tIndex.get(tid);
      if (!t || !t.acceptedConductorRoles) continue;
      if (!t.acceptedConductorRoles.includes(w.role)) {
        out.push(finding(Category.ROLE, FailureMessage.ROLE_NOT_ACCEPTED, {
          terminals: [tid], rule: 'ACCEPTED_CONDUCTOR_ROLES',
          detail: `${t.label} accepts ${t.acceptedConductorRoles.join(', ')}.`,
        }));
      }
    }
  }
  return out;
};

const checkRequiredTerminations = (circuit) => {
  const out = [];
  const counts = connectionCounts(circuit);
  for (const t of terminalIndex(circuit.components).values()) {
    if (t.required && (counts.get(t.id) ?? 0) === 0) {
      out.push(finding(Category.TERMINATION, FailureMessage.REQUIRED_TERMINAL_OPEN, {
        terminals: [t.id], rule: 'REQUIRED_TERMINAL_CONNECTED',
        detail: `${t.label} is required for this lesson.`,
      }));
    }
  }
  return out;
};

// ─── Behavioural rules (across every switch state) ───────────────────────────

const checkShorts = (circuit) => {
  const { rows } = truthTable(circuit);
  const shorted = rows.filter((r) => r.shortCircuit);
  if (!shorted.length) return [];
  return [finding(Category.SHORT, FailureMessage.POSSIBLE_SHORT, {
    rule: 'NO_SHORT_IN_ANY_STATE',
    detail: `Supply and grounded conductor share a path in ${shorted.length} of ${rows.length} switch positions, bypassing the load.`,
  })];
};

const checkNeutralContinuity = (circuit) => {
  const out = [];
  const { rows } = truthTable(circuit);
  for (const load of loadComponents(circuit.components)) {
    // The grounded conductor runs to the load unswitched — it must reach the
    // supply in EVERY position. A neutral that comes and goes is a switched
    // neutral, which is exactly what this lesson must not teach.
    const everyState = rows.every((r) => {
      const l = r.loads.find((x) => x.id === load.id);
      return l && l.neutralReachesSupply;
    });
    if (!everyState) {
      out.push(finding(Category.CONTINUITY, FailureMessage.NEUTRAL_MISSING, {
        components: [load.id], rule: 'NEUTRAL_UNSWITCHED_AT_LOAD',
      }));
    }
  }
  return out;
};

const checkGrounding = (circuit) => {
  const first = solveState(circuit, {});
  if (!first.ungroundedComponents.length) return [];
  return [finding(Category.GROUNDING, FailureMessage.GROUND_MISSING, {
    components: first.ungroundedComponents, rule: 'EGC_CONTINUITY',
    detail: 'Equipment grounding conductors must be bonded back to the supply ground.',
  })];
};

const checkSwitchingBehaviour = (circuit, expectations) => {
  const out = [];
  const analysis = toggleAnalysis(circuit);

  if (analysis.alwaysOn) {
    out.push(finding(Category.SWITCHING, FailureMessage.LOAD_ALWAYS_ON, { rule: 'LOAD_MUST_SWITCH' }));
    return out;
  }
  if (analysis.alwaysOff) {
    out.push(finding(Category.SWITCHING, FailureMessage.LOAD_ALWAYS_OFF, { rule: 'LOAD_MUST_SWITCH' }));
    return out;
  }
  if (expectations.everySwitchControlsLoad && !analysis.everySwitchControlsLoad) {
    const dead = analysis.perSwitch.filter((s) => !s.controlsLoad);
    // A 3-way whose common carries a traveler is the classic version of this
    // failure, so point at the common family without naming the fix (SUX-05).
    const threeWayInvolved = dead.some((s) => {
      const c = circuit.components.find((x) => x.id === s.switchId);
      return c && (c.type === ComponentType.SWITCH_THREE_WAY || c.type === ComponentType.SWITCH_FOUR_WAY);
    });
    out.push(finding(Category.SWITCHING,
      threeWayInvolved ? FailureMessage.COMMON_INCORRECT : FailureMessage.NOT_TOGGLEABLE, {
        components: dead.map((s) => s.switchId), rule: 'TOGGLEABLE_FROM_EVERY_LOCATION',
        detail: 'Check which conductor lands on each common, and whether both travelers run between corresponding traveler terminals.',
      }));
  }
  return out;
};

// A traveler pair that is open at one end shows up as a 3-way whose position
// only matters in some combinations. Reported separately so hints can be precise.
const checkTravelerPairs = (circuit) => {
  const out = [];
  const analysis = toggleAnalysis(circuit);
  const partial = analysis.perSwitch.filter((s) => !s.controlsLoad && s.ineffectiveCombos > 0);
  for (const s of partial) {
    const c = circuit.components.find((x) => x.id === s.switchId);
    if (!c || c.type !== ComponentType.SWITCH_THREE_WAY) continue;
    const tIndex = terminalIndex(circuit.components);
    const travelers = c.terminals.filter((t) => t.semanticRole === TerminalRole.SWITCH_TRAVELER);
    const counts = connectionCounts(circuit);
    const open = travelers.filter((t) => (counts.get(t.id) ?? 0) === 0);
    if (open.length) {
      out.push(finding(Category.CONTINUITY, FailureMessage.TRAVELER_INCOMPLETE, {
        terminals: open.map((t) => t.id), components: [c.id], rule: 'TRAVELER_PAIR_COMPLETE',
      }));
    }
    void tIndex;
  }
  return out;
};

/**
 * Full validation pass.
 *
 * @param circuit {{components, conductors}}
 * @param expectations {{everySwitchControlsLoad?: boolean, requireGrounding?: boolean, requireNeutralAtLoad?: boolean}}
 * @returns {{valid, findings, truthTable, toggleAnalysis}}
 */
export const validate = (circuit, expectations = {}) => {
  const exp = {
    everySwitchControlsLoad: true,
    requireGrounding: true,
    requireNeutralAtLoad: true,
    ...expectations,
  };

  const findings = [
    ...checkDuplicateAndSelfConnections(circuit),
    ...checkTerminalLimits(circuit),
    ...checkAcceptedRoles(circuit),
    ...checkRequiredTerminations(circuit),
    ...checkShorts(circuit),
    ...(exp.requireNeutralAtLoad ? checkNeutralContinuity(circuit) : []),
    ...(exp.requireGrounding ? checkGrounding(circuit) : []),
    ...checkSwitchingBehaviour(circuit, exp),
    ...checkTravelerPairs(circuit),
  ];

  // De-duplicate identical messages so the user sees one clear failure, not six.
  const seen = new Set();
  const deduped = findings.filter((f) => {
    const key = `${f.rule}::${f.message}::${f.components.join(',')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const errors = deduped.filter((f) => f.severity === Severity.ERROR);
  return {
    valid: errors.length === 0,
    findings: deduped,
    errors,
    warnings: deduped.filter((f) => f.severity === Severity.WARNING),
    truthTable: truthTable(circuit),
    toggleAnalysis: toggleAnalysis(circuit),
  };
};

/**
 * Primary failure category, for the UI headline and for the structured payload
 * sent to Spark AI (AI-03). Returns null when the circuit is valid.
 */
export const primaryFailure = (result) => {
  if (result.valid) return null;
  const order = [Category.SHORT, Category.GROUNDING, Category.CONTINUITY, Category.SWITCHING, Category.TERMINATION, Category.ROLE];
  for (const cat of order) {
    const hit = result.errors.find((f) => f.category === cat);
    if (hit) return hit;
  }
  return result.errors[0];
};
