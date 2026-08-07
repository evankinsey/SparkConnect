// ─── ONBOARDING ──────────────────────────────────────────────────────────────
// Renders src/core/onboarding/flow.js. All the ordering, the effects and the
// copy rules live there and are tested; this file draws them.
//
// THIS FILE USED TO BE DEAD. It was imported at App.js:8 and never rendered —
// the app showed a disclaimer screen instead — so the role it collected was
// never written and every user has been running the default Home layout since
// launch. It is now the onboarding, and App.js renders it.
//
// The value moment is a REAL daily question from the shipped content, answered
// in place, with its reasoning and its citation. Not a screenshot of one.

import React, { useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, SafeAreaView, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  StepId, STEPS, ROLES, FOCUS, TOTAL_STEPS,
  beginOnboarding, answer, canAdvance, advance, back, stepAt,
  previewFor, outcome, offerFor,
} from './core/onboarding/flow';
import { getDailyQuestion } from './core/content/dailyQuestions';

const C = {
  bg: '#080B11', card: '#101520', raised: '#161C29',
  line: '#222A3A', lineSoft: '#1A2130',
  text: '#E9EDF4', text2: '#AEB8CA', muted: '#7F8AA0',
  blue: '#1D6FFF', blue2: '#5D9BFF', blueDim: 'rgba(29,111,255,0.10)', blueLine: 'rgba(29,111,255,0.32)',
  hi: '#F5A524', hiDim: 'rgba(245,165,36,0.10)',
  ok: '#3DBE7A', okDim: 'rgba(61,190,122,0.12)',
};

