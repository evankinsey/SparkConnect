# Task for ChatGPT — enforce the SparkAI allowance on Vercel

Hand this over verbatim.

---

## Before you touch anything

**1. Confirm the policy is live.** Open `https://sparkconnect.pro/allowance-policy.json`
in a browser. It must return JSON with a `tiers` object containing four keys:
`free`, `pro`, `pro_legacy`, `lifetime`.

**If it 404s, STOP.** It publishes when PR #1 merges to `main`. Patching before
then means the endpoint falls back to its built-in defaults on every request,
and the verification at the bottom will fail for a reason that has nothing to
do with your work.

**2. Confirm the endpoint is alive.** `GET https://sparkconnect-website.vercel.app/api/ask-nec`
should return **405 Method Not Allowed**. That is correct — it is POST-only. A
405 means you are looking at the right project.

**3. The right project is `sparkconnect-website`.** NOT `spark-connect`. The
latter is a static site built from the GitHub repo and has no serverless
functions at all — deploying the API there would do nothing and deploying the
site into the API project would take SparkAI down for every installed app.

`sparkconnect-website` was deployed by CLI and has no git source, so you cannot
read it from GitHub. Get the current `api/ask-nec.js` from **Vercel Dashboard →
sparkconnect-website → any deployment → the Source tab**, which browses the
deployed files.

---

## What to change

### Add `api/_allowance.js`

Copy it verbatim from `server/allowance.js` in the SparkConnect repo
(branch `claude/daily-code-question-home-rh6cip`). Do not retype it and do not
adjust the numbers — it fetches them from the policy URL above, which is
generated from the app's own source. Numbers typed here are numbers that drift.

### Add the check to `api/ask-nec.js`

Before the model request:

```js
import { checkAllowance } from './_allowance.js';

const verdict = await checkAllowance({
  planType: body.planType,          // 'free' | 'pro' | 'pro_legacy' | 'lifetime'
  usage: await readUsage(body.deviceId),   // YOUR existing counter, unchanged
});

if (!verdict.allowed) {
  return res.status(429).json({
    error: verdict.reason,          // 'daily_limit_reached' | 'monthly_fair_use_reached'
    remainingQuestions: 0,
    policyVersion: verdict.policyVersion,
  });
}
```

After the model responds, keep returning `remainingQuestions`:

```js
res.json({ answer, remainingQuestions: verdict.remaining, policyVersion: verdict.policyVersion });
```

`usage` is `{ today, month, purchased }` from whatever store you already have.
Use the counters that exist — do not build a new store.

---

## The four tiers, and the one that will surprise you

| planType | per day | per month |
|---|---|---|
| `free` | 5 | — |
| `pro` | 10 | 250 |
| `pro_legacy` | **20** | **500** |
| `lifetime` | 5 | — |

`pro_legacy` is not a typo and not dead code. The App Store sold Pro as "20 AI
answers/day" until 10 Aug 2026, and everyone who subscribed on that promise
keeps it for as long as they stay subscribed. The app decides which of the two
a customer is, from RevenueCat's `originalPurchaseDate`, and sends the answer.

**Do not collapse the two Pro tiers into one.** Metering a grandfathered member
at 10 takes back something they paid for.

Anything unrecognised is metered as `free`. An unknown tier is an older app
build or a tampered request, and free is the right answer to both.

---

## Do not change

- The response shape. The app reads `answer`, `remainingQuestions` and the 429.
- `/api/transcribe`. Leave it completely alone.
- The model, the system prompt, temperature, or anything about how the answer
  is produced. This task is metering only.
- **Purchased answer packs.** They are permanent until spent and must survive
  every daily and monthly reset. `checkAllowance` already spends them only
  after the included allowance is gone — do not add a second place that
  decrements them.
- Any API key, secret or environment variable. If you find yourself editing
  one, you are in the wrong file.

---

## Verify, in this order

1. `GET /api/ask-nec` → still **405**.
2. Five POSTs with `planType: 'free'` and a fresh `deviceId` → all succeed, and
   `remainingQuestions` counts **4, 3, 2, 1, 0**.
3. A sixth → **429** with `error: 'daily_limit_reached'`.
4. A POST with `planType: 'pro_legacy'` and a fresh `deviceId` → succeeds with
   `remainingQuestions: 19`. **If this comes back 4, the policy did not load and
   you are running on the fallback — check step 1.**
5. `POST /api/transcribe` with whatever it normally takes → unchanged.
6. Ask a real question through the app on a phone → an answer, not a 429.

Report the actual numbers you saw at each step, not "it works".

---

## If something breaks

Roll back by promoting the previous deployment in the Vercel dashboard. The
endpoint is live for every installed copy of the app, so a broken deploy is an
outage for real users — verify before you walk away, not after.
