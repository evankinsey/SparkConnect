// ─── WIRING LAB ──────────────────────────────────────────────────────────────
// The screen on top of the circuit engine.
//
// Interaction model is tap-to-connect, not drag. Drag looks better in a demo;
// tap works with gloves on, on a phone held in one hand, in bad light. Tap a
// terminal, tap a second terminal, pick what the conductor is. That is the whole
// interaction.
//
// The engine decides correctness. This file only renders and collects taps.

import React, { useMemo, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Alert, Vibration, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ALL_LESSONS, buildCircuit, productionLessons } from '../circuit/lessons/index';
import { validate, primaryFailure } from '../circuit/validator';
import { conductor, ConductorRole } from '../circuit/model';
import { attributionFor, TRAINING_DISCLAIMER } from '../circuit/review';
import { scoreAttempt, nextHint, rankForXp, TimerMode } from '../circuit/scoring';
import CircuitCanvas, { ROLE_COLORS } from './CircuitCanvas';

const ROLE_CHIPS = [
  { role: ConductorRole.LINE, label: 'Line', color: ROLE_COLORS.LINE },
  { role: ConductorRole.SWITCHED_HOT, label: 'Switched', color: ROLE_COLORS.SWITCHED_HOT },
  { role: ConductorRole.TRAVELER_A, label: 'Traveler A', color: ROLE_COLORS.TRAVELER_A },
  { role: ConductorRole.TRAVELER_B, label: 'Traveler B', color: ROLE_COLORS.TRAVELER_B },
  { role: ConductorRole.NEUTRAL, label: 'Neutral', color: ROLE_COLORS.NEUTRAL },
  { role: ConductorRole.EQUIPMENT_GROUND, label: 'Ground', color: ROLE_COLORS.EQUIPMENT_GROUND },
];

const shortTerminal = (id) => String(id).split('.').pop();

/**
 * `initialLessonId` opens straight into one lesson and skips the list — that is
 * how Jobsite World launches a room's task. `onClose` then replaces "back to
 * the list" with "back to where you came from", and `onSolved` reports the win
 * so the world can mark the station done.
 */
export default function WiringLabScreen({
  C, setTab, onStreakUpdate, initialLessonId = null, onSolved, onClose,
}) {
  const [lessonId, setLessonId] = useState(initialLessonId);
  // Show every built lesson. The review gate governs what is *approved*; all
  // five carry team review, and the attribution banner says exactly that.
  const lessons = useMemo(() => {
    const approved = productionLessons();
    return approved.length ? approved : ALL_LESSONS;
  }, []);

  if (!lessonId) return <LessonList C={C} lessons={lessons} onPick={setLessonId} setTab={setTab} />;

  return (
    <LessonPlayer
      C={C}
      lesson={lessons.find((l) => l.id === lessonId) ?? lessons[0]}
      onExit={() => (onClose ? onClose() : setLessonId(null))}
      onStreakUpdate={onStreakUpdate}
      onSolved={onSolved}
    />
  );
}

// ─── Lesson list ─────────────────────────────────────────────────────────────

function LessonList({ C, lessons, onPick, setTab }) {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.blueSub, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="git-network" size={22} color={C.blue} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: C.text }}>Wiring Simulator</Text>
          <Text style={{ fontSize: 12, color: C.textTert }}>Wire it. Test it. Find out why.</Text>
        </View>
      </View>

      <Text style={{ fontSize: 12, color: C.textSec, lineHeight: 18, marginTop: 10, marginBottom: 16 }}>
        Every lesson is checked by a real circuit solver, not by matching a picture.
        There is usually more than one correct way to wire it.
      </Text>

      {lessons.map((l) => {
        const attribution = attributionFor(l);
        return (
          <TouchableOpacity
            key={l.id}
            onPress={() => onPick(l.id)}
            activeOpacity={0.85}
            style={{
              backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 10,
              borderWidth: 1, borderColor: C.border, borderLeftWidth: 4, borderLeftColor: C.blue,
            }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: C.text }}>{l.title}</Text>
              <View style={{ backgroundColor: C.blueSub, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: C.blue }}>{l.difficulty}</Text>
              </View>
            </View>
            <Text style={{ fontSize: 12, color: C.textSec, marginTop: 6, lineHeight: 18 }}>{l.description}</Text>
            {attribution.prominent && (
              <Text style={{ fontSize: 10, color: C.textTert, marginTop: 8 }}>{attribution.label}</Text>
            )}
          </TouchableOpacity>
        );
      })}

      <View style={{ backgroundColor: C.amberBg, borderRadius: 12, padding: 12, marginTop: 8 }}>
        <Text style={{ fontSize: 10.5, color: C.text, lineHeight: 16 }}>{TRAINING_DISCLAIMER}</Text>
      </View>

      <TouchableOpacity
        onPress={() => setTab && setTab('learn')}
        style={{ padding: 14, alignItems: 'center', marginTop: 8 }}>
        <Text style={{ color: C.textSec, fontSize: 13, fontWeight: '600' }}>Back to Learn</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Lesson player ───────────────────────────────────────────────────────────

