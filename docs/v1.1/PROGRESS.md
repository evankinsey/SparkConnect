# v1.1 — Progress Tracker

Status against every ID in [`REQUIREMENTS.md`](REQUIREMENTS.md). **Update this file
in the same commit as the work.** If a requirement is dropped, mark it `WONTFIX`
with a reason — never delete the row.

Legend: ✅ done and tested · 🟡 partial · ⬜ not started · 🚫 blocked (see `DECISIONS.md`) · ⏸ deferred to a later version

_Last updated: 2026-08-05 · tests: **79 passing** (`npm test`)_

---

## Summary

| Area | Done | Partial | Not started | Blocked | Deferred |
|---|---|---|---|---|---|
| Circuit engine (SIM) | 17 | 2 | 0 | 0 | 0 |
| Lessons (LSN) | 5 | 0 | 5 | 0 | 0 |
| Simulation UX (SUX) | 2 | 0 | 6 | 0 | 0 |
| Scoring (SCR) | 7 | 0 | 0 | 0 | 0 |
| Review gate (REV) | 13 | 1 | 0 | 0 | 0 |
| Training monetization (TRN) | 0 | 2 | 7 | 2 | 0 |
| Payments (PAY) | 0 | 0 | 0 | 21 | 0 |
| Invoices (INV) | 0 | 0 | 6 | 0 | 0 |
| Export (EXP) | 1 | 0 | 9 | 0 | 0 |
| Onboarding (ONB) | 1 | 0 | 11 | 0 | 0 |
| Paywall (PWL) | 1 | 0 | 3 | 1 | 0 |
| Spark AI (AI) | 2 | 1 | 3 | 0 | 0 |
| Saved state (SAV) | 0 | 0 | 5 | 0 | 0 |
| Theme / a11y (THM) | 1 | 1 | 6 | 0 | 0 |
| Growth (GRW) | 0 | 0 | 7 | 0 | 0 |
| Analytics (ANL) | 8 | 0 | 0 | 0 | 0 |
| Data / migration (DAT) | 1 | 0 | 5 | 0 | 0 |
| Security (SEC) | 2 | 0 | 0 | 10 | 0 |
| Testing (TST) | 2 | 0 | 1 | 2 | 1 |
| Feature flags (FLG) | 13 | 0 | 0 | 0 | 0 |
| Code editions (CODE) | 7 | 1 | 0 | 0 | 0 |
| UI (UI) | 1 | 0 | 13 | 0 | 0 |
| New tools (TOOL) | 0 | 0 | 7 | 0 | 0 |
| Roadmap (ROAD) | 1 | 0 | 0 | 0 | 4 |

**This session delivered PART 27 Phase 1 (audit) and Phase 2 (foundations).**
Phases 3–7 are scoped and tracked below but not built.

---

## SIM — Circuit engine

| ID | Status | Evidence |
|---|---|---|
| SIM-01 | ✅ | `src/circuit/solver.js` — one engine, lessons are data |
| SIM-02 | ✅ | `src/circuit/model.js` — components, terminals, conductors, junctions, source, neutral, EGC |
| SIM-03 | ✅ | `solveState()` — switch states, continuity, energized paths |
| SIM-04 | ✅ | `validator.js` — invalid/missing/dangerous configurations |
| SIM-05 | 🟡 | All fields present except `testVectors[]` (truth tables are computed, not stored per lesson) |
| SIM-06 | ✅ | `model.js` component factories |
| SIM-07 | ✅ | `mkTerminal()` — all 7 fields |
| SIM-08 | ✅ | `conductor()` — all 6 fields |
| SIM-09 | ✅ | `ConductorRole` — all 9 roles |
| SIM-10 | ✅ | Test: "colour never makes a circuit correct" |
| SIM-11 | ✅ | 9 validation rules; tests for each failure mode |
| SIM-12 | ✅ | Union-find netlist traversal |
| SIM-13 | ✅ | `enumerateSwitchStates()` — 2/4/8 states verified |
| SIM-14 | ✅ | `truthTable()` + assertions per lesson |
| SIM-15 | ✅ | Test: "traveler crossover still works" |
| SIM-16 | ✅ | Engine has zero React Native imports (D-04) |
| SIM-17 | ✅ | `lessonVersion` on every lesson |
| SIM-18 | ✅ | `featureFlag` per lesson; test asserts all are real flags and default off |
| SIM-19 | 🟡 | Engine is authoritative and separate; the AI call path that must respect it is not built |

