// ─── SPARK AI CONTEXT BUILDER ────────────────────────────────────────────────
// Requirements: AI-01 … AI-06, ANL-07, SIM-19
//
// Every "Explain this" button in the app builds its payload here. Two reasons:
//   1. The AI gets STRUCTURED context, not a vague prompt (AI-02).
//   2. Customer information is stripped on the way out. An invoice explanation
//      must never carry the customer's name, address or phone to a model
//      (ANL-07 names AI prompts explicitly).

import { scrubProperties } from '../../privacy/scrub.js';

export const AiAction = {
  EXPLAIN: 'explain',
  WHY: 'why',
  SHOW_FORMULA: 'show_formula',
  COMMON_MISTAKES: 'common_mistakes',
  TEACH_ME: 'teach_me',
  EXAMPLE_PROBLEMS: 'example_problems',
  IMPROVE_WORDING: 'improve_wording',
  TROUBLESHOOT: 'troubleshoot',
};

export const AiMode = { ASK: 'ask', CODE: 'code', TROUBLESHOOT: 'troubleshoot', EXPLAIN: 'explain' };

// AI-05 — the response contract. Sent with the request so the model knows the
// expected shape, and used by the client to render sections predictably.
export const RESPONSE_CONTRACT = Object.freeze([
  'direct_explanation',
  'why_this_result',
  'conductor_and_terminal_roles',
  'what_to_inspect_next',
  'common_mistake',
  'safety_reminder',
  'verified_reference',
  'uncertainty_statement',
]);

// AI-06 / REV-13 — shipped with every request.
export const CITATION_POLICY =
  'Do not fabricate NEC citations. If a specific article or section cannot be stated with ' +
  'confidence, say so plainly and describe the concept without inventing a number.';

export const SAFETY_CONTEXT =
  'Training and conceptual reference only. Never instruct energized work. Always defer to the ' +
  'adopted code edition, the authority having jurisdiction, approved plans, manufacturer ' +
  'instructions, and qualified supervision.';

// Free-text fields that may contain customer information and are therefore never
// forwarded, regardless of which tool builds the payload.
const NEVER_FORWARD = [
  'customerName', 'customerEmail', 'customerPhone', 'customerAddress', 'address',
  'notes', 'internalNotes', 'customerNotes', 'customerMessage', 'contractorName',
  'companyName', 'logoUri', 'photoUri', 'reference',
];

/** Recursively strip identifying fields from a plain object. */
export const stripIdentifying = (value, depth = 0) => {
  if (depth > 4 || value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map((v) => stripIdentifying(v, depth + 1)).filter((v) => v !== null);
  if (typeof value !== 'object') return value;

  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (NEVER_FORWARD.includes(k)) continue;
    const cleaned = stripIdentifying(v, depth + 1);
    if (cleaned !== null && cleaned !== undefined) out[k] = cleaned;
  }
  return out;
};

/**
 * AI-02 — the structured payload for a calculator or tool.
 *
 * @param tool             e.g. 'voltage_drop'
 * @param inputs           the user's inputs (stripped)
 * @param result           the deterministic result (stripped)
 * @param userRole         apprentice / journeyman / …
 * @param adoptedCodeContext  from src/nec/editions.js
 * @param requestedAction  AiAction
 */
export const buildToolContext = ({
  tool, inputs = {}, result = {}, userRole = null,
  adoptedCodeContext = null, selectedMode = AiMode.EXPLAIN,
  requestedAction = AiAction.EXPLAIN,
}) => ({
  tool,
  inputs: stripIdentifying(inputs) ?? {},
  result: stripIdentifying(result) ?? {},
  userRole,
  adoptedCodeContext,
  selectedMode,
  safetyContext: SAFETY_CONTEXT,
  requestedAction,
  citationPolicy: CITATION_POLICY,
  responseContract: RESPONSE_CONTRACT,
});

/**
 * AI-03 — the payload for a wiring simulation mistake.
 *
 * SIM-19 is enforced structurally: the deterministic verdict travels with the
 * request as `engineVerdict`, marked authoritative. The model explains that
 * verdict. It is told, in the payload itself, that it may not overturn it.
 */
