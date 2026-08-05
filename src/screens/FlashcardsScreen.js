// ─── FLASHCARDS ──────────────────────────────────────────────────────────────
// Spaced repetition over the code question bank.
//
// Cards you miss come back the same day; cards you know stretch further out each
// time. That is the whole value — fifteen minutes on the right cards beats an
// hour re-reading everything.

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { NEC_QUESTIONS } from '../core/content/dailyQuestions';
import {
  card, review, Grade, buildSession, deckStats, weakestTopics, dailyStudyPlan,
} from '../core/training/flashcards';

const KEY = '@sc_flashcards_v1';
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// The question bank becomes a deck: prompt on the front, answer plus the
// explanation on the back.
const seedDeck = () => NEC_QUESTIONS.map((q) => card({
  id: q.id,
  front: q.question,
  back: `${q.choices[q.correct]}\n\n${q.explanation}`,
  category: q.category,
  ref: q.ref,
}));

export default function FlashcardsScreen({ C, setTab, onStreakUpdate }) {
  const [deck, setDeck] = useState(null);
  const [session, setSession] = useState(null);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        const saved = raw ? JSON.parse(raw) : null;
        if (Array.isArray(saved) && saved.length) {
          // Merge in any questions added since the deck was saved.
          const byId = new Map(saved.map((c) => [c.id, c]));
          setDeck(seedDeck().map((c) => byId.get(c.id) ?? c));
        } else {
          setDeck(seedDeck());
        }
      } catch (e) {
        setDeck(seedDeck());
      }
    })();
  }, []);

  const persist = async (next) => {
    setDeck(next);
    try { await AsyncStorage.setItem(KEY, JSON.stringify(next)); } catch (e) { /* ignore */ }
  };

  const stats = useMemo(() => (deck ? deckStats(deck, today()) : null), [deck]);
  const weak = useMemo(() => (deck ? weakestTopics(deck) : []), [deck]);

  if (!deck) return null;

  // ── Study session ─────────────────────────────────────────────────────────
  if (session && !done) {
    const current = session.cards[index];
    if (!current) { setDone(true); return null; }

    const grade = (g) => {
      const updated = review(current, g, today());
      persist(deck.map((c) => (c.id === updated.id ? updated : c)));
      setFlipped(false);
      if (index + 1 >= session.cards.length) {
        setDone(true);
        onStreakUpdate && onStreakUpdate();
      } else {
        setIndex(index + 1);
      }
    };

    return (
      <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 44 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <TouchableOpacity onPress={() => { setSession(null); setIndex(0); setFlipped(false); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={24} color={C.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, height: 6, backgroundColor: C.border, borderRadius: 3, overflow: 'hidden' }}>
            <View style={{ width: `${((index) / session.cards.length) * 100}%`, height: 6, backgroundColor: C.blue }} />
          </View>
          <Text style={{ fontSize: 12, fontWeight: '700', color: C.textSec }}>
            {index + 1}/{session.cards.length}
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => setFlipped((v) => !v)}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel={flipped ? 'Show question' : 'Show answer'}
          style={{
            backgroundColor: C.surface, borderRadius: 18, padding: 22, minHeight: 240,
            borderWidth: 1.5, borderColor: flipped ? C.success : C.border, justifyContent: 'center',
          }}>
          <Text style={{ fontSize: 10.5, fontWeight: '800', color: C.textTert, letterSpacing: 0.6, marginBottom: 12 }}>
            {current.category?.toUpperCase()}{flipped ? ' · ANSWER' : ''}
          </Text>
          <Text style={{ fontSize: flipped ? 15 : 17, fontWeight: flipped ? '500' : '700', color: C.text, lineHeight: flipped ? 23 : 25 }}>
            {flipped ? current.back : current.front}
          </Text>
          {flipped && !!current.ref && (
            <Text style={{ fontSize: 11.5, fontWeight: '700', color: C.success, marginTop: 12 }}>{current.ref}</Text>
          )}
          {!flipped && (
            <Text style={{ fontSize: 12, color: C.textTert, marginTop: 18 }}>Tap to reveal</Text>
          )}
        </TouchableOpacity>

        {flipped ? (
          <View style={{ marginTop: 16 }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: C.textSec, letterSpacing: 0.5, marginBottom: 9 }}>
              HOW DID THAT GO?
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[
                { g: Grade.AGAIN, label: 'Again', sub: 'today', color: C.danger },
                { g: Grade.HARD, label: 'Hard', sub: 'soon', color: C.amber },
                { g: Grade.GOOD, label: 'Good', sub: 'later', color: C.blue },
                { g: Grade.EASY, label: 'Easy', sub: 'much later', color: C.success },
              ].map((b) => (
                <TouchableOpacity
                  key={b.g}
                  onPress={() => grade(b.g)}
                  style={{
                    flex: 1, backgroundColor: C.surface, borderRadius: 12, paddingVertical: 13,
                    alignItems: 'center', borderWidth: 1.5, borderColor: b.color, minHeight: 58, justifyContent: 'center',
                  }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: b.color }}>{b.label}</Text>
                  <Text style={{ fontSize: 9.5, color: C.textTert, marginTop: 2 }}>{b.sub}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => setFlipped(true)}
            style={{ backgroundColor: C.blue, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 16, minHeight: 50, justifyContent: 'center' }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>Show Answer</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    );
  }

  // ── Session finished ──────────────────────────────────────────────────────
  if (done) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16 }}>
        <View style={{ backgroundColor: C.successBg, borderRadius: 16, padding: 20, marginTop: 24, borderLeftWidth: 4, borderLeftColor: C.success }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: C.success, marginBottom: 6 }}>Session complete</Text>
          <Text style={{ fontSize: 13, color: C.text, lineHeight: 20 }}>
            {session.cards.length} cards reviewed. The ones you missed will come back today; the ones you knew are scheduled further out.
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => { setDone(false); setSession(null); setIndex(0); }}
          style={{ backgroundColor: C.blue, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 18, minHeight: 50, justifyContent: 'center' }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>Back to Deck</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── Deck overview ─────────────────────────────────────────────────────────
  const plan = dailyStudyPlan(deck, { today: today(), minutes: 10 });

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 44 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.purpleBg, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="albums" size={20} color={C.purple} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: C.text }}>Flashcards</Text>
          <Text style={{ fontSize: 12, color: C.textTert }}>Spaced repetition</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 9, marginBottom: 14 }}>
        {[
          { label: 'DUE', value: stats.due, color: C.blue },
          { label: 'NEW', value: stats.new, color: C.textSec },
          { label: 'MATURE', value: stats.mature, color: C.success },
        ].map((s) => (
          <View key={s.label} style={{ flex: 1, backgroundColor: C.surface, borderRadius: 12, padding: 13, borderWidth: 1, borderColor: C.border }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: s.color }}>{s.value}</Text>
            <Text style={{ fontSize: 9.5, color: C.textTert, letterSpacing: 0.4 }}>{s.label}</Text>
          </View>
        ))}
      </View>

      {!!plan.focusSuggestion && (
        <View style={{ backgroundColor: C.amberBg, borderRadius: 12, padding: 13, marginBottom: 14 }}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: C.amber, marginBottom: 3 }}>WEAKEST AREA</Text>
          <Text style={{ fontSize: 13, color: C.text }}>{plan.focusSuggestion}</Text>
        </View>
      )}

      <TouchableOpacity
        onPress={() => { setSession(buildSession(deck, { today: today(), limit: 20, newCardLimit: 5 })); setIndex(0); setFlipped(false); }}
        style={{ backgroundColor: C.blue, borderRadius: 14, paddingVertical: 16, alignItems: 'center', minHeight: 56, justifyContent: 'center', marginBottom: 10 }}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>Study Now</Text>
        <Text style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>
          {stats.due + Math.min(5, stats.new)} cards · about {Math.round(plan.estimatedSeconds / 60)} min
        </Text>
      </TouchableOpacity>

      {weak.length > 0 && (
        <View style={{ marginTop: 8 }}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: C.textSec, letterSpacing: 0.5, marginBottom: 8 }}>
            ACCURACY BY TOPIC
          </Text>
          {weak.map((w) => (
            <View key={w.category} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.borderLight }}>
              <Text style={{ flex: 1, fontSize: 13, color: C.text }}>{w.category}</Text>
              <Text style={{ fontSize: 12, color: C.textTert }}>{w.lapses} missed</Text>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity onPress={() => setTab && setTab('learn')} style={{ padding: 14, alignItems: 'center', marginTop: 10 }}>
        <Text style={{ color: C.textSec, fontSize: 13, fontWeight: '600' }}>Back to Learn</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
