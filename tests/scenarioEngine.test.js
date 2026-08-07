// ─── SCENARIO ENGINE TESTS ───────────────────────────────────────────────────
// These do not check that the generator produces output. They check that it
// cannot produce a scenario that is electrically false:
//
//   · the fault is actually injected (a target the injector cannot match is the
//     silent failure that makes every "scenario" a picture of a healthy circuit)
//   · the symptom is what the solver says, not what a string says
//   · "why that answer is wrong" is a difference the engine can point at
//   · a fault that cannot be ruled out is never presented as a wrong answer
//   · a scenario id always produces the same scenario

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  enumerateFaults, isObservable, lessonProfile, meterReadings, readingsAcrossStates,
  contrast, whyWrong, WhyBasis, difficultyFor, Difficulty, generateScenario,
  generateBatch, scenarioSpace, gradeScenario, clearProfileCache,
  GENERATED_PREFIX, DISTRACTOR_COUNT, FaultKind,
} from '../src/core/training/scenarioEngine.js';
import { injectFault, deriveSymptom } from '../src/core/training/troubleshooting.js';
import { ALL_LESSONS, lessonById, solutionCircuit } from '../src/circuit/lessons/index.js';
import { truthTable } from '../src/circuit/solver.js';
import { ConductorRole, TerminalRole, ComponentType } from '../src/circuit/model.js';

const LESSON = 'single-pole-source-at-switch';
const THREE_WAY = 'three-way-source-at-switch';

// ─── Fault injection actually happens ────────────────────────────────────────

test('every enumerated fault is one injectFault can actually apply', () => {
  for (const lesson of ALL_LESSONS) {
    const solution = solutionCircuit(lesson).conductors;
    for (const fault of enumerateFaults(lesson)) {
      const after = injectFault(solution, fault);
      if (fault.kind === FaultKind.OPEN_CONDUCTOR) {
        assert.equal(after.length, solution.length - 1,
          `${lesson.id}: open fault removed nothing — the target shape does not match`);
      } else {
        assert.equal(after.length, solution.length, `${lesson.id}: mislanding changed the wire count`);
        assert.notDeepEqual(after, solution, `${lesson.id}: mislanding moved nothing`);
        assert.ok(after.some((w) => w.toTerminal === fault.to), `${lesson.id}: wire did not land on the new terminal`);
      }
    }
  }
});

test('no generated fault crosses into the grounding system', () => {
  // The circuit model has no main bonding jumper, so it gets these faults
  // wrong: it reads a hot landed on the EGC as "the light is dead" when the
  // breaker would actually open, and an EGC landed on the neutral as harmless
  // when the hazard is current on the grounding system. Until the model can say
  // what they do, the engine must not describe them.
  for (const lesson of ALL_LESSONS) {
    const components = lesson.components();
    const solution = solutionCircuit(lesson).conductors;

    // A terminal is on the grounding system if it is a ground terminal, or if it
    // is a point on a splice the correct wiring lands an EGC on.
    const groundTerminals = new Set(components.flatMap((c) => c.terminals)
      .filter((t) => t.semanticRole === TerminalRole.EQUIPMENT_GROUND || t.semanticRole === TerminalRole.SOURCE_GROUND)
      .map((t) => t.id));
    const splices = new Set(components.filter((c) => c.type === ComponentType.SPLICE).map((c) => c.id));
    const groundSplices = new Set(solution
      .filter((w) => w.role === ConductorRole.EQUIPMENT_GROUND)
      .flatMap((w) => [w.fromTerminal, w.toTerminal])
      .map((t) => t.split('.')[0])
      .filter((id) => splices.has(id)));

    const isGround = (t) => groundTerminals.has(t) || groundSplices.has(t.split('.')[0]);

    for (const fault of enumerateFaults(lesson)) {
      if (fault.kind !== FaultKind.MISLANDED) continue;
      const groundConductor = fault.role === ConductorRole.EQUIPMENT_GROUND;
      assert.equal(isGround(fault.to), groundConductor,
        `${lesson.id}: generated a fault crossing the grounding boundary — ${fault.text}`);
    }
  }
});

test('a fault the customer and the meter cannot see is not a scenario', () => {
  for (const lesson of ALL_LESSONS) {
    const { healthy, faults } = lessonProfile(lesson);
    for (const f of faults) {
      assert.notEqual(f.signature, healthy.signature,
        `${lesson.id}: kept a fault indistinguishable from a healthy circuit`);
      assert.equal(isObservable(lesson, f.fault), true);
    }
  }
});

