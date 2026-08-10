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
  PanResponder, StyleSheet, ScrollView, AccessibilityInfo,
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
  SKY, SlabTile, SlabMarks, GroundTile, Daylight, AmbientShade, DustMotes,
  StudWall, BarJoist, Worker, ROLE_LOOK,
  Panelboard, JBox, EmtRun, AFrameLadder, WireReel, GangBox, MaterialCart,
  PrintTable, DrywallStack, SafetyCone, WorkTruck, Dumpster, SiteTrailer,
  Tree, Palm, FenceRun, Pallet, ObjectiveMarker, DoneMarker,
  ScissorLift, TempPower, ConduitBundle,
} from './topdownArt';
import { PROPS as SITE_PROPS, PropKind, buildSiteMap } from '../core/game/props';
import { FENCE, YARD, wearAt, onSlab } from '../core/game/yard';
import {
  discoverAt, isDiscovered, sanitizeDiscovered, emptyDiscovery,
  showsContents, shadeFor, explored,
} from '../core/game/discovery';
import { Art, buildArt } from './jobsiteArt';
import {
  Panel, DOCK, HUD, panelStyle, stickAnchor, HOME_INDICATOR_MIN, density,
  hudLayout, togglePanel, motion as hudMotion, xpBar, levelFor, currency,
  taskProgress, completion, routeStyle,
} from '../core/game/hud';
import {
  Glass, Press, LevelBar, ObjectiveChip, NextStep, Dialogue,
  TasksPanel, MapPanel, ListPanel, Dock, CompletionCard,
} from './JobsiteHud';
import { portraitFor } from './castImages';
import WiringLabScreen from './WiringLabScreen';
import TroubleshootScreen from './TroubleshootScreen';
import FieldTaskScreen from './FieldTaskScreen';

const KEY = '@sc_jobsite_progress_v1';
const KEY_SIDE = '@sc_jobsite_side_v1';
const KEY_SEEN = '@sc_jobsite_seen_v1';

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

/**
 * The same drawables, under the names the art layer knows them by.
 *
 * This is the seam. Every prop below is drawn through `<Art>`, which reaches
 * for a raster sprite when the atlas has one for that name and falls back to
 * the vector component here when it does not. With no atlas — today — every
 * lookup falls back, and the world renders exactly as it did before.
 *
 * DoorOpening is the one name still absent: it is drawn as a gap in the wall
 * run rather than as its own component, so `coverage()` correctly reports it
 * as having no component-level art behind it yet.
 */
const VECTOR_ART = {
  SlabTile, StudWall, BarJoist, FenceRun,
  Panelboard, JBox, EmtRun,
  AFrameLadder, WireReel, GangBox, MaterialCart, PrintTable, DrywallStack,
  SafetyCone, Pallet,
  WorkTruck, Dumpster, SiteTrailer, Tree, Palm,
  Worker, ObjectiveMarker, DoneMarker,
};

/** Prop kind → art name, so the decor list keeps its short keys. */
const PROP_ART_NAME = {
  panel: 'Panelboard', jbox: 'JBox', ladder: 'AFrameLadder', reel: 'WireReel',
  gangbox: 'GangBox', cart: 'MaterialCart', print: 'PrintTable',
  drywall: 'DrywallStack', cone: 'SafetyCone', truck: 'WorkTruck',
  dumpster: 'Dumpster', trailer: 'SiteTrailer', tree: 'Tree', palm: 'Palm',
  pallet: 'Pallet',
};

/**
 * Art for the props that actually take up space.
 *
 * The decor above is scenery — you walk straight through it, which is what made
 * the site read as a painting of a job rather than a job. `core/game/props.js`
 * places these ones on the collision grid, and a test proves every station is
 * still reachable with them there.
 */
const SITE_PROP_ART = {
  [PropKind.LADDER]: AFrameLadder,
  [PropKind.PALLET]: Pallet,
  [PropKind.GANG_BOX]: GangBox,
  [PropKind.CONDUIT]: ConduitBundle,
  [PropKind.LIFT]: ScissorLift,
  [PropKind.TEMP_POWER]: TempPower,
  [PropKind.SPOOL]: WireReel,
  [PropKind.SAWHORSE]: PrintTable,
  [PropKind.DEBRIS]: DrywallStack,
  [PropKind.DRYWALL]: DrywallStack,
  [PropKind.PRINT_TABLE]: PrintTable,
  [PropKind.CART]: MaterialCart,
  [PropKind.HVAC]: ConduitBundle,
};

