# Shipping v1.0.1 to the App Store

Everything you need, in order. Roughly **2 hours of waiting, 20 minutes of clicking.**

---

## What this release actually fixes

Three things were broken in the build that is live right now:

**1. Spark AI never sent a message.** `App.js` called `getGate()`, which is
exported from `ProGatingContext.js` and was **never imported**. That threw a
ReferenceError inside an async function with no catch, so every send failed
silently. A second bug sat behind it: `ProGatingProvider` is not mounted, so even
with the import the next line — `if (!sparkyGate) return;` — swallowed the send.
Both fixed. The gate is now optional and the backend's own rate limit applies
when it is absent.

> This is why the bundler could not catch it. Babel does not resolve global
> identifiers, so `getGate()` compiles fine and only explodes at runtime. It
> took reading the call site to find.

**2. The daily code question notification never fired.** Six separate faults —
wrong `expo-notifications` version for SDK 54, a trigger missing its `type`, the
plugin absent from `app.json`, no Android channel, no foreground handler, and a
repeating trigger that would have shown the same question forever.

**3. Blank UI strings** from an old find/replace: the notification title was
literally `'⚡ '`, a Settings row was `' Alert'`, and the Daily Question card
header was empty.

Plus: question bank 8 → 30, a Reminder Time setting, and the stale
`v1.0 · NEC 2023` badge removed from the splash.

## What this release does not do

- **Purchases still do not unlock anything.** `IS_PRO = false` is hardcoded at
  `App.js:552`. Fixing it means mounting `ProGatingProvider` and re-testing the
  whole purchase flow, which cannot be verified from here. **Do it as v1.0.2,
  with a TestFlight sandbox purchase.** Shipping an untested purchase change into
  an App Store submission is how you get a crash on launch.
- No new features are visible. The Wiring Lab, troubleshooting, new paywall and
  the rest are tested libraries with no screen attached.

---

## Pre-flight (already done)

```
npm test                            224 passing
npx expo export --platform ios      exit 0, 3.99 MB
npx expo export --platform android  exit 0
npm run config:check                clean, both platforms
app.json                            1.0.0 → 1.0.1, iOS build 1 → 2, Android versionCode 1 → 2
```

> The bundle grew from 2.85 MB to 3.99 MB. That is `react-native-purchases`
> arriving with the `getGate` import. It is a dependency you need anyway, and it
> means gating starts working the moment the provider is mounted.

---

## Step 1 — Log in to EAS (2 min)

```bash
npm install -g eas-cli
eas login
eas whoami            # confirm
```

If the project has never been linked:
```bash
eas init            # should match projectId 6be503ce-d7a7-4ae2-8b8d-3ae0bdc781ba in app.json
```

## Step 2 — Build for iOS (~20 min of waiting)

```bash
eas build --platform ios --profile production
```

First run asks for your Apple ID and will offer to manage signing for you. **Say
yes** unless you have a reason not to — it creates the distribution certificate
and provisioning profile and stores them with EAS.

You need: an Apple Developer Program membership ($99/yr) and the app already
created in App Store Connect (it is, since 1.0.0 is live).

## Step 3 — Submit to App Store Connect (~5 min)

```bash
eas submit --platform ios --latest
```

That uploads the build. Then it sits in **Processing** for 10–30 minutes.

## Step 4 — TestFlight (do not skip this)

App Store Connect → your app → **TestFlight**. Once processing finishes, install
it on your own phone and check:

- [ ] App launches without a crash
- [ ] Splash shows no version badge
- [ ] **Spark AI: send a message and get a reply** ← the fix that matters most
- [ ] Home → Daily Code Question card has a header
- [ ] Settings → App Settings → labels read properly
- [ ] Settings → Reminder Time cycles when tapped
- [ ] Enable the notification toggle, set the reminder ~2 minutes out, background the app, wait
- [ ] Tap the notification → opens Home on the question
- [ ] Existing calculators, Job Cam and the quiz still work

If Spark AI still does not reply, it is the backend URL, not the gate — check
`NEC_BACKEND_URL` in `App.js`.

## Step 5 — Submit for review (~5 min)

App Store Connect → **App Store** tab → **+ Version** → `1.0.1`.

