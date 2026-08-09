// ─── GETTING INTO THE TRADE ──────────────────────────────────────────────────
// The three real ways into an electrical apprenticeship in the US, and what
// each one actually asks of you.
//
// WHY THIS AND NOT A DIRECTORY OF LOCALS. The obvious move is a scraped list of
// union halls with phone numbers and addresses. It is also the wrong one, and
// not because it is hard:
//
//   · A phone number and an application window are the two things that change
//     most and matter most. A stale entry sends somebody to a hall that moved,
//     or tells them applications open in March when they closed in February.
//     That is not a bad row in a table — it is a year of somebody's life.
//   · Nothing in this app can verify a local's details. Shipping 83 rows we
//     cannot check would be the same failure as an AI stating an ampacity it
//     never computed, and this codebase refuses that everywhere else.
//
// So: the STRUCTURE is what we ship, because the structure is stable and it is
// the part nobody explains. Which paths exist, what each is really like, what
// they ask for, what the application actually involves, and the official
// locator for each — the organisation's own page, which is always current
// because they maintain it. We send people to the source instead of standing
// between them and it with a copy that rots.
//
// AND WE COVER ALL THREE. The competition lists IBEW. That silently tells a
// non-union apprentice, or somebody in a state with a thin union presence, that
// there is no route for them. IEC and ABC train tens of thousands of
// electricians and are the majority path in much of the south and southwest.
// A person deciding their career deserves the whole map, including the honest
// trade-offs, not the one path we happen to have data for.
//
// NOTHING HERE PROMISES AN OUTCOME. We do not place anybody, we have no
// relationship with any of these organisations, and acceptance is theirs alone.
// `assertNoOutcomePromise` from core/connect is applied to every string.
//
// Pure module: no React, no network, no storage.

import { assertNoOutcomePromise } from '../connect/index.js';

export const Path = Object.freeze({
  IBEW: 'IBEW',
  IEC: 'IEC',
  ABC: 'ABC',
  MERIT: 'MERIT',
});

/**
 * The paths.
 *
 * `hoursNote` and `classroomNote` are deliberately ranges with "typically" on
 * them. The federal registered-apprenticeship framework sets the shape, but the
 * exact hours are set per programme, and stating one number as fact is how a
 * person turns up expecting 8,000 and finds 10,000.
 */
