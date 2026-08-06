// ─── JOBSITE ─────────────────────────────────────────────────────────────────
// A commercial rough-in you walk through, straight overhead.
//
// The camera is directly above and screen axes are world axes, so pushing the
// stick up walks the player up the screen. The previous isometric build looked
// deeper but fought its own controls, and a control scheme that argues with the
// camera is not something art can fix.
//
// Depth comes from drop shadows, wall thickness and daylight instead of from
// the projection. Walls are drawn as framing — two thin tracks with studs
// between them and open cavity in the gaps — because a filled rectangle is what
// made the last version read as shipping containers.
//
// All world rules (collision, proximity, pathfinding, XP) still live in
// src/core/game/jobsite.js and are tested there. This file renders and reads
// the stick.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, Dimensions, Vibration, Platform, Image,
  PanResponder, StyleSheet, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Rect, G, Path, Defs, RadialGradient, Stop } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  buildMap, movePlayer, nearestStation, completeStation, emptyJobsiteProgress,
  isComplete, jobsitePercent, sanitizeProgress, STATIONS, ROOMS, SPAWN, Tile, TaskKind,
  pathBetween, distanceFeet, nextObjective, MAP_W, MAP_H,
} from '../core/game/jobsite';
import { dialogueFor, characterForStation } from '../core/game/cast';
import { fieldTaskForStation } from '../core/game/fieldTasks';
import {
  TILE, toScreen, followCamera, tileVisible, stickToWorld, facing4, readStick,
  knobOffset, floatingOrigin,
} from '../core/game/topdown';
import {
  SKY, SlabTile, StudWall, BarJoist, Worker, ROLE_LOOK,
  Panelboard, JBox, EmtRun, AFrameLadder, WireReel, GangBox, MaterialCart,
  PrintTable, DrywallStack, SafetyCone, WorkTruck, Dumpster, SiteTrailer,
  Tree, Palm, FenceRun, Pallet, ObjectiveMarker, DoneMarker,
} from './topdownArt';
import { portraitFor } from './castImages';
import WiringLabScreen from './WiringLabScreen';
import TroubleshootScreen from './TroubleshootScreen';
import FieldTaskScreen from './FieldTaskScreen';

const KEY = '@sc_jobsite_progress_v1';
const KEY_SIDE = '@sc_jobsite_side_v1';

const SPEED = 0.075;    // tiles per tick
const TICK = 33;        // ~30fps
const STICK_R = 58;

/**
 * Exterior scenery, in the apron OUTSIDE the building footprint. The camera now
 * allows a margin past the map, and this is what fills what used to be a void.
 */
const EXTERIOR = [
  { k: 'trailer', x: -3.5, y: 2.5 },
  { k: 'truck', x: -3.2, y: 6.5 },
  { k: 'truck', x: -3.2, y: 8.8 },
  { k: 'dumpster', x: 28.5, y: 4.5 },
  { k: 'pallet', x: -2.6, y: 11.4 },
  { k: 'pallet', x: -1.6, y: 11.4 },
  { k: 'cone', x: -0.6, y: 6.5 }, { k: 'cone', x: -0.6, y: 7.5 },
  { k: 'tree', x: -4.5, y: 12.5 }, { k: 'tree', x: 29.5, y: 11.5 },
  { k: 'palm', x: 28.6, y: 1.4 }, { k: 'palm', x: -4.2, y: -1.2 },
  { k: 'palm', x: 13, y: -2.6 }, { k: 'palm', x: 20, y: -2.4 },
  { k: 'fenceH', x: -5, y: -2.2, len: 10 },
  { k: 'fenceH', x: 6, y: -2.2, len: 10 },
  { k: 'fenceH', x: 17, y: -2.2, len: 12 },
  { k: 'fenceH', x: -5, y: 15.4, len: 34 },
  { k: 'fenceV', x: -5.2, y: -2, len: 17 },
  { k: 'fenceV', x: 29.4, y: -2, len: 17 },
];

