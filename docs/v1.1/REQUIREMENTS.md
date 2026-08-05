# SparkConnect v1.1 — Requirement Register

Every requirement from the three v1.1 briefs, given a stable ID. **This file is the
contract.** `PROGRESS.md` tracks status against these IDs; nothing is considered
captured unless it appears here.

- Verbatim source: [`source/v1.1-brief-extracted.txt`](source/v1.1-brief-extracted.txt) (line numbers cited as `L###`)
- Status of each item: [`PROGRESS.md`](PROGRESS.md)
- Open questions and blockers: [`DECISIONS.md`](DECISIONS.md)

IDs are permanent. If a requirement is dropped, mark it `WONTFIX` in `PROGRESS.md`
with a reason — never delete the ID.

---

## Priority order when requirements conflict

From the FINAL ENGINEERING INSTRUCTION (L903–912). This ordering governs every
trade-off in this project:

1. Safety
2. Technical correctness
3. Security
4. Existing-user data preservation
5. Purchase/payment compliance
6. Reliability
7. User experience
8. Conversion
9. Development speed

## Non-negotiable product rules (NNR)

| ID | Rule | Source |
|---|---|---|
| NNR-01 | Do not break the existing app | L990 |
| NNR-02 | Do not remove existing features | L991 |
| NNR-03 | Do not alter current product identifiers | L992 |
| NNR-04 | Do not bypass RevenueCat / StoreKit / Google Billing for digital purchases | L993 |
| NNR-05 | Do not expose API keys in the client | L995 |
| NNR-06 | Do not store Stripe secret keys, OAuth tokens, or webhook secrets in client code | L996 |
| NNR-07 | Do not present unsafe electrical work as acceptable | L998 |
| NNR-08 | Never teach technically incorrect wiring | L999 |
| NNR-09 | Never imply the simulator replaces supervision, adopted code, manufacturer instructions, LOTO, testing, or qualified instruction | L1000 |
| NNR-10 | Wiring logic must use a real circuit model, not visual matching | L1002 |
| NNR-11 | Any incomplete feature stays behind a disabled feature flag | L1004 |
| NNR-12 | Preserve offline/local functionality | L1005 |
| NNR-13 | Automated tests for every circuit configuration and payment-state transition | L1006 |
| NNR-14 | Staged implementation, but complete as much as can safely be completed | L1008 |
| NNR-15 | Do not claim something is done unless it runs and has been tested | L1010 |

---

## SIM — Circuit simulation engine (PART 1, PART 6)

| ID | Requirement | Source |
|---|---|---|
| SIM-01 | Reusable circuit engine — not isolated hardcoded animations per lesson | L1030 |
| SIM-02 | Model components, terminals, conductors, junctions, source, neutral, EGC | L1032–1038 |
| SIM-03 | Model line/load relationships, switch states, continuity paths, energized paths | L1039–1042 |
| SIM-04 | Model expected device behavior, invalid connections, missing required connections, dangerous configurations | L1043–1046 |
| SIM-05 | `CircuitDefinition` shape: id, title, difficulty, description, learningObjectives, components[], terminals[], allowedWireTypes[], initialState, expectedSolutions[], validationRules[], hintSteps[], safetyNotes[], referenceNotes[], testVectors[] | L1048–1063 |
| SIM-06 | `Component` shape: id, type, label, terminals[], metadata | L1064–1069 |
| SIM-07 | `Terminal` shape: id, componentId, semanticRole, acceptedConductorRoles[], required, maxConnections, polarityOrFunction | L1070–1077 |
| SIM-08 | `Conductor` shape: id, fromTerminal, toTerminal, role, displayColor, userAssignedLabel | L1078–1084 |
| SIM-09 | Semantic roles: LINE, LOAD, NEUTRAL, TRAVELER_A, TRAVELER_B, SWITCHED_HOT, EQUIPMENT_GROUND, COMMON, UNSPECIFIED | L1085–1094 |
| SIM-10 | Validation determines correctness from connectivity and function, **not** conductor color — "a traveler does not become correct merely because the user colored it red" | L1095–1098 |
| SIM-11 | Validate: line reaches correct common; switched output leaves opposite common; travelers connected between corresponding traveler terminals; neutral routed to load; grounding continuity; correct behavior for every switch state; no shorts/dead ends/duplicate impossible connections/improper line-neutral connections | L1099–1108 |
| SIM-12 | Use graph traversal / netlist-style validation | L1109 |
| SIM-13 | Deterministic solver evaluating **every** switch-state combination | L1110 |
| SIM-14 | Run truth-table tests for each completed configuration | L1112 |
| SIM-15 | Allow multiple electrically equivalent valid solutions — one visual layout is not the only answer | L1118 |
| SIM-16 | Separate circuit logic from UI | L1319 |
| SIM-17 | Version each lesson definition | L1320 |
| SIM-18 | Feature flag per simulation | L1325 |
| SIM-19 | Deterministic engine decides correctness; Spark AI may explain but must never mark an invalid circuit valid | L419–422 |

## LSN — Required wiring lessons (PART 2)