export default function OnboardingFlow({ onComplete }) {
  const [state, setState] = useState(beginOnboarding);
  const step = stepAt(state.index);

  const set = (v) => setState((s) => answer(s, step.id, v));
  const next = () => setState((s) => {
    const n = advance(s);
    if (n.done) onComplete?.(outcome(n));
    return n;
  });
  const skip = () => next();

  if (!step) return null;

  return (
    <View style={s.root}>
      <SafeAreaView style={{ flex: 1 }}>
        {/* Progress, and a way back. A flow with no back button is a flow
            people leave rather than correct. */}
        <View style={s.topbar}>
          {state.index > 0 ? (
            <TouchableOpacity
              onPress={() => setState(back)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Back">
              <Ionicons name="chevron-back" size={22} color={C.muted} />
            </TouchableOpacity>
          ) : <View style={{ width: 22 }} />}

          <View style={s.rail}>
            {STEPS.map((st, i) => (
              <View key={st.id} style={[s.railSeg, i <= state.index && s.railSegOn]} />
            ))}
          </View>

          {step.skippable
            ? (
              <TouchableOpacity onPress={skip} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityRole="button">
                <Text style={s.skip}>Skip</Text>
              </TouchableOpacity>
            )
            : <View style={{ width: 30 }} />}
        </View>

        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <Text style={s.stepNo}>{state.index + 1} / {TOTAL_STEPS}</Text>
          <Text style={s.h1}>{step.title}</Text>
          <Text style={s.sub}>{step.sub}</Text>

          {step.id === StepId.ROLE && <RoleStep value={state.answers[StepId.ROLE]} onPick={set} />}
          {step.id === StepId.FOCUS && <FocusStep value={state.answers[StepId.FOCUS]} onPick={set} />}
          {step.id === StepId.PROOF && <ProofStep />}
          {step.id === StepId.LEGAL && <LegalStep value={state.answers[StepId.LEGAL]} onChange={set} />}
          {step.id === StepId.NOTIFY && <NotifyStep />}
          {step.id === StepId.TRIAL && <TrialStep roleId={state.answers[StepId.ROLE]} />}
        </ScrollView>

        <View style={s.footer}>
          {step.id === StepId.TRIAL ? (
            <>
              <TouchableOpacity style={s.cta} onPress={() => { set(true); next(); }} accessibilityRole="button">
                <Text style={s.ctaT}>Start free trial</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { set(false); next(); }} style={s.ghost} accessibilityRole="button">
                <Text style={s.ghostT}>{offerFor(state.answers[StepId.ROLE]).freeAlternative}</Text>
              </TouchableOpacity>
            </>
          ) : step.id === StepId.NOTIFY ? (
            <>
              <TouchableOpacity style={s.cta} onPress={() => { set(true); next(); }} accessibilityRole="button">
                <Text style={s.ctaT}>Send me one a day</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { set(false); next(); }} style={s.ghost} accessibilityRole="button">
                <Text style={s.ghostT}>Not now</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={[s.cta, !canAdvance(state) && s.ctaOff]}
              onPress={next}
              disabled={!canAdvance(state)}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canAdvance(state) }}>
              <Text style={[s.ctaT, !canAdvance(state) && s.ctaTOff]}>
                {step.id === StepId.LEGAL ? 'Agree and continue' : 'Continue'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

// ─── Steps ───────────────────────────────────────────────────────────────────

/**
 * The role picker, with the consequence shown the moment it is picked.
 *
 * Personalisation only converts when somebody watches it happen. A quiz whose
 * result appears three screens later reads as a form.
 */
function RoleStep({ value, onPick }) {
  const preview = value ? previewFor(value) : null;
  return (
    <View style={{ gap: 9 }}>
      {ROLES.map((r) => {
        const on = value === r.id;
        return (
          <TouchableOpacity
            key={r.id}
            onPress={() => onPick(r.id)}
            style={[s.opt, on && s.optOn]}
            activeOpacity={0.85}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}>
            <View style={{ flex: 1 }}>
              <Text style={[s.optT, on && { color: C.text }]}>{r.label}</Text>
              <Text style={s.optS}>{r.sub}</Text>
            </View>
            <View style={[s.radio, on && s.radioOn]}>{on && <View style={s.radioDot} />}</View>
          </TouchableOpacity>
        );
      })}

      {!!preview && (
        <View style={s.payoff}>
          <Ionicons name="checkmark-circle" size={16} color={C.ok} style={{ marginTop: 1 }} />
          <Text style={s.payoffT}>{preview.promise}</Text>
        </View>
      )}
    </View>
  );
}

function FocusStep({ value, onPick }) {
  return (
    <View style={{ gap: 9 }}>
      {FOCUS.map((f) => {
        const on = value === f.id;
        return (
          <TouchableOpacity
            key={f.id}
            onPress={() => onPick(f.id)}
            style={[s.opt, on && s.optOn]}
            activeOpacity={0.85}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}>
            <Text style={[s.optT, { flex: 1 }, on && { color: C.text }]}>{f.label}</Text>
            <View style={[s.radio, on && s.radioOn]}>{on && <View style={s.radioDot} />}</View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/**
 * The value moment.
 *
 * A real question out of the shipped content, answerable here, with the
 * reasoning and the code section revealed. Nothing is asked for on this screen
 * — that is the point of it.
 */
function ProofStep() {
  const q = useMemo(() => getDailyQuestion(), []);
  const [picked, setPicked] = useState(null);
  const revealed = picked !== null;

  return (
    <View style={{ gap: 9 }}>
      <View style={s.qCard}>
        <Text style={s.qLabel}>TODAY'S CODE QUESTION</Text>
        <Text style={s.qText}>{q.question}</Text>
      </View>

      {q.choices.map((ch, i) => {
        const right = i === q.correct;
        const chosen = picked === i;
        let border = C.line; let bg = C.card; let tint = C.text2;
        if (revealed && right) { border = C.ok; bg = C.okDim; tint = C.ok; }
        else if (revealed && chosen) { border = C.hi; bg = C.hiDim; tint = C.hi; }
        return (
          <TouchableOpacity
            key={i}
            disabled={revealed}
            onPress={() => setPicked(i)}
            style={[s.choice, { borderColor: border, backgroundColor: bg }]}
            activeOpacity={0.85}
            accessibilityRole="button">
            <Text style={[s.choiceT, { color: tint }]}>{ch}</Text>
            {revealed && right && <Ionicons name="checkmark-circle" size={17} color={C.ok} />}
          </TouchableOpacity>
        );
      })}

      {revealed && (
        <View style={s.why}>
          <Text style={s.whyRef}>{q.ref}</Text>
          <Text style={s.whyT}>{q.explanation}</Text>
          <Text style={s.whyNote}>
            Every answer in the app comes with the reason and the section it rests on.
          </Text>
        </View>
      )}
    </View>
  );
}

/**
 * The compliance record, and the first thing anybody sees.
 *
 * SAME SUBSTANCE, DIFFERENT SHAPE. The old version opened with six bullets of
 * obligations and three checkboxes — accurate, and it read as a terms-of-service
 * wall, which is what makes a first screen a bounce.
 *
 * This says the same things as three short statements of what the app IS and
 * ISN'T. That framing is not a softening: "we will not tell you a breaker size
 * from a paragraph" is a harder commitment than "verify all calculations", and
 * it is the product's actual argument. Leading with the limits is the brand.
 */
function LegalStep({ value, onChange }) {
  const [boxes, setBoxes] = useState({ terms: false, privacy: false, disc: false });
  const toggle = (k) => {
    const next = { ...boxes, [k]: !boxes[k] };
    setBoxes(next);
    onChange(next.terms && next.privacy && next.disc);
  };

  const limits = [
    {
      icon: 'close-circle',
      title: 'It is not your inspector',
      body: 'Nothing here replaces the code your jurisdiction adopted, your approved plans, '
        + 'permits, inspections, or licensed supervision.',
    },
    {
      icon: 'calculator',
      title: 'It does the arithmetic. You do the judgement',
      body: 'Check every calculation against the job in front of you, the manufacturer '
        + 'instructions, and the edition your AHJ enforces.',
    },
    {
      icon: 'shield-checkmark',
      title: 'It never assumes a circuit is dead',
      body: 'De-energize, lock out and verify absence of voltage yourself. The app will '
        + 'not tell you something is safe to touch.',
    },
  ];

  const rows = [
    { key: 'disc', label: 'I understand this is a reference tool and does not replace licensed electrical supervision', url: null },
    { key: 'terms', label: 'I agree to the Terms of Service', url: 'https://sparkconnect.pro/terms' },
    { key: 'privacy', label: 'I agree to the Privacy Policy', url: 'https://sparkconnect.pro/privacy' },
  ];

  return (
    <View style={{ gap: 9 }}>
      {limits.map((l) => (
        <View key={l.title} style={s.limit}>
          <Ionicons name={l.icon} size={19} color={C.hi} style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Text style={s.limitT}>{l.title}</Text>
            <Text style={s.limitB}>{l.body}</Text>
          </View>
        </View>
      ))}

      <View style={{ height: 6 }} />

      {rows.map((r) => (
        <TouchableOpacity
          key={r.key}
          onPress={() => toggle(r.key)}
          style={s.checkRow}
          activeOpacity={0.85}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: boxes[r.key] }}>
          <View style={[s.box, boxes[r.key] && s.boxOn]}>
            {boxes[r.key] && <Ionicons name="checkmark" size={13} color="#fff" />}
          </View>
          <Text style={s.checkT}>
            {r.label}
            {!!r.url && (
              <Text style={{ color: C.blue2 }} onPress={() => Linking.openURL(r.url).catch(() => {})}> · read</Text>
            )}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function NotifyStep() {
  return (
    <View style={s.qCard}>
      <Text style={s.qLabel}>WHAT YOU WILL GET</Text>
      <Text style={{ fontSize: 15, color: C.text, fontWeight: '650', marginBottom: 8, letterSpacing: -0.02 }}>
        One question, once a day.
      </Text>
      <Text style={{ fontSize: 13.5, color: C.text2, lineHeight: 20 }}>
        The same question you just answered, every morning, with the reasoning
        and the section it comes from. Nothing else is ever sent — no offers, no
        streak nagging, no "we miss you".
      </Text>
      <Text style={{ fontSize: 12, color: C.muted, marginTop: 12 }}>
        You can turn it off in Settings at any time.
      </Text>
    </View>
  );
}

function TrialStep({ roleId }) {
  const offer = offerFor(roleId);
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ fontSize: 15, color: C.text2, lineHeight: 22 }}>{offer.sub}</Text>

      <View style={s.qCard}>
        {offer.benefits.map((b) => (
          <View key={b} style={{ flexDirection: 'row', gap: 11, alignItems: 'flex-start', marginBottom: 11 }}>
            <Ionicons name="checkmark-circle" size={17} color={C.ok} style={{ marginTop: 1 }} />
            <Text style={{ flex: 1, fontSize: 14, color: C.text, lineHeight: 20 }}>{b}</Text>
          </View>
        ))}
      </View>

      <View style={s.freeNote}>
        <Ionicons name="information-circle-outline" size={16} color={C.muted} style={{ marginTop: 1 }} />
        <Text style={{ flex: 1, fontSize: 13, color: C.text2, lineHeight: 19 }}>{offer.freeNote}</Text>
      </View>

      <Text style={{ fontSize: 11.5, color: C.muted, lineHeight: 17, textAlign: 'center' }}>{offer.terms}</Text>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  topbar: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 6 },
  rail: { flex: 1, flexDirection: 'row', gap: 4 },
  railSeg: { flex: 1, height: 3, borderRadius: 2, backgroundColor: C.line },
  railSegOn: { backgroundColor: C.blue },
  skip: { fontSize: 14, color: C.muted, fontWeight: '600' },

  scroll: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 24 },
  stepNo: { fontSize: 11.5, color: C.muted, letterSpacing: 1, marginBottom: 12, fontVariant: ['tabular-nums'] },
  h1: { fontSize: 27, fontWeight: '800', color: C.text, letterSpacing: -0.7, lineHeight: 33, marginBottom: 9 },
  sub: { fontSize: 14.5, color: C.text2, lineHeight: 21, marginBottom: 22 },

  opt: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.card, borderWidth: 1.5, borderColor: C.line,
    borderRadius: 14, padding: 15, minHeight: 62,
  },
  optOn: { borderColor: C.blue, backgroundColor: C.blueDim },
  optT: { fontSize: 15.5, fontWeight: '700', color: C.text2, letterSpacing: -0.2 },
  optS: { fontSize: 12.5, color: C.muted, marginTop: 2 },

  radio: { width: 21, height: 21, borderRadius: 11, borderWidth: 2, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: C.blue },
  radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.blue },

  payoff: {
    flexDirection: 'row', gap: 9, alignItems: 'flex-start',
    backgroundColor: C.okDim, borderWidth: 1, borderColor: 'rgba(61,190,122,0.28)',
    borderRadius: 12, padding: 13, marginTop: 4,
  },
  payoffT: { flex: 1, fontSize: 13.5, color: C.text, lineHeight: 19 },

  qCard: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 16 },
  qLabel: { fontSize: 10, letterSpacing: 1.4, color: C.muted, fontWeight: '700', marginBottom: 9 },
  qText: { fontSize: 15.5, color: C.text, fontWeight: '600', lineHeight: 22 },

  choice: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderRadius: 12, padding: 14, minHeight: 52,
  },
  choiceT: { flex: 1, fontSize: 14, fontWeight: '600', lineHeight: 19 },

  why: { backgroundColor: C.raised, borderRadius: 14, padding: 15, borderLeftWidth: 3, borderLeftColor: C.ok, marginTop: 4 },
  whyRef: { fontSize: 12, fontWeight: '800', color: C.ok, marginBottom: 6, letterSpacing: 0.3 },
  whyT: { fontSize: 13.5, color: C.text, lineHeight: 20 },
  whyNote: { fontSize: 12, color: C.muted, lineHeight: 18, marginTop: 11 },

  checkRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 6, minHeight: 44 },
  box: { width: 23, height: 23, borderRadius: 7, borderWidth: 2, borderColor: C.line, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  boxOn: { backgroundColor: C.blue, borderColor: C.blue },
  checkT: { flex: 1, fontSize: 13.5, color: C.text2, lineHeight: 20 },

  freeNote: { flexDirection: 'row', gap: 9, alignItems: 'flex-start', backgroundColor: C.raised, borderRadius: 12, padding: 13 },

  limit: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    backgroundColor: C.card, borderWidth: 1, borderColor: C.line,
    borderRadius: 14, padding: 15,
  },
  limitT: { fontSize: 14.5, fontWeight: '750', color: C.text, letterSpacing: -0.2, marginBottom: 4 },
  limitB: { fontSize: 13, color: C.text2, lineHeight: 19 },

  footer: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, gap: 4, borderTopWidth: 1, borderTopColor: C.lineSoft },
  cta: { backgroundColor: C.blue, borderRadius: 14, paddingVertical: 16, alignItems: 'center', minHeight: 54, justifyContent: 'center' },
  ctaOff: { backgroundColor: C.line },
  ctaT: { fontSize: 16, fontWeight: '750', color: '#fff', letterSpacing: -0.2 },
  ctaTOff: { color: C.muted },
  ghost: { paddingVertical: 13, alignItems: 'center', minHeight: 46, justifyContent: 'center' },
  ghostT: { fontSize: 14.5, color: C.text2, fontWeight: '600' },
});
