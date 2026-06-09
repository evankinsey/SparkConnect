let _client = null;
export function initAnalytics(writeKey) {
  if (!writeKey) return;
  try {
    const { createClient } = require('@segment/analytics-react-native');
    _client = createClient({ writeKey, trackAppLifecycleEvents: true });
    _client.setup().catch(() => {});
  } catch (e) {}
}
function track(event, props = {}) {
  if (!_client) return;
  try { _client.track(event, props); } catch (e) {}
}
export const analytics = {
  onboardingStarted:   () => track('onboarding_started'),
  onboardingCompleted: (role) => track('onboarding_completed', { role }),
  paywallShown:        (reason) => track('paywall_shown', { reason }),
  paywallTrialStarted: (plan) => track('paywall_trial_started', { plan }),
  paywallDismissed:    (reason) => track('paywall_dismissed', { reason }),
  sparkyMessageSent:   () => track('sparky_message_sent'),
  calculatorUsed:      (type) => track('calculator_used', { type }),
  proPurchased:        (plan) => track('pro_purchase', { plan }),
  settingsOpened:      () => track('settings_opened'),
  chatPackPurchased:   (pack) => track('chat_pack_purchased', { pack }),
};
