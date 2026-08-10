// ─── CONTRACTOR CONNECT ──────────────────────────────────────────────────────
// The screen for 1,400 lines of tested infrastructure that, until now, no user
// could see.
//
// THIS FILE RENDERS. It does not decide. Pathways, validation, moderation, the
// status machine and every user-facing sentence about what has or has not been
// sent come from src/core/connect/ — because the property that matters here is
// that a screen cannot talk its way past the state machine. If a button could
// write "Sent" onto a local draft, everything the core module does would be
// decoration.
//
// THE HONESTY PROBLEM, CONCRETELY. There is no marketplace backend. Matching is
// a person reading an inbox. That is a fine thing to ship and a terrible thing
// to hide, so it is said on the entry screen, said again before sending, and
// the send result is worded to exactly what the OS told us — "sent using the
// app you chose", never "we received it". The words "no backend", "local only"
// and "not implemented" appear nowhere a user can read them.
//
// Verify a Licence is the one section here that is a finished product today: it
// hands the user to DBPR's own live record. It stays exactly as it is.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ScrollView, Share, Linking, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  Pathway, PATHWAYS, pathwayById, ContactMethod, CONTACT_METHOD_LABEL,
  SubmissionStatus, STATUS_COPY, DeliveryEvidence,
  submissionDraft, validateSubmission, transition, moderationFlags, FLAG_NOTE,
  subjectFor, bodyFor, handoffPayload, mailtoUrl, wasHandedOff,
  BETA_DISCLOSURE, SUPPORT_EMAIL,
} from '../core/connect/submissions';
import { createSubmissionStore } from '../core/connect/store';
import { CONNECT_DISCLAIMER, BETA_LABEL } from '../core/connect';
import { marketplaceReady, PRELAUNCH, COMPLIANCE_NOTE } from '../core/connect/operations';
import { BACKEND } from '../core/connect/backend';
import {
  normalizeLicenseNumber, looksLikeLicenseNumber, dbprLicenseAdapter, VERIFY_HELP,
} from '../core/connect/adapters/florida';

const View_ = Object.freeze({
  HOME: 'HOME', FORM: 'FORM', REVIEW: 'REVIEW', VERIFY: 'VERIFY', SAVED: 'SAVED',
});

const TONE = Object.freeze({
  neutral: 'textSec', ready: 'blue', warn: 'amber', good: 'green', bad: 'red',
});

