# SparkConnect — status update

Everything since the last handoff. 21 commits, `main` at `2519881`.
**1163 tests passing, 75/75 content checks.**

---

## 1. THREE BUGS THAT ARE LIVE RIGHT NOW IN 1.0 (26)

Read this section first. Everything else is features.

### SparkAI has been discarding every answer it receives

The most serious thing found. Three numbers:

| Where | Value |
|---|---|
| `App.js` | `confidence: 0.8` hardcoded on every backend answer |
| `src/core/ai/sparkai.js` | `confidence: 0.5` default when the backend reports none |
| `src/core/content/authority.js` | `CONFIDENCE_FLOOR = 0.85` |

`sealAnswer()` refuses anything below the floor. So the backend answered, the
client binned it, and the user saw *"not confident enough to answer."* **Both**
fallback paths were under the line, so fixing one wouldn't have helped.

This is why SparkAI looked like it was refusing everything. It wasn't being
cautious — the answer was already fetched and being thrown away.

**Fixed.** A model that *reports* low confidence is still refused; silence now
means the floor has nothing to judge. A test reads `App.js` and fails if any
confidence literal drops below the floor.

### Onboarding was imported and never rendered

`src/OnboardingFlow.js` was imported at `App.js:8` and never mounted — the app
showed a disclaimer-only screen instead. Consequences since launch:

- `@sc_role` has **never** been written, so `layoutForRole()` fell through to the
  default for every user who ever installed
- two of its six roles (`master`, `diy`) weren't keys in `ROLE_LAYOUTS` anyway

### The branch had broken purchases

Not in the store build, but it would have shipped. `iOS 1.0 (26)` sells via
`components/PaywallScreen.js`, which **never passes a subscription identifier to
`getProducts`** — subscriptions come from the Offering, `getProducts` gets the
three consumable pack IDs only. The branch asked for everything at once,
including `sparkconnect_pro_annual`, which does not exist in App Store Connect.
Reverted to the shape that works, with a test enforcing it.

---

## 2. BUILD 29 IS READY

`app.json` said 28 — **28 is already in App Store Connect** (the build with the
purchase failure). Resubmitting it is rejected at upload. Now `1.3.0 (29)`.

Ship with `bash scripts/ship.sh` — refuses to build unless the tree is clean,
tests pass, `App.js` bundles, and legal pages are in sync.

---

## 3. NEW ENGINES

All pure modules, tested, **not yet wired to screens** unless noted.

**`src/core/training/investigation.js`** — troubleshooting as a service call.
Complaint → walk in → meter → kill it and ring out → open the boxes. Because
`contrast()` already knows which step separates any two faults, the candidate set
is honest at every stage, so grading reports `DEDUCED` / `LUCKY` / `READ_OFF` /
`WRONG`. *"Right answer — but 4 faults still fitted what you knew"* is something
no quiz can say. Continuity on a live circuit is refused and reported above the
score.

**`src/circuit/wireDetail.js`** — tap a conductor, see what a meter reads,
solved per switch position. Derives the two readings that actually confuse
people: `PULLED_LOW` (a switched leg with the switch off is tied to neutral
through the lamp — solid zero, not floating) and `BACKFED` (line voltage on a
white conductor through an open neutral). An open conductor is never described
as "reads 0 V".

**`src/circuit/connectFlow.js`** — tap-to-connect. Expert mode highlights the
held end and **nothing else**; guided mode narrows to devices, never a single
terminal. Building it wrong is allowed.

**`src/core/field/inspectionPrep.js`** — 14 corrections that actually get written
up, each checkable with a tape measure. Turnaround stays a *question* with a
field to record the answer; a test bans any turnaround figure from the module.

**`src/core/ai/inlineAsk.js`** — asking SparkAI from inside a feature no longer
navigates away. A request carries an origin; the answer returns to it (FILL /
BUBBLE / PANEL). A test asserts nothing ever returns a navigation target.
Answers survive app-switching. Anything filled into a field is `SUGGESTED`.

