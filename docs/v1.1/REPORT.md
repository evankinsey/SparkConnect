# v1.1 — Engineering Report

Structured per PART 29 (RPT). Covers PART 27 **Phase 1 (audit and plan)** and
**Phase 2 (foundations)**. Phases 3–7 are scoped in
[`REQUIREMENTS.md`](REQUIREMENTS.md) and tracked in [`PROGRESS.md`](PROGRESS.md)
but are not built.

The brief's own instruction for a job this size (L913–915): *"If full
implementation is too large for one safe pass, complete the tested foundations
and the highest-priority vertical slices first. Do not fake completion or leave
partially wired production features active."* That is what this is.

---

## 1. Repository audit summary

| Area | Finding |
|---|---|
| Framework | React Native 0.81.5 / Expo SDK 54, `newArchEnabled: false` |
| Structure | `App.js` is a single **~305 KB** file holding every screen, the theme, the question banks, the calculators and navigation |
| Navigation | Hand-rolled `tab` string + `history` array. No React Navigation |
| Persistence | `AsyncStorage` only. No schema, no versioning, **no migrations** |
| Purchases | `useRevenueCat.js`, `SparkPaywall.js`, and **two overlapping** Pro contexts (`ProContext.js`, `ProGatingContext.js`) plus `useProGating.js` |
| Analytics | 10 ad-hoc events, **none** matching the required taxonomy, and `@segment/analytics-react-native` **is not installed** — so analytics has never fired |
| Superwall | Keys empty; SDK not installed; no placements |
| Backend | **None** |
| Tests | **None** — no runner, no files, no CI |
| Feature flags | **None** |
| Pre-existing damage | A find/replace blanked several UI strings; stray `};` tokens sit at module scope near `App()` |

**Top risks:** (1) untestable monolith, (2) no backend for any payment work,
(3) no migrations guarding existing user data, (4) ambiguous entitlement source
of truth across three files.

## 2. Architecture decisions

Full records in [`DECISIONS.md`](DECISIONS.md).

- **D-01** Stripe is blocked — no backend exists. Client-side Stripe would violate PAY-04/05/06 and SEC-12.
- **D-02** Superwall keys empty — placements defined but not wired.
- **D-03** RevenueCat Android key empty — Android treats everyone as Free.
- **D-04** New logic ships as small pure modules under `src/`; `App.js` is not refactored (NNR-01, L923–926).
- **D-05** Test runner is Node's built-in `node:test` — zero dependencies, no `babel.config.js`, so it cannot break the Metro build.
- **D-06** Every lesson ships disabled pending human electrical review.
- **D-07** Unverified NEC references are labelled, never invented.
- **D-08** Code edition is a per-user setting, never a global "2026 compliant" claim.

## 3. Files added

```
docs/v1.1/REQUIREMENTS.md          Every requirement, stable IDs, traceable to source lines
docs/v1.1/PROGRESS.md              Status per ID
docs/v1.1/DECISIONS.md             Audit, decisions, blockers, open questions
docs/v1.1/REVIEW-CHECKLIST.md      Human technical review gate (REV-09)
docs/v1.1/REPORT.md                This file
docs/v1.1/source/v1.1-brief-extracted.txt   Verbatim brief text, committed

src/circuit/package.json           ESM marker for the test runner
src/circuit/model.js               Components, terminals, conductors, roles (SIM-02, SIM-05…09)
src/circuit/solver.js              Union-find netlist solver, truth tables (SIM-12, SIM-13)
src/circuit/validator.js           9 validation rules, approved failure language (SIM-11, SUX-07)
src/circuit/review.js              Review gate, statuses, disclaimers (REV-06…REV-14)
src/circuit/scoring.js             Hints, scoring, XP, ranks, streaks (SCR-01…SCR-07)
src/circuit/lessons/index.js       5 lesson definitions, all seeded for review
src/flags/package.json             ESM marker
src/flags/core.js                  Pure flag resolution (FLG-01…FLG-13)
src/privacy/package.json           ESM marker
src/privacy/scrub.js               Deny-by-default analytics PII guard (ANL-07, ANL-08)
src/nec/package.json               ESM marker
src/nec/editions.js                Code edition awareness (CODE-01…CODE-08)
src/codeEdition.js                 RN wrapper with persistence
src/dailyQuestions.js              Daily code question bank (previous session)
src/dailyNotifications.js          Daily notification scheduling (previous session)

tests/package.json                 ESM marker
tests/circuit.test.js              25 tests
tests/scoring.test.js              21 tests
tests/foundations.test.js          33 tests
```

## 4. Files modified