function LessonPlayer({ C, lesson, onExit, onStreakUpdate, onSolved }) {
  const components = useMemo(() => lesson.components(), [lesson]);

  const [wires, setWires] = useState([]);
  const [pending, setPending] = useState(null);      // first tapped terminal
  const [role, setRole] = useState(ConductorRole.LINE);
  const [result, setResult] = useState(null);
  const [hintsUsed, setHintsUsed] = useState([]);
  const [hint, setHint] = useState(null);
  const [wrongTests, setWrongTests] = useState(0);
  const [resets, setResets] = useState(0);
  const [solved, setSolved] = useState(false);
  const [score, setScore] = useState(null);

  const buzz = useCallback((ms) => {
    // SUX-05 asks for a short haptic on a wrong answer. Vibration is the only
    // thing available without adding a dependency mid-release.
    try { if (Platform.OS !== 'web') Vibration.vibrate(ms); } catch (e) { /* ignore */ }
  }, []);

  const tapTerminal = (terminalId) => {
    if (solved) return;
    setResult(null);
    if (!pending) { setPending(terminalId); return; }
    if (pending === terminalId) { setPending(null); return; }

    const exists = wires.some((w) =>
      (w.fromTerminal === pending && w.toTerminal === terminalId) ||
      (w.fromTerminal === terminalId && w.toTerminal === pending));
    if (exists) {
      setPending(null);
      Alert.alert('Already connected', 'Those two terminals already have a conductor between them.');
      return;
    }

    setWires((prev) => [...prev, conductor(pending, terminalId, role)]);
    setPending(null);
  };

  const removeWire = (id) => {
    if (solved) return;
    setWires((prev) => prev.filter((w) => w.id !== id));
    setResult(null);
  };

  const test = () => {
    const circuit = buildCircuit(lesson, wires);
    const r = validate(circuit, lesson.expectations);
    setResult(r);

    if (r.valid) {
      const s = scoreAttempt({
        wrongTests, hintsUsed, resets, completed: true, timerMode: TimerMode.LEARN,
      });
      setScore(s);
      setSolved(true);
      onStreakUpdate && onStreakUpdate();
      onSolved && onSolved(lesson.id, s);
      buzz(30);
    } else {
      setWrongTests((n) => n + 1);
      buzz([0, 40, 60, 40]);
    }
  };

  const takeHint = () => {
    const h = nextHint(lesson, hintsUsed);
    setHint(h);
    if (!h.exhausted) setHintsUsed((prev) => [...prev, h.level]);
  };

  const reset = () => {
    setWires([]); setPending(null); setResult(null); setHint(null);
    setResets((n) => n + 1); setSolved(false); setScore(null);
  };

  const failure = result && !result.valid ? primaryFailure(result) : null;
  const highlighted = new Set([
    ...(failure?.terminals ?? []),
    ...(failure ? components.filter((c) => (failure.components ?? []).includes(c.id)).flatMap((c) => c.terminals.map((t) => t.id)) : []),
  ]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <TouchableOpacity onPress={onExit} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={24} color={C.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: C.text }}>{lesson.title}</Text>
          <Text style={{ fontSize: 11, color: C.textTert }}>{lesson.difficulty} · tap two terminals to connect</Text>
        </View>
      </View>

      {/* Objective */}
      <View style={{ backgroundColor: C.blueSub, borderRadius: 12, padding: 12, marginBottom: 14 }}>
        <Text style={{ fontSize: 11, fontWeight: '800', color: C.blue, marginBottom: 5 }}>OBJECTIVE</Text>
        {lesson.learningObjectives.slice(0, 3).map((o, i) => (
          <Text key={i} style={{ fontSize: 12, color: C.text, lineHeight: 18 }}>• {o}</Text>
        ))}
      </View>

      {/* Conductor role picker */}
      {!solved && (
        <>
          <Text style={{ fontSize: 11, fontWeight: '800', color: C.textSec, marginBottom: 7, letterSpacing: 0.5 }}>
            CONDUCTOR TYPE
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', gap: 7 }}>
              {ROLE_CHIPS.filter((r) => lesson.allowedWireTypes.includes(r.role)).map((r) => {
                const active = role === r.role;
                return (
                  <TouchableOpacity
                    key={r.role}
                    onPress={() => setRole(r.role)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      paddingHorizontal: 12, paddingVertical: 9, borderRadius: 20,
                      backgroundColor: active ? C.blue : C.surface,
                      borderWidth: 1.5, borderColor: active ? C.blue : C.border,
                    }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: r.color, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' }} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#fff' : C.textSec }}>{r.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </>
      )}

      {/* The circuit, drawn — devices, screws, and colored conductors */}
      <CircuitCanvas
        C={C}
        components={components}
        wires={wires}
        pending={pending}
        highlighted={highlighted}
        lit={solved}
        onTapTerminal={tapTerminal}
        onTapWire={removeWire}
      />

      {pending && (
        <Text style={{ fontSize: 12, color: C.blue, fontWeight: '600', marginBottom: 10, textAlign: 'center' }}>
          Now tap the terminal to connect it to — or tap it again to cancel.
        </Text>
      )}

      {/* Wires */}
      {wires.length > 0 && (
        <View style={{ marginBottom: 14 }}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: C.textSec, marginBottom: 7, letterSpacing: 0.5 }}>
            CONDUCTORS ({wires.length})
          </Text>
          {wires.map((w) => {
            const chip = ROLE_CHIPS.find((r) => r.role === w.role);
            return (
              <View key={w.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.borderLight }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: chip?.color ?? C.textTert }} />
                <Text style={{ flex: 1, fontSize: 12, color: C.text }}>
                  {shortTerminal(w.fromTerminal)} → {shortTerminal(w.toTerminal)}
                  <Text style={{ color: C.textTert }}>  {chip?.label ?? w.role}</Text>
                </Text>
                {!solved && (
                  <TouchableOpacity onPress={() => removeWire(w.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={19} color={C.textTert} />
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* Result */}
      {result && !result.valid && failure && (
        <View style={{ backgroundColor: C.dangerBg, borderRadius: 12, padding: 13, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: C.danger }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: C.danger, marginBottom: 4 }}>{failure.message}</Text>
          <Text style={{ fontSize: 11, color: C.text, lineHeight: 17 }}>
            {failure.detail || 'Check the connections in the highlighted area.'}
          </Text>
          <Text style={{ fontSize: 10, color: C.textTert, marginTop: 6 }}>
            {failure.category} · attempt {wrongTests + 1}
          </Text>
        </View>
      )}

      {solved && score && (
        <View style={{ backgroundColor: C.successBg, borderRadius: 14, padding: 15, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: C.success }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: C.success, marginBottom: 4 }}>Circuit verified</Text>
          <Text style={{ fontSize: 12, color: C.text, lineHeight: 18, marginBottom: 10 }}>
            Tested across every switch position. The load behaves correctly in all of them.
          </Text>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <View>
              <Text style={{ fontSize: 22, fontWeight: '800', color: C.text }}>{score.score}</Text>
              <Text style={{ fontSize: 10, color: C.textTert }}>SCORE</Text>
            </View>
            <View>
              <Text style={{ fontSize: 22, fontWeight: '800', color: C.text }}>{rankForXp(Math.round(score.score / 10)).title}</Text>
              <Text style={{ fontSize: 10, color: C.textTert }}>{rankForXp(0).disclaimer}</Text>
            </View>
          </View>
          {score.firstAttempt && (
            <Text style={{ fontSize: 12, fontWeight: '700', color: C.success, marginTop: 8 }}>
              First attempt, no hints. +150 bonus.
            </Text>
          )}
        </View>
      )}

      {hint && (
        <View style={{ backgroundColor: C.amberBg, borderRadius: 12, padding: 13, marginBottom: 12 }}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: C.amber, marginBottom: 4 }}>
            HINT {hint.level} OF 5{hint.penalty ? ` · −${hint.penalty}` : ''}
          </Text>
          <Text style={{ fontSize: 12.5, color: C.text, lineHeight: 19 }}>{hint.text}</Text>
        </View>
      )}

      {/* Controls */}
      <View style={{ flexDirection: 'row', gap: 9, marginBottom: 10 }}>
        {!solved ? (
          <>
            <TouchableOpacity
              onPress={test}
              disabled={wires.length === 0}
              style={{
                flex: 2, backgroundColor: wires.length ? C.blue : C.border, borderRadius: 12,
                paddingVertical: 15, alignItems: 'center', minHeight: 50, justifyContent: 'center',
              }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: wires.length ? '#fff' : C.textTert }}>
                Test Circuit
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={takeHint}
              style={{ flex: 1, backgroundColor: C.surface, borderRadius: 12, paddingVertical: 15, alignItems: 'center', borderWidth: 1.5, borderColor: C.border, minHeight: 50, justifyContent: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.textSec }}>Hint</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            onPress={onExit}
            style={{ flex: 1, backgroundColor: C.success, borderRadius: 12, paddingVertical: 15, alignItems: 'center', minHeight: 50, justifyContent: 'center' }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>Next Lesson</Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity onPress={reset} style={{ padding: 12, alignItems: 'center' }}>
        <Text style={{ fontSize: 13, color: C.textSec, fontWeight: '600' }}>Reset{resets > 0 ? ` (${resets})` : ''}</Text>
      </TouchableOpacity>

      <Text style={{ fontSize: 10, color: C.textTert, lineHeight: 15, marginTop: 8 }}>
        {TRAINING_DISCLAIMER}
      </Text>
    </ScrollView>
  );
}