test('the healthy circuit reads as healthy', () => {
  for (const lesson of ALL_LESSONS) {
    const { healthy } = lessonProfile(lesson);
    assert.equal(healthy.symptom.summary, 'The light works correctly from every switch.', lesson.id);
    assert.equal(healthy.symptom.alwaysOff, false, lesson.id);
    assert.equal(healthy.symptom.shortPresent, false, lesson.id);
  }
});

// ─── Symptoms are derived, not written ───────────────────────────────────────

test('a scenario symptom is exactly what the solver derives from its own circuit', () => {
  for (const lesson of ALL_LESSONS) {
    for (const s of generateBatch(lesson.id, { count: 8 })) {
      assert.equal(s.symptom, deriveSymptom(s.faultedCircuit).summary,
        `${s.id}: the stated symptom is not the circuit's symptom`);
      assert.deepEqual(s.readings, readingsAcrossStates(s.faultedCircuit),
        `${s.id}: the stated readings are not the circuit's readings`);
    }
  }
});

test('an open ungrounded conductor and an open grounded conductor read differently', () => {
  const lesson = lessonById(LESSON);
  const solution = solutionCircuit(lesson).conductors;
  const components = lesson.components();

  const openOf = (role) => {
    const w = solution.find((c) => c.role === role);
    return { components, conductors: injectFault(solution, {
      kind: FaultKind.OPEN_CONDUCTOR, target: { between: [w.fromTerminal, w.toTerminal] },
    }) };
  };

  // Switch closed. With the neutral open the fixture still sees a hot; with the
  // hot open it sees nothing. Both look like "the light is dead" to a customer.
  const closed = { sw1: 1 };
  const hotOpen = meterReadings(openOf('LINE'), closed);
  const neutralOpen = meterReadings(openOf('NEUTRAL'), closed);

  const probe = (rs, p) => rs.find((r) => r.probe === p).reads;
  assert.equal(probe(hotOpen, 'ungrounded to grounded, at the load'), '0 V');
  assert.equal(probe(neutralOpen, 'ungrounded to grounded, at the load'), '0 V');
  assert.equal(probe(hotOpen, 'ungrounded to equipment ground, at the load'), '0 V');
  assert.equal(probe(neutralOpen, 'ungrounded to equipment ground, at the load'), '120 V',
    'an open neutral still leaves the fixture hot — that is the whole point of the reading');
});

test('an open equipment ground shows as open continuity and nothing else', () => {
  const lesson = lessonById(LESSON);
  const solution = solutionCircuit(lesson).conductors;
  const w = solution.find((c) => c.role === 'EQUIPMENT_GROUND' && c.toTerminal.startsWith('lamp'))
    ?? solution.find((c) => c.role === 'EQUIPMENT_GROUND');
  const faulted = {
    components: lesson.components(),
    conductors: injectFault(solution, { kind: FaultKind.OPEN_CONDUCTOR, target: { between: [w.fromTerminal, w.toTerminal] } }),
  };
  const rs = meterReadings(faulted, { sw1: 1 });
  assert.equal(rs.find((r) => r.probe === 'ungrounded to grounded, at the load').reads, '120 V',
    'losing the EGC does not stop the light working — which is why it goes unnoticed');
  assert.ok(rs.some((r) => r.probe === 'equipment ground continuity, at the load'),
    'the engine must offer a reading that can find it');
});

// ─── Why a wrong answer is wrong ─────────────────────────────────────────────

test('contrast points at a real difference or admits there is none', () => {
  const lesson = lessonById(THREE_WAY);
  const { faults } = lessonProfile(lesson);
  const seen = { [WhyBasis.SYMPTOM]: 0, [WhyBasis.BEHAVIOUR]: 0, [WhyBasis.METER]: 0, [WhyBasis.NONE]: 0 };

  for (let i = 0; i < faults.length; i++) {
    for (let j = i + 1; j < faults.length; j++) {
      const c = contrast(faults[i], faults[j]);
      seen[c.basis]++;

      if (c.basis === WhyBasis.SYMPTOM) {
        assert.notEqual(faults[i].symptom.summary, faults[j].symptom.summary,
          'claimed a symptom difference where the summaries match');
        assert.match(c.text, /^That would have caused:/);
      } else if (c.basis === WhyBasis.NONE) {
        assert.equal(faults[i].signature, faults[j].signature,
          'claimed two faults are indistinguishable when their signatures differ');
        assert.equal(c.distinguishable, false);
      } else {
        // Anything past the complaint must share the complaint, and must have
        // an observable difference to point at.
        assert.equal(faults[i].symptom.summary, faults[j].symptom.summary,
          'fell past the complaint when the complaint already told them apart');
        assert.notEqual(faults[i].signature, faults[j].signature);
        assert.equal(c.distinguishable, true);
        assert.match(c.text, c.basis === WhyBasis.METER ? /would read/ : /would (trip|leave)/);
      }
    }
  }

  assert.ok(seen[WhyBasis.SYMPTOM] > 0, 'expected some faults separable by the complaint alone');
  assert.ok(seen[WhyBasis.METER] > 0, 'expected some faults that only a meter separates');
  assert.ok(seen[WhyBasis.NONE] > 0, 'expected some faults that genuinely cannot be told apart');
});

