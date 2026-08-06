// ─── GROUNDED BLUEPRINT QUERY ────────────────────────────────────────────────
// "How many GFCIs?" answered from the verified device set and nothing else.
//
// This is the retrieval half of the assistant. The model may phrase an answer;
// it may not supply one. Every response here is computed from confirmed devices,
// carries the evidence it was computed from, and returns UNANSWERABLE rather
// than reaching for a plausible number.
//
// Why this is a module and not a prompt: a prompt asking a model to "only use
// the provided data" is a request. This is a guarantee. `answer()` has no path
// that produces a count from anything but the device array it was handed.
//
// Pure module: no React, no network, no storage.

import { DeviceState, isCounted, confirmedCounts, needsReview } from './device.js';
import { SYMBOLS, symbolById, resolveSymbol, isCountable } from './symbols.js';
import { CANNOT_VERIFY } from '../content/authority.js';

export const AnswerKind = Object.freeze({
  COUNT: 'COUNT',
  LOCATION: 'LOCATION',
  BREAKDOWN: 'BREAKDOWN',
  UNANSWERABLE: 'UNANSWERABLE',
});

const unanswerable = (reason, suggestion = null) => Object.freeze({
  kind: AnswerKind.UNANSWERABLE,
  text: CANNOT_VERIFY,
  reason,
  suggestion,
  evidence: Object.freeze([]),
  confident: false,
});

/**
 * Which symbol is this question about? Matches on label, id and plan tag.
 * Returns null when nothing matches — the caller must not guess from there.
 */
export const symbolFromQuery = (query) => {
  const q = String(query ?? '').toLowerCase();
  if (!q.trim()) return null;

  // Longest label first, so "gfci receptacle" does not match plain "receptacle".
  const byLabel = [...SYMBOLS]
    .sort((a, b) => b.label.length - a.label.length)
    .find((s) => q.includes(s.label.toLowerCase()));
  if (byLabel) return byLabel;

  const aliases = [
    ['receptacle_gfci', ['gfci', 'gfi', 'ground fault']],
    ['receptacle', ['receptacle', 'outlet', 'plug', 'recep']],
    ['switch_three_way', ['three way', '3 way', '3-way']],
    ['switch_four_way', ['four way', '4 way', '4-way']],
    ['switch_single', ['switch']],
    ['light', ['light', 'fixture', 'luminaire']],
    ['exit_sign', ['exit sign', 'exit']],
    ['light_emergency', ['emergency light', 'em light']],
    ['occupancy_sensor', ['occupancy', 'occ sensor', 'vacancy sensor']],
    ['smoke_detector', ['smoke']],
    ['panel', ['panel', 'panelboard']],
    ['disconnect', ['disconnect']],
    ['data_drop', ['data', 'network drop', 'ethernet']],
    ['junction_box', ['junction box', 'j-box', 'jbox']],
  ];
  for (const [id, words] of aliases) {
    if (words.some((w) => q.includes(w))) return symbolById(id);
  }
  return null;
};

/**
 * Answer a question about the plan.
 *
 * The refusals are the interesting part. It declines when the symbol is not
 * recognised, when the symbol is not countable, and — importantly — when the
 * count would be misleading because review is unfinished. A number that will
 * change once someone finishes reviewing is not an answer; it is a trap.
 */
export const answer = (query, devices, { requireReviewComplete = true } = {}) => {
  const list = Array.isArray(devices) ? devices : [];
  const symbol = symbolFromQuery(query);

  if (!symbol) {
    return unanswerable(
      'No device type in this question matches the symbol library.',
      'Name a device the takeoff tracks, such as "GFCI receptacles" or "exit signs".',
    );
  }

  if (!isCountable(symbol.id)) {
    return unanswerable(
      `${symbol.label} is not something that can be counted from a plan view. ${symbol.describes}`,
      'Conduit and home-run lengths need a verified scale or a field measurement.',
    );
  }

  const matching = list.filter((d) => d.symbolId === symbol.id);
  const confirmed = matching.filter(isCounted);
  const pending = matching.filter(needsReview);

  if (requireReviewComplete && pending.length > 0) {
    return Object.freeze({
      kind: AnswerKind.UNANSWERABLE,
      text: `${confirmed.length} ${symbol.label.toLowerCase()} confirmed so far, but ${pending.length} detection${pending.length === 1 ? ' is' : 's are'} still unreviewed. The final count will change.`,
      reason: 'Review is incomplete, so any count given now would be wrong by an unknown amount.',
      suggestion: `Finish reviewing the ${pending.length} outstanding detection${pending.length === 1 ? '' : 's'} first.`,
      evidence: Object.freeze(pending.map((d) => d.id)),
      confident: false,
    });
  }

  const pages = [...new Set(confirmed.map((d) => d.page))].sort((a, b) => a - b);
  const rooms = [...new Set(confirmed.map((d) => d.room).filter(Boolean))].sort();

  return Object.freeze({
    kind: AnswerKind.COUNT,
    symbolId: symbol.id,
    count: confirmed.length,
    text: `${confirmed.length} ${symbol.label.toLowerCase()}${confirmed.length === 1 ? '' : 's'} confirmed`
      + (pages.length ? ` on sheet${pages.length === 1 ? '' : 's'} ${pages.join(', ')}` : '')
      + '.',
    pages: Object.freeze(pages),
    rooms: Object.freeze(rooms),
    // Every device id behind the number, so the UI can zoom to each one and the
    // user can check the answer instead of trusting it.
    evidence: Object.freeze(confirmed.map((d) => d.id)),
    confident: true,
  });
};

