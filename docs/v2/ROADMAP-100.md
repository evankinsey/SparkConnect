# SparkConnect — 100 Feature Roadmap

Scored 1–10. **Impact** = value to the user. **Effort** = engineering cost (10 = hardest).
**Rev** = revenue. **Ret** = retention. **Viral** = organic growth potential.
**Tier** = Free / Lifetime / Pro / Ops (internal).

Sorted within each band by `(Impact + Rev + Ret + Viral) ÷ Effort` — value per unit of work.

---

## Band A — Ship next (highest value per unit of effort)

| # | Feature | Impact | Effort | Rev | Ret | Viral | Tier |
|---|---|---|---|---|---|---|---|
| 1 | Wiring Lab UI on the finished engine | 10 | 6 | 8 | 10 | 9 | Free 1st lesson / Pro rest |
| 2 | Fix `IS_PRO = false` — Pro is hardcoded off today | 10 | 2 | 10 | 5 | 1 | Ops |
| 3 | RevenueCat Android key — paying users get nothing | 10 | 1 | 10 | 6 | 1 | Ops |
| 4 | Daily Field Challenge (rotating: spot the mistake, bend this, which breaker, wire size, troubleshoot, estimate) | 9 | 4 | 5 | 10 | 8 | Free |
| 5 | AI embedded in every calculator result (Explain / Why / Formula / Mistakes) | 9 | 4 | 8 | 8 | 5 | Free 3/day, Pro 20 |
| 6 | Troubleshooting scenarios ("half the house lost power") | 10 | 5 | 8 | 9 | 8 | Pro |
| 7 | Global search across everything | 8 | 3 | 3 | 8 | 2 | Free |
| 8 | Home dashboard — continue where you left off | 8 | 4 | 4 | 9 | 2 | Free |
| 9 | Invoice/estimate UI on the finished state machines | 9 | 6 | 9 | 7 | 3 | Lifetime + Pro |
| 10 | Paywall redesign — annual default, Lifetime secondary | 7 | 3 | 9 | 2 | 1 | Ops |
| 11 | Role-based onboarding + first-win routing | 8 | 4 | 7 | 8 | 3 | Free |
| 12 | Job Cam templates + empty state | 7 | 3 | 4 | 7 | 3 | Free |
| 13 | Share cards (quiz, streak, simulation score) | 6 | 3 | 3 | 5 | 9 | Free |
| 14 | Review prompt after a real milestone | 6 | 2 | 5 | 3 | 8 | Ops |
| 15 | Light mode rework (off-white, sunlight-readable) | 7 | 3 | 3 | 6 | 2 | Free |
| 16 | Saved state + resume for every tool | 7 | 4 | 4 | 8 | 1 | Free basic / Pro history |
| 17 | Bender database (brand, model, take-up, radius, gain) | 9 | 5 | 7 | 7 | 4 | Pro |
| 18 | Code edition selector wired into every screen | 7 | 3 | 5 | 6 | 3 | Free |
| 19 | Remaining 6 wiring lessons (GFCI, receptacle, panel, switched recep, 2× troubleshooting) | 9 | 6 | 7 | 9 | 6 | Mixed |
| 20 | Flashcards with spaced repetition | 8 | 4 | 6 | 9 | 4 | Pro |

## Band B — The business layer

| # | Feature | Impact | Effort | Rev | Ret | Viral | Tier |
|---|---|---|---|---|---|---|---|
| 21 | Stripe Connect backend + hosted checkout | 9 | 9 | 10 | 6 | 3 | Pro |
| 22 | Deposits and partial payments (model done) | 8 | 4 | 9 | 5 | 2 | Pro |
| 23 | Payment timeline + receipts | 7 | 4 | 7 | 5 | 2 | Pro |
| 24 | Material list generator from estimate | 9 | 5 | 7 | 8 | 4 | Pro |
| 25 | Invoice Assistant — "make this sound professional", "upsell surge protection" | 9 | 4 | 8 | 7 | 5 | Pro |
| 26 | PDF export audit — never fail silently | 7 | 4 | 6 | 5 | 1 | Free/Pro |
| 27 | Customer database with job history | 7 | 5 | 7 | 8 | 1 | Pro |
| 28 | Recurring invoices / service agreements | 7 | 5 | 9 | 7 | 1 | Pro |
| 29 | Change orders | 7 | 4 | 8 | 5 | 1 | Pro |
| 30 | Time tracking per job | 7 | 5 | 7 | 7 | 1 | Pro |
| 31 | Multi-user / crew accounts | 8 | 8 | 9 | 8 | 4 | Pro Teams |
| 32 | Expense capture (receipt photo → line item) | 7 | 5 | 6 | 6 | 2 | Pro |
| 33 | Profit-per-job dashboard | 8 | 5 | 8 | 8 | 3 | Pro |
| 34 | Quote-to-cash funnel view | 6 | 4 | 6 | 6 | 1 | Pro |
| 35 | Tax-time export (CSV / accountant pack) | 6 | 3 | 5 | 6 | 1 | Pro |

## Band C — Learning and retention