test('a fault that trips the breaker is never called indistinguishable from one that does not', () => {
  // The regression that motivated WhyBasis.BEHAVIOUR: two faults can share a
  // complaint summary while one opens the breaker in a switch position the other
  // does not. Lining the readings up by index stepped straight past it, because
  // a tripping state carries one extra row.
  for (const lesson of ALL_LESSONS) {
    const { faults } = lessonProfile(lesson);
    for (let i = 0; i < faults.length; i++) {
      for (let j = i + 1; j < faults.length; j++) {
        const trips = (f) => f.states.map((s) => s.breakerTrips).join('');
        if (trips(faults[i]) === trips(faults[j])) continue;
        assert.equal(contrast(faults[i], faults[j]).distinguishable, true,
          `${lesson.id}: faults that trip differently were called indistinguishable`);
      }
    }
  }
});

test('whyWrong wraps contrast over raw faults', () => {
  const lesson = lessonById(LESSON);
  const [a, b] = lessonProfile(lesson).faults;
  assert.deepEqual(whyWrong(lesson, a.fault, b.fault), contrast(a, b));
});

test('the explanation for a wrong answer states what that fault would have done', () => {
  const s = generateScenario(THREE_WAY, 3);
  for (const c of s.choices) {
    if (c.correct) { assert.equal(c.why, null); continue; }
    assert.ok(c.why && c.why.length > 20, 'a wrong answer must carry a reason');
    assert.ok(
      c.why.startsWith('That would have caused:')
      || c.why.startsWith('The complaint reads the same')
      || c.why.startsWith('The complaint looks the same'),
      `unexpected explanation shape: ${c.why}`,
    );
  }
});

// ─── The choices are fair ────────────────────────────────────────────────────

test('a scenario has exactly one correct answer and no duplicate options', () => {
  for (const lesson of ALL_LESSONS) {
    for (const s of generateBatch(lesson.id, { count: 12 })) {
      const correct = s.choices.filter((c) => c.correct);
      assert.equal(correct.length, 1, `${s.id}: ${correct.length} correct answers`);
      assert.equal(s.choices[s.correctIndex].correct, true, `${s.id}: correctIndex is wrong`);
      assert.equal(new Set(s.choices.map((c) => c.text)).size, s.choices.length,
        `${s.id}: duplicate answer text`);
      assert.ok(s.choices.length >= 2 && s.choices.length <= DISTRACTOR_COUNT + 1, `${s.id}: bad choice count`);
    }
  }
});

test('a fault that cannot be ruled out is never offered as a wrong answer', () => {
  for (const lesson of ALL_LESSONS) {
    for (const s of generateBatch(lesson.id, { count: 12 })) {
      const observed = lessonProfile(lesson).faults[s.faultIndex];
      for (const c of s.choices) {
        if (c.correct) continue;
        const distractor = lessonProfile(lesson).faults.find((f) => f.fault.text === c.text);
        assert.ok(distractor, `${s.id}: a choice that is not a real fault`);
        assert.notEqual(distractor.signature, observed.signature,
          `${s.id}: marked an indistinguishable fault wrong — "${c.text}"`);
      }
      for (const text of s.cannotBeRuledOut) {
        assert.ok(!s.choices.some((c) => c.text === text),
          `${s.id}: an unrulable fault leaked into the choices`);
      }
    }
  }
});

test('grading returns the engine-computed reason, never a fresh one', () => {
  const s = generateScenario(LESSON, 0);
  const right = gradeScenario(s, s.correctIndex);
  assert.equal(right.correct, true);
  assert.equal(right.whyThisIsWrong, null);
  assert.equal(right.explanation, s.explanation);

  const wrongIndex = s.choices.findIndex((c) => !c.correct);
  const wrong = gradeScenario(s, wrongIndex);
  assert.equal(wrong.correct, false);
  assert.equal(wrong.whyThisIsWrong, s.choices[wrongIndex].why);
  assert.equal(wrong.correctAnswer, s.choices[s.correctIndex].text);

  assert.equal(gradeScenario(s, 99), null);
  assert.equal(gradeScenario(null, 0), null);
});

// ─── Determinism ─────────────────────────────────────────────────────────────

