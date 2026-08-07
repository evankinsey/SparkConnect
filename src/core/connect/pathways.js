// ─── PATHWAYS ────────────────────────────────────────────────────────────────
// For the apprentice or journeyman doing side work who wants to do it properly.
//
// This is the part of ContractorConnect that helps somebody tonight, without a
// single row of scraped data. The person this is for has a truck, a helper, and
// a neighbour who wants a panel changed, and their real question is not "who is
// a good contractor" — it is:
//
//   Can I legally do this job?
//   Do I need a permit, and can I even pull one?
//   What is the difference between my journeyman card and a contractor licence?
//   What is a qualifying agent and do I need to be one, or find one?
//   How far away am I from doing this on my own?
//
// THE RULE THIS FILE ENFORCES, AND WHY IT IS UNUSUAL:
//
// Every statement carries a `certainty`. Statements about how licensing WORKS —
// that states distinguish a contractor licence from a journeyman card, that a
// business entity is usually qualified by a licensed individual — are STRUCTURAL
// and safe to explain. Statements about what a specific jurisdiction REQUIRES of
// a specific person are not ours to make, and are marked ASK_AUTHORITY with the
// question to ask.
//
// The temptation here is enormous and worth naming: I could write "in Florida
// you need an EC licence with four years of experience" and it would read as
// authoritative and helpful. It would also be a legal claim, made from memory,
// to someone about to spend money on it. Everything specific in this file is
// therefore a QUESTION TO ASK rather than an answer given.
//
// Pure module: no React, no network, no storage.

import { findOutcomePromise } from './index.js';

export const Certainty = Object.freeze({
  // How the system is arranged. Stable, general, safe to explain.
  STRUCTURAL: 'STRUCTURAL',
  // Specific to a jurisdiction or a person. We frame the question; the board answers.
  ASK_AUTHORITY: 'ASK_AUTHORITY',
});

export const CERTAINTY_LABEL = Object.freeze({
  STRUCTURAL: 'How it generally works',
  ASK_AUTHORITY: 'Confirm with your licensing board',
});

// ─── Where somebody is ───────────────────────────────────────────────────────

export const Stage = Object.freeze({
  HELPER: 'HELPER',
  APPRENTICE: 'APPRENTICE',
  JOURNEYMAN: 'JOURNEYMAN',
  SIDE_WORK: 'SIDE_WORK',
  QUALIFYING: 'QUALIFYING',
  CONTRACTOR: 'CONTRACTOR',
});

export const STAGE_LABEL = Object.freeze({
  HELPER: 'Helping on jobs',
  APPRENTICE: 'Apprentice, working under a licence',
  JOURNEYMAN: 'Journeyman',
  SIDE_WORK: 'Doing side work',
  QUALIFYING: 'Getting licensed',
  CONTRACTOR: 'Licensed contractor',
});

/**
 * The questions a person can start from. Written the way somebody would
 * actually say it, not the way a licensing board would.
 */
export const START_POINTS = Object.freeze([
  {
    id: 'can-i-do-this-job',
    ask: 'Can I legally do this job on my own?',
    forStages: [Stage.APPRENTICE, Stage.JOURNEYMAN, Stage.SIDE_WORK],
    leadsTo: 'licence-vs-card',
  },
  {
    id: 'do-i-need-permit',
    ask: 'Does this job need a permit?',
    forStages: [Stage.JOURNEYMAN, Stage.SIDE_WORK, Stage.CONTRACTOR],
    leadsTo: 'who-can-pull',
  },
  {
    id: 'start-my-own',
    ask: 'What does it take to start my own company?',
    forStages: [Stage.JOURNEYMAN, Stage.SIDE_WORK],
    leadsTo: 'qualifying-agent',
  },
  {
    id: 'need-a-qualifier',
    ask: 'I have a company. Do I need someone to qualify it?',
    forStages: [Stage.SIDE_WORK, Stage.QUALIFYING],
    leadsTo: 'qualifying-agent',
  },
  {
    id: 'be-a-qualifier',
    ask: 'I am licensed. What does qualifying someone else involve?',
    forStages: [Stage.CONTRACTOR],
    leadsTo: 'qualifier-risk',
  },
]);

// ─── What we can explain, and what we must not ───────────────────────────────

/**
 * Topics. `points` carry their own certainty so a screen can render the
 * structural explanation as prose and the jurisdiction-specific parts as a list
 * of questions with somewhere to take them.
 */
