# sparkconnect-website — copy for v1.3.0

Written against what actually ships in build 28. Nothing here describes a
feature that is not in the binary, and the beta surfaces are labelled as beta.

**Do not touch `/api/ask-nec` or `/api/transcribe`.** The shipping app calls
them. A broken deploy on that project takes SparkAI down for every user on the
live build, including the ones who paid for it.

---

## The positioning question, first

The site has three jobs and they are not equally important.

1. **Serve the API.** Already does. Leave it alone.
2. **Convert to the App Store.** A landing page.
3. **Be findable.** This is the one worth building.

An Expo app cannot appear in a Google result. Someone searching *"verify
electrical contractor license Florida"* or *"how many #12 THHN in 3/4 EMT"* is
a person with the exact problem SparkConnect solves, and right now they land on
somebody else's page. Every calculator and every permit question is a page that
could rank.

That is the reason to have a website at all beyond a download button, and it is
the same reason ContractorConnect eventually belongs on the web while the
electrician tools stay native. Different products, different discovery.

---

## Home

### Hero

> # The trade app that tells you when it doesn't know.
>
> Calculators, a wiring simulator, troubleshooting, job documentation and an AI
> that refuses to guess. Built by and for electricians.
>
> [Download on the App Store]

**Why this headline.** Every competitor claims accuracy. The differentiator is
the opposite — an app that says "this table has not been checked against the
printed code book" is making a claim its competitors cannot copy without
building the same machinery. Lead with it.

Sub-line under the button:

> Free to use. Pro is $7.99/month.

### The three-up

**Answers you can check**
Every calculation shows its inputs, its method, and the code section it comes
from. When a number rests on a table we have not verified against the printed
NEC, the app says so on the answer — not in a settings screen.

**Learn by wiring it wrong**
A circuit simulator with a real solver behind it. Wire a three-way backwards and
it tells you exactly what a meter would read, because it worked it out rather
than looking up a canned response.

**The job, not just the calculator**
Photos, daily logs, calculations, permits and invoices under one job — with a
timeline that does not close. The service call three years later lands on the
same record as the rough-in.

---

## Features page

Group by what a person is trying to do, not by module name.

### On the job
- **Conduit fill, box fill, voltage drop, ampacity, bending** — free, unlimited,
  no daily cap. These are why you open the app the first time.
- **Panel Schedule** — catches a multiwire branch circuit with both hots on the
  same phase, which puts the sum of both loads on a shared neutral and never
  trips a breaker.
- **Pipe bending** — offsets, saddles, and rolling offsets that give you the
  *roll angle*, not just the hypotenuse.

### Learning
- **Wiring Simulator** — single-pole through four-way, graded by a solver.
- **Troubleshooting** — hundreds of scenarios generated from real faults, with
  meter readings and an explanation of why each wrong answer is wrong.
- **Daily Code Question** — one a day, with the reasoning.

### Documentation
- **Projects** — every photo, log, calculation and permit on one job.
- **Daily logs** — crew, hours, weather, delays. The document that settles a
  billing dispute six months later.
- **Export** — customer, GC, inspector or internal. Each one shows only what
  that reader should see.

### AI
- **SparkAI** — asks the calculator first and the model last. Refuses to state a
  specification it cannot compute, and will not invent a code citation.

### Contractors (Beta)
- **Verify a licence** — opens the issuing board's own record. We do not keep a
  copy, because a cached licence status is a status from whenever it was cached.
- **Permit Assistant** — work out what your jurisdiction requires and keep what
  they tell you.
- **Qualifying agents** — what one is, whether you need one, and what it
  involves to be one.

> Contractor search and nearby contractors are not built yet. They need public
> records we have not imported, and a search box over an empty database is worse
> than no search box.

**Say that last line on the site.** A visitor who finds two dead tiles after
downloading trusts nothing else on the page.

---

## Pricing

| | Free | Pro | Lifetime Tools |
|---|---|---|---|
| | $0 | **$7.99/mo** or $49.99/yr | $29.99 once |
| Calculators | Unlimited | Unlimited | Unlimited |
| SparkAI answers | 3/day | 20/day | 5/day |
| Wiring Simulator | First 2 lessons | Everything | Everything |
| Troubleshooting | 3/day | Unlimited | Unlimited |
| Projects & photos | Limited | Unlimited | Limited |
| Voice ask | — | ✓ | — |

3-day free trial on Pro. Annual saves 47%.

> ⚠️ **Before publishing this table**, resolve the three items in
> `PRICING_DISCREPANCIES` — the shipped paywall and the shipped gates disagree
> about calculators and about what Lifetime includes. Publishing a table that
> contradicts the app is worse than publishing nothing.

---

## The SEO surface — the actual opportunity

One page per question people already type. Each one answers it fully on the
page, then offers the app for the next one.

**Calculator pages**
- `/conduit-fill-calculator` — "how many 12 THHN in 3/4 EMT"
- `/voltage-drop-calculator`
- `/box-fill-calculator`
- `/wire-size-calculator`

**Permit and licensing pages** — this is where the volume is
- `/verify-electrical-contractor-license/florida`
- `/electrical-permit/tampa`
- `/electrical-permit/hillsborough-county`
- `/qualifying-agent/florida` — "what is a qualifying agent"
- `/journeyman-vs-contractor-license`

**Learning pages**
- `/how-to-wire-a-three-way-switch`
- `/multiwire-branch-circuit-shared-neutral`

The permit and licensing pages matter most. They are high-intent, low
competition, and they are exactly the content already written in
`src/core/connect/pathways.js` — the structural explanations there can be
lifted onto the web nearly as-is, and they already carry the "confirm with your
board" framing that keeps them honest.

**Rule for every one of these pages:** answer the question on the page. A page
that withholds the answer to force a download ranks badly and reads as a trick.

---

## Trust page

Worth having, and nobody else in this category has one.

> ### What we check, and what we haven't
>
> SparkConnect's calculations rest on tables printed in the National Electrical
> Code. We track which of those we have checked against the printed book, by
> hand, and which we have not.
>
> **Checked against the printed 2023 NEC:** conductor properties (Chapter 9,
> Table 8), box fill volumes (314.16(B)(1)), small-conductor limits (240.4(D)),
> conduit fill counts (Annex C, Table C.1).
>
> **Not yet checked:** ampacity tables, grounding conductor tables, and parts of
> the conduit dimension tables.
>
> Anywhere an answer rests on something in that second list, the app says so on
> the answer itself.
>
> We are not the authority having jurisdiction, and nothing in the app is a
> substitute for the adopted code, approved plans, or your inspector.

Keep this updated as tables get verified. It is a real differentiator and it
costs nothing but honesty.

---

## What not to say

- No "code compliant", "certified", "approved", or "guaranteed". Those words are
  banned in the app by a test and should be banned on the site for the same
  reason.
- Do not imply the app finds contractors. It does not yet.
- Do not imply licence data is held locally. It is a deep link, on purpose.
- Do not claim national permit coverage. Florida is the only jurisdiction with
  adapters, and they are deep links.

---

## Deploy safety

The API routes are the live backend for the app in the store.

- Work on a branch, use a Vercel preview deploy, promote only after checking
  `https://<preview>/api/ask-nec` still answers.
- Do not rename, move or restructure anything under `/api/`.
- `NEC_BACKEND_URL` in the app is hardcoded to
  `https://sparkconnect-website.vercel.app/api/ask-nec`. If that path changes,
  every shipped build loses SparkAI until an App Store release fixes it.