test('a scenario id always produces the same scenario', () => {
  const a = generateScenario(THREE_WAY, 7);
  clearProfileCache();
  const b = generateScenario(THREE_WAY, 7);
  assert.deepEqual(a, b);
  assert.equal(a.id, `${GENERATED_PREFIX}${THREE_WAY}:7`);
});

test('the fault index wraps, so any integer is a valid scenario', () => {
  const space = lessonProfile(lessonById(LESSON)).faults.length;
  assert.deepEqual(generateScenario(LESSON, space), generateScenario(LESSON, 0));
  assert.deepEqual(generateScenario(LESSON, -space), generateScenario(LESSON, 0));
  assert.equal(generateScenario(LESSON, -1).faultIndex, space - 1);
});

test('unknown lessons produce nothing rather than throwing', () => {
  assert.equal(generateScenario('no-such-lesson', 0), null);
  assert.deepEqual(generateBatch('no-such-lesson'), []);
});

// ─── Scale ───────────────────────────────────────────────────────────────────

test('the scenario space is generated, and it is large', () => {
  const space = scenarioSpace();
  assert.equal(space.perLesson.length, ALL_LESSONS.length);
  for (const l of space.perLesson) assert.ok(l.scenarios > 10, `${l.lessonId} only has ${l.scenarios}`);
  // Five lessons. The count is a product of the lesson catalog, not of anything
  // written by hand, so it grows with every lesson added — which is the point.
  assert.ok(space.total > 200, `expected hundreds of scenarios, got ${space.total}`);
});

test('a batch is a distinct, contiguous page of the space', () => {
  const batch = generateBatch(THREE_WAY, { from: 0, count: 10 });
  assert.equal(batch.length, 10);
  assert.equal(new Set(batch.map((s) => s.id)).size, 10);
  const next = generateBatch(THREE_WAY, { from: 10, count: 10 });
  assert.equal(next.filter((s) => batch.some((b) => b.id === s.id)).length, 0);
});

// ─── Difficulty and safety framing ───────────────────────────────────────────

test('difficulty rises with the circuit and with ambiguity', () => {
  const symptomOnly = [{ why: { basis: WhyBasis.SYMPTOM } }];
  const meterOnly = [{ why: { basis: WhyBasis.METER } }];
  const open = { kind: FaultKind.OPEN_CONDUCTOR };

  assert.equal(difficultyFor({ switchCount: 1, distractors: symptomOnly, equivalents: [], fault: open }),
    Difficulty.APPRENTICE);
  assert.equal(difficultyFor({ switchCount: 1, distractors: meterOnly, equivalents: [], fault: open }),
    Difficulty.JOURNEYMAN, 'needing a meter is harder than reading the complaint');
  assert.equal(difficultyFor({ switchCount: 2, distractors: symptomOnly, equivalents: [], fault: open }),
    Difficulty.JOURNEYMAN);
  assert.equal(difficultyFor({ switchCount: 3, distractors: symptomOnly, equivalents: [], fault: open }),
    Difficulty.MASTER);
  assert.equal(difficultyFor({ switchCount: 1, distractors: symptomOnly, equivalents: [{}], fault: open }),
    Difficulty.MASTER, 'a fault you cannot narrow down is the hard one');
});

test('every generated scenario carries the training disclaimer and the safety note', () => {
  for (const lesson of ALL_LESSONS) {
    for (const s of generateBatch(lesson.id, { count: 5 })) {
      assert.match(s.disclaimer, /training/i, s.id);
      assert.match(s.safetyNote, /de-energize/i, s.id);
      assert.equal(s.generated, true);
      assert.ok(s.lessonTitle, s.id);
    }
  }
});

test('the customer report carries no electrical claim', () => {
  // The narrative is the one thing a model may write, so it must not be able to
  // say anything about the circuit. Rooms and complaints only.
  const ELECTRICAL = /volt|amp|neutral|ground|hot|breaker|traveler|conductor|switch leg|short/i;
  for (const lesson of ALL_LESSONS) {
    for (const s of generateBatch(lesson.id, { count: 10 })) {
      assert.doesNotMatch(s.customerReport, ELECTRICAL,
        `${s.id}: the narrative made an electrical claim — "${s.customerReport}"`);
    }
  }
});

// ─── The engine agrees with the rest of the simulator ────────────────────────

test('generated scenarios use the same switch identifiers the truth table does', () => {
  for (const lesson of ALL_LESSONS) {
    const ids = truthTable(solutionCircuit(lesson)).switchIds;
    const s = generateScenario(lesson.id, 0);
    if (!s) continue;
    for (const row of s.readings) {
      assert.deepEqual(Object.keys(row.positions), ids, `${s.id}: switch ids drifted`);
    }
  }
});
