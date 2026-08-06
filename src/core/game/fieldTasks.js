// ─── GRADED FIELD TASKS ──────────────────────────────────────────────────────
// The fix for the job site feeling pointless.
//
// Before this, walking up to the truck and opening Job Cam signed the station
// off whether or not you photographed anything, and the bench signed off
// whether or not you worked out a single mark. The crew asked for work and
// then accepted nothing. That is the difference between a game and a menu with
// portraits on it.
//
// A field task states a SPECIFIC problem in the character's voice, and has an
// answer that is checked. You can still use the real calculator to get there —
// that is the point, the job teaches you the tool — but you have to come back
// with the number.
//
// Every expected answer here is recomputed by tests/fieldTasks.test.js using
// the same formulas App.js uses, so a task can never drift out of agreement
// with the calculator the player is told to use.
//
// Pure module: no React, no storage.

export const FieldTaskKind = {
  CALC: 'CALC',     // answer a specific number, checked against a tolerance
  PHOTO: 'PHOTO',   // actually add a photo, checked by counting before/after
};

/**
 * `tolerance` is absolute, in the answer's unit, and is deliberately tight —
 * loose enough to forgive rounding at two decimals, tight enough that a wrong
 * method cannot pass.
 */
export const FIELD_TASKS = Object.freeze([
  {
    id: 'ft-offset',
    stationId: 'st-bench',
    kind: FieldTaskKind.CALC,
    character: 'miguel',
    ask: 'Beam is in the way. I need a 6 inch offset at 30 degrees. How far apart are my two bend marks?',
    given: ['Offset height: 6 in', 'Bend angle: 30°'],
    tool: 'bend',
    toolHint: 'Pipe Bending → Offset',
    unit: 'in',
    answer: 12,
    tolerance: 0.05,
    explain: 'At 30° the multiplier is 2.0, so mark spacing is 6 × 2.0 = 12 inches. Shrink is 6 × 0.13 = 0.78 inches — take it off the far end, not between the marks.',
    wrongNudge: 'Multiply the offset height by the multiplier for your angle. At 30° that multiplier is 2.',
  },
  {
    id: 'ft-voltage-drop',
    stationId: 'st-shed',
    kind: FieldTaskKind.CALC,
    character: 'renee',
    ask: 'Run to the shed is 50 feet, 12 AWG copper, 20 amp load on a 120 volt single-phase circuit. How many volts am I dropping?',
    given: ['12 AWG copper', '20 A load', '50 ft one way', '120 V single phase'],
    tool: 'volt',
    toolHint: 'Voltage Drop',
    unit: 'V',
    answer: 3.96,
    tolerance: 0.06,
    explain: 'Drop = amps × resistance × distance × 2 ÷ 1000. 12 AWG copper is 1.98 Ω per 1000 ft, so 20 × 1.98 × 50 × 2 ÷ 1000 = 3.96 V. That is 3.3% of 120 V — inside the 3% recommendation for a branch circuit only if you round in your own favour, so it is worth a second look.',
    wrongNudge: 'Single phase doubles the distance, because the current goes out and comes back. Resistance is per 1000 feet.',
  },
  {
    id: 'ft-box-fill',
    stationId: 'st-mockup',
    kind: FieldTaskKind.CALC,
    character: 'jerry',
    ask: 'Six 12 AWG conductors into the box, two grounds, one duplex receptacle, no clamps. What volume do I need, in cubic inches?',
    given: ['6 × 12 AWG conductors', '2 equipment grounds', '1 duplex receptacle', 'No cable clamps'],
    tool: 'boxfill',
    toolHint: 'Box Fill',
    unit: 'in³',
    answer: 20.25,
    tolerance: 0.05,
    explain: 'NEC 314.16(B): each 12 AWG conductor is 2.25 in³, so six is 13.50. All equipment grounds together count once — 2.25. A yoke counts double — 4.50. Total 20.25 in³.',
    wrongNudge: 'Grounds are not counted one each. All of them together count as a single conductor volume, and a device counts as two.',
  },
  {
    id: 'ft-jobcam',
    stationId: 'st-truck',
    kind: FieldTaskKind.PHOTO,
    character: 'owner',
    ask: 'Before you leave — I need a photo of the rough-in on file. Open Job Cam and add the shot.',
    given: [],
    tool: 'jobcam',
    toolHint: 'Job Cam',
    explain: 'Documentation is what protects you when someone asks in six months whether that was there before you arrived.',
    wrongNudge: 'Nothing was added. Open Job Cam and take or attach a photo, then come back.',
  },
]);

export const fieldTaskById = (id) => FIELD_TASKS.find((t) => t.id === id) ?? null;
export const fieldTaskForStation = (stationId) => FIELD_TASKS.find((t) => t.stationId === stationId) ?? null;

/**
 * Parse what the player typed. Accepts a bare number with optional unit text,
 * commas, and a leading currency-style sign, because people type "12 in" and
 * "3.96V" and both are the right answer.
 */
export const parseAnswer = (raw) => {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  const m = raw.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
};

/**
 * Grade a CALC task.
 * Returns { ok:false } for an unknown task, otherwise
 * { ok:true, correct, message, expected? }. `expected` is only ever populated
 * once they have it right — a wrong answer gets the nudge, not the number,
 * which is the same rule the wiring lessons follow.
 */
export const gradeFieldTask = (taskId, rawInput) => {
  const task = fieldTaskById(taskId);
  if (!task) return { ok: false, reason: 'unknown task' };
  if (task.kind !== FieldTaskKind.CALC) return { ok: false, reason: 'not a calculation task' };

  const value = parseAnswer(rawInput);
  if (value === null) {
    return { ok: true, correct: false, message: 'Enter the number you worked out.' };
  }
  const correct = Math.abs(value - task.answer) <= task.tolerance;
  return {
    ok: true,
    correct,
    message: correct ? task.explain : task.wrongNudge,
    expected: correct ? task.answer : undefined,
  };
};

/**
 * Grade a PHOTO task. The count must have gone UP during the task — having
 * old photos on file is not doing the work the Owner asked for.
 */
export const gradePhotoTask = (taskId, countBefore, countAfter) => {
  const task = fieldTaskById(taskId);
  if (!task) return { ok: false, reason: 'unknown task' };
  if (task.kind !== FieldTaskKind.PHOTO) return { ok: false, reason: 'not a photo task' };

  const before = Number.isInteger(countBefore) && countBefore >= 0 ? countBefore : 0;
  const after = Number.isInteger(countAfter) && countAfter >= 0 ? countAfter : 0;
  const correct = after > before;
  return {
    ok: true,
    correct,
    message: correct ? task.explain : task.wrongNudge,
  };
};