All seeded `NEEDS_ELECTRICAL_REVIEW` until a qualified reviewer signs off (see REV-*).

| ID | Lesson | Requirement | Source |
|---|---|---|---|
| LSN-01 | Single-pole switch | Source at switch **and** source at light; identify line, switched leg, neutral, EGC; check device behavior | L1124–1128 |
| LSN-02 | Three-way, source at first switch | Line enters first 3-way, travelers between switches, opposite common feeds light, neutral to light, grounding, all switch positions tested | L1129–1135 |
| LSN-03 | Three-way, source at light | Alternate topology; distinguish conductor functions; avoid outdated/misleading color assumptions; all positions tested | L1136–1140 |
| LSN-04 | Four-way | Two 3-ways at endpoints, one 4-way between; correct traveler-pair routing; straight-through vs crossed state; **all 8 combinations** tested; load toggles from every location | L1141–1147 |
| LSN-05 | Three-way troubleshooting | Light works only in one position; common/traveler reversed; one traveler open; missing line or load; incorrect conductor assignment | L1148–1154 |
| LSN-06 | Four-way troubleshooting | Traveler pair landed incorrectly; 4-way misidentified; one traveler disconnected; endpoint common miswired; load works from only two locations | L1155–1161 |
| LSN-07 | Switched receptacle | Full switched; half-switched concept; tab-removal concept; neutral continuity; distinguish conceptual sim from manufacturer-specific install | L1162–1168 |
| LSN-08 | GFCI line vs load | Identify line; identify optional protected load; explain reversal consequences generally; **do not instruct energized testing**; manufacturer-instruction reminder | L1169–1174 |
| LSN-09 | Basic receptacle circuit | Line/neutral/ground; feed-through concept; continuity; open hot / open neutral / open ground scenarios | L1175–1179 |
| LSN-10 | Panel / branch-circuit identification | Branch-circuit hot, neutral termination, EGC concept, breaker-to-circuit relationship, neutral-ground separation downstream; explicit qualified-procedure warning; **do not simulate bare-handed energized panel work** | L1180–1191 |

## SUX — Simulation user experience (PART 3, PART 4)

| ID | Requirement | Source |
|---|---|---|
| SUX-01 | Flow: choose lesson → objective → optional explanation → simulate → drag/tap conductors → select role/color → test → result → hints → correct → complete → score/XP/explanation/next | L1196–1208 |
| SUX-02 | Controls: drag conductor, tap terminal, remove conductor, change role/color, undo, redo, reset, test circuit, request hint, view schematic, view simplified physical layout, toggle labels, accessibility settings | L1209–1222 |
| SUX-03 | Clear distinction between physical-layout view and schematic/conceptual view | L1223–1225 |
| SUX-04 | Physical representation must not be so realistic users mistake it for manufacturer-specific instruction | L1226 |
| SUX-05 | Wrong answer: short haptic, brief red pulse on the incorrect area, tasteful non-graphic spark animation, optional error sound, score reduction, explain **category** of mistake without giving away the answer | L1232–1238 |
| SUX-06 | **Never** portray realistic electrocution, imply the user was shocked, or use disturbing injury visuals | L1239–1241 |
| SUX-07 | Failure language: "Circuit check failed", "That path would not operate as intended", "Possible short path detected", "Common terminal appears incorrect", "One traveler path is incomplete", "Neutral continuity is missing" | L1242–1248 |
| SUX-08 | Accessibility toggles: haptics, sound, flash animation; respect system reduced-motion | L1249–1254 |

## SCR — Hints, timer, scoring, XP, streaks (PART 5)

| ID | Requirement | Source |
|---|---|---|
| SCR-01 | Graduated hints L1 general concept → L2 component/section → L3 conductor role or terminal family → L4 direct corrective clue → L5 reveal + explain | L1258–1269 |
| SCR-02 | Scoring: base 1000; wrong test −100; hints −25/−50/−75/−100; reveal −200; reset −50; fast completion up to +200; first-attempt +150 | L1270–1280 |
| SCR-03 | Timer modes: Learn (none), Practice (optional visible), Challenge (countdown or par-time) | L1281–1284 |
| SCR-04 | Default learning experience must not be stressful | L1285 |
| SCR-05 | Track completion %, best score, best time, attempts, hints used, lessons completed, current streak, XP | L1286–1294 |
| SCR-06 | Ranks: Helper, First-Year Apprentice, Second-Year, Third-Year, Fourth-Year, Journeyman Candidate, Field Troubleshooter | L1296–1303 |
| SCR-07 | Ranks are **not** licenses/certifications; display "Training rank only — not a license or certification." | L1304–1307 |

## REV — Technical accuracy + human review gate (PART 6, PART 26)

