// ─── CONVERSATIONS ───────────────────────────────────────────────────────────
// Structured, auditable, and scoped to one project at a time.
//
// Two things this does that a chat history does not.
//
// FIRST: it stores the EVIDENCE, not just the text. An answer read back in six
// months has to still say what it was computed from, which code edition it
// assumed, and whether the source tables had been verified at the time. Storing
// "7.92 V" as a string loses all of that, and the string is what ends up in a
// dispute about a bid.
//
// SECOND: it never mixes projects. A conversation belongs to exactly one
// project or to none, and `contextFor` will not return a turn from a different
// job. Cross-contamination is the failure that would let SparkAI answer "how
// many receptacles" with a count from somebody else's building — confidently,
// with evidence attached, and completely wrong.
//
// Pure module: no React, no storage. The screen persists what this returns.

export const GLOBAL_SCOPE = null;

export const MAX_CONVERSATIONS = 200;
export const MAX_TURNS = 100;
const MAX_TITLE = 80;
const MAX_TEXT = 4000;

const clean = (s, max) => {
  if (typeof s !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return s.replace(/[ -]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
};

let seq = 0;
const nextId = (p) => `${p}_${(seq += 1).toString(36)}${Date.now().toString(36).slice(-5)}`;

/**
 * A turn. `evidence` is the contract from sparkai.js, stored verbatim so the
 * answer stays auditable after the tables it used have been re-verified, the
 * calculator's defaults have changed, or the code edition has moved on.
 */
export const turn = ({ role, text, evidence = null, tool = null, params = null, at = null }) => Object.freeze({
  id: nextId('t'),
  role: role === 'assistant' ? 'assistant' : 'user',
  text: clean(text, MAX_TEXT),
  // Frozen at write time. Re-deriving it later would rewrite history.
  evidence: evidence ? Object.freeze(JSON.parse(JSON.stringify(evidence))) : null,
  tool,
  params: params ? Object.freeze({ ...params }) : null,
  at: Number.isFinite(Number(at)) ? Number(at) : Date.now(),
});

export const conversation = ({ title = '', projectId = GLOBAL_SCOPE, at = null } = {}) => Object.freeze({
  id: nextId('c'),
  title: clean(title, MAX_TITLE) || 'New conversation',
  // The scope. A conversation belongs to one project or to none, and this is
  // the only field that decides what context it may ever see.
  projectId: projectId ?? GLOBAL_SCOPE,
  pinned: false,
  turns: Object.freeze([]),
  createdAt: Number.isFinite(Number(at)) ? Number(at) : Date.now(),
  updatedAt: Number.isFinite(Number(at)) ? Number(at) : Date.now(),
});

export const addTurn = (conv, t) => {
  if (!conv || !t) return conv;
  const turns = [...conv.turns, t].slice(-MAX_TURNS);
  return Object.freeze({
    ...conv,
    turns: Object.freeze(turns),
    updatedAt: t.at,
    // A conversation names itself from the first thing asked, which is what
    // makes a list of them scannable without anyone typing a title.
    title: conv.turns.length === 0 && t.role === 'user' && conv.title === 'New conversation'
      ? clean(t.text, MAX_TITLE) || conv.title
      : conv.title,
  });
};

export const rename = (conv, title) => Object.freeze({
  ...conv, title: clean(title, MAX_TITLE) || conv.title,
});

export const togglePinned = (conv) => Object.freeze({ ...conv, pinned: !conv.pinned });

/**
 * Attach to a project — or move between projects.
 *
 * Moving is allowed because a conversation often starts before the user has
 * picked the job. What is NOT allowed is a conversation seeing two projects at
 * once, which is why this replaces the scope rather than adding to it.
 */
export const attachToProject = (conv, projectId) => Object.freeze({
  ...conv, projectId: projectId ?? GLOBAL_SCOPE,
});

export const remove = (list, id) => (list ?? []).filter((c) => c.id !== id);

/** Newest first, pinned above the rest. */
export const sortConversations = (list) =>
  [...(list ?? [])].sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || (b.updatedAt - a.updatedAt));

export const capConversations = (list) => sortConversations(list).slice(0, MAX_CONVERSATIONS);

/**
 * Conversations visible for a given project scope.
 *
 * A project's list shows only that project's conversations. The global list
 * shows only unattached ones. Neither ever shows another project's — that is
 * the isolation this module exists for.
 */
export const forScope = (list, projectId = GLOBAL_SCOPE) =>
  sortConversations((list ?? []).filter((c) => (c.projectId ?? GLOBAL_SCOPE) === (projectId ?? GLOBAL_SCOPE)));

/**
 * The turns handed to `ask()` as conversation memory.
 *
 * Refuses to return anything when the conversation's project and the project
 * being asked about disagree. Not filtered — REFUSED, returning an empty array,
 * because a partial mix is worse than no memory: it looks like continuity and
 * carries the wrong job's numbers.
 */
export const contextFor = (conv, { projectId = GLOBAL_SCOPE, turns = 6 } = {}) => {
  if (!conv) return [];
  const convScope = conv.projectId ?? GLOBAL_SCOPE;
  const askScope = projectId ?? GLOBAL_SCOPE;
  if (convScope !== askScope) return [];
  return conv.turns.slice(-turns).map((t) => ({
    role: t.role, text: t.text, tool: t.tool, params: t.params,
  }));
};

/** Would this pairing leak one project's context into another? */
export const wouldCrossContaminate = (conv, projectId) =>
  !!conv && (conv.projectId ?? GLOBAL_SCOPE) !== (projectId ?? GLOBAL_SCOPE);

/**
 * Save an answer to the project as an artifact.
 *
 * Returns the spec for projectArtifacts.createArtifact rather than building it,
 * so this module keeps no dependency on the project store. The evidence goes
 * with it — that is the whole point of saving an answer rather than a screenshot.
 */
export const toArtifactSpec = (conv, turnId) => {
  const t = conv?.turns.find((x) => x.id === turnId);
  if (!t || t.role !== 'assistant') return null;
  const question = [...conv.turns].reverse().find((x) => x.at <= t.at && x.role === 'user');

  return Object.freeze({
    kind: 'AI_SUMMARY',
    title: clean(question?.text ?? conv.title, MAX_TITLE),
    summary: clean(t.text, 200),
    sourceTab: 'necai',
    payload: {
      question: question?.text ?? null,
      answer: t.text,
      evidence: t.evidence,
      savedFromConversation: conv.id,
    },
    meta: {
      // Carried onto the artifact so a saved answer still shows whether the
      // data behind it had been source-verified at the time it was saved.
      verificationStatus: t.evidence?.verificationStatus ?? null,
      codeEdition: t.evidence?.codeEdition ?? null,
      provenance: t.evidence?.answerType ?? null,
    },
  });
};

/** Restore a conversation for display, with its evidence intact. */
export const resume = (conv) => {
  if (!conv) return null;
  return Object.freeze({
    ...conv,
    turns: Object.freeze(conv.turns.map((t) => Object.freeze({
      ...t,
      // Surfaced so a resumed answer can show "this was computed before the
      // tables were verified" rather than silently reading as current.
      stale: t.evidence?.verificationStatus === 'UNVERIFIED',
    }))),
  });
};
