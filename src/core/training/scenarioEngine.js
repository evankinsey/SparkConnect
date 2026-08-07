// ─── SCENARIO ENGINE ─────────────────────────────────────────────────────────
// Thousands of troubleshooting scenarios, none of them written by hand.
//
// The shipped scenarios in troubleshooting.js were each authored: someone picked
// a fault, wrote a symptom, and wrote three wrong answers. That does not scale,
// and worse, every hand-written line is a chance to describe a symptom the
// circuit would not actually produce.
//
// This generates them instead, and the generation is what makes them safe:
//
//   FAULT SPACE      derived — every open and every mislanding the lesson's own
//                    solution admits. Add a lesson, its scenarios exist.
//   SYMPTOM          derived — inject the fault, ask the solver what happens
//   METER READINGS   derived — from what actually reaches the supply
//   DISTRACTORS      derived — other faults on the same circuit
//   WHY WRONG        derived — inject the DISTRACTOR and compare. The engine
//                    computes why an answer is wrong; no author asserts it.
//
// That last one is the part worth the file. "That would have left 120 V to
// ground at the fixture; you are reading nothing" is a statement the engine can
// prove, and it is exactly the kind of sentence a language model would otherwise
// invent.
//
// Two rules keep it honest:
//
//   1. A fault that changes nothing observable is not a scenario. Filtered out.
//   2. A fault that produces IDENTICAL symptoms and IDENTICAL meter readings to
//      the real one is not a wrong answer — it genuinely cannot be ruled out.
//      Those are excluded from the choices and reported separately, because
//      marking one of them "wrong" would be teaching a falsehood.
//
// Only the narrative varies freely — room, customer, complaint wording. That is
// the authority boundary: the story may be written, the electricity may not.
//
// Pure module: no React, no storage, no network.

import { ConductorRole, TerminalRole, allTerminals } from '../../circuit/model.js';
import { truthTable, solveState } from '../../circuit/solver.js';
import { lessonById, solutionCircuit, ALL_LESSONS } from '../../circuit/lessons/index.js';
import { TRAINING_DISCLAIMER } from '../../circuit/review.js';
import { FaultKind, injectFault, deriveSymptom } from './troubleshooting.js';

// ─── Naming things the way an electrician would ──────────────────────────────

const ROLE_NAME = {
  [ConductorRole.LINE]: 'the ungrounded conductor',
  [ConductorRole.SWITCHED_HOT]: 'the switched leg',
  [ConductorRole.NEUTRAL]: 'the grounded conductor',
  [ConductorRole.EQUIPMENT_GROUND]: 'an equipment grounding conductor',
  [ConductorRole.TRAVELER_A]: 'a traveler',
  [ConductorRole.TRAVELER_B]: 'a traveler',
  [ConductorRole.COMMON]: 'the common conductor',
  [ConductorRole.LOAD]: 'the load conductor',
  [ConductorRole.UNSPECIFIED]: 'a conductor',
};

const roleName = (w) => ROLE_NAME[w.role] ?? 'a conductor';

/** "Single-Pole Switch Screw 2" — enough to point at one screw and no other. */
const terminalNamer = (components) => {
  const byId = new Map();
  for (const c of components) {
    for (const t of c.terminals) byId.set(t.id, `${c.label} ${t.label}`);
  }
  return (id) => byId.get(id) ?? id;
};

const sameComponent = (a, b) => String(a).split('.')[0] === String(b).split('.')[0];

// ─── What the solver is entitled to have an opinion about ────────────────────

const System = { GROUND: 'GROUND', NEUTRAL: 'NEUTRAL', HOT: 'HOT' };

/**
 * Which system a terminal belongs to, derived from the lesson's own solution
 * rather than hardcoded: a splice point is part of the grounding system when the
 * known-good wiring lands an EGC on it.
 */