| ID | Requirement | Source |
|---|---|---|
| REV-01 | Truth-table tests for every switching simulation | L1314 |
| REV-02 | Unit tests for every valid circuit | L1315 |
| REV-03 | Unit tests for common invalid circuits | L1316 |
| REV-04 | Snapshot tests for lesson definitions | L1317 |
| REV-05 | Validation-rule documentation | L1318 |
| REV-06 | Lesson fields: technicalReviewStatus, technicalReviewer, reviewDate, reviewerNotes, lessonVersion, referenceNotes, productionApproved | L732–739 |
| REV-07 | Statuses: DRAFT, ENGINEERING_TESTED, NEEDS_ELECTRICAL_REVIEW, CHANGES_REQUESTED, APPROVED, RETIRED | L740–746 |
| REV-08 | Production UI shows a lesson only when `productionApproved === true` **AND** `technicalReviewStatus === "APPROVED"` | L747–750 |
| REV-09 | Internal review screen or structured review file: lesson, topology, valid solutions, invalid test cases, truth table, hint sequence, safety language, references, outstanding concerns | L751–760 |
| REV-10 | Seed all new lessons `NEEDS_ELECTRICAL_REVIEW`; never falsely populate reviewer names or approval dates | L761–764 |
| REV-11 | Review checklist: source path, load path, neutral path, EGC represented, all switch states tested, multiple valid topologies, conductor re-identification caveats, manufacturer-specific differences avoided, NEC references careful, AHJ disclaimer, safety language, no energized-work encouragement, reviewed by qualified electrician/instructor | L1326–1339 |
| REV-12 | Ship the standing training disclaimer verbatim (training/conceptual reference only; verify with adopted NEC, AHJ, plans, manufacturer instructions, qualified supervision; de-energize and verify absence of voltage) | L1340–1345 |
| REV-13 | **Do not fabricate NEC citations.** If no reliable citation exists in the verified KB, use a general reference label and mark for human review | L1346–1349 |
| REV-14 | No simulation is production-enabled merely because tests pass | L731 |

## TRN — Training monetization (PART 7)

| ID | Requirement | Source |
|---|---|---|
| TRN-01 | Free: single-pole lesson, one full three-way lesson, first troubleshooting scenario, Learn Mode, limited daily challenge, basic score | L1355–1361 |
| TRN-02 | Lifetime Tools: recommended to receive the foundational v1.1 pack (single-pole, three-way, four-way) only | L1362–1369 |
| TRN-03 | Lifetime does **not** automatically receive future cloud courses, AI coaching, team dashboards, or advanced expansions | L1370–1371, L985 |
| TRN-04 | Pro: all simulations, all troubleshooting, practice + challenge modes, detailed analytics, unlimited custom practice, AI mistake explanations, full progress history, advanced hints/coaching, future advanced packs while subscribed | L6–15 |
| TRN-05 | Do not promise every future training product is always included; preserve flexibility for premium course packs, employer/school plans, separately priced curricula | L16–18 |
| TRN-06 | Training access uses the existing RevenueCat entitlement architecture | L19 |
| TRN-07 | Do **not** create a custom unlock-code system that bypasses Apple/Google IAP | L20–21 |
| TRN-08 | Superwall placements: `simulation_locked`, `troubleshooting_locked`, `challenge_mode_locked`, `ai_simulation_explanation`, `progress_history_locked`, `custom_practice_locked` | L22–28 |
| TRN-09 | User must always see what is free before hitting the training paywall | L29 |
| TRN-10 | Free users must be able to finish at least one meaningful wiring simulation completely | L30–31 |
| TRN-11 | Do not show the paywall before the user understands the training experience | L32 |

## PAY — Stripe-connected customer payments (PARTS 8–11)

> **Blocked:** this repository contains no backend. See `DECISIONS.md` D-01.

