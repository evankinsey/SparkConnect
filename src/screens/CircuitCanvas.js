// ─── CIRCUIT CANVAS ──────────────────────────────────────────────────────────
// The visual layer of the Wiring Simulator. Draws the devices as devices — a
// panel, switch plates, a bulb, a receptacle — with conductors as colored
// curves between terminals, the way competitor sims and wiring diagrams do.
//
// The interaction contract is unchanged from the chip UI it replaces: tap a
// terminal, tap a second terminal, and the screen owns what happens next. This
// file NEVER decides correctness — the engine does. It only draws and reports
// taps, so a rendering bug can never grade a circuit wrong.

import React, { useMemo } from 'react';
import { View, Text, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Rect, Circle, Line, G, Text as SvgText } from 'react-native-svg';

import { ComponentType, TerminalRole } from '../circuit/model';
import { routedPath, assignLanes } from '../circuit/routing';

// One source of truth for conductor colors, shared with the role picker chips.
export const ROLE_COLORS = {
  LINE: '#111827',
  SWITCHED_HOT: '#DC2626',
  TRAVELER_A: '#DC2626',
  TRAVELER_B: '#EA580C',
  NEUTRAL: '#9CA3AF',
  EQUIPMENT_GROUND: '#16A34A',
  UNSPECIFIED: '#64748B',
};

const screwColor = (t) => {
  if (t.semanticRole === TerminalRole.EQUIPMENT_GROUND || t.semanticRole === TerminalRole.SOURCE_GROUND) return '#16A34A';
  if (t.semanticRole === TerminalRole.SOURCE_NEUTRAL || t.semanticRole === TerminalRole.LOAD_NEUTRAL) return '#C0C4CC';
  if (t.semanticRole === TerminalRole.SWITCH_COMMON) return '#1F2937';
  return '#D4A017'; // brass
};

const shortLabel = (t) => {
  const l = String(t.label || t.localId);
  const cut = l.indexOf(' (');
  const s = (cut > 0 ? l.slice(0, cut) : l).replace('Ungrounded', 'Hot').replace('Grounded', 'Neutral').replace('Equipment ground', 'Ground');
  return s.length > 11 ? s.slice(0, 10) + '…' : s;
};

// Box sizing per device. Width stretches so the terminal row never crowds.
const sizeFor = (c) => {
  const n = c.terminals.length;
  const minW = { [ComponentType.SOURCE]: 150, [ComponentType.SPLICE]: 100 }[c.type] ?? 124;
  return { w: Math.max(minW, n * 42 + 18), h: c.type === ComponentType.SPLICE ? 100 : 132 };
};

/** Flow-wrap layout: devices left→right, wrapping, with a wire corridor below each row. */
const layoutComponents = (components, W) => {
  const GAP = 14, CORRIDOR = 46;
  const boxes = {};
  let x = 0, y = 8, rowH = 0;
  for (const c of components) {
    const { w, h } = sizeFor(c);
    if (x > 0 && x + w > W) { x = 0; y += rowH + CORRIDOR; rowH = 0; }
    boxes[c.id] = { x, y, w, h };
    x += w + GAP;
    rowH = Math.max(rowH, h);
  }
  const height = y + rowH + CORRIDOR + 6;

  // Terminal anchor points: evenly spaced along the bottom edge of each box.
  const anchors = {};
  for (const c of components) {
    const b = boxes[c.id];
    c.terminals.forEach((t, i) => {
      anchors[t.id] = {
        x: b.x + (b.w * (i + 1)) / (c.terminals.length + 1),
        y: b.y + b.h - 18,
      };
    });
  }
  return { boxes, anchors, height };
};

// ─── Device art ──────────────────────────────────────────────────────────────
// Everything draws into its box, leaving the bottom ~36px as the terminal strip.