| # | Feature | Impact | Effort | Rev | Ret | Viral | Tier |
|---|---|---|---|---|---|---|---|
| 36 | **Job-site sim game** — walk a site, do the work, play your social-series characters | 9 | 9 | 7 | 10 | 10 | Pro |
| 37 | "Can You Beat the Apprentice?" 15-second mistake hunt | 8 | 4 | 4 | 8 | 10 | Free |
| 38 | Motor Controls Lab (start/stop, seal-in, F/R, interlock, HOA) | 9 | 8 | 8 | 9 | 6 | Pro |
| 39 | PLC Foundations (ladder editor, timers, counters, latches) | 9 | 10 | 9 | 9 | 7 | Pro |
| 40 | Weakest-topics tracking + targeted practice | 8 | 4 | 6 | 9 | 2 | Pro |
| 41 | Exam prep tracks by state | 8 | 6 | 8 | 8 | 4 | Pro |
| 42 | "What Would You Charge?" weekly game | 7 | 4 | 4 | 8 | 9 | Free |
| 43 | Field Stories — real mistakes, real fixes | 7 | 3 | 3 | 8 | 9 | Free |
| 44 | Leaderboards (friends, shop, region) | 6 | 5 | 3 | 8 | 8 | Free |
| 45 | 10-minute daily study plan | 7 | 3 | 5 | 9 | 2 | Pro |
| 46 | Achievements + badge shelf (engine done) | 6 | 3 | 3 | 8 | 5 | Free |
| 47 | Apprentice career path with completion certificates | 7 | 5 | 6 | 9 | 6 | Pro |
| 48 | Code-navigation drills ("find 210.8 in 30s") | 7 | 4 | 5 | 7 | 3 | Pro |
| 49 | 2026 vs 2023 comparison lessons | 8 | 5 | 6 | 6 | 4 | Pro |
| 50 | Transformer / motor calculation lessons | 8 | 5 | 6 | 7 | 3 | Pro |
| 51 | Wire-pull tension + sidewall pressure planner | 8 | 5 | 6 | 6 | 3 | Pro |
| 52 | Conduit-run builder (multi-bend sequencing) | 8 | 6 | 6 | 7 | 4 | Pro |
| 53 | Voice-driven calculator ("voltage drop, 200 feet, 10 gauge") | 7 | 5 | 4 | 7 | 5 | Pro |
| 54 | Offline-first everything | 7 | 5 | 4 | 8 | 1 | Free |
| 55 | Apple Watch quick reference | 5 | 5 | 3 | 5 | 4 | Pro |

## Band D — Community and network effects

| # | Feature | Impact | Effort | Rev | Ret | Viral | Tier |
|---|---|---|---|---|---|---|---|
| 56 | **Q&A community** (Reddit-style, per-topic) | 9 | 8 | 5 | 10 | 9 | Free |
| 57 | **Jobs board** — apprentices seeking, contractors hiring | 9 | 8 | 8 | 9 | 10 | Free + Pro post |
| 58 | Contractor profiles (model done) | 8 | 5 | 7 | 7 | 7 | Free |
| 59 | Licence lookup + verification badge | 9 | 7 | 7 | 6 | 9 | Free |
| 60 | "Ask the trade" — photo + question to the community | 8 | 5 | 3 | 9 | 8 | Free |
| 61 | Local code-amendment wiki by jurisdiction | 8 | 7 | 5 | 8 | 6 | Free |
| 62 | Shop/company groups | 6 | 6 | 5 | 8 | 6 | Pro Teams |
| 63 | Mentor matching (apprentice ↔ journeyman) | 7 | 7 | 4 | 8 | 8 | Free |
| 64 | Referral program with a real reward | 5 | 3 | 7 | 4 | 9 | Ops |
| 65 | Community-submitted troubleshooting scenarios | 7 | 5 | 3 | 8 | 7 | Free |
| 66 | Reputation / helpful-answer scoring | 5 | 5 | 2 | 7 | 5 | Free |
| 67 | Regional pay-rate transparency | 8 | 6 | 4 | 8 | 9 | Free |
| 68 | Union / non-union resource hub | 6 | 4 | 3 | 6 | 5 | Free |
| 69 | Supplier directory | 6 | 5 | 5 | 5 | 3 | Free |
| 70 | Trade-school partnerships / classroom packs | 7 | 7 | 9 | 7 | 6 | Institutional |

## Band E — Field power tools

