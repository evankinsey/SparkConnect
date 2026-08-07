// ─── PANEL SCHEDULE ──────────────────────────────────────────────────────────
// Build the schedule that goes in the panel door. Renders
// src/core/field/panelSchedule.js, which owns every rule — especially the one
// that makes a two-pole breaker land on two different phases.

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Share, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  PANEL_SIZES, PanelType, emptyPanel, addCircuit, removeCircuit,
  phaseLoads, imbalancePercent, scheduleRows, spareCount, scheduleText,
} from '../core/field/panelSchedule';
import { analyzePanel, panelReport, Severity } from '../core/field/panelEngine';
import { readScoped, writeScoped, recordFor, upsertRecord, UNFILED, LegacyAdapters } from '../core/domain/scopedStore';

const KEY = '@sc_panel_v1';
const ACTIVE_KEY = '@sc_active_project_v1';

export default function PanelScheduleScreen({ C, setTab }) {
  const [panel, setPanel] = useState(() => emptyPanel());
  // Which job this panel belongs to. null is the unfiled panel — whatever was
  // saved before panels knew about projects, kept as it was.
  const [projectId, setProjectId] = useState(UNFILED);
  const [records, setRecords] = useState([]);
  const [start, setStart] = useState('');
  const [poles, setPoles] = useState(1);
  const [amps, setAmps] = useState('');
  const [desc, setDesc] = useState('');
  const [loadVa, setLoadVa] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [raw, activeRaw] = await Promise.all([
          AsyncStorage.getItem(KEY), AsyncStorage.getItem(ACTIVE_KEY),
        ]);
        const { records: loaded } = readScoped(raw, { legacyToRecord: LegacyAdapters.panel });
        const active = typeof activeRaw === 'string' && activeRaw ? activeRaw : UNFILED;
        setRecords(loaded);
        setProjectId(active);
        const mine = recordFor(loaded, active);
        if (mine) setPanel({ ...emptyPanel(), ...mine });
      } catch (e) { /* a corrupt save is just an empty panel */ }
    })();
  }, []);

  const save = (next) => {
    setPanel(next);
    const nextRecords = upsertRecord(records, projectId, next);
    setRecords(nextRecords);
    AsyncStorage.setItem(KEY, writeScoped(nextRecords)).catch(() => {
      Alert.alert('Not saved', 'This panel schedule could not be written to the device — storage may be full.');
    });
  };

  const rows = useMemo(() => scheduleRows(panel), [panel]);
  const loads = useMemo(() => phaseLoads(panel), [panel]);
  const imbalance = imbalancePercent(panel);
  // What is wrong with this panel, worst first. The shared-neutral check is the
  // one worth the screen space: a multiwire circuit with both hots on one phase
  // puts the SUM of both loads on the neutral and never trips a breaker.
  const findings = useMemo(() => analyzePanel(panel), [panel]);

  const add = () => {
    const r = addCircuit(panel, {
      start: parseInt(start, 10),
      poles,
      amps: parseInt(amps, 10),
      description: desc,
      loadVa: parseInt(loadVa, 10) || 0,
    });
    if (!r.ok) { setError(r.reason); return; }
    setError(null);
    save(r.panel);
    setStart(''); setAmps(''); setDesc(''); setLoadVa('');
  };

  const field = (label, value, onChange, props = {}) => (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 10, fontWeight: '700', color: C.textSec, marginBottom: 3 }}>{label}</Text>
      <TextInput
        value={value} onChangeText={onChange} placeholderTextColor={C.textTert}
        accessibilityLabel={label}
        style={{ backgroundColor: C.inputBg, borderRadius: 9, borderWidth: 1, borderColor: C.border, paddingHorizontal: 10, paddingVertical: 9, fontSize: 13.5, color: C.text }}
        {...props}
      />
    </View>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.tealBg, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="grid" size={20} color={C.teal} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: C.text }}>Panel Schedule</Text>
          <Text style={{ fontSize: 12, color: C.textTert }}>{panel.name} · {panel.mainAmps}A · {panel.size} spaces</Text>
        </View>
      </View>

      {/* Panel setup */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
        {field('Panel name', panel.name, (v) => save({ ...panel, name: v }))}
        {field('Main (A)', String(panel.mainAmps), (v) => save({ ...panel, mainAmps: parseInt(v, 10) || 0 }), { keyboardType: 'number-pad' })}
      </View>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
        {PANEL_SIZES.map((s) => (
          <TouchableOpacity key={s} onPress={() => save({ ...panel, size: s })}
            accessibilityRole="button" accessibilityState={{ selected: panel.size === s }}
            style={{ paddingHorizontal: 11, paddingVertical: 7, borderRadius: 99, backgroundColor: panel.size === s ? C.blue : C.surface, borderWidth: 1, borderColor: panel.size === s ? C.blue : C.border }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: panel.size === s ? '#fff' : C.textSec }}>{s}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14 }}>
        {[[PanelType.SINGLE_SPLIT, '120/240 1Ø'], [PanelType.THREE_WYE, '120/208 3Ø']].map(([t, label]) => (
          <TouchableOpacity key={t} onPress={() => save({ ...panel, panelType: t, circuits: [] })}
            accessibilityRole="button" accessibilityState={{ selected: panel.panelType === t }}
            style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99, backgroundColor: panel.panelType === t ? C.teal : C.surface, borderWidth: 1, borderColor: panel.panelType === t ? C.teal : C.border }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: panel.panelType === t ? '#fff' : C.textSec }}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Add a breaker */}
      <View style={{ backgroundColor: C.surface, borderRadius: 14, padding: 13, borderWidth: 1, borderColor: C.border, marginBottom: 12 }}>
        <Text style={{ fontSize: 10.5, fontWeight: '800', color: C.textSec, letterSpacing: 0.6, marginBottom: 9 }}>ADD A BREAKER</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
          {field('Position', start, setStart, { keyboardType: 'number-pad', placeholder: '1' })}
          {field('Amps', amps, setAmps, { keyboardType: 'number-pad', placeholder: '20' })}
          {field('Load VA', loadVa, setLoadVa, { keyboardType: 'number-pad', placeholder: '0' })}
        </View>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
          {[1, 2, 3].map((p) => (
            <TouchableOpacity key={p} onPress={() => setPoles(p)}
              accessibilityRole="button" accessibilityState={{ selected: poles === p }}
              style={{ flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center', backgroundColor: poles === p ? C.blue : C.inputBg, borderWidth: 1, borderColor: poles === p ? C.blue : C.border }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: poles === p ? '#fff' : C.textSec }}>{p}P</Text>
            </TouchableOpacity>
          ))}
        </View>
        {field('Description', desc, setDesc, { placeholder: 'Kitchen small appliance' })}
        {error && <Text style={{ fontSize: 11.5, color: C.danger, marginTop: 7 }}>{error}</Text>}
        <TouchableOpacity onPress={add}
          style={{ backgroundColor: C.blue, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 9, minHeight: 46, justifyContent: 'center' }}>
          <Text style={{ fontSize: 13.5, fontWeight: '800', color: '#fff' }}>Add</Text>
        </TouchableOpacity>
      </View>

      {/* Balance */}
      {findings.length > 0 && (
        <View style={{ marginBottom: 14 }}>
          <Text style={{ fontSize: 10.5, fontWeight: '800', color: C.textTert, letterSpacing: 0.7, marginBottom: 8 }}>
            WHAT THIS PANEL SAYS
          </Text>
          {findings.slice(0, 6).map((f, i) => {
            const critical = f.severity === Severity.CRITICAL;
            const warning = f.severity === Severity.WARNING;
            const tone = critical ? C.danger : warning ? C.amber : C.textTert;
            const bg = critical ? (C.dangerBg ?? C.amberBg) : warning ? C.amberBg : C.surface;
            return (
              <View key={`${f.code}-${i}`} style={{
                backgroundColor: bg, borderRadius: 12, padding: 12, marginBottom: 7,
                borderWidth: 1, borderColor: critical ? C.danger : warning ? C.amber : C.border,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                  <Ionicons name={critical ? 'warning' : warning ? 'alert-circle' : 'information-circle'} size={15} color={tone} />
                  <Text style={{ flex: 1, fontSize: 12.5, fontWeight: '800', color: C.text }}>{f.title}</Text>
                </View>
                <Text style={{ fontSize: 11.5, color: C.textSec, lineHeight: 17 }}>{f.detail}</Text>
              </View>
            );
          })}
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        {Object.entries(loads).map(([ph, va]) => (
          <View key={ph} style={{ flex: 1, backgroundColor: C.surface, borderRadius: 12, padding: 11, borderWidth: 1, borderColor: C.border, alignItems: 'center' }}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: C.textTert }}>PHASE {ph}</Text>
            <Text style={{ fontSize: 15, fontWeight: '800', color: C.text }}>{va}</Text>
            <Text style={{ fontSize: 9.5, color: C.textTert }}>VA</Text>
          </View>
        ))}
        <View style={{ flex: 1, backgroundColor: imbalance > 10 ? C.amberBg : C.greenBg, borderRadius: 12, padding: 11, alignItems: 'center' }}>
          <Text style={{ fontSize: 10, fontWeight: '800', color: imbalance > 10 ? C.amber : C.green }}>IMBALANCE</Text>
          <Text style={{ fontSize: 15, fontWeight: '800', color: C.text }}>{imbalance}%</Text>
          <Text style={{ fontSize: 9.5, color: C.textTert }}>{spareCount(panel)} spare</Text>
        </View>
      </View>

      {/* The schedule */}
      <View style={{ backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, overflow: 'hidden', marginBottom: 12 }}>
        {rows.map((row) => (
          <View key={row.position}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.borderLight, backgroundColor: row.circuit ? 'transparent' : C.inputBg }}>
            <Text style={{ width: 24, fontSize: 12, fontWeight: '800', color: C.textTert }}>{row.position}</Text>
            <View style={{ width: 18, height: 18, borderRadius: 4, backgroundColor: C.inputBg, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 9.5, fontWeight: '800', color: C.textSec }}>{row.phase}</Text>
            </View>
            {row.isContinuation ? (
              <Text style={{ flex: 1, fontSize: 12, color: C.textTert }}>↳ {row.circuit.description || 'Circuit'}</Text>
            ) : row.circuit ? (
              <>
                <Text style={{ fontSize: 11.5, fontWeight: '800', color: C.blue, width: 52 }}>{row.circuit.amps}A {row.circuit.poles}P</Text>
                <Text style={{ flex: 1, fontSize: 12, color: C.text }} numberOfLines={1}>{row.circuit.description || 'Circuit'}</Text>
                <TouchableOpacity onPress={() => save(removeCircuit(panel, row.circuit.id))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button" accessibilityLabel={`Remove circuit at position ${row.position}`}>
                  <Ionicons name="close-circle" size={16} color={C.textTert} />
                </TouchableOpacity>
              </>
            ) : (
              <Text style={{ flex: 1, fontSize: 12, color: C.textTert }}>Spare</Text>
            )}
          </View>
        ))}
      </View>

      <TouchableOpacity
        onPress={async () => {
          try { await Share.share({ message: scheduleText(panel) }); } catch (e) { /* cancelled */ }
        }}
        style={{ flexDirection: 'row', gap: 7, backgroundColor: C.surface, borderRadius: 12, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: C.border, minHeight: 48 }}>
        <Ionicons name="share-outline" size={16} color={C.textSec} />
        <Text style={{ fontSize: 13, fontWeight: '700', color: C.textSec }}>Share schedule</Text>
      </TouchableOpacity>

      <Text style={{ fontSize: 10.5, color: C.textTert, lineHeight: 16, marginTop: 14 }}>
        Load figures are the ones you entered. Verify the schedule against the installed panel before submitting it.
      </Text>

      <TouchableOpacity onPress={() => setTab && setTab('home')} style={{ padding: 14, alignItems: 'center' }}>
        <Text style={{ color: C.textSec, fontSize: 13, fontWeight: '600' }}>Back</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
