// ─── COMMERCIAL ROUGH-IN — DAY ONE ───────────────────────────────────────────
// Ten steps in the order a real first day happens.
//
// The rule that governs this file, and the reason it is a module rather than a
// list of screens: THE GAME IS NOT WHERE THE ELECTRICAL TRUTH GETS HAND-WAVED.
// Every step that touches wiring resolves to a real lesson and is graded by the
// same deterministic solver as the Wiring Simulator. Every step that asks for a
// number has an answer derived from a stated method, not from a plausible-
// looking figure typed into a game script.
//
// A player who wires the panel wrong is told by the engine exactly what would
// not have worked — the same message an apprentice would get on the bench.
//
// The ordering is the lesson as much as the content. You do not hang a panel
// before you have laid out, and you do not pull wire before the boxes are set.
// `requires` encodes that and `nextStep` walks it.
//
// Pure module: no React, no storage.

import { lessonById } from '../../circuit/lessons/index.js';

export const StepKind = Object.freeze({
  // No electrical content. Checking in, PPE, the walk. Real parts of a first
  // day, and pretending otherwise is how training games get a reputation.
  SITE: 'SITE',
  // Read something: prints, a panel schedule, a keynote.
  READ: 'READ',
  // Produce a number. Graded against a tolerance, with the method stated.
  CALC: 'CALC',
  // Wire something. Graded by the solver — never by comparing to a picture.
  WIRE: 'WIRE',
});

const step = (def) => Object.freeze({
  ...def,
  requires: Object.freeze(def.requires ?? []),
  // A wiring step must name a lesson; a calc step must state its method. The
  // catalog test enforces both, so a step cannot be added without one.
  lessonId: def.lessonId ?? null,
  method: def.method ?? null,
});

