# Analytics Events

The event taxonomy SparkConnect tracks, and how each rolls up into the Growth OS.
Events are emitted via Segment from `src/analytics.js`. Daily counts land in the
Sheets **Daily Metrics** tab (manually or via a future Segment→Sheets sync);
revenue events come straight from RevenueCat (see `N8N_WORKFLOWS.md`).

## App events (Segment — `src/analytics.js`)

| Event | Properties | Fires when | Feeds (Daily Metrics column) |
|---|---|---|---|
| `onboarding_started` | — | User opens onboarding | (funnel) |
| `onboarding_completed` | `role` | Finishes onboarding | Installs proxy / role split |
| `paywall_shown` | `reason` | Paywall presented (Superwall) | Paywalls Shown |
| `paywall_trial_started` | `plan` | Trial begins | Trials Started |
| `paywall_dismissed` | `reason` | Paywall closed w/o purchase | (funnel drop-off) |
| `pro_purchase` | `plan` | Pro purchased | Paid Conversions |
| `chat_pack_purchased` | `pack` | Message pack bought | Revenue (non-renewing) |
| `sparky_message_sent` | — | User sends a Sparky AI message | Sparky Messages |
| `calculator_used` | `type` | A job calculator is used | (engagement) |
| `settings_opened` | — | Settings screen opened | (engagement) |

> `role` matters for growth: it distinguishes **creator**, **trade-school**, and
> **contractor** audiences — the same split as the three Leads tabs.

## Revenue events (RevenueCat → n8n → Revenue tab)

| RevenueCat type | Logged as `Event Type` | MRR effect |
|---|---|---|
| `INITIAL_PURCHASE` | Initial Purchase | + monthly-equivalent |
| `RENEWAL` / `UNCANCELLATION` | Renewal | 0 (already counted) |
| `TRIAL_STARTED` | Trial Start | 0 |
| `TRIAL_CONVERTED` | Trial Conversion | + monthly-equivalent |
| `CANCELLATION` / `EXPIRATION` / `BILLING_ISSUE` | Cancellation | − monthly-equivalent |
| `NON_RENEWING_PURCHASE` | Message Pack | 0 (one-time amount) |
| `REFUND` | Refund | − monthly-equivalent |

Monthly-equivalent: monthly plan = full price; annual plan = price ÷ 12.
Prices are set in the RevenueCat workflow's Config node (not hardcoded in app).

## Funnel (the one that matters)
```
install → onboarding_completed → paywall_shown → paywall_trial_started → pro_purchase → renewal
```
Track conversion at each arrow weekly in **Weekly Growth Reports** (Notion).

## Privacy rules
- **No PII in events.** No emails, names, or raw user IDs in event properties or sheets.
- RevenueCat `app_user_id` is **SHA-256 hashed** before it reaches the Revenue tab.
- Segment write key lives in app env (`EXPO_PUBLIC_*` is acceptable for the client
  write key only); server-side keys never ship in the bundle.

## Adding an event
1. Add a method to the `analytics` object in `src/analytics.js`.
2. Document it in the table above.
3. If it should roll up daily, add/point it at a **Daily Metrics** column here.
