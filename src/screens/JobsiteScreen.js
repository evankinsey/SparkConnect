// ─── JOBSITE WORLD ───────────────────────────────────────────────────────────
// Walk the site, stand next to a task, do the task. The world is a wrapper, not
// a second copy of anything: the Wiring Simulator, Troubleshooting, the bender
// and Job Cam are the same screens the rest of the app uses, opened straight
// into the right job.
//
// All world rules — collision, proximity, XP — live in src/core/game/jobsite.js
// and are tested there. This file renders and reads the d-pad.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Dimensions, Vibration, Platform, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Rect, Circle, G, Path, Image as SvgImage, ClipPath, Defs } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  buildMap, movePlayer, nearestStation, completeStation, emptyJobsiteProgress,
  isComplete, jobsitePercent, sanitizeProgress, STATIONS, ROOMS, SPAWN, Tile, TaskKind,
} from '../core/game/jobsite';
import { dialogueFor, characterForStation } from '../core/game/cast';
import { portraitFor } from './castImages';
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
  // Set by the task screen when the circuit actually validates / the fault is
  // actually found. A ref, not state: it is written from a child callback and
  // read on close, and it must not schedule a render in between.
  const solvedRef = useRef(false);
  const dir = useRef({ x: 0, y: 0 });

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => { if (raw) setProgress(sanitizeProgress(JSON.parse(raw))); })
      .catch(() => { /* a missing or unreadable save is just a fresh site */ });
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

  /** Leave a task. `solved` false means they walked out without finishing —
   *  no sign-off, no XP. Signing off work that was not done is the one thing
   *  that would make the whole mode meaningless. */
  const finish = useCallback((station, solved) => {
    setActive(null);
    if (!solved) return;
    const already = isComplete(progress, station.id);
    persist(completeStation(progress, station.id));
    if (!already) {
      const who = characterForStation(station.id);
      const line = dialogueFor(station.id);
      setToast({ who, text: line?.done, xp: station.xp });
      try { if (Platform.OS !== 'web') Vibration.vibrate(30); } catch (e) { /* ignore */ }
      setTimeout(() => setToast(null), 3400);
    }
  }, [progress, persist]);

  /**
   * Start a job. The bench and the truck hand off to tools that own their own
   * tab, so they are dispatched here rather than through `active` — setting
   * state during a render to navigate is how you get an infinite loop. They
   * sign off on the hand-off because the real work (bending a pipe, taking a
   * photo) happens in a tool with no pass/fail for us to read; between them
   * that is 70 of the 570 XP on the site, and every graded task still has to
   * actually be solved.
   */
  const startStation = useCallback((st) => {
    if (st.task === TaskKind.BEND || st.task === TaskKind.JOBCAM) {
      const already = isComplete(progress, st.id);
      persist(completeStation(progress, st.id));
      if (!already) {
        const line = dialogueFor(st.id);
        setToast({ who: characterForStation(st.id), text: line?.done, xp: st.xp });
        setTimeout(() => setToast(null), 3400);
      }
      setTab(st.task === TaskKind.BEND ? 'bend' : 'jobcam');
      return;
    }
    solvedRef.current = false;
    setActive(st);
  }, [progress, persist, setTab]);

  // ── A task is open: hand the whole screen to the real tool ──
  if (active) {
    if (active.task === TaskKind.WIRING) {
      return (
        <WiringLabScreen
          C={C}
          initialLessonId={active.payload.lessonId}
          onStreakUpdate={onStreakUpdate}
          onSolved={() => { solvedRef.current = true; }}
          onClose={() => finish(active, solvedRef.current)}
        />
      );
    }
    if (active.task === TaskKind.TROUBLESHOOT) {
      return (
        <TroubleshootScreen
          C={C}
          onStreakUpdate={onStreakUpdate}
          onSolved={() => { solvedRef.current = true; }}
          onClose={() => finish(active, solvedRef.current)}
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
          <View style={{ backgroundColor: C.greenBg, borderRadius: 16, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: C.green }}>
            {toast.who && portraitFor(toast.who.id) && (
              <Image source={portraitFor(toast.who.id)}
                style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: C.green }} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: C.green }}>{toast.who?.name}</Text>
              <Text style={{ fontSize: 11.5, color: C.text, lineHeight: 16 }}>“{toast.text}”</Text>
            </View>
            <Text style={{ fontSize: 13, fontWeight: '800', color: C.green }}>+{toast.xp} XP</Text>
          </View>
        ) : near ? (
          <StationCard
            C={C}
            station={near}
            done={isComplete(progress, near.id)}
            onStart={() => startStation(near)}
          />
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

// ─── The brief ───────────────────────────────────────────────────────────────
// Who hands you the job matters more than the job description. Miguel teaching
// the four-way and Jerry refusing to sign it off until it works from every
// position are the same lesson in two voices, and the voice is the reason it
// lands.

function StationCard({ C, station, done, onStart }) {
  const who = characterForStation(station.id);
  const line = dialogueFor(station.id);
  const art = who ? portraitFor(who.id) : null;
  const accent = who?.accent ?? C.blue;

  return (
    <TouchableOpacity
      onPress={onStart}
      activeOpacity={0.88}
      style={{
        backgroundColor: C.surface, borderRadius: 16, padding: 13,
        borderWidth: 1.5, borderColor: done ? C.green : accent,
        flexDirection: 'row', alignItems: 'center', gap: 12,
      }}>
      {art && (
        <Image
          source={art}
          style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: accent }}
        />
      )}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: C.text }}>{who?.name}</Text>
          <Text style={{ fontSize: 10, color: C.textTert }}>{who?.role}</Text>
          {done && <Ionicons name="checkmark-circle" size={13} color={C.green} />}
        </View>
        <Text style={{ fontSize: 11.5, color: C.textSec, lineHeight: 16.5, marginTop: 2 }}>
          “{done ? line?.done : line?.brief}”
        </Text>
        <Text style={{ fontSize: 10, fontWeight: '700', color: accent, marginTop: 3 }}>
          {station.label} · +{station.xp} XP
        </Text>
      </View>
      <View style={{ backgroundColor: done ? C.green : accent, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 9 }}>
        <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>{done ? 'Redo' : 'Start'}</Text>
      </View>
    </TouchableOpacity>
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

          {/* Crew — each station is a person from the series, standing there */}
          <Defs>
            {STATIONS.map((s) => (
              <ClipPath key={`clip-${s.id}`} id={`clip-${s.id}`}>
                <Circle cx={s.x * TS} cy={s.y * TS} r={TS * 0.42} />
              </ClipPath>
            ))}
          </Defs>
          {STATIONS.map((s) => {
            const cdone = isComplete(progress, s.id);
            const isNear = near?.id === s.id;
            const who = characterForStation(s.id);
            const art = who ? portraitFor(who.id) : null;
            const cx = s.x * TS, cy = s.y * TS, r = TS * 0.42;
            return (
              <G key={s.id}>
                <Circle cx={cx} cy={cy + TS * 0.42} r={TS * 0.26} fill="rgba(0,0,0,0.22)" />
                {art && (
                  <SvgImage
                    x={cx - r} y={cy - r} width={r * 2} height={r * 2}
                    href={art} preserveAspectRatio="xMidYMid slice"
                    clipPath={`url(#clip-${s.id})`}
                  />
                )}
                <Circle
                  cx={cx} cy={cy} r={r} fill="none"
                  stroke={isNear ? '#2563EB' : cdone ? '#16A34A' : (who?.accent ?? '#F4A11D')}
                  strokeWidth={isNear ? 4 : 3}
                />
                {cdone && (
                  <G>
                    <Circle cx={cx + r * 0.72} cy={cy - r * 0.72} r={TS * 0.17} fill="#16A34A" stroke="#fff" strokeWidth={1.5} />
                    <Path
                      d={`M ${cx + r * 0.72 - TS * 0.07} ${cy - r * 0.72} l ${TS * 0.05} ${TS * 0.055} l ${TS * 0.095} ${-TS * 0.11}`}
                      stroke="#fff" strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </G>
                )}
              </G>
            );
          })}

          {/* You — in the crew uniform: black SparkConnect tee, amber hard hat */}
          <G>
            <Circle cx={pos.x * TS} cy={pos.y * TS + TS * 0.36} r={TS * 0.2} fill="rgba(0,0,0,0.22)" />
            <Rect x={pos.x * TS - TS * 0.2} y={pos.y * TS - TS * 0.06} width={TS * 0.4} height={TS * 0.42} rx={TS * 0.09} fill="#1A1A1F" />
            <Path d={`M ${pos.x * TS + TS * 0.04} ${pos.y * TS + TS * 0.02} L ${pos.x * TS - TS * 0.06} ${pos.y * TS + TS * 0.15} L ${pos.x * TS} ${pos.y * TS + TS * 0.15} L ${pos.x * TS - TS * 0.03} ${pos.y * TS + TS * 0.3} L ${pos.x * TS + TS * 0.08} ${pos.y * TS + TS * 0.14} L ${pos.x * TS + TS * 0.01} ${pos.y * TS + TS * 0.14} Z`} fill="#F4A11D" />
            <Circle cx={pos.x * TS} cy={pos.y * TS - TS * 0.16} r={TS * 0.16} fill="#C98C5A" />
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
