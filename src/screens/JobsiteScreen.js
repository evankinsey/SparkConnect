// ─── JOBSITE WORLD ───────────────────────────────────────────────────────────
// Walk the site, stand next to a task, do the task. The world is a wrapper, not
// a second copy of anything: the Wiring Simulator, Troubleshooting, the bender
// and Job Cam are the same screens the rest of the app uses, opened straight
// into the right job.
//
// All world rules — collision, proximity, XP — live in src/core/game/jobsite.js
// and are tested there. This file renders and reads the d-pad.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Dimensions, Vibration, Platform, Image, PanResponder, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Rect, Circle, G, Path, Image as SvgImage, ClipPath, Defs } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  buildMap, movePlayer, nearestStation, completeStation, emptyJobsiteProgress,
  isComplete, jobsitePercent, sanitizeProgress, STATIONS, ROOMS, SPAWN, Tile, TaskKind,
} from '../core/game/jobsite';
import { dialogueFor, characterForStation } from '../core/game/cast';
import { fieldTaskForStation } from '../core/game/fieldTasks';
import { portraitFor } from './castImages';
import WiringLabScreen from './WiringLabScreen';
import TroubleshootScreen from './TroubleshootScreen';
import FieldTaskScreen from './FieldTaskScreen';

const KEY = '@sc_jobsite_progress_v1';
const KEY_PAD = '@sc_jobsite_pad_v1';

const SPEED = 0.13;      // tiles per tick
const TICK = 45;         // ms
const VIEW_TILES_X = 11; // how much of the site is on screen
const PAD_SIZE = 190;    // footprint of the d-pad cluster, for drag clamping

const SITE = {
  dirt: '#8B7355', dirtAlt: '#96805F',
  floor: '#E8E2D6', floorAlt: '#E2DACB',
  wall: '#4B5563', wallTop: '#6B7280',
};

