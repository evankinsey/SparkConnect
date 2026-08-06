// ─── GENERATED SCENARIO PACKS ────────────────────────────────────────────────
// The framework for troubleshooting scenarios that did not ship in the binary:
// AI-generated ones, and any future downloadable pack.
//
// Two rules govern this whole file.
//
// 1. The game NEVER depends on this. `SCENARIOS` in troubleshooting.js is the
//    handcrafted set and it works with zero network and zero AI. A pack is
//    strictly additive; if none loads, nothing changes.
//
// 2. A generated scenario is UNTRUSTED INPUT. It arrives as text from a model,
//    which means it can be malformed, unbounded, or subtly wrong, and it must
//    never be able to crash a screen or smuggle content past review. So it is
//    validated structurally here AND proven against the circuit engine before
//    a user ever sees it — a scenario whose stated fault does not actually
//    change the circuit's behaviour is rejected, no matter how plausible the
//    prose reads.
//
// Pure module: no React, no network, no storage.

import { ConductorRole } from '../../circuit/model.js';
import { lessonById, solutionCircuit } from '../../circuit/lessons/index.js';
import { TRAINING_DISCLAIMER } from '../../circuit/review.js';
import { FaultKind, injectFault, deriveSymptom } from './troubleshooting.js';

/** Generated ids are namespaced so they can never collide with shipped ones. */
export const GENERATED_PREFIX = 'gen:';

// Bounds. A model asked for "a short customer report" can return three
// paragraphs; these caps are what keep a layout from being destroyed by it.
export const LIMITS = Object.freeze({
  title: 80,
  customerReport: 400,
  explanation: 600,
  choice: 160,
  inspectStep: 200,
  commonMistake: 300,
  choices: 5,
  minChoices: 3,
  inspectSteps: 6,
  packSize: 50,
});

const DIFFICULTIES = new Set(['Apprentice', 'Journeyman', 'Master']);

/** Control characters and rogue whitespace out; hard length cap applied. */
const clean = (value, max) => {
  if (typeof value !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const stripped = value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!stripped) return null;
  return stripped.length > max ? stripped.slice(0, max - 1) + '…' : stripped;
};

const cleanList = (value, max, maxLen, minCount = 1) => {
  if (!Array.isArray(value)) return null;
  const out = [];
  for (const item of value.slice(0, max)) {
    const s = clean(item, maxLen);
    if (s) out.push(s);
  }
  return out.length >= minCount ? out : null;
};

/**
 * Validate the fault declaration. Only the four engine-supported kinds are
 * accepted, and every terminal reference must exist in the lesson — a model
 * inventing `sw3.common` on a two-switch lesson is a silent no-op fault, which
 * would produce a scenario with no symptom and no correct answer.
 */
const validateFault = (raw, terminalIds) => {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'fault missing' };
  if (!Object.values(FaultKind).includes(raw.kind)) return { ok: false, reason: `unknown fault kind ${raw.kind}` };
  const known = (t) => typeof t === 'string' && terminalIds.has(t);

  switch (raw.kind) {
    case FaultKind.OPEN_CONDUCTOR: {
      const t = raw.target;
      if (!t || typeof t !== 'object') return { ok: false, reason: 'open fault needs a target' };
      if (t.role && !Object.values(ConductorRole).includes(t.role)) return { ok: false, reason: `unknown role ${t.role}` };
      if (t.between && !(Array.isArray(t.between) && t.between.length === 2 && t.between.every(known))) {
        return { ok: false, reason: 'between references an unknown terminal' };
      }
      if (!t.role && !t.between && !t.id) return { ok: false, reason: 'target selects nothing' };
      return { ok: true, fault: { kind: raw.kind, target: t } };
    }
    case FaultKind.MISLANDED: {
      if (!known(raw.to)) return { ok: false, reason: 'mislanded destination is not a real terminal' };
      if (raw.end !== 'from' && raw.end !== 'to') return { ok: false, reason: 'end must be from or to' };
      if (!raw.target || typeof raw.target !== 'object') return { ok: false, reason: 'mislanded needs a target' };
      return { ok: true, fault: { kind: raw.kind, target: raw.target, end: raw.end, to: raw.to } };
    }
    case FaultKind.SWAPPED: {
      if (!Array.isArray(raw.terminals) || raw.terminals.length !== 2 || !raw.terminals.every(known)) {
        return { ok: false, reason: 'swap needs two real terminals' };
      }
      if (raw.terminals[0] === raw.terminals[1]) return { ok: false, reason: 'cannot swap a terminal with itself' };
      return { ok: true, fault: { kind: raw.kind, terminals: [...raw.terminals] } };
    }
    case FaultKind.SHORT: {
      if (!known(raw.from) || !known(raw.to)) return { ok: false, reason: 'short needs two real terminals' };
      if (raw.from === raw.to) return { ok: false, reason: 'a terminal cannot short to itself' };
      return { ok: true, fault: { kind: raw.kind, from: raw.from, to: raw.to } };
    }
    default:
      return { ok: false, reason: 'unreachable' };
  }
};

