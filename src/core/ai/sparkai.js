// ─── SPARKAI ─────────────────────────────────────────────────────────────────
// The spine. Ground → route → answer → seal.
//
// Everything in the app flows through here, and the order is the architecture:
//
//   GROUND   assemble what is actually known — the open project, the verified
//            takeoff, the conversation so far. Facts, not prose.
//   ROUTE    decide whether this is computable, readable, referenced, or
//            genuinely open. Strongest source wins.
//   ANSWER   produce it from that source.
//   SEAL     refuse anything that got past the earlier stages carrying an
//            electrical claim it is not entitled to make.
//
// The model never sees this pipeline. It is handed a narrow job — read the
// question, name the tool, fill the parameters — and its output re-enters
// through the same gates as everything else.
//
// Pure module: no React, no network. `askModel` is injected by the caller,
// which is what keeps this whole file testable on Node.

import { Provenance, answer, refuse, sealAnswer, answerFooter } from './answer.js';
import { route, Route, readyForTool, extractParams } from './router.js';
import { runTool, toolManifest, toolById } from './tools.js';
import { answer as answerFromTakeoff, groundingContext, breakdown } from '../blueprint/query.js';
import { assertNarrativeOnly, CANNOT_VERIFY } from '../content/authority.js';
import { resolveCitation } from '../../nec/citations.js';

/** How many turns of history the model is given. Enough for "and for #10?". */
export const MEMORY_TURNS = 6;

// ─── Grounding ───────────────────────────────────────────────────────────────

/**
 * What is known, right now, from real app state.
 *
 * Deliberately narrow. The model gets counts and identifiers, never raw
 * detections, never model confidence from another stage, and never customer
 * information — an answer about a job must not carry the customer's name to a
 * third party.
 */
export const ground = ({ project = null, devices = null, conversation = [], edition = null } = {}) => {
  const takeoff = devices ? groundingContext(devices) : null;

  return Object.freeze({
    hasProject: !!project,
    // Name only. Address, customer and phone stay on the device.
    projectName: project?.name ? String(project.name).slice(0, 80) : null,
    projectArtifacts: Array.isArray(project?.artifacts) ? project.artifacts.length : 0,
    projectPhotos: Array.isArray(project?.photos) ? project.photos.length : 0,
    takeoff,
    hasVerifiedTakeoff: !!takeoff && Object.keys(takeoff.confirmedCounts).length > 0,
    edition,
    recent: Object.freeze(
      (Array.isArray(conversation) ? conversation : [])
        .slice(-MEMORY_TURNS)
        .map((t) => Object.freeze({
          role: t.role === 'assistant' ? 'assistant' : 'user',
          text: String(t.text ?? '').slice(0, 500),
          // Carried so a follow-up can reuse the last calculation's numbers.
          params: t.params ?? null,
          tool: t.tool ?? null,
        })),
    ),
  });
};

/**
 * Parameters carried forward from the previous turn.
 *
 * "What about #10?" only makes sense against the last question. Inheritance is
 * narrow on purpose: only from the immediately preceding turn, only for the
 * same tool, and anything named in the new question always wins.
 */
export const inheritParams = (params, context, toolId) => {
  const last = [...(context?.recent ?? [])].reverse().find((t) => t.params && t.tool);
  if (!last || last.tool !== toolId) return params;

  const merged = { ...params };
  for (const [k, v] of Object.entries(last.params)) {
    if (merged[k] === null || merged[k] === undefined) merged[k] = v;
  }
  return merged;
};

// ─── The system context handed to the model ──────────────────────────────────

export const SYSTEM_RULES = Object.freeze([
  'You are SparkAI, inside SparkConnect, talking to a working electrician.',
  'You may explain concepts, restate a question, and describe what a tool does.',
  'You may NOT state a conductor size, breaker size, ampacity, grounding method, neutral routing, or any code requirement. Those come from SparkConnect’s calculators and reviewed reference, never from you.',
  'You may NOT cite the NEC. If a citation is needed, name the topic and SparkConnect will attach the reference.',
  'If the question needs a calculation, say which tool and which numbers are missing. Do not compute it yourself.',
  'If you do not know, say so plainly. "I can\'t verify this" is a correct answer and a guess is not.',
  'Never describe a procedure for working on energized equipment.',
]);

export const modelContext = (context) => Object.freeze({
  rules: SYSTEM_RULES,
  tools: toolManifest(),
  project: context.hasProject
    ? { name: context.projectName, photos: context.projectPhotos, artifacts: context.projectArtifacts }
    : null,
  takeoff: context.hasVerifiedTakeoff ? context.takeoff.confirmedCounts : null,
  codeEdition: context.edition ?? null,
  recent: context.recent,
});

