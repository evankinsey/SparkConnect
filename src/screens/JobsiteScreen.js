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
import Svg, {
  Rect, Circle, G, Path, Image as SvgImage, ClipPath, Defs,
  Text as SvgText, RadialGradient, LinearGradient, Stop,
} from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  buildMap, movePlayer, nearestStation, completeStation, emptyJobsiteProgress,
  isComplete, jobsitePercent, sanitizeProgress, STATIONS, ROOMS, SPAWN, Tile, TaskKind,
  pathBetween, distanceFeet, nextObjective,
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

// Night rough-in: bare concrete, steel stud framing, one work light. The
// reference art is dark and the old brown-dirt palette read as a board game.
const SITE = {
  ground: '#1C1F24', groundAlt: '#22262C',
  slab: '#2B3037', slabAlt: '#31363E',
  stud: '#8A9099', studShadow: '#4A5058', track: '#6E757E',
  routeGlow: 'rgba(34,197,94,0.28)', route: '#22C55E',
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
  // The objective and the walkable route to it. Recomputed on movement, which
  // is cheap: the map is 26x14 and the BFS is bounded by that.
  const objective = useMemo(() => nextObjective(pos, progress), [pos, progress]);
  const route = useMemo(
    () => (objective && !near ? pathBetween(grid, pos, objective) : []),
    [grid, pos, objective, near],
  );
  const routeFeet = objective ? distanceFeet(pos, objective) : 0;

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
      <WorldView C={C} grid={grid} pos={pos} progress={progress} near={near} route={route} routeFeet={routeFeet} />

      {/* ── HUD ── Task list top-left, XP top-centre, message bar low. Laid
             out to match the reference: information at the edges, the site
             itself uninterrupted in the middle. */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 12, left: 12, right: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <View style={{ backgroundColor: 'rgba(12,16,20,0.86)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff', letterSpacing: 0.3 }}>JOB SITE</Text>
            <Text style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.6)' }}>Rough-In · {STATIONS.length} stations</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: 'rgba(12,16,20,0.86)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
              <Text style={{ fontSize: 10.5, fontWeight: '700', color: 'rgba(255,255,255,0.75)' }}>XP {progress.xp}</Text>
              <Text style={{ fontSize: 10.5, fontWeight: '800', color: C.amber }}>{jobsitePercent(progress)}%</Text>
            </View>
            <View style={{ height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.14)', overflow: 'hidden' }}>
              <View style={{ width: `${jobsitePercent(progress)}%`, height: 5, backgroundColor: '#22C55E' }} />
            </View>
          </View>
        </View>

        {/* Punch list */}
        <View style={{ marginTop: 10, alignSelf: 'flex-start', maxWidth: '72%', backgroundColor: 'rgba(12,16,20,0.86)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
          <Text style={{ fontSize: 10.5, fontWeight: '800', color: '#22C55E', letterSpacing: 0.6, marginBottom: 7 }}>TASK LIST</Text>
          {STATIONS.slice(0, 5).map((st) => {
            const done = isComplete(progress, st.id);
            return (
              <View key={st.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                <Ionicons name={done ? 'checkbox' : 'square-outline'} size={13} color={done ? '#22C55E' : 'rgba(255,255,255,0.45)'} />
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 11.5, color: done ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.88)', textDecorationLine: done ? 'line-through' : 'none' }}>
                  {st.label}
                </Text>
              </View>
            );
          })}
          <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>
            {done} / {STATIONS.length} COMPLETE
          </Text>
        </View>
      </View>

      {/* Brief / sign-off / instruction bar */}
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
          <View style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: 'rgba(12,16,20,0.88)', borderRadius: 14, paddingHorizontal: 15, paddingVertical: 11, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
            <Ionicons name="hardware-chip-outline" size={15} color={C.amber} />
            <Text style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.9)' }}>
              {objective ? `Walk to ${objective.room} — ${objective.label}` : 'Every station is signed off. Nice work.'}
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

function WorldView({ C, grid, pos, progress, near, route, routeFeet }) {
  const { width: W, height: viewH } = Dimensions.get('window');
  const TS = W / VIEW_TILES_X;

  const mapW = grid[0].length * TS, mapH = grid.length * TS;
  const camX = mapW <= W ? (mapW - W) / 2 : Math.max(0, Math.min(pos.x * TS - W / 2, mapW - W));
  const camY = mapH <= viewH ? (mapH - viewH) / 2 : Math.max(0, Math.min(pos.y * TS - viewH / 2, mapH - viewH));

  // Walls are drawn as steel stud framing rather than solid blocks: a vertical
  // stud with a shadowed face and a top/bottom track. That single change is
  // most of why the site now reads as an unfinished building instead of a maze.
  const WALL_H = TS * 0.55;

  return (
    <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: SITE.ground }}>
      <Svg width={W} height={viewH}>
        <Defs>
          <RadialGradient id="worklight" cx="50%" cy="42%" r="62%">
            <Stop offset="0%" stopColor="#FFF3D6" stopOpacity="0.20" />
            <Stop offset="55%" stopColor="#FFE0A0" stopOpacity="0.06" />
            <Stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </RadialGradient>
          <LinearGradient id="studface" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={SITE.stud} />
            <Stop offset="100%" stopColor={SITE.studShadow} />
          </LinearGradient>
          {STATIONS.map((s) => (
            <ClipPath key={`clip-${s.id}`} id={`clip-${s.id}`}>
              <Circle cx={s.x * TS} cy={s.y * TS} r={TS * 0.42} />
            </ClipPath>
          ))}
        </Defs>

        <G transform={`translate(${-camX}, ${-camY})`}>
          {/* Slab */}
          {grid.map((row, y) => row.map((t, x) => (
            <Rect key={`g${x},${y}`} x={x * TS} y={y * TS} width={TS + 0.5} height={TS + 0.5}
              fill={(x + y) % 2 === 0 ? SITE.ground : SITE.groundAlt} />
          )))}

          {/* Poured floors inside the rooms, slightly lighter than the yard */}
          {ROOMS.map((r) => (
            <G key={r.id}>
              <Rect x={(r.x + 1) * TS} y={(r.y + 1) * TS}
                width={(r.w - 2) * TS} height={(r.h - 2) * TS} fill={SITE.slab} />
              {/* Control joints — cheap, and they sell "concrete" instantly */}
              {Array.from({ length: r.w - 2 }, (_, i) => (
                <Rect key={`j${i}`} x={(r.x + 1 + i) * TS} y={(r.y + 1) * TS}
                  width={1} height={(r.h - 2) * TS} fill={SITE.slabAlt} />
              ))}
            </G>
          ))}

          {/* Steel stud framing */}
          {grid.map((row, y) => row.map((t, x) => {
            if (t !== Tile.WALL) return null;
            const px = x * TS, py = y * TS;
            return (
              <G key={`w${x},${y}`}>
                {/* Cast shadow on the slab in front of the wall */}
                <Rect x={px} y={py + TS} width={TS + 0.5} height={TS * 0.22} fill="rgba(0,0,0,0.35)" />
                {/* Bottom track */}
                <Rect x={px} y={py + TS - WALL_H * 0.14} width={TS + 0.5} height={WALL_H * 0.14} fill={SITE.track} />
                {/* Studs — two per tile, on 16in-ish visual spacing */}
                {[0.26, 0.68].map((f, i) => (
                  <Rect key={i} x={px + TS * f} y={py + TS - WALL_H} width={TS * 0.15} height={WALL_H}
                    fill="url(#studface)" />
                ))}
                {/* Top track */}
                <Rect x={px} y={py + TS - WALL_H} width={TS + 0.5} height={WALL_H * 0.16} fill={SITE.track} />
              </G>
            );
          }))}

          {/* Work-light pool, centred on the player */}
          <Rect x={pos.x * TS - TS * 6} y={pos.y * TS - TS * 6} width={TS * 12} height={TS * 12} fill="url(#worklight)" />

          {/* The route to the next objective — a walkable path, not a straight
              line, so it never crosses a wall. */}
          {route.length > 1 && (
            <G>
              <Path d={route.map((p, i) => `${i ? 'L' : 'M'} ${p.x * TS} ${p.y * TS}`).join(' ')}
                stroke={SITE.routeGlow} strokeWidth={TS * 0.34} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <Path d={route.map((p, i) => `${i ? 'L' : 'M'} ${p.x * TS} ${p.y * TS}`).join(' ')}
                stroke={SITE.route} strokeWidth={TS * 0.11} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </G>
          )}

          {/* Crew */}
          {STATIONS.map((s) => {
            const cdone = isComplete(progress, s.id);
            const isNear = near?.id === s.id;
            const who = characterForStation(s.id);
            const art = who ? portraitFor(who.id) : null;
            const cx = s.x * TS, cy = s.y * TS, r = TS * 0.42;
            return (
              <G key={s.id}>
                <Circle cx={cx} cy={cy + TS * 0.44} r={TS * 0.28} fill="rgba(0,0,0,0.45)" />
                {art && (
                  <SvgImage x={cx - r} y={cy - r} width={r * 2} height={r * 2}
                    href={art} preserveAspectRatio="xMidYMid slice" clipPath={`url(#clip-${s.id})`} />
                )}
                <Circle cx={cx} cy={cy} r={r} fill="none"
                  stroke={isNear ? '#22C55E' : cdone ? '#16A34A' : (who?.accent ?? '#F4A11D')}
                  strokeWidth={isNear ? 4 : 3} />
                {/* Objective pin above an unfinished station */}
                {!cdone && (
                  <G>
                    <Circle cx={cx} cy={cy - r - TS * 0.34} r={TS * 0.17} fill="#F4A11D" />
                    <SvgText x={cx} y={cy - r - TS * 0.28} fill="#1A1408" fontSize={TS * 0.22} fontWeight="bold" textAnchor="middle">!</SvgText>
                  </G>
                )}
                {cdone && (
                  <G>
                    <Circle cx={cx + r * 0.72} cy={cy - r * 0.72} r={TS * 0.17} fill="#16A34A" stroke="#fff" strokeWidth={1.5} />
                    <Path d={`M ${cx + r * 0.72 - TS * 0.07} ${cy - r * 0.72} l ${TS * 0.05} ${TS * 0.055} l ${TS * 0.095} ${-TS * 0.11}`}
                      stroke="#fff" strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </G>
                )}
              </G>
            );
          })}

          {/* You — hi-vis vest, hard hat, seen from behind and above */}
          <G>
            <Circle cx={pos.x * TS} cy={pos.y * TS + TS * 0.38} r={TS * 0.24} fill="rgba(0,0,0,0.5)" />
            <Circle cx={pos.x * TS} cy={pos.y * TS} r={TS * 0.42} fill="none" stroke="#22C55E" strokeWidth={2.5} opacity={0.75} />
            <Rect x={pos.x * TS - TS * 0.21} y={pos.y * TS - TS * 0.04} width={TS * 0.42} height={TS * 0.44}
              rx={TS * 0.1} fill="#1A1A1F" />
            <Rect x={pos.x * TS - TS * 0.21} y={pos.y * TS + TS * 0.04} width={TS * 0.42} height={TS * 0.12} fill="#D7F205" opacity={0.9} />
            <Rect x={pos.x * TS - TS * 0.21} y={pos.y * TS + TS * 0.22} width={TS * 0.42} height={TS * 0.08} fill="#D7F205" opacity={0.9} />
            <Circle cx={pos.x * TS} cy={pos.y * TS - TS * 0.16} r={TS * 0.17} fill="#F4A11D" />
            <Rect x={pos.x * TS - TS * 0.24} y={pos.y * TS - TS * 0.2} width={TS * 0.48} height={TS * 0.07}
              rx={TS * 0.035} fill="#FFB93A" />
          </G>
        </G>

        {/* Distance badge, pinned to the top of the route */}
        {route.length > 1 && routeFeet > 0 && (
          <G>
            <Rect x={W / 2 - TS * 0.62} y={12} width={TS * 1.24} height={TS * 0.5} rx={TS * 0.12} fill="rgba(12,16,20,0.85)" />
            <SvgText x={W / 2} y={12 + TS * 0.35} fill="#22C55E" fontSize={TS * 0.28} fontWeight="bold" textAnchor="middle">
              {routeFeet} ft
            </SvgText>
          </G>
        )}
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

  // One round pad, like the reference: a dark disc with four arrows and a
  // draggable hub. Reads as a game control instead of four floating buttons.
  const R = 62;
  const Arrow = ({ icon, x, y, label, style }) => (
    <TouchableOpacity
      onPressIn={set(x, y)}
      onPressOut={stop}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[{ position: 'absolute', width: 46, height: 46, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Ionicons name={icon} size={24} color="rgba(255,255,255,0.92)" />
    </TouchableOpacity>
  );

  return (
    <View style={{ position: 'absolute', left: origin.x, top: origin.y, width: PAD_SIZE, height: PAD_SIZE, alignItems: 'center', opacity: dragging ? 0.7 : 1 }}>
      <View style={{
        width: R * 2.3, height: R * 2.3, borderRadius: R * 1.15,
        backgroundColor: 'rgba(12,16,20,0.78)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.14)',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Arrow icon="chevron-up"      x={0}  y={-1} label="Walk up"    style={{ top: 4 }} />
        <Arrow icon="chevron-down"    x={0}  y={1}  label="Walk down"  style={{ bottom: 4 }} />
        <Arrow icon="chevron-back"    x={-1} y={0}  label="Walk left"  style={{ left: 4 }} />
        <Arrow icon="chevron-forward" x={1}  y={0}  label="Walk right" style={{ right: 4 }} />
        {/* Draggable hub — dead centre, the one spot with no arrow, so moving
            the pad never fights a walk input. */}
        <View
          {...pan.panHandlers}
          accessibilityRole="adjustable"
          accessibilityLabel="Drag to reposition the walk controls"
          style={{
            width: R * 0.92, height: R * 0.92, borderRadius: R * 0.46,
            backgroundColor: dragging ? 'rgba(34,197,94,0.85)' : 'rgba(255,255,255,0.13)',
            borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)',
            alignItems: 'center', justifyContent: 'center',
          }}>
          <Ionicons name="move" size={16} color="rgba(255,255,255,0.75)" />
        </View>
      </View>
      <Text style={{ fontSize: 9.5, fontWeight: '800', letterSpacing: 1.2, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>
        DRAG TO MOVE
      </Text>
    </View>
  );
}
