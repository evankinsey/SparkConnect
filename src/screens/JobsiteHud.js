// ─── JOB SITE HUD ────────────────────────────────────────────────────────────
// The chrome over the world. Layout rules and every number come from
// core/game/hud.js — this file only renders them.
//
// Kept out of JobsiteScreen because that file already owns the world, the
// camera, the stick and the task hand-off, and a HUD grown inside it is how a
// screen becomes unreviewable.
//
// The one rule worth restating here: what is permanently on screen is four
// things — level, objective, stick, action. Everything else is a tap away. The
// reference mockup shows eight panels at once, which is beautiful at desktop
// size and covers roughly 40% of an iPhone. See the note at the top of hud.js.

import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { HUD, panelStyle, Panel, PRESS_SCALE } from '../core/game/hud';

// ─── Primitives ──────────────────────────────────────────────────────────────

export const Glass = ({ children, raised, deep, style }) => (
  <View style={[panelStyle({ raised, deep }), style]}>{children}</View>
);

/**
 * A button that acknowledges the press.
 *
 * Scale only, and a small one. On a control you tap a hundred times a session,
 * anything springier becomes noise you cannot turn off.
 */
export const Press = ({ children, onPress, style, motion, accessibilityLabel, accessibilityRole = 'button', disabled }) => {
  const scale = React.useRef(new Animated.Value(1)).current;
  const to = (v) => {
    if (!motion?.pressScale) { scale.setValue(v); return; }
    Animated.timing(scale, {
      toValue: v, duration: motion.pressScale, useNativeDriver: true, easing: Easing.out(Easing.quad),
    }).start();
  };
  return (
    <TouchableOpacity
      activeOpacity={1}
      onPressIn={() => to(PRESS_SCALE)}
      onPressOut={() => to(1)}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </TouchableOpacity>
  );
};

// ─── Always on screen ────────────────────────────────────────────────────────

/** Level, XP and the phase. The XP bar eases so a gain is legible as a gain. */
export function LevelBar({ bar, phase, percent, coin, motion }) {
  const w = React.useRef(new Animated.Value(bar.percent)).current;
  React.useEffect(() => {
    if (!motion?.xpFill) { w.setValue(bar.percent); return; }
    Animated.timing(w, {
      toValue: bar.percent, duration: motion.xpFill, useNativeDriver: false, easing: Easing.out(Easing.cubic),
    }).start();
  }, [bar.percent, motion, w]);

  return (
    <Glass style={{ flex: 1, paddingHorizontal: 12, paddingVertical: 9 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontSize: 10.5, fontWeight: '900', color: HUD.text, letterSpacing: 0.7 }}>
          LVL {bar.level}
        </Text>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 10.5, fontWeight: '700', color: HUD.textSec, letterSpacing: 0.5 }}>
          {phase}
        </Text>
        {coin?.visible ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="ellipse" size={9} color={HUD.warn} />
            <Text style={{ fontSize: 11, fontWeight: '800', color: HUD.text }}>{coin.balance}</Text>
          </View>
        ) : null}
      </View>

      {/* Two bars, stacked meaning: XP to the next level, and the job itself. */}
      <View style={{ height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.10)', marginTop: 7, overflow: 'hidden' }}>
        <Animated.View style={{
          width: w.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
          height: 5, backgroundColor: HUD.system, borderRadius: 3,
        }} />
      </View>
      <View style={{ height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)', marginTop: 4, overflow: 'hidden' }}>
        <View style={{ width: `${percent}%`, height: 3, backgroundColor: HUD.objective, borderRadius: 2 }} />
      </View>
    </Glass>
  );
}

/** Where to go and how far. The one navigation aid that is always up. */
export function ObjectiveChip({ room, feet }) {
  return (
    <Glass style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10 }}>
      <Ionicons name="navigate" size={13} color={HUD.objective} />
      <Text style={{ fontSize: 12, fontWeight: '600', color: HUD.text }}>{room}</Text>
      <Text style={{ fontSize: 12, fontWeight: '800', color: HUD.objective }}>{feet} ft</Text>
    </Glass>
  );
}

