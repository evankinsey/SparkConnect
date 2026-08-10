// ─── NEC CITATION RESOLVER ───────────────────────────────────────────────────
// A whitelist. If a citation is not in this table, it does not render.
//
// Why a whitelist and not a parser: `240.4(D)(5)` and `240.9(Q)(7)` are equally
// well-formed, and a regex is delighted by both. Only one of them is a real
// section. A citation is the most durable kind of wrong this app can produce —
// it survives being screenshotted and passed around a jobsite long after the
// surrounding sentence is forgotten — so the bar is not "looks plausible", it is
// "someone checked this against the book".
//
// Note what is stored: `topic`, in our own words, describing what the section
// covers. NOT the official section heading. Reproducing NFPA's headings from
// memory would be inventing the very thing this file exists to prevent, and it
// would be a copyright problem besides. The citation points the user AT the
// book; it does not stand in for it.
//
// Adding an entry is a content change and goes through review like any other.
//
// Pure module: no React, no network, no storage.

import { Edition } from './editions.js';

const ALL_EDITIONS = Object.freeze([Edition.NEC_2020, Edition.NEC_2023, Edition.NEC_2026].filter(Boolean));

const entry = (topic, opts = {}) => Object.freeze({
  topic,
  // Editions in which we have confirmed this citation is valid AND still
  // numbered this way. A renumbered section is a wrong citation.
  editions: Object.freeze(opts.editions ?? ALL_EDITIONS),
  // Set when the section moved or changed materially between editions, so the
  // UI can warn instead of quietly presenting a stale reference as current.
  editionSensitive: opts.editionSensitive === true,
});

/**
 * Every citation SparkConnect is permitted to display.
 * Keys are normalized: no "NEC" prefix, no trailing punctuation, no spaces.
 */
export const CITATIONS = Object.freeze({
  // Article-level
  'Article 100': entry('Definitions'),
  'Article 250': entry('Grounding and bonding'),
  'Article 625': entry('Electric vehicle power transfer systems'),
  'Chapter 9': entry('Tables — conduit fill, conductor properties'),

  // Tables, cited by their own name because that is how they get quoted in the
  // field. "Table 310.16" and section 310.16 are not interchangeable strings
  // even when they point at the same page.
  'Chapter 9, Table 1': entry('Percent of cross-section of conduit permitted for conductor fill'),
  'Table 110.26(A)(1)': entry('Working space depths by voltage and condition'),
  'Table 220.12': entry('General lighting loads by occupancy'),
  'Table 250.122': entry('Minimum size equipment grounding conductors'),
  'Table 300.5': entry('Minimum cover requirements for underground installations'),
  'Table 310.16': entry('Allowable ampacities of insulated conductors in raceway or cable', { editionSensitive: true }),
  'Table 310.15(C)(1)': entry('Adjustment factors for more than three current-carrying conductors', { editionSensitive: true }),

  // 200 — use and identification of grounded conductors
  '200.6': entry('Means of identifying grounded conductors'),

  // 110 — general requirements
  '110.14(C)': entry('Temperature limitations at terminations'),
  '110.14(C)(1)(a)': entry('Termination temperature rating for circuits 100 A and under'),
  '110.14(D)': entry('Terminal tightening torque', { editions: [Edition.NEC_2020, Edition.NEC_2023, Edition.NEC_2026].filter(Boolean) }),
  '110.26(A)(1)': entry('Working space depth in front of equipment'),

  // 210 — branch circuits
  '210.8': entry('GFCI protection for personnel'),
  '210.8(A)(1)': entry('GFCI protection in dwelling bathrooms'),
  '210.11(C)(1)': entry('Small-appliance branch circuits'),
  '210.11(C)(2)': entry('Laundry branch circuit'),
  '210.12': entry('Arc-fault circuit-interrupter protection', { editionSensitive: true }),
  '210.19(A)': entry('Branch-circuit conductor sizing, with the voltage-drop informational note'),
  '210.20(A)': entry('Overcurrent protection for continuous and noncontinuous loads'),
  '210.52': entry('Dwelling unit receptacle outlet placement'),
  '210.52(A)(1)': entry('Spacing of receptacles along dwelling wall space'),

  // 220 — load calculations
  '220.12': entry('General lighting load by occupancy'),

  // 230 — services
  '230.70(A)(1)': entry('Location of the service disconnecting means'),
  '230.79(C)': entry('Minimum service disconnect rating, one-family dwelling'),

  // 240 — overcurrent protection
  '240.4(D)': entry('Small-conductor overcurrent protection limits'),
  '240.4(D)(3)': entry('Overcurrent limit for 14 AWG copper'),
  '240.4(D)(5)': entry('Overcurrent limit for 12 AWG copper'),
  '240.6(A)': entry('Standard ampere ratings for fuses and inverse-time breakers'),

  // 250 — grounding and bonding
  '250.4(A)(5)': entry('Effective ground-fault current path'),
  '250.52(A)(5)': entry('Rod, pipe and plate electrodes'),
  '250.53(A)(2)': entry('Supplemental electrode requirement'),
  '250.122': entry('Sizing equipment grounding conductors'),

  // 300 / 310 — wiring methods and ampacity
  '300.4(A)(1)': entry('Protection of cables through bored holes in framing'),
  '300.5': entry('Minimum cover requirements for underground installations'),
  '310.15': entry('Ampacity determination and correction', { editionSensitive: true }),
  '310.15(C)(1)': entry('Adjustment factors for more than three current-carrying conductors', { editionSensitive: true }),
  '310.16': entry('Ampacity table for insulated conductors in raceway or cable', { editionSensitive: true }),

  // 314 — boxes
  '314.16': entry('Box fill — number of conductors permitted'),
  '314.16(B)': entry('Box fill volume allowance per conductor'),

  // 334 / 358 / 400 — specific wiring methods
  '334.15(B)': entry('NM cable through a raceway used as physical protection'),
  '440.14': entry('Disconnecting means for air-conditioning and refrigerating equipment'),
  '334.80': entry('Ampacity basis for NM cable'),
  '358.26': entry('Bends between pull points in EMT'),
  '358.30(A)': entry('Securing and supporting EMT'),
  '400.12': entry('Uses not permitted for flexible cords'),

  // 404 — switches. The two that the wiring simulator turns on.
  '404.2(B)': entry('Switches must interrupt the ungrounded conductor, not the grounded conductor'),
  '404.2(C)': entry('Grounded conductor required at most switch locations', { editionSensitive: true }),

  // 406 / 408 / 430
  '406.12': entry('Tamper-resistant receptacles'),
  '408.4(A)': entry('Circuit directory identification'),
  '430.32(A)(1)': entry('Overload protection for continuous-duty motors'),
});

