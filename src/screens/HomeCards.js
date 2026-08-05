// ─── HOME CARDS ──────────────────────────────────────────────────────────────
// Renders the user's chosen Home layout, plus the Customize entry point.

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  resolveLayout, catalogWithState, sanitizeLayout, addCard, removeCard, moveCard,
  layoutForRole, CardKind, MAX_CARDS,
} from '../core/home/layout';
import { dailyChallenge, answerDailyChallenge } from '../core/challenges/daily';
import { rankForXp } from '../circuit/scoring';

const KEY_LAYOUT = '@sc_home_layout_v1';
const KEY_ROLE = '@sc_role';

export const useHomeLayout = () => {
  const [layout, setLayout] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY_LAYOUT);
        if (raw) { setLayout(sanitizeLayout(JSON.parse(raw))); return; }
        const role = await AsyncStorage.getItem(KEY_ROLE);
        setLayout(layoutForRole(role));
      } catch (e) {
        setLayout(layoutForRole(null));
      }
    })();
  }, []);

  const save = useCallback(async (next) => {
    const clean = sanitizeLayout(next);
    setLayout(clean);
    try { await AsyncStorage.setItem(KEY_LAYOUT, JSON.stringify(clean)); } catch (e) { /* ignore */ }
    return clean;
  }, []);

  return { layout, save };
};

// ─── The card strip on Home ──────────────────────────────────────────────────

