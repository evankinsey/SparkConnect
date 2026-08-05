# v1.1 — Architecture Decisions, Blockers, and Open Questions

Companion to [`REQUIREMENTS.md`](REQUIREMENTS.md). Decisions are permanent records —
supersede them with a new entry rather than editing history.

---

## Repository audit (PART 27 Phase 1 / RPT §1)

What actually exists today, established by inspection:

| Area | Finding |
|---|---|
| Framework | React Native 0.81.5 / Expo SDK 54, `newArchEnabled: false` |
| Structure | **`App.js` is a single ~305 KB file** holding every screen, the theme, the question banks, the calculators, and the navigation |
| Navigation | Hand-rolled `tab` string state + a `history` array in `App()`. No React Navigation |
| Persistence | `AsyncStorage` only, via `safeStorageGet`/`safeStorageSet`. **No schema, no versioning, no migrations** |
| Purchases | `useRevenueCat.js`, `src/SparkPaywall.js`, `ProContext.js`/`ProGatingContext.js` (two overlapping context files), `useProGating.js` |
| Gating | `src/useGating.js` — daily counters for Spark AI (3/day) and calculators (5/day) |
| Analytics | `src/analytics.js` — a thin Segment wrapper with **10 ad-hoc events**, none matching the required taxonomy |
| Superwall | Keys present but **empty** in `src/config/keys.js`; no placements wired |
| Backend | **None. There is no server in this repository** |
| Tests | **None. No test runner, no test files, no CI** |
| Feature flags | **None** |
| Theme | `LIGHT`/`DARK` constants in `App.js`; preference already supports system/light/dark |
| Known damage | A previous find/replace blanked several UI strings; several duplicate `};` tokens sit at module scope near `App()` from an earlier Snack-scope repair |

Risks this creates, in the order they matter:

1. **No tests + one 305 KB file** — any refactor is unverifiable. Hence: new logic goes in
   small, pure, separately testable modules under `src/`, and `App.js` only imports them.
2. **No backend** — every Stripe requirement (PAY-01…PAY-21) is unbuildable here. See D-01.
3. **No migrations** — DAT-02 must land before any new persisted shape ships, or existing
   user invoices/estimates/photos are at risk (DAT-03).
4. **Two Pro context files + a `useProGating` hook** — entitlement truth is ambiguous.
   Must be resolved before training entitlements (TRN-*) are wired.

---

## D-01 — Stripe work is blocked: there is no backend in this repository

**Status:** BLOCKED — needs Evan
**Affects:** PAY-01 … PAY-21, INV (payment portions), EXP-10 (payment_link events), SEC-02…SEC-12, TST-03

The brief requires that all sensitive Stripe operations happen on a backend (PAY-06), that
no secret key, OAuth token, or webhook secret exists in client code (PAY-05, NNR-06), and
that webhooks are the payment source of truth (PAY-11). This repository contains **only the
Expo client**. There is no server, no API route, no webhook endpoint, no deployment target.

Building Stripe payments client-side is not a smaller version of this requirement — it is a
direct violation of PAY-04, PAY-05, PAY-06 and SEC-12, and would fail both the brief and
Apple/Google review.

**Decision:** ship the client-side pieces that are safe and inert without a backend —
the payment-state machines (PAY-09, PAY-10), the invoice/estimate data model (INV-01…INV-06),
and the `stripeConnectEnabled` / `customerPaymentsEnabled` flags defaulted **OFF** (FLG-05,
FLG-06, FLG-12). No network call, no key, no partial payment UI.

**Needed from Evan before PAY work can start:**
1. Where should the backend live? (Existing service? New repo? Supabase/Firebase functions? Vercel/Cloudflare Worker?)
2. Is there an existing Stripe account, and is Connect enabled on it?
3. Is there an existing hosted domain for the customer-facing payment page (PAY-20)?

---

## D-02 — Superwall keys are empty; placements cannot be verified

**Status:** BLOCKED — needs Evan
**Affects:** TRN-08, PWL-02, PWL-05

`src/config/keys.js` has `SUPERWALL_IOS_KEY = ''` and `SUPERWALL_ANDROID_KEY = ''`, and
`react-native-superwall` is not in `package.json`. The six required training placements
(TRN-08) and the four paywall experiments (PWL-02) cannot be wired, let alone tested.

**Decision:** define the placement names as constants and route them through the feature-flag
layer so the wiring is ready, but do not add the SDK or claim the placements work.

**Needed from Evan:** Superwall project keys, and confirmation the six placements exist in the
Superwall dashboard.

---

## D-03 — RevenueCat Android key is empty

**Status:** BLOCKED — needs Evan
**Affects:** TRN-06, DOD-08, TST-04

