// ─── PERMIT ASSISTANT ────────────────────────────────────────────────────────
// "What permit do I need? What inspections? What documents?"
//
// The honest design constraint, and the reason this module looks the way it
// does: permit law is set by roughly 20,000 local authorities having
// jurisdiction, each free to amend the adopted code, set its own fee schedule,
// and decide who may pull a permit at all. Any app that answers "you need a
// permit" as a statement of local law is wrong somewhere, and being wrong here
// costs a user a red tag, a failed inspection, or an illegal install.
//
// So this module never asserts local law. It does three things that are true
// everywhere and genuinely useful:
//
//   1. Classifies the work, because the classification drives everything else.
//   2. States what is TYPICAL for that work, labelled as typical, with the
//      reasoning — so the user knows what to expect and what to ask about.
//   3. Generates the call script: the specific questions to put to the AHJ,
//      so a two-minute phone call replaces a guess.
//
// The user's own AHJ record is the source of truth for their jurisdiction; the
// app remembers it and shows it back. Nothing here is legal advice.
//
// Pure module: no React, no storage, no network.

/** Confidence in a line item. Nothing in this module is ever CERTAIN locally. */
export const Likelihood = {
  ALMOST_ALWAYS: 'ALMOST_ALWAYS',   // essentially universal across jurisdictions
  USUALLY: 'USUALLY',
  SOMETIMES: 'SOMETIMES',           // genuinely varies — always ask
};

export const LIKELIHOOD_LABEL = Object.freeze({
  [Likelihood.ALMOST_ALWAYS]: 'Almost always',
  [Likelihood.USUALLY]: 'Usually',
  [Likelihood.SOMETIMES]: 'Varies — ask',
});

/**
 * Work types. Each carries what is typical, not what is law where you stand.
 *
 * `permit` / `inspections` / `documents` describe the common case in US
 * jurisdictions adopting the NEC. `asks` are the questions this particular
 * kind of work tends to hinge on, and they are the actual deliverable.
 */
