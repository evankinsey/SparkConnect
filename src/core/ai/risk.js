// ─── REQUEST CLASSIFICATION AND RISK ─────────────────────────────────────────
// What is being asked, and how badly wrong could the answer go.
//
// Intent decides WHERE an answer comes from. Risk decides how hard the
// guardrails clamp down on the way out. They are separate axes: "how many
// receptacles on this sheet" and "what size feeder for this panel" are both
// answerable, and only one of them can hurt somebody.
//
// The risk bands are not decoration. CRITICAL suppresses the model entirely,
// HIGH forbids a narrative answer without a deterministic or cited source
// behind it, and everything demands the jurisdiction be known before a code
// requirement is stated as applying to the user.
//
// Pure module: no React, no network.

export const Intent = Object.freeze({
  CALCULATION: 'CALCULATION',       // deterministic, a tool owns it
  CODE_LOOKUP: 'CODE_LOOKUP',       // verified reference
  PROJECT: 'PROJECT',               // the user's own records
  VISUAL: 'VISUAL',                 // a photo or a plan sheet
  TROUBLESHOOTING: 'TROUBLESHOOTING',
  EDUCATION: 'EDUCATION',           // general explanation
  UNSUPPORTED: 'UNSUPPORTED',       // outside what this app should answer
});

export const Risk = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
});

export const RISK_ORDER = Object.freeze([Risk.LOW, Risk.MEDIUM, Risk.HIGH, Risk.CRITICAL]);
export const atLeast = (risk, floor) => RISK_ORDER.indexOf(risk) >= RISK_ORDER.indexOf(floor);

/**
 * Subjects that raise risk. Getting these wrong does not produce an
 * inconvenience, it produces a fire, a shock, or an unprotected circuit that
 * looks fine.
 */
const HIGH_RISK_SUBJECTS = [
  [/\bservice\s+(?:conductor|entrance|drop|lateral)|\bservice\s+size/i, 'service conductors'],
  [/\bfeeder/i, 'feeders'],
  [/\bground(?:ing)?\s+electrode|\bgec\b|\bbond(?:ing)?\b|\bgrounding\b|\begc\b/i, 'grounding and bonding'],
  [/\bovercurrent|\bbreaker\s+siz|\bocpd\b|\bfuse\s+siz/i, 'overcurrent protection'],
  [/\btransformer|\bprimary\s+and\s+secondary|\bdelta|\bwye\b/i, 'transformers'],
  [/\bgenerator|\btransfer\s+switch|\bstandby\s+power/i, 'generators and transfer equipment'],
  [/\bpanel(?:board)?\s+(?:siz|schedul|feed)|\bsubpanel|\bmain\s+lug/i, 'panels and distribution'],
  [/\bmwbc\b|\bmultiwire|\bshared\s+neutral/i, 'multiwire branch circuits'],
  [/\bload\s+calc|\bdemand\s+factor/i, 'load calculations'],
  [/\barc\s*flash|\bincident\s+energy|\bppe\s+categor/i, 'arc flash'],
];

/**
 * Anything about working on something live. This is the one category where the
 * right answer is never a procedure, however the question is phrased.
 */
// Both orders have to match. "working it hot" and "change this breaker hot"
// are the same question, and a test caught the second one walking straight
// past a pattern that only looked for the adjective first.
const LIVE_WORK = new RegExp([
  // hot ... verb
  '\\b(?:hot|live|energi[sz]ed)\\b[^.?]{0,40}\\b(?:work|working|troubleshoot|test|change|replace|swap|pull|wire)\\b',
  // verb ... hot
  '\\b(?:work|working|troubleshoot|test|change|replace|swap|pull|wire)\\b[^.?]{0,40}\\b(?:hot|live|energi[sz]ed)\\b',
  '\\bwork(?:ing)?\\s+(?:it\\s+)?(?:hot|live|energi[sz]ed)\\b',
  '\\bwithout\\s+(?:killing|shutting off|turning off|cutting)\\s+(?:the\\s+)?power',
  '\\bbackfeed',
  '\\bwhile\\s+(?:it(?:\'s)?\\s+)?(?:still\\s+)?(?:on|live|hot|energi[sz]ed)\\b',
].join('|'), 'i');

const CALC_HINTS = /\b(?:calculate|how many|how much|what size|voltage drop|box fill|conduit fill|derate|derating|ampacity|fill percent)\b/i;
const LOOKUP_HINTS = /\b(?:does the code|is it required|code require|nec say|what does .* require|allowed|permitted|legal)\b/i;
const PROJECT_HINTS = /\b(?:this job|this project|my project|my job|this sheet|this plan|the takeoff|my takeoff)\b/i;
const VISUAL_HINTS = /\b(?:this photo|this picture|this image|in the photo|what am i looking at|this drawing)\b/i;
const TROUBLE_HINTS = /\b(?:not working|no power|keeps tripping|flicker|why is|what would cause|troubleshoot|dead|humming|buzzing)\b/i;