/** The next-step card. First thing to collapse on a small screen. */
export function NextStep({ title, hint, feet, icon }) {
  return (
    <Glass style={{ padding: 12, width: 178 }}>
      <Text style={{ fontSize: 9.5, fontWeight: '900', color: HUD.objective, letterSpacing: 0.8 }}>NEXT STEP</Text>
      <Text style={{ fontSize: 12.5, fontWeight: '700', color: HUD.text, marginTop: 5, lineHeight: 17 }}>{title}</Text>
      <View style={{ height: 1, backgroundColor: HUD.edge, marginVertical: 9 }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <Ionicons name={icon || 'hammer'} size={14} color={HUD.textSec} />
        <Text style={{ fontSize: 11, color: HUD.textSec, fontWeight: '700' }}>{feet} ft away</Text>
      </View>
      {hint ? (
        <Text style={{ fontSize: 10.5, color: HUD.textDim, marginTop: 8, lineHeight: 15 }}>{hint}</Text>
      ) : null}
    </Glass>
  );
}

// ─── Transient ───────────────────────────────────────────────────────────────

/** Crew dialogue and sign-off. Slides in, is read, leaves. */
export function Dialogue({ portrait, name, text, xp, tone = HUD.warn, motion }) {
  const a = React.useRef(new Animated.Value(motion?.dialogueIn ? 0 : 1)).current;
  React.useEffect(() => {
    if (!motion?.dialogueIn) { a.setValue(1); return; }
    a.setValue(0);
    Animated.timing(a, {
      toValue: 1, duration: motion.dialogueIn, useNativeDriver: true, easing: Easing.out(Easing.cubic),
    }).start();
  }, [text, name, motion, a]);

  return (
    <Animated.View style={{
      opacity: a,
      transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
    }}>
      <Glass raised style={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11, borderColor: tone }}>
        {portrait ? (
          <Image source={portrait} style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: tone }} />
        ) : null}
        <View style={{ flex: 1 }}>
          {name ? <Text style={{ fontSize: 11, fontWeight: '900', color: tone, letterSpacing: 0.3 }}>{name}</Text> : null}
          <Text numberOfLines={3} style={{ fontSize: 12, color: HUD.text, lineHeight: 17, marginTop: 1 }}>“{text}”</Text>
        </View>
        {xp ? <Text style={{ fontSize: 13, fontWeight: '900', color: HUD.objective }}>+{xp}</Text> : null}
      </Glass>
    </Animated.View>
  );
}

// ─── Panels ──────────────────────────────────────────────────────────────────

function PanelShell({ title, onClose, children, maxHeight = 300 }) {
  return (
    <Glass raised style={{ padding: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <Text style={{ flex: 1, fontSize: 11, fontWeight: '900', color: HUD.text, letterSpacing: 0.8 }}>{title}</Text>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
          accessibilityRole="button" accessibilityLabel={`Close ${title}`}>
          <Ionicons name="close" size={17} color={HUD.textSec} />
        </TouchableOpacity>
      </View>
      <ScrollView style={{ maxHeight }} showsVerticalScrollIndicator={false}>{children}</ScrollView>
    </Glass>
  );
}

/** A row whose check animates in when it lands, so completion registers. */
function TaskRow({ label, xp, done, motion }) {
  const a = React.useRef(new Animated.Value(done ? 1 : 0)).current;
  const was = React.useRef(done);
  React.useEffect(() => {
    if (done === was.current) return;
    was.current = done;
    if (!motion?.taskCheck) { a.setValue(done ? 1 : 0); return; }
    Animated.timing(a, {
      toValue: done ? 1 : 0, duration: motion.taskCheck, useNativeDriver: true, easing: Easing.out(Easing.back(2)),
    }).start();
  }, [done, motion, a]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 6 }}>
      <Animated.View style={{ transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) }] }}>
        <Ionicons name={done ? 'checkbox' : 'square-outline'} size={16} color={done ? HUD.objective : HUD.textDim} />
      </Animated.View>
      <Text numberOfLines={1} style={{
        flex: 1, fontSize: 12.5, color: done ? HUD.textDim : HUD.text,
        textDecorationLine: done ? 'line-through' : 'none',
      }}>{label}</Text>
      <Text style={{ fontSize: 10.5, fontWeight: '800', color: done ? HUD.objective : HUD.warn }}>{xp}</Text>
    </View>
  );
}