/** Interior set dressing. Scenery only — nothing here affects collision. */
const PROPS = [
  { k: 'panel', x: 6.5, y: 9.4 },
  { k: 'panel', x: 19.5, y: 9.4 },
  { k: 'gangbox', x: 12.5, y: 12.6 },
  { k: 'jbox', x: 4.6, y: 3.4 }, { k: 'jbox', x: 14.6, y: 3.4 },
  { k: 'jbox', x: 20.4, y: 3.4 }, { k: 'jbox', x: 12.4, y: 9.4 },
  { k: 'emtH', x: 10.2, y: 6.35, len: 4 },
  { k: 'emtH', x: 16.2, y: 12.35, len: 5 },
  { k: 'emtV', x: 8.35, y: 6.6, len: 3 },
  { k: 'ladder', x: 9.5, y: 12.5 }, { k: 'ladder', x: 17.5, y: 6.5 },
  { k: 'reel', x: 11.4, y: 12.5 }, { k: 'reel', x: 21.6, y: 12.5 },
  { k: 'cart', x: 7.5, y: 6.5 },
  { k: 'print', x: 14.5, y: 6.5 },
  { k: 'drywall', x: 22.5, y: 6.5 },
  { k: 'cone', x: 12.5, y: 7.4 },
];

const PROP_ART = {
  panel: Panelboard, jbox: JBox, ladder: AFrameLadder, reel: WireReel,
  gangbox: GangBox, cart: MaterialCart, print: PrintTable,
  drywall: DrywallStack, cone: SafetyCone, truck: WorkTruck,
  dumpster: Dumpster, trailer: SiteTrailer, tree: Tree, palm: Palm, pallet: Pallet,
};

/** The crew, as people rather than portrait bubbles. */
const CREW_LOOK = {
  michael: ROLE_LOOK.apprentice, jerry: ROLE_LOOK.foreman,
  miguel: ROLE_LOOK.journeyman, dante: ROLE_LOOK.apprentice,
  owner: ROLE_LOOK.owner, renee: ROLE_LOOK.gc,
};