export default function ContractorConnectScreen({ C, setTab }) {
  const store = useMemo(() => createSubmissionStore(AsyncStorage), []);

  const [view, setView] = useState(View_.HOME);
  const [rows, setRows] = useState([]);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const [licence, setLicence] = useState('');

  useEffect(() => { (async () => setRows(await store.list()))(); }, [store]);

  const persist = useCallback(async (sub) => {
    setDraft(sub);
    setRows(await store.save(sub));
  }, [store]);

  // ── Form plumbing ─────────────────────────────────────────────────────────

  const startPathway = (id) => {
    setError(null);
    setDraft(submissionDraft({ pathway: id }));
    setView(View_.FORM);
  };

  const setAnswer = (fieldId, text) => setDraft((d) => (d ? submissionDraft({
    ...d, answers: { ...d.answers, [fieldId]: text },
  }) : d));

  const setContact = (key, value) => setDraft((d) => (d ? submissionDraft({
    ...d, contact: { ...d.contact, [key]: value },
  }) : d));

  /**
   * Straight to review. There is deliberately no confirmation screen between
   * the form and the send — a "Saved!" screen before anything has been sent is
   * the exact failure this rebuild exists to remove.
   */
  const goToReview = async () => {
    const v = validateSubmission(draft);
    if (!v.ok) { setError(v.reason); return; }
    const r = transition(draft, SubmissionStatus.READY_TO_SEND);
    if (!r.ok) { setError(r.error); return; }
    setError(null);
    await persist(r.sub);
    setView(View_.REVIEW);
  };

  /**
   * The handoff.
   *
   * HANDOFF_STARTED is written BEFORE the share sheet opens, so a submission
   * whose share sheet is killed by the OS is left in a state that says "not
   * sent yet" rather than one that says nothing happened. HANDED_OFF is only
   * reachable with `OS_REPORTED_SHARED`, and the core module refuses it
   * otherwise — this screen cannot grant itself that claim.
   */
  const send = async () => {
    if (!draft || sending) return;
    setSending(true);
    setError(null);
    try {
      const started = transition(draft, SubmissionStatus.HANDOFF_STARTED);
      if (!started.ok) { setError(started.error); setSending(false); return; }
      await persist(started.sub);

      const payload = handoffPayload(started.sub);
      const res = await Share.share({ message: payload.body, title: payload.subject });

      if (res?.action === Share.sharedAction) {
        const done = transition(started.sub, SubmissionStatus.HANDED_OFF, {
          evidence: DeliveryEvidence.OS_REPORTED_SHARED,
        });
        await persist(done.ok ? done.sub : started.sub);
      } else {
        // Dismissed. It stays unsent, and says so.
        const failed = transition(started.sub, SubmissionStatus.SEND_FAILED);
        await persist(failed.ok ? failed.sub : started.sub);
      }
    } catch (e) {
      const failed = transition(draft, SubmissionStatus.HANDOFF_STARTED);
      const stopped = failed.ok ? transition(failed.sub, SubmissionStatus.SEND_FAILED) : null;
      await persist(stopped?.ok ? stopped.sub : draft);
    } finally {
      setSending(false);
    }
  };

  /**
   * The email fallback.
   *
   * Opening a composer proves a composer opened. It does not prove an email was
   * sent, so this stops at HANDOFF_STARTED — whose copy is "Not sent yet" —
   * rather than claiming a delivery nothing observed.
   */
  const sendByEmail = async () => {
    if (!draft) return;
    const started = transition(draft, SubmissionStatus.HANDOFF_STARTED, {
      evidence: DeliveryEvidence.COMPOSER_OPENED,
    });
    if (!started.ok) { setError(started.error); return; }
    await persist(started.sub);
    try {
      await Linking.openURL(mailtoUrl(handoffPayload(started.sub)));
    } catch {
      const failed = transition(started.sub, SubmissionStatus.SEND_FAILED);
      await persist(failed.ok ? failed.sub : started.sub);
    }
  };

  const openDbpr = async (raw) => {
    const n = normalizeLicenseNumber(raw);
    if (!n) return;
    const url = dbprLicenseAdapter().deepLink(n);
    try { await Linking.openURL(url); } catch {
      Alert.alert('Could not open DBPR', 'Search for the number at myfloridalicense.com.');
    }
  };

  // ── Pieces ────────────────────────────────────────────────────────────────

  const Header = ({ title, onBack, badge }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={C.text} />
        </TouchableOpacity>
      ) : null}
      <Text style={{ flex: 1, fontSize: 20, fontWeight: '800', color: C.text }}>{title}</Text>
      {badge ? (
        <View style={{ backgroundColor: C.amberBg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ fontSize: 10, fontWeight: '900', color: C.amber, letterSpacing: 0.7 }}>
            {badge.toUpperCase()}
          </Text>
        </View>
      ) : null}
    </View>
  );

  const Card = ({ children, style }) => (
    <View style={{
      backgroundColor: C.surface ?? C.cardBg, borderRadius: 14, borderWidth: 1,
      borderColor: C.border, padding: 14, marginBottom: 10, ...style,
    }}>{children}</View>
  );

  const Primary = ({ label, onPress, disabled, icon }) => (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.88}
      accessibilityRole="button" accessibilityState={{ disabled: !!disabled }}
      style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        backgroundColor: C.blue, opacity: disabled ? 0.5 : 1,
        borderRadius: 12, paddingVertical: 15, marginTop: 14,
      }}>
      {icon ? <Ionicons name={icon} size={17} color="#fff" /> : null}
      <Text style={{ fontSize: 14.5, fontWeight: '800', color: '#fff' }}>{label}</Text>
    </TouchableOpacity>
  );

  const Ghost = ({ label, onPress }) => (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} accessibilityRole="button"
      style={{ borderWidth: 1.5, borderColor: C.border, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 9 }}>
      <Text style={{ fontSize: 13.5, fontWeight: '700', color: C.textSec }}>{label}</Text>
    </TouchableOpacity>
  );

  const StatusBanner = ({ sub }) => {
    const copy = STATUS_COPY[sub.status];
    const tone = C[TONE[copy.tone]] ?? C.textSec;
    return (
      <View style={{
        backgroundColor: C.cardBg, borderRadius: 12, padding: 13, marginBottom: 12,
        borderLeftWidth: 3, borderLeftColor: tone, borderWidth: 1, borderColor: C.border,
      }}>
        <Text style={{ fontSize: 14, fontWeight: '800', color: tone }}>{copy.headline}</Text>
        <Text style={{ fontSize: 12, color: C.textSec, lineHeight: 18, marginTop: 4 }}>{copy.detail}</Text>
      </View>
    );
  };

  const Field = ({ f, value }) => (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: C.textSec, marginBottom: 5 }}>
        {f.label}{f.required ? '' : '  (optional)'}
      </Text>
      <TextInput
        value={value}
        onChangeText={(t) => setAnswer(f.id, t)}
        placeholder={f.placeholder}
        placeholderTextColor={C.placeholder}
        multiline={f.multiline}
        maxLength={f.maxLength}
        accessibilityLabel={f.label}
        style={{
          backgroundColor: C.inputBg, borderRadius: 10, borderWidth: 1, borderColor: C.border,
          paddingHorizontal: 12, paddingVertical: 11, color: C.inputText, fontSize: 14,
          minHeight: f.multiline ? 92 : undefined, textAlignVertical: f.multiline ? 'top' : 'center',
        }}
      />
      {f.help ? <Text style={{ fontSize: 10.5, color: C.textTert, marginTop: 4, lineHeight: 15 }}>{f.help}</Text> : null}
    </View>
  );

  const BetaCard = () => (
    <Card style={{ backgroundColor: C.amberBg, borderColor: C.amber }}>
      <Text style={{ fontSize: 13, fontWeight: '800', color: C.amber }}>{BETA_DISCLOSURE.title}</Text>
      <Text style={{ fontSize: 12, color: C.text, lineHeight: 18, marginTop: 5 }}>{BETA_DISCLOSURE.body}</Text>
    </Card>
  );

  const Page = ({ children }) => (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  );

  // ── HOME ──────────────────────────────────────────────────────────────────

  if (view === View_.HOME) {
    const unsent = rows.filter((r) => !wasHandedOff(r)).length;
    const ready = marketplaceReady(BACKEND.readiness);
    return (
      <Page>
        <Header title="Contractor Connect" badge={BETA_LABEL} onBack={setTab ? () => setTab('home') : null} />
        <Text style={{ fontSize: 15.5, fontWeight: '700', color: C.text, marginBottom: 6 }}>
          Turn opportunities into legitimate connections.
        </Text>
        <Text style={{ fontSize: 12.5, color: C.textSec, lineHeight: 19, marginBottom: 18 }}>
          Find licensed contractors, submit opportunities, connect with qualifying professionals,
          and verify licences. {BETA_DISCLOSURE.short}
        </Text>

        {/* The four funnels open when the marketplace can complete a transaction
            on its own — see operations.READINESS. They are closed here rather
            than by a boolean in this component, because "is the backend real"
            is not a question a screen should be trusted to answer. */}
        {!ready.ready ? (
          <Card style={{ borderColor: C.blue }}>
            <Text style={{ fontSize: 13.5, fontWeight: '800', color: C.text }}>{PRELAUNCH.headline}</Text>
            <Text style={{ fontSize: 12, color: C.textSec, lineHeight: 18, marginTop: 5 }}>{PRELAUNCH.body}</Text>
          </Card>
        ) : PATHWAYS.map((p) => (
          <TouchableOpacity key={p.id} onPress={() => startPathway(p.id)} activeOpacity={0.85}
            accessibilityRole="button" accessibilityLabel={p.title}>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: C.blueSub, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={p.icon} size={18} color={C.blue} />
                </View>
                <Text style={{ flex: 1, fontSize: 14.5, fontWeight: '800', color: C.text, letterSpacing: 0.3 }}>
                  {p.title.toUpperCase()}
                </Text>
                <Ionicons name="chevron-forward" size={17} color={C.textTert} />
              </View>
              <Text style={{ fontSize: 12, color: C.textSec, lineHeight: 18 }}>{p.blurb}</Text>
            </Card>
          </TouchableOpacity>
        ))}

        <Text style={{ fontSize: 10.5, fontWeight: '800', color: C.textSec, letterSpacing: 0.7, marginTop: 14, marginBottom: 8 }}>
          TOOLS
        </Text>
        {[
          { id: 'verify', icon: 'checkmark-circle', label: 'Verify a licence', sub: 'Opens the issuing board’s own record', go: () => setView(View_.VERIFY) },
          { id: 'permit', icon: 'document-text', label: 'Permit Assistant', sub: 'Work out what your jurisdiction requires', go: () => setTab && setTab('permits') },
          { id: 'saved', icon: 'bookmark', label: 'Saved', sub: unsent ? `${unsent} not sent yet` : 'Your submissions', go: () => setView(View_.SAVED) },
        ].map((t) => (
          <TouchableOpacity key={t.id} onPress={t.go} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={t.label}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: C.cardBg, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 13, marginBottom: 8 }}>
              <Ionicons name={t.icon} size={19} color={C.blue} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13.5, fontWeight: '700', color: C.text }}>{t.label}</Text>
                <Text style={{ fontSize: 11, color: C.textTert, marginTop: 1 }}>{t.sub}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={C.textTert} />
            </View>
          </TouchableOpacity>
        ))}

        <View style={{ height: 8 }} />
        <BetaCard />
        <Text style={{ fontSize: 10.5, color: C.textTert, lineHeight: 16, marginTop: 6 }}>
          {CONNECT_DISCLAIMER}
        </Text>
      </Page>
    );
  }

  // ── FORM ──────────────────────────────────────────────────────────────────

  if (view === View_.FORM && draft) {
    const path = pathwayById(draft.pathway);
    return (
      <Page>
        <Header title={path.title} badge={BETA_LABEL} onBack={() => { setError(null); setView(View_.HOME); }} />
        <Text style={{ fontSize: 12.5, color: C.textSec, lineHeight: 19, marginBottom: 16 }}>{path.blurb}</Text>

        <Card>
          {path.fields.map((f) => <Field key={f.id} f={f} value={draft.answers[f.id] ?? ''} />)}
        </Card>

        <Text style={{ fontSize: 10.5, fontWeight: '800', color: C.textSec, letterSpacing: 0.7, marginTop: 6, marginBottom: 8 }}>
          HOW WE REACH YOU
        </Text>
        <Card>
          {[
            { k: 'name', label: 'Name', placeholder: 'Who should we ask for?', keyboard: 'default' },
            { k: 'email', label: 'Email', placeholder: 'you@example.com', keyboard: 'email-address' },
            { k: 'phone', label: 'Phone', placeholder: '(813) 555-0148', keyboard: 'phone-pad' },
          ].map((f) => (
            <View key={f.k} style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: C.textSec, marginBottom: 5 }}>{f.label}</Text>
              <TextInput
                value={draft.contact[f.k]}
                onChangeText={(t) => setContact(f.k, t)}
                placeholder={f.placeholder}
                placeholderTextColor={C.placeholder}
                keyboardType={f.keyboard}
                autoCapitalize={f.k === 'email' ? 'none' : 'words'}
                accessibilityLabel={f.label}
                style={{ backgroundColor: C.inputBg, borderRadius: 10, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 11, color: C.inputText, fontSize: 14 }}
              />
            </View>
          ))}
          <Text style={{ fontSize: 12, fontWeight: '700', color: C.textSec, marginBottom: 7 }}>Best way to reach you</Text>
          <View style={{ flexDirection: 'row', gap: 7 }}>
            {Object.keys(ContactMethod).map((m) => {
              const on = draft.contact.preferred === m;
              return (
                <TouchableOpacity key={m} onPress={() => setContact('preferred', m)}
                  accessibilityRole="radio" accessibilityState={{ selected: on }}
                  accessibilityLabel={CONTACT_METHOD_LABEL[m]}
                  style={{ flex: 1, paddingVertical: 11, borderRadius: 9, alignItems: 'center', backgroundColor: on ? C.blueSub : C.inputBg, borderWidth: 1.5, borderColor: on ? C.blue : C.border }}>
                  <Text style={{ fontSize: 12.5, fontWeight: '700', color: on ? C.blue : C.textSec }}>
                    {CONTACT_METHOD_LABEL[m]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>

        {error ? (
          <Text style={{ fontSize: 12, color: C.red ?? C.amber, marginTop: 6, lineHeight: 18 }}>{error}</Text>
        ) : null}

        <Primary label="Send to Contractor Connect" icon="paper-plane" onPress={goToReview} />
        <Text style={{ fontSize: 10.5, color: C.textTert, textAlign: 'center', marginTop: 8, lineHeight: 15 }}>
          You will see exactly what gets sent before anything leaves your phone.
        </Text>
      </Page>
    );
  }

  // ── REVIEW ────────────────────────────────────────────────────────────────

  if (view === View_.REVIEW && draft) {
    const path = pathwayById(draft.pathway);
    const flags = moderationFlags(draft);
    const sent = wasHandedOff(draft);
    return (
      <Page>
        <Header title={sent ? 'Sent for review' : 'Before you send'}
          onBack={() => setView(sent ? View_.HOME : View_.FORM)} />

        {draft.status !== SubmissionStatus.READY_TO_SEND ? <StatusBanner sub={draft} /> : null}

        <Card>
          <Text style={{ fontSize: 10, fontWeight: '900', color: C.blue, letterSpacing: 0.7 }}>GOES TO</Text>
          <Text style={{ fontSize: 13.5, fontWeight: '700', color: C.text, marginTop: 4 }}>{SUPPORT_EMAIL}</Text>
          <Text style={{ fontSize: 11.5, color: C.textTert, marginTop: 6, lineHeight: 17 }}>{subjectFor(draft)}</Text>
        </Card>

        <Card>
          {path.fields.map((f) => (draft.answers[f.id] ? (
            <View key={f.id} style={{ marginBottom: 9 }}>
              <Text style={{ fontSize: 10.5, fontWeight: '700', color: C.textTert, letterSpacing: 0.4 }}>
                {f.label.toUpperCase()}
              </Text>
              <Text style={{ fontSize: 13, color: C.text, marginTop: 2, lineHeight: 19 }}>{draft.answers[f.id]}</Text>
            </View>
          ) : null))}
          <View style={{ height: 1, backgroundColor: C.border, marginVertical: 8 }} />
          <Text style={{ fontSize: 10.5, fontWeight: '700', color: C.textTert, letterSpacing: 0.4 }}>CONTACT</Text>
          <Text style={{ fontSize: 13, color: C.text, marginTop: 2, lineHeight: 19 }}>
            {draft.contact.name} · {draft.contact.email}
            {draft.contact.phone ? ` · ${draft.contact.phone}` : ''}
          </Text>
          <Text style={{ fontSize: 11.5, color: C.textTert, marginTop: 2 }}>
            Prefers {CONTACT_METHOD_LABEL[draft.contact.preferred].toLowerCase()}
          </Text>
        </Card>

        {flags.length ? (
          <Card style={{ borderColor: C.amber }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: C.amber, letterSpacing: 0.5, marginBottom: 6 }}>
              WORTH KNOWING
            </Text>
            {flags.map((f) => (
              <Text key={f} style={{ fontSize: 11.5, color: C.textSec, lineHeight: 17, marginBottom: 3 }}>
                • {FLAG_NOTE[f]}
              </Text>
            ))}
          </Card>
        ) : null}

        <BetaCard />

        {error ? <Text style={{ fontSize: 12, color: C.red ?? C.amber, lineHeight: 18 }}>{error}</Text> : null}

        <Primary
          label={sending ? 'Opening…' : STATUS_COPY[draft.status].cta}
          icon="paper-plane" disabled={sending} onPress={send}
        />
        <Ghost label="Email it instead" onPress={sendByEmail} />
        {sent ? <Ghost label="Done" onPress={() => setView(View_.HOME)} /> : null}
      </Page>
    );
  }

  // ── VERIFY ────────────────────────────────────────────────────────────────

  if (view === View_.VERIFY) {
    const ready = looksLikeLicenseNumber(licence);
    return (
      <Page>
        <Header title="Verify a Florida licence" onBack={() => setView(View_.HOME)} />
        <Text style={{ fontSize: 12.5, color: C.textSec, lineHeight: 19, marginBottom: 16 }}>{VERIFY_HELP.body}</Text>

        <Card>
          <Text style={{ fontSize: 12, fontWeight: '700', color: C.textSec, marginBottom: 6 }}>Licence number</Text>
          <TextInput
            value={licence}
            onChangeText={(t) => setLicence(t.toUpperCase())}
            placeholder="EC13001234"
            placeholderTextColor={C.placeholder}
            autoCapitalize="characters"
            autoCorrect={false}
            accessibilityLabel="Licence number"
            style={{ backgroundColor: C.inputBg, borderRadius: 10, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 12, color: C.inputText, fontSize: 16, fontWeight: '700', letterSpacing: 1 }}
          />
          <Primary label="Open Official DBPR Record" icon="open-outline"
            disabled={!ready} onPress={() => openDbpr(licence)} />
          {/* The single most important sentence on this screen. */}
          <Text style={{ fontSize: 11, color: C.textTert, marginTop: 10, lineHeight: 16 }}>
            Current status is provided by Florida DBPR, not Contractor Connect.
          </Text>
        </Card>

        <Card>
          <Text style={{ fontSize: 12, fontWeight: '800', color: C.text, marginBottom: 7 }}>What to look for</Text>
          {VERIFY_HELP.whatToLookFor.map((w) => (
            <Text key={w} style={{ fontSize: 12, color: C.textSec, lineHeight: 18, marginBottom: 3 }}>• {w}</Text>
          ))}
          <Text style={{ fontSize: 11, color: C.textTert, marginTop: 8, lineHeight: 16 }}>{VERIFY_HELP.caution}</Text>
        </Card>
      </Page>
    );
  }

  // ── SAVED ─────────────────────────────────────────────────────────────────

  return (
    <Page>
      <Header title="Saved" onBack={() => setView(View_.HOME)} />
      {rows.length === 0 ? (
        <Text style={{ fontSize: 12.5, color: C.textTert, lineHeight: 19 }}>
          Nothing here yet. Anything you start is kept on this device until you send it.
        </Text>
      ) : rows.map((r) => {
        const path = pathwayById(r.pathway);
        const copy = STATUS_COPY[r.status];
        const tone = C[TONE[copy.tone]] ?? C.textSec;
        return (
          <TouchableOpacity key={r.id} activeOpacity={0.85} accessibilityRole="button"
            accessibilityLabel={`${path?.title ?? 'Submission'} — ${copy.label}`}
            onPress={() => {
              setDraft(r);
              setError(null);
              setView(r.status === SubmissionStatus.DRAFT ? View_.FORM : View_.REVIEW);
            }}>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '700', color: C.text }}>
                  {path?.title ?? 'Submission'}
                </Text>
                <Text style={{ fontSize: 10.5, fontWeight: '800', color: tone, letterSpacing: 0.4 }}>
                  {copy.label.toUpperCase()}
                </Text>
              </View>
              <Text style={{ fontSize: 11.5, color: C.textTert, marginTop: 3 }} numberOfLines={1}>
                {r.answers.location || 'No location yet'} · {new Date(r.updatedAt).toLocaleDateString()}
              </Text>
              <TouchableOpacity onPress={async () => setRows(await store.remove(r.id))}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button" accessibilityLabel={`Delete ${path?.title ?? 'submission'}`}
                style={{ position: 'absolute', right: 0, bottom: 0 }}>
                <Text style={{ fontSize: 11.5, color: C.textTert }}>Delete</Text>
              </TouchableOpacity>
            </Card>
          </TouchableOpacity>
        );
      })}
    </Page>
  );
}
