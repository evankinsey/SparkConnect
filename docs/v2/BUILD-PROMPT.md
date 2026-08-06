# SparkConnect v2 — Build Prompt

Hand this whole file to Claude as the task. It is written to be executed, not
admired: every section ends in acceptance criteria that a test can check.

Read `docs/v1.1/REQUIREMENTS.md` and `docs/v2/ROADMAP-100.md` first. Do not
duplicate machinery that already exists — extend it.

---

## PART 0 — THE SAFETY MANDATE (READ THIS BEFORE ANYTHING ELSE)

SparkConnect is no longer a calculator app. It teaches people how to wire
buildings. A person can copy what this app shows them into a real panel, in a
real building, with real people living in it afterwards.

**If this app teaches one wrong thing, someone can be killed.**

That is not a figure of speech and it is not a reason to be timid — it is a
reason to be rigorous. Every rule below is non-negotiable and outranks
schedule, scope, polish, and every other section of this document. If a feature
in Parts 1–5 cannot be built without violating Part 0, **do not ship that
feature** — ship the rest and report what you left out and why.

### 0.1 — The truth engine is the only authority

`src/circuit/solver.js` decides what is electrically true. It is deterministic:
netlist, union-find, truth tables. It does not guess and it cannot hallucinate.

- Nothing else in the app — not SparkAI, not a content pack, not a generated
  scenario, not a hand-authored lesson — may contradict the solver.
- When the solver and any other source disagree, **the solver wins and the
  other source is a bug**. Write a failing test, then fix the source.
- Any new educational surface (a new simulator level, a new troubleshooting
  scenario, a new lesson) must be *evaluable by the solver*. If you cannot
  express a concept as a circuit the solver can evaluate, you may not ship it
  as an interactive exercise. Ship it as text with a citation instead.

### 0.2 — What the AI is allowed to vary, and what it is never allowed to touch

This split is the single most important design decision in the codebase.
Encode it in the type system, not in a comment.

**AI MAY generate (narrative layer — cosmetic, zero electrical consequence):**

- room / building / customer names, time of day, weather
- the *dialogue* — how the customer describes the problem
- the *presentation* of a symptom ("the lights flicker when the AC kicks on")
- flavor text, encouragement, hints phrased in the approved vocabulary
- ordering and pacing of already-approved content

**AI MAY NEVER generate, invent, infer, or "helpfully complete":**

- conductor sizes / AWG
- breaker or OCPD sizes and types
- grounding or bonding methods
- neutral routing, and *especially* anything involving MWBCs
- switching logic (single-pole, 3-way, 4-way, travelers, commons)
- polarity, line vs. load orientation (GFCI line/load is a killer — literally)
- transformer connections, phasing, or wiring
- panel schedules, circuit directories, load calculations
- troubleshooting *steps*, root causes, or the correct fix
- NEC article numbers, table numbers, or code text
- anything that appears on screen as a diagram

Implement this as a hard boundary:

```
src/core/content/authority.js
  - ELECTRICAL_FIELDS: the frozen list of field names that are electrical truth
  - assertNarrativeOnly(patch): throws if a generated patch touches any of them
  - every generation path must call it; a test must prove each path calls it
```

A generated object that touches an electrical field is not "lower quality" —
it is **rejected and discarded**, and the app falls back to approved content.

### 0.3 — Fail closed, always

The failure mode of this app must be *silence*, never a guess.

- If confidence is not extremely high, the app says:
  > "I can't verify this. Check the NEC or ask a licensed instructor."
- If a content pack fails validation at load time, it does not load. It does
  not load partially. It does not load "with warnings."
- If an NEC citation cannot be resolved against the in-repo citation table, the
  citation is **stripped and the answer is degraded**, not shipped with a made-
  up reference. A confident wrong citation is worse than no citation, because
  it survives being screenshotted and passed around.
- Build the citation table: `src/nec/citations.js`, a frozen map of article →
  { title, editions }. `resolveCitation(ref)` returns null for anything not in
  it. Test: a sample of invented-looking refs all return null.

### 0.4 — Every level ships through the validator, before it ships at all

Extend `src/circuit/validator.js` so that **no** simulator level can enter the
catalog until it passes, mechanically, at authoring time — not at runtime:

- continuity to every intended load
- correct switching in **every** switch position (full truth table, not spot
  checks)