## LSN — Lessons

| ID | Status | Notes |
|---|---|---|
| LSN-01 | ✅ | Both topologies built + tested. **Awaiting human review (D-06)** |
| LSN-02 | ✅ | Built + tested. Awaiting review |
| LSN-03 | ✅ | Built + tested. Awaiting review |
| LSN-04 | ✅ | All 8 combinations tested. Awaiting review |
| LSN-05 | ⬜ | Three-way troubleshooting scenarios |
| LSN-06 | ⬜ | Four-way troubleshooting scenarios |
| LSN-07 | ⬜ | Switched receptacle (needs a tab-break model in `model.js`) |
| LSN-08 | ⬜ | GFCI line/load (needs a GFCI device model) |
| LSN-09 | ⬜ | Basic receptacle circuit |
| LSN-10 | ⬜ | Panel / branch-circuit identification |

## SUX — Simulation UX

| ID | Status | Notes |
|---|---|---|
| SUX-01 | ⬜ | Lesson flow UI |
| SUX-02 | ⬜ | 13 controls incl. undo/redo |
| SUX-03 | ⬜ | Physical vs schematic views |
| SUX-04 | ⬜ | |
| SUX-05 | 🟡→✅ | Failure *categories* and messages implemented in `validator.js`; the haptic/pulse/animation presentation is not built |
| SUX-06 | ✅ | Test asserts no failure text contains shock/electrocution/injury language |
| SUX-07 | ✅ | `FailureMessage` — exactly the 6 brief phrases plus 8 more in the same register; test enforces the allowlist |
| SUX-08 | ⬜ | Accessibility toggles UI |

## SCR — Scoring, hints, XP, ranks

| ID | Status | Evidence |
|---|---|---|
| SCR-01 | ✅ | `nextHint()` — 5 graduated levels, cannot skip ahead |
| SCR-02 | ✅ | Exact brief values; 8 scoring tests |
| SCR-03 | ✅ | `TimerMode` Learn/Practice/Challenge |
| SCR-04 | ✅ | Test: Learn Mode awards no time bonus |
| SCR-05 | ✅ | `recordAttempt()` — all 8 tracked metrics |
| SCR-06 | ✅ | 7 ranks in order |
| SCR-07 | ✅ | Test: every rank lookup carries the disclaimer |

## REV — Technical accuracy and review gate

| ID | Status | Evidence |
|---|---|---|
| REV-01 | ✅ | Truth tables for all 5 lessons |
| REV-02 | ✅ | Every solution validates |
| REV-03 | ✅ | 10 invalid-circuit tests |
| REV-04 | ✅ | Structural snapshot test |
| REV-05 | ✅ | Rules documented in `validator.js` + this register |
| REV-06 | ✅ | `seedReview()` — all 7 fields |
| REV-07 | ✅ | All 6 statuses |
| REV-08 | ✅ | `isProductionVisible()`; test proves the gate needs both flags |
| REV-09 | ✅ | [`REVIEW-CHECKLIST.md`](REVIEW-CHECKLIST.md) + `pendingReview()` |
| REV-10 | ✅ | Test: all lessons seeded, no reviewer, no date |
| REV-11 | ✅ | 13-point checklist in `review.js` and the checklist doc |
| REV-12 | ✅ | `TRAINING_DISCLAIMER` verbatim on every lesson |
| REV-13 | ✅ | `verified` flag per reference; test enforces it; 2026 change content ships empty |
| REV-14 | ✅ | Test: "no lesson is production-visible, even though all tests pass" |