export default function JobsiteScreen({ C, setTab, onStreakUpdate, pickImage, onPhotoTaken }) {
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
    solvedRef.current = false;
    setActive(st);
  }, []);

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
    // A graded number, or the Owner's photo. Both are checked before sign-off.
    const ft = active.payload?.fieldTaskId ?? fieldTaskForStation(active.id)?.id;
    if (ft) {
      return (
        <FieldTaskScreen
          C={C}
          taskId={ft}
          pickImage={pickImage}
          onPhotoTaken={onPhotoTaken}
          onOpenTool={(tab) => setTab(tab)}
          onSolved={() => { solvedRef.current = true; onStreakUpdate && onStreakUpdate(); }}
          onClose={() => finish(active, solvedRef.current)}
        />
      );
    }
  }

  const done = progress.completed.length;

  // The site fills the screen and the HUD floats on top of it. A game in a
  // box with a status bar above and a control pad below is a widget; a game
  // you are standing inside is the thing that was asked for.
  return (
    <View style={{ flex: 1, backgroundColor: SITE.dirt }}>
      <WorldView C={C} grid={grid} pos={pos} progress={progress} near={near} />

      {/* HUD — floats over the world, never steals a tap from it */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 10, left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ backgroundColor: 'rgba(17,24,39,0.72)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7 }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff' }}>Job Site</Text>
          <Text style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.75)' }}>
            {done} of {STATIONS.length} signed off · {jobsitePercent(progress)}%
          </Text>
        </View>
        <View style={{ flex: 1 }} />
        <View style={{ backgroundColor: 'rgba(244,161,29,0.92)', borderRadius: 12, paddingHorizontal: 11, paddingVertical: 8 }}>
          <Text style={{ fontSize: 12.5, fontWeight: '800', color: '#fff' }}>{progress.xp} XP</Text>
        </View>
      </View>

      {/* Brief / sign-off, docked above the controls */}
      <View style={{ position: 'absolute', left: 12, right: 12, bottom: PAD_SIZE + 18 }}>
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
          <View style={{ alignSelf: 'center', backgroundColor: 'rgba(17,24,39,0.66)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 }}>
            <Text style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.9)', textAlign: 'center' }}>
              Walk up to a room or the truck to pick up the job.
            </Text>
          </View>
        )}
      </View>

      {/* D-pad — drag it wherever your thumb actually is */}
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
  const { width: W, height: viewH } = Dimensions.get('window');
  // Tile size is driven by the narrow axis so the site reads the same on a
  // small phone and a tablet, then the camera shows as much as fits.
  const TS = W / VIEW_TILES_X;

  // Camera centres on the player, clamped so the site never floats in space.
  // When the map is smaller than the viewport on an axis, centre it instead.
  const mapW = grid[0].length * TS, mapH = grid.length * TS;
  const camX = mapW <= W ? (mapW - W) / 2 : Math.max(0, Math.min(pos.x * TS - W / 2, mapW - W));
  const camY = mapH <= viewH ? (mapH - viewH) / 2 : Math.max(0, Math.min(pos.y * TS - viewH / 2, mapH - viewH));

  return (
    <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: SITE.dirt }}>
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
  const { width: SW, height: SH } = Dimensions.get('window');
  const clamp = useCallback((p) => ({
    x: Math.max(8, Math.min(p.x, SW - PAD_SIZE - 8)),
    y: Math.max(8, Math.min(p.y, SH - PAD_SIZE - 8)),
  }), [SW, SH]);

  const [origin, setOrigin] = useState(() => clamp({ x: 16, y: SH - PAD_SIZE - 24 }));
  const [dragging, setDragging] = useState(false);
  // Where the pad was when this drag started. A ref because the responder
  // callbacks close over it and must not re-subscribe on every move.
  const start = useRef(origin);

  useEffect(() => {
    AsyncStorage.getItem(KEY_PAD)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw);
        if (typeof saved?.x === 'number' && typeof saved?.y === 'number') setOrigin(clamp(saved));
      })
      .catch(() => { /* an unreadable preference is just the default corner */ });
  }, [clamp]);

  // Drag by the handle only. If the whole cluster were draggable, every walk
  // input would fight the gesture recogniser.
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3,
    onPanResponderGrant: () => { start.current = origin; setDragging(true); },
    onPanResponderMove: (_e, g) => {
      setOrigin(clamp({ x: start.current.x + g.dx, y: start.current.y + g.dy }));
    },
    onPanResponderRelease: () => {
      setDragging(false);
      // Read through the setter so the persisted value is the settled one.
      setOrigin((p) => { AsyncStorage.setItem(KEY_PAD, JSON.stringify(p)).catch(() => {}); return p; });
    },
    onPanResponderTerminate: () => setDragging(false),
  }), [origin, clamp]);

  const set = (x, y) => () => { dir.current = { x, y }; };
  const stop = () => { dir.current = { x: 0, y: 0 }; };

  const Btn = ({ icon, x, y, label }) => (
    <TouchableOpacity
      onPressIn={set(x, y)}
      onPressOut={stop}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: 62, height: 62, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.92)',
        borderWidth: 1.5, borderColor: 'rgba(17,24,39,0.18)', alignItems: 'center', justifyContent: 'center',
      }}>
      <Ionicons name={icon} size={26} color="#374151" />
    </TouchableOpacity>
  );

  return (
    <View style={{ position: 'absolute', left: origin.x, top: origin.y, width: PAD_SIZE, height: PAD_SIZE, alignItems: 'center', opacity: dragging ? 0.75 : 1 }}>
      <Btn icon="chevron-up" x={0} y={-1} label="Walk up" />
      <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 2 }}>
        <Btn icon="chevron-back" x={-1} y={0} label="Walk left" />
        {/* Drag handle, dead centre — the one spot a d-pad has no button */}
        <View
          {...pan.panHandlers}
          accessibilityRole="adjustable"
          accessibilityLabel="Drag to move the walk controls"
          style={{ width: 62, height: 62, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: dragging ? 'rgba(37,99,235,0.9)' : 'rgba(17,24,39,0.35)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="move" size={15} color="#fff" />
          </View>
        </View>
        <Btn icon="chevron-forward" x={1} y={0} label="Walk right" />
      </View>
      <Btn icon="chevron-down" x={0} y={1} label="Walk down" />
    </View>
  );
}