export const buildSimulationContext = ({
  lesson, validationResult, userConductors = [], hintLevel = 0,
  attemptCount = 1, mode = 'LEARN', userRole = null, adoptedCodeContext = null,
}) => ({
  tool: 'wiring_simulation',
  lessonId: lesson.id,
  lessonVersion: lesson.lessonVersion,
  difficulty: lesson.difficulty,
  learningObjectives: lesson.learningObjectives,

  // The component graph, as terminals and connections — no rendering detail.
  componentGraph: lesson.components().map((c) => ({
    id: c.id,
    type: c.type,
    terminals: c.terminals.map((t) => ({ id: t.id, role: t.semanticRole, label: t.label })),
  })),
  userConnections: userConductors.map((w) => ({
    from: w.fromTerminal, to: w.toTerminal, role: w.role,
  })),

  engineVerdict: {
    authoritative: true,
    valid: validationResult.valid,
    findings: validationResult.findings.map((f) => ({
      category: f.category, rule: f.rule, message: f.message,
      components: f.components, terminals: f.terminals,
    })),
    truthTable: validationResult.truthTable.rows.map((r) => ({
      state: r.stateVector, energized: r.anyLoadEnergized, short: r.shortCircuit,
    })),
  },

  hintLevel,
  attemptCount,
  mode,
  userRole,
  adoptedCodeContext,
  safetyContext: SAFETY_CONTEXT,
  requestedAction: AiAction.EXPLAIN,
  citationPolicy: CITATION_POLICY,
  responseContract: RESPONSE_CONTRACT,

  // SIM-19, stated to the model in the payload.
  engineAuthorityNote:
    'The deterministic circuit engine has already decided correctness. Explain its verdict. ' +
    'Do not declare an invalid circuit valid, and do not contradict the truth table.',
});

/**
 * A document context that carries the SHAPE of an invoice without its content —
 * line-item count, totals, status. Never the customer.
 */
export const buildDocumentContext = ({
  document, userRole = null, requestedAction = AiAction.IMPROVE_WORDING, totals = null,
}) => ({
  tool: document.kind === 'ESTIMATE' ? 'estimate' : 'invoice',
  documentKind: document.kind,
  status: document.status,
  lineItemCount: document.lineItems.length,
  lineItemKinds: [...new Set(document.lineItems.map((i) => i.kind))],
  hasTax: (document.taxPercent ?? 0) > 0,
  hasDiscount: !!document.discountCents || (document.discountPercent ?? 0) > 0,
  hasDeposit: (document.depositCents ?? 0) > 0,
  totals: totals ? { totalCents: totals.totalCents, balanceDueCents: totals.balanceDueCents } : null,
  // Scope and exclusions are the contractor's own words about the WORK, which is
  // the thing being improved. Customer-identifying fields are excluded above.
  scopeOfWork: document.scopeOfWork ?? '',
  exclusions: document.exclusions ?? '',
  userRole,
  requestedAction,
  safetyContext: SAFETY_CONTEXT,
  citationPolicy: CITATION_POLICY,
  responseContract: RESPONSE_CONTRACT,
});

/**
 * Final gate before a payload leaves the device.
 * Returns the payload plus a list of anything removed, so a leak is visible in
 * dev rather than silent.
 */
export const sealContext = (context) => {
  const stripped = stripIdentifying(context) ?? {};
  // Re-check every scalar with the analytics guard's value detectors, catching
  // an email or address pasted into a scope-of-work field.
  const flat = {};
  for (const [k, v] of Object.entries(stripped)) {
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') flat[k] = v;
  }
  const { dropped } = scrubProperties(flat);
  return { payload: stripped, inspected: Object.keys(flat), flaggedByGuard: dropped };
};

/** AI-01 — the actions offered on a calculator result card. */
export const TOOL_AI_ACTIONS = Object.freeze([
  { action: AiAction.EXPLAIN, label: 'Explain This' },
  { action: AiAction.WHY, label: 'Why?' },
  { action: AiAction.SHOW_FORMULA, label: 'Show Formula' },
  { action: AiAction.COMMON_MISTAKES, label: 'Common Mistakes' },
  { action: AiAction.TEACH_ME, label: 'Teach Me' },
  { action: AiAction.EXAMPLE_PROBLEMS, label: 'Example Problems' },
]);
