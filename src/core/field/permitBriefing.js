// ─── PERMIT BRIEFING ─────────────────────────────────────────────────────────
// "I'm working in Tampa" → everything you need before you pull the permit.
//
// The brief for this feature was "this shouldn't be forms, it should be AI",
// and that is right about the INPUT and dangerous about the output. A model can
// turn a sentence into a jurisdiction query. What it must never do is hand back
// a permit office phone number, an adopted code cycle and a list of local
// amendments in one confident paragraph, because a paragraph has no per-fact
// confidence and the reader has no way to tell which parts were known.
//
// So the briefing is assembled, not generated. Every line comes out of an AHJ
// record where each field already carries its own source and its own verified
// flag (ahj.js), and the briefing's whole job is to keep those apart on the way
// to the screen:
//
//   CONFIRMED   the user checked it against the authority. Usable.
//   SUGGESTED   a model proposed it. Shown, labelled, never exported, and for
//               a HIGH-risk field, shown with what it would cost to be wrong.
//   MISSING     nobody has an answer. Said out loud, because a silent gap reads
//               as "nothing to worry about".
//
// The adopted code edition is the one that matters most and it is the one this
// module is most careful with. A wrong phone number announces itself in an
// afternoon. A wrong code cycle is silent: every downstream answer in the app
// is confidently wrong and the user finds out at inspection.
//
// Pure module: no React, no network, no storage.

import {
  AHJ_FIELDS, FIELD_KEYS, FieldSource, SOURCE_LABEL, fieldMeta, isHighRisk,
  emptyRecord, exportable, pendingVerification, CURATED_SOURCE_NOTE,
} from './ahj.js';
import { permitGuidance, workTypeById } from './permits.js';

export const Standing = Object.freeze({
  CONFIRMED: 'CONFIRMED',
  SUGGESTED: 'SUGGESTED',
  MISSING: 'MISSING',
});

export const STANDING_LABEL = Object.freeze({
  CONFIRMED: 'Confirmed by you',
  SUGGESTED: 'Suggested — not verified',
  MISSING: 'Not known',
});

// ─── Reading the request ─────────────────────────────────────────────────────

/**
 * Pull a place out of a sentence.
 *
 * Deliberately dumb and deliberately conservative. It strips the lead-in a
 * person actually types and returns what is left; it does not correct spelling,
 * expand abbreviations, or pick between two places with the same name. Guessing
 * which Springfield someone meant is exactly the kind of helpfulness that puts
 * the wrong county's code cycle on a job.
 */