| ID | Requirement | Source |
|---|---|---|
| PAY-01 | Contractors create an invoice and optionally let the customer pay electronically | L36–38 |
| PAY-02 | SparkConnect subscriptions, Lifetime Tools, AI answer packs stay on Apple/Google IAP via RevenueCat; only real-world service payments use Stripe | L39–42 |
| PAY-03 | Architecture: create invoice → connect Stripe → backend creates payment request → Stripe-hosted page → customer pays → webhook updates status → app displays status | L44–51 |
| PAY-04 | Never collect raw card details in the app; use Stripe-hosted Checkout or equivalent | L52–54 |
| PAY-05 | Never store card numbers, CVC, Stripe secret key, OAuth client secret, account access token, refresh token, or webhook signing secret in the mobile client | L55–63 |
| PAY-06 | All sensitive Stripe operations occur on the backend | L64 |
| PAY-07 | Use Stripe Connect only if backend and account configuration support it safely | L68–69 |
| PAY-08 | Stripe Connect Express accounts; Stripe-hosted onboarding; connection status visible; reconnect/manage; backend stores only minimum connected-account id + status; tokens stay server-side; idempotency keys; verify webhook signatures; log event IDs to prevent duplicate handling | L70–79 |
| PAY-09 | Contractor states: NOT_CONNECTED, ONBOARDING_STARTED, INFORMATION_REQUIRED, PENDING_VERIFICATION, ENABLED, RESTRICTED, DISCONNECTED | L80–87 |
| PAY-10 | Invoice payment states: DRAFT, READY_TO_SEND, SENT, VIEWED, PAYMENT_PENDING, PARTIALLY_PAID, PAID, OVERDUE, VOID, REFUNDED, PAYMENT_FAILED | L88–99 |
| PAY-11 | A successful redirect is **not** proof of payment; webhooks are the source of truth | L100–101 |
| PAY-12 | Handle: checkout session completed, payment intent succeeded, payment intent failed, charge refunded, account updated, async payment succeeded, async payment failed — using **actual** SDK event names, never invented ones | L102–111 |
| PAY-13 | Every webhook handler: verify signature → reject malformed → check idempotency → resolve connected account → resolve invoice → valid state transition → record timestamp + event ID → no sensitive data exposure → correct status code → debuggable logs without private financial data | L112–122 |
| PAY-14 | Never silently introduce payment fees; display them clearly | L126 |
| PAY-15 | Config support for: no platform fee at launch, optional future % application fee, optional future flat fee, feature flag for payment availability, region/country controls | L127–132 |
| PAY-16 | Do not enable an application fee in production without a verified business decision and matching Stripe configuration | L133–134 |
| PAY-17 | Show contractor: customer charge amount, payout amount when available, accurate Stripe fee info, SparkConnect fee if enabled, refund status, payment status, payment date, connected account status | L135–143 |
| PAY-18 | Do not compute or promise exact Stripe fees from hardcoded assumptions; use Stripe's actual transaction data | L144–145 |
| PAY-19 | Include disclaimer: SparkConnect does not provide accounting, tax, legal, banking, lending, or payment-processing advice | L146–147 |
| PAY-20 | Customer-facing payment page: mobile friendly, shows contractor identity, invoice number, amount due; hides internal notes and SparkConnect account identifiers; HTTPS; unguessable session link; links expire/invalidate; shows success/failure/pending/canceled | L183–193 |
| PAY-21 | Do not expose a permanent unrestricted payment link when a session-based flow is safer | L194–195 |

## INV — Invoice / estimate workflow (PART 11, PART 12)

| ID | Requirement | Source |
|---|---|---|
| INV-01 | Invoice fields: contractor/business name, customer name, customer email, optional phone, billing/service address, invoice number, estimate number, issue date, due date, payment terms, line items, labor, materials, quantity, unit price, optional tax/discount/deposit, amount paid, balance due, notes, scope of work, exclusions, customer message, optional contractor license, optional logo, payment button when Stripe connected, offline/manual payment methods, mark paid manually | L151–180 |
| INV-02 | Partial-payment support in the data model even if v1 UI only supports full payment | L181–182 |
| INV-03 | Workflow: create estimate → save draft → send/share → mark accepted/declined → convert to invoice → preserve customer + line items → allow edits without corrupting the original → send invoice → accept payment or mark paid → store payment status | L199–209 |
| INV-04 | Estimate statuses: DRAFT, SENT, VIEWED, ACCEPTED, DECLINED, EXPIRED, CONVERTED_TO_INVOICE, ARCHIVED | L210–218 |
| INV-05 | Conversion: create a **new** invoice record, keep a reference to the source estimate, **do not mutate** the accepted estimate, copy line items + customer details, generate unique invoice number, preserve audit trail, let contractor change final quantities/pricing, warn if changes materially differ from the accepted estimate | L219–227 |
| INV-06 | Actions: duplicate estimate, duplicate invoice, convert, mark sent, mark viewed, mark accepted, mark declined, mark paid manually, mark partially paid, void invoice, record refund, add internal note, add customer-visible note | L228–241 |

## EXP — PDF and export rules (PART 13)

| ID | Requirement | Source |
|---|---|---|
| EXP-01 | Audit the current PDF/export system for reliability | L245 |
| EXP-02 | Generate a clean customer-ready PDF | L247 |
| EXP-03 | Do not put "SparkConnect Tools" prominently atop a customer's invoice unless a SparkConnect-branded template is deliberately chosen | L248–249 |
| EXP-04 | Free users get a small subtle footer: "Generated with SparkConnect: Electric Toolkit" | L250–253 |
| EXP-05 | Pro and Lifetime users get the footer removed from newly generated documents; existing exports need no retroactive change | L254–256 |
| EXP-06 | Respect current export limits by entitlement | L257 |
| EXP-07 | Never silently fail; show the exact failure stage | L258–259 |
| EXP-08 | Cascade through supported share/export methods safely; add retry where appropriate; test iOS and Android | L260–262 |
| EXP-09 | Accessible text sizing, proper page breaks; never split critical totals or signature sections across pages | L263–264 |
| EXP-10 | Analytics: pdf_generate_started/succeeded/failed, pdf_share_opened/completed/failed, payment_link_created, payment_link_creation_failed | L265–273 |

## ONB — Onboarding (PART 14, PART 15)

