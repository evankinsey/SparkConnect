// ─── AHJ LOOKUP ──────────────────────────────────────────────────────────────
// The user types "Tampa" and the app fills in the rest — as a DRAFT.
//
// This is the highest-risk AI surface in SparkConnect and it is worth being
// precise about why. A wrong phone number wastes an afternoon and announces
// itself immediately. A wrong ADOPTED CODE CYCLE is silent: every downstream
// answer is confidently wrong, the user has no way to notice, and they find out
// at inspection. So the two are not treated the same here.
//
// The model this file enforces:
//
//   Every field carries its own source and its own verified flag. A field the
//   AI proposed is UNVERIFIED, is styled as a draft, and CANNOT be exported,
//   shared, or attached to a project until a person confirms it. Verification
//   is per field, not per record — confirming the phone number must not
//   silently bless the code edition sitting next to it.
//
//   Curated data always beats generated data and generated data can never
//   overwrite a curated or user-entered value.
//
// ON THE CURATED TABLE: it ships nearly empty on purpose. Filling it from
// memory with plausible-looking county phone numbers is precisely the
// hallucination this feature exists to prevent — it would just move the
// invention from runtime into the repo, where it would look authoritative and
// carry no confidence signal at all. Entries are added from verified research,
// one at a time, and `CURATED_SOURCE_NOTE` records where each came from.
//
// Pure module: no React, no network, no storage.

import { sanitizeJurisdiction, emptyJurisdiction } from './permits.js';

/** Where a field's value came from. Ordered weakest to strongest. */
export const FieldSource = Object.freeze({
  AI: 'AI',              // proposed by a model, unverified by definition
  CURATED: 'CURATED',    // in-repo, researched, cited
  USER: 'USER',          // the user typed or confirmed it
});

const SOURCE_RANK = Object.freeze({ AI: 0, CURATED: 1, USER: 2 });

export const SOURCE_LABEL = Object.freeze({
  AI: 'Suggested — not verified',
  CURATED: 'From SparkConnect’s records',
  USER: 'Confirmed by you',
});

/**
 * The fields an AHJ record can hold, and how dangerous each is to get wrong.
 *
 * `risk` drives the UI treatment. HIGH fields get the strongest confirmation
 * prompt and a link to the AHJ's own page, because being wrong about them is
 * not self-announcing.
 */
export const AHJ_FIELDS = Object.freeze([
  { key: 'name', label: 'Authority having jurisdiction', risk: 'MEDIUM' },
  { key: 'phone', label: 'Permit office phone', risk: 'LOW' },
  { key: 'website', label: 'Website', risk: 'LOW' },
  { key: 'inspectionPhone', label: 'Inspection scheduling', risk: 'LOW' },
  {
    key: 'codeEdition', label: 'Adopted NEC edition', risk: 'HIGH',
    why: 'Every code answer in the app depends on this. Being wrong here is silent — nothing looks broken until inspection.',
  },
  {
    key: 'amendments', label: 'Known local amendments', risk: 'HIGH',
    why: 'Local amendments override the NEC. A missing one is invisible until it is red-tagged.',
  },
  { key: 'inspectionOrder', label: 'Typical inspection order', risk: 'MEDIUM' },
  {
    key: 'requiredDocuments', label: 'Documents required with the application', risk: 'MEDIUM',
    why: 'A missing document does not fail silently — it fails at the counter, after the drive.',
  },
  { key: 'permitOffice', label: 'Permit office address', risk: 'LOW' },
  {
    key: 'quirks', label: 'Known local quirks', risk: 'MEDIUM',
    why: 'A quirk is second-hand by nature. Useful to hear, never something to plan around unconfirmed.',
  },
  { key: 'inspectionTips', label: 'Inspection tips', risk: 'LOW' },
  { key: 'notes', label: 'Notes', risk: 'LOW' },
]);

export const FIELD_KEYS = Object.freeze(AHJ_FIELDS.map((f) => f.key));
export const fieldMeta = (key) => AHJ_FIELDS.find((f) => f.key === key) ?? null;
export const isHighRisk = (key) => fieldMeta(key)?.risk === 'HIGH';

/**
 * Researched AHJ records. Empty until entries are verified against the
 * authority's own published information — see the note at the top of this file.
 *
 * Shape, when populated:
 *   'hillsborough county, fl': {
 *     name: 'Hillsborough County Building Services',
 *     codeEdition: '2023',
 *     sourceNote: 'Verified against <url> on <date> by <who>',
 *   }
 */
export const CURATED_AHJ = Object.freeze({});

export const CURATED_SOURCE_NOTE =
  'SparkConnect ships an AHJ record only after a person has verified it against '
  + 'the authority’s own published information. Anything not in that list is '
  + 'suggested, never asserted.';

const normalizeKey = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export const lookupCurated = (query) => CURATED_AHJ[normalizeKey(query)] ?? null;

// ─── The record ──────────────────────────────────────────────────────────────

const field = (value, source) => Object.freeze({
  value: typeof value === 'string' ? value : '',
  source,
  // A user-entered or user-confirmed value is verified. Nothing else is —
  // including curated data, which is trustworthy but is still ours, not theirs.
  verified: source === FieldSource.USER,
  confirmedAt: null,
});

export const emptyRecord = () => Object.freeze({
  query: '',
  fields: Object.freeze(Object.fromEntries(FIELD_KEYS.map((k) => [k, field('', FieldSource.AI)]))),
});