export const DAY_ONE = Object.freeze([
  step({
    id: 'd1-checkin', order: 1, kind: StepKind.SITE,
    title: 'Check in at the trailer',
    brief: 'Sign in, get your badge, find out where your gang box is going.',
    detail: 'Every commercial site starts here. The GC wants to know who is on the floor, and the foreman wants to know you found the right building.',
    character: 'dante', xp: 20, requires: [],
  }),
  step({
    id: 'd1-ppe', order: 2, kind: StepKind.SITE,
    title: 'PPE and the safety brief',
    brief: 'Hard hat, safety glasses, hi-vis, boots. Listen to the hazards for today.',
    detail: 'Steel is going up on the north side and there is a lift working the east bay. Where the other trades are is your problem too.',
    character: 'jerry', xp: 20, requires: ['d1-checkin'],
  }),
  step({
    id: 'd1-prints', order: 3, kind: StepKind.READ,
    title: 'Review the prints',
    brief: 'Find your area on E-101 and read the keynotes before you touch anything.',
    detail: 'The plan tells you device locations. The panel schedule tells you what feeds them. The keynotes tell you what the plan left out. Read all three or you will hang boxes twice.',
    tool: 'blueprint', toolHint: 'Blueprint Takeoff',
    character: 'renee', xp: 30, requires: ['d1-ppe'],
  }),
  step({
    id: 'd1-layout', order: 4, kind: StepKind.CALC,
    title: 'Lay out the device heights',
    brief: 'Receptacles at 18 inches to centre. Your box is 4 inches tall. What height is the bottom of the box?',
    detail: 'Layout is measured to the centre of the device, and the box is set from its bottom edge. Getting this backwards is the classic first-day rework.',
    method: 'Centre height minus half the box height: 18 − (4 ÷ 2).',
    unit: 'in', answer: 16, tolerance: 0.01,
    explain: '18 inches to centre, box is 4 inches tall, so the bottom of the box sits at 18 − 2 = 16 inches. Mark the bottom, not the middle — that is the edge your box actually references. Mounting heights are set by the drawings and the spec, not by the NEC, apart from accessibility requirements.',
    wrongNudge: 'You are given the height to the CENTRE of the device and the height of the box. Which edge does the box get set from?',
    tool: 'calculators',
    character: 'miguel', xp: 40, requires: ['d1-prints'],
  }),
  step({
    id: 'd1-boxes', order: 5, kind: StepKind.CALC,
    title: 'Size the boxes',
    brief: 'Four #12 conductors, one device, one equipment ground, one internal clamp. How many cubic inches?',
    detail: 'Set the box before you pull, and set one big enough that you are not fighting it at trim.',
    method: 'NEC 314.16(B): every #12 is 2.25 in³, the yoke counts twice, all grounds count once, all clamps count once.',
    unit: 'in³', answer: 18, tolerance: 0.01,
    explain: '4 conductors × 2.25 = 9.00. The device yoke counts as two allowances: 2 × 2.25 = 4.50. All equipment grounds together count as one: 2.25. All internal clamps together count as one: 2.25. Total 18.00 in³.',
    wrongNudge: 'The yoke counts as two conductors, and all the grounds together count as one — not one each.',
    tool: 'boxfill', toolHint: 'Box Fill',
    ref: 'NEC 314.16(B)',
    character: 'renee', xp: 50, requires: ['d1-layout'],
  }),
  step({
    id: 'd1-pipe', order: 6, kind: StepKind.CALC,
    title: 'Size the homerun pipe',
    brief: 'Nine #12 THHN in one EMT. What is the smallest trade size that stays under 40 percent?',
    detail: 'Pull the pipe once. Undersizing it is a day you do not get back.',
    method: 'Chapter 9: total conductor area against the TOTAL internal area of the conduit, limited to 40% for more than two conductors.',
    unit: 'in', answer: 0.5, tolerance: 0.01,
    explain: '9 × 0.0133 = 0.1197 in². Half-inch EMT has a total internal area of 0.304 in², and 0.1197 ÷ 0.304 = 39.4% — just under the 40% limit. Annex C Table C.1 agrees: nine #12 THHN is exactly the maximum for ½" EMT. Note the percentage is of the WHOLE pipe, not of the 40% column.',
    wrongNudge: 'Fill is a percentage of the conduit total area from Table 4. The 40% figure is the limit, not the denominator.',
    tool: 'conduitfill', toolHint: 'Conduit Fill',
    ref: 'NEC Chapter 9, Table 1',
    character: 'miguel', xp: 60, requires: ['d1-boxes'],
  }),
  step({
    id: 'd1-panel', order: 7, kind: StepKind.CALC,
    title: 'Derate the homerun',
    brief: 'Six current-carrying #12 THHN share that pipe. What ampacity are you allowed to protect them at?',
    detail: 'More than three current-carrying conductors in a raceway means an adjustment factor, and then the small-conductor rule has the last word.',
    method: 'Table 310.15(C)(1) adjustment on the 90°C ampacity, then the 240.4(D) small-conductor limit.',
    unit: 'A', answer: 20, tolerance: 0.01,
    explain: '12 AWG THHN is 30 A in the 90°C column. Four to six current-carrying conductors take an 80% adjustment: 30 × 0.80 = 24 A. But 240.4(D)(5) caps overcurrent protection for 12 AWG copper at 20 A regardless, so the answer is a 20 A breaker. The derating did not cost you anything here — it would have at seven conductors.',
    wrongNudge: 'Derate from the 90°C column, then check the small-conductor rule. One of them is more restrictive.',
    tool: 'ampacity', toolHint: 'Ampacity',
    ref: 'NEC 310.15(C)(1)',
    character: 'jerry', xp: 70, requires: ['d1-pipe'],
  }),
  step({
    id: 'd1-switch', order: 8, kind: StepKind.WIRE,
    title: 'Wire the office lighting',
    brief: 'Feed lands in the switch box. Get the light working and keep the grounded conductor out of the switch.',
    detail: 'The first device you wire on any job. Graded by the circuit engine across every switch position, not by matching a picture.',
    lessonId: 'single-pole-source-at-switch',
    tool: 'wiringlab', toolHint: 'Wiring Simulator',
    character: 'miguel', xp: 90, requires: ['d1-panel'],
  }),
  step({
    id: 'd1-corridor', order: 9, kind: StepKind.WIRE,
    title: 'Wire the corridor from both ends',
    brief: 'Two switches, one set of lights. Travelers between them, common on the feed.',
    detail: 'Every corridor on every commercial job. Get the commons right and the rest follows.',
    lessonId: 'three-way-source-at-switch',
    tool: 'wiringlab', toolHint: 'Wiring Simulator',
    character: 'renee', xp: 110, requires: ['d1-switch'],
  }),
  step({
    id: 'd1-walk', order: 10, kind: StepKind.SITE,
    title: 'Walk it before the inspector does',
    brief: 'Box heights, supports, home run labels, grounds bonded, nothing buried that has not been seen.',
    detail: 'The inspection you pass is the one you already walked yourself. Photograph the concealed work now — once the drywall is on, the photo is the only evidence you have.',
    tool: 'projects', toolHint: 'Projects → photos',
    character: 'dante', xp: 60, requires: ['d1-corridor'],
  }),
]);