function DeviceArt({ c, box, lit }) {
  const { x, y, w } = box;
  const artH = box.h - 40;
  const cx = x + w / 2;

  switch (c.type) {
    case ComponentType.SOURCE:
      return (
        <G>
          <Rect x={x + 6} y={y + 16} width={w - 12} height={artH - 18} rx={8} fill="#1F2937" stroke="#111827" strokeWidth={1.5} />
          <Rect x={cx - 13} y={y + 30} width={26} height={34} rx={4} fill="#111827" stroke="#374151" />
          <Rect x={cx - 8} y={y + 36} width={16} height={10} rx={2} fill="#F4A11D" />
          <SvgText x={cx} y={y + artH - 10} fill="#9CA3AF" fontSize="9" fontWeight="bold" textAnchor="middle">PANEL</SvgText>
        </G>
      );
    case ComponentType.SWITCH_SINGLE_POLE:
    case ComponentType.SWITCH_THREE_WAY:
    case ComponentType.SWITCH_FOUR_WAY: {
      const tag = c.type === ComponentType.SWITCH_SINGLE_POLE ? 'SP' : c.type === ComponentType.SWITCH_THREE_WAY ? '3W' : '4W';
      return (
        <G>
          <Rect x={cx - 30} y={y + 16} width={60} height={artH - 18} rx={7} fill="#E5E7EB" stroke="#9CA3AF" strokeWidth={1.5} />
          <Rect x={cx - 11} y={y + 28} width={22} height={artH - 42} rx={4} fill="#F9FAFB" stroke="#9CA3AF" />
          <Rect x={cx - 8} y={y + 34} width={16} height={16} rx={3} fill="#D1D5DB" stroke="#6B7280" />
          <SvgText x={cx + 24} y={y + 26} fill="#2563EB" fontSize="9" fontWeight="bold" textAnchor="end">{tag}</SvgText>
        </G>
      );
    }
    case ComponentType.LUMINAIRE: {
      const by = y + 16 + (artH - 18) / 2;
      return (
        <G>
          {lit && [0, 60, 120, 180, 240, 300].map((deg) => {
            const rad = (deg * Math.PI) / 180;
            return (
              <Line key={deg}
                x1={cx + Math.cos(rad) * 26} y1={by + Math.sin(rad) * 26}
                x2={cx + Math.cos(rad) * 36} y2={by + Math.sin(rad) * 36}
                stroke="#F4A11D" strokeWidth={2.5} strokeLinecap="round" />
            );
          })}
          <Circle cx={cx} cy={by} r={20} fill={lit ? '#FDE68A' : 'none'} stroke={lit ? '#F4A11D' : '#9CA3AF'} strokeWidth={2} />
          <Path d={`M ${cx - 7} ${by + 4} q 7 -12 14 0`} stroke={lit ? '#B45309' : '#9CA3AF'} strokeWidth={1.5} fill="none" />
          <Rect x={cx - 8} y={by + 18} width={16} height={9} rx={2} fill="#9CA3AF" />
        </G>
      );
    }
    case ComponentType.RECEPTACLE:
      return (
        <G>
          <Rect x={cx - 26} y={y + 14} width={52} height={artH - 14} rx={7} fill="#F3F4F6" stroke="#9CA3AF" strokeWidth={1.5} />
          {[0, 1].map((i) => {
            const fy = y + 24 + i * ((artH - 34) / 2);
            return (
              <G key={i}>
                <Rect x={cx - 8} y={fy} width={4} height={12} rx={1.5} fill="#374151" />
                <Rect x={cx + 5} y={fy} width={4} height={12} rx={1.5} fill="#374151" />
                <Circle cx={cx} cy={fy + 17} r={3} fill="#374151" />
              </G>
            );
          })}
        </G>
      );
    case ComponentType.SPLICE:
      return (
        <G>
          <Rect x={x + 8} y={y + 18} width={w - 16} height={artH - 22} rx={9} fill="#374151" stroke="#1F2937" strokeWidth={1.5} />
          <Path d={`M ${cx - 9} ${y + artH - 12} L ${cx} ${y + 26} L ${cx + 9} ${y + artH - 12} Z`} fill="#F4A11D" stroke="#B45309" />
        </G>
      );
    default:
      return <Rect x={x + 6} y={y + 16} width={w - 12} height={artH - 18} rx={8} fill="#E5E7EB" stroke="#9CA3AF" />;
  }
}

// ─── The canvas ──────────────────────────────────────────────────────────────

