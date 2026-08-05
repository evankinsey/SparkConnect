// ─── JOBSITE WORLD ───────────────────────────────────────────────────────────
// Walk the site, stand next to a task, do the task. The world is a wrapper, not
// a second copy of anything: the Wiring Simulator, Troubleshooting, the bender
// and Job Cam are the same screens the rest of the app uses, opened straight
// into the right job.
//
// All world rules — collision, proximity, XP — live in src/core/game/jobsite.js
// and are tested there. This file renders and reads the d-pad.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Dimensions, Vibration, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Rect, Circle, G, Path, Line } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  buildMap, movePlayer, nearestStation, completeStation, emptyJobsiteProgress,
  isComplete, jobsitePercent, STATIONS, ROOMS, SPAWN, Tile, TaskKind,
} from '../core/game/jobsite';
import WiringLabScreen from './WiringLabScreen';
import TroubleshootScreen from './TroubleshootScreen';

const KEY = '@sc_jobsite_progress_v1';

const SPEED = 0.13;      // tiles per tick
const TICK = 45;         // ms
const VIEW_TILES_X = 11; // how much of the site is on screen

const SITE = {
  dirt: '#8B7355', dirtAlt: '#96805F',
  floor: '#E8E2D6', floorAlt: '#E2DACB',
  wall: '#4B5563', wallTop: '#6B7280',
};

export default function JobsiteScreen({ C, setTab, onStreakUpdate }) {
  const grid = useMemo(() => buildMap(), []);
  const [pos, setPos] = useState({ ...SPAWN });
  const [progress, setProgress] = useState(emptyJobsiteProgress());
  const [active, setActive] = useState(null);   // station being played
  const [toast, setToast] = useState(null);
  const dir = useRef({ x: 0, y: 0 });
  const posRef = useRef(pos);
  posRef.current = pos;

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => { if (raw) setProgress(JSON.parse(raw)); })
      .catch(() => { /* a missing save is just a fresh site */ });
  }, []);

  const persist = useCallback((next) => {
    setProgress(next);
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  // Walk loop. One interval for the whole world; direction is a ref so holding
  // a d-pad button does not re-render 22 times a second.
  useEffect(() => {
    if (active) return undefined;   // the world pauses while a task is open
    const id = setInterval(() => {
      const d = dir.current;
      if (!d.x && !d.y) return;
      const norm = d.x && d.y ? 0.7071 : 1;  // no free speed on the diagonal
      setPos((p) => movePlayer(grid, p, d.x * SPEED * norm, d.y * SPEED * norm));
    }, TICK);
    return () => clearInterval(id);
  }, [grid, active]);

  const near = useMemo(() => nearestStation(pos), [pos]);

  const finish = useCallback((station) => {
    const already = isComplete(progress, station.id);
    persist(completeStation(progress, station.id));
    setActive(null);
    if (!already) {
      setToast(`${station.label} signed off · +${station.xp} XP`);
      try { if (Platform.OS !== 'web') Vibration.vibrate(30); } catch (e) { /* ignore */ }
      setTimeout(() => setToast(null), 2600);
    }
  }, [progress, persist]);

  /**
   * Start a job. The bench and the truck hand off to tools that own their own
   * tab, so they are dispatched here rather than through `active` — setting
   * state during a render to navigate is how you get an infinite loop.
   */
  const startStation = useCallback((s) => {
    if (s.task === TaskKind.BEND || s.task === TaskKind.JOBCAM) {
      persist(completeStation(progress, s.id));
      setTab(s.task === TaskKind.BEND ? 'bend' : 'jobcam');
      return;
    }
    setActive(s);
  }, [progress, persist, setTab]);

  // ── A task is open: hand the whole screen to the real tool ──
  if (active) {
    if (active.task === TaskKind.WIRING) {
      return (
        <WiringLabScreen
          C={C}
          initialLessonId={active.payload.lessonId}
          onStreakUpdate={onStreakUpdate}
          onSolved={() => { /* sign-off happens when they leave the room */ }}
          onClose={() => finish(active)}
        />
      );
    }
    if (active.task === TaskKind.TROUBLESHOOT) {
      return (
        <TroubleshootScreen
          C={C}
          onStreakUpdate={onStreakUpdate}
          onClose={() => finish(active)}
        />
      );
    }
  }

  const done = progress.completed.length;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Status strip */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: C.text }}>Job Site</Text>
          <Text style={{ fontSize: 11, color: C.textTert }}>
            {done} of {STATIONS.length} tasks signed off · {jobsitePercent(progress)}%
          </Text>
        </View>
        <View style={{ backgroundColor: C.amberBg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: C.amber }}>{progress.xp} XP</Text>
        </View>
      </View>

      <WorldView C={C} grid={grid} pos={pos} progress={progress} near={near} />

      {/* Prompt / hint line */}
      <View style={{ paddingHorizontal: 16, minHeight: 92, justifyContent: 'center' }}>
        {toast ? (
          <View style={{ backgroundColor: C.successBg, borderRadius: 12, padding: 12, borderLeftWidth: 4, borderLeftColor: C.success }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: C.success }}>{toast}</Text>
          </View>
        ) : near ? (
          <TouchableOpacity
            onPress={() => startStation(near)}
            activeOpacity={0.88}
            style={{ backgroundColor: C.surface, borderRadius: 14, padding: 13, borderWidth: 1.5, borderColor: C.blue, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 11, backgroundColor: C.blueSub, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={near.icon} size={20} color={C.blue} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13.5, fontWeight: '800', color: C.text }}>
                {near.label}{isComplete(progress, near.id) ? '  ✓' : ''}
              </Text>
              <Text style={{ fontSize: 11.5, color: C.textSec, lineHeight: 16 }}>{near.brief}</Text>
            </View>
            <View style={{ backgroundColor: C.blue, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 8 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>
                {isComplete(progress, near.id) ? 'Redo' : 'Start'}
              </Text>
            </View>
          </TouchableOpacity>
        ) : (
          <Text style={{ fontSize: 12, color: C.textTert, textAlign: 'center', lineHeight: 18 }}>
            Walk up to a room or the truck to pick up the job.
          </Text>
        )}
      </View>

      {/* D-pad */}
      <DPad C={C} dir={dir} />
    </View>
  );
}

