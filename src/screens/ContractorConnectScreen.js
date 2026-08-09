// ─── CONTRACTOR CONNECT ──────────────────────────────────────────────────────
// The marketplace screen. It renders src/core/connect/marketplace and adds
// nothing to it: every rule — who can be verified, what gets flagged, which
// state can follow which — lives in the core modules and is tested there. If
// this file ever starts deciding eligibility or wording legal claims of its
// own, that is a bug.
//
// The four intents, one funnel each, a verify deep link, a saved pile, and
// (dev builds) the war room. Records persist locally through the marketplace
// store; the screen says so out loud, because a user who thinks their
// submission was published to a live network deserves to know it is being
// brokered manually while the network is built.

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Share, Linking, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  Intent, INTENT_CARDS, UTILITY_ROW, UNLICENSED_SUBMITTER_NOTICE,
  QUALIFIER_NEED_NOTICE, CAN_QUALIFY_NOTICE, HAVE_JOB_QUESTIONS, FieldKind,
  PROJECT_TYPES, VALUE_RANGES, SUBMITTER_ROLES,
} from '../core/connect/marketplace/intents';
import { createOpportunity, submitterNotice } from '../core/connect/marketplace/opportunity';
import {
  createContractorProfile, createQualifierProfile, createBusinessNeed,
} from '../core/connect/marketplace/profiles';
import { verificationBadge } from '../core/connect/marketplace/verification';
import { createMarketplaceStore, Role } from '../core/connect/marketplace/store';
import { warRoom } from '../core/connect/marketplace/admin';
import { MARKETPLACE_DISCLAIMER, FLORIDA_NOTES, LEGAL_REVIEW } from '../core/connect/marketplace/legal';
import { MATCHING_POLICY } from '../core/connect/marketplace/matching';
import { Trade, TRADE_LABEL } from '../core/connect/index';
import { createRegistry } from '../core/connect/sources';
import {
  registerFlorida, dbprLicenseAdapter, normalizeLicenseNumber, looksLikeLicenseNumber, VERIFY_HELP,
} from '../core/connect/adapters/florida';
import { isEnabled } from '../featureFlags';
import { analytics } from '../analytics';

const KEY_USER = '@sc_connect_user_v1';
const KEY_SAVED = '@sc_connect_saved_v1';

const store = createMarketplaceStore(AsyncStorage);
const registry = createRegistry();
registerFlorida(registry);
const dbpr = dbprLicenseAdapter();

const OPS_EMAIL = 'support@sparkconnect.pro';

// ─── Small shared pieces ─────────────────────────────────────────────────────

const Card = ({ C, children, style }) => (
  <View style={[{ backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 12 }, style]}>
    {children}
  </View>
);

const H = ({ C, children }) => (
  <Text style={{ color: C.text, fontSize: 15, fontWeight: '800', marginBottom: 6 }}>{children}</Text>
);

const P = ({ C, children, style }) => (
  <Text style={[{ color: C.textSec, fontSize: 12.5, lineHeight: 18 }, style]}>{children}</Text>
);

const Btn = ({ C, label, onPress, kind = 'primary', icon, disabled }) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={disabled}
    activeOpacity={0.85}
    style={{
      backgroundColor: disabled ? C.border : kind === 'primary' ? C.blue : C.blueSub,
      borderRadius: 12, paddingVertical: 13, alignItems: 'center', flexDirection: 'row',
      justifyContent: 'center', gap: 6, marginTop: 10,
    }}>
    {icon ? <Ionicons name={icon} size={16} color={kind === 'primary' ? '#fff' : C.blue} /> : null}
    <Text style={{ color: kind === 'primary' ? '#fff' : C.blue, fontSize: 14, fontWeight: '800' }}>{label}</Text>
  </TouchableOpacity>
);

const Notice = ({ C, tone = 'info', children }) => {
  const bg = tone === 'warn' ? C.warningBg : tone === 'ok' ? C.successBg : C.blueSub;
  const fg = tone === 'warn' ? C.warning : tone === 'ok' ? C.success : C.blue;
  return (
    <View style={{ backgroundColor: bg, borderRadius: 10, padding: 12, marginTop: 10 }}>
      <Text style={{ color: fg, fontSize: 12, lineHeight: 17, fontWeight: '600' }}>{children}</Text>
    </View>
  );
};

const Chip = ({ C, label, active, onPress }) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.8}
    style={{
      paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, marginRight: 8, marginBottom: 8,
      backgroundColor: active ? C.blue : C.inputBg, borderWidth: 1, borderColor: active ? C.blue : C.inputBorder,
    }}>
    <Text style={{ color: active ? '#fff' : C.textSec, fontSize: 12.5, fontWeight: '700' }}>{label}</Text>
  </TouchableOpacity>
);

const Input = ({ C, value, onChangeText, placeholder, multiline }) => (
  <TextInput
    value={value ?? ''}
    onChangeText={onChangeText}
    placeholder={placeholder}
    placeholderTextColor={C.placeholder}
    multiline={!!multiline}
    style={{
      backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.inputBorder, borderRadius: 10,
      color: C.inputText, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13.5,
      minHeight: multiline ? 84 : undefined, textAlignVertical: multiline ? 'top' : 'auto', marginTop: 6,
    }}
  />
);

