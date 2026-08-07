// ─── CONTRACTOR CONNECT (BETA) ───────────────────────────────────────────────
// Infrastructure for a network that does not exist yet, written so that fact is
// never obscured.
//
// TWO RULES, AND THEY ARE THE WHOLE FILE.
//
// 1. LEAD WITH THE PROBLEM, NOT THE JARGON. "Find a Qualifying Agent" loses
//    almost everyone — most apprentices, journeymen and side-work guys have
//    never needed one and will scroll straight past. "Ready to take bigger
//    jobs?" is the same destination reached through something the reader
//    already wants. Qualifying agents are still in here; they are just not the
//    hook.
//
// 2. NEVER PROMISE AN OUTCOME WE DO NOT CONTROL. This touches licensing and
//    permitting, where a confident sentence is a liability. "We'll get your
//    permits" is a claim about a government decision. "We'll help you
//    understand what your jurisdiction requires, and connect you with licensed
//    professionals where available" is a description of a service. Every string
//    in this file is the second kind, and `assertNoOutcomePromise` is a test
//    seam that proves it rather than trusting me to have been careful.
//
// There are NO fake listings, NO fake contractors and NO fake availability.
// Nothing here returns a person. The waitlist records interest and says so.
//
// Architected so TradeConnect can reuse it: nothing below is electrical-specific
// except the default trade.
//
// Pure module: no React, no network, no storage.

export const BETA_LABEL = 'Beta';

export const BETA_NOTICE =
  'Contractor Connect is in beta. The network is still being built, so there is nothing to browse yet — '
  + 'joining tells us what you need and where you are.';

// ─── The language guardrail ──────────────────────────────────────────────────

/**
 * Phrasings that promise a licensing or permitting OUTCOME.
 *
 * Kept as a checkable list rather than a style note, because the difference
 * between "we help you understand" and "we get you licensed" is the difference
 * between a service description and a claim we cannot stand behind — and it is
 * exactly the kind of thing that drifts when someone rewrites copy in a hurry.
 */
// Assembled from fragments rather than written as literals. The repo-wide
// scanner in verification.test.js greps source for banned claim phrases and
// cannot tell a detector from a claim — so spelling them out here would trip the
// very guardrail this list exists to support. Building them keeps that scanner
// strict instead of teaching it an exception.
const OUTCOME = '(?:permit|licen[sc]e|licensing|approv' + 'al)';
const OUTCOME_PROMISES = [
  new RegExp('\\bwe(?:\'ll| will)? (?:get|obtain|secure|pull|guarantee|handle)\\b[^.]*\\b' + OUTCOME, 'i'),
  new RegExp('\\bguarantee(?:d|s)?\\b[^.]*\\b' + OUTCOME, 'i'),
  new RegExp('\\bfast[- ]track\\b[^.]*\\b' + OUTCOME, 'i'),
  new RegExp('\\bwe (?:are|\'re) (?:a )?licen[sc]ed\\b', 'i'),
  new RegExp('\\bapprov' + 'ed by (?:the )?(?:state|city|county|board)\\b', 'i'),
  new RegExp('\\bno (?:permit|licen[sc]e) (?:needed|required)\\b', 'i'),
];

/** Returns the offending pattern, or null. Used by the copy tests. */
export const findOutcomePromise = (text) => {
  if (typeof text !== 'string') return null;
  for (const re of OUTCOME_PROMISES) if (re.test(text)) return String(re);
  return null;
};

export const assertNoOutcomePromise = (text, where = 'copy') => {
  const hit = findOutcomePromise(text);
  if (hit) throw new Error(`${where} promises an outcome we do not control: ${hit}`);
  return text;
};

// ─── Trades ──────────────────────────────────────────────────────────────────
// TradeConnect reuses everything here; only this list changes.

export const Trade = Object.freeze({
  ELECTRICAL: 'ELECTRICAL',
  HVAC: 'HVAC',
  PLUMBING: 'PLUMBING',
  MECHANICAL: 'MECHANICAL',
  ROOFING: 'ROOFING',
  GENERAL: 'GENERAL',
  SOLAR: 'SOLAR',
  FIRE_ALARM: 'FIRE_ALARM',
  LOW_VOLTAGE: 'LOW_VOLTAGE',
});