## TRN — Training monetization

| ID | Status | Notes |
|---|---|---|
| TRN-01 | ⬜ | Free tier lesson allocation |
| TRN-02 | 🚫 | Business decision — DECISIONS.md Q5 |
| TRN-03 | 🟡 | Documented as a rule; not enforced in code yet |
| TRN-04 | ⬜ | |
| TRN-05 | 🟡 | Captured in the register; no entitlement copy written yet |
| TRN-06 | ⬜ | Needs the ProContext/ProGatingContext ambiguity resolved first (audit finding 4) |
| TRN-07 | ✅ | No unlock-code system exists or was added |
| TRN-08 | 🚫 | Superwall keys empty — D-02 |
| TRN-09 | ⬜ | |
| TRN-10 | ⬜ | |
| TRN-11 | ⬜ | |

## PAY — Stripe payments

**All 21 requirements 🚫 BLOCKED.** No backend exists in this repository — see
`DECISIONS.md` D-01 and Q1. `stripeConnectEnabled`, `customerPaymentsEnabled` and
`platformFeesEnabled` are hard-locked off: `tests/foundations.test.js` proves
they cannot be switched on by a remote payload or a dev override.

## INV / EXP — Invoices, estimates, export

| ID | Status | Notes |
|---|---|---|
| INV-01 … INV-06 | ⬜ | Data model designed in the register; not implemented. Must land with DAT-02 migrations so existing local invoices survive (DAT-03) |
| EXP-01 … EXP-09 | ⬜ | Current PDF path not yet audited |
| EXP-10 | ✅ | All 8 pdf_*/payment_link_* events implemented in `analytics.js` |

## ONB / PWL / AI / SAV — Conversion and workflow

| ID | Status | Notes |
|---|---|---|
| ONB-01 … ONB-09, ONB-11, ONB-12 | ⬜ | |
| ONB-10 | ✅ | All 6 onboarding events implemented |
| PWL-01, PWL-03, PWL-04 | ⬜ | |
| PWL-02 | 🚫 | Needs Superwall — D-02. Flags `firstWinPaywallEnabled` / `roleBasedOnboardingEnabled` exist and default off |
| PWL-05 | ✅ | All 14 paywall events implemented |
| AI-01, AI-04, AI-05 | ⬜ | |
| AI-02 | ✅ | `adoptedCodeContext()` supplies the code-context field of the payload |
| AI-03 | 🟡 | The engine emits everything needed (lesson id, version, findings, hint level); the payload assembler is not written |
| AI-06 | ✅ | Enforced by the same `verified` reference policy as REV-13 |
| SAV-01 … SAV-05 | ⬜ | Blocked behind DAT-02 |

## THM / GRW — Theme, accessibility, growth

| ID | Status | Notes |
|---|---|---|
| THM-01 | ✅ | Appearance already supports System/Light/Dark and defaults to system |
| THM-02 | 🟡 | `updatedLightThemeEnabled` flag exists and is ON; the palette rework itself is not done |
| THM-03 … THM-07 | ⬜ | |
| THM-08 | ✅ | Every validator finding carries `category` + `severity` + `rule`, so colour is never the only signal |
| GRW-01 … GRW-07 | ⬜ | `shareCardsEnabled` flag exists, defaults off; share-card events implemented |

## ANL — Analytics and privacy

| ID | Status | Evidence |
|---|---|---|
| ANL-01 | ✅ | Single provider; no SDK added. **Note: `@segment/analytics-react-native` is not installed, so events are currently no-ops** |
| ANL-02 … ANL-06 | ✅ | Every required event name implemented in `src/analytics.js` |
| ANL-07 | ✅ | `src/privacy/scrub.js` — deny-by-default guard; 9 tests incl. emails, phones, addresses, AI prompts, nested objects |
| ANL-08 | ✅ | `hashId()` for document ids, `amountBucket()` for money |

## DAT / SEC / TST

