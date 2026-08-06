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
  RadialGradient, Stop,
} from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  buildMap, movePlayer, nearestStation, completeStation, emptyJobsiteProgress,
  isComplete, jobsitePercent, sanitizeProgress, STATIONS, ROOMS, SPAWN, Tile, TaskKind,
  pathBetween, distanceFeet, nextObjective, MAP_W, MAP_H,
} from '../core/game/jobsite';
import { dialogueFor, characterForStation } from '../core/game/cast';
import { fieldTaskForStation } from '../core/game/fieldTasks';
import {
  toIso, depthKey, sortByDepth, isoCamera, inView, Layer,
  facingFrom, joystickVector, screenToWorldVector,
} from '../core/game/iso';
import {
  PALETTE, Shadow, StudWall, FloorTile, Panel, JunctionBox, ConduitRun,
  Ladder, WireSpool, WorkBench, MaterialCart, TempLight, PrintTable,
  Electrician, ObjectivePin, DoneMarker,
} from './jobsiteArt';
import { portraitFor } from './castImages';
import WiringLabScreen from './WiringLabScreen';
import TroubleshootScreen from './TroubleshootScreen';
import FieldTaskScreen from './FieldTaskScreen';

const KEY = '@sc_jobsite_progress_v1';
const KEY_PAD = '@sc_jobsite_pad_v1';

const SPEED = 0.13;      // tiles per tick
const TICK = 45;         // ms
const VIEW_TILES_X = 11; // how much of the site is on screen
const PAD_SIZE = 150;    // footprint of the joystick, for drag clamping

// Set dressing. Positions are hand-placed against walls and in corners; none
// of them block a doorway or a station, and none of them affect collision —
// they are scenery, and the walkable grid is still the only source of truth.
const PROPS = [
  { id: 'p-panel',   kind: 'Panel',        x: 6.2,  y: 8.6,  props: { energized: true } },
  { id: 'p-panel2',  kind: 'Panel',        x: 19.2, y: 8.6 },
  { id: 'p-jb1',     kind: 'JunctionBox',  x: 4.2,  y: 2.6 },
  { id: 'p-jb2',     kind: 'JunctionBox',  x: 14.2, y: 2.6 },
  { id: 'p-jb3',     kind: 'JunctionBox',  x: 12.2, y: 8.6 },
  { id: 'p-cond1',   kind: 'ConduitRun',   x: 10.5, y: 6.1,  props: { length: 3 } },
  { id: 'p-cond2',   kind: 'ConduitRun',   x: 16.5, y: 12.1, props: { length: 4 } },
  { id: 'p-ladder',  kind: 'Ladder',       x: 9.5,  y: 12.4 },
  { id: 'p-ladder2', kind: 'Ladder',       x: 17.5, y: 6.4 },
  { id: 'p-spool',   kind: 'WireSpool',    x: 11.4, y: 12.5 },
  { id: 'p-spool2',  kind: 'WireSpool',    x: 21.6, y: 12.4 },
  { id: 'p-bench',   kind: 'WorkBench',    x: 3.6,  y: 12.4 },
  { id: 'p-cart',    kind: 'MaterialCart', x: 7.5,  y: 6.4 },
  { id: 'p-print',   kind: 'PrintTable',   x: 14.5, y: 6.4 },
  { id: 'p-light1',  kind: 'TempLight',    x: 12.5, y: 6.5 },
  { id: 'p-light2',  kind: 'TempLight',    x: 5.5,  y: 12.5 },
  { id: 'p-light3',  kind: 'TempLight',    x: 20.5, y: 6.5 },
];