/**
 * Validate one generated scenario against a real lesson and the circuit engine.
 * Returns { ok: true, scenario } or { ok: false, reason }.
 */
export const validateGeneratedScenario = (raw) => {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'not an object' };

  const lesson = typeof raw.lessonId === 'string' ? lessonById(raw.lessonId) : null;
  if (!lesson) return { ok: false, reason: `unknown lessonId ${raw.lessonId}` };

  const title = clean(raw.title, LIMITS.title);
  if (!title) return { ok: false, reason: 'title missing' };
  const customerReport = clean(raw.customerReport, LIMITS.customerReport);
  if (!customerReport) return { ok: false, reason: 'customerReport missing' };
  const explanation = clean(raw.explanation, LIMITS.explanation);
  if (!explanation) return { ok: false, reason: 'explanation missing' };
  const commonMistake = clean(raw.commonMistake, LIMITS.commonMistake);
  if (!commonMistake) return { ok: false, reason: 'commonMistake missing' };

  const choices = cleanList(raw.choices, LIMITS.choices, LIMITS.choice, LIMITS.minChoices);
  if (!choices) return { ok: false, reason: 'need at least three usable choices' };
  if (new Set(choices.map((c) => c.toLowerCase())).size !== choices.length) {
    return { ok: false, reason: 'duplicate choices' };
  }
  const whatToInspect = cleanList(raw.whatToInspect, LIMITS.inspectSteps, LIMITS.inspectStep, 1);
  if (!whatToInspect) return { ok: false, reason: 'whatToInspect missing' };

  if (!Number.isInteger(raw.correctChoice) || raw.correctChoice < 0 || raw.correctChoice >= choices.length) {
    return { ok: false, reason: 'correctChoice is out of range' };
  }
  const difficulty = DIFFICULTIES.has(raw.difficulty) ? raw.difficulty : 'Journeyman';

  const components = lesson.components();
  const terminalIds = new Set(components.flatMap((c) => c.terminals.map((t) => t.id)));
  const faultCheck = validateFault(raw.fault, terminalIds);
  if (!faultCheck.ok) return faultCheck;

  // The engine test. A generated fault that leaves the circuit behaving exactly
  // as designed is not a troubleshooting scenario — it is a lie with no answer.
  const healthy = solutionCircuit(lesson);
  const faultedConductors = injectFault(healthy.conductors, faultCheck.fault);
  const faulted = { components, conductors: faultedConductors };
  const healthySymptom = deriveSymptom(healthy);
  const symptom = deriveSymptom(faulted);
  if (symptom.summary === healthySymptom.summary) {
    return { ok: false, reason: 'the declared fault does not change how the circuit behaves' };
  }

  return {
    ok: true,
    scenario: {
      id: raw.id && typeof raw.id === 'string'
        ? GENERATED_PREFIX + clean(raw.id, 60).replace(/[^\w:-]/g, '-')
        : `${GENERATED_PREFIX}${raw.lessonId}-${Math.abs(hash(title + customerReport))}`,
      generated: true,
      lessonId: raw.lessonId,
      title,
      difficulty,
      customerReport,
      fault: faultCheck.fault,
      choices,
      correctChoice: raw.correctChoice,
      explanation,
      whatToInspect,
      commonMistake,
      disclaimer: TRAINING_DISCLAIMER,
      safetyNote:
        'Diagnose from the symptom and the circuit. In the field, de-energize and ' +
        'verify absence of voltage before opening a device or making a connection.',
    },
  };
};

// Small stable hash for deriving an id when the model did not supply one.
const hash = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
  return h;
};

/**
 * Validate a whole pack. Bad scenarios are DROPPED, not fatal — one hallucinated
 * entry must not cost the user the other nine. Rejections are returned so they
 * can be logged and the prompt improved.
 */
export const loadGeneratedPack = (raw) => {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.scenarios) ? raw.scenarios : null;
  if (!list) return { scenarios: [], rejected: [{ reason: 'pack is not a list of scenarios' }] };

  const scenarios = [];
  const rejected = [];
  const seen = new Set();
  for (const entry of list.slice(0, LIMITS.packSize)) {
    const r = validateGeneratedScenario(entry);
    if (!r.ok) { rejected.push({ reason: r.reason, title: typeof entry?.title === 'string' ? entry.title.slice(0, 60) : null }); continue; }
    if (seen.has(r.scenario.id)) { rejected.push({ reason: 'duplicate id', title: r.scenario.title }); continue; }
    seen.add(r.scenario.id);
    scenarios.push(r.scenario);
  }
  return { scenarios, rejected };
};

/**
 * The handcrafted set plus whatever survived validation. Handcrafted always
 * comes first — the shipped, reviewed content is what a new user meets.
 */
export const mergeScenarios = (handcrafted, generated = []) => [
  ...handcrafted,
  ...generated.filter((g) => !handcrafted.some((h) => h.id === g.id)),
];