| ID | Requirement | Source |
|---|---|---|
| ONB-01 | Audit current onboarding before replacing anything | L277 |
| ONB-02 | Role question "What best describes you?" — Apprentice, Journeyman, Foreman, Contractor / Business Owner, Instructor / Student, Other | L278–286 |
| ONB-03 | Use role to personalize shortcuts and recommendations | L287 |
| ONB-04 | Home emphasis per role (Apprentice: bending/wire colors/learn/simulator/AI; Journeyman: calculators/code tools/job cam/AI/troubleshooting; Foreman: job cam/estimator/code tools/material lists/AI; Contractor: estimates/invoices/payments/job cam/material+labor/AI; Instructor-Student: quiz/simulator/troubleshooting/custom quiz/progress) | L288–319 |
| ONB-05 | Never permanently hide features based on role | L320 |
| ONB-06 | Role changeable in Settings | L321 |
| ONB-07 | Role selection is not proof of licensure or qualification | L322 |
| ONB-08 | First-win question "What do you need to do first?" — calculate something, check code or troubleshoot, practice wiring, build an estimate or invoice, document a job | L326–332 |
| ONB-09 | Route the user to a meaningful first action | L333 |
| ONB-10 | Track onboarding_started, onboarding_role_selected, onboarding_goal_selected, onboarding_first_action_started, onboarding_first_action_completed, onboarding_abandoned | L334–340 |
| ONB-11 | No aggressive subscription wall before a meaningful first action | L341–342 |
| ONB-12 | After first success, explain the connected workflow: "Calculate it, understand it with Spark AI, save it to the job, and turn it into customer-ready paperwork." then introduce Pro/Lifetime/limits | L343–346 |

## PWL — Value-first paywall strategy (PART 16)

| ID | Requirement | Source |
|---|---|---|
| PWL-01 | Do not universally hard-paywall the app in v1.1 | L350 |
| PWL-02 | Feature flags + Superwall experiments A (current freemium), B (first-win), C (aggressive training), D (trial-forward) | L351–367 |
| PWL-03 | Experiment D: state price, billing interval, renewal, cancellation, trial terms; no deceptive toggles; no preselected confusing options; no hiding the non-trial purchase state | L362–367 |
| PWL-04 | Do not activate a universal hard paywall without data | L368 |
| PWL-05 | Analytics: paywall_presented, paywall_placement, paywall_variant, paywall_dismissed, product_selected, trial_started, purchase_started, purchase_completed, purchase_failed, restore_started, restore_completed, restore_failed, entitlement_granted, entitlement_missing_after_purchase | L369–383 |

## AI — Context-aware Spark AI (PART 17)

| ID | Requirement | Source |
|---|---|---|
| AI-01 | "Explain with Spark AI" across pipe bending, voltage drop, box fill, conduit fill, ampacity, estimator, invoice/estimate, quiz answers, wiring simulation mistakes, troubleshooting scenarios | L387–397 |
| AI-02 | AI receives structured context, not a vague or screenshot-only prompt: `{tool, inputs, result, userRole, adoptedCodeContext, selectedMode, safetyContext, requestedAction}` | L398–409 |
| AI-03 | For simulation mistakes send lesson ID, lesson version, component graph, user connections, validation errors, hint level, attempt count, mode | L410–418 |
| AI-04 | AI must not override the deterministic circuit engine or mark an invalid circuit valid | L419–422 |
| AI-05 | Response shape: direct explanation, why it occurred, role of each conductor/terminal, what to inspect next, common mistake, safety reminder, verified reference if available, clear uncertainty statement | L423–431 |
| AI-06 | Do not fabricate code citations | L432 |

## SAV — Saved state, resume, history (PART 18)

| ID | Requirement | Source |
|---|---|---|
| SAV-01 | Preserve most recent working state locally for pipe bending, voltage drop, box fill, conduit fill, ampacity, estimator, invoice, estimate, quiz, wiring simulation, troubleshooting, Job Cam project | L436–448 |
| SAV-02 | Free users get last-state restoration as basic usability | L449 |
| SAV-03 | Pro gets searchable history, multiple saved records, named saved calculations, full simulation attempt history, detailed progress history, cross-workflow linking | L450–456 |
| SAV-04 | Lifetime saved behavior follows current entitlement definitions plus any explicit v1.1 foundational training grant | L457–458 |
| SAV-05 | Never auto-open an old draft unexpectedly; offer Resume draft / Start new / Discard draft | L459–464 |

## THM — Theme and accessibility (PART 19)

| ID | Requirement | Source |
|---|---|---|
| THM-01 | Appearance default = SYSTEM; support System / Light / Dark | L468–472 |
| THM-02 | Light mode: avoid pure white everywhere, use comfortable off-white/light neutral base, softly filled cards, adequate contrast, obvious selected states, distinguishable destructive/warning states, no low-contrast gray text, sunlight readable | L473–481 |
| THM-03 | Dynamic text support where practical | L483 |
| THM-04 | Screen-reader labels | L484 |
| THM-05 | Adequate tap targets | L485 |
| THM-06 | Reduced motion | L486 |
| THM-07 | Haptics toggle, sound toggle, flash-effects toggle | L487–489 |
| THM-08 | Color must never be the only signal of correctness; simulation conductor roles need labels/patterns as well as color; do not rely on red/green alone | L490–493 |