export const TOPICS = Object.freeze([
  {
    id: 'licence-vs-card',
    title: 'A journeyman card is not a contractor licence',
    summary: 'They answer different questions. One says you are competent to do the work. '
      + 'The other says your business may contract for it.',
    points: Object.freeze([
      {
        certainty: Certainty.STRUCTURAL,
        text: 'Most places separate the person doing the work from the entity selling it. '
          + 'A journeyman or equivalent card generally says an individual has the training and '
          + 'hours to perform the work. A contractor licence generally lets a business enter into '
          + 'contracts, pull permits and be held responsible for the result.',
      },
      {
        certainty: Certainty.STRUCTURAL,
        text: 'That is why a very experienced journeyman can be unable to pull a permit in their '
          + 'own name. It is not a judgement about skill. It is that permits attach to the '
          + 'licensed entity responsible for the work.',
      },
      {
        certainty: Certainty.ASK_AUTHORITY,
        text: 'Whether your card is issued by the state, the county or the city, and what it '
          + 'permits you to do without a contractor licence.',
        askThis: 'What does my journeyman card allow me to do on my own, and what does it not?',
      },
      {
        certainty: Certainty.ASK_AUTHORITY,
        text: 'Whether your jurisdiction recognises a card issued somewhere else.',
        askThis: 'Do you accept a journeyman card from another county or state, and under what conditions?',
      },
    ]),
  },
  {
    id: 'who-can-pull',
    title: 'Who can pull the permit',
    summary: 'Usually the licensed contractor responsible for the work — sometimes the '
      + 'homeowner, on their own property, under conditions.',
    points: Object.freeze([
      {
        certainty: Certainty.STRUCTURAL,
        text: 'A permit names who is responsible. That is normally the licensed contractor '
          + 'performing the work, which is why the licence and the permit travel together.',
      },
      {
        certainty: Certainty.STRUCTURAL,
        text: 'Many jurisdictions also allow a homeowner permit for work on a home they own and '
          + 'occupy. The conditions vary a lot and often exclude work for resale or for rent.',
      },
      {
        certainty: Certainty.STRUCTURAL,
        text: 'Pulling a permit under someone else’s licence for work they are not supervising '
          + 'is a serious offence in most places, and the licence holder carries the consequence. '
          + 'If a contractor offers to "just pull it for you", that is their licence at risk, and '
          + 'in many jurisdictions yours too.',
      },
      {
        certainty: Certainty.ASK_AUTHORITY,
        text: 'Whether this specific job needs a permit at all. Thresholds are local and a '
          + 'like-for-like swap is treated differently from place to place.',
        askThis: 'Does replacing [describe the work] at [address] require a permit?',
      },
      {
        certainty: Certainty.ASK_AUTHORITY,
        text: 'Whether a homeowner permit is available here and what it excludes.',
        askThis: 'Do you issue homeowner permits for electrical work, and what are the conditions?',
      },
    ]),
  },
  {
    id: 'qualifying-agent',
    title: 'What a qualifying agent actually is',
    summary: 'A licensed individual who makes a company able to hold a licence — and who '
      + 'takes on the responsibility that comes with it.',
    points: Object.freeze([
      {
        certainty: Certainty.STRUCTURAL,
        text: 'A company is not a person and cannot sit an exam. So most states let a business '
          + 'hold a contracting licence through a licensed individual — called a qualifying agent, '
          + 'qualifier, or responsible managing employee depending on where you are.',
      },
      {
        certainty: Certainty.STRUCTURAL,
        text: 'This is the route most people take to start their own shop: get licensed as an '
          + 'individual, then qualify your own company. You are your own qualifying agent.',
      },
      {
        certainty: Certainty.STRUCTURAL,
        text: 'The other route is finding someone licensed to qualify your company. It is legal '
          + 'in many places and heavily regulated, because the qualifier is genuinely on the hook '
          + 'for work they may not be doing themselves. Arrangements where the qualifier never '
          + 'visits the job are the ones that end licences.',
      },
      {
        certainty: Certainty.ASK_AUTHORITY,
        text: 'What your state calls this role and what it requires — experience, exams, '
          + 'financial responsibility, insurance, and how many companies one person may qualify.',
        askThis: 'What are the requirements to qualify a company for electrical contracting here, '
          + 'and how many entities can one qualifier hold?',
      },
      {
        certainty: Certainty.ASK_AUTHORITY,
        text: 'Whether your experience counts toward the licence, and how it must be documented.',
        askThis: 'What experience do I need for the contractor exam, and how do I document my hours?',
      },
    ]),
  },
  {
    id: 'qualifier-risk',
    title: 'If you are the one qualifying a company',
    summary: 'You are responsible for work you might not perform. Understand that before '
      + 'anyone offers you money for it.',
    points: Object.freeze([
      {
        certainty: Certainty.STRUCTURAL,
        text: 'Qualifying a company generally means the regulator treats you as responsible for '
          + 'its work. Complaints, unfinished jobs and failed inspections tend to land on the '
          + 'qualifier’s licence, not just on the business.',
      },
      {
        certainty: Certainty.STRUCTURAL,
        text: 'Because of that, the arrangements that hold up are the ones with real supervision, '
          + 'real involvement and something in writing. Being paid a monthly fee to attach your '
          + 'licence to a company you never visit is the pattern regulators look for.',
      },
      {
        certainty: Certainty.ASK_AUTHORITY,
        text: 'What supervision your state requires of a qualifier, and how to withdraw from a '
          + 'company properly if it goes wrong.',
        askThis: 'What supervision is required of a qualifying agent, and what is the process to '
          + 'withdraw as qualifier of a company?',
      },
    ]),
  },
  {
    id: 'side-work-honestly',
    title: 'Side work, honestly',
    summary: 'The risk is not usually getting caught. It is what happens when a job goes wrong.',
    points: Object.freeze([
      {
        certainty: Certainty.STRUCTURAL,
        text: 'Unpermitted and unlicensed work tends to surface at the worst moment: a sale, an '
          + 'insurance claim after a fire, or an injury. That is when "it was fine, I know what I '
          + 'am doing" stops being the relevant question.',
      },
      {
        certainty: Certainty.STRUCTURAL,
        text: 'Working under someone else’s licence with their genuine supervision is a normal '
          + 'and legal way to build hours toward your own. The problem is the version without '
          + 'the supervision.',
      },
      {
        certainty: Certainty.STRUCTURAL,
        text: 'Liability insurance generally does not cover work you were not licensed to perform. '
          + 'Neither does the homeowner’s policy.',
      },
      {
        certainty: Certainty.ASK_AUTHORITY,
        text: 'What unlicensed contracting carries as a penalty where you are, and what the '
          + 'threshold is — some places exempt small jobs by dollar value.',
        askThis: 'Is there a dollar threshold below which a contractor licence is not required here?',
      },
    ]),
  },
]);

