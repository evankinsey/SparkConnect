// ─── MARKETPLACE SUBMISSIONS ─────────────────────────────────────────────────
// The four Contractor Connect pathways, and the one rule that governs all of
// them: THE APP MAY NOT SAY A THING WAS SENT UNTIL SOMETHING OUTSIDE THE APP
// SAYS SO.
//
// The bug this file exists to make impossible: a form that saves locally,
// shows a confirmation, and offers "send" as a separate optional step
// afterwards. Every user who stops at the confirmation believes they have
// submitted an opportunity. Nobody has received it. For a $20k job that is not
// a UI nit — it is the product silently failing at the only thing it promised,
// and the user finding out weeks later when nobody called.
//
// So `submitted` is not a boolean here. It is a state machine whose terminal
// state cannot be reached from a draft, and whose copy is written per state so
// there is no way to render a friendly success line over a local file.
//
// WHAT WE CAN AND CANNOT KNOW. There is no marketplace backend. A handoff goes
// through the OS share sheet or a mail composer, and those tell us very
// different things:
//
//   share sheet completed  →  the OS says the payload went to the app the user
//                             picked. That is real evidence, and it is the most
//                             any client-side handoff can have.
//   mail composer opened   →  we know a composer opened. We do NOT know an
//                             email was sent, and claiming otherwise is the
//                             same lie in a different place.
//
// `DeliveryEvidence` records which of those actually happened, and the copy for
// each state is written to be true given only that evidence. No state says
// "we received it", because nothing in this app can know that.
//
// Pure module: no React, no network, no storage. The screen owns the share
// sheet; this owns what may be claimed about the result.

import { Trade, TRADE_LABEL, findOutcomePromise } from './index.js';
import { looksLikeLicenseNumber, normalizeLicenseNumber } from './adapters/florida.js';

export const SUPPORT_EMAIL = 'support@sparkconnect.pro';

// ─── The four intents ────────────────────────────────────────────────────────

export const Pathway = Object.freeze({
  HAVE_JOB: 'HAVE_JOB',
  NEED_QUALIFIER: 'NEED_QUALIFIER',
  WANT_WORK: 'WANT_WORK',
  CAN_QUALIFY: 'CAN_QUALIFY',
});

const field = (id, label, def = {}) => Object.freeze({
  id,
  label,
  placeholder: def.placeholder ?? '',
  required: def.required !== false,
  multiline: !!def.multiline,
  keyboard: def.keyboard ?? 'default',
  help: def.help ?? null,
  maxLength: def.maxLength ?? 240,
});

const LOCATION = field('location', 'City and county', {
  placeholder: 'Tampa, Hillsborough',
  help: 'Everything in this space is local. Without it nothing can be matched.',
  maxLength: 80,
});

const SCOPE = field('scope', 'What the work is', {
  placeholder: 'Service change, 200A, single family. Panel is on the north wall.',
  multiline: true,
  maxLength: 800,
});

const LICENSE = field('license', 'Licence number', {
  placeholder: 'EC13001234',
  help: 'Checked against the issuing board — never verified from what is typed here.',
  maxLength: 24,
});

/**
 * The four cards on the entry screen.
 *
 * `subjectLabel` is what lands in Evan's inbox subject line. It is separate
 * from `title` because "I HAVE A JOB" is how a user thinks about it and
 * "Job Opportunity" is how an inbox needs to sort it.
 */
