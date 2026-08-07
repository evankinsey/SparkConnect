// ─── THE ANSWER CONTRACT ─────────────────────────────────────────────────────
// What SparkAI is allowed to hand back, and what has to travel with it.
//
// The single most important field is `provenance`. It says WHERE the answer
// came from, and it cannot be forged by a later stage:
//
//   ENGINE     computed by deterministic code. Cannot be wrong unless the code
//              is wrong, and the code has tests.
//   KNOWLEDGE  from the in-repo, cited, reviewed knowledge base.
//   PROJECT    read out of the user's own verified project data.
//   MODEL      generated. Narrative only — see the assertion guard below.
//   REFUSED    we could not answer. A first-class outcome, not a failure.
//
// The rule that makes this safe: an answer whose provenance is MODEL may not
// contain electrical assertions. Not "should not" — `sealAnswer` checks it and
// downgrades to REFUSED if it does. A language model in an electrical app is
// allowed to explain, rephrase, and route. It is not allowed to size a
// conductor.
//
// Pure module: no React, no network.

import { CANNOT_VERIFY, CONFIDENCE_FLOOR, meetsConfidenceFloor } from '../content/authority.js';
import { resolveCitation } from '../../nec/citations.js';

export const Provenance = Object.freeze({
  ENGINE: 'ENGINE',
  KNOWLEDGE: 'KNOWLEDGE',
  PROJECT: 'PROJECT',
  MODEL: 'MODEL',
  REFUSED: 'REFUSED',
});

/** How much weight a user should put on this. Shown, never hidden. */
export const PROVENANCE_LABEL = Object.freeze({
  ENGINE: 'Calculated by SparkConnect',
  KNOWLEDGE: 'From SparkConnect’s reviewed reference',
  PROJECT: 'From your project data',
  MODEL: 'Written by SparkAI — verify before relying on it',
  REFUSED: 'Not answered',
});

/** Provenances that may carry an electrical claim at all. */
const MAY_ASSERT = new Set([Provenance.ENGINE, Provenance.KNOWLEDGE, Provenance.PROJECT]);

/**
 * Phrases that assert an electrical fact. Used to police MODEL answers.
 *
 * Deliberately broad and deliberately dumb. A false positive costs one
 * regenerated sentence. A false negative ships a hallucinated conductor size to
 * somebody standing at a panel.
 */
const ASSERTION_PATTERNS = [
  /\buse\s+(?:a\s+)?#?\s*\d+\s*(?:AWG|gauge)\b/i,
  /\b\d+\s*(?:AWG|kcmil)\b/i,
  /\b(?:install|use|size|put in|go with)\s+(?:a\s+)?\d+\s*(?:amp|A)\b/i,
  /\b\d+\s*(?:amp|A)\s+(?:breaker|fuse|OCPD|disconnect)\b/i,
  /\bbreaker\s+(?:should|must|needs to)\s+be\b/i,
  /\b(?:you\s+)?(?:must|shall|need to|have to)\s+(?:bond|ground|land|connect|terminate)\b/i,
  /\bNEC\s+\d/i,                        // a citation the model wrote itself
  /\barticle\s+\d{3}\b/i,
  /\btable\s+\d{3}\.\d/i,
  /\b(?:is|are)\s+(?:required|permitted|prohibited)\s+by\s+code\b/i,
];

export const containsElectricalAssertion = (text) => {
  const s = String(text ?? '');
  return ASSERTION_PATTERNS.some((re) => re.test(s));
};

/** A refusal. The honest outcome, with a reason the user can act on. */
export const refuse = (reason, { suggestion = null, question = null } = {}) => Object.freeze({
  provenance: Provenance.REFUSED,
  provenanceLabel: PROVENANCE_LABEL.REFUSED,
  text: CANNOT_VERIFY,
  reason,
  suggestion,
  question,
  sources: Object.freeze([]),
  evidence: Object.freeze([]),
  confidence: 0,
  confident: false,
  assertsElectrical: false,
});

/**
 * Build an answer.
 *
 * `sources` are citation strings; anything that does not resolve is DROPPED
 * rather than rendered, because an unresolvable citation is what an invented
 * one looks like. A caller that loses all its sources is told via
 * `droppedSources` so it can decide whether the answer still stands.
 */
export const answer = ({
  provenance, text, sources = [], evidence = [], confidence = 1,
  question = null, tool = null, detail = null, followUp = null,
} = {}) => {
  const resolved = [];
  const dropped = [];
  for (const ref of sources) {
    const hit = resolveCitation(ref);
    if (hit) resolved.push(Object.freeze({ ref: hit.ref, display: hit.display, topic: hit.topic }));
    else dropped.push(ref);
  }

  const conf = Number.isFinite(Number(confidence)) ? Math.max(0, Math.min(1, Number(confidence))) : 0;

  return Object.freeze({
    provenance,
    provenanceLabel: PROVENANCE_LABEL[provenance] ?? provenance,
    text: String(text ?? ''),
    detail,
    followUp,
    tool,
    question,
    sources: Object.freeze(resolved),
    droppedSources: Object.freeze(dropped),
    evidence: Object.freeze(evidence),
    confidence: conf,
    confident: meetsConfidenceFloor(conf),
    assertsElectrical: containsElectricalAssertion(text),
  });
};

/**
 * The gate every answer passes through before it reaches a screen.
 *
 * Three ways an answer is downgraded to a refusal:
 *   1. A MODEL answer that asserts an electrical fact. The model may explain
 *      and rephrase; it may not size, specify, or cite.
 *   2. Confidence below the floor. No hedged version — a reader keeps the
 *      first half of "probably a loose neutral" and drops the hedge.
 *   3. An answer that lost every citation it had. If nothing it claimed can be
 *      pointed at, it was not grounded in the first place.
 */
export const sealAnswer = (a) => {
  if (!a || a.provenance === Provenance.REFUSED) return a ?? refuse('No answer was produced.');

  if (a.provenance === Provenance.MODEL && a.assertsElectrical) {
    return refuse(
      'That answer put a number on something electrical, and SparkAI is not allowed to do '
      + 'that on its own — those come from a calculator or the code book, never from the model.',
      {
        suggestion: 'Use the matching calculator, or check the NEC edition adopted by your AHJ.',
        question: a.question,
      },
    );
  }

  if (!a.confident && MAY_ASSERT.has(a.provenance) === false) {
    // Not "not confident enough to answer" — that reads as a fault in the app.
    // Say what SparkAI did and why, in its own name, so the most trustworthy
    // behaviour in the product stops looking like the least reliable one.
    return refuse(
      'SparkAI is not confident enough in this to state it, and it will not guess at '
      + 'something you might wire.',
      { question: a.question },
    );
  }

  if (a.sources.length === 0 && a.droppedSources.length > 0) {
    return refuse(
      'The references behind that answer could not be verified, so it was withheld.',
      { suggestion: 'Ask for the calculation instead, which is computed rather than cited.', question: a.question },
    );
  }

  return a;
};

/** Everything the UI needs to show its work, without inventing anything. */
export const answerFooter = (a) => Object.freeze({
  provenance: a.provenance,
  label: a.provenanceLabel,
  sources: a.sources.map((s) => s.display),
  // Only ENGINE and PROJECT answers are reproducible from data the user holds.
  reproducible: a.provenance === Provenance.ENGINE || a.provenance === Provenance.PROJECT,
  showVerifyPrompt: a.provenance === Provenance.MODEL,
  confidence: a.confidence,
});

export { CANNOT_VERIFY, CONFIDENCE_FLOOR, Provenance as AnswerProvenance };