export function TasksPanel({ tasks, rollup, onClose, motion }) {
  return (
    <PanelShell title={`TASK LIST · ${rollup.label}`} onClose={onClose}>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.10)', marginBottom: 10, overflow: 'hidden' }}>
        <View style={{ width: `${rollup.percent}%`, height: 4, backgroundColor: HUD.objective, borderRadius: 2 }} />
      </View>
      {tasks.map((t) => (
        <TaskRow key={t.id} label={t.label} xp={t.xp} done={t.done} motion={motion} />
      ))}
    </PanelShell>
  );
}

/**
 * Blueprint minimap.
 *
 * Rooms as outlines on a dark blue ground, with you, the objective and what is
 * already signed off. Deliberately schematic — a shrunken copy of the world art
 * is unreadable at 118px, and a plan drawing is what an electrician reads
 * anyway.
 */
/**
 * The plan, filling in as it is walked.
 *
 * The WALLS are on it from the start — on a real job you arrive with the
 * prints, and hiding the layout would be a puzzle-game conceit rather than a
 * jobsite one. What fills in is where you have actually been, and the
 * objective pin only shows once its room has been entered: the map tells you
 * the shape of the building, not the answer to it.
 */
export function MapPanel({
  rooms, player, objective, doneRooms = [], seenRooms = null, mapW, mapH, size, onClose,
}) {
  const s = size;
  const sx = (v) => (v / mapW) * s;
  const sy = (v) => (v / mapH) * s;
  // null means "discovery is off" — every room reads as visited, which is how
  // this behaved before and what a caller that does not pass it should get.
  const visited = (id) => seenRooms === null || seenRooms.includes(id);
  const roomOf = (pt) => (pt ? rooms.find((r) => pt.x >= r.x && pt.x < r.x + r.w
    && pt.y >= r.y && pt.y < r.y + r.h) : null);
  return (
    <PanelShell title="JOB MAP" onClose={onClose} maxHeight={s + 60}>
      <View style={{
        width: s, height: s, alignSelf: 'center', borderRadius: 10, overflow: 'hidden',
        backgroundColor: '#0A1A2E', borderWidth: 1, borderColor: 'rgba(59,130,246,0.35)',
      }}>
        {rooms.map((r) => {
          const done = doneRooms.includes(r.id);
          const been = visited(r.id);
          return (
            <View key={r.id} style={{
              position: 'absolute', left: sx(r.x), top: sy(r.y), width: sx(r.w), height: sy(r.h),
              borderWidth: 1,
              borderColor: done ? 'rgba(34,197,94,0.6)'
                : been ? 'rgba(59,130,246,0.45)' : 'rgba(59,130,246,0.18)',
              backgroundColor: done ? 'rgba(34,197,94,0.10)'
                : been ? 'rgba(59,130,246,0.07)' : 'transparent',
              // An unvisited room is an outline: the plan shows it, nothing
              // says what is in it.
              borderStyle: been ? 'solid' : 'dashed',
            }} />
          );
        })}
        {objective && visited(roomOf(objective)?.id ?? null) ? (
          <View style={{
            position: 'absolute', left: sx(objective.x) - 4, top: sy(objective.y) - 4,
            width: 8, height: 8, borderRadius: 4, backgroundColor: HUD.warn,
          }} />
        ) : null}
        <View style={{
          position: 'absolute', left: sx(player.x) - 5, top: sy(player.y) - 5,
          width: 10, height: 10, borderRadius: 5, backgroundColor: HUD.objective,
          borderWidth: 2, borderColor: '#fff',
        }} />
      </View>
      <Text style={{ fontSize: 10.5, color: HUD.textDim, textAlign: 'center', marginTop: 9 }}>
        Green is you. Amber is where you are headed.
      </Text>
    </PanelShell>
  );
}