| File | Change |
|---|---|
| `src/analytics.js` | Rewritten to the full required taxonomy; every property passes the PII guard; old method names kept as aliases (NNR-02) |
| `src/featureFlags.js` | New — RN wrapper delegating to `flags/core.js` |
| `App.js` | Removed the hardcoded `v1.0 · NEC 2023` splash label (CODE-07); daily-question wiring from the previous session |
| `package.json` | Added `"test": "node --test tests/*.test.js"` |
| `README.md` | Daily reminder documentation (previous session) |

## 5. Dependencies added

**None.** Deliberate — see D-05. The only dependency change in this branch is the
`expo-notifications` version correction from the previous session.

## 6. Database / storage changes

**None yet, deliberately.** DAT-02 (versioned models and migrations) has not
landed, and DAT-03 forbids risking existing local invoices, estimates, Job Cam
projects, preferences, purchase state and quiz progress. Shipping a new persisted
shape before the migration layer would invert the conflict priority order
(data preservation ranks 4th; convenience does not rank).

New keys written this session are additive and non-destructive:
`@sc_flags_remote_v1`, `@sc_flags_local_v1`, `@sc_code_edition`.

## 7. Migrations

None. **This is the highest-priority next work** — see PROGRESS.md "Next session".

## 8. Circuit lessons implemented

| Lesson | States | Status |
|---|---|---|
| `single-pole-source-at-switch` | 2 | Engine-tested, awaiting review |
| `single-pole-source-at-light` | 2 | Engine-tested, awaiting review |
| `three-way-source-at-switch` | 4 | Engine-tested, awaiting review |
| `three-way-source-at-light` | 4 | Engine-tested, awaiting review |
| `four-way-three-location` | 8 | Engine-tested, awaiting review |

Remaining per LSN-05…LSN-10: three-way troubleshooting, four-way troubleshooting,
switched receptacle, GFCI line/load, basic receptacle, panel identification.

## 9. Truth-table and validation tests

**79 passing.** `npm test`

Circuit (25): every solution validates · structural snapshot · single-pole 2-state
· both single-pole topologies agree · three-way XOR across 4 states · both
three-way topologies agree · four-way 8 states with parity behaviour · four-way
straight/cross distinguishable · common-terminal reversal rejected · open traveler
rejected · traveler crossover accepted as equivalent · missing neutral rejected ·
missing switched leg rejected · line-neutral short detected · duplicate connection
flagged · self-loop rejected · split traveler pair rejected · missing EGC rejected ·
colour cannot fix a broken circuit · failure language allowlist + no injury words ·
5 review-gate tests.

Scoring (21): first-attempt bonus · wrong-attempt, hint, reset deductions · hint
charged once · time bonus scaling and cap · Learn Mode has no time bonus · minimum
score bound · rank order and boundaries · disclaimer on every rank · streak
increment, reset, same-day, month boundary · progress metrics · no XP farming ·
hint graduation and penalties.

Foundations (33): 11 flags present · dangerous defaults off · payment flags cannot
be forced on remotely or locally · remote kill-switch both directions · dev
overrides ignored in production · malformed payload rejected · every lesson flag
real and off · 9 PII-guard tests · amount bucketing · id hashing · 12 code-edition
tests including "no label claims compliance" and "no 2026 content fabricated".

## 10. Lessons awaiting human technical review

**All five.** `productionLessons()` returns `[]`, asserted by test. See
[`REVIEW-CHECKLIST.md`](REVIEW-CHECKLIST.md). Needed: a qualified electrician or
instructor (DECISIONS.md Q4).

## 11. Invoice workflow changes

None. INV-01…INV-06 are specified in the register and blocked behind migrations
(item 7).

## 12. Stripe work completed

**None, by design.** See D-01. What was done instead: `stripeConnectEnabled`,
`customerPaymentsEnabled` and `platformFeesEnabled` exist, default off, and are
**hard-locked** so no remote payload or dev override can enable them. Tests prove it.

## 13. Stripe dashboard / manual configuration still required

Everything. Before any PAY-* work can begin: a backend service, a Stripe account
with Connect enabled, Express account configuration, a webhook endpoint with a
signing secret, and a hosted domain for the customer payment page (PAY-20).

## 14. Environment variables required

None added this session. When PAY-* begins, these belong **server-side only**
(PAY-05, NNR-06): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`STRIPE_CONNECT_CLIENT_ID`. The client may hold only a publishable key.

Currently committed in `src/config/keys.js`: `REVENUECAT_IOS_KEY`. RevenueCat
iOS keys are publishable and safe to ship in a client bundle, so this is not a
leak — but `REVENUECAT_ANDROID_KEY`, `SUPERWALL_IOS_KEY` and
`SUPERWALL_ANDROID_KEY` are empty and must be supplied (Q2, Q3).

## 15. Webhook deployment steps

Not applicable — no backend (D-01).

## 16. RevenueCat / Superwall work completed