/** The same, by art name. ScissorLift/TempPower/ConduitBundle are vector-only. */
const SITE_PROP_ART_NAME = {
  [PropKind.LADDER]: 'AFrameLadder',
  [PropKind.PALLET]: 'Pallet',
  [PropKind.GANG_BOX]: 'GangBox',
  [PropKind.SPOOL]: 'WireReel',
  [PropKind.SAWHORSE]: 'PrintTable',
  [PropKind.DEBRIS]: 'DrywallStack',
  [PropKind.DRYWALL]: 'DrywallStack',
  [PropKind.PRINT_TABLE]: 'PrintTable',
  [PropKind.CART]: 'MaterialCart',
};

/**
 * The resolver, built once for the module.
 *
 * With no atlas every name falls back to the vector component it has always
 * used, so this changes nothing until art arrives — which is the property that
 * made it safe to land the seam ahead of the art. Module scope because both
 * inputs are module constants: rebuilding it per render would allocate a new
 * resolver every frame for an answer that cannot change.
 */
const art = buildArt(VECTOR_ART);

/**
 * Where daylight lands.
 *
 * At the door openings and down the middle of the yard — the only places an
 * unfinished shell actually lets light in. Placing pools anywhere else would
 * be decoration, and decoration that contradicts the building is what makes a
 * scene read as fake.
 */
const SUN_POOLS = [
  { x: 5.5,  y: 6.4, r: 3.0 },
  { x: 12.5, y: 6.4, r: 3.4 },
  { x: 20.5, y: 6.4, r: 3.0 },
  { x: 5.5,  y: 12.2, r: 2.4 },
  { x: 13.5, y: 12.2, r: 2.4 },
  { x: 19.5, y: 12.2, r: 2.4 },
  { x: 12.5, y: 1.4,  r: 3.2 },
];

/** The crew, as people rather than portrait bubbles. */
const CREW_LOOK = {
  michael: ROLE_LOOK.apprentice, jerry: ROLE_LOOK.foreman,
  miguel: ROLE_LOOK.journeyman, dante: ROLE_LOOK.apprentice,
  owner: ROLE_LOOK.owner, renee: ROLE_LOOK.gc,
};