// ─── The world ───────────────────────────────────────────────────────────────

function WorldView({ C, grid, pos, progress, near }) {
  const W = Dimensions.get('window').width - 32;
  const TS = W / VIEW_TILES_X;                 // tile size in px
  const viewH = Math.round(TS * 7.6);

  // Camera centres on the player, clamped so the site never floats in space.
  const camX = Math.max(0, Math.min(pos.x * TS - W / 2, grid[0].length * TS - W));
  const camY = Math.max(0, Math.min(pos.y * TS - viewH / 2, grid.length * TS - viewH));

  return (
    <View style={{ marginHorizontal: 16, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: C.border, backgroundColor: SITE.dirt }}>
      <Svg width={W} height={viewH}>
        <G transform={`translate(${-camX}, ${-camY})`}>
          {/* Ground */}
          {grid.map((row, y) => row.map((t, x) => {
            const checker = (x + y) % 2 === 0;
            const fill = t === Tile.WALL ? SITE.wall : (checker ? SITE.dirt : SITE.dirtAlt);
            return <Rect key={`${x},${y}`} x={x * TS} y={y * TS} width={TS + 0.5} height={TS + 0.5} fill={fill} />;
          }))}

          {/* Room floors, laid over the dirt so inside reads as inside */}
          {ROOMS.map((r) => (
            <Rect key={r.id}
              x={(r.x + 1) * TS} y={(r.y + 1) * TS}
              width={(r.w - 2) * TS} height={(r.h - 2) * TS}
              fill={SITE.floor} />
          ))}

          {/* Wall tops — a lighter cap so walls read as 3D, not as holes */}
          {grid.map((row, y) => row.map((t, x) => (
            t === Tile.WALL
              ? <Rect key={`c${x},${y}`} x={x * TS} y={y * TS} width={TS + 0.5} height={TS * 0.3} fill={SITE.wallTop} />
              : null
          )))}

          {/* Stations */}
          {STATIONS.map((s) => {
            const cdone = isComplete(progress, s.id);
            const isNear = near?.id === s.id;
            const cx = s.x * TS, cy = s.y * TS;
            return (
              <G key={s.id}>
                {isNear && <Circle cx={cx} cy={cy} r={TS * 0.62} fill="none" stroke="#2563EB" strokeWidth={3} />}
                <Circle cx={cx} cy={cy} r={TS * 0.4} fill={cdone ? '#16A34A' : '#F4A11D'} stroke="#1F2937" strokeWidth={1.5} />
                {cdone
                  ? <Path d={`M ${cx - TS * 0.16} ${cy} l ${TS * 0.12} ${TS * 0.13} l ${TS * 0.22} ${-TS * 0.25}`}
                      stroke="#fff" strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  : <Path d={`M ${cx + TS * 0.06} ${cy - TS * 0.19} L ${cx - TS * 0.11} ${cy + TS * 0.02} L ${cx + TS * 0.01} ${cy + TS * 0.02} L ${cx - TS * 0.04} ${cy + TS * 0.2} L ${cx + TS * 0.13} ${cy - TS * 0.03} L ${cx + TS * 0.01} ${cy - TS * 0.03} Z`}
                      fill="#fff" />}
              </G>
            );
          })}

          {/* The electrician: hard hat, shirt, boots */}
          <G>
            <Circle cx={pos.x * TS} cy={pos.y * TS + TS * 0.36} r={TS * 0.2} fill="rgba(0,0,0,0.22)" />
            <Rect x={pos.x * TS - TS * 0.2} y={pos.y * TS - TS * 0.06} width={TS * 0.4} height={TS * 0.42} rx={TS * 0.09} fill="#1D4ED8" />
            <Circle cx={pos.x * TS} cy={pos.y * TS - TS * 0.16} r={TS * 0.16} fill="#F2C79B" />
            <Path d={`M ${pos.x * TS - TS * 0.22} ${pos.y * TS - TS * 0.2} a ${TS * 0.22} ${TS * 0.22} 0 0 1 ${TS * 0.44} 0 Z`} fill="#F4A11D" />
            <Rect x={pos.x * TS - TS * 0.26} y={pos.y * TS - TS * 0.22} width={TS * 0.52} height={TS * 0.06} rx={TS * 0.03} fill="#F4A11D" />
          </G>
        </G>
      </Svg>
    </View>
  );
}

// ─── Controls ────────────────────────────────────────────────────────────────
// Press-and-hold, not tap-to-step: holding a direction is how walking feels.
// Big targets — this gets used with gloves on.

function DPad({ C, dir }) {
  const set = (x, y) => () => { dir.current = { x, y }; };
  const stop = () => { dir.current = { x: 0, y: 0 }; };

  const Btn = ({ icon, x, y, style }) => (
    <TouchableOpacity
      onPressIn={set(x, y)}
      onPressOut={stop}
      activeOpacity={0.7}
      style={[{
        width: 62, height: 62, borderRadius: 16, backgroundColor: C.surface,
        borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center',
      }, style]}>
      <Ionicons name={icon} size={26} color={C.textSec} />
    </TouchableOpacity>
  );

  return (
    <View style={{ alignItems: 'center', paddingBottom: 14 }}>
      <Btn icon="chevron-up" x={0} y={-1} />
      <View style={{ flexDirection: 'row', gap: 62, marginVertical: 6 }}>
        <Btn icon="chevron-back" x={-1} y={0} />
        <Btn icon="chevron-forward" x={1} y={0} />
      </View>
      <Btn icon="chevron-down" x={0} y={1} />
    </View>
  );
}
