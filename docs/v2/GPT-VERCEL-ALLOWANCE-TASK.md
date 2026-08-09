# Task for ChatGPT (with Vercel access)

Install server-side allowance enforcement on the SparkConnect API so the backend
enforces exactly the limits the iOS app advertises.

## ⚠️ READ THIS FIRST — DO NOT BREAK THE LIVE API

The target is the Vercel project **`sparkconnect-website`**.

`https://sparkconnect-website.vercel.app/api/ask-nec` is **the live backend for
every SparkConnect build in the App Store.** The URL is hardcoded in the shipped
iOS binary. If it 404s, changes shape, or stops answering, **SparkAI is dead for
every paying customer until Apple approves a new release** — which is days.

Therefore:

- **DO NOT** deploy a static site over this project.
- **DO NOT** rename, move, or delete anything under `/api/`.
- **DO NOT** change the response shape of `/api/ask-nec`. It must keep returning
  `{ answer, references, fieldNote, confidence, remainingQuestions }`.
- **DO NOT** touch the other project (`spark-connect`) — that one serves the
  website and is git-connected to the repo.
- Make the smallest possible change. Add one file, add one call.

Before you start, confirm the endpoint is alive:

```
curl -s -o /dev/null -w '%{http_code}\n' https://sparkconnect-website.vercel.app/api/ask-nec
```

A `405` or `400` is healthy (it is POST-only). A `404` means you are looking at
the wrong project — stop.

## The problem you are fixing

The app advertises **5 SparkAI answers/day on Free** and **10/day on Pro** with a
250/month fair-use backstop. The backend enforces whatever number was typed into
it months ago. Nobody knows what that number is.

Two systems, one number, no shared source. A client that promises a limit the
server does not honour is broken in both directions: too generous and users hit a
wall the app said was not there; too strict and they are cut off early after being
told they had more.

## The fix

The policy is now **generated** from the app's own entitlement module and
published as a static file:

```
https://sparkconnect.pro/allowance-policy.json
```

It looks like this:

```json
{
  "version": 1,
  "tiers": {
    "free":     { "perDay": 5,  "perMonth": null },
    "pro":      { "perDay": 10, "perMonth": 250 },
    "lifetime": { "perDay": 5,  "perMonth": null }
  },
  "purchasedAnswers": {
    "consumedAfterIncluded": true,
    "expires": false,
    "resetByDaily": false,
    "resetByMonthly": false
  }
}
```

**Do not hardcode these numbers.** Read the file. That is the entire point — it is
generated from the app's source, so when the allowance changes, both systems move
together and a CI check fails if they drift.

> If `https://sparkconnect.pro/allowance-policy.json` 404s, the website has not
> been redeployed yet. The module below falls back safely, but tell me so I can
> get it deployed.

## Step 1 — add `api/_allowance.js`

Create this file in the `sparkconnect-website` project. It is complete; do not
rewrite it.

```js
const POLICY_URL = 'https://sparkconnect.pro/allowance-policy.json';
const CACHE_MS = 5 * 60 * 1000;

// Last-known-good, not something permissive. Failing open on a paid allowance is
// a cost problem; failing closed is a support problem; falling back to the
// current values is neither.
const FALLBACK = Object.freeze({
  version: 0,
  tiers: {
    free: { perDay: 5, perMonth: null },
    pro: { perDay: 10, perMonth: 250 },
    lifetime: { perDay: 5, perMonth: null },
  },
});

let cached = null;
let cachedAt = 0;

export const loadPolicy = async (fetchImpl = fetch) => {
  if (cached && Date.now() - cachedAt < CACHE_MS) return cached;
  try {
    const res = await fetchImpl(POLICY_URL, { headers: { 'Cache-Control': 'no-cache' } });
    if (!res?.ok) throw new Error(`policy ${res?.status}`);
    const json = await res.json();
    if (!json?.tiers?.free?.perDay || !json?.tiers?.pro?.perDay) throw new Error('malformed policy');
    cached = json;
    cachedAt = Date.now();
    return cached;
  } catch (e) {
    // Keep serving the last good policy rather than reverting mid-flight — a CDN
    // blip must not silently change everybody's limit.
    return cached ?? FALLBACK;
  }
};

const tierFor = (planType) => {
  const p = String(planType ?? '').toLowerCase();
  if (p === 'pro') return 'pro';
  if (p === 'lifetime') return 'lifetime';
  return 'free';
};

export const checkAllowance = async ({ planType, usage = {}, fetchImpl } = {}) => {
  const policy = await loadPolicy(fetchImpl);
  const tier = tierFor(planType);
  const limits = policy.tiers[tier] ?? policy.tiers.free;

  const today = Number(usage.today) || 0;
  const month = Number(usage.month) || 0;
  const purchased = Number(usage.purchased) || 0;

  const dailyLeft = Math.max(0, limits.perDay - today);
  const monthlyLeft = limits.perMonth == null
    ? Number.POSITIVE_INFINITY
    : Math.max(0, limits.perMonth - month);

  const includedLeft = Math.min(dailyLeft, monthlyLeft);

  if (includedLeft > 0) {
    return {
      allowed: true,
      usingPurchased: false,
      remaining: includedLeft === Number.POSITIVE_INFINITY ? null : includedLeft - 1,
      policyVersion: policy.version,
    };
  }

  // Included is gone. Purchased answers are permanent and spend next.
  if (purchased > 0) {
    return {
      allowed: true,
      usingPurchased: true,
      remaining: 0,
      purchasedRemaining: purchased - 1,
      policyVersion: policy.version,
    };
  }

  const hitMonthly = limits.perMonth != null && monthlyLeft <= 0 && dailyLeft > 0;
  return {
    allowed: false,
    usingPurchased: false,
    remaining: 0,
    // Must name WHICH ceiling. "Out of answers" when you have nine left today is
    // a support ticket.
    reason: hitMonthly ? 'monthly_fair_use_reached' : 'daily_limit_reached',
    policyVersion: policy.version,
  };
};
```

