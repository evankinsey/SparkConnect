# Contractor Connect — Florida-first MVP

What was built, what is real, what is honestly not yet, and what Evan does next.
Written 2026-08-09, on branch `claude/contractor-connect-mvp-rart2r`.

The one-sentence posture: **an opportunity-routing marketplace, not a
licence-borrowing one** — a person who found work is an opportunity source; the
person who contracts it is a contractor whose licence has been read from the
issuing board.

---

## BUILT

**Core domain — `src/core/connect/marketplace/` (pure modules, all tested):**

| Module | What it is |
|---|---|
| `intents.js` | The four intents (I HAVE A JOB / I NEED A QUALIFIER / I WANT WORK / I CAN QUALIFY), the entry cards, the full HAVE_JOB question list, and the three compliance notices — audited against the outcome-promise detector |
| `verification.js` | The brief's 8-state licence-verification enum. A VERIFIED_* status can only be derived from a source record (which itself cannot exist without provenance). Raw-source fingerprint stored for disputes. Unknown status words route to a person, never to ACTIVE |
| `opportunity.js` | The Opportunity model with every brief field, incl. `licenseStatusOfSubmitter`, `verificationState`, `moderationState`, `matchState`. Moderation gates matching structurally |
| `profiles.js` | Contractor / qualifier / business-need profiles. Constructors discard any caller-supplied verification |
| `moderation.js` | Licence-rental, permit-under-your-name, no-supervision, cash-only-evasive, skip-permit and present-as-licensed detectors → manual review, never auto-accusation. Duplicate suggestion. Reviewer guidance |
| `matching.js` | Deterministic two-stage engine: hard eligibility (trade, state, board-read active licence, moderation cleared), then additive, per-factor-auditable scoring. Both directions (opportunity→contractor, business→qualifier). No AI anywhere in the decision path |
| `introductions.js` | Request Introduction state machine (REQUESTED→ACCEPTED→INTRODUCED→MATCHED→CLOSED), one legal step at a time; INTRODUCED requires a named platform actor |
| `qualification.js` | LICENSE_VERIFIED → … → BOARD_AGENCY_REVIEW → RELATIONSHIP_CONFIRMED. Mutual accept can never produce a confirmed relationship; confirmation additionally requires the parties' board reference, with an honesty caveat |
| `billing.js` | BillingEvent abstraction (match fee / qualifier fee / subscription / transaction fee), $199/$299/$499 deterministic experiment arms, free-tier list pinned by test. Nothing charges; fee flags hard-locked |
| `store.js` | Injected-storage store: actor on every write, owner-scoped reads, admin-only moderation/verification/billing, audit log, forged-verification discard, `syncState() = LOCAL_ONLY` said out loud |
| `admin.js` | War-room aggregation: new/today, totals, verification counts, review queue, intro funnel, qualification pipeline, revenue events, source coverage, derived operator to-do |
| `analytics.js` | The brief's 17-event taxonomy + safe-property vocabulary, cross-checked against the PII scrub |
| `legal.js` | Marketplace disclaimer (brief verbatim in substance), three Florida structural notes each with an authority to confirm with, review-date block |