const systemMap = (components, solution) => {
  const map = new Map();
  for (const c of components) {
    for (const t of c.terminals) {
      if (t.semanticRole === TerminalRole.EQUIPMENT_GROUND || t.semanticRole === TerminalRole.SOURCE_GROUND) {
        map.set(t.id, System.GROUND);
      } else if (t.semanticRole === TerminalRole.SOURCE_NEUTRAL || t.semanticRole === TerminalRole.LOAD_NEUTRAL) {
        map.set(t.id, System.NEUTRAL);
      } else if (t.semanticRole !== TerminalRole.SPLICE) {
        map.set(t.id, System.HOT);
      }
    }
  }
  // Splices take the system of whatever the correct wiring lands on them.
  for (const w of solution) {
    const s = conductorSystem(w);
    for (const end of [w.fromTerminal, w.toTerminal]) if (!map.has(end)) map.set(end, s);
  }
  return map;
};

const conductorSystem = (w) => {
  if (w.role === ConductorRole.EQUIPMENT_GROUND) return System.GROUND;
  if (w.role === ConductorRole.NEUTRAL) return System.NEUTRAL;
  return System.HOT;
};

/**
 * The one class of fault this engine refuses to generate.
 *
 * The circuit model gives the supply three independent terminals with no bond
 * between them — there is no main bonding jumper in it. That is fine for
 * teaching switching, but it means the solver gets the consequences of any fault
 * that crosses into the grounding system badly wrong:
 *
 *   · an ungrounded conductor landed on the EGC reads as "the light is simply
 *     dead". In a real installation the bonding jumper makes that a bolted fault
 *     and the overcurrent device opens immediately.
 *   · an EGC landed on the grounded conductor downstream reads as "everything
 *     still works", when the actual hazard is current on the grounding system —
 *     something this solver does not represent at all.
 *
 * Both are real faults and both belong in the app one day. Neither belongs in a
 * generated scenario until the model can say what they do, because a scenario
 * that describes them is a scenario that teaches the wrong thing. Restricting
 * the fault space is honest; describing a consequence the engine cannot derive
 * is not.
 */
const crossesGroundingSystem = (systems, conductor, destination) => {
  const from = conductorSystem(conductor);
  const to = systems.get(destination);
  if (!to) return true; // unknown terminal — do not guess
  return (from === System.GROUND) !== (to === System.GROUND);
};

// ─── The fault space ─────────────────────────────────────────────────────────

/**
 * Every fault that can be injected into a lesson, derived from its own solution
 * rather than listed.
 *
 * Targets are expressed as `{ between: [a, b] }` because that is the only shape
 * `injectFault` matches on for a positional conductor — a target it cannot match
 * silently produces a circuit with no fault in it at all.
 *
 * Ordered deterministically, so a given (lesson, index) always names the same
 * fault and a scenario id stays shareable and replayable.
 */
export const enumerateFaults = (lesson) => {
  const solution = lesson.solution();
  const components = lesson.components();
  const nameOf = terminalNamer(components);
  const terminals = allTerminals(components).map((t) => t.id);
  const systems = systemMap(components, solution);
  const out = [];

  // 1. Open conductor — one wire disconnected.
  for (const w of solution) {
    out.push({
      kind: FaultKind.OPEN_CONDUCTOR,
      target: { between: [w.fromTerminal, w.toTerminal] },
      role: w.role,
      text: `${cap(roleName(w))} is open — the run between ${nameOf(w.fromTerminal)} and ${nameOf(w.toTerminal)}.`,
    });
  }

  // 2. Mislanded — one end of a wire moved to a terminal that exists elsewhere
  //    on the circuit. This is the fault electricians actually make.
  for (const w of solution) {
    for (const to of terminals) {
      if (to === w.toTerminal || to === w.fromTerminal) continue;
      // Landing elsewhere on the same device the wire already reaches is not a
      // relocation — a splice bonds all of its points, so nothing would change.
      if (sameComponent(to, w.toTerminal)) continue;
      // A fault whose consequence the solver cannot derive is not generated.
      if (crossesGroundingSystem(systems, w, to)) continue;
      out.push({
        kind: FaultKind.MISLANDED,
        target: { between: [w.fromTerminal, w.toTerminal] },
        end: 'to',
        to,
        role: w.role,
        text: `${cap(roleName(w))} that belongs on ${nameOf(w.toTerminal)} is landed on ${nameOf(to)} instead.`,
      });
    }
  }

  return out;
};