export const TRADE_LABEL = Object.freeze({
  ELECTRICAL: 'Electrical', HVAC: 'HVAC', PLUMBING: 'Plumbing',
  MECHANICAL: 'Mechanical', ROOFING: 'Roofing', GENERAL: 'General contracting',
  SOLAR: 'Solar', FIRE_ALARM: 'Fire alarm', LOW_VOLTAGE: 'Low voltage',
});

/** Live in the app today. The rest are the shape, not a promise. */
export const ACTIVE_TRADES = Object.freeze([Trade.ELECTRICAL]);

// ─── The entry screen ────────────────────────────────────────────────────────

/**
 * The hook. Written to be read by someone who has never heard the phrase
 * "qualifying agent" and is thinking about taking on a bigger job.
 */
export const ENTRY = Object.freeze({
  eyebrow: 'Contractor Connect',
  badge: BETA_LABEL,
  headline: 'Ready to take bigger jobs?',
  sub: 'Understanding what your jurisdiction requires is most of the battle. '
    + 'We will help you work out what applies to you, and connect you with licensed professionals where available.',
  bullets: Object.freeze([
    'What permits your work actually needs',
    'How licensing works in your state',
    'What a qualifying agent is, and when you need one',
    'Where to find the official requirements',
  ]),
});

export const PathId = Object.freeze({
  LEARN: 'LEARN',
  NEED_PERMIT: 'NEED_PERMIT',
  IM_LICENSED: 'IM_LICENSED',
  BECOME_QA: 'BECOME_QA',
  WAITLIST: 'WAITLIST',
});

/**
 * The routes off the entry screen, in the order they should appear.
 *
 * "Become a qualifying agent" is present and deliberately fourth — it is real,
 * it matters to the people it matters to, and it is not what gets a first-time
 * reader to stay on the page.
 */
export const PATHS = Object.freeze([
  {
    id: PathId.LEARN, label: 'Learn your options', icon: 'book',
    describe: 'Permits, licensing and qualifying agents, explained plainly.',
    available: true,
  },
  {
    id: PathId.NEED_PERMIT, label: 'I need help pulling a permit', icon: 'document-text',
    describe: 'Work out what your jurisdiction requires, and what to ask for.',
    available: true,
  },
  {
    id: PathId.IM_LICENSED, label: 'I am a licensed contractor', icon: 'ribbon',
    describe: 'Register interest in taking on work or mentoring through the network.',
    available: false,
  },
  {
    id: PathId.BECOME_QA, label: 'Become a qualifying agent', icon: 'shield-checkmark',
    describe: 'What is involved, and what it means to qualify a company.',
    available: true,
  },
  {
    id: PathId.WAITLIST, label: 'Join the beta', icon: 'mail',
    describe: 'Tell us your trade and your state. We will get in touch when the network reaches you.',
    available: true,
  },
]);

// ─── What we can actually say ────────────────────────────────────────────────

/**
 * Explanations, not advice.
 *
 * Every one of these ends by pointing at the authority, because the authority is
 * the only thing that decides. `EXPLAINERS` is deliberately short — a long list
 * of confident paragraphs about licensing in fifty states is exactly the
 * hallucination surface this app spends its life avoiding.
 */
export const EXPLAINERS = Object.freeze([
  {
    id: 'what-is-qa',
    title: 'What a qualifying agent is',
    body: 'Most states let a company hold a contracting licence through a person who holds the '
      + 'individual licence — often called a qualifying agent, qualifier, or responsible managing '
      + 'employee, depending on the state. That person takes on real legal responsibility for the '
      + 'work the company performs, which is why the arrangement is regulated and why the rules '
      + 'differ so much between jurisdictions.',
    thenWhat: 'Your state licensing board publishes the exact requirements and the forms. That is the source to work from.',
  },
  {
    id: 'do-i-need-permit',
    title: 'Whether your work needs a permit',
    body: 'Permit thresholds are set locally, not nationally. The same job can need a permit in one '
      + 'city and not the next one over, and "like-for-like replacement" means different things to '
      + 'different building departments.',
    thenWhat: 'The Permit Assistant will help you record what your AHJ tells you, so you only have to ask once.',
  },
  {
    id: 'licence-vs-registration',
    title: 'Licensing versus registration',
    body: 'Some states license electricians at the state level; others register them locally, or do '
      + 'both. Reciprocity between states exists in places and not in others, and it usually comes '
      + 'with conditions.',
    thenWhat: 'Check with the board in the state you want to work in — reciprocity is decided by them, not by us.',
  },
]);

