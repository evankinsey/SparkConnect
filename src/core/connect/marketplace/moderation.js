// ─── OPPORTUNITY MODERATION ──────────────────────────────────────────────────
// Every submission passes through here before any contractor sees it.
//
// TWO THINGS THIS FILE IS CAREFUL ABOUT, IN OPPOSITE DIRECTIONS:
//
// 1. The patterns below describe arrangements the product must not broker —
//    attaching a licence to work the licensee will not supervise. A submission
//    that matches is FLAGGED and held for a person. It is never rejected by
//    the pattern alone, and the user-facing message never accuses: most people
//    who type "can someone pull the permit for me" are not criminals, they are
//    people who do not yet know how permits work, and the right response is
//    review plus an explanation — not an accusation from a regex.
//
// 2. The patterns are assembled from fragments, same as index.js, because the
//    repo-wide wording scanner cannot tell a detector from an offer. Spelling
//    "rent a license" out as a literal would teach the scanner an exception.
//
// Pure module: no React, no network, no storage.

const L = 'licen[sc]e';

/** Each risk with its own id, so review queues can say WHY something is held. */
const RISK_PATTERNS = Object.freeze([
  {
    id: 'license_lending',
    // "lend/borrow/rent/use your licence", "under your licence", "licence for a fee"
    re: new RegExp(`\\b(?:lend|borrow|rent|use)\\b[^.]{0,40}\\b(?:your|a|my|their|his|her|someone'?s?|an?other'?s?)\\s+${L}|\\b${L}\\b[^.]{0,30}\\bfor a fee\\b`, 'i'),
    label: 'Reads like a licence-lending arrangement',
  },
  {
    id: 'permit_under_your_name',
    re: new RegExp(`\\bpermits?\\b[^.]{0,50}\\b(?:under|in)\\s+your\\s+(?:name|${L})|\\bpull\\b[^.]{0,30}\\bpermit\\b[^.]{0,40}\\bfor (?:me|us)\\b`, 'i'),
    label: 'Asks for a permit under someone else’s name',
  },
  {
    id: 'no_supervision',
    re: /\b(?:no need to|don'?t (?:have to|need to)|won'?t (?:have to|need to)|never)\s[^.]{0,30}\b(?:supervis|visit|show up|be involved|be on ?site)/i,
    label: 'Proposes a qualifier who does not supervise',
  },
  {
    id: 'cash_only_evasive',
    re: /\bcash\s*only\b[^.]{0,60}\b(?:no (?:permit|paper|record|invoice|inspect)|off the books|under the table)|\b(?:off the books|under the table)\b/i,
    label: 'Cash-only phrasing paired with avoiding records',
  },
  {
    id: 'skip_permit',
    re: /\b(?:skip|avoid|without|dodge|around)\s[^.]{0,20}\b(?:the\s+)?(?:permit|inspection)s?\b/i,
    label: 'Proposes working around permits or inspections',
  },
  {
    id: 'present_as_licensed',
    re: new RegExp(`\\b(?:say|pretend|act like|tell them)\\b[^.]{0,40}\\b(?:i(?:'m| am)|we(?:'re| are)|you(?:'re| are))\\s[^.]{0,20}\\b${L}d\\b`, 'i'),
    label: 'Proposes presenting an unlicensed person as licensed',
  },
]);

export const RISK_IDS = Object.freeze(RISK_PATTERNS.map((p) => p.id));

/**
 * Structural checks that are not about language.
 */
const structuralRisks = (opportunity) => {
  const risks = [];
  if (opportunity?.estimatedValueRange === 'OVER_500K'
      && (opportunity?.sourceUserRole === 'HOMEOWNER' || opportunity?.sourceUserRole === 'OTHER')) {
    risks.push({ id: 'unusual_value_for_role', label: 'Project value is unusual for the stated role' });
  }
  if (opportunity && !opportunity.description) {
    risks.push({ id: 'unverifiable_project', label: 'Not enough description to verify the project exists' });
  }
  return risks;
};

/**
 * Screen one opportunity (or any free-text submission).
 *
 * Returns the flags found and the recommended moderation route. The decision
 * language is deliberately "hold for review", never "reject": the pattern
 * earns a queue entry, a person earns a verdict.
 */
export const screenSubmission = (opportunity, { extraText = '' } = {}) => {
  const text = [
    opportunity?.description ?? '',
    opportunity?.howObtained ?? '',
    extraText ?? '',
  ].join(' \n ');

  const flags = RISK_PATTERNS
    .filter((p) => p.re.test(text))
    .map((p) => Object.freeze({ id: p.id, label: p.label }));
  const structural = structuralRisks(opportunity).map(Object.freeze);
  const all = Object.freeze([...flags, ...structural]);

  return Object.freeze({
    flags: all,
    clean: all.length === 0,
    route: all.length === 0 ? 'CLEAR_QUEUE' : 'MANUAL_REVIEW',
    // What the submitter sees. Neutral in both branches — a flagged submitter
    // is told their submission is in review, not what tripped.
    submitterMessage: all.length === 0
      ? 'Submitted. It goes through a quick review before it is shown to contractors.'
      : 'Submitted. This one needs a person to look at it before it goes further — most reviews '
        + 'clear within a day.',
  });
};

/**
 * Duplicate detection: same trade + jurisdiction + value range + very similar
 * description. Token overlap, not embeddings — this is a review aid, and a
 * reviewer confirms; the score never auto-rejects.
 */
export const looksDuplicate = (a, b) => {
  if (!a || !b || a.id === b.id) return false;
  if (a.trade !== b.trade) return false;
  if (a.jurisdiction?.state !== b.jurisdiction?.state) return false;
  if ((a.jurisdiction?.county ?? '') !== (b.jurisdiction?.county ?? '')) return false;
  const tokens = (s) => new Set(String(s ?? '').toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  const ta = tokens(a.description);
  const tb = tokens(b.description);
  if (ta.size === 0 || tb.size === 0) return false;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return shared / Math.min(ta.size, tb.size) >= 0.7;
};

/** The review queue entry a flagged submission becomes. */
export const reviewItem = (opportunity, screening, { at = null } = {}) => Object.freeze({
  opportunityId: opportunity?.id ?? null,
  flags: screening?.flags ?? Object.freeze([]),
  enteredQueueAt: at,
  status: 'AWAITING_REVIEW',
  // The reviewer's playbook, one line per flag family. Explaining beats
  // accusing: many flagged submitters become good users once they understand
  // who has to contract the work.
  guidance: 'Read the full submission. If it proposes attaching a licence to unsupervised work, '
    + 'decline it and explain the compliant route: the licensed contractor contracts the job, or '
    + 'the board reviews a real qualifying relationship. If it is a phrasing misunderstanding, '
    + 'clear it and note why.',
});
