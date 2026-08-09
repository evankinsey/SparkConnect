// ─── ANALYTICS PII GUARD (pure) ──────────────────────────────────────────────
// Requirements: ANL-07, ANL-08, GRW-06, SEC-11
//
// ANL-07 forbids sending customer names, emails, phone numbers, full addresses,
// invoice descriptions, job photos, payment details, or AI prompts containing
// customer-identifying information into analytics.
//
// A convention is not a control. Every analytics property passes through here,
// so a future call site cannot leak a customer's details by forgetting the rule.
// The guard is deny-by-default: unknown keys are dropped, not passed through.

/** Property names that are always safe to send (ANL-08 — anonymous, non-identifying). */
export const ALLOWED_PROPERTIES = new Set([
  // identity / session — anonymous only
  'anonymous_id', 'session_id', 'is_returning', 'app_version', 'platform', 'build',
  // role and preferences
  'role', 'code_edition', 'theme', 'language', 'timer_mode',
  // tools
  'tool', 'tool_id', 'calculation_type', 'result_saved', 'duration_ms',
  // training
  'lesson_id', 'lesson_version', 'difficulty', 'mode', 'hint_level', 'attempt_count',
  'score', 'xp', 'rank', 'streak', 'failure_category', 'failure_rule',
  'switch_states_tested', 'completed', 'elapsed_seconds',
  // documents — counts and states only, never content
  'estimate_id_hash', 'invoice_id_hash', 'line_item_count', 'status', 'previous_status',
  'currency', 'amount_bucket', 'has_logo', 'has_tax', 'has_discount',
  // paywall / purchases
  'placement', 'variant', 'experiment', 'product_id', 'period', 'price_tier',
  'entitlement', 'reason', 'error_code', 'source',
  // pdf / share
  'stage', 'share_method', 'page_count', 'card_type',
  // contractor connect — funnel states only. Licence numbers can never join
  // this list: 'license' is a denied key fragment below, deliberately.
  'intent', 'trade', 'state', 'county', 'project_type', 'value_range',
  'flag_count', 'match_count', 'verification_status', 'intro_status',
  'subject_kind', 'fee_bucket', 'source_id',
]);

/**
 * Key fragments that indicate identifying content. Checked case-insensitively
 * against the property name, so `customerName`, `customer_name` and
 * `CUSTOMER_NAME` are all caught.
 */
const DENIED_KEY_FRAGMENTS = [
  'name', 'email', 'mail', 'phone', 'tel', 'address', 'street', 'city', 'zip', 'postal',
  'customer', 'client', 'description', 'note', 'notes', 'message', 'prompt', 'query',
  'photo', 'image', 'uri', 'url', 'card', 'cvc', 'iban', 'account', 'routing',
  'token', 'secret', 'key', 'password', 'ssn', 'tax_id', 'license',
  'latitude', 'longitude', 'lat', 'lng', 'geo', 'company', 'business',
];

// Value-shaped detectors — catch identifying data smuggled under an allowed key.
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const STREET_RE = /\b\d{1,6}\s+([A-Za-z]+\s){1,4}(st|street|ave|avenue|rd|road|blvd|ln|lane|dr|drive|ct|court|way|hwy)\b/i;

// Nine or more digits in one value, ignoring separators. Covers phone numbers,
// card numbers, and account/routing numbers in any formatting — matching on
// digit COUNT rather than on punctuation avoids the gaps a shape-based regex
// leaves (e.g. "+1 (555) 123-4567" vs "555.123.4567").
const DIGIT_RUN_THRESHOLD = 9;
const countDigits = (s) => {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 48 && c <= 57) n++;
  }
  return n;
};

export const isDeniedKey = (key) => {
  const k = String(key).toLowerCase();
  if (ALLOWED_PROPERTIES.has(k)) return false;
  return DENIED_KEY_FRAGMENTS.some((frag) => k.includes(frag));
};

export const looksIdentifying = (value) => {
  if (typeof value !== 'string') return false;
  return EMAIL_RE.test(value) || STREET_RE.test(value) || countDigits(value) >= DIGIT_RUN_THRESHOLD;
};

/**
 * Scrub one properties object.
 * Deny-by-default: a key is kept only if it is explicitly allowed AND its value
 * is a safe primitive AND the value does not look identifying.
 *
 * @returns {{props: object, dropped: string[]}}
 */
export const scrubProperties = (props) => {
  const out = {};
  const dropped = [];

  if (!props || typeof props !== 'object' || Array.isArray(props)) return { props: out, dropped };

  for (const [key, value] of Object.entries(props)) {
    const k = String(key).toLowerCase();

    if (!ALLOWED_PROPERTIES.has(k)) { dropped.push(key); continue; }
    if (value === null || value === undefined) { dropped.push(key); continue; }

    // Nested objects and arrays can hide anything. Analytics properties are flat.
    if (typeof value === 'object') { dropped.push(key); continue; }
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      dropped.push(key); continue;
    }
    if (looksIdentifying(value)) { dropped.push(key); continue; }

    // Bound string length so a long free-text value cannot ride along.
    out[k] = typeof value === 'string' ? value.slice(0, 120) : value;
  }

  return { props: out, dropped };
};

/**
 * Money must never be sent at exact value (it is close to a customer identifier
 * when combined with a timestamp). Bucket it instead — ANL-08.
 */
export const amountBucket = (amount) => {
  const n = Number(amount);
  if (!Number.isFinite(n) || n < 0) return 'unknown';
  if (n === 0) return '0';
  if (n < 100) return '<100';
  if (n < 500) return '100-499';
  if (n < 1000) return '500-999';
  if (n < 5000) return '1000-4999';
  if (n < 10000) return '5000-9999';
  return '10000+';
};

/**
 * Stable non-reversible id for correlating events about the same document
 * without sending the document id itself (SEC-06, ANL-08).
 * FNV-1a — not a security hash, and not used as one. It exists so two events
 * can be joined, never so an id can be recovered.
 */
export const hashId = (value) => {
  const s = String(value ?? '');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
};