## GRW — Reviews, sharing, organic growth (PART 20)

| ID | Requirement | Source |
|---|---|---|
| GRW-01 | Never request a store rating on first launch | L497 |
| GRW-02 | Trigger review prompts only after a positive milestone: five successful calculator uses, completed simulation, completed quiz with positive score, successful invoice export, successful payment received, multiple return sessions | L498–504 |
| GRW-03 | Use the native platform rating prompt | L505 |
| GRW-04 | Share cards for quiz result, daily code challenge, simulation score, troubleshooting score, voltage-drop result, pipe-bending result, "Can you solve this wiring setup?", apprentice streak | L506–514 |
| GRW-05 | Cards may carry subtle SparkConnect branding | L515 |
| GRW-06 | Never expose private job, customer, invoice, address, photo, payment, or company information in a share card | L516–517 |
| GRW-07 | Explicit preview before sharing | L518 |

## ANL — Analytics and privacy (PART 21)

| ID | Requirement | Source |
|---|---|---|
| ANL-01 | Use the existing analytics provider; do not add overlapping SDKs | L522–523 |
| ANL-02 | APP events: app_opened, session_started, returning_user, role_selected | L525–529 |
| ANL-03 | TOOLS events: tool_opened, calculation_completed, result_saved, ai_explanation_clicked | L530–534 |
| ANL-04 | TRAINING events: simulation_catalog_opened, simulation_started, wire_connected, circuit_tested, simulation_failed, simulation_completed, hint_used, lesson_abandoned, challenge_started, challenge_completed, streak_updated | L535–546 |
| ANL-05 | INVOICE events: estimate_created, estimate_sent, estimate_accepted, estimate_declined, estimate_converted, invoice_created, invoice_sent, invoice_marked_paid, payment_link_created, checkout_opened, payment_completed, payment_failed, refund_recorded | L547–560 |
| ANL-06 | MONETIZATION events: paywall_presented, trial_started, subscription_started, lifetime_purchased, answer_pack_purchased, purchase_failed, restore_completed | L561–568 |
| ANL-07 | **Never** send customer names, emails, phone numbers, full addresses, invoice descriptions, job photos, payment details, or AI prompts containing customer-identifying information into analytics | L569–578 |
| ANL-08 | Use anonymous identifiers and privacy-safe event properties | L579 |

## DAT — Database and migration (PART 22)

| ID | Requirement | Source |
|---|---|---|
| DAT-01 | Audit current persistence before introducing a new database | L583 |
| DAT-02 | Versioned models + migrations for preferences, role, simulation progress, simulation attempt history, invoice, estimate, customer, payment status, Stripe connected-account metadata, analytics consent | L584–594 |
| DAT-03 | Never destroy existing local invoices, estimates, Job Cam projects, preferences, purchase state, quiz progress | L595–601 |
| DAT-04 | Migration tests using representative production data | L602–603 |
| DAT-05 | Handle migration failure gracefully | L604 |
| DAT-06 | Back up / preserve old schema data until successful migration is confirmed | L605 |

## SEC — Security (PART 23)

| ID | Requirement | Source |
|---|---|---|
| SEC-01 | No secrets in client bundle; no private keys committed; no sensitive tokens logged | L611–613 |
| SEC-02 | Verify Stripe webhook signatures | L614 |
| SEC-03 | Validate backend input | L615 |
| SEC-04 | Rate-limit sensitive endpoints | L616 |
| SEC-05 | Enforce ownership checks for invoices / payment sessions | L617 |
| SEC-06 | Unguessable identifiers; avoid sequential publicly exposed invoice IDs | L618–619 |
| SEC-07 | Sanitize customer-visible content | L620 |
| SEC-08 | Prevent cross-user invoice / payment-session access | L621 |
| SEC-09 | HTTPS; validate redirect URLs; restrict CORS | L622–624 |
| SEC-10 | Replay / idempotency protection | L625 |
| SEC-11 | Redact financial and personal information from logs | L626 |
| SEC-12 | Never trust a client-supplied price, entitlement, connected account, payment status, invoice ownership, platform fee, or subscription status without server-side verification | L627–635 |

## TST — Testing requirements (PART 24)

| ID | Area | Cases | Source |
|---|---|---|---|
| TST-01 | Circuit engine | Every valid lesson topology; every switch-state combination; multiple equivalent valid solutions; common-terminal reversal; open traveler; traveler crossover; missing neutral; missing switched leg; direct line-neutral short path; duplicate invalid connections; invalid endpoint common; four-way straight/cross; half-switched receptacle tab state; GFCI line/load definitions; panel-identification rules | L640–655 |
| TST-02 | Scoring | Wrong-attempt deduction, hint deduction, reset deduction, completion bonus, time bonus, first-attempt bonus, minimum score bounds, streak updates | L656–664 |
| TST-03 | Payments | Connected-account state changes, session creation, duplicate request idempotency, successful/failed/pending payment, refund, partial refund, duplicate webhook event, invalid signature, payment for wrong invoice, unauthorized invoice access, manual paid status, valid and invalid state transitions | L665–679 |
| TST-04 | Purchases | Free/Pro/Lifetime entitlement, expired subscription, canceled-but-active, restored purchase, failed purchase, simulation access by tier | L680–688 |
| TST-05 | Migrations | Production schema → v1.1, missing optional fields, corrupt local record, interrupted migration, retry, no data loss | L689–695 |
| TST-06 | UI | Light/dark/system, reduced motion, haptics disabled, small screen, tablet, keyboard-visible invoice editing, offline, slow network, payment return flow, PDF sharing | L696–708 |