- neutral continuity, and no switched neutral anywhere, ever
- equipment grounding continuity to every device requiring it
- correct polarity; no reversed line/load on any GFCI or AFCI device
- no dead shorts in any switch position
- no open grounds
- no impossible or physically absurd connections
- terminal fill / conductor count per terminal is legal

Add `npm run validate:content` that walks every level, every pack, and every
troubleshooting scenario through the full battery and **exits non-zero** on any
failure. Wire it into the test run. A level that has not passed it is not in
the catalog — enforce that in code, not by convention.

### 0.5 — Human review gate stays, and the badge tells the truth

`src/circuit/review.js` already distinguishes `APPROVED_INTERNAL` (team
reviewed) from `APPROVED` (a named qualified person accepted attribution).
Keep that distinction and never blur it.

The user asked for a **Safety Verified** badge. Build it — but drive it from
the real review status, never paint it on:

- `APPROVED` (named licensed reviewer) → "Reviewed by {name}, {credential}"
- `APPROVED_INTERNAL` → "Validated by SparkConnect's rule engine and team review"
- anything else → **no badge, and the content is not reachable in production**

Badge body text:

> Validated against SparkConnect's electrical rule engine. Always comply with
> your local AHJ, your adopted NEC edition, and your employer's requirements.
> This is training material, not a substitute for the NEC or hands-on
> instruction under a qualified person.

A badge that can appear on unreviewed content is worse than no badge — it
launders a guess into an assurance. Test that the badge component cannot render
for any status below `APPROVED_INTERNAL`.

### 0.6 — Acceptance criteria for Part 0

- [ ] `assertNarrativeOnly` exists, is called on every generation path, and a
      test proves each path calls it
- [ ] a test feeds a generated payload containing every electrical field and
      asserts every one is rejected
- [ ] `npm run validate:content` exists, runs in CI, and fails the build on any
      invalid level
- [ ] a deliberately broken level (switched neutral, reversed GFCI line/load,
      open ground, dead short — one test each) is caught by the validator
- [ ] `resolveCitation` returns null for unknown refs; no UI renders an
      unresolved citation
- [ ] the Safety Verified badge cannot render below `APPROVED_INTERNAL`
- [ ] the low-confidence path renders the exact "I can't verify this" copy

---

## PART 1 — HOME: STOP HIDING THE APP BEHIND "CUSTOMIZE"

**The problem.** `useHomeLayout` restores a *saved* layout, and `sanitizeLayout`
keeps only ids already in it. So every feature added after a user's first launch
was invisible to them forever. Three shipped features (Blueprint Takeoff, Permit
Assistant, Panel Schedule) were lost this way and looked like they had never
shipped. `LAYOUT_VERSION` / `migrateLayout` (commit `a4a9bf0`) patches the
symptom. Part 1 fixes the cause.

**The cause:** discovery depends on a saved list. It must not.

### 1.1 — Home has two zones

1. **Your Cards** (top) — the saved, reorderable layout. Customize controls
   *this only*. This is the user's arrangement and stays theirs.
2. **All Tools** (bottom) — **every** card in `HOME_CARDS`, grouped, always
   rendered, never filtered by the saved layout, never affected by Customize.

Customize becomes *ordering and favorites*, never *visibility*. A tool that
exists in the bundle is reachable from Home on the very first scroll, on every
install, forever. Adding a card to `HOME_CARDS` must make it reachable with
**zero** migration work — write the test that proves it.

Order in "All Tools", per the brief: Daily Question · Quick Tools · SparkAI ·
Wiring Simulator · Troubleshooting · Job Site · Projects · Estimator · Permit
Assistant · Blueprint Takeoff · Panel Schedule · Material Lists · Calculators.

### 1.2 — Acceptance criteria

- [ ] a user whose saved layout is `[]` can still reach every card from Home
- [ ] a test enumerates `HOME_CARDS` and asserts each id renders on Home
      regardless of saved layout
- [ ] a test adds a fake card to the catalog and asserts it appears on Home
      with no migration entry
- [ ] every `tab` in `HOME_CARDS` is in `VALID_TABS` (keep the existing guard)
- [ ] Customize can reorder and favorite; it can no longer make a tool
      unreachable

---

## PART 2 — LEARN BECOMES TOOLS; LEARNING MOVES INSIDE THE TOOLS

