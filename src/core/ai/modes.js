// ─── SPARKAI MODES ───────────────────────────────────────────────────────────
// Four specialised tools that share one conversation, not four filters over one
// chatbot.
//
// WHAT WAS WRONG. The screen opened with a large card explaining what SparkAI
// is, every single time, to somebody who has used it forty times. Below that
// were four chips that only changed a hidden prompt prefix — so General, NEC
// Code, Troubleshoot and Explain Simply all presented an identical empty text
// box. Picking a mode changed nothing you could see, which means the modes were
// decoration.
//
// The fix is that the middle of the screen belongs to the SELECTED MODE. Each
// one opens with the question it is actually for and the four ways into it.
// That is the difference between a specialised tool and a filter.
//
// EXPLAIN SIMPLY IS NOT A MODE. It was one, and it was the odd one out: the
// other three describe a KIND OF QUESTION, and that one describes a kind of
// ANSWER. You do not decide before asking that you want the simple version —
// you decide after reading the one you got. So it moves to the answer action
// bar, where it applies to any response from any mode.
//
// Pure module: no React, no network. The screen renders what this returns.

export const Mode = Object.freeze({
  GENERAL: 'general',
  NEC: 'nec',
  TROUBLESHOOT: 'troubleshoot',
  ESTIMATE: 'estimate',
});

/**
 * The four modes.
 *
 * `prompt` is the framing sent with the question. `entries` are the ways in —
 * they are not example questions to copy, they are the shapes of question this
 * mode answers well, which is what somebody staring at an empty box needs.
 */
export const MODES = Object.freeze([
  Object.freeze({
    id: Mode.GENERAL,
    label: 'General',
    icon: 'flash',
    headline: 'Ask anything electrical',
    sub: 'Code, calculations, pricing, troubleshooting and the rest.',
    placeholder: 'Ask SparkAI anything electrical…',
    prompt: '',
    entries: Object.freeze([
      { id: 'g-gfci', icon: 'water-outline', label: 'Bathroom outlets need GFCI?', ask: 'Do bathroom receptacles need GFCI protection?' },
      { id: 'g-vd', icon: 'trending-down-outline', label: 'Voltage drop — 20A, 150ft, #12', ask: 'Voltage drop on 150 feet of 12 AWG at 20 amps', tab: 'volt' },
      { id: 'g-fill', icon: 'ellipse-outline', label: 'How many wires fit in 3/4" EMT?', ask: 'How many 12 AWG THHN fit in 3/4 inch EMT?', tab: 'conduitfill' },
      { id: 'g-afci', icon: 'shield-outline', label: 'GFCI vs AFCI — when to use each', ask: 'What is the difference between GFCI and AFCI, and where is each required?' },
    ]),
  }),
  Object.freeze({
    id: Mode.NEC,
    label: 'NEC Code',
    icon: 'book',
    headline: 'Ask the NEC',
    sub: 'Find requirements, explain articles, and check work against the code.',
    placeholder: 'Ask about a code requirement…',
    prompt: 'NEC code question: ',
    entries: Object.freeze([
      { id: 'n-find', icon: 'search-outline', label: 'Find a requirement', sub: 'Look up code language by topic or keyword', ask: 'What does the NEC require for ' },
      { id: 'n-explain', icon: 'book-outline', label: 'Explain an article', sub: 'Plain-language reading of a section', ask: 'Explain NEC article ' },
      { id: 'n-size', icon: 'git-branch-outline', label: 'Size a circuit', sub: 'Conductors, OCPD and the calculation behind them', ask: 'What size conductor and breaker do I need for ' },
      { id: 'n-check', icon: 'checkmark-circle-outline', label: 'Check a calculation', sub: 'Box fill, voltage drop, conduit fill and more', ask: 'Check this calculation for me: ', tab: 'calculators' },
    ]),
    topics: Object.freeze([
      'GFCI requirements', 'Working clearances', 'Conduit fill',
      'Panel labeling', 'AFCI & GFCI', 'Disconnecting means',
    ]),
  }),
  Object.freeze({
    id: Mode.TROUBLESHOOT,
    label: 'Troubleshoot',
    icon: 'construct',
    headline: "What's going wrong?",
    sub: 'Describe the symptom or take a photo, and we work back from it.',
    placeholder: 'Describe what the circuit is doing…',
    prompt: 'Help me troubleshoot this electrical issue: ',
    // These are SYMPTOMS, in the words a customer uses on the phone. That is
    // deliberate — the investigation flow starts from the complaint, and a list
    // of causes here would hand over the answer before anybody has tested
    // anything. See core/training/investigation.js.
    entries: Object.freeze([
      { id: 't-dead', icon: 'close-circle-outline', label: 'No power / dead outlet', ask: 'An outlet has no power. Where do I start?' },
      { id: 't-trip', icon: 'flash-outline', label: 'Breaker keeps tripping', ask: 'A breaker keeps tripping. How do I find out why?' },
      { id: 't-flicker', icon: 'bulb-outline', label: 'Lights flicker or dim', ask: 'Lights are flickering and dimming. What causes that?' },
      { id: 't-outlet', icon: 'browsers-outline', label: 'Outlet not working', ask: 'One outlet stopped working but the others on the circuit are fine.' },
      { id: 't-neutral', icon: 'git-compare-outline', label: 'Hot neutrals or open ground', ask: 'I am reading voltage on a neutral. What does that mean?' },
      { id: 't-meter', icon: 'speedometer-outline', label: 'Meter reading looks wrong', ask: 'My meter reading does not make sense. How do I check it?' },
    ]),
    photoAction: Object.freeze({ label: 'Analyze Photo', icon: 'camera' }),
  }),
  Object.freeze({
    id: Mode.ESTIMATE,
    label: 'Estimate',
    icon: 'calculator',
    headline: 'Build an estimate',
    sub: 'Material lists and price ranges from a description, a photo or a job.',
    placeholder: 'Describe the job to price…',
    prompt: 'Build a material estimate for this job: ',
    entries: Object.freeze([
      { id: 'e-photos', icon: 'images-outline', label: 'Start from photos', sub: 'Price what is in a jobsite or panel photo', needsPhoto: true },
      { id: 'e-describe', icon: 'create-outline', label: 'Describe the job', sub: 'Tell us what you are planning', ask: 'I need a material estimate for ' },
      { id: 'e-material', icon: 'cube-outline', label: 'Material estimate', sub: 'Quantities from a takeoff', tab: 'estimator' },
      { id: 'e-compare', icon: 'swap-horizontal-outline', label: 'Compare options', sub: 'What the alternatives cost', ask: 'Compare the cost of ' },
    ]),
  }),
]);