export const topicById = (id) => TOPICS.find((t) => t.id === id) ?? null;

/** Only the parts we are entitled to state as explanation. */
export const structuralPoints = (topic) =>
  (topic?.points ?? []).filter((p) => p.certainty === Certainty.STRUCTURAL);

/** The questions to take to the board — every one with wording to read out. */
export const questionsToAsk = (topic) =>
  (topic?.points ?? []).filter((p) => p.certainty === Certainty.ASK_AUTHORITY);

/**
 * A call script for the licensing board or building department.
 *
 * The reason this exists rather than a list of answers: a person who rings up
 * with specific questions gets a specific answer they can rely on, and it takes
 * one phone call. A person who reads our summary gets our summary.
 */
export const callScript = (topicIds = [], { jurisdictionName = null, trade = 'electrical' } = {}) => {
  const topics = topicIds.map(topicById).filter(Boolean);
  const questions = topics.flatMap((t) => questionsToAsk(t).map((p) => p.askThis)).filter(Boolean);
  if (!questions.length) return null;

  return Object.freeze({
    opening: `Hi — I do ${trade} work${jurisdictionName ? ` in ${jurisdictionName}` : ''} and I am `
      + 'trying to understand what I am allowed to do on my own. Can I ask a few questions?',
    questions: Object.freeze([...new Set(questions)]),
    closing: 'Is there anything published I can read, so I am not relying on my notes from this call?',
    afterwards: 'Record the answers in the Permit Assistant against this jurisdiction, so you only '
      + 'have to ask once and the next job starts from what they told you.',
  });
};

// ─── The plan ────────────────────────────────────────────────────────────────

/**
 * What to do next, given where somebody says they are.
 *
 * Deliberately short. A twelve-step plan to becoming a contractor is a thing
 * nobody follows; three next actions is a thing somebody does this week.
 */