/** Jurisdiction-dependent subjects: the honest answer names the AHJ. */
const JURISDICTION_DEPENDENT = /\b(?:permit|inspection|inspector|amendment|adopted|local code|ahj|do i need a permit)\b/i;

export const classifyIntent = (question) => {
  const q = String(question ?? '');
  if (!q.trim()) return Intent.UNSUPPORTED;
  if (LIVE_WORK.test(q)) return Intent.UNSUPPORTED;
  if (VISUAL_HINTS.test(q)) return Intent.VISUAL;
  if (PROJECT_HINTS.test(q)) return Intent.PROJECT;
  if (CALC_HINTS.test(q)) return Intent.CALCULATION;
  if (TROUBLE_HINTS.test(q)) return Intent.TROUBLESHOOTING;
  if (LOOKUP_HINTS.test(q) || JURISDICTION_DEPENDENT.test(q)) return Intent.CODE_LOOKUP;
  return Intent.EDUCATION;
};

export const riskSubjects = (question) => {
  const q = String(question ?? '');
  return HIGH_RISK_SUBJECTS.filter(([re]) => re.test(q)).map(([, label]) => label);
};

/**
 * Classify a request. Returns intent, risk, the subjects that drove the risk,
 * and the constraints that follow from it — so the caller does not have to
 * re-derive policy from the band.
 */
export const classify = (question, { hasJurisdiction = false, hasCodeEdition = false } = {}) => {
  const q = String(question ?? '');
  const intent = classifyIntent(q);
  const subjects = riskSubjects(q);

  let risk = Risk.LOW;
  if (intent === Intent.TROUBLESHOOTING || intent === Intent.CODE_LOOKUP) risk = Risk.MEDIUM;
  if (subjects.length > 0) risk = Risk.HIGH;
  // Live-work is the only thing that starts at CRITICAL regardless of subject.
  if (LIVE_WORK.test(q)) risk = Risk.CRITICAL;
  // A code requirement stated without knowing the edition or the AHJ is a
  // guess about the user's jurisdiction wearing a section number.
  const jurisdictionSensitive = JURISDICTION_DEPENDENT.test(q) || intent === Intent.CODE_LOOKUP;
  if (jurisdictionSensitive && !hasJurisdiction && risk === Risk.LOW) risk = Risk.MEDIUM;

  return Object.freeze({
    intent,
    risk,
    subjects: Object.freeze(subjects),
    jurisdictionSensitive,
    hasJurisdiction,
    hasCodeEdition,
    constraints: Object.freeze({
      // CRITICAL never reaches a model. There is no phrasing of "how do I work
      // this hot" that this app should complete.
      allowModel: risk !== Risk.CRITICAL,
      // At HIGH and above, a narrative answer needs a deterministic result or a
      // resolved citation standing behind it.
      requireDeterministicOrCited: atLeast(risk, Risk.HIGH),
      // Say which edition the answer assumes, or say it is unknown.
      requireCodeEdition: jurisdictionSensitive,
      // Name the AHJ, or say it is unknown and the answer may vary locally.
      requireJurisdiction: jurisdictionSensitive,
      mustRefuse: risk === Risk.CRITICAL,
    }),
  });
};

/** The refusal for a CRITICAL request. Not a lecture — a redirection. */
export const criticalRefusal = (question) => Object.freeze({
  reason: 'That question is about working on energized equipment, which SparkConnect will not walk anyone through.',
  suggestion: 'De-energize, lock out, and verify absence of voltage with a tester you have proved on a known source. If the work genuinely has to be done energized, that is an employer procedure and a qualified-person question, not an app one.',
  question,
});

/** Reasons an answer must be withheld or qualified, given the classification. */
export const requiredDisclosures = (classification) => {
  const out = [];
  if (classification.constraints.requireCodeEdition && !classification.hasCodeEdition) {
    out.push('The adopted NEC edition is not set, so any code answer may not match your jurisdiction.');
  }
  if (classification.constraints.requireJurisdiction && !classification.hasJurisdiction) {
    out.push('No AHJ is on file. Local amendments can change this answer.');
  }
  if (classification.subjects.length > 0) {
    out.push(`This involves ${classification.subjects.join(', ')} — verify against the code and a qualified person before acting.`);
  }
  return Object.freeze(out);
};