export default function CircuitCanvas({
  C,
  components,
  wires = [],
  pending = null,
  highlighted = new Set(),
  lit = false,
  onTapTerminal,
  onTapWire,
  width,
}) {
  const W = width ?? Dimensions.get('window').width - 56;
  const { boxes, anchors, height } = useMemo(() => layoutComponents(components, W), [components, W]);
  // Conductors sharing a corridor are pushed into separate lanes. Two wires
  // drawn on top of each other is the same ambiguity as one drawn through a box.
  const lanes = useMemo(() => assignLanes(wires, anchors, boxes), [wires, anchors, boxes]);

  const connCount = (tid) => wires.filter((w) => w.fromTerminal === tid || w.toTerminal === tid).length;

  return (
    <View style={{ backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 12 }}>
      <Svg width={W} height={height}>
        {/* Wires first, under the devices' terminal strip.
            Routed through the corridors between rows rather than drawn as a
            single curve from terminal to terminal. The old bezier passed over
            whatever sat between its endpoints, so a correctly wired circuit was
            reported as having three faults it did not have — the switched leg
            crossed the neutral splice on its way to the luminaire and looked
            like it landed there. See src/circuit/routing.js. */}
        {wires.map((wire) => {
          const routed = routedPath(wire, anchors, boxes, lanes.get(wire.id) ?? 0, W);
          if (!routed) return null;
          const d = routed.d;
          const color = ROLE_COLORS[wire.role] ?? ROLE_COLORS.UNSPECIFIED;
          return (
            <G key={wire.id}>
              <Path d={d} stroke={color} strokeWidth={3.5} fill="none" strokeLinecap="round" />
              {/* Invisible fat path = glove-friendly tap target for removal.
                  Drawn before the devices so a terminal tap always wins over a
                  wire tap where the two overlap. */}
              <Path d={d} stroke="rgba(0,0,0,0.01)" strokeWidth={20} fill="none"
                onPress={onTapWire ? () => onTapWire(wire.id) : undefined}
                accessible={!!onTapWire}
                accessibilityRole="button"
                accessibilityLabel={`Remove conductor ${wire.role}`} />
            </G>
          );
        })}

        {components.map((c) => (
          <G key={c.id}>
            <DeviceArt c={c} box={boxes[c.id]} lit={lit && c.metadata?.isLoad} />
            <SvgText x={boxes[c.id].x + boxes[c.id].w / 2} y={boxes[c.id].y + 10}
              fill={C.textSec} fontSize="9.5" fontWeight="bold" textAnchor="middle">
              {c.label.length > 22 ? c.label.slice(0, 21) + '…' : c.label}
            </SvgText>

            {c.terminals.map((t) => {
              const p = anchors[t.id];
              const isPending = pending === t.id;
              const isBad = highlighted.has(t.id);
              const n = connCount(t.id);
              return (
                <G key={t.id}>
                  {(isPending || isBad) && (
                    <Circle cx={p.x} cy={p.y} r={15} fill="none"
                      stroke={isPending ? C.blue : C.danger} strokeWidth={3} />
                  )}
                  <Circle cx={p.x} cy={p.y} r={9} fill={screwColor(t)} stroke={n ? '#16A34A' : '#4B5563'} strokeWidth={n ? 2.5 : 1.5} />
                  <Line x1={p.x - 4} y1={p.y} x2={p.x + 4} y2={p.y} stroke="rgba(0,0,0,0.45)" strokeWidth={1.5} />
                  {n > 0 && (
                    <G>
                      <Circle cx={p.x + 9} cy={p.y - 9} r={6.5} fill="#16A34A" />
                      <SvgText x={p.x + 9} y={p.y - 6} fill="#fff" fontSize="8" fontWeight="bold" textAnchor="middle">{n}</SvgText>
                    </G>
                  )}
                  <SvgText x={p.x} y={p.y + 20} fill={isBad ? C.danger : C.textTert} fontSize="7.5" textAnchor="middle">
                    {shortLabel(t)}
                  </SvgText>
                  {/* Glove-friendly invisible tap target. It also carries the
                      accessibility label — the visible screw is 9px across and
                      would be an unusable VoiceOver target on its own. */}
                  <Circle cx={p.x} cy={p.y} r={20} fill="rgba(0,0,0,0.01)"
                    onPress={onTapTerminal ? () => onTapTerminal(t.id) : undefined}
                    accessible={!!onTapTerminal}
                    accessibilityRole="button"
                    accessibilityLabel={`${c.label}, ${t.label}${n ? `, ${n} connected` : ', not connected'}`}
                    accessibilityState={{ selected: isPending }} />
                </G>
              );
            })}
          </G>
        ))}
      </Svg>
      {/* Notes a device carries about its own terminals. The single-pole switch
          uses this to say its two brass screws are interchangeable — which is
          the thing "Screw 1 / Screw 2" implied was false, and which matters
          because the opposite is true of a GFCI. */}
      {components.filter((c) => c.metadata?.terminalNote).map((c) => (
        <View key={`note-${c.id}`} style={{
          flexDirection: 'row', gap: 7, alignItems: 'flex-start', marginTop: 8,
          backgroundColor: C.blueSub, borderRadius: 9, padding: 9,
        }}>
          <Ionicons name="bulb-outline" size={13} color={C.blue} style={{ marginTop: 1 }} />
          <Text style={{ flex: 1, fontSize: 10.5, color: C.textSec, lineHeight: 15 }}>
            <Text style={{ fontWeight: '700', color: C.text }}>{c.label}: </Text>
            {c.metadata.terminalNote}
          </Text>
        </View>
      ))}

      {!!onTapTerminal && (
        <Text style={{ fontSize: 9.5, color: C.textTert, marginTop: 6, textAlign: 'center' }}>
          Tap a terminal, then a second terminal, to run a conductor. Tap a wire to remove it.
        </Text>
      )}
    </View>
  );
}
