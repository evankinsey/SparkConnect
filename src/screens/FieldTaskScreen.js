// ─── FIELD TASK ──────────────────────────────────────────────────────────────
// A crew member asks for a specific number. You go work it out — in the real
// calculator, which is the point — and come back with it.
//
// The screen renders and collects. `src/core/game/fieldTasks.js` decides what
// is right, and it is tested against the same formulas the calculators use.

import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Image, Vibration, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { fieldTaskById, gradeFieldTask, gradePhotoTask, FieldTaskKind } from '../core/game/fieldTasks';
import { characterById } from '../core/game/cast';
import { portraitFor } from './castImages';

export default function FieldTaskScreen({ C, taskId, onSolved, onClose, onOpenTool, pickImage, onPhotoTaken }) {
  const task = fieldTaskById(taskId);
  const [input, setInput] = useState('');
  const [result, setResult] = useState(null);
  const [tries, setTries] = useState(0);

  if (!task) return null;
  if (task.kind === FieldTaskKind.PHOTO) {
    return (
      <PhotoTask
        C={C} task={task}
        onSolved={onSolved} onClose={onClose}
        pickImage={pickImage} onPhotoTaken={onPhotoTaken}
      />
    );
  }

  const who = characterById(task.character);
  const art = who ? portraitFor(who.id) : null;
  const accent = who?.accent ?? C.blue;
  const solved = result?.correct;

  const submit = () => {
    const r = gradeFieldTask(task.id, input);
    if (!r.ok) return;
    setResult(r);
    try {
      if (Platform.OS !== 'web') Vibration.vibrate(r.correct ? 30 : [0, 40, 60, 40]);
    } catch (e) { /* ignore */ }
    if (r.correct) onSolved && onSolved(task.id);
    else setTries((n) => n + 1);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button" accessibilityLabel="Back to the job site">
          <Ionicons name="chevron-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 16, fontWeight: '800', color: C.text }}>{who?.name} needs a number</Text>
      </View>

      {/* The ask, in their voice */}
      <View style={{ backgroundColor: C.surface, borderRadius: 16, padding: 14, borderWidth: 1.5, borderColor: accent, flexDirection: 'row', gap: 12, marginBottom: 12 }}>
        {art && <Image source={art} style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: accent }} />}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: accent }}>{who?.name} · {who?.role}</Text>
          <Text style={{ fontSize: 13, color: C.text, lineHeight: 19, marginTop: 3 }}>“{task.ask}”</Text>
        </View>
      </View>

      {/* What you were given */}
      {task.given.length > 0 && (
        <View style={{ backgroundColor: C.inputBg, borderRadius: 12, padding: 13, marginBottom: 12 }}>
          <Text style={{ fontSize: 10.5, fontWeight: '800', color: C.textSec, letterSpacing: 0.6, marginBottom: 7 }}>WHAT YOU KNOW</Text>
          {task.given.map((g, i) => (
            <Text key={i} style={{ fontSize: 12.5, color: C.text, lineHeight: 19 }}>• {g}</Text>
          ))}
        </View>
      )}

      {/* Go use the real tool. This is the whole design: the job teaches the
          tool, so the task hands you straight to it rather than replacing it. */}
      <TouchableOpacity
        onPress={() => onOpenTool && onOpenTool(task.tool)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.blueSub, borderRadius: 12, padding: 13, marginBottom: 12, borderWidth: 1, borderColor: C.blue }}>
        <Ionicons name="calculator" size={17} color={C.blue} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.blue }}>Open {task.toolHint}</Text>
          <Text style={{ fontSize: 11, color: C.textSec }}>Work it out, then come back with the number</Text>
        </View>
        <Ionicons name="chevron-forward" size={15} color={C.blue} />
      </TouchableOpacity>

      {/* The answer */}
      <Text style={{ fontSize: 10.5, fontWeight: '800', color: C.textSec, letterSpacing: 0.6, marginBottom: 7 }}>YOUR ANSWER</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: C.inputBg, borderRadius: 12, borderWidth: 1.5, borderColor: solved ? C.success : C.border, paddingHorizontal: 13 }}>
          <TextInput
            value={input}
            onChangeText={(v) => { setInput(v); setResult(null); }}
            editable={!solved}
            placeholder="0.00"
            placeholderTextColor={C.textTert}
            keyboardType="decimal-pad"
            returnKeyType="done"
            onSubmitEditing={submit}
            accessibilityLabel={`Your answer in ${task.unit}`}
            style={{ flex: 1, paddingVertical: 13, fontSize: 17, fontWeight: '700', color: C.text }}
          />
          <Text style={{ fontSize: 14, fontWeight: '700', color: C.textTert }}>{task.unit}</Text>
        </View>
        {!solved && (
          <TouchableOpacity onPress={submit}
            style={{ backgroundColor: C.blue, borderRadius: 12, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', minHeight: 50 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff' }}>Check</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Feedback. A wrong answer gets the nudge, never the number. */}
      {result && !result.correct && (
        <View style={{ backgroundColor: C.amberBg, borderRadius: 12, padding: 13, marginBottom: 12, flexDirection: 'row', gap: 9 }}>
          <Ionicons name="bulb" size={16} color={C.amber} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12.5, color: C.text, lineHeight: 19 }}>{result.message}</Text>
            {tries >= 2 && (
              <Text style={{ fontSize: 11, color: C.textTert, marginTop: 5 }}>
                Open {task.toolHint} above and put the givens in — it does the arithmetic.
              </Text>
            )}
          </View>
        </View>
      )}

      {solved && (
        <View>
          <View style={{ backgroundColor: C.successBg, borderRadius: 14, padding: 14, borderLeftWidth: 4, borderLeftColor: C.success, marginBottom: 10 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: C.success, marginBottom: 5 }}>That is the number</Text>
            <Text style={{ fontSize: 12.5, color: C.text, lineHeight: 19 }}>{result.message}</Text>
          </View>
          <TouchableOpacity onPress={onClose}
            style={{ backgroundColor: C.success, borderRadius: 12, paddingVertical: 15, alignItems: 'center', minHeight: 50, justifyContent: 'center' }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>Back to the job site</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

// ─── Photo task ──────────────────────────────────────────────────────────────
// The Owner asks for a shot of the rough-in. Grading is "was a photo actually
// taken during this task" — the count going up. Walking to the truck and
// looking at last week's photos is not the work he asked for.
//
// The capture happens here rather than by navigating to Job Cam, because
// navigating away unmounts the job site and takes the task with it. The photo
// is handed up so App can file it with the rest.

function PhotoTask({ C, task, onSolved, onClose, pickImage, onPhotoTaken }) {
  const [shot, setShot] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const who = characterById(task.character);
  const art = who ? portraitFor(who.id) : null;
  const accent = who?.accent ?? C.blue;

  const capture = async (source) => {
    setError(null);
    try {
      const picked = await pickImage?.(source);
      if (!picked?.uri) return;   // cancelled — not a failure, say nothing
      setShot(picked);
      onPhotoTaken && onPhotoTaken(picked);
      // Count went from 0 to 1 within this task, which is the whole test.
      const r = gradePhotoTask(task.id, 0, 1);
      setResult(r);
      try { if (Platform.OS !== 'web') Vibration.vibrate(30); } catch (e) { /* ignore */ }
      if (r.correct) onSolved && onSolved(task.id);
    } catch (e) {
      setError('Could not open the camera. Check permissions in Settings.');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button" accessibilityLabel="Back to the job site">
          <Ionicons name="chevron-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 16, fontWeight: '800', color: C.text }}>Document the job</Text>
      </View>

      <View style={{ backgroundColor: C.surface, borderRadius: 16, padding: 14, borderWidth: 1.5, borderColor: accent, flexDirection: 'row', gap: 12, marginBottom: 12 }}>
        {art && <Image source={art} style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: accent }} />}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: accent }}>{who?.name} · {who?.role}</Text>
          <Text style={{ fontSize: 13, color: C.text, lineHeight: 19, marginTop: 3 }}>“{task.ask}”</Text>
        </View>
      </View>

      {shot && (
        <View style={{ borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: C.border, marginBottom: 12 }}>
          <Image source={{ uri: shot.uri }} style={{ width: '100%', height: 200 }} resizeMode="cover" />
        </View>
      )}

      {error && (
        <View style={{ backgroundColor: C.dangerBg, borderRadius: 12, padding: 13, marginBottom: 12 }}>
          <Text style={{ fontSize: 12.5, color: C.text, lineHeight: 18 }}>{error}</Text>
        </View>
      )}

      {!result?.correct && (
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          <TouchableOpacity onPress={() => capture('camera')}
            style={{ flex: 2, flexDirection: 'row', gap: 7, backgroundColor: C.blue, borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', minHeight: 50 }}>
            <Ionicons name="camera" size={17} color="#fff" />
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff' }}>Take the shot</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => capture('library')}
            style={{ flex: 1, borderRadius: 12, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center', minHeight: 50 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: C.textSec }}>Library</Text>
          </TouchableOpacity>
        </View>
      )}

      {result?.correct && (
        <View>
          <View style={{ backgroundColor: C.successBg, borderRadius: 14, padding: 14, borderLeftWidth: 4, borderLeftColor: C.success, marginBottom: 10 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: C.success, marginBottom: 5 }}>On file</Text>
            <Text style={{ fontSize: 12.5, color: C.text, lineHeight: 19 }}>{result.message}</Text>
          </View>
          <TouchableOpacity onPress={onClose}
            style={{ backgroundColor: C.success, borderRadius: 12, paddingVertical: 15, alignItems: 'center', minHeight: 50, justifyContent: 'center' }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>Back to the job site</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}