| # | Feature | Impact | Effort | Rev | Ret | Viral | Tier |
|---|---|---|---|---|---|---|---|
| 71 | Job Cam AI auto-tagging (panel, rough, trim, underground, EV) | 8 | 7 | 5 | 8 | 5 | Pro |
| 72 | Voice notes on photos | 7 | 3 | 4 | 7 | 2 | Pro |
| 73 | Walkthrough mode — record video, AI timestamps the work | 8 | 8 | 6 | 7 | 7 | Pro |
| 74 | Blueprint reader — detect panels, circuits, symbols | 9 | 10 | 8 | 7 | 8 | Pro |
| 75 | Material scanner — photo of the truck → inventory | 8 | 9 | 6 | 7 | 8 | Pro |
| 76 | Vehicle / tool inventory with serial numbers for insurance | 7 | 5 | 5 | 7 | 3 | Pro |
| 77 | Inspection assistant checklist (model done) | 8 | 4 | 6 | 7 | 4 | Pro |
| 78 | Permit tracking + timeline (model done) | 7 | 5 | 6 | 7 | 3 | Pro |
| 79 | Warranty tracker per installed device | 7 | 4 | 7 | 8 | 2 | Pro |
| 80 | Maintenance reminders (generator, surge, smoke) → recurring revenue | 8 | 5 | 9 | 8 | 3 | Pro |
| 81 | Material price database with regional averages | 9 | 9 | 7 | 8 | 6 | Pro |
| 82 | Panel schedule builder + printable directory | 8 | 5 | 6 | 7 | 4 | Pro |
| 83 | Load calculation (dwelling + commercial) | 9 | 6 | 7 | 7 | 3 | Pro |
| 84 | Arc-flash boundary reference | 7 | 5 | 5 | 5 | 3 | Pro |
| 85 | Torque spec lookup by device | 7 | 3 | 4 | 6 | 3 | Free |
| 86 | Wire-pull crew calculator (people, time, lube) | 6 | 4 | 4 | 5 | 3 | Pro |
| 87 | Trenching / burial depth reference | 6 | 2 | 3 | 5 | 2 | Free |
| 88 | Generator + transfer switch sizing | 7 | 5 | 6 | 5 | 3 | Pro |
| 89 | Solar / battery interconnection helper | 8 | 7 | 7 | 6 | 4 | Pro |
| 90 | EV charger load-management helper | 8 | 5 | 7 | 6 | 5 | Pro |

## Band F — Platform and scale

| # | Feature | Impact | Effort | Rev | Ret | Viral | Tier |
|---|---|---|---|---|---|---|---|
| 91 | Cloud sync + multi-device | 8 | 8 | 7 | 9 | 2 | Pro |
| 92 | Web companion (invoicing on a laptop) | 7 | 8 | 7 | 7 | 3 | Pro |
| 93 | QuickBooks / Xero export | 7 | 6 | 8 | 6 | 2 | Pro |
| 94 | Spanish-first localisation (not just AI replies) | 8 | 6 | 7 | 8 | 6 | Free |
| 95 | Accessibility pass (dynamic type, screen reader, contrast) | 7 | 5 | 3 | 5 | 2 | Free |
| 96 | Component test runner + CI on every PR | 6 | 4 | 2 | 3 | 1 | Ops |
| 97 | Crash + performance monitoring | 6 | 3 | 4 | 6 | 1 | Ops |
| 98 | Remote config console for feature flags | 6 | 5 | 4 | 4 | 1 | Ops |
| 99 | A/B experiment framework beyond paywalls | 6 | 6 | 7 | 5 | 2 | Ops |
| 100 | White-label for trade schools and large contractors | 7 | 9 | 10 | 6 | 3 | Enterprise |

---

## If I could only ship five things

1. **#2 and #3** — `IS_PRO = false` and the missing Android key. You may be losing
   revenue *right now*, from users who already paid. Two days of work, both are
   pure upside, and everything else is worth less until they're fixed.
2. **#1 Wiring Lab UI** — the engine is built and tested. This is the feature
   nobody else has and the one that makes the app shareable.
3. **#4 Daily Field Challenge** — the cheapest retention mechanic you own. Rotating
   formats beat a single question type, exactly as you described.
4. **#5 AI in every calculator** — turns Spark AI from a separate tab people forget
   into something they hit twenty times a day.
5. **#57 Jobs board** — the only item on this list with real network effects. A
   calculator is copyable in a weekend; a hiring network is not.

## On the job-site sim game (#36)

It's the highest-ceiling idea here and I'd build it — but not third. It's a 9/10
effort item that needs the Wiring Lab engine, an art pipeline, and characters your
audience already recognises from the social series. The right sequence is: ship
Wiring Lab → prove people finish lessons → *then* wrap that engine in a world.
Building the world first risks a beautiful game with nothing to do in it.

Cheapest first step that tests the idea: give the existing Wiring Lab a **service-call
framing**. "Mrs. Reyes says the hallway light only works sometimes." Same circuit
engine, same validation, just narrative on top. If completion rates jump, the full
world is justified.

## On the community (#56)

Worth flagging before you build it: an unmoderated forum where electricians give
each other wiring advice is a liability surface, and it's the one part of this app
where a wrong answer can hurt someone. Ship it with answer voting, a visible
"verify with your AHJ" banner on every thread, and the ability to lock a thread —
those are cheap on day one and very expensive to retrofit.

## What I'd cut

- **#55 Apple Watch** — low impact, real maintenance cost, no one asked for it
- **#69 Supplier directory** — becomes stale immediately unless someone owns it
- **#68 Union hub** — politically fraught, no revenue, splits your audience
- **#100 White-label** — only after the core product is undeniably working