export const modeById = (id) => MODES.find((m) => m.id === id) ?? MODES[0];
export const MODE_IDS = MODES.map((m) => m.id);

/**
 * The framing sent with a question.
 *
 * Returned rather than concatenated at the call site, so a mode can never send
 * one prefix while the chip says another.
 */
export const promptFor = (modeId, question) => {
  const m = modeById(modeId);
  const q = String(question ?? '').trim();
  if (!q) return '';
  return m.prompt ? `${m.prompt}${q}` : q;
};

// ─── The composer ────────────────────────────────────────────────────────────

/**
 * What `+` opens.
 *
 * PROJECT and MEASUREMENT are the point of this tray, and the reason it is not
 * just a camera button. An assistant that can read the photos and the numbers
 * already saved against a job can answer "what am I missing on this panel"; one
 * that only takes a fresh photo cannot. That is the difference between this and
 * a general chatbot with an electrical prompt.
 */
export const Attachment = Object.freeze({
  CAMERA: 'CAMERA',
  LIBRARY: 'LIBRARY',
  PROJECT: 'PROJECT',
  MEASUREMENT: 'MEASUREMENT',
  DOCUMENT: 'DOCUMENT',
});

export const ATTACHMENTS = Object.freeze([
  Object.freeze({ id: Attachment.CAMERA, label: 'Take Photo', sub: 'Use camera', icon: 'camera-outline', ready: true }),
  Object.freeze({ id: Attachment.LIBRARY, label: 'Photo Library', sub: 'Choose from gallery', icon: 'images-outline', ready: true }),
  Object.freeze({ id: Attachment.PROJECT, label: 'Project', sub: 'Add from a project', icon: 'folder-open-outline', ready: true }),
  Object.freeze({ id: Attachment.MEASUREMENT, label: 'Measurement', sub: 'Use a saved measurement', icon: 'resize-outline', ready: false }),
  Object.freeze({ id: Attachment.DOCUMENT, label: 'Document', sub: 'Upload PDF or file', icon: 'document-outline', ready: false }),
]);

/**
 * The tray, with anything not built yet marked rather than hidden.
 *
 * A row that opens nothing is worse than a row that says "not yet" — the first
 * reads as broken, the second as honest. `ready: false` rows render disabled.
 */
export const attachmentTray = ({ hasProjects = false } = {}) => Object.freeze(
  ATTACHMENTS.map((a) => Object.freeze({
    ...a,
    // Offering "add from a project" to somebody with no projects is a dead end
    // dressed as a feature.
    ready: a.id === Attachment.PROJECT ? (a.ready && hasProjects) : a.ready,
    note: a.id === Attachment.PROJECT && !hasProjects ? 'Start a project first' : null,
  })),
);