/**
 * Strip the decoration a citation picks up in prose: an "NEC" prefix, an
 * edition year, a trailing period, doubled spaces.
 */
export const normalizeCitation = (ref) => {
  if (typeof ref !== 'string') return null;
  const cleaned = ref
    .replace(/\bNEC\b/gi, ' ')
    .replace(/\b(19|20)\d{2}\b/g, ' ')   // edition years live in `edition`, not here
    .replace(/[.,;]+\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  // "Article 250" and "Chapter 9" keep their word; bare sections do not.
  const m = cleaned.match(/^(article|chapter)\s+(.+)$/i);
  if (m) return `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2]}`;
  return cleaned;
};

/**
 * Resolve a citation, or return null.
 *
 * null is not an error state to be worked around — it is the answer. A caller
 * that gets null strips the citation and degrades the surrounding claim. It
 * must never fall back to rendering the raw string, because the raw string is
 * exactly what an invented citation looks like.
 */
export const resolveCitation = (ref, edition = null) => {
  const key = normalizeCitation(ref);
  if (!key) return null;
  const hit = CITATIONS[key];
  if (!hit) return null;
  if (edition && hit.editions.length && !hit.editions.includes(edition)) return null;
  return { ref: key, display: `NEC ${key}`, ...hit };
};

export const isKnownCitation = (ref, edition = null) => resolveCitation(ref, edition) !== null;

/**
 * Filter a lesson's reference notes down to the ones that actually resolve.
 * A note flagged `verified: false` by its author is dropped even if the section
 * exists — the author is telling us they did not check it.
 */
export const usableReferenceNotes = (notes, edition = null) =>
  (Array.isArray(notes) ? notes : [])
    .filter((n) => n && n.verified === true)
    .map((n) => ({ ...n, resolved: resolveCitation(n.ref, edition) }))
    .filter((n) => n.resolved !== null);