export const PATHS = Object.freeze([
  Object.freeze({
    id: Path.IBEW,
    name: 'IBEW / NECA',
    full: 'International Brotherhood of Electrical Workers, with the JATC',
    kind: 'Union',
    oneLine: 'The union route. Apply to your local\'s training centre (JATC).',
    what: 'Local unions run apprenticeships jointly with contractors through a Joint '
      + 'Apprenticeship and Training Committee. You are dispatched to signatory contractors '
      + 'and your pay, benefits and raises follow the local\'s negotiated scale.',
    strengths: Object.freeze([
      'Pay scale and raises are set by agreement, not by your negotiating',
      'Health and pension are usually part of the package',
      'Classroom instruction is generally at no tuition cost to the apprentice',
      'The credential travels — locals recognise each other\'s training',
    ]),
    tradeoffs: Object.freeze([
      'Applications often open in a window rather than year-round',
      'Competitive — many locals take far fewer than apply',
      'You go where you are dispatched, which can mean travel',
      'Union presence varies a lot by region',
    ]),
    typicalAsks: Object.freeze([
      'High school diploma or GED',
      'One year of high school algebra, or a college algebra course',
      'Be 18 or older',
      'Valid driver\'s licence and reliable transport',
      'Aptitude test, then an interview and ranking',
      'Drug screen',
    ]),
    hoursNote: 'Typically around 8,000 hours of on-the-job training over roughly 5 years.',
    classroomNote: 'Typically around 900 or more classroom hours alongside the work.',
    // The organisation's own locator. Always current because they maintain it.
    locator: 'https://www.ibew.org/Tools/Local-Union-Search',
    locatorLabel: 'IBEW local union search',
    secondary: Object.freeze([
      { label: 'electricalcareers.org — the NECA/IBEW careers site', url: 'https://www.electricalcareers.org/' },
    ]),
  }),
  Object.freeze({
    id: Path.IEC,
    name: 'IEC',
    full: 'Independent Electrical Contractors',
    kind: 'Non-union (merit shop)',
    oneLine: 'Non-union apprenticeship through an IEC chapter. Often you get hired first.',
    what: 'IEC chapters run registered apprenticeships for member contractors. In most '
      + 'chapters you find a job with a member contractor and they enrol you, which flips '
      + 'the usual order — employment first, schooling alongside it.',
    strengths: Object.freeze([
      'Often rolling enrolment rather than one window a year',
      'Getting hired first means you are earning from the start',
      'Strong in regions where union presence is thin',
      'Also a registered apprenticeship, so the hours count',
    ]),
    tradeoffs: Object.freeze([
      'Pay and benefits are negotiated with your employer, not set by scale',
      'Tuition is often the apprentice\'s or the employer\'s to cover',
      'Quality varies more between chapters and employers',
      'Your progress can be tied to one employer staying busy',
    ]),
    typicalAsks: Object.freeze([
      'High school diploma or GED',
      'Be 18 or older',
      'Employment with a participating contractor, in most chapters',
      'Valid driver\'s licence and reliable transport',
    ]),
    hoursNote: 'Typically around 8,000 hours of on-the-job training over roughly 4 to 5 years.',
    classroomNote: 'Typically several hundred classroom hours a year, often evenings.',
    locator: 'https://www.ieci.org/chapter-locator',
    locatorLabel: 'IEC chapter locator',
    secondary: Object.freeze([]),
  }),
  Object.freeze({
    id: Path.ABC,
    name: 'ABC',
    full: 'Associated Builders and Contractors',
    kind: 'Non-union (merit shop)',
    oneLine: 'Non-union apprenticeship through an ABC chapter, across many trades.',
    what: 'ABC chapters run registered apprenticeships for member contractors across the '
      + 'construction trades, electrical included. Like IEC, the usual route is to be hired '
      + 'by a member contractor who then puts you through the programme.',
    strengths: Object.freeze([
      'Very large national footprint with many chapters',
      'Employment usually comes first, so you earn while you learn',
      'Craft training covers several trades if you are still deciding',
      'Registered apprenticeship, so the hours are recognised',
    ]),
    tradeoffs: Object.freeze([
      'Pay and benefits depend on your employer',
      'Programme structure and cost vary between chapters',
      'Electrical is one of several trades rather than the sole focus',
    ]),
    typicalAsks: Object.freeze([
      'High school diploma or GED',
      'Be 18 or older',
      'Employment with a member contractor, in most chapters',
      'Valid driver\'s licence and reliable transport',
    ]),
    hoursNote: 'Typically around 8,000 hours of on-the-job training over roughly 4 years.',
    classroomNote: 'Typically a few hundred classroom hours a year.',
    locator: 'https://www.abc.org/Chapters',
    locatorLabel: 'ABC chapter directory',
    secondary: Object.freeze([]),
  }),
  Object.freeze({
    id: Path.MERIT,
    name: 'Straight to a contractor',
    full: 'Hired directly, with the state registering your hours',
    kind: 'Direct hire',
    oneLine: 'Get hired as a helper and register with your state as a trainee.',
    what: 'Many states let you work under a licensed electrician and accrue hours toward '
      + 'your own licence without a formal apprenticeship programme. The rules are entirely '
      + 'your state board\'s, and they differ a great deal.',
    strengths: Object.freeze([
      'Fastest way to be on a job site earning',
      'No application window to wait for',
      'Works where no chapter or local is within reach',
    ]),
    tradeoffs: Object.freeze([
      'No structured classroom unless you arrange it yourself',
      'Hours only count if they are documented the way your state requires',
      'Easy to spend years doing one narrow kind of work',
      'Some states do not allow this route at all',
    ]),
    typicalAsks: Object.freeze([
      'A licensed electrician willing to supervise and sign for you',
      'Whatever registration your state board requires — check before you start',
    ]),
    hoursNote: 'Set by your state board. This is the number to confirm before you rely on it.',
    classroomNote: 'Often none by default. Some states require it anyway.',
    locator: null,
    locatorLabel: null,
    secondary: Object.freeze([]),
  }),
]);