const YesNo = ({ C, value, onChange, allowUnknown }) => (
  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
    <Chip C={C} label="Yes" active={value === 'yes'} onPress={() => onChange('yes')} />
    <Chip C={C} label="No" active={value === 'no'} onPress={() => onChange('no')} />
    {allowUnknown ? <Chip C={C} label="Not sure" active={value === 'unsure'} onPress={() => onChange('unsure')} /> : null}
  </View>
);

// ─── The screen ──────────────────────────────────────────────────────────────

export default function ContractorConnectScreen({ C, setTab }) {
  const [view, setView] = useState('home');
  const [userId, setUserId] = useState(null);
  const [saved, setSaved] = useState([]);
  const [mine, setMine] = useState(null);

  useEffect(() => {
    analytics.connectOpened({ state: 'FL' });
    AsyncStorage.getItem(KEY_USER).then((v) => {
      if (v) { setUserId(v); return; }
      const id = `local_${Date.now().toString(36)}`;
      AsyncStorage.setItem(KEY_USER, id).catch(() => {});
      setUserId(id);
    }).catch(() => setUserId(`local_${Date.now().toString(36)}`));
    AsyncStorage.getItem(KEY_SAVED)
      .then((v) => { if (v) setSaved(JSON.parse(v)); })
      .catch(() => {});
  }, []);

  const actor = useMemo(() => (userId ? { id: userId, role: Role.USER } : null), [userId]);

  const refreshMine = useCallback(async () => {
    if (!actor) return;
    const res = await store.readOwn(actor);
    if (res.ok) setMine(res.data);
  }, [actor]);

  useEffect(() => { refreshMine(); }, [refreshMine]);

  const keepSaved = async (item) => {
    const next = [{ ...item, savedAt: new Date().toISOString() }, ...saved].slice(0, 100);
    setSaved(next);
    AsyncStorage.setItem(KEY_SAVED, JSON.stringify(next)).catch(() => {});
  };

  const openIntent = (intent) => {
    analytics.connectIntentSelected(intent);
    if (intent === Intent.HAVE_JOB) analytics.connectOpportunityStarted({ state: 'FL' });
    setView(intent);
  };

  // The manual ops channel, stated as what it is. A submission is shared to
  // the operator inbox for brokering; nothing pretends a live network exists.
  const shareToOps = async (title, payload) => {
    const body = `${title}\n\n${JSON.stringify(payload, null, 2)}\n\nSent from Contractor Connect (beta) for manual matching.`;
    try {
      await Share.share({ message: body, title });
    } catch {
      // Share sheet unavailable — offer mail instead.
      const url = `mailto:${OPS_EMAIL}?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
      Linking.openURL(url).catch(() => Alert.alert('Could not open', `Email ${OPS_EMAIL} with your submission.`));
    }
  };

  if (!isEnabled('contractorConnectEnabled')) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16 }}>
        <Card C={C}>
          <H C={C}>Contractor Connect is switched off</H>
          <P C={C}>This module is behind a flag and the flag is off. Nothing is wrong with the rest of the app.</P>
        </Card>
      </ScrollView>
    );
  }

  const back = (to = 'home') => (
    <TouchableOpacity onPress={() => setView(to)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
      <Ionicons name="arrow-back" size={16} color={C.blue} />
      <Text style={{ color: C.blue, fontSize: 13, fontWeight: '800' }}>Contractor Connect</Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      {view === 'home' && <Home C={C} setTab={setTab} openIntent={openIntent} setView={setView} mine={mine} />}
      {view === Intent.HAVE_JOB && (
        <View>
          {back()}
          <HaveJobFunnel C={C} actor={actor} onDone={refreshMine} shareToOps={shareToOps} />
        </View>
      )}
      {view === Intent.WANT_WORK && (
        <View>
          {back()}
          <ContractorFunnel C={C} actor={actor} onDone={refreshMine} shareToOps={shareToOps} keepSaved={keepSaved} />
        </View>
      )}
      {view === Intent.NEED_QUALIFIER && (
        <View>
          {back()}
          <BusinessNeedFunnel C={C} actor={actor} onDone={refreshMine} shareToOps={shareToOps} />
        </View>
      )}
      {view === Intent.CAN_QUALIFY && (
        <View>
          {back()}
          <QualifierFunnel C={C} actor={actor} onDone={refreshMine} shareToOps={shareToOps} keepSaved={keepSaved} />
        </View>
      )}
      {view === 'verify' && (
        <View>
          {back()}
          <VerifyLicense C={C} keepSaved={keepSaved} />
        </View>
      )}
      {view === 'saved' && (
        <View>
          {back()}
          <SavedPile C={C} saved={saved} />
        </View>
      )}
      {view === 'warroom' && (
        <View>
          {back()}
          <WarRoom C={C} userId={userId} />
        </View>
      )}
    </ScrollView>
  );
}

// ─── Home ────────────────────────────────────────────────────────────────────

function Home({ C, setTab, openIntent, setView, mine }) {
  const mineCount = (mine?.opportunities?.length ?? 0) + (mine?.contractors?.length ?? 0)
    + (mine?.qualifiers?.length ?? 0) + (mine?.businessNeeds?.length ?? 0);
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Text style={{ color: C.text, fontSize: 20, fontWeight: '800' }}>Contractor Connect</Text>
        <View style={{ backgroundColor: C.amberBg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ color: C.amber, fontSize: 10.5, fontWeight: '800' }}>BETA</Text>
        </View>
      </View>
      <P C={C} style={{ marginBottom: 14 }}>What are you trying to do?</P>

      {INTENT_CARDS.map((card) => (
        <TouchableOpacity key={card.intent} onPress={() => openIntent(card.intent)} activeOpacity={0.88}>
          <Card C={C}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.blueSub, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={card.icon} size={20} color={C.blue} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontSize: 15, fontWeight: '800' }}>{card.title}</Text>
                <P C={C}>{card.blurb}</P>
              </View>
              <Ionicons name="chevron-forward" size={16} color={C.textTert} />
            </View>
          </Card>
        </TouchableOpacity>
      ))}

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4, marginBottom: 12 }}>
        {UTILITY_ROW.map((u) => (
          <TouchableOpacity
            key={u.id}
            activeOpacity={0.85}
            onPress={() => (u.tab ? setTab(u.tab) : setView(u.id === 'verify_license' ? 'verify' : 'saved'))}
            style={{ flex: 1, backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center', paddingVertical: 12, gap: 4 }}>
            <Ionicons name={u.icon} size={18} color={C.blue} />
            <Text style={{ color: C.textSec, fontSize: 11, fontWeight: '700', textAlign: 'center' }}>{u.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {mineCount > 0 && (
        <Card C={C}>
          <H C={C}>Your records</H>
          <P C={C}>
            {mine.opportunities.length} opportunity(ies) · {mine.contractors.length} contractor
            profile(s) · {mine.qualifiers.length} qualifier profile(s) · {mine.businessNeeds.length} business need(s)
          </P>
          <Notice C={C}>
            Beta: records are stored on this device and brokered manually — send each one to the
            Contractor Connect team from its confirmation screen. No public listing exists yet, and
            nothing here says otherwise.
          </Notice>
        </Card>
      )}

      <Card C={C}>
        <P C={C} style={{ fontSize: 11.5 }}>{MARKETPLACE_DISCLAIMER}</P>
        <View style={{ height: 8 }} />
        {FLORIDA_NOTES.map((n) => (
          <View key={n.id} style={{ marginBottom: 8 }}>
            <P C={C} style={{ fontSize: 11.5 }}>{n.text}</P>
            <Text style={{ color: C.textTert, fontSize: 10.5, marginTop: 2 }}>Confirm with: {n.confirmWith}</Text>
          </View>
        ))}
        <Text style={{ color: C.textTert, fontSize: 10.5 }}>
          {LEGAL_REVIEW.source} Reviewed {LEGAL_REVIEW.reviewedAt}. {LEGAL_REVIEW.reviewedBy}
        </Text>
      </Card>

      {typeof __DEV__ !== 'undefined' && __DEV__ ? (
        <Btn C={C} kind="secondary" icon="stats-chart" label="War room (dev)" onPress={() => setView('warroom')} />
      ) : null}
    </View>
  );
}

// ─── Funnel 1: I have a job ──────────────────────────────────────────────────

function HaveJobFunnel({ C, actor, onDone, shareToOps }) {
  const [draft, setDraft] = useState({});
  const [result, setResult] = useState(null);
  const set = (id, v) => setDraft((d) => ({ ...d, [id]: v }));

  const submit = async () => {
    const boolify = (v) => (v === 'yes' ? true : v === 'no' ? false : v);
    const out = createOpportunity({
      ...draft,
      plansAvailable: boolify(draft.plansAvailable),
      photosAvailable: boolify(draft.photosAvailable),
      permitLikely: draft.permitLikely,
      holdsRequiredLicense: draft.holdsRequiredLicense === 'yes' ? true
        : draft.holdsRequiredLicense === 'unsure' ? 'unsure' : false,
    });
    if (!out.ok) {
      Alert.alert('Not quite done', `Still needed: ${out.missing.join(', ')}${out.problems.length ? `\n${out.problems.join('\n')}` : ''}`);
      return;
    }
    const stored = await store.submitOpportunity(actor, out.opportunity);
    if (!stored.ok) { Alert.alert('Could not save', stored.reason); return; }
    analytics.connectOpportunitySubmitted({
      trade: out.opportunity.trade,
      state: out.opportunity.jurisdiction.state,
      county: out.opportunity.jurisdiction.county,
      project_type: out.opportunity.projectType,
      value_range: out.opportunity.estimatedValueRange,
      flag_count: stored.screening.flags.length,
    });
    setResult({ opportunity: out.opportunity, screening: stored.screening });
    onDone();
  };

  if (result) {
    return (
      <Card C={C}>
        <H C={C}>Opportunity submitted</H>
        <P C={C}>{result.screening.submitterMessage}</P>
        <Notice C={C} tone={result.opportunity.licenseStatusOfSubmitter === 'HOLDS_REQUIRED' ? 'ok' : 'warn'}>
          {submitterNotice(result.opportunity)}
        </Notice>
        <Btn C={C} icon="paper-plane" label="Send to the Contractor Connect team"
          onPress={() => shareToOps('Contractor Connect — opportunity', result.opportunity)} />
        <P C={C} style={{ marginTop: 8, fontSize: 11 }}>
          Beta: matching is brokered manually while the network is built. Sending the record is what
          puts it in front of the team.
        </P>
      </Card>
    );
  }

  return (
    <View>
      <Card C={C}>
        <H C={C}>I have a job</H>
        <P C={C}>
          Answer what you know. The one question that changes the route is the licence one — and
          answering no does not stop you.
        </P>
      </Card>
      {HAVE_JOB_QUESTIONS.map((q) => (
        <Card C={C} key={q.id}>
          <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700' }}>
            {q.ask}{q.required ? '' : '  (optional)'}
          </Text>
          {q.note ? <P C={C} style={{ marginTop: 4, fontSize: 11.5 }}>{q.note}</P> : null}
          {q.kind === FieldKind.CHOICE && q.id === 'trade' && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
              {Object.keys(Trade).map((t) => (
                <Chip C={C} key={t} label={TRADE_LABEL[t]} active={draft.trade === t} onPress={() => set('trade', t)} />
              ))}
            </View>
          )}
          {q.kind === FieldKind.CHOICE && q.id === 'projectType' && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
              {PROJECT_TYPES.map((t) => (
                <Chip C={C} key={t} label={t[0] + t.slice(1).toLowerCase()} active={draft.projectType === t} onPress={() => set('projectType', t)} />
              ))}
            </View>
          )}
          {q.kind === FieldKind.CHOICE && q.id === 'submitterRole' && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
              {SUBMITTER_ROLES.map((r) => (
                <Chip C={C} key={r.id} label={r.label} active={draft.submitterRole === r.id} onPress={() => set('submitterRole', r.id)} />
              ))}
            </View>
          )}
          {q.kind === FieldKind.MONEY_RANGE && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
              {VALUE_RANGES.map((r) => (
                <Chip C={C} key={r.id} label={r.label} active={draft.estimatedValueRange === r.id} onPress={() => set('estimatedValueRange', r.id)} />
              ))}
            </View>
          )}
          {(q.kind === FieldKind.TEXT || q.kind === FieldKind.STATE || q.kind === FieldKind.COUNTY || q.kind === FieldKind.DATE) && (
            <Input C={C} value={draft[q.id]} onChangeText={(v) => set(q.id, v)}
              placeholder={q.kind === FieldKind.STATE ? 'FL' : q.kind === FieldKind.DATE ? 'e.g. September' : ''} />
          )}
          {q.kind === FieldKind.MULTILINE && (
            <Input C={C} multiline value={draft[q.id]} onChangeText={(v) => set(q.id, v)} />
          )}
          {q.kind === FieldKind.BOOL && (
            <YesNo C={C} value={draft[q.id]} onChange={(v) => set(q.id, v)} allowUnknown={!!q.allowUnknown} />
          )}
          {q.id === 'holdsRequiredLicense' && (draft.holdsRequiredLicense === 'no' || draft.holdsRequiredLicense === 'unsure') && (
            <Notice C={C} tone="warn">{UNLICENSED_SUBMITTER_NOTICE}</Notice>
          )}
        </Card>
      ))}
      <Btn C={C} icon="checkmark" label="Submit for review" onPress={submit} />
    </View>
  );
}

// ─── Funnel 2: I want work (contractor profile) ──────────────────────────────

function VerificationRow({ C, profile }) {
  const badge = verificationBadge(profile.verification);
  return (
    <View style={{ marginTop: 8 }}>
      <Text style={{ color: badge.active ? C.success : C.amber, fontSize: 12, fontWeight: '800' }}>
        {badge.label}
      </Text>
      {badge.checkedAt ? (
        <Text style={{ color: C.textTert, fontSize: 10.5 }}>
          {badge.sourceName} · {badge.freshness?.label ?? badge.checkedAt}
        </Text>
      ) : null}
      {badge.caveat ? <Text style={{ color: C.textTert, fontSize: 10.5 }}>{badge.caveat}</Text> : null}
    </View>
  );
}

function ContractorFunnel({ C, actor, onDone, shareToOps, keepSaved }) {
  const [form, setForm] = useState({ trade: Trade.ELECTRICAL, state: 'FL' });
  const [result, setResult] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    const out = createContractorProfile({
      ...form,
      serviceCounties: String(form.countiesText ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      specialties: String(form.specialtiesText ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      projectTypes: form.projectTypes ?? [],
      projectSizeRanges: form.projectSizeRanges ?? [],
    });
    if (!out.ok) { Alert.alert('Not quite done', `Still needed: ${out.missing.join(', ')}`); return; }
    const stored = await store.submitProfile(actor, out.profile);
    if (!stored.ok) { Alert.alert('Could not save', stored.reason); return; }
    analytics.connectContractorProfileCreated({
      trade: out.profile.trade, state: out.profile.state, verification_status: 'UNVERIFIED',
    });
    setResult(stored.stored);
    onDone();
  };

  const openDbpr = () => {
    analytics.connectVerificationStarted({ source_id: dbpr.id, state: 'FL' });
    analytics.connectSourceClicked(dbpr.id);
    Linking.openURL(dbpr.deepLink(result?.licenseNumber ?? form.licenseNumber ?? ''))
      .catch(() => analytics.connectVerificationFailed('open_failed', { source_id: dbpr.id }));
  };

  if (result) {
    return (
      <Card C={C}>
        <H C={C}>Contractor profile saved</H>
        <P C={C}>{result.businessName} · {TRADE_LABEL[result.trade]} · {result.state}</P>
        <VerificationRow C={C} profile={result} />
        <Notice C={C}>
          Your licence starts unverified — that is not a judgement, it is the rule for everyone.
          The team checks it against the issuing board before you appear as a match candidate.
          You can open your own record now to see what they will see.
        </Notice>
        <Btn C={C} icon="open-outline" label="Open your DBPR record" onPress={openDbpr} />
        <Btn C={C} kind="secondary" icon="paper-plane" label="Send to the Contractor Connect team"
          onPress={() => shareToOps('Contractor Connect — contractor profile', result)} />
      </Card>
    );
  }

  return (
    <View>
      <Card C={C}>
        <H C={C}>I want work</H>
        <P C={C}>{MATCHING_POLICY}</P>
      </Card>
      <Card C={C}>
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700' }}>Business name</Text>
        <Input C={C} value={form.businessName} onChangeText={(v) => set('businessName', v)} />
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', marginTop: 10 }}>Individual licence holder</Text>
        <Input C={C} value={form.licenseHolder} onChangeText={(v) => set('licenseHolder', v)} />
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', marginTop: 10 }}>Licence number</Text>
        <Input C={C} value={form.licenseNumber} onChangeText={(v) => set('licenseNumber', v)} placeholder="EC13001234" />
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', marginTop: 10 }}>Classification</Text>
        <Input C={C} value={form.classification} onChangeText={(v) => set('classification', v)} placeholder="e.g. EC — as shown on your licence" />
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', marginTop: 10 }}>State</Text>
        <Input C={C} value={form.state} onChangeText={(v) => set('state', v)} placeholder="FL" />
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', marginTop: 10 }}>Service counties (comma-separated)</Text>
        <Input C={C} value={form.countiesText} onChangeText={(v) => set('countiesText', v)} placeholder="Hillsborough, Pinellas" />
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', marginTop: 10 }}>Project types</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
          {PROJECT_TYPES.map((t) => {
            const on = (form.projectTypes ?? []).includes(t);
            return (
              <Chip C={C} key={t} label={t[0] + t.slice(1).toLowerCase()} active={on}
                onPress={() => set('projectTypes', on ? form.projectTypes.filter((x) => x !== t) : [...(form.projectTypes ?? []), t])} />
            );
          })}
        </View>
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', marginTop: 10 }}>Project sizes</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
          {VALUE_RANGES.filter((r) => r.id !== 'UNKNOWN').map((r) => {
            const on = (form.projectSizeRanges ?? []).includes(r.id);
            return (
              <Chip C={C} key={r.id} label={r.label} active={on}
                onPress={() => set('projectSizeRanges', on ? form.projectSizeRanges.filter((x) => x !== r.id) : [...(form.projectSizeRanges ?? []), r.id])} />
            );
          })}
        </View>
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', marginTop: 10 }}>Specialties (comma-separated)</Text>
        <Input C={C} value={form.specialtiesText} onChangeText={(v) => set('specialtiesText', v)} placeholder="service upgrades, EV chargers" />
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', marginTop: 10 }}>Insurance (optional note)</Text>
        <Input C={C} value={form.insuranceNote} onChangeText={(v) => set('insuranceNote', v)} />
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', marginTop: 10 }}>Contact</Text>
        <Input C={C} value={form.phone} onChangeText={(v) => set('phone', v)} placeholder="Phone" />
        <Input C={C} value={form.email} onChangeText={(v) => set('email', v)} placeholder="Email" />
        <Input C={C} value={form.website} onChangeText={(v) => set('website', v)} placeholder="Website (optional)" />
      </Card>
      <Btn C={C} icon="checkmark" label="Create profile" onPress={submit} />
    </View>
  );
}

// ─── Funnel 3: I need a qualifier ────────────────────────────────────────────

function BusinessNeedFunnel({ C, actor, onDone, shareToOps }) {
  const [form, setForm] = useState({ trade: Trade.ELECTRICAL, state: 'FL' });
  const [result, setResult] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    const out = createBusinessNeed({
      ...form,
      counties: String(form.countiesText ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      projectTypes: form.projectTypes ?? [],
      businessAgeYears: Number(form.businessAgeYears) || null,
      holdsPermitsOrContracts: form.holdsPermitsOrContracts === 'yes',
    });
    if (!out.ok) { Alert.alert('Not quite done', `Still needed: ${out.missing.join(', ')}`); return; }
    const stored = await store.submitProfile(actor, out.profile);
    if (!stored.ok) { Alert.alert('Could not save', stored.reason); return; }
    setResult(stored.stored);
    onDone();
  };

  if (result) {
    return (
      <Card C={C}>
        <H C={C}>Request recorded</H>
        <P C={C}>{result.legalName} · {TRADE_LABEL[result.trade]} · {result.state}</P>
        <Notice C={C} tone="warn">{QUALIFIER_NEED_NOTICE}</Notice>
        {result.moderationState === 'FLAGGED' && (
          <Notice C={C}>This request needs a person to look at it before it goes further — most reviews clear within a day.</Notice>
        )}
        <Btn C={C} icon="paper-plane" label="Send to the Contractor Connect team"
          onPress={() => shareToOps('Contractor Connect — qualifier needed', result)} />
      </Card>
    );
  }

  return (
    <View>
      <Card C={C}>
        <H C={C}>I need a qualifier</H>
        <Notice C={C} tone="warn">{QUALIFIER_NEED_NOTICE}</Notice>
      </Card>
      <Card C={C}>
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700' }}>Legal business name</Text>
        <Input C={C} value={form.legalName} onChangeText={(v) => set('legalName', v)} />
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', marginTop: 10 }}>Entity type</Text>
        <Input C={C} value={form.entityType} onChangeText={(v) => set('entityType', v)} placeholder="LLC, Corp…" />
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', marginTop: 10 }}>State</Text>
        <Input C={C} value={form.state} onChangeText={(v) => set('state', v)} placeholder="FL" />
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', marginTop: 10 }}>Licence classification sought</Text>
        <Input C={C} value={form.classificationSought} onChangeText={(v) => set('classificationSought', v)} />
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', marginTop: 10 }}>Primary or secondary qualifier?</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
          {['PRIMARY', 'SECONDARY', 'UNKNOWN'].map((k) => (
            <Chip C={C} key={k} label={k === 'UNKNOWN' ? 'Not sure' : k[0] + k.slice(1).toLowerCase()}
              active={(form.qualifierNeed ?? 'UNKNOWN') === k} onPress={() => set('qualifierNeed', k)} />
          ))}
        </View>
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', marginTop: 10 }}>Business age (years)</Text>
        <Input C={C} value={form.businessAgeYears} onChangeText={(v) => set('businessAgeYears', v)} />
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', marginTop: 10 }}>Approximate annual volume</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
          {VALUE_RANGES.map((r) => (
            <Chip C={C} key={r.id} label={r.label} active={form.approxAnnualVolume === r.id} onPress={() => set('approxAnnualVolume', r.id)} />
          ))}
        </View>
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', marginTop: 10 }}>Counties (comma-separated)</Text>
        <Input C={C} value={form.countiesText} onChangeText={(v) => set('countiesText', v)} />
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', marginTop: 10 }}>Already holding permits or contracts?</Text>
        <YesNo C={C} value={form.holdsPermitsOrContracts} onChange={(v) => set('holdsPermitsOrContracts', v)} />
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', marginTop: 10 }}>Insurance status</Text>
        <Input C={C} value={form.insuranceStatus} onChangeText={(v) => set('insuranceStatus', v)} />
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', marginTop: 10 }}>Expected compensation</Text>
        <Input C={C} value={form.expectedCompensation} onChangeText={(v) => set('expectedCompensation', v)} />
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', marginTop: 10 }}>Ownership / management structure</Text>
        <Input C={C} multiline value={form.ownershipStructure} onChangeText={(v) => set('ownershipStructure', v)} />
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', marginTop: 10 }}>Why does the business need a qualifier?</Text>
        <Input C={C} multiline value={form.reasonQualifierNeeded} onChangeText={(v) => set('reasonQualifierNeeded', v)} />
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', marginTop: 10 }}>What oversight arrangement do you expect?</Text>
        <P C={C} style={{ fontSize: 11.5, marginTop: 2 }}>
          Real supervision of operations, field work and finances is what the role is. Describe how
          that would work day to day.
        </P>
        <Input C={C} multiline value={form.expectedOversight} onChangeText={(v) => set('expectedOversight', v)} />
      </Card>
      <Btn C={C} icon="checkmark" label="Submit for review" onPress={submit} />
    </View>
  );
}

// ─── Funnel 4: I can qualify ─────────────────────────────────────────────────

function QualifierFunnel({ C, actor, onDone, shareToOps, keepSaved }) {
  const [form, setForm] = useState({ state: 'FL' });
  const [result, setResult] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    const out = createQualifierProfile({
      ...form,
      classifications: String(form.classificationsText ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      businessesCurrentlyQualified: String(form.qualifiedText ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      counties: String(form.countiesText ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      industries: String(form.industriesText ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      experienceYears: Number(form.experienceYears) || null,
      statedActive: form.statedActive === 'yes',
      openToAdditional: form.openToAdditional === 'yes',
    });
    if (!out.ok) { Alert.alert('Not quite done', `Still needed: ${out.missing.join(', ')}`); return; }
    const stored = await store.submitProfile(actor, out.profile);
    if (!stored.ok) { Alert.alert('Could not save', stored.reason); return; }
    analytics.connectQualifierProfileCreated({ state: out.profile.state, verification_status: 'UNVERIFIED' });
    setResult(stored.stored);
    onDone();
  };

  const openDbpr = () => {
    analytics.connectVerificationStarted({ source_id: dbpr.id, state: 'FL' });
    analytics.connectSourceClicked(dbpr.id);
    Linking.openURL(dbpr.deepLink(result?.licenseNumber ?? form.licenseNumber ?? '')).catch(() => {});
  };

  if (result) {
    return (
      <Card C={C}>
        <H C={C}>Interest profile saved</H>
        <P C={C}>{result.name} · {result.state}</P>
        <VerificationRow C={C} profile={result} />
        <Notice C={C} tone="warn">{CAN_QUALIFY_NOTICE}</Notice>
        <Btn C={C} icon="open-outline" label="Open your DBPR record" onPress={openDbpr} />
        <Btn C={C} kind="secondary" icon="paper-plane" label="Send to the Contractor Connect team"
          onPress={() => shareToOps('Contractor Connect — qualifier interest profile', result)} />
      </Card>
    );
  }

  return (
    <View>
      <Card C={C}>
        <H C={C}>I can qualify</H>
        <Notice C={C} tone="warn">{CAN_QUALIFY_NOTICE}</Notice>
      </Card>
      <Card C={C}>
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700' }}>Name</Text>
        <Input C={C} value={form.name} onChangeText={(v) => set('name', v)} />
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', marginTop: 10 }}>Licence number</Text>
        <Input C={C} value={form.licenseNumber} onChangeText={(v) => set('licenseNumber', v)} />
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', marginTop: 10 }}>Classifications (comma-separated)</Text>
        <Input C={C} value={form.classificationsText} onChangeText={(v) => set('classificationsText', v)} />
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', marginTop: 10 }}>State</Text>
        <Input C={C} value={form.state} onChangeText={(v) => set('state', v)} placeholder="FL" />
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', marginTop: 10 }}>Is your licence active?</Text>
        <YesNo C={C} value={form.statedActive} onChange={(v) => set('statedActive', v)} />
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', marginTop: 10 }}>Businesses you currently qualify (comma-separated, if any)</Text>
        <Input C={C} value={form.qualifiedText} onChangeText={(v) => set('qualifiedText', v)} />
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', marginTop: 10 }}>Open to considering an additional business?</Text>
        <YesNo C={C} value={form.openToAdditional} onChange={(v) => set('openToAdditional', v)} />
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', marginTop: 10 }}>Counties (comma-separated)</Text>
        <Input C={C} value={form.countiesText} onChangeText={(v) => set('countiesText', v)} />
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', marginTop: 10 }}>Industries (comma-separated)</Text>
        <Input C={C} value={form.industriesText} onChangeText={(v) => set('industriesText', v)} />
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', marginTop: 10 }}>Years of experience</Text>
        <Input C={C} value={form.experienceYears} onChangeText={(v) => set('experienceYears', v)} />
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', marginTop: 10 }}>Expected involvement</Text>
        <P C={C} style={{ fontSize: 11.5, marginTop: 2 }}>
          Site visits, supervision, financial oversight — what you would actually do. Profiles with
          real involvement described rank higher, by rule.
        </P>
        <Input C={C} multiline value={form.expectedInvolvement} onChangeText={(v) => set('expectedInvolvement', v)} />
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', marginTop: 10 }}>Compensation expectations</Text>
        <Input C={C} value={form.compensationExpectation} onChangeText={(v) => set('compensationExpectation', v)} />
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', marginTop: 10 }}>Availability</Text>
        <Input C={C} value={form.availability} onChangeText={(v) => set('availability', v)} />
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', marginTop: 10 }}>Preferred company size</Text>
        <Input C={C} value={form.preferredCompanySize} onChangeText={(v) => set('preferredCompanySize', v)} />
      </Card>
      <Btn C={C} icon="checkmark" label="Create interest profile" onPress={submit} />
    </View>
  );
}

// ─── Verify a licence ────────────────────────────────────────────────────────

function VerifyLicense({ C, keepSaved }) {
  const [number, setNumber] = useState('');
  const n = normalizeLicenseNumber(number);

  const open = () => {
    analytics.connectVerificationStarted({ source_id: dbpr.id, state: 'FL' });
    analytics.connectSourceClicked(dbpr.id);
    Linking.openURL(dbpr.deepLink(n))
      .then(() => keepSaved({ kind: 'LICENSE_LOOKUP', licenseNumber: n, sourceId: dbpr.id, sourceName: dbpr.name, url: dbpr.deepLink(n) }))
      .catch(() => {
        analytics.connectVerificationFailed('open_failed', { source_id: dbpr.id });
        Alert.alert('Could not open', 'Open myfloridalicense.com and search the number there.');
      });
  };

  return (
    <View>
      <Card C={C}>
        <H C={C}>{VERIFY_HELP.title}</H>
        <P C={C}>{VERIFY_HELP.body}</P>
        <Input C={C} value={number} onChangeText={setNumber} placeholder="EC13001234" />
        <Btn C={C} icon="open-outline" label="Open the official record" onPress={open}
          disabled={!looksLikeLicenseNumber(number) && n.length === 0} />
      </Card>
      <Card C={C}>
        <H C={C}>What to look for</H>
        {VERIFY_HELP.whatToLookFor.map((w) => (
          <View key={w} style={{ flexDirection: 'row', gap: 6, marginBottom: 4 }}>
            <Text style={{ color: C.blue }}>•</Text>
            <P C={C} style={{ flex: 1 }}>{w}</P>
          </View>
        ))}
        <Notice C={C} tone="warn">{VERIFY_HELP.caution}</Notice>
      </Card>
    </View>
  );
}

// ─── Saved ───────────────────────────────────────────────────────────────────

function SavedPile({ C, saved }) {
  if (!saved.length) {
    return (
      <Card C={C}>
        <H C={C}>Saved</H>
        <P C={C}>Nothing saved yet. Licence lookups you open are kept here with the date you checked.</P>
      </Card>
    );
  }
  return (
    <View>
      {saved.map((s, i) => (
        <Card C={C} key={`${s.savedAt}_${i}`}>
          <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700' }}>
            {s.kind === 'LICENSE_LOOKUP' ? `Licence ${s.licenseNumber}` : s.kind}
          </Text>
          <P C={C}>{s.sourceName}</P>
          <Text style={{ color: C.textTert, fontSize: 10.5 }}>Checked {new Date(s.savedAt).toLocaleDateString()}</Text>
          {s.url ? (
            <Btn C={C} kind="secondary" icon="open-outline" label="Open again"
              onPress={() => Linking.openURL(s.url).catch(() => {})} />
          ) : null}
        </Card>
      ))}
    </View>
  );
}

// ─── War room (dev builds) ───────────────────────────────────────────────────

function WarRoom({ C, userId }) {
  const [room, setRoom] = useState(null);
  useEffect(() => {
    store.adminSnapshot({ id: userId ?? 'dev', role: Role.ADMIN })
      .then((res) => { if (res.ok) setRoom(warRoom(res.data, { coverage: registry.coverage() })); })
      .catch(() => {});
  }, [userId]);

  if (!room) return <Card C={C}><P C={C}>Loading…</P></Card>;

  const Row = ({ label, value }) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
      <P C={C}>{label}</P>
      <Text style={{ color: C.text, fontSize: 12.5, fontWeight: '800' }}>{String(value)}</Text>
    </View>
  );

  return (
    <View>
      <Card C={C}>
        <H C={C}>War room</H>
        <P C={C} style={{ marginBottom: 8 }}>Local device data. The backend version of this screen reads the same aggregation.</P>
        <Row label="Opportunities" value={room.totals.opportunities} />
        <Row label="Contractors" value={room.totals.contractors} />
        <Row label="Qualifiers" value={room.totals.qualifiers} />
        <Row label="Business needs" value={room.totals.businessNeeds} />
        <Row label="Verified (active) contractors" value={room.verification.verifiedContractors} />
        <Row label="Verified (active) qualifiers" value={room.verification.verifiedQualifiers} />
        <Row label="Pending verification" value={room.verification.pending} />
        <Row label="Awaiting review" value={room.moderation.awaitingReview} />
        <Row label="Flagged" value={room.moderation.flagged} />
        <Row label="Intros requested" value={room.introductions.requested} />
        <Row label="Intros accepted" value={room.introductions.accepted} />
        <Row label="Matches" value={room.introductions.matched} />
        <Row label="Billing events (charged)" value={`${room.revenue.events} (${room.revenue.charged})`} />
        <Row label="Audit rows" value={room.auditRows} />
      </Card>
      {room.sources && (
        <Card C={C}>
          <H C={C}>Source coverage</H>
          <Row label="Live" value={room.sources.live} />
          <Row label="Deep link only" value={room.sources.deepLinkOnly} />
          <Row label="Planned" value={room.sources.planned} />
          <Row label="Unavailable" value={room.sources.unavailable} />
        </Card>
      )}
      {room.actionQueue.length > 0 && (
        <Card C={C}>
          <H C={C}>Do next</H>
          {room.actionQueue.map((a) => (
            <View key={a} style={{ flexDirection: 'row', gap: 6, marginBottom: 4 }}>
              <Text style={{ color: C.amber }}>→</Text>
              <P C={C} style={{ flex: 1 }}>{a}</P>
            </View>
          ))}
        </Card>
      )}
    </View>
  );
}