export const PATHWAYS = Object.freeze([
  Object.freeze({
    id: Pathway.HAVE_JOB,
    title: 'I have a job',
    icon: 'briefcase',
    subjectLabel: 'Job Opportunity',
    blurb: 'Found work you cannot personally contract? Submit the opportunity and we will '
      + 'help connect it with an appropriately licensed contractor.',
    fields: Object.freeze([
      LOCATION,
      SCOPE,
      field('value', 'Rough value', {
        placeholder: '$8,000 – $12,000',
        required: false,
        help: 'A range is fine. It helps us match the right contractor.',
        maxLength: 60,
      }),
      field('timing', 'When it needs doing', { placeholder: 'Within a month', required: false, maxLength: 80 }),
    ]),
  }),
  Object.freeze({
    id: Pathway.NEED_QUALIFIER,
    title: 'I need a qualifier',
    icon: 'shield-checkmark',
    subjectLabel: 'Qualifier Request',
    blurb: 'Looking for a properly licensed professional to qualify your business? '
      + 'Submit what you need for review and matching.',
    fields: Object.freeze([
      LOCATION,
      field('business', 'Your business', { placeholder: 'Registered name, or "not formed yet"', maxLength: 120 }),
      field('need', 'What you need a qualifier for', {
        placeholder: 'Residential service and remodel work in Hillsborough.',
        multiline: true, maxLength: 800,
      }),
    ]),
  }),
  Object.freeze({
    id: Pathway.WANT_WORK,
    title: 'I want work',
    icon: 'construct',
    subjectLabel: 'Contractor Profile',
    blurb: 'Licensed contractor? Tell us what projects, locations and sizes you are '
      + 'interested in.',
    fields: Object.freeze([
      LOCATION,
      LICENSE,
      field('interests', 'What you take on', {
        placeholder: 'Service changes, panel upgrades, small commercial tenant work.',
        multiline: true, maxLength: 800,
      }),
      field('range', 'Job sizes you want', { placeholder: '$5k – $60k', required: false, maxLength: 60 }),
    ]),
  }),
  Object.freeze({
    id: Pathway.CAN_QUALIFY,
    title: 'I can qualify',
    icon: 'ribbon',
    subjectLabel: 'Qualifier Interest',
    blurb: 'Licensed professional? Create an interest profile for appropriate '
      + 'qualifying relationships.',
    fields: Object.freeze([
      LOCATION,
      LICENSE,
      field('terms', 'What you would consider', {
        placeholder: 'One company, residential only, within Hillsborough and Pinellas.',
        multiline: true, maxLength: 800,
      }),
    ]),
  }),
]);

export const pathwayById = (id) => PATHWAYS.find((p) => p.id === id) ?? null;

// ─── Contact ─────────────────────────────────────────────────────────────────
// A manually-matched lead with no way to reach the person is not a lead. This
// is the shortest set that lets a human follow up, and nothing beyond it is
// asked for.

export const ContactMethod = Object.freeze({
  EMAIL: 'EMAIL',
  PHONE: 'PHONE',
  TEXT: 'TEXT',
});

export const CONTACT_METHOD_LABEL = Object.freeze({
  EMAIL: 'Email', PHONE: 'Phone call', TEXT: 'Text message',
});

