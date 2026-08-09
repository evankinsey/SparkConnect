# SparkConnect — State of the App

**Date:** 9 August 2026 · **Version:** 1.3.0 · **Last built:** iOS build 31 (on TestFlight)
**Branch:** `claude/daily-code-question-home-rh6cip` · **Tests:** 1,276 passing
**Unshipped:** 11 commits are on the branch and NOT in build 31.

---

## 1. What shipped to TestFlight today

Builds 29, 30 and 31 all built and submitted successfully via GitHub Actions
(`.github/workflows/ship.yml`). Build 31 is the current TestFlight build.

Everything after build 31 is committed and pushed but **not built**.

---

## 2. The bugs found today, in order of severity

### SparkAI was discarding every model answer in production
`App.js` hard-coded `confidence: 0.8` and `sparkai.js` defaulted to `0.5`, against a
`CONFIDENCE_FLOOR` of `0.85`. `sealAnswer()` therefore refused **every** answer the
backend ever returned. The whole model path was dead and it looked like caution.
Live in App Store build 1.0 (26). Fixed in build 29.

### The paywall greyed itself out on no evidence
Build 29 rendered all three answer packs "Unavailable right now" — the same product
IDs the App Store build sells daily. `checkStore()` saw an empty `getProducts` result
with no error code and concluded the Paid Applications agreement had lapsed.
Empty-with-no-error is now `Cause.INCONCLUSIVE` and disables nothing. Only positive
evidence can grey out a button.

### Four different numbers for one allowance
Free was enforced at 3 and advertised as 5. Pro was sold as 20/day on one screen,
100/month on another, and **unlimited** on the onboarding trial screen — the last
thing somebody reads before being charged. Now one table, `ASK_ALLOWANCE`.

### Projects never rendered a single photo
`ProjectsScreen.js` did not contain one `<Image>`. Photos were stored, counted, listed
as text rows, and never displayed by any path.

### Onboarding hijacked first launch
Answering "getting better at the trade" opened the app directly in the Wiring
Simulator. A first-time user never saw Home.

### The kill switch was never connected
`applyRemoteConfig` has existed since RC1 and nothing ever called it. "Leave room to
cut a feature off" was true in the code and false in the app.

### Blueprint Takeoff reported the wrong failure
"Could not reach SparkAI. Check your connection" on a working connection.
`askNecBackend` collapsed every failure into `null`, so a 413, a 401, a 500 and
airplane mode all produced one sentence. **Root cause not yet confirmed** — see §6.

---

## 3. What changed today, by area

| Area | Change |
|---|---|
| **SparkAI** | Four real modes (General / NEC / Troubleshoot / Estimate), each with its own screen content. "Explain Simply" demoted from mode to answer action. Compact header, history panel grouped by Today/Yesterday/This week. |
| **Projects** | Rebuilt as a visual job log: camera hero → recent photo grid → project cards with covers → coverage checklist. Tagging happens at the shutter. |
| **Job Site** | Premium glass HUD, progressive disclosure, movement stick moved out of the iOS home-indicator zone. Raster-swappable render layer added. |
| **Home** | Role picked at onboarding now drives suggestions in Customize Home. New Hours tracker (OJT / continuing ed). |
| **Estimator** | Now a three-stage Estimate → Summary → Invoice workflow with offline payment recording. |
| **Infrastructure** | Feature kill switch wired end-to-end via `website/app-config.json`. |

---

## 4. Monetization — current state (audited)

### Product IDs in App Store Connect

```
sparkconnect_pro_yearly      Pro annual      $49.99
sparkconnect_pro_monthly     Pro monthly     $7.99
sparkconnect_lifetime_tools  Lifetime        $29.99   (existence UNVERIFIED)
sparky_answers_10            15 answers      $1.99
sparky_answers_30            50 answers      $4.99
sparky_answers_100           150 answers     $9.99
```

**The pack IDs lie.** `sparky_answers_10` grants **15** answers. The number in the ID
is not the number of answers — these were created before the packs were resized, and a
live product cannot be renamed. `PRODUCT_ALIASES` maps them. **Do not "fix" these IDs.**

### Allowances as the app currently states them

| Tier | Allowance | Source of truth |
|---|---|---|
| Free | **5 / day** | `ASK_ALLOWANCE.free.perDay` |
| Pro | **25 / day** (800/mo backstop) | `ASK_ALLOWANCE.pro.perDay` |
| Lifetime | 5 / day | tools tier, not an AI tier |

### ⚠️ Conflict with the proposed spec

The new monetization spec says Pro gets **100 answers/month**. The app currently says
**25/day** — roughly 750/month, about 7× more generous. These cannot both ship.