/** Full confirmed breakdown — the answer to "what is on this job?". */
export const breakdown = (devices) => {
  const counts = confirmedCounts(devices);
  const rows = [...counts.entries()]
    .map(([symbolId, count]) => ({
      symbolId, label: symbolById(symbolId)?.label ?? symbolId, count,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return Object.freeze({
    kind: AnswerKind.BREAKDOWN,
    rows: Object.freeze(rows),
    total: rows.reduce((a, r) => a + r.count, 0),
    evidence: Object.freeze((devices ?? []).filter(isCounted).map((d) => d.id)),
    confident: true,
  });
};

/** Where a device type appears, grouped by sheet and room. */
export const locate = (query, devices) => {
  const symbol = symbolFromQuery(query);
  if (!symbol) return unanswerable('No device type in this question matches the symbol library.');

  const confirmed = (devices ?? []).filter((d) => d.symbolId === symbol.id && isCounted(d));
  if (confirmed.length === 0) {
    return Object.freeze({
      kind: AnswerKind.LOCATION,
      text: `No confirmed ${symbol.label.toLowerCase()} in this takeoff.`,
      groups: Object.freeze([]),
      evidence: Object.freeze([]),
      // A true zero is a real answer, not a refusal — but only because the
      // device set is the whole authority here.
      confident: true,
    });
  }

  const byPage = new Map();
  for (const d of confirmed) {
    if (!byPage.has(d.page)) byPage.set(d.page, []);
    byPage.get(d.page).push(d);
  }

  const groups = [...byPage.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([page, ds]) => Object.freeze({
      page,
      count: ds.length,
      rooms: Object.freeze([...new Set(ds.map((d) => d.room).filter(Boolean))].sort()),
      deviceIds: Object.freeze(ds.map((d) => d.id)),
    }));

  return Object.freeze({
    kind: AnswerKind.LOCATION,
    symbolId: symbol.id,
    text: `${confirmed.length} ${symbol.label.toLowerCase()}${confirmed.length === 1 ? '' : 's'} across ${groups.length} sheet${groups.length === 1 ? '' : 's'}.`,
    groups: Object.freeze(groups),
    evidence: Object.freeze(confirmed.map((d) => d.id)),
    confident: true,
  });
};

/**
 * The context object handed to SparkAI. Counts only, evidence ids only, and an
 * explicit instruction about what it may not do.
 *
 * Deliberately contains no raw model output and no un-reviewed detections: the
 * assistant cannot repeat a number the human never confirmed if it never sees
 * one.
 */
export const groundingContext = (devices) => {
  const list = Array.isArray(devices) ? devices : [];
  const counts = confirmedCounts(list);
  return Object.freeze({
    confirmedCounts: Object.freeze(Object.fromEntries(counts)),
    unreviewed: list.filter(needsReview).length,
    rejected: list.filter((d) => d.state === DeviceState.REJECTED).length,
    pages: Object.freeze([...new Set(list.filter(isCounted).map((d) => d.page))].sort((a, b) => a - b)),
    rooms: Object.freeze([...new Set(list.filter(isCounted).map((d) => d.room).filter(Boolean))].sort()),
    rules: Object.freeze([
      'Answer only from confirmedCounts. It is the whole truth available to you.',
      'Never estimate, interpolate, or infer a quantity that is not in confirmedCounts.',
      'If unreviewed is greater than zero, say the count is provisional.',
      'If the question is about something not in confirmedCounts, say you cannot verify it.',
      'Never state conductor sizes, breaker sizes, or code requirements from a takeoff.',
    ]),
  });
};

export { resolveSymbol };