**App surface:**
- `src/screens/ContractorConnectScreen.js` — entry screen ("What are you trying
  to do?") with the four premium cards + Verify a License / Permit Assistant /
  Saved row; all four intake funnels; DBPR deep-link verification; saved
  lookups; dev-build war room. Registered as tab `contractors`, Home card
  `contractor_connect`, and in the Tools catalog.
- Flags in `src/flags/core.js` (camelCase versions of the brief's list), with
  `matchFeesEnabled` and `marketplacePaymentsEnabled` added to HARD_LOCKED_OFF.
- 17 `connect*` analytics methods in `src/analytics.js`, all through the
  deny-by-default scrub.

## LIVE DATA SOURCES

Honest count: **0 live-record sources, 2 official deep-link sources, 5 planned.**

- Florida DBPR licensee + business search: DEEP_LINK_ONLY, deliberately — the
  user lands on the board's own live record with their number in hand. For a
  licence status this is the correct product (it cannot be stale) and it is
  the fallback the brief explicitly allows.
- Hillsborough / Tampa / Pinellas / Pasco / Orange permit portals: PLANNED,
  registered at portal roots only (no guessed deep paths).
- Automated DBPR reads were attempted from this environment and the network
  path is blocked (proxy 403 on CONNECT). Per the brief — "if a source cannot
  be automated safely, return DEEP_LINK_ONLY" — that is exactly what ships.
  `liveLicenseVerificationEnabled` and `permitDataEnabled` are OFF and say why.

## VERIFICATION COVERAGE

- Any user can verify any Florida licence via the official record, today.
- Profile verification statuses can only be attached by an admin actor passing
  the result of `applyVerification()` — which demands source provenance (name,
  URL, retrieval timestamp) and refuses everything else. Tested from three
  directions: constructor forgery, store forgery, hand-rolled status object.
- Provenance is rendered to the user (source name, URL, checked-date,
  freshness, and a caveat even on Active).
- No profile in the system can be born verified. There are no seeded
  contractors, no seeded licences, no fake records anywhere.

## MARKETPLACE FLOWS

All four funnels work end-to-end on device: intake → validation → moderation
screening → local persistence → confirmation with the correct compliance
notice → hand-off to the manual ops channel. The unlicensed submitter sees the
brief's exact routing language. Matching and introductions are implemented and
tested at the engine level; because there is no backend, cross-user matching
is performed by the operator on exported records (below), which is precisely
the "manually broker the first matches" MVP the brief asks to validate.

## ADMIN/MANUAL OPS

- War room screen (dev builds) over the same aggregation the backend version
  will use: totals, verification queue, flags, intro funnel, action queue.
- Every submission ends on a "Send to the Contractor Connect team" action
  (share sheet / email to support@sparkconnect.pro) — that is the ops channel
  until Supabase lands, and the UI says so rather than implying a live network.
- Moderation decisions require an ADMIN actor and a named reviewer; users
  cannot clear, verify, or bill anything.

## LEGAL/COMPLIANCE GUARDRAILS

- The brief's non-negotiable rule is enforced in code: flagged
  licence-rental/permit-lending/no-supervision language quarantines the
  submission (FLAGGED, never matched) until a person decides; the message to
  the submitter never accuses.
- Unverified or inactive licences are structurally ineligible to match; no
  score can override eligibility (tested).
- Qualifying relationships cannot skip board review and cannot be "active"
  from two Accept taps (tested).
- Every user-facing string passes the outcome-promise detector; the repo-wide
  banned-wording scanner covers all new files; no statute numbers appear
  in-app; legal notes carry source attribution and a review date.
- Analytics cannot carry descriptions, media, licence numbers or contact
  details — deny-by-default scrub, cross-checked by test.

## TEST RESULTS

- `tests/marketplace.test.js`: **38 tests, all passing** — self-award
  prevention (3 ways), moderation flags (6 pattern families), matching
  eligibility/determinism, both state machines, store authorization + audit,
  money-off invariants, copy audits, module-isolation sweep.
- Full suite: **1201/1201 passing** (`npm test`, dependencies installed),
  including the pre-existing repo-wide wording and outcome-promise scanners
  over all the new code, plus the content validator (75/75).

## SECURITY REVIEW

- No secrets added anywhere; no network calls added; the two DBPR URLs are
  https-only and credential-free by constructor rule.
- Verified-status forgery: blocked at three layers (constructor, transition,
  store), all tested.
- Authorization: actor required on every store write; admin-only moderation /
  verification / billing / snapshot; owner-scoped reads. This is honest
  device-local RBAC — real enforcement moves server-side with Supabase RLS,
  and the call-site shape is already actor-first so that move is mechanical.
- Input handling: every free-text field is length-capped and
  whitespace-normalised; media stored as references only; no arbitrary URL
  fetching (deep links are constructed from constants, user input only ever
  URL-encoded into a query parameter).
- Money: fee flags hard-locked off; remote config and dev overrides both
  refused (tested); `warRoom.revenue.charged !== 0` is an explicit alarm.

## KNOWN GAPS

Stated plainly, because the product's whole ethos is not pretending:

1. **No backend.** Records are device-local; cross-user matching is brokered
   manually via the export channel. Supabase (docs/v1.1/SUPABASE-SETUP.md)
   is the unlock; the models and store API are shaped for that move.
2. **No automated DBPR reads** — deep link only (network path blocked here;
   also the safe default). The LIVE adapter slot, status enum and flag exist.
3. **No real auth** until the backend; the actor model is in place.
4. **No payments** — by design, per brief. BillingEvents record; nothing charges.
5. **Introductions between real users** need the backend; the state machine,
   store and admin queue are done.
6. The legal copy is drafted and self-audited but has **not seen outside
   counsel**; `LEGAL_REVIEW.reviewedBy` says exactly that.

## STORE/BACKEND CONFIG EVAN MUST DO

1. Nothing for the App Store for this change — no new permissions, no new
   SDKs, no privacy-declaration changes (analytics events carry no new PII).
2. When ready for the real network: create the Supabase project
   (docs/v1.1/SUPABASE-SETUP.md steps 1–3) — the marketplace tables mirror the
   store's shapes; RLS by `ownerId`; admin role for Evan.
3. Open the DBPR licensee search once from a device and confirm the deep link
   lands (Settings-style one-time confirmation is already supported by
   `linkStatus()`), then flip the confirmation flag.
4. Decide the ops inbox (currently support@sparkconnect.pro) and watch it.

## FIRST 20 USERS PLAN

Tampa-first, supply-of-opportunities first: 5 journeymen/apprentices from the
existing SparkConnect base (push + Home card) asked to submit one real
opportunity each; 5 estimators/PMs from local Facebook/contractor groups; 5
licensed ECs found via public Tampa-area permit records and invited to "I want
work" (their licence, their record, verified on DBPR before any match); 5
qualifier-curious licensees via the "I can qualify" card. Success metric:
10 real opportunities submitted, 5 licensed businesses profiled, 0 flagged
submissions leaking through.

## FIRST 10 MATCHES PLAN

Evan brokers every one by hand from the war-room queue: verify the
contractor's licence on DBPR (record the check), call both sides, make the
introduction, advance the intro state machine truthfully, and only after a
completed match present the fee conversation ($199/$299/$499 arm by the
deterministic assignment, framed as the experiment it is — nothing charged
in-app). Ten completed matches with honest willingness-to-pay data decides
whether the backend build is justified — which is the entire point of this MVP.

---

## HOW TO TEST IT

Four paths, fastest first.

**1. Ten seconds, no device — `npm run connect:demo`.**
Drives the real modules through one Tampa job: unlicensed submitter routed
correctly, licence-lending phrasing quarantined, a contractor's self-declared
"verified" discarded, an unverified licence refused a match, the DBPR record
attached by an admin, the match scored with every point attributable, the
introduction advanced one legal step at a time, a qualifying relationship
refused until the board reference exists, and the war-room queue worked. It
narrates rather than asserts — the assertions live in `tests/marketplace.test.js`.

**2. The test suite — `npm test`.** 1201 tests, including the 38 that pin the
compliance guarantees.

**3. On your phone, live — `npx expo start`, scan the QR code with Expo Go.**
Home → Contractor Connect (or Tools → Work → Contractor Connect). Everything
works in Expo Go except push notifications, which is a pre-existing limitation
unrelated to this module. This is the only way to see the actual screens.

**4. TestFlight — GitHub → Actions → "Ship to TestFlight" → Run workflow.**
No computer needed. Runs the preflight (tests + bundle check) and refuses to
build if anything fails. 15–25 minutes to a build, then the usual Apple wait.

Before any of it: `npm install` (this repo's tests need `@babel/parser`).

### What to click through on a device

- All four intent cards render and open their funnels.
- In "I have a job", answer **no** to the licence question and confirm the
  routing notice appears inline, before submission.
- Submit one clean job and one containing "need someone to lend their license"
  — the second should come back as needing review, with no accusation.
- In "I want work", create a profile and confirm it reads **Not yet checked**,
  then tap "Open your DBPR record" and confirm the deep link lands on the real
  licensee page. That link is unconfirmed until a human opens it once.
- Verify a License with a real Florida number, then check it appears in Saved.
- In a dev build only, open the war room and confirm the counts move.