// ─── Meter readings ──────────────────────────────────────────────────────────

/**
 * What a meter would actually read, derived from the solved circuit.
 *
 * Deliberately limited to what the solver genuinely supports: whether the
 * ungrounded conductor and the grounded conductor reach the supply at the load,
 * and whether the equipment ground is continuous back to the supply. Anything
 * beyond that — impedance, voltage drop under load, phantom voltage on an open
 * conductor — is not modelled, and inventing a number for it would be the same
 * class of error as inventing a symptom.
 *
 * `nominal` labels the reading with the system voltage the lesson assumes. It is
 * a label, not a claim about any installation.
 */
export const meterReadings = (circuit, switchState = {}, { nominal = 120 } = {}) => {
  const state = solveState(circuit, switchState);
  const ungrounded = new Set(state.ungroundedComponents);
  const out = [];

  for (const load of state.loads) {
    const hot = load.hotReachesSupply;
    const neu = load.neutralReachesSupply;

    out.push({
      at: load.id,
      probe: 'ungrounded to grounded, at the load',
      reads: hot && neu ? `${nominal} V` : '0 V',
      why: hot && neu
        ? 'Both conductors reach the supply, so the load has a complete path.'
        : !hot && !neu ? 'Neither conductor reaches the supply from here.'
          : !hot ? 'The grounded conductor is intact; the ungrounded side is not reaching this point.'
            : 'The ungrounded conductor is present; the return path to the supply is open.',
    });

    out.push({
      at: load.id,
      probe: 'ungrounded to equipment ground, at the load',
      reads: hot && !ungrounded.has(load.id) ? `${nominal} V` : '0 V',
      why: !hot ? 'Nothing energized reaches this point.'
        : ungrounded.has(load.id) ? 'The ungrounded conductor is present, but there is no ground here to read against.'
          : 'The ungrounded conductor reaches this point and the equipment ground is continuous.',
    });

    out.push({
      at: load.id,
      probe: 'equipment ground continuity, at the load',
      reads: ungrounded.has(load.id) ? 'open' : 'continuous',
      why: ungrounded.has(load.id)
        ? 'The equipment grounding conductor does not make it back to the supply.'
        : 'The equipment grounding conductor is continuous back to the supply.',
    });
  }

  if (state.shortCircuit) {
    out.push({
      at: 'supply',
      probe: 'what happens on energizing',
      reads: 'the overcurrent device opens',
      why: 'The ungrounded and grounded conductors share a path that bypasses the load.',
    });
  }

  return out;
};

const positionLabels = (components, switchIds) => {
  const byId = new Map(components.map((c) => [c.id, c]));
  return switchIds.map((id) => {
    const c = byId.get(id);
    return { id, label: c?.label ?? id, labels: c?.metadata?.positionLabels ?? ['0', '1'] };
  });
};

/** Readings in every switch position, which is how a real diagnosis proceeds. */
export const readingsAcrossStates = (circuit, options = {}) => {
  const { switchIds, rows } = truthTable(circuit);
  const meta = positionLabels(circuit.components, switchIds);
  return rows.map((r) => ({
    positions: Object.fromEntries(
      meta.map((m, i) => [m.id, m.labels[r.stateVector[i]] ?? String(r.stateVector[i])]),
    ),
    readings: meterReadings(circuit, r.state, options),
    lightOn: r.anyLoadEnergized,
    breakerTrips: r.shortCircuit,
  }));
};

// ─── Fault profiles, computed once per lesson ────────────────────────────────
//
// Every question the engine answers — is this observable, are these two faults
// distinguishable, what would that one have done — is a comparison of two
// profiles. Computing them once per lesson turns an O(faults²) pile of solver
// calls into a table lookup.