export default function JobsiteScreen({ C, setTab, onStreakUpdate, pickImage, onPhotoTaken }) {
  // buildSiteMap, not buildMap: the pallet, the lift and the gang box are
  // things you walk around. Reachability is proven against this same grid in
  // tests/props.test.js, so clutter can never seal a station in.
  const grid = useMemo(() => buildSiteMap(), []);
  const [pos, setPos] = useState({ ...SPAWN });
  const [progress, setProgress] = useState(emptyJobsiteProgress());
  // Rooms walked into. Persisted, because re-darkening a job the player
  // already explored on every launch would be a punishment, not a feature.
  const [seen, setSeen] = useState(emptyDiscovery);
  const [active, setActive] = useState(null);
  const [toast, setToast] = useState(null);
  const [facing, setFacing] = useState('down');
  const [step, setStep] = useState(0);
  const [openPanel, setOpenPanel] = useState(Panel.NONE);
  const [sawCompletion, setSawCompletion] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [side, setSide] = useState('left');

  // A person who asked the OS for less motion asked for none, not for a brisk
  // version. Read once; it is a system setting, not a per-frame concern.
  useEffect(() => {
    let live = true;
    try {
      Promise.resolve(AccessibilityInfo.isReduceMotionEnabled())
        .then((v) => { if (live) setReduceMotion(!!v); })
        .catch(() => {});
    } catch (e) { /* not available in preview */ }
    return () => { live = false; };
  }, []);
  const solvedRef = useRef(false);
  const dir = useRef({ x: 0, y: 0 });


  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => { if (raw) setProgress(sanitizeProgress(JSON.parse(raw))); })
      .catch(() => {});
    AsyncStorage.getItem(KEY_SIDE)
      .then((v) => { if (v === 'left' || v === 'right') setSide(v); })
      .catch(() => {});
    AsyncStorage.getItem(KEY_SEEN)
      .then((raw) => { if (raw) setSeen(sanitizeDiscovered(JSON.parse(raw), ROOMS)); })
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
      setPos((p) => {
        const next = movePlayer(grid, p, d.x * SPEED, d.y * SPEED);
        // Reveal on arrival. discoverAt returns the SAME array when nothing
        // changed, so this is a no-op 99 ticks out of 100 and React skips.
        setSeen((prev) => {
          const after = discoverAt(prev, ROOMS, next.x, next.y);
          if (after !== prev) AsyncStorage.setItem(KEY_SEEN, JSON.stringify(after)).catch(() => {});
          return after;
        });
        return next;
      });
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

  // ── HUD state. Every number is derived, so a panel can never disagree with
  // the header above it or with the world underneath it.
  const { width: SW, height: SH } = Dimensions.get('window');
  const mo = useMemo(() => hudMotion(reduceMotion), [reduceMotion]);
  const bar = useMemo(() => xpBar(levelFor(progress.xp)), [progress.xp]);
  const coin = useMemo(() => currency({ balance: progress.xp, enabled: false }), [progress.xp]);

  const taskRows = useMemo(() => STATIONS.map((st) => ({
    id: st.id, label: st.label, xp: st.xp, done: isComplete(progress, st.id),
  })), [progress]);
  const rollup = useMemo(() => taskProgress(taskRows), [taskRows]);
  const doneRooms = useMemo(
    () => STATIONS.filter((st) => isComplete(progress, st.id)).map((st) => st.room),
    [progress],
  );

  const layout = useMemo(() => hudLayout({
    openPanel, dialogue: toast || near, nearStation: near, objective,
    size: { width: SW, height: SH },
  }), [openPanel, toast, near, objective, SW, SH]);

  // Inventory and tutorials are derived from what the site actually contains,
  // not invented lists — an empty panel that says why is honest, a padded one
  // is busywork.
  const inventory = useMemo(() => SITE_PROPS
    .filter((p) => p.kind === PropKind.MATERIAL)
    .slice(0, 12)
    .map((p) => ({ id: p.id, label: p.label ?? p.kind, sub: p.room, icon: 'cube-outline' })), []);

  const tutorials = useMemo(() => STATIONS
    .filter((st) => dialogueFor(st.id)?.brief)
    .map((st) => ({ id: st.id, label: st.label, sub: dialogueFor(st.id).brief, icon: 'book-outline' })), []);

  const scoreRows = useMemo(() => taskRows.map((t) => ({
    id: t.id, label: t.label, sub: t.done ? 'Signed off' : 'Not started',
    icon: t.done ? 'checkmark-circle' : 'ellipse-outline',
    tone: t.done ? HUD.objective : HUD.textDim, count: t.xp,
  })), [taskRows]);

  // One geometry for the whole bottom band: the stick's own reserved strip, and
  // the room left beside it for the dock. Both measured from the home indicator.
  const anchor = useMemo(
    () => stickAnchor({ width: SW, height: SH, side, inset: HOME_INDICATOR_MIN, radius: STICK_R }),
    [SW, SH, side],
  );

  const finishedResult = useMemo(
    () => completion({ tasks: taskRows, xpEarned: progress.xp }),
    [taskRows, progress.xp],
  );
  const finished = finishedResult.ready && !sawCompletion ? finishedResult : null;

  return (
    <View style={{ flex: 1, backgroundColor: SKY.dirt }}>
      <World grid={grid} pos={pos} progress={progress} near={near} route={route}
        facing={facing} step={step} reduceMotion={mo.reduce} seen={seen} />

      {/* ── HUD ──────────────────────────────────────────────────────────
          Four things are permanent: level, objective, stick, action. The task
          list, map, inventory and tutorials are one tap away in the dock.

          The reference mockup shows all of them at once. That composition is
          desktop-density — on a 6.1" phone those panels cover roughly 40% of
          the display, and all of it sits over the part you are walking
          through. Same visual language, a hierarchy instead of a wall.
          Layout decisions live in core/game/hud.js. */}

      {/* Top strip — always */}
      <View pointerEvents="box-none" style={{ position: 'absolute', top: 14, left: 12, right: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Press motion={mo} onPress={() => setTab && setTab('home')}
            accessibilityLabel="Leave the job site"
            style={[panelStyle(), { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }]}>
            <Ionicons name="chevron-back" size={19} color={HUD.text} />
          </Press>
          <LevelBar bar={bar} phase="COMMERCIAL ROUGH-IN" percent={jobsitePercent(progress)}
            coin={coin} motion={mo} />
        </View>

        {/* Next step — collapses on a small screen; its content is already in
            the task list and the objective chip. */}
        {layout.nextStep && objective ? (
          <View style={{ alignSelf: 'flex-end', marginTop: 10 }}>
            <NextStep
              title={objective.label}
              hint={dialogueFor(objective.id)?.brief}
              feet={distanceFeet(pos, objective)}
              icon={objective.icon}
            />
          </View>
        ) : null}
      </View>

      {/* Opened panel — sits over the world because the player asked for it */}
      {layout.panel !== Panel.NONE ? (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 12, right: 12, top: 68 }}>
          {layout.panel === Panel.TASKS ? (
            <TasksPanel tasks={taskRows} rollup={rollup} motion={mo}
              onClose={() => setOpenPanel(Panel.NONE)} />
          ) : null}
          {layout.panel === Panel.MAP ? (
            <MapPanel rooms={ROOMS} player={pos} objective={objective} seenRooms={seen}
              doneRooms={doneRooms} mapW={MAP_W} mapH={MAP_H}
              size={layout.density.minimapSize * 2.2}
              onClose={() => setOpenPanel(Panel.NONE)} />
          ) : null}
          {layout.panel === Panel.INVENTORY ? (
            <ListPanel title="INVENTORY" items={inventory}
              empty="Nothing staged yet. Materials you are issued on a station show up here."
              onClose={() => setOpenPanel(Panel.NONE)} />
          ) : null}
          {layout.panel === Panel.TUTORIALS ? (
            <ListPanel title="TUTORIALS" items={tutorials}
              empty="No walkthroughs for this phase yet."
              onClose={() => setOpenPanel(Panel.NONE)} />
          ) : null}
          {layout.panel === Panel.SCORE ? (
            <ListPanel title="PROGRESS" items={scoreRows}
              empty="Nothing signed off yet."
              onClose={() => setOpenPanel(Panel.NONE)} />
          ) : null}
        </View>
      ) : null}

      {/* Lower band — one thing at a time, never a stack of dark cards over
          the strip of world the player is walking through. */}
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 14, right: 14, bottom: anchor.reserved + 24 }}>
        {layout.dialogue && toast ? (
          <Dialogue portrait={portraitFor(toast.who?.id)} name={toast.who?.name}
            text={toast.text} xp={toast.xp} tone={HUD.objective} motion={mo} />
        ) : layout.dialogue && near ? (
          <Dialogue portrait={portraitFor(nearWho?.id)}
            name={`${nearWho?.name ?? ''} · ${near.label}`}
            text={isComplete(progress, near.id) ? dialogueFor(near.id)?.done : dialogueFor(near.id)?.brief}
            tone={HUD.warn} motion={mo} />
        ) : layout.always.objective && objective ? (
          <ObjectiveChip room={objective.room} feet={distanceFeet(pos, objective)} />
        ) : rollup.allDone ? (
          <Glass style={{ alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 10 }}>
            <Text style={{ fontSize: 12, color: HUD.text }}>Every station signed off. Nice work.</Text>
          </Glass>
        ) : null}
      </View>

      {/* Dock — BESIDE the stick, on the same band, not stacked above it.
          Stacked, it floated a fifth of the way up the screen across the middle
          of the world, and the stick had nowhere left to travel. */}
      <View pointerEvents="box-none" style={{
        position: 'absolute', bottom: anchor.dockBottom,
        [side === 'left' ? 'left' : 'right']: anchor.dockInset,
        [side === 'left' ? 'right' : 'left']: 12,
      }}>
        <Dock slots={layout.density.dock} open={layout.panel} motion={mo}
          badge={{ [Panel.TASKS]: rollup.total - rollup.done || null }}
          onSelect={(id) => setOpenPanel((cur) => togglePanel(cur, id))} />
      </View>

      {finished ? (
        <CompletionCard result={finished} onClose={() => setSawCompletion(true)}
          onLeave={() => setTab && setTab('home')} />
      ) : null}

      <Stick dir={dir} side={side} onSwap={swapSide} bottomInset={HOME_INDICATOR_MIN} />

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