**`src/core/paywall/credits.js`** — Spark Credits ledger. **`CREDITS_ENABLED` is
still false.** Idempotency keys on every grant and spend, purchased credits
never expire (enforced, not documented), included allowance always spent first,
remote price changes clamped to a build-declared ceiling. Legacy migration is
one-way and never downward — `sparky_answers_10` grants **fifteen**, so reading
the identifier would have silently taken five answers from every buyer.
See `docs/v2/STORE-CONFIGURATION-REQUIRED.md`.

---

## 4. SHIPPED UI CHANGES

- **Home stopped keeping score** — XP, level, jobs-logged removed. Streak stays.
  Game XP untouched.
- **Projects** leads with *"Photograph it before it gets covered"* instead of
  reading like paperwork for a PM.
- **Onboarding rebuilt** — every question declares an `effect` and a test fails
  if nothing consumes it. Two questions, role choice shows what it changed
  immediately, real daily code question as the value moment. Disclaimer is
  **first**, and `orderingFault()` fails if anything electrical precedes it.
  No countdowns, no fake progress, no invented statistics — a test bans each.
- **Job Site** — every room is a different scene (a test fails if two rooms have
  the same prop composition), slab marks, daylight pools, dust. D-pad origin
  clamped so it can't run off-screen.
- **SparkAI refusals** name SparkAI, say the refusal was a choice, and carry a
  reserved **Report** action.

---

## 5. WEBSITE — LIVE AT sparkconnect.pro

Rebuilt from scratch. Self-contained, no build step, no external requests.

**Deploys itself:** a root `vercel.json` with `outputDirectory: "website"` means
Vercel runs no build and serves that folder. Root Directory and Production
Branch — both dashboard-only settings with no API — are now irrelevant. Push to
`main`, site updates.

**Safe because** `sparkconnect-website` (which serves `/api/ask-nec`) is **not
git-connected** — all 20 of its deployments were direct uploads. Verified before
merging.

Deliberately not published: download counts, star rating, a per-feature pricing
table (three `PRICING_DISCREPANCIES` still OPEN), exact free-tier limits.
Proof strip uses real product numbers instead — 23 tools, 270 scenarios,
51 citations, **5 of 12 tables verified against the printed 2023 NEC**.

---

## 6. ONE PRIVACY POLICY FOR BOTH PLATFORMS

There were two, and they disagreed about the sentence that matters most:

- the **app** disclosed that questions and photos reach a **third-party AI
  service provider**. The **website** did not, and implied they stopped at our
  backend.
- the **website** disclosed the device identifier sent with every request. The
  **app** never mentioned it.

Both gaps closed. `src/core/legal/policy.js` is now the only copy — the app
renders it, `scripts/build-legal-pages.mjs` generates the web pages, and
`tests/legal.test.js` asserts the committed HTML is byte-identical, that every
field the payload sends is disclosed, that "exactly two network calls" still
means two `fetch(` sites, and that no analytics SDK is imported.

**Add a third network call and the test suite fails** before the policy becomes
untrue.

`docs/v2/STORE-PRIVACY-DECLARATIONS.md` has the App Store and Play answers. The
one people get wrong: Play's **"shared" is Yes** for all three data types.

---

## 7. OPEN — NEEDS EVAN

1. **⚠️ Vercel SSO protection.** `ssoProtection: enabled,
   all_except_custom_domains` on the account. The app calls
   `sparkconnect-website.vercel.app/api/ask-nec` — a `.vercel.app` URL. **Check
   it on cellular with wifi off.** If that's blocking real devices, SparkAI is
   down for everyone and the confidence fix won't help.
2. **Confirm the annual subscription's real product ID** in App Store Connect,
   and whether `sparkconnect_lifetime_tools` exists at all.
3. **Move `sparkconnect.pro`** to the `spark-connect` project (Settings →
   Domains on each). No API for this.
4. **Three OPEN `PRICING_DISCREPANCIES`** — the shipped paywall and the shipped
   gates disagree about calculators and about what Lifetime includes.
5. **7 of 12 NEC datasets still unverified** — 310.16, 310.15(C)(1), 250.66,
   250.122, Ch.9 Tables 4 and 5, the citation register.
6. Store products for Spark Credits, if/when that goes live.