const clean = (v, max = 120) =>
  (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Deliberately permissive. A regex that rejects a real address is worse than one that lets a typo through. */
export const looksLikeEmail = (v) => /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/.test(clean(v));

/** Ten digits somewhere in the string. Formatting is the user's business. */
export const looksLikePhone = (v) => (clean(v).match(/\d/g) ?? []).length >= 10;

export const contactDetails = (input) => {
  const c = input ?? {};
  const preferred = Object.prototype.hasOwnProperty.call(ContactMethod, c.preferred)
    ? c.preferred : ContactMethod.EMAIL;
  return Object.freeze({
    name: clean(c.name, 80),
    email: clean(c.email, 120).toLowerCase(),
    phone: clean(c.phone, 40),
    preferred,
  });
};

/**
 * Validated against how they asked to be reached.
 *
 * Requiring both an email and a phone from everybody is the kind of friction
 * that loses submissions. Requiring the one they chose is the minimum that
 * makes follow-up possible.
 */
export const validateContact = (contact) => {
  const c = contactDetails(contact);
  const missing = [];
  if (!c.name) missing.push('name');
  if (!looksLikeEmail(c.email)) missing.push('email');
  if (c.preferred !== ContactMethod.EMAIL && !looksLikePhone(c.phone)) missing.push('phone');
  return Object.freeze({
    ok: missing.length === 0,
    missing: Object.freeze(missing),
    reason: missing.length === 0 ? null
      : missing.includes('name') ? 'Who should we ask for?'
        : missing.includes('email') ? 'We need an email address that works.'
          : `You asked to be reached by ${CONTACT_METHOD_LABEL[c.preferred].toLowerCase()}, so we need a number.`,
  });
};

// ─── The state machine ───────────────────────────────────────────────────────

/**
 * The five honest states.
 *
 * There is no SUBMITTED and no RECEIVED, because nothing in this app can
 * observe either one. HANDED_OFF is the strongest claim available and it means
 * exactly what it says: the payload left this app through something the OS
 * confirmed.
 */
export const SubmissionStatus = Object.freeze({
  DRAFT: 'DRAFT',
  READY_TO_SEND: 'READY_TO_SEND',
  HANDOFF_STARTED: 'HANDOFF_STARTED',
  HANDED_OFF: 'HANDED_OFF',
  SEND_FAILED: 'SEND_FAILED',
});

/** What the OS actually told us. The copy for each state is true given only this. */
export const DeliveryEvidence = Object.freeze({
  NONE: 'NONE',
  // The share sheet reported the payload went to the chosen app.
  OS_REPORTED_SHARED: 'OS_REPORTED_SHARED',
  // A mail composer opened. Proves nothing was sent.
  COMPOSER_OPENED: 'COMPOSER_OPENED',
});

/**
 * User-facing copy, per state.
 *
 * Written here rather than in the screen so a test can read every string and
 * assert that no local-only state claims delivery. A screen can render this; it
 * cannot invent a cheerier version of it.
 */
export const STATUS_COPY = Object.freeze({
  [SubmissionStatus.DRAFT]: Object.freeze({
    label: 'Draft',
    headline: 'Saved on this device',
    detail: 'Nothing has left your phone yet. Finish the details and send it when you are ready.',
    cta: 'Continue',
    tone: 'neutral',
  }),
  [SubmissionStatus.READY_TO_SEND]: Object.freeze({
    label: 'Ready to send',
    headline: 'Ready to send',
    detail: 'Everything needed is filled in. Contractor Connect has not seen this yet.',
    cta: 'Send to Contractor Connect',
    tone: 'ready',
  }),
  [SubmissionStatus.HANDOFF_STARTED]: Object.freeze({
    label: 'Not sent yet',
    headline: 'Not sent yet',
    detail: 'Your information is saved on this device, but Contractor Connect has not received it. '
      + 'If your mail app sent it, you are done — otherwise send it again.',
    cta: 'Try Sending Again',
    tone: 'warn',
  }),
  [SubmissionStatus.HANDED_OFF]: Object.freeze({
    label: 'Sent for review',
    headline: 'Sent for review',
    // Precise about what happened, then about what happens next. "Sent using
    // the app you chose" is what the OS told us; "received" is not.
    detail: 'Sent using the app you chose. Early Contractor Connect matches are assisted manually — '
      + 'our team reviews each submission and follows up using the contact details you provided.',
    cta: 'Send again',
    tone: 'good',
  }),
  [SubmissionStatus.SEND_FAILED]: Object.freeze({
    label: 'Not sent yet',
    headline: 'Not sent yet',
    detail: 'Your information is saved on this device, but Contractor Connect has not received it.',
    cta: 'Try Sending Again',
    tone: 'bad',
  }),
});

/**
 * Legal moves.
 *
 * The one that matters is the absence of DRAFT → HANDED_OFF. A submission
 * cannot become sent without passing through an actual handoff attempt, which
 * is the structural version of "do not label it sent until it is".
 */
export const TRANSITIONS = Object.freeze({
  [SubmissionStatus.DRAFT]: Object.freeze([SubmissionStatus.READY_TO_SEND]),
  [SubmissionStatus.READY_TO_SEND]: Object.freeze([SubmissionStatus.DRAFT, SubmissionStatus.HANDOFF_STARTED]),
  [SubmissionStatus.HANDOFF_STARTED]: Object.freeze([
    SubmissionStatus.HANDED_OFF, SubmissionStatus.SEND_FAILED, SubmissionStatus.HANDOFF_STARTED,
  ]),
  // Resending is allowed and is a fresh attempt, not a re-declaration.
  [SubmissionStatus.HANDED_OFF]: Object.freeze([SubmissionStatus.HANDOFF_STARTED]),
  [SubmissionStatus.SEND_FAILED]: Object.freeze([SubmissionStatus.HANDOFF_STARTED, SubmissionStatus.DRAFT]),
});

const nextId = (at) => `cc_${Date.parse(at) || Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const submissionDraft = (input) => {
  const i = input ?? {};
  const path = pathwayById(i.pathway);
  if (!path) return null;
  const at = typeof i.createdAt === 'string' ? i.createdAt : new Date().toISOString();

  const answers = {};
  for (const f of path.fields) {
    const raw = i.answers?.[f.id];
    answers[f.id] = clean(raw, f.maxLength);
  }
  if (answers.license !== undefined) answers.license = normalizeLicenseNumber(answers.license);

  return Object.freeze({
    id: typeof i.id === 'string' && i.id ? i.id : nextId(at),
    pathway: path.id,
    trade: Object.prototype.hasOwnProperty.call(Trade, i.trade) ? i.trade : Trade.ELECTRICAL,
    contact: contactDetails(i.contact),
    answers: Object.freeze(answers),
    status: Object.prototype.hasOwnProperty.call(SubmissionStatus, i.status)
      ? i.status : SubmissionStatus.DRAFT,
    evidence: Object.prototype.hasOwnProperty.call(DeliveryEvidence, i.evidence)
      ? i.evidence : DeliveryEvidence.NONE,
    createdAt: at,
    updatedAt: typeof i.updatedAt === 'string' ? i.updatedAt : at,
    attempts: Number.isFinite(i.attempts) && i.attempts > 0 ? Math.floor(i.attempts) : 0,
    lastAttemptAt: typeof i.lastAttemptAt === 'string' ? i.lastAttemptAt : null,
  });
};

export const validateSubmission = (sub) => {
  const path = pathwayById(sub?.pathway);
  if (!path) return Object.freeze({ ok: false, missing: Object.freeze(['pathway']), reason: 'Pick what you are here for.' });

  const missing = path.fields.filter((f) => f.required && !sub.answers?.[f.id]).map((f) => f.id);
  const c = validateContact(sub.contact);

  return Object.freeze({
    ok: missing.length === 0 && c.ok,
    missing: Object.freeze([...missing, ...c.missing]),
    reason: missing.length
      ? `Still needed: ${missing.map((id) => path.fields.find((f) => f.id === id).label.toLowerCase()).join(', ')}.`
      : c.reason,
  });
};

/**
 * Move a submission, or refuse and say why.
 *
 * Refusing rather than throwing, because the caller is a button handler and a
 * thrown error there is a crash on a screen somebody is mid-form on.
 */
export const transition = (sub, next, options = {}) => {
  const o = options ?? {};
  if (!sub || !Object.prototype.hasOwnProperty.call(SubmissionStatus, sub.status)) {
    return Object.freeze({ ok: false, sub, error: 'That submission is not in a known state.' });
  }
  if (!Object.prototype.hasOwnProperty.call(SubmissionStatus, next)) {
    return Object.freeze({ ok: false, sub, error: `No such state: ${next}` });
  }
  if (!TRANSITIONS[sub.status].includes(next)) {
    return Object.freeze({
      ok: false, sub,
      error: `A submission cannot go from ${sub.status} to ${next}.`,
    });
  }
  // Nothing reaches READY_TO_SEND while it is still incomplete.
  if (next === SubmissionStatus.READY_TO_SEND) {
    const v = validateSubmission(sub);
    if (!v.ok) return Object.freeze({ ok: false, sub, error: v.reason });
  }
  // The load-bearing check. HANDED_OFF is a claim about the outside world, so
  // it requires evidence from the outside world.
  if (next === SubmissionStatus.HANDED_OFF && o.evidence !== DeliveryEvidence.OS_REPORTED_SHARED) {
    return Object.freeze({
      ok: false, sub,
      error: 'Nothing confirmed the handoff, so this cannot be marked as sent.',
    });
  }

  const at = o.at ?? new Date().toISOString();
  return Object.freeze({
    ok: true,
    error: null,
    sub: Object.freeze({
      ...sub,
      status: next,
      evidence: next === SubmissionStatus.HANDOFF_STARTED
        ? (o.evidence ?? DeliveryEvidence.NONE)
        : (o.evidence ?? sub.evidence),
      updatedAt: at,
      attempts: next === SubmissionStatus.HANDOFF_STARTED ? sub.attempts + 1 : sub.attempts,
      lastAttemptAt: next === SubmissionStatus.HANDOFF_STARTED ? at : sub.lastAttemptAt,
    }),
  });
};

/** Has anything actually left the device? The one question the UI keeps asking. */
export const wasHandedOff = (sub) =>
  sub?.status === SubmissionStatus.HANDED_OFF
  && sub?.evidence === DeliveryEvidence.OS_REPORTED_SHARED;

// ─── Moderation ──────────────────────────────────────────────────────────────
// Advisory, attached to the submission, and shown to the person doing the
// matching. Nothing here blocks a send — a flag is context for a human, not a
// gate, and a gate on a lead is a lost lead.

export const ModerationFlag = Object.freeze({
  UNVERIFIED_LICENCE: 'UNVERIFIED_LICENCE',
  LICENCE_LOOKS_WRONG: 'LICENCE_LOOKS_WRONG',
  NO_LICENCE_STATED: 'NO_LICENCE_STATED',
  OUTCOME_PROMISE: 'OUTCOME_PROMISE',
  CONTACT_IN_FREE_TEXT: 'CONTACT_IN_FREE_TEXT',
});

export const FLAG_NOTE = Object.freeze({
  UNVERIFIED_LICENCE: 'A licence number was given. Nobody has checked it — open the DBPR link before matching.',
  LICENCE_LOOKS_WRONG: 'The licence number does not look like a licence number. Worth confirming before matching.',
  NO_LICENCE_STATED: 'This pathway is for licensed professionals and no licence number was given.',
  OUTCOME_PROMISE: 'The free text promises a licensing or permitting outcome. Do not repeat it back.',
  CONTACT_IN_FREE_TEXT: 'Contact details appear in the description as well as the contact fields.',
});

const FREE_TEXT = ['scope', 'need', 'interests', 'terms'];

export const moderationFlags = (sub) => {
  const flags = [];
  if (!sub) return Object.freeze(flags);
  const licensed = sub.pathway === Pathway.WANT_WORK || sub.pathway === Pathway.CAN_QUALIFY;
  const licence = sub.answers?.license ?? '';

  if (licensed && !licence) flags.push(ModerationFlag.NO_LICENCE_STATED);
  else if (licence && !looksLikeLicenseNumber(licence)) flags.push(ModerationFlag.LICENCE_LOOKS_WRONG);
  else if (licence) flags.push(ModerationFlag.UNVERIFIED_LICENCE);

  for (const key of FREE_TEXT) {
    const text = sub.answers?.[key];
    if (!text) continue;
    if (findOutcomePromise(text)) flags.push(ModerationFlag.OUTCOME_PROMISE);
    if (looksLikeEmail(text) || /\b\d{3}[^\dA-Za-z]?\d{3}[^\dA-Za-z]?\d{4}\b/.test(text)) {
      flags.push(ModerationFlag.CONTACT_IN_FREE_TEXT);
    }
  }
  return Object.freeze([...new Set(flags)]);
};

// ─── The handoff payload ─────────────────────────────────────────────────────
// There is no admin dashboard, so the inbox IS the dashboard. Formatted to be
// read by a person at 7am on a phone, with the machine-readable copy at the
// bottom for whenever there is something to import it into.

/** `[Contractor Connect] Job Opportunity — Electrical — Tampa` */
export const subjectFor = (sub) => {
  const path = pathwayById(sub?.pathway);
  if (!path) return '[Contractor Connect] Submission';
  const trade = TRADE_LABEL[sub.trade] ?? TRADE_LABEL[Trade.ELECTRICAL];
  const where = (sub.answers?.location ?? '').split(',')[0].trim();
  return `[Contractor Connect] ${path.subjectLabel} — ${trade}${where ? ` — ${where}` : ''}`;
};

/** The DBPR record for a stated licence, so matching starts at the authority. */
export const verificationUrlFor = (sub) => {
  const licence = normalizeLicenseNumber(sub?.answers?.license ?? '');
  if (!licence) return null;
  return `https://www.myfloridalicense.com/wl11.asp?SID=&licnbr=${encodeURIComponent(licence)}`;
};