const PROP_ART = { Panel, JunctionBox, ConduitRun, Ladder, WireSpool, WorkBench, MaterialCart, TempLight, PrintTable };

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
  const [facing, setFacing] = useState('S');
  const [moving, setMoving] = useState(false);
  // Left-handed players get the stick on the right. Persisted, because
  // handedness is a property of the person, not the session.
  const [stickSide, setStickSide] = useState('left');
  useEffect(() => {
    AsyncStorage.getItem(KEY_PAD).then((v) => { if (v === 'left' || v === 'right') setStickSide(v); }).catch(() => {});
  }, []);
  const swapStickSide = useCallback(() => {
    setStickSide((s) => {
      const next = s === 'left' ? 'right' : 'left';
      AsyncStorage.setItem(KEY_PAD, next).catch(() => {});
      return next;
    });
  }, []);

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
      if (!d.x && !d.y) { setMoving(false); return; }
      setMoving(true);
      setFacing(facingFrom(d.x, d.y) ?? 'S');
      // The joystick already returns a unit-ish vector scaled by how far it is
      // pushed, so speed comes from the stick and no diagonal normalisation is
      // needed — pushing diagonally is not a free speed boost.
      setPos((p) => movePlayer(grid, p, d.x * SPEED, d.y * SPEED));
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
      <WorldView C={C} grid={grid} pos={pos} progress={progress} near={near} route={route} facing={facing} moving={moving} />

      {/* ── HUD ── Task list top-left, XP top-centre, message bar low. Laid
             out to match the reference: information at the edges, the site
             itself uninterrupted in the middle. */}
      <View pointerEvents="box-none" style={{ position: 'absolute', top: 12, left: 12, right: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <TouchableOpacity onPress={() => setTab && setTab('home')} activeOpacity={0.8}
            accessibilityRole="button" accessibilityLabel="Leave the job site"
            style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(12,16,20,0.86)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="chevron-back" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={{ backgroundColor: 'rgba(12,16,20,0.86)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff', letterSpacing: 0.3 }}>COMMERCIAL ROUGH-IN</Text>
            <Text style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.6)' }}>Day One · {STATIONS.length} stations</Text>
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

      {/* Movement stick, lower-left by default; the interact button sits
          opposite it so thumbs never collide. */}
      <Joystick C={C} dir={dir} side={stickSide} onSwapSide={swapStickSide} />

      {/* Interact — only when there is actually something to interact with */}
      {near && !toast && (
        <TouchableOpacity
          onPress={() => startStation(near)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`${isComplete(progress, near.id) ? 'Redo' : 'Start'} ${near.label}`}
          style={{
            position: 'absolute',
            [stickSide === 'right' ? 'left' : 'right']: 26,
            bottom: 96 + 18,
            width: 86, height: 86, borderRadius: 43,
            backgroundColor: isComplete(progress, near.id) ? 'rgba(22,163,74,0.92)' : 'rgba(244,161,29,0.95)',
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)',
          }}>
          <Ionicons name={near.icon ?? 'hammer'} size={26} color="#1A1408" />
          <Text style={{ fontSize: 9.5, fontWeight: '900', color: '#1A1408', letterSpacing: 0.6, marginTop: 2 }}>
            {isComplete(progress, near.id) ? 'REDO' : 'START'}
          </Text>
        </TouchableOpacity>
      )}
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