export const pathById = (id) => PATHS.find((p) => p.id === id) ?? null;

/**
 * What to do this week, in order.
 *
 * The single most common way somebody loses a year is finding out in April that
 * the window was February. So the first step is always the calendar, not the
 * paperwork.
 */
export const FIRST_STEPS = Object.freeze([
  'Find out when applications open near you — for a JATC this is often one short window a year.',
  'Get your high school transcript or GED certificate in hand; almost every route asks for it.',
  'Check whether you need an algebra credit, and enrol at a community college if you do not have one.',
  'For IEC and ABC, start applying to member contractors — being hired is usually how you get in.',
  'Ask your state board what it requires to count hours, whichever route you take.',
]);

/**
 * On-the-job hours, tracked against the programme you are actually in.
 *
 * `target` is not a constant in this module on purpose. Every programme sets
 * its own, so the number comes from the user's own programme paperwork and this
 * function does the arithmetic on it — the same rule the calculators follow.
 */
export const hoursProgress = (input) => {
  // Destructuring defaults only fire for `undefined`, so an explicit null from
  // a storage read that returned nothing would throw here.
  const { logged = 0, target = 0 } = input ?? {};
  const l = Number.isFinite(logged) && logged > 0 ? logged : 0;
  const t = Number.isFinite(target) && target > 0 ? target : 0;
  if (!t) {
    return Object.freeze({
      logged: l, target: 0, remaining: null, percent: 0, known: false,
      note: 'Set the hours your programme requires and this tracks against it. '
        + 'Programmes differ, so use the number on your own paperwork.',
    });
  }
  const remaining = Math.max(0, t - l);
  return Object.freeze({
    logged: l,
    target: t,
    remaining,
    percent: Math.min(100, Math.round((l / t) * 100)),
    known: true,
    note: remaining === 0
      ? 'Logged hours meet the target you set. Your programme signs off, not this app.'
      : `${remaining.toLocaleString()} hours to go against the target you set.`,
  });
};

/**
 * Compare paths side by side on the things people actually choose between.
 *
 * Derived from PATHS rather than written out, so a comparison table can never
 * disagree with the page it is comparing.
 */
export const comparison = () => Object.freeze(
  PATHS.map((p) => Object.freeze({
    id: p.id,
    name: p.name,
    kind: p.kind,
    payNote: p.id === Path.IBEW
      ? 'Set by the local\'s negotiated scale'
      : 'Negotiated with your employer',
    entryNote: p.id === Path.IBEW
      ? 'Apply to the training centre, often in a window'
      : p.id === Path.MERIT
        ? 'Get hired, then register with the state'
        : 'Usually get hired by a member contractor first',
    hoursNote: p.hoursNote,
  })),
);

/**
 * What SparkAI may and may not do with this.
 *
 * The tailored part is genuinely useful — "here is what your state asks for,
 * here is what to say when you call" is real help. What it must never do is
 * invent the facts that decide somebody's year: a deadline, a phone number, an
 * address, or a hard requirement. Those come from the organisation.
 */
export const AI_RULES = Object.freeze([
  'Never state an application deadline, opening date, phone number or address. '
    + 'Point at the official locator instead — they maintain it, we do not.',
  'Never say whether somebody will be accepted, or rank their chances.',
  'Requirements vary by local, chapter and state. Say "typically" and tell them to confirm.',
  'You may help draft what to ask, prepare for the aptitude test, and explain the trade-offs.',
  'If asked about a specific local or chapter you do not have verified data for, say so.',
]);

export const CAREER_DISCLAIMER = assertNoOutcomePromise(
  'SparkConnect is not affiliated with the IBEW, NECA, IEC or ABC, and has no say in who any '
  + 'programme accepts. Requirements, hours and application dates are set by each local, chapter '
  + 'and state board, and they change — confirm every detail with them directly before you rely '
  + 'on it. What is here is the shape of each route, not an application.',
  'career disclaimer',
);

/** Everything a screen needs, in one call. */
export const careerHome = () => Object.freeze({
  paths: PATHS,
  comparison: comparison(),
  firstSteps: FIRST_STEPS,
  disclaimer: CAREER_DISCLAIMER,
});