const PROFILE_CACHE = new Map();

/**
 * `conductor()` hands out ids from a module-level counter, so calling
 * `lesson.solution()` twice yields wires with different ids and otherwise
 * identical contents. A scenario embeds its circuit, so left alone that counter
 * makes a scenario id un-replayable — the same id would produce a circuit that
 * does not compare equal to the one the user saw. Renumber by position.
 */
const stableIds = (lessonId, conductors) =>
  conductors.map((w, i) => ({ ...w, id: `${lessonId}-w${i + 1}` }));

const healthyConductors = (lesson) => stableIds(lesson.id, solutionCircuit(lesson).conductors);

const profileOf = (lesson, conductors) => {
  const circuit = { components: lesson.components(), conductors };
  const symptom = deriveSymptom(circuit);
  const states = readingsAcrossStates(circuit);
  return { circuit, symptom, states, signature: signatureOf(symptom, states) };
};

const signatureOf = (symptom, states) => JSON.stringify([
  symptom.summary,
  states.map((s) => [s.lightOn, s.breakerTrips, s.readings.map((r) => `${r.at}|${r.probe}|${r.reads}`)]),
]);

/**
 * The lesson's healthy circuit plus every OBSERVABLE fault, each with its
 * symptom, its readings and a signature that says what a meter could tell apart.
 */
export const lessonProfile = (lesson) => {
  const cached = PROFILE_CACHE.get(lesson.id);
  if (cached) return cached;

  const healthy = profileOf(lesson, healthyConductors(lesson));
  const seen = new Set();
  const faults = [];

  for (const fault of enumerateFaults(lesson)) {
    const p = profileOf(lesson, injectFault(healthy.circuit.conductors, fault));
    // A fault nothing can detect is not a scenario.
    if (p.signature === healthy.signature) continue;
    // Two enumerated faults can describe the same physical mistake in the same
    // words. Keeping both would put duplicate answers in one question.
    if (seen.has(fault.text)) continue;
    seen.add(fault.text);
    faults.push({ ...p, fault });
  }

  const profile = Object.freeze({ lesson, healthy, faults });
  PROFILE_CACHE.set(lesson.id, profile);
  return profile;
};

/** Test seam — the cache is keyed on lesson id and lessons are immutable. */
export const clearProfileCache = () => PROFILE_CACHE.clear();

/** A fault is observable when a meter or the customer could tell. */
export const isObservable = (lesson, fault) => {
  const healthy = profileOf(lesson, healthyConductors(lesson));
  const p = profileOf(lesson, injectFault(healthy.circuit.conductors, fault));
  return p.signature !== healthy.signature;
};

// ─── Why a wrong answer is wrong ─────────────────────────────────────────────

export const WhyBasis = Object.freeze({
  SYMPTOM: 'SYMPTOM',       // the customer complaint alone rules it out
  BEHAVIOUR: 'BEHAVIOUR',   // same complaint, but it acts differently in some switch position
  METER: 'METER',           // same complaint, same behaviour, different reading
  NONE: 'NONE',             // nothing separates them — not a wrong answer at all
});

/**
 * The heart of it.
 *
 * A distractor is wrong because it would have produced something DIFFERENT, and
 * the engine can say exactly what. Compare the distractor's profile with the
 * observed one and report the first difference a person could actually find:
 * the complaint first, then the meter.
 *
 * No author writes this sentence, so no author can get it wrong, and no model is
 * asked to invent it.
 */
