// ─── BEFORE THE INSPECTOR ARRIVES ────────────────────────────────────────────
// What usually gets looked at, what usually fails, and what to ask.
//
// THE LINE THIS MODULE IS BUILT AROUND, and it is the reason it is a separate
// file from ahj.js: two of the four things people want here are trade-general
// and two are jurisdictional, and mixing them is exactly how an app starts
// telling somebody what their city requires when it has no idea.
//
//   SHIPPABLE AS CONTENT — the same in every jurisdiction, because it is what
//   the conductor, the box or the breaker itself demands:
//     · a cable stapled within eight inches of a box is unsupported everywhere
//     · a missing nail plate is a missing nail plate in every county in America
//     · box fill is arithmetic
//   These are things the electrician can check THEMSELVES before calling, which
//   is the entire value: a failed inspection costs a week, and most of them are
//   caught by walking the job once with the right list.
//
//   NOT SHIPPABLE — different in every jurisdiction, invisible when wrong:
//     · how long scheduling takes
//     · what time the inspector shows up, and whether you must be there
//     · which inspections they actually do for this scope
//   The honest product for these is a question and a place to write down the
//   answer, which is what ahj.js already does. Guessing "usually 2-3 business
//   days" would be a number somebody plans a crew around.
//
// So: fail reasons are content, turnaround is a recorded field, and this module
// refuses to blur them. `checklist()` returns only the first kind.
//
// NOTHING HERE IS A GUARANTEE. Passing every item on this list does not mean
// passing an inspection, and the disclaimer says so rather than implying a
// clean checklist buys anything.
//
// Pure module: no React, no network, no storage.

import { WORK_TYPES, workTypeById } from './permits.js';
import { resolveCitation } from '../../nec/citations.js';

/** Where in the job an item gets looked at. */
export const Stage = Object.freeze({
  ROUGH: 'ROUGH',       // open walls, before cover
  SERVICE: 'SERVICE',   // service equipment and the grounding electrode system
  FINAL: 'FINAL',       // devices, trim, labelling
});

export const STAGE_LABEL = Object.freeze({
  ROUGH: 'Rough-in',
  SERVICE: 'Service / pre-energize',
  FINAL: 'Final',
});

/**
 * The things that actually get written on a correction notice.
 *
 * `check` is phrased as something to DO, not something to know — the item earns
 * its place by being verifiable with a tape measure, a screwdriver or a count,
 * standing in the room, before anybody schedules anything.
 *
 * `ref` is a citation only where one resolves in our own register. An
 * unresolvable citation is indistinguishable from an invented one, so it is
 * dropped rather than displayed, exactly as everywhere else in the app.
 */