export function HomeCards({ C, setTab, layout, streak = 0, xp = 0, onCustomize }) {
  if (!layout) return null;
  const cards = resolveLayout(layout);

  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <Text style={{ flex: 1, fontSize: 13, fontWeight: '800', color: C.textSec, letterSpacing: 0.6 }}>
          YOUR HOME
        </Text>
        <TouchableOpacity
          onPress={onCustomize}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Customize home screen">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="options-outline" size={15} color={C.blue} />
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: C.blue }}>Customize</Text>
          </View>
        </TouchableOpacity>
      </View>

      {cards.map((card) => {
        if (card.kind === CardKind.WIDGET) {
          // daily_challenge left the catalog — the pinned Daily Code Question
          // made it read as the same widget twice on Home.
          if (card.id === 'streak') return <StreakWidget key={card.id} C={C} streak={streak} xp={xp} />;
          return null; // daily_question is rendered by HomeScreen itself
        }
        return (
          <TouchableOpacity
            key={card.id}
            onPress={() => setTab(card.tab)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={card.title}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 12,
              backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 9,
              borderWidth: 1, borderColor: C.border, minHeight: 64,
            }}>
            <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: C.blueSub, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={card.icon} size={19} color={C.blue} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14.5, fontWeight: '700', color: C.text }}>{card.title}</Text>
              <Text style={{ fontSize: 11.5, color: C.textTert, marginTop: 1 }}>{card.sub}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={C.textTert} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Daily Field Challenge widget ────────────────────────────────────────────

function ChallengeWidget({ C }) {
  const challenge = React.useMemo(() => dailyChallenge(new Date()), []);
  const [picked, setPicked] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const [amount, setAmount] = useState('');

  const answer = (value) => {
    if (outcome) return;
    setPicked(value);
    setOutcome(answerDailyChallenge(challenge, value));
  };

  return (
    <View style={{
      backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 9,
      borderWidth: 1, borderColor: C.border, borderLeftWidth: 4, borderLeftColor: C.amber,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Ionicons name="flame" size={17} color={C.amber} />
        <Text style={{ flex: 1, fontSize: 13, fontWeight: '800', color: C.amber }}>{challenge.title}</Text>
        <Text style={{ fontSize: 10.5, color: C.textTert }}>+{challenge.xp} XP</Text>
      </View>

      <Text style={{ fontSize: 13.5, fontWeight: '600', color: C.text, lineHeight: 20, marginBottom: 11 }}>
        {challenge.prompt}
      </Text>

      {challenge.kind === 'FREEFORM_NUMBER' ? (
        <>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            {[500, 1500, 3000, 6000].map((v) => (
              <TouchableOpacity
                key={v}
                onPress={() => { setAmount(String(v)); answer(v); }}
                disabled={!!outcome}
                style={{
                  paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, minHeight: 44, justifyContent: 'center',
                  backgroundColor: picked === v ? C.blueSub : C.inputBg,
                  borderWidth: 1.5, borderColor: picked === v ? C.blue : C.border,
                }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: picked === v ? C.blue : C.textSec }}>
                  ${v.toLocaleString()}{v === 6000 ? '+' : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {outcome && (
            <Text style={{ fontSize: 12, color: C.textSec, lineHeight: 18 }}>{challenge.note}</Text>
          )}
        </>
      ) : (
        <>
          {challenge.choices.map((choice, i) => {
            const isPicked = picked === i;
            const isRight = outcome && i === challenge.correct;
            const isWrong = outcome && isPicked && !outcome.correct;
            let bg = C.inputBg, border = C.border, color = C.textSec;
            if (isRight) { bg = C.successBg; border = C.success; color = C.success; }
            else if (isWrong) { bg = C.dangerBg; border = C.danger; color = C.danger; }

            return (
              <TouchableOpacity
                key={i}
                onPress={() => answer(i)}
                disabled={!!outcome}
                activeOpacity={0.85}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10,
                  backgroundColor: bg, borderWidth: 1.5, borderColor: border, marginBottom: 6, minHeight: 46,
                }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: border, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 10.5, fontWeight: '800', color: '#fff' }}>{String.fromCharCode(65 + i)}</Text>
                </View>
                <Text style={{ flex: 1, fontSize: 12.5, fontWeight: '500', color, lineHeight: 18 }}>{choice}</Text>
                {isRight && <Ionicons name="checkmark-circle" size={17} color={C.success} />}
                {isWrong && <Ionicons name="close-circle" size={17} color={C.danger} />}
              </TouchableOpacity>
            );
          })}

          {outcome && challenge.explanation && (
            <View style={{ backgroundColor: C.successBg, borderRadius: 10, padding: 11, marginTop: 4, borderLeftWidth: 3, borderLeftColor: C.success }}>
              {!!challenge.ref && (
                <Text style={{ fontSize: 10.5, fontWeight: '800', color: C.success, marginBottom: 3 }}>{challenge.ref}</Text>
              )}
              <Text style={{ fontSize: 12, color: C.text, lineHeight: 18 }}>{challenge.explanation}</Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}

function StreakWidget({ C, streak, xp }) {
  const rank = rankForXp(xp);
  return (
    <View style={{
      flexDirection: 'row', gap: 12, backgroundColor: C.surface, borderRadius: 14,
      padding: 14, marginBottom: 9, borderWidth: 1, borderColor: C.border,
    }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 24, fontWeight: '800', color: C.text }}>{streak}</Text>
        <Text style={{ fontSize: 10.5, color: C.textTert }}>DAY STREAK</Text>
      </View>
      <View style={{ flex: 2 }}>
        <Text style={{ fontSize: 14, fontWeight: '800', color: C.text }}>{rank.title}</Text>
        <Text style={{ fontSize: 10.5, color: C.textTert }}>{xp} XP · {rank.disclaimer}</Text>
      </View>
    </View>
  );
}

// ─── Customize screen ────────────────────────────────────────────────────────

export function HomeCustomizeScreen({ C, layout, onSave, onDone }) {
  const [draft, setDraft] = useState(sanitizeLayout(layout));
  const groups = catalogWithState(draft);

  const apply = (next) => { setDraft(next); onSave(next); };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 44 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <TouchableOpacity onPress={onDone} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={24} color={C.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: C.text }}>Customize Home</Text>
          <Text style={{ fontSize: 11.5, color: C.textTert }}>{draft.length} of {MAX_CARDS} cards</Text>
        </View>
      </View>

      <Text style={{ fontSize: 11, fontWeight: '800', color: C.textSec, letterSpacing: 0.5, marginBottom: 8 }}>
        ON YOUR HOME — TAP ARROWS TO REORDER
      </Text>
      {draft.length === 0 && (
        <Text style={{ fontSize: 12.5, color: C.textTert, marginBottom: 12 }}>
          Nothing yet. Add cards from the list below.
        </Text>
      )}
      {resolveLayout(draft).map((card, i) => (
        <View key={card.id} style={{
          flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface,
          borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.border,
        }}>
          <Ionicons name={card.icon} size={18} color={C.blue} />
          <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '600', color: C.text }}>{card.title}</Text>
          <TouchableOpacity onPress={() => apply(moveCard(draft, card.id, 'up'))} disabled={i === 0} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
            <Ionicons name="chevron-up" size={20} color={i === 0 ? C.border : C.textSec} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => apply(moveCard(draft, card.id, 'down'))} disabled={i === draft.length - 1} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
            <Ionicons name="chevron-down" size={20} color={i === draft.length - 1 ? C.border : C.textSec} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => apply(removeCard(draft, card.id))} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
            <Ionicons name="remove-circle" size={20} color={C.danger} />
          </TouchableOpacity>
        </View>
      ))}

      {groups.map((g) => (
        <View key={g.group} style={{ marginTop: 18 }}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: C.textSec, letterSpacing: 0.5, marginBottom: 8 }}>
            {g.group.toUpperCase()}
          </Text>
          {g.cards.map((card) => (
            <TouchableOpacity
              key={card.id}
              onPress={() => apply(card.on ? removeCard(draft, card.id) : addCard(draft, card.id))}
              activeOpacity={0.85}
              accessibilityRole="switch"
              accessibilityState={{ checked: card.on }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: C.surface,
                borderRadius: 12, padding: 12, marginBottom: 8, minHeight: 56,
                borderWidth: 1.5, borderColor: card.on ? C.blue : C.border,
              }}>
              <Ionicons name={card.icon} size={18} color={card.on ? C.blue : C.textTert} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13.5, fontWeight: '600', color: C.text }}>{card.title}</Text>
                <Text style={{ fontSize: 11, color: C.textTert, marginTop: 1 }}>{card.sub}</Text>
              </View>
              <Ionicons
                name={card.on ? 'checkmark-circle' : 'add-circle-outline'}
                size={22}
                color={card.on ? C.blue : C.textTert}
              />
            </TouchableOpacity>
          ))}
        </View>
      ))}

      <TouchableOpacity onPress={onDone} style={{ backgroundColor: C.blue, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 20, minHeight: 50, justifyContent: 'center' }}>
        <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>Done</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