A standalone "Learn" tab competes with the tools instead of serving them.
Nobody opens an app to "learn" — they open it to bend a pipe, and *then* want
to know why the shrink is what it is.

- Rename the tab-bar slot `learn` → **Tools**. It lists every tool, grouped.
- Each tool screen grows tabs of its own: **Lessons · Do it · Practice/Quiz**
  - Pipe Bending → Lessons · Calculator · Practice · Quiz
  - Wiring Simulator → Lessons · Simulation · Challenges
  - SparkAI → Ask · Recent · Saved
- The old Learn content is not deleted — it is *re-parented* to the tool it
  belongs to. Nothing loses its review status in the move; carry the status
  with the content.
- "Learn" survives as a card on Home for anyone who wants the index.

**Acceptance:** no orphaned lesson (every lesson resolves to a parent tool);
tab-bar has no `learn` slot; deep links to `learn` redirect to `tools`.

---

## PART 3 — PROJECTS ABSORBS JOB CAM (CONTRACTORS THINK IN JOBS, NOT FEATURES)

Nobody thinks "I want Job Cam." They think **"I'm working on Starbucks."**
Everything about Starbucks belongs in one place.

**Projects** becomes the container. A project holds:

customer · address · AHJ · permit # · estimate · material list · blueprint
takeoff · photos (this is Job Cam, now a feature *inside* a project) · notes ·
saved calculations · panel schedules · invoices (future) · warranty ·
inspection history · AI summaries · the SparkAI chats about this job

- Job Cam stops being a tab and becomes the **camera action inside a project**.
  Keep the name "Job Cam" for the camera itself — it is a good name for a
  camera; it is a bad name for a filing system.
- Any calculation, estimate, takeoff or panel schedule gets **"Save to
  project"**. That is the whole moat: a competitor can copy a calculator in a
  weekend and cannot copy three years of a contractor's job history.
- Existing standalone Job Cam photos must migrate into an "Unfiled" project.
  **Do not lose a single photo.** Migration is one-way, idempotent, and tested
  against a fixture of the current on-disk shape.
- Photos stay on-device. Do not change the privacy posture documented in
  App.js — the only path that uploads an image is still the one the user
  explicitly taps in SparkAI, and the privacy copy must stay accurate.

**Acceptance:** migration test with existing photos → all present, none
duplicated, re-running changes nothing; every calculator has a working "Save to
project"; privacy copy still matches actual behavior.

---

## PART 4 — PERMIT ASSISTANT: THE AI DOES THE TYPING, THE USER DOES THE TRUSTING

Today it interrogates the user. It should work the other way: user types
"Tampa" or "Hillsborough County," and the app proposes AHJ, permit office
phone, website, inspection line, adopted code cycle, known local amendments,
typical inspection order, and forms.

**This is the highest-risk AI surface in the app** and Part 0 applies at full
force. A wrong phone number wastes an afternoon. A wrong *adopted code cycle*
makes every downstream answer wrong in a way the user cannot see.

Therefore:

- Every AI-proposed field renders as **Unverified** — visibly, not subtly —
  until the user confirms it. Unverified fields are styled as a draft, carry a
  "verify" affordance, and are excluded from any export, PDF, or share.
- Adopted code cycle and local amendments get the strongest treatment: they
  are proposed with a direct link to the AHJ's own page and the line
  "Confirm with the AHJ before relying on this."
- Known-good AHJ data ships as a curated in-repo table
  (`src/core/field/ahj.js`) and is preferred over generation. AI fills gaps
  only, and never overwrites a curated value.
- Nothing here is presented as fact by the app. The app presents a *starting
  point the user checks*, and the UI must make that unmistakable.

**Acceptance:** unverified fields cannot be exported or shared; curated data
always wins over generated; a low-confidence lookup produces the "can't verify"
state rather than a plausible guess.

---

## PART 5 — JOB SITE GAME: MAKE IT A COMMERCIAL ROUGH-IN, NOT A MAZE

The top-down rebuild (`src/core/game/topdown.js`, `src/screens/topdownArt.js`)
fixed the camera and the controls. Keep both:

- **True top-down. No isometric.** Screen up is world up, one-to-one. This is
  what makes the joystick intuitive and it is settled — do not revisit it.
