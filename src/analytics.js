// ─── ANALYTICS ───────────────────────────────────────────────────────────────
// Requirements: ANL-01 … ANL-08, EXP-10, ONB-10, PWL-05, DOD-07
//
// Every event name below is required by the brief. Every property passes through
// the PII guard in ./privacy/scrub before it can leave the device (ANL-07).
//
// ANL-01 — one provider only. `@segment/analytics-react-native` is NOT currently
// installed, so `initAnalytics` is a no-op and `track` drops silently. That is
// deliberate: the taxonomy and the privacy guard are in place and tested, so
// wiring the provider later is a one-line change with no call-site churn.

import { scrubProperties, amountBucket, hashId } from './privacy/scrub';

let _client = null;
let _debug = false;

export function initAnalytics(writeKey) {
  if (!writeKey) return;
  try {
    // eslint-disable-next-line global-require
    const { createClient } = require('@segment/analytics-react-native');
    _client = createClient({ writeKey, trackAppLifecycleEvents: true });
    _client.setup?.().catch(() => {});
  } catch (e) {
    _client = null; // provider not installed — see note above
  }
}

export function setAnalyticsDebug(on) { _debug = !!on; }

function track(event, props = {}) {
  const { props: safe, dropped } = scrubProperties(props);
  if (_debug && dropped.length && typeof __DEV__ !== 'undefined' && __DEV__) {
    console.warn(`[SparkConnect:analytics] "${event}" dropped non-safe properties:`, dropped);
  }
  if (!_client) return { event, props: safe, sent: false };
  try { _client.track(event, safe); } catch (e) { /* never let analytics break a flow */ }
  return { event, props: safe, sent: true };
}

/** Exposed so tests and the debug screen can see exactly what would be sent. */
export const __previewEvent = (event, props) => ({ event, ...scrubProperties(props) });

