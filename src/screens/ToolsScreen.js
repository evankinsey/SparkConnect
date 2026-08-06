// ─── TOOLS ───────────────────────────────────────────────────────────────────
// What the Learn tab became.
//
// Every tool in the app, grouped, with its lessons and practice attached to it
// rather than living in a separate tab nobody opens. A tap goes straight to the
// tool; the Lessons and Practice chips are there for the moment thirty seconds
// later when you want to know why the number is the number.
//
// The list is derived from the card catalog, so a feature cannot ship and be
// missing here.

import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { toolsGrouped, Section } from '../core/learn/tools';

const SECTION_ICON = {
  [Section.LESSONS]: 'school-outline',
  [Section.PRACTICE]: 'ribbon-outline',
};

export default function ToolsScreen({ C, setTab }) {
  const groups = toolsGrouped();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      showsVerticalScrollIndicator={false}>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.blueSub, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="construct" size={20} color={C.blue} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: C.text }}>Tools</Text>
          <Text style={{ fontSize: 12, color: C.textTert }}>Everything in SparkConnect, with the lessons attached</Text>
        </View>
      </View>

      <Text style={{ fontSize: 12, color: C.textSec, lineHeight: 18, marginTop: 8, marginBottom: 18 }}>
        Tap a tool to use it. Where there is something worth learning, it sits on the
        tool itself instead of in a separate tab.
      </Text>

      {groups.map((g) => (
        <View key={g.group} style={{ marginBottom: 18 }}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: C.textTert, letterSpacing: 0.5, marginBottom: 9 }}>
            {g.group.toUpperCase()}
          </Text>

          {g.tools.map((tool) => {
            const extras = tool.sections.filter((s) => s.section !== Section.DO);
            return (
              <View
                key={tool.id}
                style={{
                  backgroundColor: C.surface, borderRadius: 14, marginBottom: 9,
                  borderWidth: 1, borderColor: C.border, overflow: 'hidden',
                }}>
                <TouchableOpacity
                  onPress={() => setTab(tool.tab)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={tool.title}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: 62 }}>
                  <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: C.blueSub, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={tool.icon} size={19} color={C.blue} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14.5, fontWeight: '700', color: C.text }}>{tool.title}</Text>
                    <Text style={{ fontSize: 11.5, color: C.textTert, marginTop: 1 }}>{tool.sub}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={C.textTert} />
                </TouchableOpacity>

                {extras.length > 0 && (
                  <View style={{
                    flexDirection: 'row', flexWrap: 'wrap', gap: 7,
                    paddingHorizontal: 14, paddingBottom: 12, paddingTop: 0,
                  }}>
                    {extras.map((s) => (
                      <TouchableOpacity
                        key={s.section}
                        onPress={() => setTab(s.tab)}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel={`${tool.title}: ${s.sectionLabel} — ${s.label}`}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 5,
                          backgroundColor: C.inputBg, borderRadius: 99,
                          paddingHorizontal: 11, paddingVertical: 7,
                          borderWidth: 1, borderColor: C.border, minHeight: 34,
                        }}>
                        <Ionicons name={SECTION_ICON[s.section] ?? 'ellipse-outline'} size={12} color={C.textSec} />
                        <Text style={{ fontSize: 11.5, fontWeight: '600', color: C.textSec }}>
                          {s.sectionLabel}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      ))}
    </ScrollView>
  );
}
