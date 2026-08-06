// ─── TROUBLESHOOTING MODE ────────────────────────────────────────────────────
// "Customer says: half the house lost power." Diagnose it.
//
// The symptom shown to the user is DERIVED from the engine, not written by hand,
// so it can never describe behaviour the circuit would not actually produce.

import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Vibration, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { SCENARIOS, buildScenario, answerScenario } from '../core/training/troubleshooting';
import { TRAINING_DISCLAIMER } from '../circuit/review';
import CircuitCanvas from './CircuitCanvas';

export default function TroubleshootScreen({ C, setTab, onStreakUpdate, onSolved, onClose }) {
  const [openId, setOpenId] = useState(null);
  if (!openId) return <ScenarioList C={C} onPick={setOpenId} setTab={setTab} onClose={onClose} />;
  return (
    <ScenarioPlayer
      C={C}
      scenarioId={openId}
      onExit={() => (onClose ? onClose() : setOpenId(null))}
      onStreakUpdate={onStreakUpdate}
      onSolved={onSolved}
    />
  );
}

function ScenarioList({ C, onPick, setTab, onClose }) {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.amberBg, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="build" size={21} color={C.amber} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: C.text }}>Troubleshooting</Text>
          <Text style={{ fontSize: 12, color: C.textTert }}>Real calls. Find the fault.</Text>
        </View>
      </View>

      {SCENARIOS.map((s) => (
        <TouchableOpacity
          key={s.id}
          onPress={() => onPick(s.id)}
          activeOpacity={0.85}
          style={{
            backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 10,
            borderWidth: 1, borderColor: C.border, borderLeftWidth: 4, borderLeftColor: C.amber,
          }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: C.text }}>{s.title}</Text>
            <View style={{ backgroundColor: C.amberBg, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: C.amber }}>{s.difficulty}</Text>
            </View>
          </View>
          <Text style={{ fontSize: 12, color: C.textSec, lineHeight: 18, fontStyle: 'italic' }}>
            “{s.customerReport}”
          </Text>
        </TouchableOpacity>
      ))}

      <TouchableOpacity
        onPress={() => (onClose ? onClose() : setTab && setTab('learn'))}
        style={{ padding: 14, alignItems: 'center', marginTop: 6 }}>
        <Text style={{ color: C.textSec, fontSize: 13, fontWeight: '600' }}>
          {onClose ? 'Back to the job site' : 'Back to Learn'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function ScenarioPlayer({ C, scenarioId, onExit, onStreakUpdate, onSolved }) {
  const built = useMemo(() => buildScenario(scenarioId), [scenarioId]);
  const [picked, setPicked] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const [showTable, setShowTable] = useState(false);
  const [showDiagram, setShowDiagram] = useState(true);
  // Diagnosis is revealed a step at a time. Dumping the call, the diagram, the
  // truth table and four answers on one screen is how a beginner learns to
  // pattern-match the answer instead of learning the trade. Step 1 read the
  // call; step 2 observe; step 3 look at the circuit; only then, answer.
  const [step, setStep] = useState(1);
  const atStep = (n) => step >= n;
  // lesson.components() builds fresh objects; memoise so the canvas is not
  // re-laid-out on every unrelated state change.
  const diagramParts = useMemo(() => built?.lesson?.components() ?? [], [built]);

  if (!built) return null;
  const { scenario, symptom, healthyCircuit, lesson } = built;

  const submit = (i) => {
    if (outcome?.correct) return;
    setPicked(i);
    const r = answerScenario(scenario.id, i);
    setOutcome(r);
    try {
      if (Platform.OS !== 'web') Vibration.vibrate(r.correct ? 30 : [0, 40, 60, 40]);
    } catch (e) { /* ignore */ }
    if (r.correct) {
      onStreakUpdate && onStreakUpdate();
      onSolved && onSolved(scenario.id);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <TouchableOpacity onPress={onExit} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 16, fontWeight: '800', color: C.text }}>{scenario.title}</Text>
        {!outcome?.correct && (
          <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
            {[1, 2, 3, 4].map((n) => (
              <View key={n} style={{ width: n === step ? 16 : 6, height: 6, borderRadius: 3, backgroundColor: n <= step ? C.blue : C.border }} />
            ))}
          </View>
        )}
      </View>

      {/* What this step is asking of you */}
      {!outcome?.correct && (
        <Text style={{ fontSize: 11.5, fontWeight: '700', color: C.textSec, marginBottom: 10 }}>
          {step === 1 ? 'STEP 1 · Read the call'
            : step === 2 ? 'STEP 2 · Observe what it actually does'
            : step === 3 ? 'STEP 3 · Look at how it was wired'
            : 'STEP 4 · Name the fault'}
        </Text>
      )}

      {/* The call */}
      <View style={{ backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: C.border }}>
        <Text style={{ fontSize: 10.5, fontWeight: '800', color: C.textTert, letterSpacing: 0.6, marginBottom: 6 }}>THE CALL</Text>
        <Text style={{ fontSize: 14, color: C.text, lineHeight: 21, fontStyle: 'italic' }}>“{scenario.customerReport}”</Text>
      </View>

      {/* Step 1 → 2 */}
      {step === 1 && (
        <TouchableOpacity
          onPress={() => setStep(2)}
          style={{ backgroundColor: C.blue, borderRadius: 12, paddingVertical: 15, alignItems: 'center', minHeight: 50, justifyContent: 'center', marginBottom: 12 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>Go look at it</Text>
        </TouchableOpacity>
      )}

      {/* The as-designed circuit. Drawing the DESIGN, not the faulted copy, is
          deliberate: in the field the wiring looks right until you test it —
          drawing the fault would print the answer on the screen. */}
      {atStep(3) && (
      <View style={{ marginBottom: 12 }}>
        <TouchableOpacity onPress={() => setShowDiagram((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 }}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: C.textSec, letterSpacing: 0.5 }}>
            AS-DESIGNED CIRCUIT
          </Text>
          <Ionicons name={showDiagram ? 'chevron-up' : 'chevron-down'} size={13} color={C.textSec} />
        </TouchableOpacity>
        {showDiagram && (
          <CircuitCanvas
            C={C}
            components={diagramParts}
            wires={healthyCircuit.conductors}
            lit={false}
          />
        )}
      </View>
      )}

      {/* Engine-derived symptom */}
      {atStep(2) && (
      <View style={{ backgroundColor: C.blueSub, borderRadius: 14, padding: 14, marginBottom: 12 }}>
        <Text style={{ fontSize: 10.5, fontWeight: '800', color: C.blue, letterSpacing: 0.6, marginBottom: 6 }}>WHAT YOU OBSERVE</Text>
        <Text style={{ fontSize: 13, color: C.text, lineHeight: 20 }}>{symptom.summary}</Text>

        <TouchableOpacity onPress={() => setShowTable((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: C.blue }}>
            {showTable ? 'Hide' : 'Show'} switch-by-switch results
          </Text>
          <Ionicons name={showTable ? 'chevron-up' : 'chevron-down'} size={14} color={C.blue} />
        </TouchableOpacity>

        {showTable && (
          <View style={{ marginTop: 10 }}>
            {symptom.detail.map((row, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: C.borderLight }}>
                <Text style={{ flex: 1, fontSize: 11.5, color: C.textSec }}>
                  {Object.entries(row.positions).map(([k, v]) => `${k}:${v}`).join('  ')}
                </Text>
                <Text style={{ fontSize: 11.5, fontWeight: '700', color: row.breakerTrips ? C.danger : row.lightOn ? C.success : C.textTert }}>
                  {row.breakerTrips ? 'TRIPS' : row.lightOn ? 'ON' : 'off'}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
      )}

      {/* Step 2 → 3 */}
      {step === 2 && (
        <TouchableOpacity
          onPress={() => setStep(3)}
          style={{ backgroundColor: C.blue, borderRadius: 12, paddingVertical: 15, alignItems: 'center', minHeight: 50, justifyContent: 'center', marginBottom: 12 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>Check how it was wired</Text>
        </TouchableOpacity>
      )}

      {/* Step 3 → 4 */}
      {step === 3 && (
        <TouchableOpacity
          onPress={() => setStep(4)}
          style={{ backgroundColor: C.amber, borderRadius: 12, paddingVertical: 15, alignItems: 'center', minHeight: 50, justifyContent: 'center', marginBottom: 12 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>I know what is wrong</Text>
        </TouchableOpacity>
      )}

      {/* Choices */}
      {atStep(4) && (<>
      <Text style={{ fontSize: 11, fontWeight: '800', color: C.textSec, letterSpacing: 0.5, marginBottom: 8 }}>
        WHAT IS THE FAULT?
      </Text>
      {scenario.choices.map((choice, i) => {
        const isPicked = picked === i;
        const revealCorrect = outcome && i === outcome.correctChoice && outcome.correct;
        const isWrongPick = outcome && isPicked && !outcome.correct;
        let bg = C.inputBg, border = C.border, color = C.text;
        if (revealCorrect) { bg = C.successBg; border = C.success; color = C.success; }
        else if (isWrongPick) { bg = C.dangerBg; border = C.danger; color = C.danger; }
        else if (isPicked) { bg = C.blueSub; border = C.blue; color = C.blue; }

        return (
          <TouchableOpacity
            key={i}
            onPress={() => submit(i)}
            activeOpacity={0.85}
            disabled={!!outcome?.correct}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: 12,
              backgroundColor: bg, borderWidth: 1.5, borderColor: border, marginBottom: 8, minHeight: 52,
            }}>
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: border, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>{String.fromCharCode(65 + i)}</Text>
            </View>
            <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color, lineHeight: 19 }}>{choice}</Text>
            {revealCorrect && <Ionicons name="checkmark-circle" size={19} color={C.success} />}
            {isWrongPick && <Ionicons name="close-circle" size={19} color={C.danger} />}
          </TouchableOpacity>
        );
      })}
      </>)}

      {/* Feedback */}
      {outcome && !outcome.correct && (
        <View style={{ backgroundColor: C.amberBg, borderRadius: 12, padding: 13, marginTop: 6 }}>
          <Text style={{ fontSize: 12.5, color: C.text, lineHeight: 19 }}>{outcome.hint}</Text>
        </View>
      )}

      {outcome?.correct && (
        <View style={{ marginTop: 6 }}>
          <View style={{ backgroundColor: C.successBg, borderRadius: 14, padding: 14, borderLeftWidth: 4, borderLeftColor: C.success, marginBottom: 10 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: C.success, marginBottom: 6 }}>That is the fault</Text>
            <Text style={{ fontSize: 12.5, color: C.text, lineHeight: 19 }}>{outcome.explanation}</Text>
          </View>

          <View style={{ backgroundColor: C.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border, marginBottom: 10 }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: C.textSec, letterSpacing: 0.5, marginBottom: 8 }}>WHAT TO INSPECT</Text>
            {outcome.whatToInspect.map((step, i) => (
              <Text key={i} style={{ fontSize: 12.5, color: C.text, lineHeight: 20, marginBottom: 4 }}>{i + 1}. {step}</Text>
            ))}
          </View>

          <View style={{ backgroundColor: C.amberBg, borderRadius: 12, padding: 13, marginBottom: 10 }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: C.amber, marginBottom: 4 }}>COMMON MISTAKE</Text>
            <Text style={{ fontSize: 12.5, color: C.text, lineHeight: 19 }}>{outcome.commonMistake}</Text>
          </View>

          <TouchableOpacity onPress={onExit} style={{ backgroundColor: C.success, borderRadius: 12, paddingVertical: 15, alignItems: 'center', minHeight: 50, justifyContent: 'center' }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>Next Call</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={{ fontSize: 10.5, color: C.textTert, lineHeight: 16, marginTop: 14 }}>{scenario.safetyNote}</Text>
      <Text style={{ fontSize: 10, color: C.textTert, lineHeight: 15, marginTop: 8 }}>{TRAINING_DISCLAIMER}</Text>
    </ScrollView>
  );
}
