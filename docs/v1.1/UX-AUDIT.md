# UX Audit — every screen

Based on reading all ~305 KB of `App.js`. Format per screen: what's wrong, what it
costs, what to do. Severity: **P0** losing money or trust now · **P1** next release ·
**P2** polish.

---

## Splash

| Sev | Issue | Fix |
|---|---|---|
| P1 | Showed `v1.0 · NEC 2023` — made the app look two years stale to anyone who knows the code cycle | **Fixed.** Removed |
| P2 | Floating feature pills during load — nobody reads marketing on a splash they've seen 40 times | Brand mark only |
| P2 | Runs full length on every launch | Cap at ~800 ms, skip entirely on warm start |

## Onboarding

| Sev | Issue | Fix |
|---|---|---|
| P0 | Never asks who the user is, so Home is identical for an apprentice and a contractor | Role question (ONB-02); model built |
| P0 | No first-win. Dumps into a feature list before demonstrating value | "What do you need to do first?" → route to that tool |
| P1 | Notification permission requested at accept — a prompt before the user knows what they'd get | Ask after the first Daily Question is answered |
| P2 | No progress indicator | Dots |

## Home

| Sev | Issue | Fix |
|---|---|---|
| P0 | Daily Question dominates the fold. Everything else is below it | Reorder: continue → role action → daily question → AI → tools |
| P0 | Nothing resumes. Close the app mid-estimate and it's gone | "Continue where you left off" |
| P1 | Four hardcoded tools regardless of who you are | Role-driven |
| P1 | Streak is computed but barely shown | Streak + XP + rank in the header |
| P2 | Notification opt-in card reappeared every cold start | **Fixed** last session |
| P2 | No empty state for a brand-new user | First-run checklist |

## Calculators (list)

| Sev | Issue | Fix |
|---|---|---|
| P1 | Flat alphabetical list, no grouping, no search, no recents | Group by task; add search; pin recents |
| P1 | No indication which are gated until you tap and hit a wall | Badge locked ones up front |
| P2 | No favourites | Long-press to pin |

## Pipe Bending

| Sev | Issue | Fix |
|---|---|---|
| P0 | Results give a number but not the marks. Competitors give mark 1 / centre / mark 3, distances, direction, shrink, developed length | Full mark-out output (UI-12) |
| P0 | No bender-specific take-up. QuickBend's entire credibility claim | Bender database (#17) |
| P1 | EMT take-up reference shown under a 3-point saddle result — unrelated to the current task | Collapsible Reference section |
| P1 | Diagram is generic; doesn't reflect entered numbers | Draw to scale with labelled marks |
| P2 | No way to save a bend | Saved calculations |

## Spark AI

| Sev | Issue | Fix |
|---|---|---|
| P0 | Completely disconnected from the rest of the app. You calculate voltage drop, switch tabs, and re-type everything | Context builder — **built** (`src/core/ai/context.js`) |
| P0 | No entry point from any calculator | "Explain This" on every result |
| P1 | Header text wraps into a narrow column because counters eat the row | Title / subtitle / counters, chips below |
| P1 | Mode chips too long; "General" + welcome text every session | Ask · Code · Troubleshoot · Explain |
| P1 | No history, no saved answers | Searchable AI history (Pro) |
| P2 | Free counter reads as a scold | "2 answers left today" framing |

## Learn

| Sev | Issue | Fix |
|---|---|---|
| P0 | A large grey **COMING SOON** box. The single worst thing in the app — it says "we ran out of time" on a paid product | Replace with Wiring Lab, Daily Streak, Continue Quiz, Weak Areas, 2026 Changes, Motor Controls (Coming Next) |
| P1 | No sense of progression | Rank + XP + completion % |
| P2 | Locked items show no preview | Preview + reason |

## Code Quiz

