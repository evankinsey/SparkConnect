# Technical Debt Report

Ranked by risk × likelihood of biting you. "Cost" is rough engineering days.

---

## Critical

### TD-01 — `IS_PRO = false` is hardcoded in `App.js`
Around line 552. Whatever RevenueCat returns, the UI treats everyone as Free.
Any purchase that has ever been made unlocked nothing.
**Cost:** 2–3 days (touches every gated surface, needs a real purchase test).
**Fix:** wire to the RevenueCat entitlement, route through one `useEntitlement()` hook.

### TD-02 — Three sources of truth for entitlement
`ProContext.js`, `ProGatingContext.js`, `useProGating.js` and `useRevenueCat.js` all
exist. Nothing indicates which wins. A gating bug here is invisible until a customer
complains.
**Cost:** 2 days. **Fix:** delete two, keep one, add tests.

### TD-03 — Two key configurations
`src/config/keys.js` holds a real iOS key; `App.js` holds `'YOUR_IOS_KEY_HERE'`.
**Cost:** half a day. **Fix:** single source, validated by `npm run config:check`.

### TD-04 — `App.js` is ~305 KB in one file
Every screen, the theme, the question banks, the calculators and navigation. Nobody
can safely change anything, two people cannot work in it at once, and Metro
re-parses the whole thing on every edit.
**Cost:** 8–12 days incremental. **Fix:** extract one screen per PR, lowest-risk
first (Settings → Formulas → Wire Colors → …). Do **not** attempt in one pass.

---

## High

### TD-05 — No component/UI tests
141 tests cover pure logic; zero cover a React component. Chosen deliberately
(D-05) to avoid adding `babel.config.js` blind, but it is still a gap.
**Cost:** 2 days. **Fix:** add `jest-expo` + `babel.config.js`, verify against a real
Expo build *before* committing, then component tests for the gated surfaces.

### TD-06 — No CI
Tests exist and nothing runs them.
**Cost:** 2 hours. **Fix:** GitHub Action on push: `npm test`, `npm run config:check`.

### TD-07 — Stray `};` tokens at module scope near `App()`
Left from an earlier Snack-scope repair. The file parses, but it signals damaged
structure and will confuse the next person.
**Cost:** 1 hour with care. **Fix:** trace the real scope and remove.

### TD-08 — Blanked UI strings from an old find/replace
Several fixed this session; assume more remain in untouched screens.
**Cost:** 2 hours. **Fix:** grep for `>{''}<`, `label=""`, `'⚡ '`.

### TD-09 — Analytics provider not installed
`@segment/analytics-react-native` is required in code but absent from
`package.json`, so every event is a no-op. The taxonomy and PII guard are real and
tested; only the transport is missing.
**Cost:** half a day. **Fix:** install, or swap to another provider — the call sites
don't change.

### TD-10 — No error boundary
One render error white-screens the whole app.
**Cost:** 2 hours. **Fix:** top-level boundary with a recovery action.

---

## Medium

### TD-11 — Four ESM marker `package.json` files
`src/circuit`, `src/flags`, `src/privacy`, `src/nec` each carry one; newer code uses
a single `src/core/package.json`. Works, but inconsistent.
**Cost:** 2 hours. **Fix:** move the four under `src/core/` and update imports.

### TD-12 — `useProGating.js` is 25 KB
Large enough to hide bugs. Folds into TD-02.

### TD-13 — No `.nvmrc` / engines field
Node version is unpinned; `node --test` needs ≥ 18.
**Cost:** 10 minutes.

### TD-14 — Question banks live in `App.js`
`getExamQuestions` and its data sit in the monolith. The daily-question bank was
extracted; the exam bank was not.
**Cost:** half a day.

### TD-15 — No image optimisation in Job Cam
Full-resolution photos in AsyncStorage-adjacent storage will hit device limits.
**Cost:** 1 day. **Fix:** resize on capture, thumbnail separately.

### TD-16 — `package-lock.json` present, `node_modules` never installed here
Unverified whether the lock file matches `package.json` after the
`expo-notifications` bump.
**Cost:** 10 minutes. **Fix:** `npm install` and commit the updated lock.

---

## Low

- **TD-17** README is still the Expo Snack boilerplate above the section I added.
- **TD-18** No `CHANGELOG.md`.
- **TD-19** No lint config — no ESLint, no Prettier, inconsistent quote style.
- **TD-20** `assets/snack-icon.png` is unused.
- **TD-21** No TypeScript. Not urgent, but `documents.js` and `money.js` would
  benefit most and are new enough to convert cheaply.
- **TD-22** Feature flags have no UI. A dev screen would help testing.

---

## Recommended order

1. TD-03 (half day) — makes TD-01 diagnosable
2. TD-01 (3 days) — **revenue**
3. TD-02 (2 days) — prevents TD-01 recurring
4. TD-06 (2 hours) — stops regressions
5. TD-09 (half day) — you cannot improve what you cannot measure
6. TD-10, TD-07, TD-08 (1 day)
7. TD-05 (2 days) — before touching TD-04
8. TD-04 (ongoing, one screen per PR)