export const nextSteps = (stage) => {
  const s = Object.prototype.hasOwnProperty.call(Stage, stage) ? stage : Stage.JOURNEYMAN;

  const common = [
    {
      id: 'know-your-ahj',
      label: 'Find out who your authority actually is',
      detail: 'Work is permitted by a specific city or county office, not by the state in general. '
        + 'Knowing which one, before you need them, saves a day.',
      opens: 'permit',
    },
  ];

  const byStage = {
    [Stage.HELPER]: [
      { id: 'hours', label: 'Start documenting your hours now',
        detail: 'Experience requirements are usually counted in verified hours under a licensed person. '
          + 'Reconstructing four years of work later is far harder than logging it as you go.',
        opens: 'projects' },
    ],
    [Stage.APPRENTICE]: [
      { id: 'hours', label: 'Keep documenting your hours',
        detail: 'The daily log in Projects records who was on site and for how long. That is the '
          + 'shape of evidence a board asks for.',
        opens: 'projects' },
      { id: 'card', label: 'Ask what your card would let you do',
        detail: 'Worth knowing before you need it.', opens: null },
    ],
    [Stage.JOURNEYMAN]: [
      { id: 'licence-gap', label: 'Find out exactly what stands between you and a licence',
        detail: 'Usually experience, an exam, and financial responsibility. The specifics are '
          + 'a phone call away and are not what anybody on the internet says they are.',
        opens: null },
      { id: 'hours', label: 'Get your hours in writing',
        detail: 'Boards generally want them verified by the licence holder you worked under. '
          + 'Ask while you are still working there.', opens: 'projects' },
    ],
    [Stage.SIDE_WORK]: [
      { id: 'permit-check', label: 'Check whether the job you are looking at needs a permit',
        detail: 'This is the question that decides whether the rest matters.', opens: 'permit' },
      { id: 'licence-gap', label: 'Work out your route to a licence',
        detail: 'Either qualify yourself, or find a licensed contractor to work under properly.',
        opens: null },
    ],
    [Stage.QUALIFYING]: [
      { id: 'exam', label: 'Confirm the exam and the experience it needs',
        detail: 'Ask the board directly. Prep courses will tell you what they are selling.', opens: null },
      { id: 'entity', label: 'Understand what qualifying your own company involves',
        detail: 'Most people starting a shop are their own qualifying agent.', opens: null },
    ],
    [Stage.CONTRACTOR]: [
      { id: 'qualify-others', label: 'Understand what qualifying another company would put at risk',
        detail: 'Before anyone offers you money for it.', opens: null },
    ],
  };

  return Object.freeze({
    stage: s,
    stageLabel: STAGE_LABEL[s],
    steps: Object.freeze([...(byStage[s] ?? []), ...common].map(Object.freeze)),
    topics: Object.freeze(START_POINTS.filter((p) => p.forStages.includes(s)).map((p) => p.id)),
  });
};

// ─── The guardrail, applied to this file ─────────────────────────────────────

export const PATHWAY_DISCLAIMER =
  'This explains how contractor licensing is generally arranged. It is not legal advice and it is '
  + 'not specific to your situation. Licensing and permit requirements are set by your state board '
  + 'and your local building department, and only they can tell you what applies to you.';

/**
 * Self-check, run by the tests.
 *
 * Every string a user reads from this file goes through the same
 * outcome-promise detector the rest of Contractor Connect uses, and every
 * ASK_AUTHORITY point must actually carry a question. A point marked
 * "ask the authority" with nothing to ask is just a shrug.
 */
export const auditCopy = () => {
  const problems = [];
  for (const t of TOPICS) {
    for (const text of [t.title, t.summary]) {
      const hit = findOutcomePromise(text);
      if (hit) problems.push(`${t.id}: "${text}" promises an outcome`);
    }
    for (const p of t.points) {
      const hit = findOutcomePromise(p.text);
      if (hit) problems.push(`${t.id}: a point promises an outcome`);
      if (p.certainty === Certainty.ASK_AUTHORITY && !p.askThis) {
        problems.push(`${t.id}: an ASK_AUTHORITY point has no question to ask`);
      }
      if (p.certainty === Certainty.STRUCTURAL && p.askThis) {
        problems.push(`${t.id}: a STRUCTURAL point should not need the board`);
      }
    }
  }
  return Object.freeze(problems);
};
