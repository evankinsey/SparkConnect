# Wiring Lesson — Human Technical Review

Requirements: REV-09, REV-11, REV-14, DOD-13, DOD-16.

**Nothing in this file may be filled in by an engineer or by an AI.** A lesson
becomes visible to users only when a qualified electrician or instructor works
through this checklist and signs it.

## Current review queue

| Lesson | Version | Status | Production visible |
|---|---|---|---|
| `single-pole-source-at-switch` | 1 | NEEDS_ELECTRICAL_REVIEW | ❌ |
| `single-pole-source-at-light` | 1 | NEEDS_ELECTRICAL_REVIEW | ❌ |
| `three-way-source-at-switch` | 1 | NEEDS_ELECTRICAL_REVIEW | ❌ |
| `three-way-source-at-light` | 1 | NEEDS_ELECTRICAL_REVIEW | ❌ |
| `four-way-three-location` | 1 | NEEDS_ELECTRICAL_REVIEW | ❌ |

`productionLessons()` returns `[]` while that column is all ❌. This is asserted
by `tests/circuit.test.js` — "no lesson is production-visible, even though all
tests pass".

## What engineering has and has not established

**Established** (`npm test`):

- Each lesson's stated solution satisfies the deterministic solver
- Truth tables computed across every switch-state combination (2 / 4 / 8 states)
- The load toggles from every switch location in each multi-location lesson
- Known failure modes are rejected: common/traveler reversal, open traveler,
  split traveler pair, missing neutral, missing switched leg, missing EGC,
  line-neutral short, duplicate and self connections
- Electrically equivalent alternatives are accepted, not falsely failed
- Recolouring a broken circuit does not make it pass (SIM-10)

**Not established.** Engineering testing proves the engine agrees with the lesson
author. It cannot prove the lesson teaches correct, safe, code-compliant
practice. That is what this review is for (REV-14).

## Per-lesson checklist (REV-11)

Copy this block per lesson. Every line needs an explicit answer.

```
Lesson id:
Lesson version:
Reviewer name:
Reviewer qualification (licence / instructor credential):
Review date:

 1. Source path correct?                                    [ ] yes  [ ] no
 2. Load path correct?                                      [ ] yes  [ ] no
 3. Neutral path correct?                                   [ ] yes  [ ] no
 4. Equipment grounding represented?                        [ ] yes  [ ] no
 5. All switch states tested?                               [ ] yes  [ ] no
 6. Multiple valid topologies considered?                   [ ] yes  [ ] no
 7. Conductor re-identification caveats considered?         [ ] yes  [ ] no
 8. Manufacturer-specific differences avoided?              [ ] yes  [ ] no
 9. NEC references stated carefully?                        [ ] yes  [ ] no
10. Local code / AHJ disclaimer included?                   [ ] yes  [ ] no
11. Safety language included?                               [ ] yes  [ ] no
12. No energized-work encouragement?                        [ ] yes  [ ] no
13. Reviewed by qualified electrician / instructor?         [ ] yes  [ ] no

Hint sequence reviewed (levels 1–5)?                        [ ] yes  [ ] no
Failure messages reviewed for accuracy and tone?            [ ] yes  [ ] no

Outstanding concerns:

Decision:  [ ] APPROVED   [ ] CHANGES_REQUESTED   [ ] RETIRED
```

## Reference notes needing verification (REV-13, D-07)

These carry `verified: false` in the lesson data. They are labelled rather than
cited, because inventing a section number is forbidden. A reviewer should either
supply the correct citation for the adopted edition or confirm the general label
is right.

| Lesson | Note | Current citation |
|---|---|---|
| `single-pole-source-at-light` | Re-identification of conductors in a switch loop | *(none — needs verification)* |
| `three-way-source-at-switch` | Three-way switch definition | `NEC Article 100` — confirm wording and edition |
| `three-way-source-at-light` | Conductor re-identification in cable assemblies | *(none — needs verification)* |
| `four-way-three-location` | Four-way switch definition | `NEC Article 100` — confirm wording and edition |

## Recording an approval

Approval is applied through `applyHumanApproval()` in `src/circuit/review.js`,
which **throws** unless it is given a named reviewer and a review date. Do not
edit the seeded review fields by hand.

```js
applyHumanApproval(lesson, {
  reviewer: 'Full name, licence or credential',
  reviewDate: 'YYYY-MM-DD',
  notes: 'Anything the reviewer wants recorded',
});
```

After approval the lesson still needs its feature flag enabled
(`wiringSimulationsEnabled` / `fourWaySimulationEnabled`) before users see it —
two independent gates, by design.