export const WORK_TYPES = Object.freeze([
  {
    id: 'service-change',
    label: 'Service change / panel upgrade',
    sub: 'New service equipment, meter, or main panel',
    permit: Likelihood.ALMOST_ALWAYS,
    why: 'Service work changes the building\'s overcurrent protection and grounding electrode system, and the utility has to disconnect and reconnect.',
    inspections: [
      { name: 'Rough / service inspection before energizing', when: 'Before the utility reconnects' },
      { name: 'Grounding electrode system', when: 'Before it is concealed' },
      { name: 'Final', when: 'After energizing and labelling' },
    ],
    documents: ['Load calculation', 'Site plan or panel location', 'Utility coordination / disconnect request'],
    asks: [
      'Do you require a licensed contractor to pull this, or can a homeowner?',
      'Do you want the load calculation submitted with the application or at inspection?',
      'Who coordinates the utility disconnect and reconnect — me or you?',
      'What grounding electrode do you require here, and do you inspect it separately?',
      'How much lead time between passing inspection and the utility reconnect?',
    ],
  },
  {
    id: 'new-circuit',
    label: 'New branch circuit',
    sub: 'Adding a circuit to an existing panel',
    permit: Likelihood.USUALLY,
    why: 'Adding a circuit changes panel loading and adds conductors that must be inspected before they are concealed.',
    inspections: [
      { name: 'Rough-in', when: 'Before drywall or cover' },
      { name: 'Final', when: 'After devices and trim' },
    ],
    documents: ['Circuit description and panel schedule update'],
    asks: [
      'Is a permit required for a single added circuit, or is there a minor-work exemption?',
      'Do you inspect rough-in for a single circuit, or final only?',
      'Do you require an updated panel schedule at final?',
    ],
  },
  {
    id: 'panel-swap',
    label: 'Panel change, same service size',
    sub: 'Like-for-like panel replacement',
    permit: Likelihood.ALMOST_ALWAYS,
    why: 'Replacing the panel means re-terminating every branch circuit and re-establishing bonding and grounding.',
    inspections: [
      { name: 'Rough / pre-energize', when: 'Before the cover goes on' },
      { name: 'Final', when: 'After labelling' },
    ],
    documents: ['Existing load calculation', 'Panel schedule'],
    asks: [
      'Does a like-for-like swap need a full load calculation here?',
      'Do you require AFCI/GFCI to be brought up to current code on replacement, or only on new circuits?',
      'Can I energize after rough, or do I wait for final?',
    ],
  },
  {
    id: 'ev-charger',
    label: 'EV charger install',
    sub: 'EVSE, hardwired or receptacle-fed',
    permit: Likelihood.ALMOST_ALWAYS,
    why: 'EVSE is a continuous load, so it drives a load calculation and often a service evaluation, and many jurisdictions track it separately for utility planning.',
    inspections: [
      { name: 'Rough-in', when: 'Before concealment' },
      { name: 'Final', when: 'After the unit is mounted and energized' },
    ],
    documents: ['Load calculation', 'Equipment cut sheet / listing', 'Panel schedule update'],
    asks: [
      'Do you have a separate EVSE permit type or is it a general electrical permit?',
      'Do you require a load calculation showing the service can carry it?',
      'Is load management / an energy management system accepted in place of a service upgrade?',
      'Does the utility need notification for this install?',
    ],
  },
  {
    id: 'solar-storage',
    label: 'Solar / battery storage',
    sub: 'PV, ESS, or interconnection work',
    permit: Likelihood.ALMOST_ALWAYS,
    why: 'Interconnection involves the utility, structural review, fire access, and rapid-shutdown requirements, so it is reviewed by more than one department.',
    inspections: [
      { name: 'Structural / mounting', when: 'Varies' },
      { name: 'Electrical rough', when: 'Before concealment' },
      { name: 'Final and commissioning', when: 'Before interconnection' },
    ],
    documents: ['One-line diagram', 'Structural letter', 'Equipment listings', 'Interconnection application'],
    asks: [
      'Which departments review this — building, electrical, fire?',
      'What are your rapid-shutdown and labelling requirements?',
      'Do you need the interconnection agreement approved before I can pull the permit?',
      'What are your fire setback and roof access requirements?',
    ],
  },
  {
    id: 'remodel',
    label: 'Remodel / room addition',
    sub: 'Kitchen, bath, basement, addition',
    permit: Likelihood.ALMOST_ALWAYS,
    why: 'Remodels trigger current-code requirements for receptacle spacing, AFCI/GFCI protection, and lighting in the areas being worked on.',
    inspections: [
      { name: 'Rough-in', when: 'Before insulation and drywall' },
      { name: 'Final', when: 'After trim-out' },
    ],
    documents: ['Floor plan showing devices', 'Scope of work'],
    asks: [
      'How far does bringing things to current code extend past the remodelled area?',
      'Do you require AFCI on extended existing circuits?',
      'Is the electrical permit separate from the building permit?',
    ],
  },
  {
    id: 'repair-replace',
    label: 'Repair or like-for-like device swap',
    sub: 'Replacing a switch, receptacle, or fixture',
    permit: Likelihood.SOMETIMES,
    why: 'Many jurisdictions exempt direct replacement maintenance, but the exemption is narrow and often does not survive changing the device type or circuit.',
    inspections: [
      { name: 'Often none', when: 'If it qualifies as exempt maintenance' },
    ],
    documents: [],
    asks: [
      'Does a direct device replacement qualify as exempt maintenance here?',
      'Does the exemption still apply if I change the device type, for example adding GFCI?',
      'Is there a dollar threshold or a scope limit on the exemption?',
    ],
  },
  {
    id: 'commercial-ti',
    label: 'Commercial tenant improvement',
    sub: 'Build-out or change of occupancy',
    permit: Likelihood.ALMOST_ALWAYS,
    why: 'Commercial work is plan-reviewed, often stamped, and a change of occupancy can change the requirements for the whole space.',
    inspections: [
      { name: 'Underground / in-slab', when: 'Before pour' },
      { name: 'Rough-in', when: 'Before cover' },
      { name: 'Ceiling / above-grid', when: 'Before grid is closed' },
      { name: 'Final', when: 'Before occupancy' },
    ],
    documents: ['Stamped plans', 'Panel schedules', 'Load calculations', 'Fixture and equipment schedules'],
    asks: [
      'Do the plans need an engineer or architect stamp?',
      'What is your current plan review turnaround?',
      'Does the change of occupancy trigger requirements beyond my scope of work?',
      'Do you require a separate low-voltage or fire alarm permit?',
    ],
  },
]);

export const workTypeById = (id) => WORK_TYPES.find((w) => w.id === id) ?? null;