const line = (label, value) => (value ? `${label}: ${value}` : null);

export const bodyFor = (sub) => {
  const path = pathwayById(sub?.pathway);
  if (!path) return '';
  const flags = moderationFlags(sub);
  const verify = verificationUrlFor(sub);
  const c = sub.contact;

  const parts = [
    path.subjectLabel.toUpperCase(),
    '',
    line('Submission', sub.id),
    line('Pathway', path.title),
    line('Trade', TRADE_LABEL[sub.trade]),
    line('Submitted at', sub.updatedAt),
    '',
    'CONTACT',
    line('Name', c.name),
    line('Email', c.email),
    line('Phone', c.phone),
    line('Prefers', CONTACT_METHOD_LABEL[c.preferred]),
    '',
    'DETAILS',
    ...path.fields.map((f) => line(f.label, sub.answers?.[f.id])),
    verify ? '' : null,
    verify ? line('Verify this licence', verify) : null,
  ];

  if (flags.length) {
    parts.push('', 'REVIEW BEFORE MATCHING');
    for (const f of flags) parts.push(`- ${FLAG_NOTE[f]}`);
  }

  // Machine-readable, for the day there is somewhere to import it. Kept to the
  // submission itself — no device ids, no app internals, no debug state.
  parts.push('', '---', 'DATA', JSON.stringify({
    id: sub.id,
    pathway: sub.pathway,
    trade: sub.trade,
    contact: c,
    answers: sub.answers,
    flags,
    verificationUrl: verify,
    createdAt: sub.createdAt,
    sentAt: sub.updatedAt,
  }));

  return parts.filter((p) => p !== null).join('\n');
};