function WorldView({ C, grid, pos, progress, near, route, facing, moving }) {
  const { width: W, height: H } = Dimensions.get('window');
  const cam = useMemo(() => isoCamera(pos, MAP_W, MAP_H, W, H, 1), [pos, W, H]);

  // Everything is collected into one list and painted back to front. There is
  // no z-buffer in SVG — depth order IS the occlusion, which is why the sort
  // lives in a tested module rather than in JSX ordering.
  const items = [];
  const push = (x, y, layer, node) => items.push({ depth: depthKey(x, y, layer), node });

  const insideRoom = (x, y) => ROOMS.some((r) => x > r.x && x < r.x + r.w - 1 && y > r.y && y < r.y + r.h - 1);

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (!inView(x, y, cam, W, H)) continue;   // an iso map is mostly off-screen
      if (grid[y][x] === Tile.WALL) {
        // A doorway is a wall tile with floor on both sides of the run; the
        // generator carves those, so a gap in the grid IS the opening.
        push(x, y, Layer.WALL, <StudWall key={`w${x},${y}`} x={x} y={y} />);
      } else {
        push(x, y, Layer.FLOOR, <FloorTile key={`f${x},${y}`} x={x} y={y} indoor={insideRoom(x, y)} />);
      }
    }
  }

  // Set dressing. Placed against walls and in corners so the site reads as
  // occupied rather than as an empty diagram.
  for (const p of PROPS) {
    if (!inView(Math.floor(p.x), Math.floor(p.y), cam, W, H)) continue;
    const Comp = PROP_ART[p.kind];
    if (Comp) push(p.x, p.y, Layer.PROP, <Comp key={p.id} x={p.x} y={p.y} {...(p.props || {})} />);
  }

  // The route, drawn on the floor so props and walls cover it correctly.
  if (route.length > 1) {
    const d = route.map((p, k) => {
      const q = toIso(p.x, p.y);
      return `${k ? 'L' : 'M'} ${q.x} ${q.y}`;
    }).join(' ');
    push(0, 0, Layer.DECAL, (
      <G key="route">
        <Path d={d} stroke="rgba(34,197,94,0.30)" strokeWidth={13} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <Path d={d} stroke="#22C55E" strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </G>
    ));
  }

  for (const s of STATIONS) {
    if (!inView(Math.floor(s.x), Math.floor(s.y), cam, W, H)) continue;
    const done = isComplete(progress, s.id);
    const who = characterForStation(s.id);
    const art = who ? portraitFor(who.id) : null;
    const b = toIso(s.x, s.y);
    push(s.x, s.y, Layer.ACTOR, (
      <G key={s.id}>
        <Shadow x={s.x} y={s.y} rx={13} ry={6.5} />
        {art && (
          <>
            <Circle cx={b.x} cy={b.y - 26} r={15} fill="#12161B" />
            <SvgImage x={b.x - 14} y={b.y - 40} width={28} height={28} href={art}
              preserveAspectRatio="xMidYMid slice" clipPath={`url(#clip-${s.id})`} />
            <Circle cx={b.x} cy={b.y - 26} r={14.5} fill="none"
              stroke={near?.id === s.id ? '#22C55E' : done ? '#16A34A' : (who?.accent ?? '#F4A11D')} strokeWidth={2.5} />
          </>
        )}
      </G>
    ));
    push(s.x, s.y, Layer.OVERHEAD, done
      ? <DoneMarker key={`m${s.id}`} x={s.x} y={s.y} />
      : <ObjectivePin key={`m${s.id}`} x={s.x} y={s.y} />);
  }

  push(pos.x, pos.y, Layer.ACTOR,
    <Electrician key="me" x={pos.x} y={pos.y} facing={facing} walking={moving} />);

  const ordered = sortByDepth(items);

  return (
    <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: PALETTE.ground }}>
      <Svg width={W} height={H}>
        <Defs>
          <RadialGradient id="worklight" cx="50%" cy="50%" r="55%">
            <Stop offset="0%" stopColor="#FFE9B0" stopOpacity="0.13" />
            <Stop offset="100%" stopColor="#000" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="vignette" cx="50%" cy="50%" r="72%">
            <Stop offset="60%" stopColor="#000" stopOpacity="0" />
            <Stop offset="100%" stopColor="#000" stopOpacity="0.55" />
          </RadialGradient>
          {STATIONS.map((s) => (
            <ClipPath key={`clip-${s.id}`} id={`clip-${s.id}`}>
              <Circle cx={toIso(s.x, s.y).x} cy={toIso(s.x, s.y).y - 26} r={14} />
            </ClipPath>
          ))}
        </Defs>

        <G transform={`translate(${cam.tx}, ${cam.ty})`}>
          {ordered.map((it) => it.node)}
        </G>

        {/* Work-light pool and edge vignette sell the "one light on a dark
            site" look far more cheaply than per-object lighting would. */}
        <Rect x={0} y={0} width={W} height={H} fill="url(#worklight)" pointerEvents="none" />
        <Rect x={0} y={0} width={W} height={H} fill="url(#vignette)" pointerEvents="none" />
      </Svg>
    </View>
  );
}