// ─── The pipeline ────────────────────────────────────────────────────────────

/**
 * Answer a question.
 *
 * `askModel` is optional and injected. Without it, SparkAI still answers every
 * computable, project, and referenced question — which is most of them — and
 * refuses the rest. That is a deliberate property: the app degrades to
 * "deterministic only" with no network rather than to "nothing".
 */
export const ask = async (question, {
  project = null, devices = null, conversation = [], edition = null,
  knowledge = null, askModel = null,
} = {}) => {
  const context = ground({ project, devices, conversation, edition });
  const knowledgeHit = knowledge ? knowledge.find(question) : null;

  const decision = route(question, {
    hasProjectData: context.hasVerifiedTakeoff,
    knowledgeHit: knowledgeHit?.id ?? null,
  });

  // 1. Computable.
  if (decision.route === Route.TOOL) {
    const params = inheritParams(decision.params, context, decision.tool);
    const result = runTool(decision.tool, params);
    return Object.freeze({
      ...sealAnswer(result),
      route: decision.route,
      routeReason: decision.reason,
      params,
      needs: result.needs ?? null,
      needsPrompts: result.needsPrompts ?? null,
    });
  }

  // 2. The user's own data.
  if (decision.route === Route.PROJECT) {
    if (!context.hasVerifiedTakeoff) {
      return Object.freeze({
        ...refuse('There is no verified takeoff loaded, so there is nothing to count.', {
          suggestion: 'Run a Blueprint Takeoff and confirm the detections first.',
          question,
        }),
        route: decision.route,
        routeReason: decision.reason,
      });
    }
    const fromTakeoff = /\bwhat(?:'s| is)\s+on\b|\beverything\b|\bbreakdown\b/i.test(question)
      ? breakdown(devices)
      : answerFromTakeoff(question, devices);

    const sealed = fromTakeoff.confident
      ? answer({
        provenance: Provenance.PROJECT,
        text: fromTakeoff.text,
        evidence: fromTakeoff.evidence,
        confidence: 1,
        question,
      })
      : refuse(fromTakeoff.reason ?? 'That cannot be answered from the takeoff.', {
        suggestion: fromTakeoff.suggestion, question,
      });

    return Object.freeze({ ...sealAnswer(sealed), route: decision.route, routeReason: decision.reason });
  }

  // 3. The reviewed reference.
  if (decision.route === Route.KNOWLEDGE && knowledgeHit) {
    const sealed = answer({
      provenance: Provenance.KNOWLEDGE,
      text: knowledgeHit.short,
      detail: knowledgeHit.explain,
      sources: knowledgeHit.refs ?? [],
      confidence: 1,
      question,
      followUp: knowledgeHit.tab ? { tab: knowledgeHit.tab, label: 'Open the calculator' } : null,
    });
    return Object.freeze({ ...sealAnswer(sealed), route: decision.route, routeReason: decision.reason });
  }

  // 4. Last resort.
  if (!askModel) {
    return Object.freeze({
      ...refuse('SparkConnect has no calculator, project record, or reference entry for that, and no model is available offline.', {
        suggestion: 'Try phrasing it as a calculation, or ask about a topic in the reference.',
        question,
      }),
      route: Route.MODEL,
      routeReason: decision.reason,
    });
  }

  let raw;
  try {
    raw = await askModel({ question, context: modelContext(context) });
  } catch (err) {
    return Object.freeze({
      ...refuse(`SparkAI could not be reached: ${err?.message ?? 'unknown error'}.`, { question }),
      route: Route.MODEL,
      routeReason: decision.reason,
    });
  }

  // Model output is untrusted input. It passes the same authority boundary as
  // any other generated content before it becomes an answer.
  try {
    assertNarrativeOnly({ text: raw?.text ?? '' }, 'sparkai');
  } catch {
    return Object.freeze({
      ...refuse('That answer tried to set an electrical value, which SparkAI is not permitted to do.', {
        suggestion: 'Ask for the calculation instead — it is computed, not generated.',
        question,
      }),
      route: Route.MODEL,
      routeReason: decision.reason,
    });
  }

  const sealed = answer({
    provenance: Provenance.MODEL,
    text: raw?.text ?? '',
    // Any citation the model wrote is run through the resolver and dropped if
    // it does not exist. It cannot mint a reference.
    sources: (raw?.sources ?? []).filter((r) => resolveCitation(r)),
    confidence: Number.isFinite(Number(raw?.confidence)) ? Number(raw.confidence) : 0.5,
    question,
  });

  return Object.freeze({ ...sealAnswer(sealed), route: Route.MODEL, routeReason: decision.reason });
};

export { Provenance, Route, answerFooter, extractParams, toolById, CANNOT_VERIFY };