export const FAIL_REASONS = Object.freeze([
  {
    id: 'box-fill',
    stage: Stage.ROUGH,
    title: 'Too many conductors in the box',
    check: 'Count every conductor, device yoke, clamp and ground in each box and run the box fill calculator on the tight ones.',
    ref: '314.16',
    tags: ['new-circuit', 'remodel', 'commercial-ti', 'repair-replace'],
  },
  {
    id: 'cable-support',
    stage: Stage.ROUGH,
    title: 'Cable not supported near the box',
    check: 'Walk the rough and confirm every cable is secured within the required distance of each box and at its regular interval along the run.',
    ref: '334.30',
    tags: ['new-circuit', 'remodel', 'commercial-ti'],
  },
  {
    id: 'nail-plates',
    stage: Stage.ROUGH,
    title: 'No protection where cable crosses framing',
    check: 'Look at every stud and joist bore. Anything closer to the face than the required setback needs a steel plate.',
    ref: '300.4(A)(1)',
    tags: ['new-circuit', 'remodel', 'commercial-ti'],
  },
  {
    id: 'box-flush',
    stage: Stage.ROUGH,
    title: 'Box set back from the finished surface',
    check: 'Check every box against the finish that is going on — drywall thickness, tile, panelling.',
    ref: '314.20',
    tags: ['new-circuit', 'remodel', 'commercial-ti'],
  },
  {
    id: 'conductor-length',
    stage: Stage.ROUGH,
    title: 'Not enough free conductor at the box',
    check: 'Pull each conductor out of the box and check there is enough to work with outside the opening.',
    ref: '300.14',
    tags: ['new-circuit', 'remodel', 'commercial-ti'],
  },
  {
    id: 'afci-gfci',
    stage: Stage.FINAL,
    title: 'Missing AFCI or GFCI protection',
    check: 'Walk every new outlet against the room it is in, then test every GFCI and AFCI device with its own button.',
    ref: '210.8',
    tags: ['new-circuit', 'remodel', 'panel-swap', 'commercial-ti'],
  },
  {
    id: 'panel-schedule',
    stage: Stage.FINAL,
    title: 'Panel not legibly labelled',
    check: 'Fill in the directory with what each breaker actually controls — not "lights" and "plugs".',
    ref: '408.4(A)',
    tags: ['service-change', 'panel-swap', 'new-circuit', 'commercial-ti'],
  },
  {
    id: 'working-space',
    stage: Stage.SERVICE,
    title: 'Working clearance in front of the equipment is blocked',
    check: 'Measure the depth, width and headroom in front of the panel with everything that will be there in place — shelving, water heater, storage.',
    ref: '110.26(A)(1)',
    tags: ['service-change', 'panel-swap', 'commercial-ti'],
  },
  {
    id: 'grounding-electrode',
    stage: Stage.SERVICE,
    title: 'Grounding electrode system incomplete',
    check: 'Confirm every electrode present at the building is bonded, and that the conductor is sized and continuous.',
    ref: '250.52(A)(5)',
    tags: ['service-change', 'panel-swap', 'solar-storage'],
  },
  {
    id: 'neutral-ground-bond',
    stage: Stage.SERVICE,
    title: 'Neutral and ground bonded in the wrong place',
    check: 'Confirm the bond exists at the service disconnect and NOWHERE downstream — check every subpanel for a bonding screw left in.',
    ref: '250.4(A)(5)',
    tags: ['service-change', 'panel-swap', 'remodel'],
  },
  {
    id: 'terminations',
    stage: Stage.FINAL,
    title: 'Terminations not torqued or made up',
    check: 'Torque to the value printed on the equipment, and open every junction box to confirm nothing is left twisted and uncapped.',
    ref: '110.14(D)',
    tags: ['service-change', 'panel-swap', 'new-circuit', 'commercial-ti', 'ev-charger'],
  },
  {
    id: 'covers-blanks',
    stage: Stage.FINAL,
    title: 'Open boxes or missing blanks',
    check: 'Walk the whole job for junction boxes without covers and knockouts without blanks — including in the attic and the crawl.',
    ref: '314.25',
    tags: ['new-circuit', 'remodel', 'commercial-ti', 'repair-replace'],
  },
  {
    id: 'access',
    stage: Stage.ROUGH,
    title: 'Splices where nobody can reach them',
    check: 'Confirm every junction box will still be accessible after the finish goes on.',
    ref: '314.29',
    tags: ['new-circuit', 'remodel', 'commercial-ti'],
  },
  {
    id: 'ev-load-calc',
    stage: Stage.SERVICE,
    title: 'No load calculation for the added continuous load',
    check: 'Have the calculation on paper and on site, showing the existing load and the addition.',
    ref: '220.12',
    tags: ['ev-charger', 'solar-storage', 'service-change'],
  },
]);

/**
 * The reasons that apply to this work, with unresolvable citations dropped.
 *
 * A `ref` that our register cannot resolve is not shown as a bare string,
 * because a code section a reader cannot look up is worth less than nothing —
 * it looks authoritative and cannot be checked.
 */
export const failReasonsFor = (workTypeId, { stage = null, edition = null } = {}) => {
  const rows = FAIL_REASONS
    .filter((r) => !workTypeId || r.tags.includes(workTypeId))
    .filter((r) => !stage || r.stage === stage)
    .map((r) => {
      const hit = r.ref ? resolveCitation(r.ref, edition) : null;
      return Object.freeze({
        id: r.id,
        stage: r.stage,
        stageLabel: STAGE_LABEL[r.stage],
        title: r.title,
        check: r.check,
        reference: hit ? Object.freeze({ ref: hit.ref, display: hit.display, topic: hit.topic }) : null,
      });
    });
  return Object.freeze(rows);
};

/**
 * A checklist to walk the job with, grouped by stage.
 *
 * `youCanCheckThisYourself` is true for everything here, and that is the claim
 * worth making: none of it needs the inspector's opinion, a phone call, or a
 * jurisdiction we have not confirmed.
 */