export const handoffPayload = (sub) => Object.freeze({
  to: SUPPORT_EMAIL,
  subject: subjectFor(sub),
  body: bodyFor(sub),
});

export const mailtoUrl = (payload) => {
  const p = payload ?? {};
  const to = p.to ?? SUPPORT_EMAIL;
  return `mailto:${to}?subject=${encodeURIComponent(p.subject ?? '')}&body=${encodeURIComponent(p.body ?? '')}`;
};

// ─── Beta disclosure ─────────────────────────────────────────────────────────

export const BETA_DISCLOSURE = Object.freeze({
  title: 'Contractor Connect Beta',
  body: 'Early matches are reviewed and assisted by our team while we validate the marketplace. '
    + 'Profiles and opportunities are not currently published into a live public marketplace.',
  short: 'Early matches are personally assisted by the Contractor Connect team.',
});

// ─── The future backend, documented and not built ────────────────────────────

/**
 * The migration target, written down now so today's shapes do not drift away
 * from it.
 *
 * NOT IMPLEMENTED, deliberately. A manually-brokered beta earns the right to
 * automate by first showing what actually needs automating — and a Supabase
 * schema built before a single real submission would be a guess wearing a
 * migration file. What this does buy is that the local store below is written
 * as a repository, so swapping it for an API later is a change of
 * implementation rather than a change of design.
 */