**What's New:**
```
Fixed the daily code question notification, which was not being delivered.
Fixed an issue that prevented Spark AI from responding to messages.
Expanded the daily question bank from 8 to 30 questions.
Added a reminder time setting.
Various label and display corrections.
```

Select build 2, answer the export-compliance question (**No**, unless you added
custom encryption — you have not), then **Add for Review** → **Submit**.

Review is typically 24–48 hours.

## Step 6 — Android

```bash
eas build --platform android --profile production
eas submit --platform android --latest
```

Google Play needs a service-account JSON the first time —
[docs](https://docs.expo.dev/submit/android/). Play review takes a few hours to a
few days.

---

## If review rejects you

The likely one for this build: **notification permission**. If they ask why you
request notifications, the answer is *"An opt-in daily educational reminder
containing an electrical code question. The user enables it explicitly and can
disable it in Settings at any time."* Point them at the toggle.

`NSUserTrackingUsageDescription` is not needed — you do not track anyone. There
is no analytics SDK installed at all.

---

# Supabase — walking through it

Full detail in [`SUPABASE-SETUP.md`](SUPABASE-SETUP.md). Here is the shape of it.

## What you get, and why it is next

Right now every invoice, estimate and photo lives only on the phone. Lose the
phone, lose the business records. Supabase gives you four things at once:

1. Somewhere to run Stripe webhooks
2. Somewhere invoices live that is not one device
3. A guarantee customer A cannot read customer B's invoice — enforced by the
   database, not by my code remembering to check
4. A hosted page where a homeowner can actually pay

## Your part — about 20 minutes

**1. Create the project** (5 min)
supabase.com → New project → name `sparkconnect` → **save the database password
in your password manager, it is not recoverable** → region closest to your
customers → Free plan.

**2. Copy two keys** (2 min)
Project Settings → API. Take the **Project URL** and the **anon/public** key into
`src/config/keys.js`:
```js
export const SUPABASE_URL = 'https://xxxx.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhb...';
export const BACKEND_URL = 'https://xxxx.supabase.co/functions/v1';
```
**Do not touch the `service_role` key.** It bypasses every security rule. If it
ever lands in `src/`, `npm run config:check` fails the build with
`SECRET IN CLIENT BUNDLE`.

**3. Create the tables** (5 min)
SQL Editor → New query → paste the schema block from `SUPABASE-SETUP.md` → Run.
Six tables: contractors, customers, documents, payments, stripe_events.

**4. Lock it down** (5 min) ← **the step that matters**
Paste the row-level-security block → Run. Then Table Editor and confirm every
table shows a green **RLS enabled** badge. If one says "unrestricted", that table
is readable by anyone on the internet.

**5. Install the client** (2 min)
```bash
npx expo install @supabase/supabase-js react-native-url-polyfill
```

Then tell me, and I write `src/core/backend/` — the client, the sync layer and an
offline queue. It stays offline-first: the app keeps working in a basement and
syncs when it reconnects.

## Stripe — after Supabase, not before

You need Stripe activated (business details + bank account) and Connect enabled
in Express mode. Then two secrets go into Supabase, never the repo:

```bash
npx supabase secrets set STRIPE_SECRET_KEY=sk_test_xxx
npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
```

I write three edge functions: `connect-onboarding`, `create-payment-session`,
`stripe-webhook`. The webhook is the source of truth — a user returning from a
successful-looking redirect proves nothing, since that URL can be typed by hand.

`customerPaymentsEnabled` stays hard-locked off until the whole path is tested
end to end with a real card. There is a test proving a remote config payload
cannot switch it on.

---

# The order I would actually go in

| | What | Why | Effort |
|---|---|---|---|
| 1 | **Ship 1.0.1 today** | Spark AI is dead in production right now | 2 hrs |
| 2 | **Wire `IS_PRO`** → 1.0.2 | Purchases unlock nothing; test in TestFlight sandbox | 2–3 days |
| 3 | **Install analytics** | Nothing has ever been measured | 1 day |
| 4 | **Render the new paywall** | Written and tested, needs a call site | 1 day |
| 5 | **Supabase** | Unblocks invoices, payments, everything cloud | 1 week |
| 6 | **Wiring Lab screen** | First feature users will actually notice | 1–2 weeks |

Steps 1–4 are about a week and turn the app from "quietly broken in two places"
into "earns money and tells you what happened". Everything after that builds on a
foundation you can trust.