| ID | Status | Notes |
|---|---|---|
| DAT-01 | ✅ | Audit recorded in `DECISIONS.md` |
| DAT-02 … DAT-06 | ⬜ | **Highest-priority next work.** No new persisted shape should ship before this |
| SEC-01 | ✅ | No secrets added. Pre-existing: RevenueCat iOS key is committed in `src/config/keys.js` — publishable, but see report |
| SEC-02 … SEC-12 | 🚫 | Backend-side — D-01 |
| TST-01 | ✅ | 25 circuit tests |
| TST-02 | ✅ | 21 scoring tests |
| TST-03 | 🚫 | Payments — D-01 |
| TST-04 | 🚫 | Purchases — needs the entitlement ambiguity resolved and an Android key (D-03) |
| TST-05 | ⬜ | Lands with DAT-02 |
| TST-06 | ⏸ | UI tests need a component test runner — D-05 consequence |

## FLG / CODE / UI / TOOL / ROAD

| ID | Status | Evidence |
|---|---|---|
| FLG-01 … FLG-11 | ✅ | All 11 flags; test asserts the exact set |
| FLG-12 | ✅ | Test: every flag but the theme one defaults false |
| FLG-13 | ✅ | `applyRemoteFlags()`; tests prove remote off and remote on both work |
| CODE-01 | ✅ | Test: no label ever claims compliance |
| CODE-02 | ✅ | 4 options incl. "not sure" |
| CODE-03 | ✅ | `EDITION_VISIBLE_SURFACES` — 7 surfaces listed and asserted. **Wiring each screen to render it is UI work, not done** |
| CODE-04 | ✅ | 10 categories, content deliberately empty (REV-13) |
| CODE-05 | ✅ | `REORGANIZATION_NOTE` |
| CODE-06 | ✅ | `resultEditionLabel()` — both label shapes |
| CODE-07 | ✅ | Hardcoded `v1.0 · NEC 2023` removed from the splash |
| CODE-08 | 🟡 | `matchesEdition()` implemented; the question bank has no `editions` field yet |
| UI-01 … UI-13 | ⬜ | |
| UI-14 | 🟡 | Version label removed; timing and feature pills untouched |
| TOOL-01 … TOOL-07 | ⬜ | |
| ROAD-01 | 🟡 | Wiring Lab foundations done, 5 of 10 lessons, no UI |
| ROAD-02 … ROAD-05 | ⏸ | v1.2 / v1.3 by design |
| ROAD-06 | ✅ | Positioning recorded in the register |

---

## Next session — recommended order

Following PART 27, and ordered by the conflict-priority list (safety → correctness → security → data preservation):

1. **DAT-02 … DAT-06 — versioned models and migrations.** Nothing else that persists data should ship first, or existing invoices/estimates/photos are at risk (DAT-03).
2. **LSN-05 … LSN-10** — the remaining 6 lessons, each with truth-table tests, all seeded for review.
3. **SUX-01 … SUX-08** — the lesson UI, against the finished engine.
4. **INV-01 … INV-06 + EXP-01 … EXP-09** — invoice/estimate state machines and the PDF audit. No Stripe.
5. **ONB + PWL + UI** — role onboarding, paywall redesign, the 14 UI fixes.
6. **PAY-*** — only once D-01 is answered.

## Blocked on Evan

| # | Question | Blocks |
|---|---|---|
| Q1 | Backend location + Stripe account with Connect? | All 21 PAY-*, SEC-02…SEC-12, TST-03 |
| Q2 | Superwall keys + 6 placements? | TRN-08, PWL-02 |
| Q3 | RevenueCat Android key? | Android entitlements entirely, TST-04 |
| Q4 | Qualified reviewer for wiring lessons? | All 5 built lessons stay invisible until then |
| Q5 | Does Lifetime get the foundational simulation pack? | TRN-02 |
| Q6 | Which paywall experiment is the v1.1 default? | PWL-02 |
| Q7 | Verified source for 2026 NEC change content? | CODE-04 content |