export const checklist = (workTypeId, { edition = null } = {}) => {
  const work = workTypeById(workTypeId);
  const rows = failReasonsFor(workTypeId, { edition });

  const byStage = [Stage.ROUGH, Stage.SERVICE, Stage.FINAL]
    .map((stage) => Object.freeze({
      stage,
      label: STAGE_LABEL[stage],
      items: Object.freeze(rows.filter((r) => r.stage === stage)),
    }))
    .filter((g) => g.items.length > 0);

  return Object.freeze({
    workType: work ? Object.freeze({ id: work.id, label: work.label }) : null,
    // The inspections the work type declares. Still labelled as typical, because
    // which ones a jurisdiction actually performs is theirs to say.
    typicalInspections: Object.freeze(work?.inspections ?? []),
    inspectionsCaveat: 'These are the inspections this kind of work usually gets. '
      + 'Which ones your jurisdiction performs, and in what order, is theirs to confirm.',
    groups: Object.freeze(byStage),
    total: rows.length,
    youCanCheckThisYourself: true,
    disclaimer: PREP_DISCLAIMER,
  });
};

export const PREP_DISCLAIMER =
  'These are the corrections that come up most often, not a list of what your inspector will '
  + 'check. Working through it does not guarantee a pass, and it is not a substitute for the '
  + 'adopted code, the approved plans, or the authority having jurisdiction.';

// ─── The things we will not guess ────────────────────────────────────────────

/**
 * Turnaround, scheduling and attendance.
 *
 * DELIBERATELY QUESTIONS RATHER THAN ANSWERS. "Usually two to three business
 * days" is a number a person builds a crew schedule around, and we do not know
 * it for a single jurisdiction. Each of these maps to a field the user records
 * once and keeps, which is worth more than a national average would be even if
 * we had one.
 */
export const SCHEDULING_QUESTIONS = Object.freeze([
  {
    id: 'turnaround',
    ask: 'How far out are you scheduling inspections right now?',
    why: 'This is the number that decides whether the drywall crew comes Thursday or next week.',
    record: 'notes',
  },
  {
    id: 'cutoff',
    ask: 'What is the cutoff to get on tomorrow’s list, and can I request a morning slot?',
    why: 'A request made twenty minutes late costs a day.',
    record: 'notes',
  },
  {
    id: 'attendance',
    ask: 'Does someone have to be on site, and does the panel need to be accessible if nobody is?',
    why: 'Turning up to a locked house is the most avoidable failed inspection there is.',
    record: 'inspectionTips',
  },
  {
    id: 'reinspection',
    ask: 'If something is corrected, is there a re-inspection fee, and how quickly can you come back?',
    why: 'Decides whether a small correction is worth arguing about or just fixing.',
    record: 'inspectionTips',
  },
  {
    id: 'partial',
    ask: 'Will you do a partial rough if only part of the job is ready?',
    why: 'On a phased job this is the difference between one trip and three.',
    record: 'inspectionOrder',
  },
]);

/**
 * The whole call, in the order you would actually say it.
 *
 * The work type's own `asks` come first because they are specific to the scope,
 * then the scheduling questions, then the one that matters most and is easiest
 * to forget: which code edition, and are there amendments.
 */
export const callScript = (workTypeId) => {
  const work = workTypeById(workTypeId);
  const scope = (work?.asks ?? []).map((ask) => Object.freeze({
    ask, group: 'This job', why: null,
  }));

  const scheduling = SCHEDULING_QUESTIONS.map((q) => Object.freeze({
    ask: q.ask, group: 'Scheduling', why: q.why, record: q.record,
  }));

  return Object.freeze({
    workType: work ? Object.freeze({ id: work.id, label: work.label }) : null,
    questions: Object.freeze([
      ...scope,
      ...scheduling,
      // Last, because it is the one people ring back about, and because being
      // wrong about it is silent: every code answer downstream is confidently
      // wrong and nobody finds out until inspection.
      Object.freeze({
        ask: 'Which NEC edition are you enforcing today, and is there a local amendment package on top of it?',
        group: 'Code',
        why: 'Everything the app tells you about code depends on this answer, and being wrong '
          + 'about it does not look like anything until inspection.',
        record: 'codeEdition',
      }),
    ]),
    note: 'Write the answers down as they are given. Anything recorded here is marked as '
      + 'confirmed by you, and it is what the app uses for this jurisdiction from then on.',
  });
};

export { WORK_TYPES };