// ─── Controls ────────────────────────────────────────────────────────────────
// Press-and-hold, not tap-to-step: holding a direction is how walking feels.
// Big targets — this gets used with gloves on.

/**
 * Drag joystick. Replaces the four-button pad, which had a real bug: its up
 * and down arrows were positioned with only `top`/`bottom`, and in React
 * Native an absolutely-positioned child with no `left` defaults to the left
 * edge — both vertical arrows sat on top of the left arrow. Vertical movement
 * was not broken logic, the buttons simply were not where they appeared.
 *
 * A stick also gives continuous speed and every direction for free, which a
 * four-button pad never can.
 */
function Joystick({ C, dir, side, onSwapSide }) {
  const { width: SW, height: SH } = Dimensions.get('window');
  const R = 56;              // stick travel radius
  const BASE = R * 2;

  const home = useMemo(() => ({
    x: side === 'right' ? SW - BASE - 26 : 26,
    y: SH - BASE - 96,
  }), [side, SW, SH]);

  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => setActive(true),
    onPanResponderMove: (_e, g) => {
      const v = joystickVector(g.dx, g.dy, R);
      const len = Math.hypot(g.dx, g.dy) || 1;
      const clamped = Math.min(len, R);
      setKnob({ x: (g.dx / len) * clamped, y: (g.dy / len) * clamped });
      // Screen drag → world direction, so pushing up the screen walks "up" the
      // floor rather than diagonally across it.
      const w = screenToWorldVector(v.x, v.y);
      dir.current = { x: w.x * v.magnitude, y: w.y * v.magnitude };
    },
    onPanResponderRelease: () => { setActive(false); setKnob({ x: 0, y: 0 }); dir.current = { x: 0, y: 0 }; },
    onPanResponderTerminate: () => { setActive(false); setKnob({ x: 0, y: 0 }); dir.current = { x: 0, y: 0 }; },
  }), [dir, R]);

  return (
    <View style={{ position: 'absolute', left: home.x, top: home.y, alignItems: 'center' }}>
      <View
        {...pan.panHandlers}
        accessibilityRole="adjustable"
        accessibilityLabel="Movement stick. Drag to walk in any direction."
        style={{
          width: BASE, height: BASE, borderRadius: R,
          backgroundColor: 'rgba(12,16,20,0.62)',
          borderWidth: 1.5, borderColor: active ? 'rgba(34,197,94,0.55)' : 'rgba(255,255,255,0.14)',
          alignItems: 'center', justifyContent: 'center',
        }}>
        {/* Direction ticks — they say "this is a stick" without stealing taps */}
        {[['chevron-up', { top: 6 }], ['chevron-down', { bottom: 6 }],
          ['chevron-back', { left: 6 }], ['chevron-forward', { right: 6 }]].map(([icon, pos]) => (
          <View key={icon} pointerEvents="none" style={{ position: 'absolute', ...pos }}>
            <Ionicons name={icon} size={15} color="rgba(255,255,255,0.3)" />
          </View>
        ))}
        <View pointerEvents="none" style={{
          width: R * 0.92, height: R * 0.92, borderRadius: R * 0.46,
          transform: [{ translateX: knob.x }, { translateY: knob.y }],
          backgroundColor: active ? 'rgba(34,197,94,0.85)' : 'rgba(255,255,255,0.16)',
          borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.28)',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Ionicons name="move" size={16} color="rgba(255,255,255,0.8)" />
        </View>
      </View>
      <TouchableOpacity onPress={onSwapSide} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
        accessibilityRole="button" accessibilityLabel="Move the stick to the other side of the screen">
        <Text style={{ fontSize: 9, fontWeight: '800', letterSpacing: 1.1, color: 'rgba(255,255,255,0.45)', marginTop: 7 }}>
          SWAP SIDE
        </Text>
      </TouchableOpacity>
    </View>
  );
}