## FLG — Feature flags (PART 25)

| ID | Flag | Source |
|---|---|---|
| FLG-01 | `wiringSimulationsEnabled` | L713 |
| FLG-02 | `fourWaySimulationEnabled` | L714 |
| FLG-03 | `troubleshootingGamesEnabled` | L715 |
| FLG-04 | `challengeModeEnabled` | L716 |
| FLG-05 | `stripeConnectEnabled` | L717 |
| FLG-06 | `customerPaymentsEnabled` | L718 |
| FLG-07 | `platformFeesEnabled` | L719 |
| FLG-08 | `roleBasedOnboardingEnabled` | L720 |
| FLG-09 | `firstWinPaywallEnabled` | L721 |
| FLG-10 | `shareCardsEnabled` | L722 |
| FLG-11 | `updatedLightThemeEnabled` | L723 |
| FLG-12 | Dangerous or incomplete features default OFF | L724 |
| FLG-13 | Reuse the existing backend kill-switch concept; disabling Stripe payment creation or a bad lesson must not require an App Store rebuild | L725–727 |

## CODE — NEC code edition awareness (Bottom line)

| ID | Requirement | Source |
|---|---|---|
| CODE-01 | Do **not** claim "SparkConnect is now universally based on the 2026 NEC" — adoption is fragmented (as of Aug 3 2026: 6 states on 2026, 20 on 2023, 15 on 2020) | L1436–1441 |
| CODE-02 | Code Edition Center in onboarding/Settings: 2020 NEC / 2023 NEC / 2026 NEC / Not sure | L1443–1449 |
| CODE-03 | Display the selected edition visibly in Spark AI, Code Quiz, Formula/Code Reference, calculator explanations, result cards, saved work, share cards | L1450–1457 |
| CODE-04 | "What changed in 2026?" organized as: new/relocated articles, services and feeders, grounding and bonding, GFCI/AFCI, EV and emerging tech, limited-energy systems, medium-voltage reorganization, motors/transformers/controls, important table changes, 2023→2026 comparison lessons | L1458–1470 |
| CODE-05 | Help users find relocated material — the 2026 reorganization continues through 2029; a "2026" badge alone is not enough | L1471–1473 |
| CODE-06 | Result label: "Based on selected edition: 2023 NEC / 2026 edition may differ — view changes." or "2026 edition selected / Your jurisdiction may still enforce an earlier edition." | L1477–1484 |
| CODE-07 | Remove the hardcoded "v1.0 · 2023 Code Edition" from the splash screen; make it dynamic or remove it | L1485–1488 |
| CODE-08 | Adaptive study needs a 2020/2023/2026 edition filter | L1609 |

## UI — Interface fixes (Bottom line)

| ID | Requirement | Source |
|---|---|---|
| UI-01 | Unify brand colors: electric blue = navigation/primary/selected; safety orange = Pro/alerts/upgrade/field callouts; spark yellow = AI and learning rewards; green = success only; red = errors/danger only | L1624–1636 |
| UI-02 | Redesign paywall hierarchy: headline → workflow line → trial CTA → annual price with monthly equivalent → monthly alternative → 5 benefit ticks → "View full comparison" → Lifetime secondary | L1637–1653 |
| UI-03 | Annual is the default visual recommendation, not monthly | L1654 |
| UI-04 | Lifetime is visually secondary so it does not compete with recurring revenue | L1655–1656 |
| UI-05 | Replace vague "Priority new features" with a concrete benefit, or remove it | L1657–1658 |
| UI-06 | Settings Pro card summarizes status and opens the same paywall — not a second checkout page | L1659–1664 |
| UI-07 | Fix Spark AI header layout: title, "Electrical field assistant" subtitle, counter chips, then mode chips below | L1665–1673 |
| UI-08 | Shorten AI mode chips to Ask, Code, Troubleshoot, Explain; drop the per-session "General" welcome explanation | L1674–1681 |
| UI-09 | Replace the Learn "COMING SOON" box with Wiring Lab, Daily Streak, Continue Quiz, Weak Areas, 2026 Code Changes, Motor Controls — Coming Next; locked features get a preview and purpose | L1684–1697 |
| UI-10 | Job Cam empty state: project templates (New Construction, Service Call, Panel Upgrade, Underground/Sitework, Custom) plus suggested photos (plans, rough-in, concealed work, labels, inspections, before/after) | L1698–1707 |
| UI-11 | Home priority order after personalization: continue where you left off, role-based quick action, daily question, Spark AI, quick tools, recent work — the Daily Question must stop dominating | L1704–1711 |
| UI-12 | Pipe bending results show mark 1, center mark, mark 3, distance between marks, bend directions, arrow/star/notch alignment, shrink, developed length, bender/model assumptions, step-by-step instructions | L1712–1725 |
| UI-13 | Move the unrelated EMT take-up reference into a collapsible Reference section | L1726–1729 |
| UI-14 | Splash: brand recognition only — shorter, no stale version label, no floating feature pills | L1730–1737 |