`REVENUECAT_ANDROID_KEY = ''`. Android entitlements cannot resolve, so any Android build
silently treats every user as Free. This predates v1.1 but blocks DOD-08 for every
entitlement-gated feature.

---

## D-04 — New logic lives in small pure modules, not in `App.js`

**Status:** ACCEPTED
**Affects:** SIM-16, NNR-13, TST-*

`App.js` cannot be meaningfully tested at 305 KB with no test runner. Every v1.1 subsystem
therefore ships as a pure module under `src/` with no React Native imports, so it can be
executed directly by a test runner. `App.js` imports and renders; it does not hold logic.

This satisfies SIM-16 ("separate circuit logic from UI") and is the only way NNR-13
("automated tests for every circuit configuration") is achievable.

**Explicitly not done:** a wholesale refactor of `App.js`. NNR-01/NNR-02 make that a bad
trade — the file works, and breaking it to make it pretty is the failure mode the brief warns
about at L923–926 ("Do not replace working architecture merely because you prefer another
pattern").

---

## D-05 — Test runner: Node's built-in `node:test`, zero new dependencies

**Status:** ACCEPTED
**Affects:** NNR-13, TST-01, TST-02, REV-01…REV-04

Options considered:

| Option | Verdict |
|---|---|
| `jest` + `jest-expo` | Conventional, but requires adding `babel.config.js`. This repo has none (it came from Snack), and Expo's Metro pipeline currently supplies its own defaults. Introducing one risks breaking the app build — a direct NNR-01 violation — and it cannot be verified in this environment |
| `node --test` on pure ESM modules | No dependencies, no config files, no Babel, cannot affect the Metro build |

**Decision:** `node --test`. The circuit engine and scoring modules are pure ESM `.js` with
no RN imports. `src/circuit/package.json` contains only `{"type":"module"}` so Node resolves
them as ESM; Metro never reads it, because every import is an explicit file path
(`./src/circuit/solver`), never a directory import.

**Consequence:** React component tests (TST-06 UI) are out of scope for this runner and are
tracked as deferred. Revisit when `babel.config.js` can be added and verified against a real
Expo build.

---

## D-06 — Lessons ship disabled. All of them.

**Status:** ACCEPTED
**Affects:** REV-08, REV-10, REV-14, DOD-13, DOD-16, NNR-08, NNR-11

Every lesson definition created in this work is seeded `technicalReviewStatus:
NEEDS_ELECTRICAL_REVIEW` and `productionApproved: false`. The catalog function filters on
both (REV-08), so **no lesson is reachable in a production build** regardless of feature-flag
state.

This is not a placeholder to be flipped later by an engineer. REV-10 and DOD-16 forbid
populating reviewer names or approval dates without an actual qualified reviewer. Passing
truth-table tests satisfies REV-01/REV-02 and moves a lesson to `ENGINEERING_TESTED` — it
does **not** move it to `APPROVED` (REV-14: "No electrical simulation may be production-enabled
merely because tests pass").

**Needed from Evan:** a qualified electrician or instructor to work through
[`REVIEW-CHECKLIST.md`](REVIEW-CHECKLIST.md) per lesson.

---

## D-07 — NEC citation policy: cite only what is verified

**Status:** ACCEPTED
**Affects:** REV-13, AI-06, NNR-08

REV-13 forbids inventing section numbers. Where a lesson or explanation needs a reference
that is not in the verified knowledge base, it carries a general reference label plus
`referenceNeedsReview: true` rather than a fabricated citation.

---

## D-08 — Code edition is a user setting, never a global claim

**Status:** ACCEPTED
**Affects:** CODE-01 … CODE-08

Adoption is fragmented (6 states on 2026, 20 on 2023, 15 on 2020 as of Aug 3 2026). The app
therefore stores a per-user adopted edition and labels results with it (CODE-06), rather than
relabelling the product "2026 compliant" the way competitors do (CODE-01).

`2023` remains the default because it is the most-adopted edition, and `unsure` is a
first-class value that triggers a prompt rather than silently guessing.

---

## Open questions for Evan

| # | Question | Blocks |
|---|---|---|
| Q1 | Where should the backend live, and does a Stripe account with Connect exist? | All of PAY-* |
| Q2 | Superwall project keys + confirmation the 6 training placements exist? | TRN-08, PWL-02 |
| Q3 | RevenueCat Android key? | Android entitlements entirely |
| Q4 | Who is the qualified reviewer for wiring lessons? | Every LSN-*, D-06 |
| Q5 | Does Lifetime get the foundational simulation pack? Brief *recommends* yes (TRN-02) but says "decide carefully" — this is a revenue decision, not an engineering one | TRN-02 |
| Q6 | Which paywall experiment (A/B/C/D) should be the v1.1 default? | PWL-02 |
| Q7 | Confirm the 2026 NEC change content — this must come from a verified source, not generated (REV-13) | CODE-04 |