export const BACKEND_CONTRACT = Object.freeze({
  status: 'DOCUMENTED, NOT IMPLEMENTED',
  tables: Object.freeze({
    users: 'identity; today the device is the identity and nothing is uploaded',
    opportunities: 'HAVE_JOB submissions',
    contractor_profiles: 'WANT_WORK submissions',
    qualifier_profiles: 'CAN_QUALIFY submissions',
    intro_requests: 'NEED_QUALIFIER submissions, and any match a human brokers',
    verification_records: 'licence checks, with the provenance sources.js already enforces',
    moderation_flags: 'moderationFlags() output, one row per flag per submission',
    saved_items: 'the Saved section',
    audit_events: 'every status transition, which transition() already produces',
  }),
  methodMapping: Object.freeze({
    'store.list()': 'select * from <table> where user_id = auth.uid()',
    'store.save(sub)': 'upsert, with RLS restricting the row to its owner',
    'store.remove(id)': 'delete, same RLS',
    'transition(sub, next)': 'an audit_events insert plus a status update, server-side',
    'handoffPayload(sub)': 'replaced by a real insert — the share sheet goes away entirely',
  }),
  ruleThatSurvives: 'A row is not "received" because the client says so. The server saying it '
    + 'stored the row is what makes it received, exactly as OS_REPORTED_SHARED is what makes a '
    + 'handoff a handoff today.',
});