// ─── Jurisdiction record ─────────────────────────────────────────────────────
// The user's own AHJ details. This is the only jurisdiction-specific data in
// the system and it comes from the user, never from us.

export const emptyJurisdiction = () => ({
  name: '', phone: '', website: '', codeEdition: '', notes: '', updatedAt: null,
});

const CAP = { name: 80, phone: 32, website: 200, codeEdition: 40, notes: 600 };

const clean = (v, max) => {
  if (typeof v !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max) : s;
};

/** Coerce a stored jurisdiction into a usable one; a corrupt save is not fatal. */
export const sanitizeJurisdiction = (raw) => {
  if (!raw || typeof raw !== 'object') return emptyJurisdiction();
  return {
    name: clean(raw.name, CAP.name),
    phone: clean(raw.phone, CAP.phone),
    website: /^https:\/\//i.test(String(raw.website ?? '')) ? clean(raw.website, CAP.website) : '',
    codeEdition: clean(raw.codeEdition, CAP.codeEdition),
    notes: clean(raw.notes, CAP.notes),
    updatedAt: typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : null,
  };
};

export const hasJurisdiction = (j) => !!(j && j.name);

// ─── The guidance ────────────────────────────────────────────────────────────

/**
 * Build the permit guidance for a work type.
 *
 * Every returned item is explicitly labelled as typical and paired with the
 * question that settles it locally. `verifyWith` names the user's own AHJ when
 * they have saved one, which is what turns generic guidance into a next action.
 */
export const permitGuidance = (workTypeId, jurisdiction = null) => {
  const work = workTypeById(workTypeId);
  if (!work) return null;
  const j = sanitizeJurisdiction(jurisdiction);

  return {
    work,
    permit: {
      likelihood: work.permit,
      label: LIKELIHOOD_LABEL[work.permit],
      why: work.why,
    },
    inspections: work.inspections,
    documents: work.documents,
    asks: work.asks,
    verifyWith: hasJurisdiction(j) ? j.name : null,
    jurisdiction: hasJurisdiction(j) ? j : null,
    // The one line that must never be dropped from any surface that shows this.
    disclaimer:
      'Typical requirements only. Permit rules, exemptions, and inspection ' +
      'sequences are set by your local authority having jurisdiction and vary. ' +
      'Confirm with your AHJ before you start work. This is not legal advice.',
  };
};

/**
 * The call script. This is the actual product: the questions worth asking,
 * in the order a permit tech can answer them, with the job details filled in.
 */
export const buildAhjScript = (workTypeId, { jurisdiction = null, address = '', scope = '' } = {}) => {
  const g = permitGuidance(workTypeId, jurisdiction);
  if (!g) return null;

  const who = g.verifyWith ? g.verifyWith : 'your building department';
  const lines = [
    `Calling ${who} about: ${g.work.label}.`,
    address ? `Job location: ${clean(address, 120)}.` : null,
    scope ? `Scope: ${clean(scope, 240)}.` : null,
    '',
    'Questions:',
    ...g.asks.map((q, i) => `${i + 1}. ${q}`),
    `${g.asks.length + 1}. Which NEC edition and local amendments are you enforcing right now?`,
    `${g.asks.length + 2}. What is the fee, and how long from application to permit in hand?`,
    `${g.asks.length + 3}. How do I schedule inspections, and how much notice do you need?`,
  ].filter((l) => l !== null);

  return { title: `${g.work.label} — AHJ questions`, text: lines.join('\n'), guidance: g };
};

/**
 * Context handed to SparkAI so a follow-up question is answered against the
 * user's actual jurisdiction and code edition rather than in the abstract.
 * The prompt is deliberately instructed not to invent local rules.
 */
export const aiPermitContext = (workTypeId, jurisdiction = null) => {
  const g = permitGuidance(workTypeId, jurisdiction);
  if (!g) return '';
  const j = g.jurisdiction;
  return [
    `The user is asking about permits for: ${g.work.label}.`,
    j?.name ? `Their AHJ is ${j.name}.` : 'They have not told us their AHJ.',
    j?.codeEdition ? `They report the adopted code edition is ${j.codeEdition}.` : null,
    'Do not state local permit requirements as fact unless the user supplied them.',
    'Where the answer depends on the jurisdiction, say so and give the exact question to ask the AHJ.',
  ].filter(Boolean).join(' ');
};
