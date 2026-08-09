// ─── CONTRACTOR CONNECT ANALYTICS TAXONOMY ───────────────────────────────────
// The event names the brief requires, as data, so the tests can assert the
// list is complete and the app-level tracker (src/analytics.js) cannot drift
// from it.
//
// WHAT NEVER RIDES ALONG: plans, photos, descriptions, licence numbers, names,
// contact details. Every property passes the app's deny-by-default PII scrub
// (src/privacy/scrub.js), which drops unknown keys and anything shaped like
// identifying content — and 'license' is a denied key fragment there, so a
// licence number cannot leave even by mistake. What travels is states of
// funnels: intent, trade, coarse jurisdiction, counts, statuses, buckets.
//
// Pure module: no React, no network, no storage.

export const CONNECT_EVENTS = Object.freeze([
  'contractor_connect_opened',
  'intent_selected',
  'opportunity_started',
  'opportunity_submitted',
  'contractor_profile_created',
  'qualifier_profile_created',
  'license_verification_started',
  'license_verification_success',
  'license_verification_failed',
  'match_viewed',
  'intro_requested',
  'intro_accepted',
  'intro_declined',
  'match_completed',
  'fee_presented',
  'fee_paid',
  'source_clicked',
]);

/**
 * The safe property vocabulary for these events. Everything here must also be
 * in scrub.js ALLOWED_PROPERTIES, and the test cross-checks the two lists so
 * a new property cannot ship un-scrubbed.
 */
export const CONNECT_SAFE_PROPS = Object.freeze([
  'intent', 'trade', 'state', 'county', 'project_type', 'value_range',
  'flag_count', 'match_count', 'verification_status', 'intro_status',
  'subject_kind', 'fee_bucket', 'source_id', 'status', 'reason', 'error_code',
]);