export function ListPanel({ title, items, empty, onClose }) {
  return (
    <PanelShell title={title} onClose={onClose}>
      {items.length === 0 ? (
        <Text style={{ fontSize: 12, color: HUD.textDim, lineHeight: 18 }}>{empty}</Text>
      ) : items.map((it) => (
        <View key={it.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
          <Ionicons name={it.icon || 'ellipse-outline'} size={16} color={it.tone || HUD.textSec} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12.5, color: HUD.text, fontWeight: '600' }}>{it.label}</Text>
            {it.sub ? <Text style={{ fontSize: 10.5, color: HUD.textDim, marginTop: 2 }}>{it.sub}</Text> : null}
          </View>
          {it.count != null ? (
            <Text style={{ fontSize: 12, fontWeight: '800', color: HUD.textSec }}>{it.count}</Text>
          ) : null}
        </View>
      ))}
    </PanelShell>
  );
}

// ─── Dock ────────────────────────────────────────────────────────────────────

export function Dock({ slots, open, onSelect, badge = {}, motion }) {
  return (
    <Glass style={{ flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 4 }}>
      {slots.map((s) => {
        const on = open === s.id;
        return (
          <Press
            key={s.id}
            motion={motion}
            onPress={() => onSelect(s.id)}
            accessibilityLabel={s.label}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: HUD.radiusSm, backgroundColor: on ? 'rgba(59,130,246,0.18)' : 'transparent' }}>
            <View>
              <Ionicons name={s.icon} size={19} color={on ? HUD.system : HUD.textSec} />
              {badge[s.id] ? (
                <View style={{
                  position: 'absolute', top: -4, right: -8, minWidth: 15, height: 15, borderRadius: 8,
                  backgroundColor: HUD.warn, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
                }}>
                  <Text style={{ fontSize: 9, fontWeight: '900', color: '#1A1408' }}>{badge[s.id]}</Text>
                </View>
              ) : null}
            </View>
            {/* No label. Five of them across the width left beside the stick
                renders as one unreadable word — "TasksMapInventoryLearnScore".
                The icons are standard and each carries an accessibility label,
                which is what actually needs to name them. */}
          </Press>
        );
      })}
    </Glass>
  );
}

// ─── Completion ──────────────────────────────────────────────────────────────

export function CompletionCard({ result, onClose, onLeave }) {
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(2,5,10,0.72)' }}>
      <Glass raised style={{ padding: 22, width: '84%', alignItems: 'center' }}>
        <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: 'rgba(34,197,94,0.16)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: HUD.objective }}>
          <Ionicons name="checkmark" size={30} color={HUD.objective} />
        </View>
        <Text style={{ fontSize: 19, fontWeight: '900', color: HUD.text, marginTop: 14 }}>{result.headline}</Text>
        <Text style={{ fontSize: 13, color: HUD.textSec, marginTop: 6 }}>{result.sub}</Text>
        {result.timeNote ? (
          <Text style={{ fontSize: 11.5, color: HUD.textDim, marginTop: 4 }}>{result.timeNote}</Text>
        ) : null}
        <TouchableOpacity onPress={onClose} activeOpacity={0.85}
          accessibilityRole="button" accessibilityLabel="Keep working the site"
          style={{ backgroundColor: HUD.objective, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 30, marginTop: 20, alignSelf: 'stretch', alignItems: 'center' }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: '#06210F' }}>Stay on site</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onLeave} style={{ paddingVertical: 12 }} accessibilityRole="button">
          <Text style={{ fontSize: 12.5, color: HUD.textSec, fontWeight: '600' }}>Back to Home</Text>
        </TouchableOpacity>
      </Glass>
    </View>
  );
}