export const contrast = (observed, would) => {
  if (would.symptom.summary !== observed.symptom.summary) {
    return {
      basis: WhyBasis.SYMPTOM,
      distinguishable: true,
      wouldCause: would.symptom.summary,
      text: `That would have caused: ${lower(would.symptom.summary)} What you are actually seeing is: ${lower(observed.symptom.summary)}`,
    };
  }

  // The complaint summarises every switch position at once, so two faults can
  // share a summary and still behave differently in one particular position.
  // That difference is the easiest thing in the world to find — you flip the
  // switch — so it has to be checked before reaching for a meter.
  const acts = firstBehaviourDifference(observed, would);
  if (acts) {
    return {
      basis: WhyBasis.BEHAVIOUR,
      distinguishable: true,
      wouldCause: acts.would,
      text: `The complaint reads the same either way, but they do not behave the same. `
        + `${acts.positions}, that fault would ${acts.would}. What is actually happening is ${acts.observed}.`,
    };
  }

  const diff = firstReadingDifference(observed, would);
  if (diff) {
    return {
      basis: WhyBasis.METER,
      distinguishable: true,
      wouldCause: `${diff.probe} would read ${diff.wouldRead}`,
      probe: diff.probe,
      text: `The complaint looks the same either way — the meter separates them. `
        + `With that fault, ${diff.probe}${diff.positions} would read ${diff.wouldRead}. `
        + `You are reading ${diff.observedRead}.`,
    };
  }

  // Same complaint, same readings. Calling this a wrong answer would be a lie:
  // in the field you would have to open something up to tell.
  return {
    basis: WhyBasis.NONE,
    distinguishable: false,
    text: 'Nothing in the complaint or the readings separates that from the actual fault. '
      + 'Both are still on the table — you would have to open up and check.',
  };
};

const describePositions = (positions) => {
  const entries = Object.entries(positions);
  if (!entries.length) return 'With the circuit energized';
  return `With ${entries.map(([id, p]) => `${id} at ${p}`).join(' and ')}`;
};

const firstBehaviourDifference = (observed, would) => {
  for (let i = 0; i < observed.states.length; i++) {
    const a = observed.states[i];
    const b = would.states[i];
    if (!b) break;
    if (a.breakerTrips !== b.breakerTrips) {
      return {
        positions: describePositions(a.positions),
        would: b.breakerTrips ? 'trip the overcurrent device' : 'leave the overcurrent device holding',
        observed: a.breakerTrips ? 'the overcurrent device opening' : 'the overcurrent device holding',
      };
    }
    if (a.lightOn !== b.lightOn) {
      return {
        positions: describePositions(a.positions),
        would: b.lightOn ? 'leave the light on' : 'leave the light off',
        observed: a.lightOn ? 'the light on' : 'the light off',
      };
    }
  }
  return null;
};

const firstReadingDifference = (observed, would) => {
  for (let i = 0; i < observed.states.length; i++) {
    const a = observed.states[i];
    const b = would.states[i];
    if (!b) break;
    // Readings are keyed by where and what they probe, not by position in the
    // list — a state that trips the breaker carries an extra row, and lining the
    // two lists up by index would step straight past a real difference.
    const byKey = new Map(b.readings.map((r) => [`${r.at}|${r.probe}`, r]));
    for (const r of a.readings) {
      const other = byKey.get(`${r.at}|${r.probe}`);
      if (other && other.reads === r.reads) continue;
      return {
        probe: r.probe,
        positions: ` (${Object.entries(a.positions).map(([id, p]) => `${id} ${p}`).join(', ')})`,
        observedRead: r.reads,
        wouldRead: other ? other.reads : 'nothing — that probe does not apply',
      };
    }
  }
  return null;
};

/** Convenience wrapper: contrast two raw faults on a lesson. */
export const whyWrong = (lesson, observedFault, distractorFault) => {
  const healthy = profileOf(lesson, healthyConductors(lesson));
  return contrast(
    profileOf(lesson, injectFault(healthy.circuit.conductors, observedFault)),
    profileOf(lesson, injectFault(healthy.circuit.conductors, distractorFault)),
  );
};

const lower = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// ─── Difficulty ──────────────────────────────────────────────────────────────

export const Difficulty = Object.freeze({
  APPRENTICE: 'Apprentice',
  JOURNEYMAN: 'Journeyman',
  MASTER: 'Master',
});