export const LEVEL = Object.freeze({
  id: 'commercial-rough-in-day-one',
  title: 'Commercial Rough-In — Day One',
  sub: 'Ten steps, in the order the day actually happens',
  totalXp: DAY_ONE.reduce((a, s) => a + s.xp, 0),
  steps: DAY_ONE.length,
});

export const stepById = (id) => DAY_ONE.find((s) => s.id === id) ?? null;

export const emptyProgress = () => Object.freeze({ completed: [] });

export const sanitizeProgress = (raw) => {
  const ids = Array.isArray(raw?.completed) ? raw.completed : [];
  const valid = ids.filter((id) => typeof id === 'string' && stepById(id));
  return Object.freeze({ completed: Object.freeze([...new Set(valid)]) });
};

export const isUnlocked = (stepId, progress) => {
  const s = stepById(stepId);
  if (!s) return false;
  const done = sanitizeProgress(progress).completed;
  return s.requires.every((r) => done.includes(r));
};

export const isDone = (stepId, progress) =>
  sanitizeProgress(progress).completed.includes(stepId);

/** The next thing to do, or null when the day is finished. */
export const nextStep = (progress) => {
  const p = sanitizeProgress(progress);
  return DAY_ONE.find((s) => !p.completed.includes(s.id) && isUnlocked(s.id, p)) ?? null;
};

export const completeStep = (progress, stepId) => {
  if (!stepById(stepId)) return sanitizeProgress(progress);
  const p = sanitizeProgress(progress);
  if (p.completed.includes(stepId)) return p;
  return Object.freeze({ completed: Object.freeze([...p.completed, stepId]) });
};

export const levelProgress = (progress) => {
  const p = sanitizeProgress(progress);
  const done = DAY_ONE.filter((s) => p.completed.includes(s.id));
  return Object.freeze({
    done: done.length,
    total: DAY_ONE.length,
    percent: Math.round((done.length / DAY_ONE.length) * 100),
    xp: done.reduce((a, s) => a + s.xp, 0),
    complete: done.length === DAY_ONE.length,
  });
};

/** Grade a CALC step. Same tolerance discipline as the field tasks. */
export const gradeCalcStep = (stepId, rawInput) => {
  const s = stepById(stepId);
  if (!s || s.kind !== StepKind.CALC) return null;

  const value = typeof rawInput === 'number' ? rawInput : parseFloat(String(rawInput ?? '').replace(/[^0-9.\-]/g, ''));
  if (!Number.isFinite(value)) {
    return Object.freeze({ correct: false, empty: true, nudge: s.wrongNudge, explain: null });
  }
  const correct = Math.abs(value - s.answer) <= s.tolerance;
  return Object.freeze({
    correct,
    empty: false,
    value,
    expected: s.answer,
    unit: s.unit,
    // The explanation is shown either way. Getting it right without knowing why
    // is the thing this level exists to prevent.
    explain: s.explain,
    nudge: correct ? null : s.wrongNudge,
  });
};

/** The lesson a WIRE step is graded by. Null for every other kind. */
export const lessonForStep = (stepId) => {
  const s = stepById(stepId);
  if (!s || s.kind !== StepKind.WIRE || !s.lessonId) return null;
  return lessonById(s.lessonId);
};