## TOOL — New field tools (Bottom line, high priority)

| ID | Requirement | Source |
|---|---|---|
| TOOL-01 | Bender database: brand, model, conduit type, size, deduct/take-up, centerline radius, gain, shoe-specific notes, hand/mechanical/electric/hydraulic | L1557–1568 |
| TOOL-02 | Do not populate bender data from guesses; every entry carries a verification status | L1569 |
| TOOL-03 | Wire-pull planner: pull length, total bend degrees, individual bend sequence, conductor count/size, conduit type/size, estimated pulling tension, sidewall pressure, lubricant reminder, pull-box/checkpoint recommendation, assumptions + engineering disclaimer | L1570–1581 |
| TOOL-04 | Motor and transformer section: motor FLC lookup, branch-circuit conductor sizing, OCPD range helper, overload sizing helper, transformer FLC, primary/secondary conductor helper, transformer OCPD helper, control transformer basics, Spark AI explanation | L1584–1597 |
| TOOL-05 | Keep deterministic calculations separate from AI | L1598 |
| TOOL-06 | Adaptive study: accuracy by category, weakest three topics, missed-question review, spaced repetition, code-navigation drills, 10-minute daily study plan, edition filter, state exam profiles later, question technical-review status | L1599–1611 |
| TOOL-07 | Do not race to 3,000 mediocre questions | L1602 |

## ROAD — Version roadmap (Bottom line)

| ID | Requirement | Source |
|---|---|---|
| ROAD-01 | v1.1 Wiring Lab: single-pole, three-way, four-way, GFCI line/load, switched receptacle, basic troubleshooting, panel/branch-circuit identification, scores, hints, haptics, challenge mode | L1506–1514 |
| ROAD-02 | v1.2 Motor Controls Lab: start/stop three-wire, seal-in, overload contact, forward/reverse starter, interlocking, HOA selector, control transformer, float switch, pressure switch, basic relay logic, troubleshooting with a virtual meter | L1515–1526 |
| ROAD-03 | v1.3 PLC Foundations: NO/NC instructions, I/O, rungs and scan cycle, seal-in translated from relay logic, TON/TOF/RTO, counters, compare blocks, latch/unlatch, motor-starter sim, conveyor, tank fill, traffic light, fault diagnosis, Spark AI rung explanations | L1527–1541 |
| ROAD-04 | PLC is a separate engine — do not shove it into the wiring simulator; build the electrical→controls bridge first | L1489–1504 |
| ROAD-05 | Controls/PLC monetization: first motor-control lesson free, first PLC start/stop project free, full Controls Lab Pro, detailed AI coaching Pro, instructor classroom packs later, Lifetime gets the initial foundational offline pack only | L1546–1554 |
| ROAD-06 | Position as "the electrician operating system for the field and apprenticeship" — CALCULATE / UNDERSTAND / PRACTICE / DOCUMENT / GET PAID — not "another electrician calculator" | L1751–1783 |

## DOD — Definition of done (PART 28)

A feature is complete only when **all** hold (L837–853):

| ID | Criterion |
|---|---|
| DOD-01 | Implemented |
| DOD-02 | Builds successfully |
| DOD-03 | Tests pass |
| DOD-04 | Does not break existing features |
| DOD-05 | Handles errors visibly |
| DOD-06 | Protected by the correct entitlement |
| DOD-07 | Instrumented with analytics |
| DOD-08 | Supports iOS and Android where intended |
| DOD-09 | Has feature-flag control |
| DOD-10 | Has documentation |
| DOD-11 | Has migration handling if applicable |
| DOD-12 | Manually verified |
| DOD-13 | Electrical lessons stay disabled until legitimate technical approval |
| DOD-14 | Payment features stay disabled until backend secrets, Stripe config, webhook endpoint, and account requirements are confirmed |
| DOD-15 | Do not mark production Stripe payments complete using test-mode credentials alone |
| DOD-16 | Do not mark an electrical lesson technically approved without an actual reviewer |

## RPT — Required final report (PART 29)

The completion report must contain all 26 sections (L858–884): repository audit, architecture
decisions, files added, files modified, dependencies added, database/storage changes, migrations,
circuit lessons implemented, truth-table and validation tests, lessons awaiting human technical
review, invoice workflow changes, Stripe work completed, Stripe manual configuration still
required, environment variables required, webhook deployment steps, RevenueCat/Superwall work,
analytics events added, feature flags added, security review findings, test results, iOS test
status, Android test status, known limitations, deferred work, exact production rollout checklist,
exact rollback procedure.

See [`REPORT.md`](REPORT.md).