/**
 * Derived, not assigned. Difficulty is a function of how much the circuit does,
 * whether the complaint alone gets you there, and whether the fault can be
 * narrowed down at all — which is what makes a fault hard to find on a real job.
 */
export const difficultyFor = ({ switchCount, distractors, equivalents, fault }) => {
  // If no distractor can be ruled out by the complaint alone, the apprentice has
  // to go and test something rather than reason from what the customer said.
  const needsTesting = distractors.every((d) => d.why.basis !== WhyBasis.SYMPTOM);
  if (switchCount >= 3 || equivalents.length > 0) return Difficulty.MASTER;
  if (switchCount >= 2 || needsTesting || fault.kind === FaultKind.MISLANDED) return Difficulty.JOURNEYMAN;
  return Difficulty.APPRENTICE;
};

// ─── Narrative ───────────────────────────────────────────────────────────────
//
// The ONLY part that varies freely. Rooms, customers and complaint wording carry
// no electrical content, which is why they are safe to rotate — and why they sit
// in a fixed table rather than being generated, so a scenario id always produces
// the same story.

const ROOMS = Object.freeze([
  'the back bedroom', 'the hallway', 'the garage', 'the upstairs landing',
  'the kitchen', 'the office', 'the basement stairs', 'the front porch',
]);

const CUSTOMERS = Object.freeze([
  'The homeowner', 'The GC', 'The tenant', 'The property manager',
  'The site super', 'The building owner',
]);

const OPENERS = Object.freeze([
  'says it worked fine until yesterday',
  'says the drywall crew was in there last week',
  'called it in this morning',
  'says it has been like this since the remodel',
  'wants it looked at before the inspection',
]);

// ─── Generation ──────────────────────────────────────────────────────────────

/** Deterministic pseudo-random from a seed, so a scenario id is reproducible. */
const seeded = (seed) => {
  let h = seed >>> 0;
  return () => {
    h = (Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
    return h / 0x100000000;
  };
};

const hash = (str) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
};

export const GENERATED_PREFIX = 'gen:';
export const DISTRACTOR_COUNT = 3;

/**
 * Build one scenario from a lesson and a fault index.
 *
 * Returns null when the lesson has no observable faults, or when the fault
 * cannot be narrowed down enough to ask a fair question about.
 */
export const generateScenario = (lessonId, faultIndex) => {
  const lesson = lessonById(lessonId);
  if (!lesson) return null;

  const { faults } = lessonProfile(lesson);
  if (faults.length === 0) return null;

  const i = ((Math.trunc(faultIndex) % faults.length) + faults.length) % faults.length;
  const observed = faults[i];
  const id = `${GENERATED_PREFIX}${lessonId}:${i}`;
  const rand = seeded(hash(id));

  // Split the rest of the fault space by what could actually rule it out.
  const scored = faults
    .filter((f) => f !== observed)
    .map((f) => ({ profile: f, why: contrast(observed, f) }));

  const candidates = scored.filter((s) => s.why.distinguishable);
  const equivalents = scored.filter((s) => !s.why.distinguishable);

  // A question needs at least one answer that is genuinely wrong.
  if (candidates.length === 0) return null;

  const distractors = pickN(candidates, DISTRACTOR_COUNT, rand);

  const choices = shuffle([
    { text: observed.fault.text, correct: true, why: null },
    ...distractors.map((d) => ({ text: d.profile.fault.text, correct: false, why: d.why.text, basis: d.why.basis })),
  ], rand);

  const switchCount = truthTable(observed.circuit).switchIds.length;

  return Object.freeze({
    id,
    generated: true,
    lessonId,
    lessonTitle: lesson.title,
    faultIndex: i,
    difficulty: difficultyFor({
      switchCount,
      distractors,
      equivalents,
      fault: observed.fault,
    }),

    // Narrative. Carries no electrical content.
    customerReport: `${CUSTOMERS[Math.floor(rand() * CUSTOMERS.length)]} in `
      + `${ROOMS[Math.floor(rand() * ROOMS.length)]} `
      + `${OPENERS[Math.floor(rand() * OPENERS.length)]}.`,

    // Everything below is derived by the engine.
    symptom: observed.symptom.summary,
    symptomDetail: observed.symptom.detail,
    readings: observed.states,
    choices: Object.freeze(choices.map((c) => Object.freeze(c))),
    correctIndex: choices.findIndex((c) => c.correct),
    explanation: explain(observed),

    // Faults the readings cannot separate from the real one. Never offered as
    // wrong answers — shown after the answer, because "you cannot tell these
    // apart without opening it up" is the lesson, not a trick.
    cannotBeRuledOut: Object.freeze(equivalents.map((e) => e.profile.fault.text)),

    healthyCircuit: lessonProfile(lesson).healthy.circuit,
    faultedCircuit: observed.circuit,
    disclaimer: TRAINING_DISCLAIMER,
    safetyNote: 'Diagnose from the symptom and the circuit. In the field, de-energize and '
      + 'verify absence of voltage before opening a device or making a connection.',
  });
};