export const analytics = {
  // ── APP (ANL-02) ──────────────────────────────────────────────────────────
  appOpened:      (p) => track('app_opened', p),
  sessionStarted: (p) => track('session_started', p),
  returningUser:  (p) => track('returning_user', p),
  roleSelected:   (role) => track('role_selected', { role }),

  // ── TOOLS (ANL-03) ────────────────────────────────────────────────────────
  toolOpened:           (tool, p) => track('tool_opened', { tool, ...p }),
  calculationCompleted: (tool, p) => track('calculation_completed', { tool, ...p }),
  resultSaved:          (tool, p) => track('result_saved', { tool, ...p }),
  aiExplanationClicked: (tool, p) => track('ai_explanation_clicked', { tool, ...p }),

  // ── TRAINING (ANL-04) ─────────────────────────────────────────────────────
  simulationCatalogOpened: (p) => track('simulation_catalog_opened', p),
  simulationStarted:  (lessonId, p) => track('simulation_started', { lesson_id: lessonId, ...p }),
  wireConnected:      (lessonId, p) => track('wire_connected', { lesson_id: lessonId, ...p }),
  circuitTested:      (lessonId, p) => track('circuit_tested', { lesson_id: lessonId, ...p }),
  simulationFailed:   (lessonId, p) => track('simulation_failed', { lesson_id: lessonId, ...p }),
  simulationCompleted:(lessonId, p) => track('simulation_completed', { lesson_id: lessonId, ...p }),
  hintUsed:           (lessonId, level) => track('hint_used', { lesson_id: lessonId, hint_level: level }),
  lessonAbandoned:    (lessonId, p) => track('lesson_abandoned', { lesson_id: lessonId, ...p }),
  challengeStarted:   (lessonId, p) => track('challenge_started', { lesson_id: lessonId, ...p }),
  challengeCompleted: (lessonId, p) => track('challenge_completed', { lesson_id: lessonId, ...p }),
  streakUpdated:      (streak) => track('streak_updated', { streak }),

  // ── INVOICE (ANL-05) — ids are hashed and amounts bucketed (ANL-07) ────────
  estimateCreated:   (id, p) => track('estimate_created',   { estimate_id_hash: hashId(id), ...p }),
  estimateSent:      (id, p) => track('estimate_sent',      { estimate_id_hash: hashId(id), ...p }),
  estimateAccepted:  (id, p) => track('estimate_accepted',  { estimate_id_hash: hashId(id), ...p }),
  estimateDeclined:  (id, p) => track('estimate_declined',  { estimate_id_hash: hashId(id), ...p }),
  estimateConverted: (id, invoiceId) => track('estimate_converted', {
    estimate_id_hash: hashId(id), invoice_id_hash: hashId(invoiceId),
  }),
  invoiceCreated:    (id, p) => track('invoice_created',    { invoice_id_hash: hashId(id), ...p }),
  invoiceSent:       (id, p) => track('invoice_sent',       { invoice_id_hash: hashId(id), ...p }),
  invoiceMarkedPaid: (id, amount) => track('invoice_marked_paid', {
    invoice_id_hash: hashId(id), amount_bucket: amountBucket(amount),
  }),
  paymentLinkCreated:        (id) => track('payment_link_created', { invoice_id_hash: hashId(id) }),
  paymentLinkCreationFailed: (id, errorCode) => track('payment_link_creation_failed', {
    invoice_id_hash: hashId(id), error_code: errorCode,
  }),
  checkoutOpened:    (id) => track('checkout_opened', { invoice_id_hash: hashId(id) }),
  paymentCompleted:  (id, amount) => track('payment_completed', {
    invoice_id_hash: hashId(id), amount_bucket: amountBucket(amount),
  }),
  paymentFailed:     (id, errorCode) => track('payment_failed', {
    invoice_id_hash: hashId(id), error_code: errorCode,
  }),
  refundRecorded:    (id, amount) => track('refund_recorded', {
    invoice_id_hash: hashId(id), amount_bucket: amountBucket(amount),
  }),

  // ── PDF / EXPORT (EXP-10) ─────────────────────────────────────────────────
  pdfGenerateStarted:   (p) => track('pdf_generate_started', p),
  pdfGenerateSucceeded: (p) => track('pdf_generate_succeeded', p),
  pdfGenerateFailed:    (stage, errorCode) => track('pdf_generate_failed', { stage, error_code: errorCode }),
  pdfShareOpened:       (p) => track('pdf_share_opened', p),
  pdfShareCompleted:    (p) => track('pdf_share_completed', p),
  pdfShareFailed:       (stage, errorCode) => track('pdf_share_failed', { stage, error_code: errorCode }),

  // ── ONBOARDING (ONB-10) ───────────────────────────────────────────────────
  onboardingStarted:            (p) => track('onboarding_started', p),
  onboardingRoleSelected:       (role) => track('onboarding_role_selected', { role }),
  onboardingGoalSelected:       (goal) => track('onboarding_goal_selected', { reason: goal }),
  onboardingFirstActionStarted: (tool) => track('onboarding_first_action_started', { tool }),
  onboardingFirstActionCompleted: (tool) => track('onboarding_first_action_completed', { tool }),
  onboardingAbandoned:          (p) => track('onboarding_abandoned', p),

  // ── PAYWALL / MONETIZATION (PWL-05, ANL-06) ───────────────────────────────
  paywallPresented: (placement, variant) => track('paywall_presented', { placement, variant }),
  paywallDismissed: (placement, reason) => track('paywall_dismissed', { placement, reason }),
  productSelected:  (productId) => track('product_selected', { product_id: productId }),
  trialStarted:     (productId) => track('trial_started', { product_id: productId }),
  purchaseStarted:  (productId) => track('purchase_started', { product_id: productId }),
  purchaseCompleted:(productId) => track('purchase_completed', { product_id: productId }),
  purchaseFailed:   (productId, errorCode) => track('purchase_failed', { product_id: productId, error_code: errorCode }),
  restoreStarted:   () => track('restore_started'),
  restoreCompleted: (entitlement) => track('restore_completed', { entitlement }),
  restoreFailed:    (errorCode) => track('restore_failed', { error_code: errorCode }),
  entitlementGranted: (entitlement) => track('entitlement_granted', { entitlement }),
  entitlementMissingAfterPurchase: (productId) => track('entitlement_missing_after_purchase', { product_id: productId }),
  subscriptionStarted: (productId) => track('subscription_started', { product_id: productId }),
  lifetimePurchased:   (productId) => track('lifetime_purchased', { product_id: productId }),
  answerPackPurchased: (productId) => track('answer_pack_purchased', { product_id: productId }),

  // ── SHARE CARDS (GRW-04) ──────────────────────────────────────────────────
  shareCardPreviewed: (cardType) => track('share_card_previewed', { card_type: cardType }),
  shareCardShared:    (cardType, method) => track('share_card_shared', { card_type: cardType, share_method: method }),

  // ── CONTRACTOR CONNECT ────────────────────────────────────────────────────
  // Taxonomy pinned by src/core/connect/marketplace/analytics.js and its test.
  // Nothing here carries content — no descriptions, no licence numbers, no
  // names. The scrub would drop them anyway; the call sites do not try.
  connectOpened:            (p) => track('contractor_connect_opened', p),
  connectIntentSelected:    (intent) => track('intent_selected', { intent }),
  connectOpportunityStarted:(p) => track('opportunity_started', p),
  connectOpportunitySubmitted: (p) => track('opportunity_submitted', p),
  connectContractorProfileCreated: (p) => track('contractor_profile_created', p),
  connectQualifierProfileCreated:  (p) => track('qualifier_profile_created', p),
  connectVerificationStarted: (p) => track('license_verification_started', p),
  connectVerificationSuccess: (p) => track('license_verification_success', p),
  connectVerificationFailed:  (errorCode, p) => track('license_verification_failed', { error_code: errorCode, ...p }),
  connectMatchViewed:       (p) => track('match_viewed', p),
  connectIntroRequested:    (p) => track('intro_requested', p),
  connectIntroAccepted:     (p) => track('intro_accepted', p),
  connectIntroDeclined:     (p) => track('intro_declined', p),
  connectMatchCompleted:    (p) => track('match_completed', p),
  connectFeePresented:      (feeBucket, p) => track('fee_presented', { fee_bucket: feeBucket, ...p }),
  connectFeePaid:           (feeBucket, p) => track('fee_paid', { fee_bucket: feeBucket, ...p }),
  connectSourceClicked:     (sourceId) => track('source_clicked', { source_id: sourceId }),

  // ── Backwards-compatible aliases (NNR-02) ─────────────────────────────────
  // The previous names were never called anywhere, but keeping them costs
  // nothing and guarantees no call site can break.
  onboardingCompleted: (role) => track('onboarding_completed', { role }),
  paywallShown:        (reason) => track('paywall_presented', { placement: reason }),
  paywallTrialStarted: (plan) => track('trial_started', { product_id: plan }),
  sparkyMessageSent:   () => track('ai_explanation_clicked', { tool: 'spark_ai' }),
  calculatorUsed:      (type) => track('tool_opened', { tool: type }),
  proPurchased:        (plan) => track('subscription_started', { product_id: plan }),
  settingsOpened:      () => track('tool_opened', { tool: 'settings' }),
  chatPackPurchased:   (pack) => track('answer_pack_purchased', { product_id: pack }),
};

export { amountBucket, hashId };