| Sev | Issue | Fix |
|---|---|---|
| P1 | No weak-area tracking. Same questions regardless of what you keep missing | Accuracy by category → targeted practice |
| P1 | No missed-question review | Review queue |
| P1 | 171 questions vs competitors' 1,200–3,000 | Grow deliberately, not to 3,000 mediocre ones |
| P1 | No edition filter | `matchesEdition()` built, needs `editions` on the bank |
| P2 | Score history is a single line | Trend chart |
| P2 | Quiz size 5/10/25 only | Custom + "quick 3" |

## Job Cam

| Sev | Issue | Fix |
|---|---|---|
| P0 | Empty state is a large blank area — teaches nothing about why this exists | Project templates + suggested photos (UI-10) |
| P1 | No folders, tags, or search. Unusable past ~50 photos | Folders, tags, favourites |
| P1 | Photos aren't tied to an invoice or estimate | Link to job |
| P2 | No before/after pairing | Pair + share card |
| P2 | No voice notes | Attach audio |

## Estimates / Invoices

| Sev | Issue | Fix |
|---|---|---|
| P0 | No status model — a draft, a sent estimate and an accepted one look the same | State machines **built** |
| P0 | No estimate→invoice conversion. Retyping is where contractors quit | `convertEstimateToInvoice()` **built** |
| P0 | Money in floats. Cent drift on a customer-facing document destroys trust | Integer cents **built** |
| P0 | No payment recording at all | Payments + deposits + partials **built** |
| P1 | Sequential numbers used as identity | Random token identity **built** |
| P1 | Nothing warns when the invoice drifts from the accepted estimate | `materialDifference()` **built** |
| P1 | PDF failures are silent | Fail loudly with the stage |
| P2 | No duplicate | `duplicate()` **built** |

## Settings

| Sev | Issue | Fix |
|---|---|---|
| P0 | Large Pro card is a second, differently designed checkout competing with the paywall | Status summary that opens the same paywall |
| P1 | Notification toggle defaulted ON while nothing was scheduled | **Fixed** |
| P1 | Several blank labels from an old find/replace | **Fixed** |
| P1 | No code edition selector | Built, needs wiring |
| P1 | No role selector | With ONB-02 |
| P2 | NEC Edition row is static text "2023" | Make it the real selector |

## Paywall

| Sev | Issue | Fix |
|---|---|---|
| P0 | Dense comparison table before any prices. Users must read a spreadsheet to buy | Headline → workflow line → trial CTA → annual → monthly → 5 ticks → "View full comparison" |
| P0 | Lifetime is visually equal to Pro, so it cannibalises subscription revenue | Lifetime secondary |
| P1 | Monthly presented alongside annual with no anchor | Annual default, show `$4.17/month` |
| P1 | "Priority new features" is a vague promise | Concrete benefit or cut |
| P1 | Orange paywall vs blue app — looks like a different product | Unified palette |

## Global / cross-cutting

| Sev | Issue | Fix |
|---|---|---|
| P0 | **`IS_PRO = false` hardcoded** — no purchase unlocks anything | Wire to the real entitlement |
| P0 | No loading skeletons anywhere; screens pop in | Skeletons |
| P1 | No haptics | On every primary action |
| P1 | Three colour systems (blue app, orange paywall, yellow AI) | One palette with defined roles |
| P1 | Some tap targets below 44 pt | Audit |
| P1 | Light mode is pure white — unreadable in sunlight, which is where this app lives | Off-white base, stronger contrast |
| P2 | No transitions between tabs | Shared-element or fade |
| P2 | No offline indicator | Banner |

---

## The five that matter most

1. **`IS_PRO = false`** — nothing else matters if paying users get nothing.
2. **Learn's "COMING SOON" box** — the clearest signal of an unfinished product, on the tab meant to prove you teach.
3. **Spark AI's isolation** — you have an AI and a dozen calculators that don't know about each other.
4. **Estimate→invoice retyping** — the single workflow contractors will pay to avoid.
5. **Paywall hierarchy** — you're asking people to read a table before showing a price.