None. Both are blocked (D-02, D-03). No entitlement logic was changed, so
existing purchase behaviour is untouched (NNR-01, NNR-03, NNR-04).

## 17. Analytics events added

All required events implemented in `src/analytics.js`: 4 APP, 4 TOOLS, 11
TRAINING, 13 INVOICE, 6 PDF/export, 6 ONBOARDING, 14 PAYWALL/MONETIZATION, 2
SHARE CARD. Plus the PII guard (ANL-07) and 8 backwards-compatible aliases.

**Caveat (DOD-15 honesty):** the provider is not installed, so these are no-ops
today. The taxonomy and the privacy guard are real and tested; connecting a
provider is a one-line change with no call-site churn.

## 18. Feature flags added

All 11 from FLG-01…FLG-11. Ten default **off**; only `updatedLightThemeEnabled`
defaults on. Three payment flags are hard-locked off.

## 19. Security review findings

| Finding | Severity | Status |
|---|---|---|
| No backend, so no server-side verification exists for anything (SEC-12) | — | Blocked, D-01 |
| Analytics could have leaked customer PII once invoice events were wired | High | **Fixed** — deny-by-default guard, 9 tests |
| Feature flags could have enabled a half-wired payment path | High | **Fixed** — hard-lock, tested |
| `REVENUECAT_ANDROID_KEY` empty → Android users silently treated as Free | Medium | Blocked, D-03 |
| Exact invoice amounts and ids in analytics would be quasi-identifiers | Medium | **Fixed** — bucketing + hashing |
| `src/config/keys.js` commits the RevenueCat iOS key | Informational | Publishable by design; no action |
| Pre-existing: no ownership checks anywhere (no server to hold them) | — | Blocked, D-01 |

## 20. Test results

```
$ npm test
# tests 79
# pass 79
# fail 0
```

## 21. iOS test status

**Not run.** No iOS toolchain or device in this environment. All new code is pure
JS with no native surface, and `App.js` was verified to parse. This is an honest
gap against DOD-08/DOD-12, not a claim of success.

## 22. Android test status

**Not run.** Same reason.

## 23. Known limitations

1. No lesson is user-visible until human electrical review (intended — D-06).
2. Analytics events are no-ops until a provider is installed.
3. No UI was built for the circuit engine — the engine is complete and tested, the simulator screen is not.
4. `SIM-05 testVectors[]` is computed rather than stored per lesson.
5. UI/component tests (TST-06) are not possible with the chosen runner.
6. `CODE-03` — the surfaces are enumerated and asserted, but wiring each screen to render the edition label is UI work not yet done.
7. `CODE-04` categories ship with empty content, on purpose (REV-13).
8. iOS/Android verification not performed.

## 24. Deferred work

Phases 3–7: remaining 6 lessons, simulation UI, invoice/estimate state machines,
PDF audit, role onboarding, first-win flow, paywall redesign, share cards, review
prompts, the 14 UI fixes, bender database, wire-pull planner, motor/transformer
tools, adaptive study. v1.2 Motor Controls and v1.3 PLC are out of scope by the
brief's own roadmap (ROAD-02…ROAD-04).

Every item carries an ID in `REQUIREMENTS.md` and a row in `PROGRESS.md`.

## 25. Production rollout checklist

This branch is **safe to merge and ship as-is** — it adds no user-visible
behaviour beyond the splash label removal and the daily-question fixes.

1. `npm test` → 79 passing
2. `npx expo start` — confirm the app boots and the splash renders without the version label
3. Confirm every feature flag reads its default (`allFlags()` — ten false, one true)
4. Confirm the Learn tab shows no wiring lessons (`productionLessons()` is empty)
5. Build iOS + Android; smoke-test the existing calculators, Job Cam, quiz, paywall
6. Verify existing purchases still restore (no entitlement code changed)
7. Ship

Before enabling any training lesson: complete `REVIEW-CHECKLIST.md`, apply
approval through `applyHumanApproval()`, then enable the flag remotely.

Before enabling payments: resolve D-01 in full. Do not enable on test-mode
credentials (DOD-15).

## 26. Rollback procedure

**Whole branch:** `git revert` the merge commit. New modules are additive and
nothing imports them from a render path except the splash edit, so a revert
restores previous behaviour exactly. No migration ran, so no data rollback exists.

**Single feature, no rebuild (FLG-13):** push a remote flag payload setting the
offending flag false; the client caches and applies it on next launch.

**Single lesson:** set `productionApproved: false` or flip its feature flag off.
Either gate alone removes it.

**Storage keys** if a clean slate is needed: `@sc_flags_remote_v1`,
`@sc_flags_local_v1`, `@sc_code_edition`. Removing them restores defaults; none
holds user content.