// ─── What you can do with an answer ──────────────────────────────────────────

export const AnswerAction = Object.freeze({
  SOURCE: 'SOURCE',
  CALCULATE: 'CALCULATE',
  SAVE: 'SAVE',
  SIMPLIFY: 'SIMPLIFY',
});

/**
 * The action bar under a response.
 *
 * Every action is conditional on the answer actually supporting it. A Source
 * button under an answer with no citation is a button that opens a shrug, and
 * the whole product argument is that this app shows its working — a dead
 * Source button undermines exactly the thing it was added to demonstrate.
 */
export const answerActions = ({
  provenance = null, citations = [], tab = null, alreadySimplified = false, projectId = null,
} = {}) => {
  const out = [];
  const cites = Array.isArray(citations) ? citations.filter(Boolean) : [];

  if (cites.length > 0) {
    out.push(Object.freeze({
      id: AnswerAction.SOURCE, label: 'Source', icon: 'book-outline',
      detail: cites.length === 1 ? cites[0] : `${cites.length} references`,
    }));
  }
  if (tab) {
    out.push(Object.freeze({
      id: AnswerAction.CALCULATE, label: 'Calculate', icon: 'calculator-outline', tab,
      // A computed answer beats a written one, always.
      detail: 'Run it properly',
    }));
  }
  out.push(Object.freeze({
    id: AnswerAction.SAVE, label: projectId ? 'Saved' : 'Save to Project', icon: 'folder-outline',
    detail: 'Keep it with the job', done: !!projectId,
  }));
  // A refusal has nothing to simplify — there is no answer under it.
  if (provenance !== 'REFUSED' && !alreadySimplified) {
    out.push(Object.freeze({
      id: AnswerAction.SIMPLIFY, label: 'Simplify', icon: 'sparkles-outline',
      detail: 'Say it plainer',
    }));
  }
  return Object.freeze(out);
};

/** The framing for Simplify, which used to be a mode and is now an action. */
export const SIMPLIFY_PROMPT =
  'Explain that again the way you would to a first-year apprentice: shorter sentences, '
  + 'no jargon you do not define, and keep every number and code reference exactly as it was.';

/**
 * The little provenance block under a code answer.
 *
 * Shows the edition, the article, and — the honest part — whether the citation
 * has actually been checked against a printed copy. "Verified source available"
 * on an unverified reference would be the app vouching for something nobody
 * looked at, which is the one thing this codebase refuses to do.
 */
export const sourceBadge = ({ edition = null, article = null, verified = false } = {}) => {
  if (!article) return null;
  return Object.freeze({
    edition: edition || 'NEC',
    article,
    verified: !!verified,
    label: verified ? 'Verified against print' : 'Reference — not yet verified',
    tone: verified ? 'VERIFIED' : 'UNVERIFIED',
  });
};

// ─── History ─────────────────────────────────────────────────────────────────

/**
 * Recent work, grouped the way somebody looks for it.
 *
 * "Today / Yesterday / This week / Earlier" rather than timestamps, because
 * nobody remembers that they asked about GFCI at 11:32 — they remember it was
 * this morning. Grouping is derived from the conversation list, never stored.
 */
export const historyGroups = (conversations = [], now = new Date()) => {
  const list = Array.isArray(conversations) ? conversations : [];
  const day = 86400000;
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  const t = startOfToday.getTime();

  const bucket = (at) => {
    const ts = new Date(at || 0).getTime();
    if (!Number.isFinite(ts) || ts <= 0) return 'Earlier';
    if (ts >= t) return 'Today';
    if (ts >= t - day) return 'Yesterday';
    if (ts >= t - day * 7) return 'This week';
    return 'Earlier';
  };

  const order = ['Today', 'Yesterday', 'This week', 'Earlier'];
  const groups = new Map(order.map((k) => [k, []]));
  for (const c of list) groups.get(bucket(c?.updatedAt ?? c?.at))?.push(c);

  return Object.freeze(
    order
      .filter((k) => groups.get(k).length > 0)
      .map((k) => Object.freeze({ label: k, items: Object.freeze(groups.get(k)) })),
  );
};

/** Free-text filter over titles and the first line of each conversation. */
export const searchHistory = (conversations = [], query = '') => {
  const q = String(query ?? '').trim().toLowerCase();
  const list = Array.isArray(conversations) ? conversations : [];
  if (!q) return Object.freeze([...list]);
  return Object.freeze(list.filter((c) => {
    const title = String(c?.title ?? '').toLowerCase();
    const first = String(c?.turns?.[0]?.text ?? '').toLowerCase();
    return title.includes(q) || first.includes(q);
  }));
};