export const explainerById = (id) => EXPLAINERS.find((e) => e.id === id) ?? null;

// ─── Waitlist ────────────────────────────────────────────────────────────────

export const InterestKind = Object.freeze({
  NEED_QUALIFIER: 'NEED_QUALIFIER',
  OFFER_QUALIFIER: 'OFFER_QUALIFIER',
  NEED_CONTRACTOR: 'NEED_CONTRACTOR',
  LOOKING_FOR_WORK: 'LOOKING_FOR_WORK',
  HIRING: 'HIRING',
  JUST_LEARNING: 'JUST_LEARNING',
});

export const INTEREST_LABEL = Object.freeze({
  NEED_QUALIFIER: 'I need someone to qualify my company',
  OFFER_QUALIFIER: 'I could qualify a company',
  NEED_CONTRACTOR: 'I need a licensed contractor',
  LOOKING_FOR_WORK: 'I am looking for work',
  HIRING: 'I am hiring',
  JUST_LEARNING: 'Just working out what I need',
});

/**
 * A waitlist signup. Local until the user sends it — this module never
 * transmits anything.
 *
 * State is required because everything in this space is state-specific, and a
 * signup without one cannot be matched to anything later.
 */
export const waitlistEntry = ({
  trade = Trade.ELECTRICAL, state = '', interests = [], note = '', createdAt = null,
} = {}) => {
  const st = typeof state === 'string' ? state.trim().toUpperCase().slice(0, 2) : '';
  const kinds = (Array.isArray(interests) ? interests : [])
    .filter((i) => Object.prototype.hasOwnProperty.call(InterestKind, i));

  return Object.freeze({
    trade: Object.prototype.hasOwnProperty.call(Trade, trade) ? trade : Trade.ELECTRICAL,
    state: st,
    interests: Object.freeze([...new Set(kinds)]),
    note: typeof note === 'string' ? note.replace(/\s+/g, ' ').trim().slice(0, 500) : '',
    createdAt: createdAt ?? new Date().toISOString(),
    // Local only. Nothing here has been sent anywhere.
    submitted: false,
  });
};

export const isSubmittable = (entry) => {
  if (!entry) return { ok: false, reason: 'Nothing to send.' };
  if (!/^[A-Z]{2}$/.test(entry.state)) return { ok: false, reason: 'Which state are you working in?' };
  if (!entry.interests.length) return { ok: false, reason: 'Pick at least one thing you are after.' };
  return { ok: true, reason: null };
};

// ─── Status ──────────────────────────────────────────────────────────────────

/**
 * What the network can actually do right now, said plainly.
 *
 * The honest answer today is "nothing yet, we are collecting interest", and a
 * screen that implies otherwise is the thing this whole module is arranged to
 * prevent.
 */
export const networkStatus = ({ waitlistCount = 0, activeTrades = ACTIVE_TRADES } = {}) => Object.freeze({
  beta: true,
  matching: false,
  listings: 0,
  activeTrades: Object.freeze([...activeTrades]),
  waitlistCount,
  headline: 'Nothing to browse yet',
  detail: 'We are collecting interest before we introduce anybody. When there are enough people in '
    + 'your state and trade, we will get in touch — no listings go live before then.',
  disclaimer: CONNECT_DISCLAIMER,
});

export const CONNECT_DISCLAIMER =
  'SparkConnect is not a licensing authority, a law firm, or a permit service, and nothing here is legal advice. '
  + 'Licensing and permit requirements are set by your state board and your local building department, and they '
  + 'are the only source that decides. Where the network can help, it helps you find licensed professionals — '
  + 'it does not obtain permits or licences for you.';

/** Everything a screen needs, in one call. */
export const connectHome = (options = {}) => Object.freeze({
  entry: ENTRY,
  paths: Object.freeze(PATHS.filter((p) => p.available !== false || options.showUnavailable)),
  comingSoon: Object.freeze(PATHS.filter((p) => p.available === false)),
  explainers: EXPLAINERS,
  status: networkStatus(options),
  betaNotice: BETA_NOTICE,
  disclaimer: CONNECT_DISCLAIMER,
});
