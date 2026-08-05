# Getting your keys in — step by step

Everything below is **yours to fetch**; I can't log into your dashboards. Each key
takes about two minutes. Do them in this order — the first one is a live bug.

When you have a value, paste it into `src/config/keys.js`. Then run
`npm run config:check` to confirm the app agrees it is valid.

---

## 1. RevenueCat Android key — **do this first**

**Why it's urgent:** `REVENUECAT_ANDROID_KEY` is an empty string right now. RevenueCat
doesn't throw on an empty key — it just never resolves an entitlement. So **every
Android user is treated as Free, including anyone who has paid you.** They get
charged and receive nothing, and nothing in your logs says so.

1. Go to **app.revenuecat.com** → sign in
2. Left sidebar → **Project settings** → **API keys**
3. You'll see a list of **Public app-specific API keys** — one row per app
4. Find the row whose **App** column is your Android / Google Play app
5. Copy the key. It starts with **`goog_`**
6. Paste into `src/config/keys.js`:
   ```js
   export const REVENUECAT_ANDROID_KEY = 'goog_XXXXXXXXXXXXXXXXXXXX';
   ```

**If there's no Android app row:** you haven't created the Android app in RevenueCat
yet. **Project settings → Apps → + New →** choose *Google Play Store*, give it your
package name `com.sparkconnect.tools`, save, then come back for the key.

> The `appl_` key already in the file is the iOS one and is correct. Public SDK keys
> are *designed* to ship in an app bundle — they identify your app, they can't read
> billing data. Do **not** copy the *secret* key from the same page.

---

## 2. Superwall keys

Only needed if you want paywall A/B testing. The app falls back to the built-in
paywall without them, so this is not urgent.

1. Go to **superwall.com/dashboard** → sign in
2. **Settings** → **Keys** (or **API Keys**)
3. There is one key **per platform**. Both start with **`pk_`**
4. Paste both:
   ```js
   export const SUPERWALL_IOS_KEY = 'pk_XXXXXXXXXXXXXXXX';
   export const SUPERWALL_ANDROID_KEY = 'pk_XXXXXXXXXXXXXXXX';
   ```

Then install the SDK — it isn't in `package.json` yet:

```bash
npx expo install @superwall/react-native-superwall
```

**Placements to create in the Superwall dashboard** (the six from your brief, plus
the paywall ones). Names must match exactly:

```
simulation_locked          troubleshooting_locked
challenge_mode_locked      ai_simulation_explanation
progress_history_locked    custom_practice_locked
```

---

## 3. Backend URL — the one real decision

You asked me to pick "whatever makes sense." My recommendation, and why:

**Use Supabase.** Not because it's trendy — because of what you specifically need:

| You need | Supabase gives you |
|---|---|
| Stripe webhooks with signature verification | Edge Functions (Deno), one file per handler |
| Somewhere to hold invoice + payment state that isn't the phone | Postgres, with row-level security |
| Ownership checks so customer A can't read customer B's invoice | RLS policies — enforced by the database, not by your code remembering to check |
| A hosted customer payment page | Edge Function returning a Stripe Checkout redirect |
| Contractor profiles / licences / jobs board later | Same Postgres, no second system |
| Free while you have no revenue | Yes |

The alternative — a Vercel/Cloudflare function plus a separate database — is more
moving parts for the same result. Your `App.js` already has a `NEC_BACKEND_URL`
comment mentioning Vercel; if you already have a Vercel project running Spark AI,
tell me and I'll design around that instead rather than making you migrate.

Once it exists:
```js
export const BACKEND_URL = 'https://your-project.supabase.co/functions/v1';
```

---

## 4. Checking your work

```bash
npm run config:check
```

Example output when something is wrong:

```
SparkConnect configuration (android): 1 blocking configuration problem(s) on android
  [BLOCKER]  RevenueCat Android SDK key — MISSING. Android purchases and
             entitlements cannot resolve. Every Android user — including paying
             customers — is silently treated as Free.
  [DEGRADED] Superwall Android key — MISSING. Paywall placements and A/B
             experiments do not run on Android.
```

It also fails loudly if you ever paste a key into the wrong slot (an `appl_` key in
the Android field reads as `MALFORMED`, not as "working"), and it screams if a
**secret** ever lands in the client bundle.

---

## What must never go in this file

`src/config/keys.js` ships inside the app bundle. Anyone can extract it. These are
backend-only, forever:

```
STRIPE_SECRET_KEY          STRIPE_WEBHOOK_SECRET
STRIPE_CONNECT_CLIENT_SECRET
OPENAI_API_KEY             ANTHROPIC_API_KEY
REVENUECAT_SECRET_KEY      SUPABASE_SERVICE_ROLE_KEY
```

`validateConfig()` checks for all of these by name and reports `SECRET IN CLIENT
BUNDLE` as a critical finding if one appears.

---

## One more thing I found while wiring this up

`App.js` has its **own** copy of the RevenueCat config, separate from
`src/config/keys.js`:

```js
const RC_IOS_KEY     = 'YOUR_IOS_KEY_HERE';     // line ~536
const RC_ANDROID_KEY = 'YOUR_ANDROID_KEY_HERE';
const IS_PRO = false;                            // line ~552
```

`IS_PRO` is **hardcoded false**. Whatever RevenueCat returns, the UI treats every
user as Free. If you have ever tested a purchase and seen it not unlock anything,
this is why — not RevenueCat, not the keys.

Fixing it means wiring `IS_PRO` to the real entitlement, which touches the Pro
gating across the whole file. I left it alone because it's a behaviour change that
deserves its own testing pass rather than being buried in a config commit. Say the
word and it's the next thing I do.