export default function JobsiteScreen({ C, setTab, onStreakUpdate, pickImage, onPhotoTaken }) {
  const grid = useMemo(() => buildMap(), []);
  const [pos, setPos] = useState({ ...SPAWN });
  const [progress, setProgress] = useState(emptyJobsiteProgress());
  const [active, setActive] = useState(null);
  const [toast, setToast] = useState(null);
  const [facing, setFacing] = useState('down');
  const [step, setStep] = useState(0);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [side, setSide] = useState('left');
  const solvedRef = useRef(false);
  const dir = useRef({ x: 0, y: 0 });

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => { if (raw) setProgress(sanitizeProgress(JSON.parse(raw))); })
      .catch(() => {});
    AsyncStorage.getItem(KEY_SIDE)
      .then((v) => { if (v === 'left' || v === 'right') setSide(v); })
      .catch(() => {});
  }, []);

  const persist = useCallback((next) => {
    setProgress(next);
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const swapSide = useCallback(() => {
    setSide((s) => {
      const n = s === 'left' ? 'right' : 'left';
      AsyncStorage.setItem(KEY_SIDE, n).catch(() => {});
      return n;
    });
  }, []);

  // Walk loop. Direction is a ref so holding the stick does not re-render at
  // 30Hz; only the position does.
  useEffect(() => {
    if (active) return undefined;
    const id = setInterval(() => {
      const d = dir.current;
      if (!d.x && !d.y) return;
      const f = facing4(d.x, d.y);
      if (f) setFacing(f);
      setStep((s) => s + 0.42);
      setPos((p) => movePlayer(grid, p, d.x * SPEED, d.y * SPEED));
    }, TICK);
    return () => clearInterval(id);
  }, [grid, active]);

  const near = useMemo(() => nearestStation(pos), [pos]);
  const objective = useMemo(() => nextObjective(pos, progress), [pos, progress]);
  const route = useMemo(
    () => (objective && !near ? pathBetween(grid, pos, objective) : []),
    [grid, pos, objective, near],
  );

  const finish = useCallback((station, solved) => {
    setActive(null);
    if (!solved) return;
    const already = isComplete(progress, station.id);
    persist(completeStation(progress, station.id));
    if (!already) {
      const who = characterForStation(station.id);
      setToast({ who, text: dialogueFor(station.id)?.done, xp: station.xp });
      try { if (Platform.OS !== 'web') Vibration.vibrate(30); } catch (e) { /* ignore */ }
      setTimeout(() => setToast(null), 3400);
    }
  }, [progress, persist]);

  const startStation = useCallback((st) => { solvedRef.current = false; setActive(st); }, []);

  if (active) {
    if (active.task === TaskKind.WIRING) {
      return <WiringLabScreen C={C} initialLessonId={active.payload.lessonId} onStreakUpdate={onStreakUpdate}
        onSolved={() => { solvedRef.current = true; }} onClose={() => finish(active, solvedRef.current)} />;
    }
    if (active.task === TaskKind.TROUBLESHOOT) {
      return <TroubleshootScreen C={C} onStreakUpdate={onStreakUpdate}
        onSolved={() => { solvedRef.current = true; }} onClose={() => finish(active, solvedRef.current)} />;
    }
    const ft = active.payload?.fieldTaskId ?? fieldTaskForStation(active.id)?.id;
    if (ft) {
      return <FieldTaskScreen C={C} taskId={ft} pickImage={pickImage} onPhotoTaken={onPhotoTaken}
        onOpenTool={(t) => setTab(t)} onSolved={() => { solvedRef.current = true; onStreakUpdate && onStreakUpdate(); }}
        onClose={() => finish(active, solvedRef.current)} />;
    }
  }

  const done = progress.completed.length;
  const nearWho = near ? characterForStation(near.id) : null;

  return (
    <View style={{ flex: 1, backgroundColor: SKY.dirt }}>
      <World grid={grid} pos={pos} progress={progress} near={near} route={route}
        facing={facing} step={step} />

      {/* ── HUD: back, title, XP, tasks. Nothing else permanent. ── */}
      <View pointerEvents="box-none" style={{ position: 'absolute', top: 14, left: 12, right: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity onPress={() => setTab && setTab('home')} activeOpacity={0.8}
            accessibilityRole="button" accessibilityLabel="Leave the job site" style={hudBtn}>
            <Ionicons name="chevron-back" size={19} color="#fff" />
          </TouchableOpacity>

          <View style={[hudCard, { flex: 1 }]}>
            <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#fff', letterSpacing: 0.3 }}>
              COMMERCIAL ROUGH-IN
            </Text>
            <View style={{ height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', marginTop: 4, overflow: 'hidden' }}>
              <View style={{ width: `${jobsitePercent(progress)}%`, height: 4, backgroundColor: SKY.green }} />
            </View>
          </View>

          <TouchableOpacity onPress={() => setTasksOpen((v) => !v)} activeOpacity={0.8}
            accessibilityRole="button" accessibilityLabel={`Task list, ${done} of ${STATIONS.length} complete`}
            style={[hudCard, { flexDirection: 'row', alignItems: 'center', gap: 5 }]}>
            <Ionicons name="list" size={14} color={SKY.green} />
            <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#fff' }}>{done}/{STATIONS.length}</Text>
          </TouchableOpacity>
        </View>

        {tasksOpen && (
          <View style={[hudCard, { marginTop: 8, padding: 12 }]}>
            <ScrollView style={{ maxHeight: 210 }}>
              {STATIONS.map((st) => {
                const d = isComplete(progress, st.id);
                return (
                  <View key={st.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                    <Ionicons name={d ? 'checkbox' : 'square-outline'} size={15} color={d ? SKY.green : 'rgba(255,255,255,0.45)'} />
                    <Text numberOfLines={1} style={{ flex: 1, fontSize: 12, color: d ? 'rgba(255,255,255,0.42)' : '#fff', textDecorationLine: d ? 'line-through' : 'none' }}>
                      {st.label}
                    </Text>
                    <Text style={{ fontSize: 10.5, color: SKY.amber, fontWeight: '700' }}>{st.xp}</Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        )}
      </View>

      {/* ── Instruction / sign-off, clear of the controls ── */}
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 14, right: 14, bottom: 205 }}>
        {toast ? (
          <View style={{ backgroundColor: 'rgba(16,24,20,0.93)', borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1.5, borderColor: SKY.green }}>
            {toast.who && portraitFor(toast.who.id) && (
              <Image source={portraitFor(toast.who.id)} style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: SKY.green }} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11.5, fontWeight: '800', color: SKY.green }}>{toast.who?.name}</Text>
              <Text style={{ fontSize: 11.5, color: '#fff', lineHeight: 16 }}>“{toast.text}”</Text>
            </View>
            <Text style={{ fontSize: 12.5, fontWeight: '800', color: SKY.green }}>+{toast.xp}</Text>
          </View>
        ) : near ? (
          <View style={{ backgroundColor: 'rgba(14,18,22,0.92)', borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1.5, borderColor: SKY.amber }}>
            {nearWho && portraitFor(nearWho.id) && (
              <Image source={portraitFor(nearWho.id)}
                style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: SKY.amber }} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11.5, fontWeight: '800', color: SKY.amber }}>
                {nearWho?.name} · {near.label}
              </Text>
              <Text numberOfLines={2} style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.86)', lineHeight: 16 }}>
                “{isComplete(progress, near.id) ? dialogueFor(near.id)?.done : dialogueFor(near.id)?.brief}”
              </Text>
            </View>
          </View>
        ) : objective ? (
          <View style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(14,18,22,0.88)', borderRadius: 13, paddingHorizontal: 14, paddingVertical: 10 }}>
            <Ionicons name="navigate" size={14} color={SKY.green} />
            <Text style={{ fontSize: 12, color: '#fff' }}>
              {objective.room} · {distanceFeet(pos, objective)} ft
            </Text>
          </View>
        ) : (
          <View style={{ alignSelf: 'center', backgroundColor: 'rgba(14,18,22,0.88)', borderRadius: 13, paddingHorizontal: 14, paddingVertical: 10 }}>
            <Text style={{ fontSize: 12, color: '#fff' }}>Every station signed off. Nice work.</Text>
          </View>
        )}
      </View>

      <Stick dir={dir} side={side} onSwap={swapSide} />

      {/* Interact — opposite the stick, above the home indicator */}
      {near && !toast && (
        <TouchableOpacity onPress={() => startStation(near)} activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`${isComplete(progress, near.id) ? 'Redo' : 'Start'} ${near.label}`}
          style={{
            position: 'absolute', bottom: 58,
            [side === 'left' ? 'right' : 'left']: 26,
            width: 92, height: 92, borderRadius: 46,
            backgroundColor: isComplete(progress, near.id) ? SKY.green : SKY.amber,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 3, borderColor: 'rgba(255,255,255,0.4)',
            shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 8,
          }}>
          <Ionicons name={near.icon ?? 'hammer'} size={28} color="#1A1408" />
          <Text style={{ fontSize: 10, fontWeight: '900', color: '#1A1408', letterSpacing: 0.5, marginTop: 1 }}>
            {isComplete(progress, near.id) ? 'REDO' : 'START'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const hudCard = {
  backgroundColor: 'rgba(14,18,22,0.86)', borderRadius: 11,
  paddingHorizontal: 11, paddingVertical: 8,
  borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
};
const hudBtn = {
  ...hudCard, width: 38, height: 38, alignItems: 'center', justifyContent: 'center',
  paddingHorizontal: 0, paddingVertical: 0,
};

// ─── World ───────────────────────────────────────────────────────────────────

function World({ grid, pos, progress, near, route, facing, step }) {
  const { width: W, height: H } = Dimensions.get('window');
  const cam = useMemo(() => followCamera(pos, MAP_W, MAP_H, W, H), [pos, W, H]);

  const indoor = useCallback(
    (x, y) => ROOMS.some((r) => x > r.x && x < r.x + r.w - 1 && y > r.y && y < r.y + r.h - 1),
    [],
  );

  // A wall tile is framed along whichever axis it continues on, so a run of
  // studs reads as one wall rather than as a row of separate blocks.
  const wallHoriz = useCallback((x, y) => {
    const w = (a, b) => (a >= 0 && b >= 0 && a < MAP_W && b < MAP_H && grid[b][a] === Tile.WALL);
    return w(x - 1, y) || w(x + 1, y);
  }, [grid]);

  const floors = [];
  const walls = [];
  const overhead = [];
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (!tileVisible(x, y, cam, W, H)) continue;
      if (grid[y][x] === Tile.WALL) {
        walls.push(<StudWall key={`w${x},${y}`} tx={x} ty={y} horiz={wallHoriz(x, y)} />);
      } else {
        floors.push(<SlabTile key={`f${x},${y}`} tx={x} ty={y} indoor={indoor(x, y)} />);
        // An unfinished commercial shell has no ceiling — you look up into deck
        // and open bar joists. Drawing nothing overhead is what made the
        // interior read as a floor plan instead of a building. Every third tile
        // so it reads as a rhythm of joists rather than a hatch pattern.
        if (indoor(x, y) && y % 3 === 0) {
          overhead.push(<BarJoist key={`j${x},${y}`} tx={x} ty={y} horiz />);
        }
      }
    }
  }

  const routeD = route.length > 1
    ? route.map((p, i) => {
        const q = toScreen(p.x, p.y);
        return `${i ? 'L' : 'M'} ${q.x} ${q.y}`;
      }).join(' ')
    : null;

  const pulse = (Math.sin(step * 0.5) + 1) / 2;

  return (
    <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: SKY.grass }}>
      <Svg width={W} height={H}>
        <Defs>
          <RadialGradient id="sun" cx="50%" cy="28%" r="70%">
            <Stop offset="0%" stopColor="#FFF6DC" stopOpacity="0.18" />
            <Stop offset="100%" stopColor="#FFF6DC" stopOpacity="0" />
          </RadialGradient>
        </Defs>

        <G transform={`translate(${cam.tx}, ${cam.ty})`}>
          {/* Exterior apron — what replaces the black void */}
          <Rect x={-8 * TILE} y={-8 * TILE} width={(MAP_W + 16) * TILE} height={(MAP_H + 16) * TILE} fill={SKY.grass} />
          <Rect x={-6 * TILE} y={-3 * TILE} width={(MAP_W + 12) * TILE} height={(MAP_H + 6) * TILE} fill={SKY.dirt} />
          {EXTERIOR.map((e, i) => {
            if (e.k === 'fenceH') return <FenceRun key={`e${i}`} tx={e.x} ty={e.y} len={e.len} horiz />;
            if (e.k === 'fenceV') return <FenceRun key={`e${i}`} tx={e.x} ty={e.y} len={e.len} horiz={false} />;
            const A = PROP_ART[e.k];
            return A ? <A key={`e${i}`} tx={e.x} ty={e.y} /> : null;
          })}

          {floors}

          {/* Joists sit above the slab and under everything a player can touch,
              so the shell reads as a building without competing with the props
              or the crew. */}
          {overhead}

          {routeD && (
            <G>
              <Path d={routeD} stroke="rgba(34,197,94,0.30)" strokeWidth={TILE * 0.34} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <Path d={routeD} stroke={SKY.green} strokeWidth={TILE * 0.1} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </G>
          )}

          {PROPS.map((p, i) => {
            if (p.k === 'emtH') return <EmtRun key={`p${i}`} tx={p.x} ty={p.y} len={p.len} horiz />;
            if (p.k === 'emtV') return <EmtRun key={`p${i}`} tx={p.x} ty={p.y} len={p.len} horiz={false} />;
            const A = PROP_ART[p.k];
            return A ? <A key={`p${i}`} tx={p.x} ty={p.y} /> : null;
          })}

          {walls}

          {STATIONS.map((s) => {
            const who = characterForStation(s.id);
            const look = (who && CREW_LOOK[who.id]) || ROLE_LOOK.journeyman;
            const d = isComplete(progress, s.id);
            return (
              <G key={s.id}>
                <Worker tx={s.x} ty={s.y} facing="down" {...look}
                  ring={near?.id === s.id ? SKY.green : null} />
                {d ? <DoneMarker tx={s.x} ty={s.y} /> : <ObjectiveMarker tx={s.x} ty={s.y} pulse={pulse} />}
              </G>
            );
          })}

          <Worker tx={pos.x} ty={pos.y} facing={facing} step={step}
            hat={SKY.amber} vest={SKY.vestLime} shirt="#1F2937" ring={SKY.green} scale={1.05} />
        </G>

        <Rect x={0} y={0} width={W} height={H} fill="url(#sun)" pointerEvents="none" />
      </Svg>
    </View>
  );
}

// ─── Controls ────────────────────────────────────────────────────────────────

/**
 * Floating stick. The base appears wherever the thumb lands in the lower
 * control zone, so it can never be in the wrong place and never clipped — it is
 * positioned by the touch rather than by a fixed offset guessing at the safe
 * area, which is what clipped the old pad.
 */
function Stick({ dir, side, onSwap }) {
  const { width: W, height: H } = Dimensions.get('window');
  const rest = useMemo(
    () => ({ x: side === 'left' ? 96 : W - 96, y: H - 155 }),
    [side, W, H],
  );
  const [origin, setOrigin] = useState(rest);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);
  useEffect(() => { setOrigin(rest); }, [rest]);

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      const o = floatingOrigin(e.nativeEvent.pageX, e.nativeEvent.pageY, W, H, { side });
      if (o) setOrigin(o);
      setActive(true);
    },
    onPanResponderMove: (_e, g) => {
      setKnob(knobOffset(g.dx, g.dy, STICK_R));
      const v = readStick(g.dx, g.dy, STICK_R);
      // Screen axes ARE world axes. No conversion — that is the point.
      const w = stickToWorld(v.x, v.y);
      dir.current = { x: w.x, y: w.y };
    },
    onPanResponderRelease: () => {
      setActive(false); setKnob({ x: 0, y: 0 }); setOrigin(rest); dir.current = { x: 0, y: 0 };
    },
    onPanResponderTerminate: () => {
      setActive(false); setKnob({ x: 0, y: 0 }); setOrigin(rest); dir.current = { x: 0, y: 0 };
    },
  }), [dir, W, H, side, rest]);

  return (
    <>
      {/* Large invisible touch zone; the stick itself is what you see. */}
      <View
        {...pan.panHandlers}
        accessibilityRole="adjustable"
        accessibilityLabel="Movement stick. Drag to walk."
        style={{
          position: 'absolute', bottom: 0, height: H * 0.45,
          [side === 'left' ? 'left' : 'right']: 0, width: W * 0.5,
        }}
      />
      <View pointerEvents="none" style={{
        position: 'absolute', left: origin.x - STICK_R, top: origin.y - STICK_R,
        width: STICK_R * 2, height: STICK_R * 2, borderRadius: STICK_R,
        backgroundColor: 'rgba(14,18,22,0.42)',
        borderWidth: 2, borderColor: active ? 'rgba(34,197,94,0.6)' : 'rgba(255,255,255,0.28)',
        alignItems: 'center', justifyContent: 'center',
        opacity: active ? 1 : 0.72,
      }}>
        <View style={{
          width: STICK_R * 0.9, height: STICK_R * 0.9, borderRadius: STICK_R * 0.45,
          transform: [{ translateX: knob.x }, { translateY: knob.y }],
          backgroundColor: active ? 'rgba(34,197,94,0.9)' : 'rgba(255,255,255,0.3)',
          borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)',
        }} />
      </View>
      <TouchableOpacity onPress={onSwap} hitSlop={{ top: 10, bottom: 10, left: 14, right: 14 }}
        accessibilityRole="button" accessibilityLabel="Swap the stick to the other side"
        style={{ position: 'absolute', bottom: 24, [side === 'left' ? 'left' : 'right']: 28 }}>
        <Text style={{ fontSize: 9, fontWeight: '800', letterSpacing: 1, color: 'rgba(255,255,255,0.55)' }}>
          SWAP SIDE
        </Text>
      </TouchableOpacity>
    </>
  );
}
