// ─── NEC CODE EDITION AWARENESS (pure) ───────────────────────────────────────
// Requirements: CODE-01 … CODE-08, REV-13
//
// CODE-01 is the point of this module: adoption is fragmented, so the app must
// NEVER claim to be universally "2026 compliant". It stores the edition the user
// works under and labels every result with it, which is a stronger trust signal
// than a badge.
//
// Enforcement data point from the brief (L1437–1439): as of 3 August 2026, NFPA's
// enforcement map showed 6 states enforcing 2026, 20 on 2023, and 15 on 2020.

export const Edition = {
  NEC_2020: '2020',
  NEC_2023: '2023',
  NEC_2026: '2026',
  UNSURE: 'unsure',
};

// CODE-02 — the selector, in display order.
export const EDITION_OPTIONS = [
  { value: Edition.NEC_2020, label: '2020 NEC', sub: 'Still enforced in many jurisdictions' },
  { value: Edition.NEC_2023, label: '2023 NEC', sub: 'Most widely adopted' },
  { value: Edition.NEC_2026, label: '2026 NEC', sub: 'Current edition, adoption still rolling out' },
  { value: Edition.UNSURE, label: "I'm not sure", sub: 'We will show the most widely adopted edition' },
];

// D-08 — 2023 is the default because it is the most-adopted edition, and
// `unsure` resolves to it rather than silently guessing something newer.
export const DEFAULT_EDITION = Edition.NEC_2023;

export const isValidEdition = (value) => Object.values(Edition).includes(value);

export const normalizeEdition = (value) => (isValidEdition(value) ? value : DEFAULT_EDITION);

/** The edition actually used for calculations. `unsure` resolves to the default. */
export const effectiveEdition = (value) => {
  const e = normalizeEdition(value);
  return e === Edition.UNSURE ? DEFAULT_EDITION : e;
};

export const editionLabel = (value) => {
  const e = normalizeEdition(value);
  if (e === Edition.UNSURE) return `${DEFAULT_EDITION} NEC`;
  return `${e} NEC`;
};

/**
 * CODE-06 — the label that appears on result cards, saved work, and share cards.
 * Two shapes, depending on whether the user is on the newest edition.
 *
 * @returns {{primary: string, secondary: string, isNewest: boolean, isUnsure: boolean}}
 */
export const resultEditionLabel = (value) => {
  const raw = normalizeEdition(value);
  const eff = effectiveEdition(raw);

  if (raw === Edition.UNSURE) {
    return {
      primary: `Based on ${DEFAULT_EDITION} NEC (most widely adopted)`,
      secondary: 'Set your local code edition in Settings for accurate labelling.',
      isNewest: false,
      isUnsure: true,
    };
  }
  if (eff === Edition.NEC_2026) {
    return {
      primary: '2026 edition selected',
      secondary: 'Your jurisdiction may still enforce an earlier edition.',
      isNewest: true,
      isUnsure: false,
    };
  }
  return {
    primary: `Based on selected edition: ${eff} NEC`,
    secondary: '2026 edition may differ — view changes.',
    isNewest: false,
    isUnsure: false,
  };
};

// CODE-03 — every surface that must show the edition. Used as a checklist by the
// UI and asserted by tests so a new surface cannot quietly skip it.
export const EDITION_VISIBLE_SURFACES = [
  'spark_ai',
  'code_quiz',
  'formula_reference',
  'calculator_explanation',
  'result_card',
  'saved_work',
  'share_card',
];

/**
 * CODE-04 — the categories of the "What changed in 2026?" centre.
 *
 * REV-13 / D-07: the CATEGORIES are structural and safe to ship. The change
 * CONTENT inside each is deliberately empty — populating it from memory would
 * be fabricating code citations. Each category carries `contentStatus:
 * 'AWAITING_VERIFIED_SOURCE'` so the UI shows an honest empty state rather than
 * invented text. See DECISIONS.md Q7.
 */
export const CHANGE_CATEGORIES_2026 = [
  { id: 'new_relocated', title: 'New and relocated articles', contentStatus: 'AWAITING_VERIFIED_SOURCE', items: [] },
  { id: 'services_feeders', title: 'Services and feeders', contentStatus: 'AWAITING_VERIFIED_SOURCE', items: [] },
  { id: 'grounding_bonding', title: 'Grounding and bonding', contentStatus: 'AWAITING_VERIFIED_SOURCE', items: [] },
  { id: 'gfci_afci', title: 'GFCI / AFCI', contentStatus: 'AWAITING_VERIFIED_SOURCE', items: [] },
  { id: 'ev_emerging', title: 'EV and emerging technology', contentStatus: 'AWAITING_VERIFIED_SOURCE', items: [] },
  { id: 'limited_energy', title: 'Limited-energy systems', contentStatus: 'AWAITING_VERIFIED_SOURCE', items: [] },
  { id: 'medium_voltage', title: 'Medium-voltage reorganization', contentStatus: 'AWAITING_VERIFIED_SOURCE', items: [] },
  { id: 'motors_transformers', title: 'Motors, transformers and controls', contentStatus: 'AWAITING_VERIFIED_SOURCE', items: [] },
  { id: 'table_changes', title: 'Important table changes', contentStatus: 'AWAITING_VERIFIED_SOURCE', items: [] },
  { id: 'comparison_lessons', title: '2023 → 2026 comparison lessons', contentStatus: 'AWAITING_VERIFIED_SOURCE', items: [] },
];

// CODE-05 — the reorganization runs through 2029, so users need help finding
// relocated material, not just a badge.
export const REORGANIZATION_NOTE =
  'The 2026 edition continues a multi-cycle reorganization intended to complete in 2029. ' +
  'Article numbers you know may have moved. Always confirm the article number in the edition ' +
  'your jurisdiction enforces.';

/** CODE-08 — question/content filter for adaptive study. */
export const matchesEdition = (item, userEdition) => {
  if (!item) return false;
  const eff = effectiveEdition(userEdition);
  if (!item.editions || !Array.isArray(item.editions) || item.editions.length === 0) return true;
  return item.editions.includes(eff);
};

/** AI-02 — the `adoptedCodeContext` field of the structured SparkAI payload. */
export const adoptedCodeContext = (userEdition) => {
  const raw = normalizeEdition(userEdition);
  return {
    selected: raw,
    effective: effectiveEdition(raw),
    userIsUnsure: raw === Edition.UNSURE,
    note: REORGANIZATION_NOTE,
  };
};
