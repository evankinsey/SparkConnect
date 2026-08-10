// ─── HOURS ───────────────────────────────────────────────────────────────────
// The hours somebody will be asked to prove, by a person who will not take
// their word for it.
//
// An apprentice logs on-the-job hours toward turning out; a licensed
// electrician logs continuing education toward renewal. Same mechanism, two
// labels — which is why one screen serves both and why the role picked during
// onboarding decides which one it opens on.
//
// THE TARGET IS THE USER'S, NOT OURS. Every programme and every state board
// sets its own number and they change. This screen asks for the number on your
// paperwork and does arithmetic against it. Shipping "8,000" as a default would
// be the same failure as an AI stating an ampacity it never computed — it looks
// like a fact, it is a guess, and somebody plans a year around it.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  HoursKind, hoursKind, hoursKindForRole, hoursEntry, totalHours,
  hoursThisWeek, hoursProgress,
} from '../core/career/apprenticeship';

const KEY = '@sc_hours_v1';

const CATEGORIES = ['Residential', 'Commercial', 'Industrial', 'Service', 'Class'];

export default function HoursScreen({ C, role = null, setTab }) {
  const [kindId, setKindId] = useState(() => hoursKindForRole(role));
  const [state, setState] = useState(null);      // { entries, targets }
  const [hours, setHours] = useState('8');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [note, setNote] = useState('');
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetDraft, setTargetDraft] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        setState({
          entries: Array.isArray(parsed?.entries) ? parsed.entries : [],
          targets: parsed?.targets && typeof parsed.targets === 'object' ? parsed.targets : {},
        });
      } catch (e) {
        setState({ entries: [], targets: {} });
      }
    })();
  }, []);

  // A swallowed write on a record somebody will be asked to prove is the worst
  // failure this screen has. React state updates either way, so without this
  // the hours appear in the list, the app closes, and they are gone silently.
  const persist = useCallback(async (next) => {
    setState(next);
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(next));
      return true;
    } catch (e) {
      Alert.alert(
        'Not saved',
        'These hours could not be written to this device — storage may be full. '
        + 'They are still on screen, so write them down before closing the app.',
      );
      return false;
    }
  }, []);

  const meta = hoursKind(kindId);
  const entries = useMemo(
    () => (state?.entries ?? []).filter((e) => e.kind === kindId),
    [state, kindId],
  );
  const target = Number(state?.targets?.[kindId]) || 0;
  const progress = useMemo(
    () => hoursProgress({ logged: totalHours(entries), target }),
    [entries, target],
  );
  const week = useMemo(() => hoursThisWeek(entries), [entries]);

  const log = useCallback(async () => {
    const e = hoursEntry({ hours, category, note });
    if (!e) {
      Alert.alert('Check that number', 'Enter the hours worked — more than zero and no more than 24 in a day.');
      return;
    }
    await persist({ ...state, entries: [{ ...e, kind: kindId }, ...(state?.entries ?? [])] });
    setNote('');
  }, [hours, category, note, state, kindId, persist]);

  const saveTarget = useCallback(async () => {
    const n = Number(targetDraft);
    if (!Number.isFinite(n) || n <= 0) { setEditingTarget(false); return; }
    await persist({ ...state, targets: { ...(state?.targets ?? {}), [kindId]: Math.round(n) } });
    setEditingTarget(false);
  }, [targetDraft, state, kindId, persist]);

  const remove = useCallback(async (id) => {
    await persist({ ...state, entries: (state?.entries ?? []).filter((x) => x.id !== id) });
  }, [state, persist]);

  if (!state) return null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

      {/* Which ledger. Both are always available — the role only decides which
          one opens first. */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
        {[HoursKind.OJT, HoursKind.CONTINUING_ED].map((id) => {
          const on = kindId === id;
          const k = hoursKind(id);
          return (
            <TouchableOpacity key={id} onPress={() => setKindId(id)} activeOpacity={0.85}
              accessibilityRole="radio" accessibilityState={{ selected: on }}
              style={{
                flex: 1, paddingVertical: 11, borderRadius: 11, alignItems: 'center',
                backgroundColor: on ? C.blueSub : C.surface,
                borderWidth: 1.5, borderColor: on ? C.blue : C.border,
              }}>
              <Text style={{ fontSize: 12.5, fontWeight: '800', color: on ? C.blue : C.textSec }}>{k.short}</Text>
              <Text style={{ fontSize: 9.5, color: C.textTert, marginTop: 2 }}>{k.who}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Total against the target on YOUR paperwork */}
      <View style={{ backgroundColor: C.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="time" size={16} color={C.amber} />
          <Text style={{ flex: 1, fontSize: 11, fontWeight: '800', color: C.amber, letterSpacing: 0.6 }}>
            {meta.label.toUpperCase()}
          </Text>
          <TouchableOpacity onPress={() => { setTargetDraft(target ? String(target) : ''); setEditingTarget(true); }}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }} accessibilityRole="button"
            accessibilityLabel="Set the hours your programme requires">
            <Ionicons name="create-outline" size={16} color={C.textTert} />
          </TouchableOpacity>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 7, marginTop: 10 }}>
          <Text style={{ fontSize: 34, fontWeight: '900', color: C.text, letterSpacing: -1 }}>
            {progress.logged.toLocaleString()}
          </Text>
          {progress.known ? (
            <Text style={{ fontSize: 15, color: C.textTert, marginBottom: 6 }}>
              / {progress.target.toLocaleString()} {meta.unit}
            </Text>
          ) : null}
        </View>

        {progress.known ? (
          <View style={{ height: 7, borderRadius: 4, backgroundColor: C.border, marginTop: 10, overflow: 'hidden' }}>
            <View style={{ width: `${progress.percent}%`, height: 7, backgroundColor: C.green }} />
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', marginTop: 10 }}>
          <Text style={{ flex: 1, fontSize: 12, color: C.textSec }}>This week: {week}h</Text>
          {progress.known ? (
            <Text style={{ fontSize: 12, color: C.textSec }}>{progress.remaining.toLocaleString()}h to go</Text>
          ) : null}
        </View>

        <Text style={{ fontSize: 11, color: C.textTert, marginTop: 10, lineHeight: 16 }}>
          {progress.known ? meta.why : progress.note}
        </Text>
      </View>

      {editingTarget ? (
        <View style={{ backgroundColor: C.surface, borderRadius: 14, padding: 14, marginTop: 10, borderWidth: 1, borderColor: C.blue }}>
          <Text style={{ fontSize: 12.5, fontWeight: '700', color: C.text }}>{meta.targetPrompt}</Text>
          <Text style={{ fontSize: 11, color: C.textTert, marginTop: 4, lineHeight: 16 }}>{meta.targetHint}</Text>
          <TextInput
            value={targetDraft}
            onChangeText={setTargetDraft}
            keyboardType="number-pad"
            placeholder="e.g. 8000"
            placeholderTextColor={C.placeholder}
            style={{ backgroundColor: C.inputBg, borderRadius: 9, padding: 11, color: C.inputText, fontSize: 15, borderWidth: 1, borderColor: C.border, marginTop: 10 }}
          />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <TouchableOpacity onPress={saveTarget} style={{ flex: 1, backgroundColor: C.blue, borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff' }}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setEditingTarget(false)} style={{ paddingHorizontal: 18, justifyContent: 'center' }}>
              <Text style={{ fontSize: 13, color: C.textSec, fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* Log */}
      <Text style={{ fontSize: 11, fontWeight: '800', color: C.textTert, letterSpacing: 0.7, marginTop: 22, marginBottom: 8 }}>
        LOG HOURS
      </Text>
      <View style={{ backgroundColor: C.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TextInput
            value={hours}
            onChangeText={setHours}
            keyboardType="decimal-pad"
            accessibilityLabel="Hours"
            style={{ width: 84, backgroundColor: C.inputBg, borderRadius: 9, padding: 12, color: C.inputText, fontSize: 18, fontWeight: '800', textAlign: 'center', borderWidth: 1, borderColor: C.border }}
          />
          <Text style={{ fontSize: 13, color: C.textSec, fontWeight: '600' }}>hours</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
          <View style={{ flexDirection: 'row', gap: 7 }}>
            {CATEGORIES.map((c) => {
              const on = category === c;
              return (
                <TouchableOpacity key={c} onPress={() => setCategory(c)}
                  accessibilityRole="radio" accessibilityState={{ selected: on }}
                  style={{
                    paddingHorizontal: 13, paddingVertical: 9, borderRadius: 17,
                    backgroundColor: on ? C.amberBg : C.inputBg,
                    borderWidth: 1.5, borderColor: on ? C.amber : C.border,
                  }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: on ? C.amber : C.textSec }}>{c}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Notes (job, tasks — optional)"
          placeholderTextColor={C.placeholder}
          style={{ backgroundColor: C.inputBg, borderRadius: 9, padding: 11, color: C.inputText, fontSize: 13, borderWidth: 1, borderColor: C.border, marginTop: 12 }}
        />

        <TouchableOpacity onPress={log} activeOpacity={0.88}
          accessibilityRole="button" accessibilityLabel="Log these hours"
          style={{ backgroundColor: C.blue, borderRadius: 11, paddingVertical: 14, alignItems: 'center', marginTop: 12, flexDirection: 'row', justifyContent: 'center', gap: 7 }}>
          <Ionicons name="add" size={17} color="#fff" />
          <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff' }}>Log Hours</Text>
        </TouchableOpacity>
      </View>

      <Text style={{ fontSize: 11, fontWeight: '800', color: C.textTert, letterSpacing: 0.7, marginTop: 22, marginBottom: 8 }}>
        RECENT ENTRIES
      </Text>
      {entries.length === 0 ? (
        <Text style={{ fontSize: 12.5, color: C.textTert, lineHeight: 19 }}>
          Nothing logged yet. Log your first day above — the week it happens is the only time
          you will remember it accurately.
        </Text>
      ) : entries.slice(0, 40).map((e) => (
        <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: C.surface, borderRadius: 11, padding: 12, marginBottom: 7, borderWidth: 1, borderColor: C.border }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: C.text, width: 46 }}>{e.hours}h</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12.5, color: C.text, fontWeight: '600' }}>{e.category || 'Logged'}</Text>
            <Text style={{ fontSize: 10.5, color: C.textTert, marginTop: 2 }}>
              {e.date}{e.note ? ` · ${e.note}` : ''}
            </Text>
          </View>
          <TouchableOpacity onPress={() => remove(e.id)} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            accessibilityRole="button" accessibilityLabel={`Delete ${e.hours} hours on ${e.date}`}>
            <Ionicons name="close" size={16} color={C.textTert} />
          </TouchableOpacity>
        </View>
      ))}

      <Text style={{ fontSize: 10.5, color: C.textTert, marginTop: 18, lineHeight: 16 }}>
        This is your own record, kept on this device. It is not submitted anywhere and it does
        not replace whatever your programme or state board asks you to file.
      </Text>
    </ScrollView>
  );
}