const explain = ({ fault, symptom }) => {
  const parts = [`${fault.text} `];
  if (symptom.shortPresent) {
    parts.push('The ungrounded and grounded conductors end up sharing a path that bypasses the load, so the overcurrent device opens the moment it is energized.');
  } else if (symptom.alwaysOff) {
    parts.push('With that connection wrong there is no complete path in any switch position, so the load never energizes.');
  } else if (symptom.alwaysOn) {
    parts.push('The load is fed around the switch, so the switch has nothing left to interrupt.');
  } else if (symptom.partialControl) {
    parts.push('One control point still completes the path and the other does not, which is why only some of the switches appear to work.');
  } else {
    parts.push('The circuit still operates, but not the way the design intended — the readings are what give it away.');
  }
  return parts.join('');
};

const pickN = (arr, n, rand) => {
  const copy = [...arr];
  const out = [];
  while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]);
  return out;
};

const shuffle = (arr, rand) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ─── The catalog ─────────────────────────────────────────────────────────────

/** How many distinct scenarios exist, per lesson and in total. */
export const scenarioSpace = () => {
  const perLesson = ALL_LESSONS.map((l) => ({
    lessonId: l.id,
    title: l.title,
    scenarios: lessonProfile(l).faults.length,
  }));
  return Object.freeze({
    perLesson: Object.freeze(perLesson),
    total: perLesson.reduce((a, r) => a + r.scenarios, 0),
  });
};

/** A deterministic page of scenarios, for a list screen or a daily rotation. */
export const generateBatch = (lessonId, { from = 0, count = 10 } = {}) => {
  const lesson = lessonById(lessonId);
  if (!lesson) return [];
  const space = lessonProfile(lesson).faults.length;
  const out = [];
  for (let i = from; out.length < count && i < from + space; i++) {
    const s = generateScenario(lessonId, i);
    if (s) out.push(s);
  }
  return out;
};

/**
 * Grade an answer. The reason a wrong answer is wrong was computed when the
 * scenario was built, so grading invents nothing.
 *
 * Named `gradeScenario`, not `answerScenario`, because troubleshooting.js already
 * exports an `answerScenario` that takes a scenario ID. Two functions with one
 * name and different arguments is how a screen ends up silently grading nothing.
 */
export const gradeScenario = (scenario, choiceIndex) => {
  if (!scenario) return null;
  const choice = scenario.choices[choiceIndex];
  if (!choice) return null;
  return Object.freeze({
    correct: choice.correct === true,
    explanation: scenario.explanation,
    whyThisIsWrong: choice.correct ? null : choice.why,
    correctIndex: scenario.correctIndex,
    correctAnswer: scenario.choices[scenario.correctIndex].text,
    cannotBeRuledOut: scenario.cannotBeRuledOut,
  });
};

export { FaultKind, deriveSymptom };