## Step 2 — call it from `api/ask-nec.js`

Find where the handler currently decides whether to answer, and where it computes
`remainingQuestions`. Replace that logic with this. Keep everything else.

```js
import { checkAllowance } from './_allowance.js';

// ...inside the handler, BEFORE the model call:
const verdict = await checkAllowance({
  planType: body.planType,                    // 'pro' | 'free' | 'lifetime'
  usage: await readUsage(body.deviceId),      // your EXISTING usage store
});

if (!verdict.allowed) {
  return res.status(429).json({
    error: verdict.reason,
    remainingQuestions: 0,
    policyVersion: verdict.policyVersion,
  });
}

// ...after a successful model call:
res.json({
  answer,
  references,
  fieldNote,
  confidence,
  remainingQuestions: verdict.remaining,
  policyVersion: verdict.policyVersion,
});
```

### Rules you must not break

1. **`remainingQuestions` must keep being returned.** The app displays it, and it
   also uses it to detect that the two systems disagree.
2. **Purchased answers are permanent.** They are consumed only after the included
   allowance is gone, and are never reset by a daily or monthly rollover. Someone
   paid for those. If your usage store resets counters, make sure it does not
   touch the purchased balance.
3. **429 is the only refusal code.** The app already handles it.
4. **Do not invent a new response field** beyond `policyVersion`.

## Step 3 — verify before you call it done

```bash
# 1. Endpoint still routes (405/400 = healthy, 404 = you broke it)
curl -s -o /dev/null -w '%{http_code}\n' https://sparkconnect-website.vercel.app/api/ask-nec

# 2. A real question still gets a real answer
curl -s -X POST https://sparkconnect-website.vercel.app/api/ask-nec \
  -H 'Content-Type: application/json' \
  -d '{"question":"what is a switch loop","deviceId":"gpt-test-1","planType":"free"}' | head -c 400

# 3. The response carries remainingQuestions
#    Expect remainingQuestions: 4 on the first call for a fresh deviceId (5/day free)

# 4. The limit actually bites — repeat the same call 6 times with the same
#    deviceId. Calls 1-5 answer, call 6 returns HTTP 429 with
#    error: "daily_limit_reached"
```

If step 4 does not cut off at exactly 5, the enforcement is not wired correctly.

## Report back with

1. Which Vercel project and file paths you changed
2. The deployment URL and whether it is promoted to production
3. The output of all four verification commands
4. The value of `remainingQuestions` on a fresh device
5. What the previous hardcoded limit was, if you can see it in the old code —
   this matters, because it tells us whether existing users were being cut off
   early or given more than they were sold
6. Anything you chose not to change and why

## Do NOT

- Do not implement rate limiting by IP. It is per `deviceId`.
- Do not add authentication, CORS changes, or new middleware.
- Do not "clean up" or refactor the existing handler.
- Do not change the OpenAI model, prompt, or parameters.
- Do not touch `/api/transcribe`.
- Do not deploy anything to the `spark-connect` project.
