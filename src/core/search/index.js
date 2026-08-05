// ─── GLOBAL SEARCH ───────────────────────────────────────────────────────────
// One search box over everything the app knows about.
//
// Architecture: sources REGISTER themselves with an id, a weight, and a function
// returning indexable records. Search never reaches into a feature's storage, so
// adding permits or contractors later means registering a source — not editing
// the search screen.
//
// Ranking is deterministic and local. No network, works offline (NNR-12).

export const SourceKind = {
  CALCULATOR: 'CALCULATOR',
  LESSON: 'LESSON',
  PROJECT: 'PROJECT',
  INVOICE: 'INVOICE',
  ESTIMATE: 'ESTIMATE',
  PHOTO: 'PHOTO',
  AI_HISTORY: 'AI_HISTORY',
  CODE_REFERENCE: 'CODE_REFERENCE',
  FORMULA: 'FORMULA',
  PERMIT: 'PERMIT',
  CONTRACTOR: 'CONTRACTOR',
  LICENSE: 'LICENSE',
  SETTING: 'SETTING',
};

/**
 * A search record.
 * `keywords` carries the trade synonyms an electrician actually types — someone
 * searching "wire fill" must find Conduit Fill.
 */
export const searchRecord = ({
  id, kind, title, subtitle = '', keywords = [], route = null,
  updatedAt = null, requiresEntitlement = null, body = '',
}) => ({ id, kind, title, subtitle, keywords, route, updatedAt, requiresEntitlement, body });

const normalize = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9\s.#/-]/g, ' ').replace(/\s+/g, ' ').trim();
const tokenize = (s) => normalize(s).split(' ').filter(Boolean);

/**
 * Score one record against query tokens.
 * Weighting reflects how people search: an exact title match is what they meant;
 * a body match is a maybe.
 */
export const scoreRecord = (record, tokens) => {
  if (!tokens.length) return 0;
  const title = normalize(record.title);
  const subtitle = normalize(record.subtitle);
  const keywords = record.keywords.map(normalize).join(' ');
  const body = normalize(record.body);

  let score = 0;
  let matchedAll = true;

  for (const token of tokens) {
    let tokenScore = 0;
    if (title === token) tokenScore = 100;
    else if (title.startsWith(token)) tokenScore = 60;
    else if (title.includes(token)) tokenScore = 40;
    else if (keywords.includes(token)) tokenScore = 30;
    else if (subtitle.includes(token)) tokenScore = 15;
    else if (body.includes(token)) tokenScore = 5;

    if (tokenScore === 0) matchedAll = false;
    score += tokenScore;
  }

  // Every token matching beats a strong partial — "box fill" should not lose to
  // a record that merely mentions "box" three times.
  if (matchedAll) score *= 2;
  return score;
};

export const createSearchIndex = ({ now = () => Date.now() } = {}) => {
  const sources = new Map();

  /**
   * @param id      stable source id
   * @param kind    SourceKind
   * @param load    () => searchRecord[]  (sync or async)
   * @param weight  multiplier, so a saved invoice can outrank a formula
   */
  const registerSource = ({ id, kind, load, weight = 1, enabled = () => true }) => {
    if (!id || typeof load !== 'function') throw new Error('registerSource requires an id and a load function');
    sources.set(id, { id, kind, load, weight, enabled });
    return id;
  };

  const unregisterSource = (id) => sources.delete(id);

  const search = async (query, { limit = 25, kinds = null, entitlements = [] } = {}) => {
    const tokens = tokenize(query);
    if (!tokens.length) return { query, tokens, results: [], tookMs: 0 };

    const started = now();
    const results = [];

    for (const source of sources.values()) {
      if (!source.enabled()) continue;
      if (kinds && !kinds.includes(source.kind)) continue;

      let records = [];
      try { records = await source.load(); } catch { records = []; }

      for (const record of records) {
        const base = scoreRecord(record, tokens);
        if (base <= 0) continue;

        // Locked results still appear — hiding them hides the value of Pro. They
        // are marked so the UI can route to the paywall instead of the feature.
        const locked = !!record.requiresEntitlement && !entitlements.includes(record.requiresEntitlement);
        results.push({
          ...record,
          sourceId: source.id,
          score: base * source.weight * (locked ? 0.6 : 1),
          locked,
        });
      }
    }

    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Recency breaks ties, so the invoice you touched today wins.
      const at = a.updatedAt ? String(a.updatedAt) : '';
      const bt = b.updatedAt ? String(b.updatedAt) : '';
      if (at !== bt) return bt.localeCompare(at);
      return String(a.title).localeCompare(String(b.title));
    });

    return { query, tokens, results: results.slice(0, limit), tookMs: now() - started };
  };

  /** Grouped by kind, for a sectioned results screen. */
  const searchGrouped = async (query, opts) => {
    const { results, ...rest } = await search(query, opts);
    const groups = new Map();
    for (const r of results) {
      if (!groups.has(r.kind)) groups.set(r.kind, []);
      groups.get(r.kind).push(r);
    }
    return { ...rest, groups: [...groups.entries()].map(([kind, items]) => ({ kind, items })) };
  };

  return { registerSource, unregisterSource, search, searchGrouped, registeredSources: () => [...sources.keys()] };
};

export { tokenize, normalize };