/**
 * Apply proposed values to a record.
 *
 * The precedence rule, and the reason this is a function rather than a merge:
 * a value may only be replaced by one from a SOURCE AT LEAST AS STRONG. A model
 * cannot overwrite what a person typed, and it cannot overwrite curated data.
 */
export const applyProposal = (record, proposal, source, { at = null } = {}) => {
  const base = record ?? emptyRecord();
  const next = { ...base.fields };

  for (const [key, raw] of Object.entries(proposal ?? {})) {
    if (!FIELD_KEYS.includes(key)) continue;                 // closed vocabulary
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!value) continue;

    const current = next[key];
    // Never downgrade. An AI suggestion cannot displace a confirmed value.
    if (current?.value && SOURCE_RANK[source] < SOURCE_RANK[current.source]) continue;
    // A user's own confirmed value is never overwritten by anything automatic.
    if (current?.verified && source !== FieldSource.USER) continue;

    next[key] = Object.freeze({
      value,
      source,
      verified: source === FieldSource.USER,
      confirmedAt: source === FieldSource.USER ? at : null,
    });
  }

  return Object.freeze({ ...base, fields: Object.freeze(next) });
};

/**
 * Confirm one field. Per field on purpose: tapping "looks right" on a phone
 * number must not quietly certify the adopted code edition beside it.
 */
export const confirmField = (record, key, { value, at = null } = {}) => {
  if (!FIELD_KEYS.includes(key)) return record;
  const current = record.fields[key];
  return Object.freeze({
    ...record,
    fields: Object.freeze({
      ...record.fields,
      [key]: Object.freeze({
        value: typeof value === 'string' ? value.trim() : current.value,
        source: FieldSource.USER,
        verified: true,
        confirmedAt: at,
      }),
    }),
  });
};

export const rejectField = (record, key) => {
  if (!FIELD_KEYS.includes(key)) return record;
  return Object.freeze({
    ...record,
    fields: Object.freeze({ ...record.fields, [key]: field('', FieldSource.AI) }),
  });
};

export const confirmAll = (record, { at = null } = {}) =>
  FIELD_KEYS.reduce((acc, key) => (acc.fields[key].value ? confirmField(acc, key, { at }) : acc), record);

// ─── What may leave the app ──────────────────────────────────────────────────

/**
 * Only verified fields. This is the gate on export, share, PDF and attaching an
 * AHJ record to a project.
 *
 * An unverified suggestion that reaches a customer's proposal has become an
 * assertion, and it is one the app made on the user's behalf without them
 * agreeing to it.
 */
export const exportable = (record) => {
  const out = {};
  for (const key of FIELD_KEYS) {
    const f = record?.fields?.[key];
    if (f?.verified && f.value) out[key] = f.value;
  }
  return out;
};

export const canExport = (record) => Object.keys(exportable(record)).length > 0;

/** Fields the user still has to look at, riskiest first. */
export const pendingVerification = (record) =>
  AHJ_FIELDS
    .filter((f) => {
      const v = record?.fields?.[f.key];
      return v && v.value && !v.verified;
    })
    .sort((a, b) => (a.risk === 'HIGH' ? -1 : 1) - (b.risk === 'HIGH' ? -1 : 1))
    .map((f) => Object.freeze({
      ...f,
      value: record.fields[f.key].value,
      source: record.fields[f.key].source,
      sourceLabel: SOURCE_LABEL[record.fields[f.key].source],
      prompt: f.risk === 'HIGH'
        ? `Confirm with ${record.fields.name?.value || 'the AHJ'} before relying on this.`
        : 'Check this looks right.',
    }));

export const isFullyVerified = (record) =>
  FIELD_KEYS.every((k) => {
    const f = record?.fields?.[k];
    return !f?.value || f.verified;
  });

/**
 * Convert to the jurisdiction shape the rest of the permit assistant uses.
 * Verified fields only — the same gate as export, because permitGuidance()
 * presents a jurisdiction as the user's own settled record.
 */
export const toJurisdiction = (record) => {
  const v = exportable(record);
  return sanitizeJurisdiction({
    name: v.name ?? '',
    phone: v.phone ?? '',
    website: v.website ?? '',
    codeEdition: v.codeEdition ?? '',
    notes: [v.amendments, v.inspectionOrder, v.notes].filter(Boolean).join(' · '),
    updatedAt: Date.now(),
  });
};

/**
 * Seed a record from a query: curated first, then whatever the caller's model
 * proposed. Curated values land as CURATED and still require confirmation —
 * trustworthy is not the same as verified by this user for this job.
 */
export const buildRecord = (query, { aiProposal = null } = {}) => {
  let record = Object.freeze({ ...emptyRecord(), query: String(query ?? '').trim() });

  const curated = lookupCurated(query);
  if (curated) {
    const { sourceNote, ...values } = curated;
    record = applyProposal(record, values, FieldSource.CURATED);
  }
  if (aiProposal) record = applyProposal(record, aiProposal, FieldSource.AI);
  return record;
};

/** The instruction block for the model. It proposes; it never asserts. */
export const aiLookupRules = Object.freeze([
  'Propose only the fields listed. Do not invent a field.',
  'If you are not confident about a value, omit it. An omitted field is correct; a guessed one is not.',
  'Never state an adopted code edition or a local amendment unless you are certain. These are the two that fail silently.',
  'Do not produce a phone number or address you are not sure of. A plausible wrong number is worse than a blank.',
  'Everything you return is shown to the user as an unverified suggestion for them to confirm.',
]);

export { emptyJurisdiction };