- Floating joystick, dead zone, no diagonal speed boost. Settled.

What is still wrong: **it reads as a maze with decoration, not a building
under construction.** Fix that.

### 5.1 — Framing must read as steel stud

Not decorative lines. Actual light-gauge framing:

- top and bottom **track**, visibly distinct from the studs
- studs at real spacing (16" o.c.), punched with service holes
- **door bucks** and framed rough openings, with king studs and headers
- open cavities you can see the slab through — a wall is a comb, not a block
- unfinished ceiling: open bar joists / deck above, not a lid

### 5.2 — The site must read as a jobsite

Inside: material stacks, gang boxes (some already installed in the wall),
strut, conduit racks and EMT runs, A-frame ladders, pallets, wire carts and
reels, a print table, drywall stacks, cones, unfinished slab with layout
chalk lines.

Outside: sky, daylight, trees, construction fencing with scrim, a site
trailer, a dumpster, a work truck, a crane in the distance. **The edge of the
building must never be the edge of the world.**

### 5.3 — Characters must be people

Legs, arms, hi-vis vest, hard hat, tool pouch, boots. A **walking animation**
that reads at a glance. A drop shadow. An unmistakable facing direction. Not
blobs, not portrait bubbles.

### 5.4 — The Day One level (still owed)

Build **"Commercial Rough-In — Day One"**: ten ordered steps that mirror a real
first day — check in, PPE, review prints, layout, sleeve/box the walls, pull
strut, hang panel, land the feeder, dress the panel, walk the inspection.

Every step that touches wiring is **evaluated by the solver** (Part 0.1) and
passes `npm run validate:content` (Part 0.4). The game may not be the one place
where the electrical truth is hand-waved because it is "just a game." A player
who wires the panel wrong in the game must be told, by the engine, exactly what
would not have worked.

### 5.5 — Acceptance criteria

- [ ] a screenshot of the walls is unambiguously steel stud framing with
      track, studs, and open cavities
- [ ] no camera position anywhere on the map shows a void beyond the building
- [ ] the player and every crew member has a visible walk cycle, PPE, and
      facing
- [ ] the Day One level exists, has ten steps, and is completable
- [ ] every wiring step in it is solver-evaluated and validator-clean
- [ ] existing `tests/topdown.test.js` still passes unchanged

---

## PART 6 — WIRING SIMULATOR IS THE FRANCHISE; INVEST ACCORDINGLY

This is the strongest thing in the app. Target curriculum, in rough order of
difficulty. Each one ships only after Part 0.4 (validator) and Part 0.5
(review gate):

series · parallel · single-pole · three-way · four-way · half-switched
receptacle · GFCI line/load · AFCI · smoke detectors (interconnect) · doorbell
transformer · fan/light combo · **MWBC** · 3-phase motor starter · contactor ·
relay logic · lighting contactor · occupancy sensor · photocell · service
disconnect

Two of these deserve extra scrutiny because they are the ones that hurt people:

- **MWBC** — the handle-tie / simultaneous-disconnect requirement and the
  consequence of an open shared neutral are the entire lesson. Get them right.
- **GFCI line/load** — reversed line/load is the classic field failure. The
  validator must catch it and the lesson must explain what it looks like in
  the field.

Ship them one at a time, fully validated. Ten correct levels beat twenty
plausible ones — and twenty plausible ones is how someone gets hurt.

---

## PART 7 — ORDER OF WORK

1. **Part 0** — safety machinery. Nothing else starts until this is green.
2. **Part 1** — Home surfacing. Cheapest, largest user-visible win; makes every
   already-shipped feature discoverable.
3. **Part 3** — Projects absorbs Job Cam. Do the migration carefully.
4. **Part 2** — Learn → Tools.
5. **Part 4** — Permit AHJ autofill.
6. **Part 5** — Job site art + Day One level.
7. **Part 6** — Wiring Simulator curriculum, one level at a time, forever.

Ship each part as its own commit with its own tests. Never batch Part 0 with a
feature commit — the safety work must be reviewable on its own.

---

## THE STANDING RULE

When you are unsure whether something is electrically correct: **you do not
ship it.** You do not approximate it, you do not caveat it, and you do not let
a language model fill the gap. You write down what you could not verify, you
ship everything else, and you say plainly what you left out.

Being incomplete is recoverable. Being confidently wrong is not.
