// ─── CONTRACTOR CONNECT LEGAL COPY ───────────────────────────────────────────
// Every legal-adjacent string the marketplace renders, in one file, each with
// the two things the brief requires of legal-rule display: where it came from
// and when it was last reviewed.
//
// Nothing in here cites a statute number. The app-wide rule against reciting
// law from memory (pathways.js explains it) applies double on a marketplace
// surface: a wrong NEC table gets caught by an electrician; a wrong statute
// gets relied on by someone signing a contract. Structural explanations are
// ours; specifics belong to DBPR and the board, and every block below ends by
// pointing there.
//
// Pure module: no React, no network, no storage.

import { findOutcomePromise } from '../index.js';

/** The marketplace disclaimer, brief-specified, shown on the entry screen. */
export const MARKETPLACE_DISCLAIMER =
  'Contractor Connect is a marketplace and verification tool. It does not issue licenses, '
  + 'authorize unlicensed contracting, create qualifying-agent approval, determine permit '
  + 'requirements, or replace DBPR or local licensing-board review. Users are responsible for '
  + 'complying with applicable licensing, contracting, permitting and supervision requirements.';

/**
 * The Florida-specific structural notes. STRUCTURAL in the pathways.js sense:
 * how the system is arranged, no numbers, no thresholds, each with the
 * authority to confirm against.
 */
export const FLORIDA_NOTES = Object.freeze([
  {
    id: 'fl-unlicensed',
    text: 'Florida prohibits contracting in a licensed trade without the required state '
      + 'certification or registration, and prohibits presenting another person’s licence as '
      + 'your own. Unlicensed contracting can carry criminal exposure, and contracts made by '
      + 'unlicensed contractors can be unenforceable.',
    confirmWith: 'Florida DBPR — myfloridalicense.com',
  },
  {
    id: 'fl-qualifier-duties',
    text: 'In Florida, a business entity in a licensed trade is qualified by a licensed '
      + 'individual, and a primary qualifying agent is responsible for supervising the '
      + 'business’s operations, field work and financial matters — not just lending a name to '
      + 'paperwork.',
    confirmWith: 'Florida DBPR — myfloridalicense.com',
  },
  {
    id: 'fl-additional-business',
    text: 'A Florida licensee may qualify more than one business only with board review, and is '
      + 'expected to actually supervise each organization. DBPR has separate processes for '
      + 'qualifying an additional business and for designating primary and secondary '
      + 'qualifying agents.',
    confirmWith: 'Florida DBPR — myfloridalicense.com',
  },
]);

/** Source attribution and review date, rendered wherever FLORIDA_NOTES are. */
export const LEGAL_REVIEW = Object.freeze({
  source: 'Written from Florida DBPR public guidance; confirm specifics with DBPR and the '
    + 'relevant licensing board — they decide, this app does not.',
  reviewedAt: '2026-08-09',
  reviewedBy: 'Drafted in-app; pending outside counsel review before any paid launch.',
});

/** Everything above, audited the same way the pathways are. Run by tests. */
export const auditLegalCopy = () => {
  const problems = [];
  const check = (text, where) => {
    const hit = findOutcomePromise(text);
    if (hit) problems.push(`${where}: ${hit}`);
  };
  check(MARKETPLACE_DISCLAIMER, 'marketplace disclaimer');
  for (const n of FLORIDA_NOTES) {
    check(n.text, n.id);
    if (!n.confirmWith) problems.push(`${n.id}: no authority to confirm with`);
  }
  if (!LEGAL_REVIEW.reviewedAt || !LEGAL_REVIEW.source) problems.push('legal review block incomplete');
  return Object.freeze(problems);
};