// ─── World ───────────────────────────────────────────────────────────────────

function World({ grid, pos, progress, near, route, facing, step, reduceMotion = false, seen = [] }) {
  // Ambient dust. Deliberately slow and few — motes that move fast read as
  // snow, and a screen full of drifting particles is what makes a game look
  // cheap rather than atmospheric. Held completely still under reduced motion.
  const [dust, setDust] = useState(0);
  useEffect(() => {
    let timer = null;
    let live = true;
    const start = () => { if (live && !timer) timer = setInterval(() => setDust((d) => d + 1), 90); };

    Promise.resolve(AccessibilityInfo?.isReduceMotionEnabled?.() ?? false)
      .then((reduced) => { if (!reduced) start(); })
      .catch(start);

    return () => { live = false; if (timer) clearInterval(timer); };
  }, []);
  const { width: W, height: H } = Dimensions.get('window');
  const cam = useMemo(() => followCamera(pos, MAP_W, MAP_H, W, H), [pos, W, H]);

  // On the slab, not in a room. These are different questions and the second
  // one was being asked: everything between the six rooms is corridor, inside
  // the same walled envelope, standing on the same pour. Asking "is it a room"
  // sent every corridor tile down the outdoor branch and grew grass on it.
  const indoor = useCallback(
    (x, y) => onSlab(x, y, { mapW: MAP_W, mapH: MAP_H }),
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
  const yard = [];

  /**
   * How travelled a patch of ground is, from its distance to the building.
   *
   * Right against the wall it is gravel; a few tiles out it is driven dirt;
   * past that it is turf nobody has a reason to cross. Derived rather than
   * painted, so moving a wall moves the wear with it.
   */
  // The apron ring: everything outside the map footprint the camera can reach.
  for (let y = -7; y < MAP_H + 7; y++) {
    for (let x = -7; x < MAP_W + 7; x++) {
      if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) continue;
      if (!tileVisible(x, y, cam, W, H)) continue;
      yard.push(<GroundTile key={`y${x},${y}`} tx={x} ty={y} wear={wearAt(x, y)} />);
    }
  }
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (!tileVisible(x, y, cam, W, H)) continue;
      if (grid[y][x] === Tile.WALL) {
        // Through the art layer: raster the moment StudWall.png lands, the
        // vector framing until then. The raster is authored as a horizontal
        // run and turns 90° for vertical walls; the vector component reads
        // `horiz` and orients itself as it always has.
        const h = wallHoriz(x, y);
        walls.push(<Art key={`w${x},${y}`} art={art} name="StudWall" tx={x} ty={y} tile={TILE} horiz={h} turn={h ? 0 : 90} />);
      } else {
        // Indoors goes through the art layer, so a real slab texture replaces
        // the vector one the moment it lands. OUTDOORS DELIBERATELY DOES NOT:
        // the yard is dirt, and painting a concrete photo across it would pave
        // the site. The vector tile tints itself for outside, and it stays
        // until there is a ground texture that is actually ground.
        floors.push(indoor(x, y)
          ? <Art key={`f${x},${y}`} art={art} name="SlabTile" tx={x} ty={y} tile={TILE} indoor />
          : <SlabTile key={`f${x},${y}`} tx={x} ty={y} indoor={false} />);
        // Layout marks, chalk lines and pallet stains — the details somebody
        // who has stood on a commercial slab recognises instantly. Deterministic
        // from the tile coords, so the floor does not reshuffle its own scuffs
        // between visits, which is worse than a plain one.
        if (indoor(x, y)) {
          floors.push(<SlabMarks key={`m${x},${y}`} tx={x} ty={y} />);
        }
        // An unfinished commercial shell has no ceiling — you look up into deck
        // and open bar joists. Drawing nothing overhead is what made the
        // interior read as a floor plan instead of a building. Every third tile
        // so it reads as a rhythm of joists rather than a hatch pattern.
        if (indoor(x, y) && y % 3 === 0) {
          overhead.push(<Art key={`j${x},${y}`} art={art} name="BarJoist" tx={x} ty={y} tile={TILE} horiz />);
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
          {/* THE YARD.
              A flat green rectangle around a grey one reads as a diagram. Real
              ground wears where people walk, so the apron grades from turf out
              at the fence, through driven dirt, to gravel at the doors — and
              the grading is computed from distance to the building rather than
              painted, so it stays right if the map changes. */}
          <Rect x={-9 * TILE} y={-9 * TILE} width={(MAP_W + 18) * TILE} height={(MAP_H + 18) * TILE} fill={SKY.grass} />
          {yard}
          {FENCE.map((f, i) => (
            <FenceRun key={`f${i}`} tx={f.x} ty={f.y} len={f.len} horiz={f.dir === 'H'} />
          ))}
          {EXTERIOR.map((e, i) => {
            const name = PROP_ART_NAME[e.k];
            return name ? <Art key={`e${i}`} art={art} name={name} tx={e.x} ty={e.y} tile={TILE} /> : null;
          })}

          {floors}

          {/* Daylight falling through the door openings. The single biggest
              change in how the site reads: an evenly lit floor looks like a
              diagram, a floor with light across it looks like a room. Below
              the walls, so the studs cast into it. */}
          <Daylight pools={SUN_POOLS} />

          {/* Joists sit above the slab and under everything a player can touch,
              so the shell reads as a building without competing with the props
              or the crew. */}
          {overhead}
          <DustMotes pools={SUN_POOLS} t={dust} />

          {routeD && (() => {
            // Three strokes: a soft glow that lifts it off the floor, a body,
            // and a travelling dashed core that says which way to walk. The
            // dash movement is the whole point — a static line tells you where
            // the path is, not which end of it you are meant to reach.
            const rs = routeStyle(step, { reduceMotion, tile: TILE });
            return (
              <G>
                <Path d={routeD} stroke={rs.glow} strokeWidth={rs.glowWidth} fill="none"
                  strokeLinecap="round" strokeLinejoin="round" />
                <Path d={routeD} stroke={rs.body} strokeWidth={rs.bodyWidth} fill="none"
                  strokeLinecap="round" strokeLinejoin="round" />
                <Path d={routeD} stroke={rs.core} strokeWidth={rs.coreWidth} fill="none"
                  strokeLinecap="round" strokeLinejoin="round"
                  strokeDasharray={rs.dashArray} strokeDashoffset={rs.dashOffset}
                  opacity={rs.coreOpacity} />
              </G>
            );
          })()}

          {PROPS.map((p, i) => {
            if (p.k === 'emtH') return <EmtRun key={`p${i}`} tx={p.x} ty={p.y} len={p.len} horiz />;
            if (p.k === 'emtV') return <EmtRun key={`p${i}`} tx={p.x} ty={p.y} len={p.len} horiz={false} />;
            const name = PROP_ART_NAME[p.k];
            if (!name) return null;
            // Nothing inside a room the player has not walked into yet.
            if (!showsContents(seen, ROOMS, p.x, p.y)) return null;
            return <Art key={`p${i}`} art={art} name={name} tx={p.x} ty={p.y} tile={TILE} />;
          })}

          {/* The clutter you go around. Drawn at the CENTRE of its footprint so
              a two-tile pallet sits over both tiles it blocks — art that does
              not match the collision box is worse than no collision box. */}
          {SITE_PROPS.map((p) => {
            const cx = p.x + p.w / 2;
            const cy = p.y + p.h / 2;
            if (!showsContents(seen, ROOMS, cx, cy)) return null;
            const name = SITE_PROP_ART_NAME[p.kind];
            if (name) return <Art key={p.id} art={art} name={name} tx={cx} ty={cy} tile={TILE} />;
            // No art name yet — lift, temp power, conduit bundle. Vector only,
            // and drawn directly so nothing disappears while the pack fills in.
            const A = SITE_PROP_ART[p.kind];
            return A ? <A key={p.id} tx={cx} ty={cy} /> : null;
          })}

          {/* THE UNLIT SHELL.
              A room on the prints but never walked into is drawn dark: you see
              the framing and the shape, not what is in it. Under the walls so
              the studs stay legible — the point is that the building has
              somewhere left to go, not that it is hidden. */}
          {ROOMS.map((r) => (isDiscovered(seen, r.id) ? null : (
            <Rect key={`shell${r.id}`}
              x={r.x * TILE} y={r.y * TILE}
              width={r.w * TILE} height={r.h * TILE}
              fill="#0A1018" opacity={shadeFor(seen, r.id)} pointerEvents="none" />
          )))}

          {walls}

          {STATIONS.map((s) => {
            // The crew and the objective pin are the payoff for walking in.
            if (!showsContents(seen, ROOMS, s.x, s.y)) return null;
            const who = characterForStation(s.id);
            const look = (who && CREW_LOOK[who.id]) || ROLE_LOOK.journeyman;
            const d = isComplete(progress, s.id);
            return (
              <G key={s.id}>
                <Art art={art} name="Worker" tx={s.x} ty={s.y} tile={TILE} facing="down" {...look}
                  ring={near?.id === s.id ? SKY.green : null} />
                {/* The pin is anchored at its tip, so it occupies the space
                    ABOVE its anchor — drawn at the station tile it would sit on
                    the worker's head. Floated up so it hovers over them. */}
                {d
                  ? <Art art={art} name="DoneMarker" tx={s.x} ty={s.y - 0.55} tile={TILE} />
                  : <Art art={art} name="ObjectiveMarker" tx={s.x} ty={s.y - 0.55} tile={TILE} pulse={pulse} />}
              </G>
            );
          })}

          <Art art={art} name="Worker" tx={pos.x} ty={pos.y} tile={TILE} facing={facing} step={step}
            hat={SKY.amber} vest={SKY.vestLime} shirt="#1F2937" ring={SKY.green} scale={1.05} />
        </G>

        <Rect x={0} y={0} width={W} height={H} fill="url(#sun)" pointerEvents="none" />
        {/* Screen space, outside the camera transform. A soft vignette rather
            than a flat wash — a wash would kill the daylight, this only bites
            at the corners so the middle of the room stays legible. */}
        <AmbientShade w={W} h={H} />
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
function Stick({ dir, side, onSwap, bottomInset = 0 }) {
  const { width: W, height: H } = Dimensions.get('window');
  // The rest position comes from stickAnchor, which refuses to place the
  // control within HOME_INDICATOR_MIN of the bottom whatever it is handed —
  // including an inset of 0, which is usually a measurement that has not
  // arrived rather than a phone without an indicator. A stick whose lower
  // travel is inside that strip cannot be pulled downward: the OS takes the
  // gesture, so the player cannot walk down. A test asserts the clearance on
  // every screen size rather than trusting a number typed here.
  const anchor = useMemo(
    () => stickAnchor({ width: W, height: H, side, inset: bottomInset, radius: STICK_R }),
    [W, H, side, bottomInset],
  );
  // Measured from the BOTTOM edge, never from the top. See floatingOrigin.
  const rest = useMemo(() => ({ x: anchor.x, bottom: anchor.bottom }), [anchor]);
  const [origin, setOrigin] = useState(rest);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);
  useEffect(() => { setOrigin(rest); }, [rest]);

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      const o = floatingOrigin(e.nativeEvent.pageX, e.nativeEvent.pageY, W, H, {
        side, margin: STICK_R + 16, bottomInset: anchor.reserved,
      });
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
          position: 'absolute', bottom: Math.max(bottomInset, HOME_INDICATOR_MIN), height: H * 0.42,
          [side === 'left' ? 'left' : 'right']: 0, width: W * 0.5,
        }}
      />
      {/* BOTTOM-ANCHORED, and that is the whole fix rather than a preference.
          This View lives in the screen body, which begins under the "Job Site"
          navigation bar, while `origin` is a window coordinate. Laying it out
          with `top` therefore added the header's height to it and dropped the
          stick most of the way off the bottom of the display — the tell being
          that SWAP SIDE, which was already bottom-anchored, rendered ABOVE the
          stick it labels. Distance from the bottom is independent of where the
          container starts. */}
      <View pointerEvents="none" style={{
        position: 'absolute', left: origin.x - STICK_R, bottom: origin.bottom - STICK_R,
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
        style={{ position: 'absolute', bottom: Math.max(bottomInset, HOME_INDICATOR_MIN) + 6, [side === 'left' ? 'left' : 'right']: 28 }}>
        <Text style={{ fontSize: 9, fontWeight: '800', letterSpacing: 1, color: 'rgba(255,255,255,0.55)' }}>
          SWAP SIDE
        </Text>
      </TouchableOpacity>
    </>
  );
}