const LEAD_INS = [
  /^(?:i'?m|i am|we'?re|we are)\s+(?:working|doing (?:a |some )?work|on a job|pulling(?: a)? permit)\s+(?:in|at|out (?:in|of)|near)\s+/i,
  /^(?:working|job|jobsite|site|permit|inspection)\s+(?:in|at|near|for)\s+/i,
  /^(?:i'?m|i am|we'?re|we are)\s+(?:in|at|near)\s+/i,
  /^(?:what(?:'s| is) the )?(?:ahj|authority|code|permit office)\s+(?:in|for|at)\s+/i,
  /^(?:look ?up|find|check)\s+/i,
];

const TRAILERS = [
  /\s+(?:please|thanks|thank you)\.?$/i,
  /[?.!,;]+$/,
];

export const parseLocationRequest = (text) => {
  if (typeof text !== 'string') return null;
  let s = text.trim();
  if (!s) return null;

  for (const re of LEAD_INS) {
    const stripped = s.replace(re, '');
    if (stripped !== s) { s = stripped.trim(); break; }
  }
  for (const re of TRAILERS) s = s.replace(re, '').trim();

  // Whatever is left has to look like a place name, not a sentence. A long
  // string of words is a question the model should answer, not a lookup.
  s = s.replace(/\s+/g, ' ').trim();
  if (!s) return null;
  if (s.length > 60) return null;
  if (s.split(' ').length > 6) return null;
  if (!/[a-z]/i.test(s)) return null;

  return s;
};

// ─── The briefing ────────────────────────────────────────────────────────────

/** The nine things the brief asked for, in the order a person needs them. */
export const BRIEFING_ORDER = Object.freeze([
  'name', 'codeEdition', 'amendments', 'permitOffice', 'phone', 'website',
  'inspectionPhone', 'requiredDocuments', 'inspectionOrder', 'inspectionTips',
  'quirks', 'notes',
]);

const standingOf = (f) => {
  if (!f || !f.value) return Standing.MISSING;
  return f.verified ? Standing.CONFIRMED : Standing.SUGGESTED;
};

/**
 * Assemble the briefing from an AHJ record.
 *
 * Nothing is computed from the value itself — the record is the only source of
 * truth, and this function's contribution is entirely in how it separates and
 * labels. That is why it is testable: the guarantee is structural, not textual.
 */
export const briefing = (record, { workTypeId = null } = {}) => {
  const rec = record ?? emptyRecord();

  const lines = BRIEFING_ORDER.map((key) => {
    const meta = fieldMeta(key);
    const f = rec.fields?.[key];
    const standing = standingOf(f);
    return Object.freeze({
      key,
      label: meta?.label ?? key,
      risk: meta?.risk ?? 'LOW',
      value: f?.value ?? '',
      standing,
      standingLabel: STANDING_LABEL[standing],
      source: f?.source ?? null,
      sourceLabel: f?.source ? SOURCE_LABEL[f.source] : null,
      // The cost of being wrong, on the fields where being wrong is silent.
      caution: standing === Standing.SUGGESTED && meta?.why ? meta.why : null,
      // Usable means: safe to put in front of a customer or an inspector.
      usable: standing === Standing.CONFIRMED,
    });
  });

  const confirmed = lines.filter((l) => l.standing === Standing.CONFIRMED);
  const suggested = lines.filter((l) => l.standing === Standing.SUGGESTED);
  const missing = lines.filter((l) => l.standing === Standing.MISSING);

  // The single most important fact, called out separately because everything
  // else the app says about code depends on it.
  const editionLine = lines.find((l) => l.key === 'codeEdition');
  const codeEdition = Object.freeze({
    ...editionLine,
    trustworthy: editionLine.standing === Standing.CONFIRMED,
    warning: editionLine.standing === Standing.CONFIRMED ? null
      : editionLine.standing === Standing.SUGGESTED
        ? 'The adopted edition here is a suggestion. Until it is confirmed, treat every code answer in the app as provisional for this job.'
        : 'No adopted edition on file. Code answers will use your app default, which may not be what this jurisdiction enforces.',
  });

  const work = workTypeId ? workTypeById(workTypeId) : null;
  const guidance = workTypeId ? permitGuidance(workTypeId, null) : null;

  return Object.freeze({
    query: rec.query ?? '',
    lines: Object.freeze(lines),
    confirmed: Object.freeze(confirmed),
    suggested: Object.freeze(suggested),
    missing: Object.freeze(missing),
    codeEdition,
    workType: work ? Object.freeze({ id: work.id, label: work.label ?? work.title ?? work.id }) : null,
    guidance,
    // A briefing where nothing is confirmed is a starting point, not an answer.
    anyConfirmed: confirmed.length > 0,
    complete: missing.length === 0 && suggested.length === 0,
    exportable: exportable(rec),
    pending: pendingVerification(rec),
    sourceNote: CURATED_SOURCE_NOTE,
    disclaimer: BRIEFING_DISCLAIMER,
  });
};

export const BRIEFING_DISCLAIMER =
  'SparkConnect is not the authority having jurisdiction. Anything marked as suggested was proposed by a '
  + 'model and has not been checked. Confirm with the permit office before you rely on it.';

// ─── What to do next ─────────────────────────────────────────────────────────

/**
 * The actions that turn a draft into something usable, riskiest first.
 *
 * This is the part that makes the feature honest rather than merely cautious: a
 * screen full of "unverified" badges with no way forward is just an apology.
 */
export const nextActions = (brief) => {
  if (!brief) return [];
  const actions = [];

  const phone = brief.lines.find((l) => l.key === 'phone');
  const askable = brief.suggested.filter((l) => l.risk === 'HIGH' || l.risk === 'MEDIUM');

  if (!brief.codeEdition.trustworthy) {
    actions.push(Object.freeze({
      id: 'confirm-edition',
      priority: 1,
      label: 'Confirm the adopted code edition',
      detail: brief.codeEdition.value
        ? `Ask whether ${brief.codeEdition.value} is what they are enforcing today, and whether there is an amendment package on top of it.`
        : 'Ask which NEC edition they have adopted, and whether there is an amendment package on top of it.',
      via: phone?.value ? `Call ${phone.value}` : 'Call the permit office',
    }));
  }

  for (const line of askable) {
    if (line.key === 'codeEdition') continue;
    actions.push(Object.freeze({
      id: `confirm-${line.key}`,
      priority: line.risk === 'HIGH' ? 2 : 3,
      label: `Confirm: ${line.label.toLowerCase()}`,
      detail: line.caution ?? 'Check this against the authority’s own published information.',
      via: phone?.value ? `Call ${phone.value}` : 'Check the AHJ website',
    }));
  }

  if (!brief.anyConfirmed) {
    actions.push(Object.freeze({
      id: 'nothing-confirmed',
      priority: 4,
      label: 'Nothing here is confirmed yet',
      detail: 'None of this can go on a permit application or into a project until you have checked it.',
      via: null,
    }));
  }

  return Object.freeze(actions.sort((a, b) => a.priority - b.priority));
};

// ─── Rendering ───────────────────────────────────────────────────────────────

/**
 * Plain text. Confirmed and suggested are rendered in SEPARATE BLOCKS rather
 * than as one list with badges — a badge next to a phone number is easy to skim
 * past, and a heading that says these have not been checked is not.
 */
export const briefingText = (brief) => {
  if (!brief) return '';
  const out = [];
  const name = brief.lines.find((l) => l.key === 'name');
  out.push(name?.value || brief.query || 'Jurisdiction');

  if (brief.confirmed.length) {
    out.push('', 'CONFIRMED', '─────────');
    for (const l of brief.confirmed) out.push(`${l.label}: ${l.value}`);
  }

  if (brief.suggested.length) {
    out.push('', 'SUGGESTED — NOT CHECKED', '───────────────────────');
    for (const l of brief.suggested) {
      out.push(`${l.label}: ${l.value}`);
      if (l.caution) out.push(`   ↳ ${l.caution}`);
    }
  }

  if (brief.missing.length) {
    out.push('', 'NOT KNOWN', '─────────');
    out.push(brief.missing.map((l) => l.label).join(', '));
  }

  if (!brief.codeEdition.trustworthy) {
    out.push('', brief.codeEdition.warning);
  }

  const actions = nextActions(brief);
  if (actions.length) {
    out.push('', 'BEFORE YOU RELY ON THIS', '───────────────────────');
    for (const a of actions) out.push(`• ${a.label}${a.via ? ` — ${a.via}` : ''}`);
  }

  out.push('', brief.disclaimer);
  return out.join('\n');
};

/**
 * What may be attached to a project or put on a document.
 *
 * The same gate as ahj.js `exportable`, restated here so a caller reaching for
 * the briefing cannot accidentally take the whole thing. A briefing is for
 * reading; only the confirmed fields are for keeping.
 */
export const attachable = (brief) => {
  if (!brief) return null;
  const values = brief.exportable ?? {};
  if (Object.keys(values).length === 0) {
    return Object.freeze({ ok: false, reason: 'Nothing in this briefing has been confirmed yet.', values: null });
  }
  return Object.freeze({ ok: true, reason: null, values: Object.freeze({ ...values }) });
};

export { FIELD_KEYS, AHJ_FIELDS, FieldSource, isHighRisk };
