// ─── PERMIT ASSISTANT ────────────────────────────────────────────────────────
// Pick the work, get what is typical, and get the questions to put to your AHJ.
//
// This screen renders `src/core/field/permits.js` and adds nothing to it. All
// the "typical, not local law" framing lives in the module and is tested there;
// if this file ever starts asserting requirements of its own, that is a bug.

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Share, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  WORK_TYPES, Likelihood, permitGuidance, buildAhjScript,
  sanitizeJurisdiction, emptyJurisdiction, hasJurisdiction,
} from '../core/field/permits';
import {
  buildRecord, pendingVerification, confirmField, rejectField, exportable,
} from '../core/field/ahj';

const KEY_AHJ = '@sc_ahj_v1';

export default function PermitScreen({ C, setTab, onAskAi }) {
  const [workId, setWorkId] = useState(null);
  const [jurisdiction, setJurisdiction] = useState(emptyJurisdiction());
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY_AHJ)
      .then((raw) => { if (raw) setJurisdiction(sanitizeJurisdiction(JSON.parse(raw))); })
      .catch(() => { /* an unreadable save is just an unset AHJ */ });
  }, []);

  const saveJurisdiction = async (next) => {
    const clean = sanitizeJurisdiction({ ...next, updatedAt: Date.now() });
    setJurisdiction(clean);
    setEditing(false);
    AsyncStorage.setItem(KEY_AHJ, JSON.stringify(clean)).catch(() => {});
  };

  const guidance = useMemo(
    () => (workId ? permitGuidance(workId, jurisdiction) : null),
    [workId, jurisdiction],
  );

  const shareScript = async () => {
    const s = buildAhjScript(workId, { jurisdiction });
    if (!s) return;
    try { await Share.share({ message: s.text, title: s.title }); } catch (e) { /* user cancelled */ }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.blueSub, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="document-text" size={21} color={C.blue} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: C.text }}>Permit Assistant</Text>
          <Text style={{ fontSize: 12, color: C.textTert }}>What to expect, and what to ask.</Text>
        </View>
      </View>

      {/* Look it up instead of interrogating the user. Everything that comes
          back is a draft they confirm field by field — see AhjLookup. */}
      <AhjLookup
        C={C}
        onAskAi={onAskAi}
        onAdopt={(verified) => saveJurisdiction({ ...jurisdiction, ...verified })}
      />

      {/* The AHJ record — the only jurisdiction-specific data in the app, and it
          comes from the user. */}
      <AhjCard
        C={C}
        jurisdiction={jurisdiction}
        editing={editing}
        onEdit={() => setEditing(true)}
        onSave={saveJurisdiction}
        onCancel={() => setEditing(false)}
      />

      <Text style={{ fontSize: 11, fontWeight: '800', color: C.textSec, letterSpacing: 0.5, marginTop: 18, marginBottom: 8 }}>
        WHAT ARE YOU DOING?
      </Text>
      {WORK_TYPES.map((w) => {
        const active = workId === w.id;
        return (
          <TouchableOpacity
            key={w.id}
            onPress={() => setWorkId(active ? null : w.id)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={{
              backgroundColor: active ? C.blueSub : C.surface, borderRadius: 12, padding: 13, marginBottom: 8,
              borderWidth: 1.5, borderColor: active ? C.blue : C.border, flexDirection: 'row', alignItems: 'center', gap: 10,
            }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: active ? C.blue : C.text }}>{w.label}</Text>
              <Text style={{ fontSize: 11.5, color: C.textSec, marginTop: 1 }}>{w.sub}</Text>
            </View>
            <Ionicons name={active ? 'chevron-up' : 'chevron-down'} size={16} color={active ? C.blue : C.textTert} />
          </TouchableOpacity>
        );
      })}

      {guidance && <Guidance C={C} g={guidance} onShare={shareScript} onAskAi={onAskAi} workId={workId} jurisdiction={jurisdiction} />}

      <TouchableOpacity onPress={() => setTab && setTab('home')} style={{ padding: 14, alignItems: 'center', marginTop: 8 }}>
        <Text style={{ color: C.textSec, fontSize: 13, fontWeight: '600' }}>Back</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function AhjCard({ C, jurisdiction, editing, onEdit, onSave, onCancel }) {
  const [draft, setDraft] = useState(jurisdiction);
  useEffect(() => { setDraft(jurisdiction); }, [jurisdiction, editing]);

  const field = (label, key, props = {}) => (
    <View style={{ marginBottom: 8 }}>
      <Text style={{ fontSize: 10.5, fontWeight: '700', color: C.textSec, marginBottom: 3 }}>{label}</Text>
      <TextInput
        value={draft[key]}
        onChangeText={(v) => setDraft((d) => ({ ...d, [key]: v }))}
        placeholderTextColor={C.textTert}
        accessibilityLabel={label}
        style={{ backgroundColor: C.inputBg, borderRadius: 9, borderWidth: 1, borderColor: C.border, paddingHorizontal: 11, paddingVertical: 9, fontSize: 13.5, color: C.text }}
        {...props}
      />
    </View>
  );

  if (editing) {
    return (
      <View style={{ backgroundColor: C.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border }}>
        <Text style={{ fontSize: 12, fontWeight: '800', color: C.text, marginBottom: 10 }}>Your AHJ</Text>
        {field('Building department', 'name', { placeholder: 'City of Tulsa' })}
        {field('Phone', 'phone', { placeholder: '918-555-0100', keyboardType: 'phone-pad' })}
        {field('Website (https only)', 'website', { placeholder: 'https://…', autoCapitalize: 'none', keyboardType: 'url' })}
        {field('Adopted code edition', 'codeEdition', { placeholder: 'NEC 2020' })}
        {field('Notes', 'notes', { placeholder: 'Local amendments, inspector name, submittal quirks…', multiline: true })}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
          <TouchableOpacity onPress={() => onSave(draft)} style={{ flex: 1, backgroundColor: C.blue, borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}>
            <Text style={{ fontSize: 13.5, fontWeight: '800', color: '#fff' }}>Save</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onCancel} style={{ paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 13, color: C.textSec, fontWeight: '600' }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <TouchableOpacity onPress={onEdit} activeOpacity={0.85}
      style={{ backgroundColor: C.surface, borderRadius: 14, padding: 13, borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center', gap: 11 }}>
      <Ionicons name="business" size={19} color={hasJurisdiction(jurisdiction) ? C.blue : C.textTert} />
      <View style={{ flex: 1 }}>
        {hasJurisdiction(jurisdiction) ? (
          <>
            <Text style={{ fontSize: 13.5, fontWeight: '700', color: C.text }}>{jurisdiction.name}</Text>
            <Text style={{ fontSize: 11.5, color: C.textSec }}>
              {[jurisdiction.codeEdition, jurisdiction.phone].filter(Boolean).join(' · ') || 'Tap to add details'}
            </Text>
          </>
        ) : (
          <>
            <Text style={{ fontSize: 13.5, fontWeight: '700', color: C.text }}>Set your AHJ</Text>
            <Text style={{ fontSize: 11.5, color: C.textSec }}>So the questions come pre-addressed to your department</Text>
          </>
        )}
      </View>
      <Ionicons name="create-outline" size={16} color={C.textTert} />
    </TouchableOpacity>
  );
}

function Guidance({ C, g, onShare, onAskAi, workId, jurisdiction }) {
  const tone = g.permit.likelihood === Likelihood.SOMETIMES ? C.amber : C.blue;
  const toneBg = g.permit.likelihood === Likelihood.SOMETIMES ? C.amberBg : C.blueSub;

  const callAhj = () => {
    const phone = jurisdiction?.phone?.replace(/[^\d+]/g, '');
    if (!phone) { Alert.alert('No phone saved', 'Add your AHJ phone number at the top of this screen.'); return; }
    Linking.openURL(`tel:${phone}`).catch(() => Alert.alert('Could not open the dialer'));
  };

  return (
    <View style={{ marginTop: 6 }}>
      {/* Permit likelihood */}
      <View style={{ backgroundColor: toneBg, borderRadius: 14, padding: 14, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: tone }}>
        <Text style={{ fontSize: 10.5, fontWeight: '800', color: tone, letterSpacing: 0.6, marginBottom: 4 }}>PERMIT</Text>
        <Text style={{ fontSize: 15, fontWeight: '800', color: C.text, marginBottom: 5 }}>
          {g.permit.label} required
        </Text>
        <Text style={{ fontSize: 12.5, color: C.text, lineHeight: 19 }}>{g.permit.why}</Text>
      </View>

      {/* Inspections */}
      <Section C={C} title="INSPECTIONS TO EXPECT">
        {g.inspections.map((i, n) => (
          <View key={n} style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
            <Text style={{ fontSize: 12, color: C.textTert, width: 14 }}>{n + 1}.</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12.5, color: C.text, fontWeight: '600' }}>{i.name}</Text>
              <Text style={{ fontSize: 11, color: C.textTert }}>{i.when}</Text>
            </View>
          </View>
        ))}
      </Section>

      {g.documents.length > 0 && (
        <Section C={C} title="DOCUMENTS USUALLY WANTED">
          {g.documents.map((d, n) => (
            <Text key={n} style={{ fontSize: 12.5, color: C.text, lineHeight: 20 }}>• {d}</Text>
          ))}
        </Section>
      )}

      {/* The actual deliverable */}
      <Section C={C} title={g.verifyWith ? `ASK ${g.verifyWith.toUpperCase()}` : 'ASK YOUR AHJ'}>
        {g.asks.map((q, n) => (
          <View key={n} style={{ flexDirection: 'row', gap: 8, marginBottom: 7 }}>
            <Ionicons name="help-circle-outline" size={15} color={C.blue} style={{ marginTop: 1 }} />
            <Text style={{ flex: 1, fontSize: 12.5, color: C.text, lineHeight: 18.5 }}>{q}</Text>
          </View>
        ))}
      </Section>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
        <TouchableOpacity onPress={callAhj}
          style={{ flex: 1, flexDirection: 'row', gap: 6, backgroundColor: C.blue, borderRadius: 12, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', minHeight: 48 }}>
          <Ionicons name="call" size={15} color="#fff" />
          <Text style={{ fontSize: 13.5, fontWeight: '800', color: '#fff' }}>Call AHJ</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onShare}
          style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center', minHeight: 48 }}>
          <Ionicons name="share-outline" size={15} color={C.textSec} />
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.textSec }}>Script</Text>
        </TouchableOpacity>
      </View>

      {onAskAi && (
        <TouchableOpacity
          onPress={() => onAskAi(`Permits for ${g.work.label}${g.verifyWith ? ` in ${g.verifyWith}` : ''} — what should I know?`, workId)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#0D1B3E', borderRadius: 12, padding: 13, marginTop: 8 }}>
          <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: C.amber, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="flash" size={16} color="#fff" />
          </View>
          <Text style={{ flex: 1, fontSize: 12.5, fontWeight: '600', color: '#fff' }}>Ask SparkAI about this permit</Text>
          <Ionicons name="chevron-forward" size={15} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>
      )}

      <Text style={{ fontSize: 10.5, color: C.textTert, lineHeight: 16, marginTop: 14 }}>{g.disclaimer}</Text>
    </View>
  );
}

function Section({ C, title, children }) {
  return (
    <View style={{ backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border }}>
      <Text style={{ fontSize: 10.5, fontWeight: '800', color: C.textSec, letterSpacing: 0.6, marginBottom: 9 }}>{title}</Text>
      {children}
    </View>
  );
}

// ─── AHJ LOOKUP ──────────────────────────────────────────────────────────────
// Type a place, get a draft record, confirm it field by field.
//
// The whole design is in what this does NOT do. It does not fill the user's
// saved jurisdiction. It does not export. It does not let a suggestion pass for
// a fact. Every proposed value is visibly a draft until the user taps confirm
// on that specific field, and the two that fail silently — adopted code edition
// and local amendments — say so in their own prompt.

function AhjLookup({ C, onAskAi, onAdopt }) {
  const [query, setQuery] = useState('');
  const [record, setRecord] = useState(null);
  const [open, setOpen] = useState(false);

  const start = () => {
    const q = query.trim();
    if (!q) return;
    // Curated data lands immediately. Anything a model proposes arrives through
    // applyProposal with FieldSource.AI, so it can never outrank this.
    setRecord(buildRecord(q));
    setOpen(true);
  };

  const pending = record ? pendingVerification(record) : [];
  const ready = record ? exportable(record) : {};
  const readyCount = Object.keys(ready).length;

  if (!open) {
    return (
      <View style={{ backgroundColor: C.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border, marginBottom: 12 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 3 }}>
          Look up your AHJ
        </Text>
        <Text style={{ fontSize: 11.5, color: C.textSec, lineHeight: 16, marginBottom: 10 }}>
          Type a city or county. SparkConnect fills in what it can as a draft for you to check —
          it never fills in your saved record on its own.
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Tampa, or Hillsborough County"
            placeholderTextColor={C.placeholder}
            onSubmitEditing={start}
            returnKeyType="search"
            style={{
              flex: 1, backgroundColor: C.inputBg, borderRadius: 10, padding: 11,
              color: C.inputText, fontSize: 14, borderWidth: 1, borderColor: C.border, minHeight: 44,
            }}
          />
          <TouchableOpacity
            onPress={start}
            style={{ backgroundColor: C.blue, borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center', minHeight: 44 }}>
            <Text style={{ fontSize: 13.5, fontWeight: '800', color: '#fff' }}>Look up</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={{ backgroundColor: C.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: C.text }}>{record.query}</Text>
        <TouchableOpacity onPress={() => { setOpen(false); setRecord(null); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={17} color={C.textTert} />
        </TouchableOpacity>
      </View>

      {pending.length === 0 && readyCount === 0 && (
        <View>
          <Text style={{ fontSize: 12, color: C.textSec, lineHeight: 17, marginBottom: 10 }}>
            SparkConnect has no verified record for this jurisdiction. That is the honest answer —
            a plausible-looking phone number and code edition would be worse than a blank.
          </Text>
          <TouchableOpacity
            onPress={() => onAskAi && onAskAi(`permit office, adopted NEC edition, and inspection process for ${record.query}`)}
            style={{ backgroundColor: C.amber, borderRadius: 10, paddingVertical: 12, alignItems: 'center', minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff' }}>Ask SparkAI to look</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 10.5, color: C.textTert, lineHeight: 15, marginTop: 8 }}>
            Anything it finds comes back as a draft you confirm, one field at a time.
          </Text>
        </View>
      )}

      {pending.map((f) => (
        <View
          key={f.key}
          style={{
            borderRadius: 11, padding: 11, marginBottom: 8,
            backgroundColor: C.inputBg,
            // A draft has to LOOK like a draft. High-risk fields get the amber
            // edge, because being wrong about them is not self-announcing.
            borderWidth: 1.5, borderStyle: 'dashed',
            borderColor: f.risk === 'HIGH' ? C.amber : C.border,
          }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <Text style={{ flex: 1, fontSize: 10.5, fontWeight: '800', color: C.textSec, letterSpacing: 0.4 }}>
              {f.label.toUpperCase()}
            </Text>
            <View style={{ backgroundColor: f.risk === 'HIGH' ? C.amberBg : C.border, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ fontSize: 9, fontWeight: '800', color: f.risk === 'HIGH' ? C.amber : C.textTert }}>
                UNVERIFIED
              </Text>
            </View>
          </View>

          <Text style={{ fontSize: 14, color: C.text, marginBottom: 4 }}>{f.value}</Text>
          {!!f.why && (
            <Text style={{ fontSize: 10.5, color: C.textTert, lineHeight: 15, marginBottom: 6 }}>{f.why}</Text>
          )}
          <Text style={{ fontSize: 11, color: f.risk === 'HIGH' ? C.amber : C.textSec, marginBottom: 8 }}>
            {f.prompt}
          </Text>

          <View style={{ flexDirection: 'row', gap: 7 }}>
            <TouchableOpacity
              onPress={() => setRecord(confirmField(record, f.key, { at: Date.now() }))}
              style={{ flex: 1, backgroundColor: C.blue, borderRadius: 9, paddingVertical: 9, alignItems: 'center', minHeight: 40, justifyContent: 'center' }}>
              <Text style={{ fontSize: 12.5, fontWeight: '800', color: '#fff' }}>Confirm</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setRecord(rejectField(record, f.key))}
              style={{ paddingHorizontal: 14, borderRadius: 9, borderWidth: 1, borderColor: C.border, justifyContent: 'center', minHeight: 40 }}>
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: C.textSec }}>Discard</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      {readyCount > 0 && (
        <TouchableOpacity
          onPress={() => { onAdopt(exportable(record)); setOpen(false); setRecord(null); }}
          style={{ backgroundColor: C.green ?? C.blue, borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 4, minHeight: 46, justifyContent: 'center' }}>
          <Text style={{ fontSize: 13.5, fontWeight: '800', color: '#fff' }}>
            Save {readyCount} confirmed field{readyCount === 1 ? '' : 's'}
          </Text>
        </TouchableOpacity>
      )}

      {pending.length > 0 && (
        <Text style={{ fontSize: 10.5, color: C.textTert, lineHeight: 15, marginTop: 8 }}>
          Unconfirmed fields are not saved, not exported, and not used to answer anything.
        </Text>
      )}
    </View>
  );
}