This is not drift; it was a deliberate change made earlier today on the instruction
"update SparkAI limits to what you think is best". The reasoning was that 20/day with a
400/month cap contradicts itself — a subscriber using their advertised 20/day runs out
of month on day 20. **This needs an explicit decision before the paywall is rebuilt.**

### Still unresolved (recorded in `PRICING_DISCREPANCIES`)

- `pro-ai-allowance-unresolved` — **the server enforces the cap, not the app.** Nothing
  in this repo can confirm the real number. `/api/ask-nec` must be changed to match
  whatever is chosen, or the app promises figures the backend will not honour.
- `calculators-advertised-as-pro` — the live paywall sells calculators the app gives away.
- `lifetime-gets-unlimited-ai` — Lifetime's AI allowance was never decided.
- `jobcam-project-count` — free project limit disagrees between screens.

### Credits

`CREDITS_ENABLED` is **false**. The Spark Credits module exists, is tested, and is not
wired to anything. This matches the decision not to expose a token economy.

---

## 5. Architecture worth knowing

**Deterministic-first.** The solver/calculator is the authority; AI is the last resort.
Every answer carries provenance: `ENGINE` / `KNOWLEDGE` / `PROJECT` / `MODEL` / `REFUSED`.

**Authority boundary.** AI may write narrative and may never state an electrical value —
a size, a rating, a citation. Enforced by `assertNarrativeOnly`.

**Single source of truth + drift test.** Any number appearing in both copy and code is
written once and read everywhere. Legal policy, allowances and Pro pricing all work this
way, each with a test that fails if a screen hard-codes a value.

**Entitlement is already separated from usage accounting** — exactly as the spec asks:
- `registry.js` — what a tier can *access*
- `ASK_ALLOWANCE` — the replenishing *included* allowance
- `credits.js` — permanent *purchased* balance, one-way migration, never downward

**Kill switch.** `website/app-config.json` → fetched at launch → `applyRemoteConfig` →
feature gate. Fails open on every error path. Safety behaviour is not remotely disableable.

---

## 6. Open risks before launch

1. **Blueprint Takeoff root cause unconfirmed.** Likely payload size: Blueprint captures
   at quality 0.85 (chat uses 0.6); a 12MP photo base64-encoded clears Vercel's 4.5MB
   serverless body limit and is rejected at the edge, so nothing appears in function logs.
   **Test:** photograph a sheet close-up vs from across the room. If the far shot works,
   it is size. An oversized image is now refused before upload and the error names the
   real cause either way.

2. **Server allowances do not match the client.** See §4.

3. **The app calls a `.vercel.app` URL.** `App.js:648` →
   `https://sparkconnect-website.vercel.app/api/ask-nec`. That project has
   `ssoProtection: all_except_custom_domains`. Text answers currently work, so it is not
   blocking today — but it is the only backend URL in the client and should move to
   `sparkconnect.pro`.

4. **No OTA code push.** `expo-updates` was removed (commit `3c18feb`) because it aborted
   launch; `app.json` has `updates.enabled: false`. Code fixes require App Store review.
   The kill switch turns features *off* without one; it cannot push a fix.

5. **7 of 12 NEC datasets remain unverified** against printed 2023 NEC. Citations from
   those render as "Reference — not yet verified" rather than claiming verification.

---

## 7. Built and tested but not wired to any screen

These are complete pure modules with tests, deliberately not surfaced:

`investigation.js` · `wireDetail.js` · `connectFlow.js` · `inspectionPrep.js` ·
`inlineAsk.js` · `credits.js` · `artLayer.js` (awaiting raster art)

The career/apprenticeship module (IBEW / IEC / ABC / direct hire) is wired only as far
as the Hours tracker; its "Getting In" screen does not exist, so the card is
deliberately absent from the Home catalog rather than shipped as a dead link.

---

## 8. What Evan still has to do manually

- Confirm `sparkconnect_lifetime_tools` exists in App Store Connect.
- Decide the Pro allowance (§4) and change `/api/ask-nec` to match.
- Deploy `website/app-config.json` with the site **before** the next build ships, or the
  kill switch has nothing to fetch.
- Run `./scripts/verify-api.sh` from a machine with normal network access.
- Move the `sparkconnect.pro` domain to the app's API project (no API exists for this).

---

## 9. Next pass (not started)

The monetization/paywall rebuild: contextual paywall with a `source` parameter, Pro
repositioned as the whole ecosystem rather than "AI answers plus calculators",
"Query Packs" renamed to "SparkAI Answer Packs" (display only — IDs unchanged), 7-day
trial on annual only and gated on real StoreKit eligibility, and free previews for
Wiring Simulator and Job Site.

**Not started deliberately** — the spec itself requires an audit and an agreed
entitlement matrix before any purchase logic is touched. §4 is that audit, and the Pro
allowance conflict is the decision that blocks it.
