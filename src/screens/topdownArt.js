// ─── TOP-DOWN JOBSITE ART ────────────────────────────────────────────────────
// Straight overhead, illustrated, daylight. Two things drive every choice here.
//
// WALLS ARE FRAMING, NOT BLOCKS. A commercial rough-in wall seen from above is
// two thin parallel tracks with individual studs between them and OPEN CAVITY
// in the gaps — you can see the slab through it. Drawing a thick filled
// rectangle is what made the last version read as shipping containers, so
// nothing here fills a wall.
//
// PEOPLE ARE PEOPLE. From overhead you see a hard hat, shoulders, the vest, and
// boots either side. That silhouette is instantly a person; a circle with a
// face pasted in it never is.
//
// Components, not data — a bundler turns these into render calls, so they live
// beside the screen rather than in core/.

import React from 'react';
import { G, Rect, Circle, Ellipse, Path, Line, Defs, LinearGradient, RadialGradient, Stop } from 'react-native-svg';

import { TILE } from '../core/game/topdown';

export const SKY = {
  // Daylight. The old palette was near-black and made an unfinished shell look
  // like a dungeon.
  dirt: '#B8A88C', dirtAlt: '#AE9E82', dirtDark: '#9C8C72',
  slab: '#BFC3C6', slabAlt: '#B7BBBE', joint: '#9DA2A6',
  grass: '#7C9A62', grassAlt: '#748F5B', grassWorn: '#8C9668',
  grassLight: '#9BBC7A', grassDark: '#5F7A49', gravel: '#9A9184',
  asphalt: '#6E7278',
  steel: '#D7DBE0', steelMid: '#AEB4BB', steelDark: '#8A9099',
  shadow: 'rgba(40,34,24,0.28)',
  amber: '#F4A11D', green: '#22C55E', orange: '#F97316',
  vestLime: '#D9F225', vestOrange: '#FF7A1A',
  wood: '#B98A4E', woodDark: '#8A6435',
  emt: '#C9CED4', copper: '#C07B3C',
  panelGrey: '#7E858D',
};

/** Ground shadow. Every object that stands up gets one; it is what sells depth. */
const Shade = ({ x, y, rx, ry, o = 0.28 }) => (
  <Ellipse cx={x} cy={y} rx={rx} ry={ry} fill="#241E14" opacity={o} />
);

// ─── Ground ──────────────────────────────────────────────────────────────────

/**
 * Deterministic noise from a tile's own coordinates.
 *
 * Everything outdoors is scattered from this rather than from Math.random, for
 * the same reason the floor variants are: ground that reshuffles its own grass
 * as you walk past is worse than ground with a pattern in it.
 */
export const groundNoise = (x, y, salt = 0) => {
  let h = ((x + 1013) * 73856093) ^ ((y + 2477) * 19349663) ^ ((salt + 11) * 83492791);
  h = (h ^ (h >>> 13)) >>> 0;
  return h / 4294967295;
};

/**
 * The yard.
 *
 * A commercial site is not a lawn and it is not a mud pit — it is grass that
 * has been driven on. So the ground reads in three bands, decided by how far
 * the tile is from the building: turf out at the fence, a worn dirt apron
 * where the trucks and the crew actually travel, and gravel right at the
 * doors. Getting that gradient is what makes the exterior look like somewhere
 * work happens rather than a green rectangle around a grey one.
 */
export const GroundTile = ({ tx, ty, wear = 0 }) => {
  const x = tx * TILE, y = ty * TILE;
  const n = groundNoise(tx, ty);
  // wear 0 = untouched turf, 1 = bare travelled dirt.
  const w = Math.max(0, Math.min(1, wear));
  const base = w > 0.66 ? (n > 0.5 ? SKY.dirt : SKY.dirtAlt)
    : w > 0.33 ? (n > 0.5 ? SKY.grassWorn : SKY.dirtAlt)
      : (n > 0.5 ? SKY.grass : SKY.grassAlt);

  // Tufts thin out as the ground wears. Four per tile at most, placed off the
  // same noise so a tile always grows the same grass.
  const tufts = Math.round((1 - w) * 4);
  const blades = [];
  for (let i = 0; i < tufts; i++) {
    const gx = x + groundNoise(tx, ty, i * 3 + 1) * TILE;
    const gy = y + groundNoise(tx, ty, i * 3 + 2) * TILE;
    const len = TILE * (0.10 + groundNoise(tx, ty, i * 3 + 3) * 0.09);
    const dark = groundNoise(tx, ty, i + 40) > 0.5;
    // Half the blades lean the other way. Without this every tuft is the same
    // stroke and the field reads as a repeated character, not as grass.
    const lean = groundNoise(tx, ty, i + 55) > 0.5 ? 1 : -1;
    const tilt = (groundNoise(tx, ty, i + 62) - 0.5) * 0.5;
    blades.push(
      <Path key={`b${i}`}
        d={`M ${gx} ${gy} q ${len * 0.28 * lean} ${-len * 0.6} ${len * (0.1 * lean + tilt)} ${-len}`}
        stroke={dark ? SKY.grassDark : SKY.grassLight}
        strokeWidth={TILE * 0.045} fill="none" strokeLinecap="round" opacity={0.85} />,
    );
  }

  return (
    <G>
      <Rect x={x} y={y} width={TILE + 1} height={TILE + 1} fill={base} />
      {/* A tyre rut through the travelled band, not through the turf. */}
      {w > 0.5 && (tx * 7 + ty * 3) % 5 === 0 && (
        <Ellipse cx={x + TILE * 0.4} cy={y + TILE * 0.6} rx={TILE * 0.34} ry={TILE * 0.13}
          fill={SKY.dirtDark} opacity={0.45} />
      )}
      {/* Gravel where the ground is most worn — the pad at the doors. */}
      {w > 0.75 && [0, 1, 2, 3, 4].map((i) => (
        <Circle key={`g${i}`}
          cx={x + groundNoise(tx, ty, i + 70) * TILE}
          cy={y + groundNoise(tx, ty, i + 90) * TILE}
          r={TILE * 0.022} fill={SKY.gravel} opacity={0.75} />
      ))}
      {blades}
    </G>
  );
};

export const SlabTile = ({ tx, ty, indoor }) => {
  const x = tx * TILE, y = ty * TILE;
  const alt = (tx + ty) % 2 === 0;
  if (!indoor) return <GroundTile tx={tx} ty={ty} wear={0.55} />;
  return (
    <G>
      <Rect x={x} y={y} width={TILE + 1} height={TILE + 1} fill={alt ? SKY.slab : SKY.slabAlt} />
      {/* Saw-cut control joints on a 2-tile grid */}
      {tx % 2 === 0 && <Rect x={x} y={y} width={1.5} height={TILE + 1} fill={SKY.joint} opacity={0.7} />}
      {ty % 2 === 0 && <Rect x={x} y={y} width={TILE + 1} height={1.5} fill={SKY.joint} opacity={0.7} />}
      {/* construction dust */}
      {(tx * 5 + ty * 11) % 7 === 0 && (
        <Circle cx={x + TILE * 0.7} cy={y + TILE * 0.3} r={TILE * 0.16} fill="#CFD3D6" opacity={0.35} />
      )}
    </G>
  );
};

/**
 * A metal stud wall segment, seen from above.
 *
 * `horiz` runs the wall east-west; otherwise north-south. Two thin tracks, studs
 * on regular centres between them, and nothing filling the cavity — the slab
 * shows through, which is exactly what a framed wall looks like before rock.
 */
// One tile is 4 ft of wall, so 16" on centre puts three studs in a tile. The
// positions are computed from the tile's WORLD coordinate rather than from
// fractions of the tile, which is the difference between framing and wallpaper:
// per-tile fractions restart at every boundary and leave a visibly wrong gap
// where two tiles meet. Real studs march at one spacing down the whole run.
const STUDS_PER_TILE = 3;
const STUD_PITCH = 1 / STUDS_PER_TILE;

/**
 * A single steel stud seen from above: a C-section, not a solid bar.
 *
 * You are looking down into the channel, so what reads is the web with a flange
 * turned at each end — and the punched service hole, which is the most
 * recognisable thing about light-gauge steel and the reason an electrician
 * knows at a glance where the pipe goes.
 */
const Stud = ({ cx, cy, depth, horiz }) => {
  const web = TILE * 0.055;        // thickness of the steel as drawn
  const flange = depth * 0.30;     // the turned legs of the C
  const holeR = depth * 0.15;

  if (horiz) {
    // Wall runs left-right, so studs stand across it (vertical on screen).
    const x = cx - web / 2;
    const y0 = cy - depth / 2;
    return (
      <G>
        <Rect x={x} y={y0} width={web} height={depth} fill={SKY.steelMid} />
        {/* flanges, slightly brighter where the light catches the turned edge */}
        <Rect x={x - web * 0.55} y={y0} width={web * 2.1} height={flange * 0.34} fill={SKY.steel} />
        <Rect x={x - web * 0.55} y={y0 + depth - flange * 0.34} width={web * 2.1} height={flange * 0.34} fill={SKY.steel} />
        {/* punched service hole — where the conduit and the MC actually go */}
        <Ellipse cx={cx} cy={cy} rx={web * 0.34} ry={holeR} fill={SKY.slabAlt} opacity={0.95} />
      </G>
    );
  }
  const y = cy - web / 2;
  const x0 = cx - depth / 2;
  return (
    <G>
      <Rect x={x0} y={y} width={depth} height={web} fill={SKY.steelMid} />
      <Rect x={x0} y={y - web * 0.55} width={flange * 0.34} height={web * 2.1} fill={SKY.steel} />
      <Rect x={x0 + depth - flange * 0.34} y={y - web * 0.55} width={flange * 0.34} height={web * 2.1} fill={SKY.steel} />
      <Ellipse cx={cx} cy={cy} rx={holeR} ry={web * 0.34} fill={SKY.slabAlt} opacity={0.95} />
    </G>
  );
};

export const StudWall = ({ tx, ty, horiz }) => {
  const x = tx * TILE, y = ty * TILE;
  const T = TILE * 0.085;          // track steel, thinner than the stud web
  const D = TILE * 0.30;           // wall depth, track to track
  const off = (TILE - D) / 2;

  // Continuous across tiles: stud n of this tile is at the same pitch as stud n
  // of the tile beside it, so a wall run reads as one line of framing.
  const studs = [];
  for (let i = 0; i < STUDS_PER_TILE; i++) studs.push((i + 0.5) * STUD_PITCH);

  if (horiz) {
    const midY = y + off + D / 2;
    return (
      <G>
        <Rect x={x} y={y + off + D} width={TILE + 1} height={TILE * 0.075} fill={SKY.shadow} />
        {studs.map((f) => (
          <Stud key={f} cx={x + TILE * f} cy={midY} depth={D} horiz />
        ))}
        {/* Top and bottom track: U-channel, drawn as the web with a lip, so the
            wall has a visible top and bottom plate rather than two grey lines. */}
        <Rect x={x} y={y + off} width={TILE + 1} height={T} fill={SKY.steel} />
        <Rect x={x} y={y + off + T} width={TILE + 1} height={T * 0.28} fill={SKY.steelDark} opacity={0.55} />
        <Rect x={x} y={y + off + D - T} width={TILE + 1} height={T} fill={SKY.steelMid} />
        <Rect x={x} y={y + off + D - T} width={TILE + 1} height={T * 0.28} fill={SKY.steelDark} opacity={0.4} />
        <Rect x={x} y={y + off} width={TILE + 1} height={0.8} fill="#F2F5F8" opacity={0.8} />
      </G>
    );
  }

  const midX = x + off + D / 2;
  return (
    <G>
      <Rect x={x + off + D} y={y} width={TILE * 0.075} height={TILE + 1} fill={SKY.shadow} />
      {studs.map((f) => (
        <Stud key={f} cx={midX} cy={y + TILE * f} depth={D} horiz={false} />
      ))}
      <Rect x={x + off} y={y} width={T} height={TILE + 1} fill={SKY.steel} />
      <Rect x={x + off + T} y={y} width={T * 0.28} height={TILE + 1} fill={SKY.steelDark} opacity={0.55} />
      <Rect x={x + off + D - T} y={y} width={T} height={TILE + 1} fill={SKY.steelMid} />
      <Rect x={x + off + D - T} y={y} width={T * 0.28} height={TILE + 1} fill={SKY.steelDark} opacity={0.4} />
      <Rect x={x + off} y={y} width={0.8} height={TILE + 1} fill="#F2F5F8" opacity={0.8} />
    </G>
  );
};

/**
 * Open bar joists overhead. An unfinished commercial shell has no ceiling — you
 * look up into deck and joists — and drawing nothing overhead is what made the
 * interior read as a floor plan rather than a building.
 *
 * Deliberately faint: this is above the player, so it must never compete with
 * the things they can walk into.
 */
export const BarJoist = ({ tx, ty, horiz }) => {
  const x = tx * TILE, y = ty * TILE;
  const o = 0.13;
  if (horiz) {
    return (
      <G opacity={o}>
        <Rect x={x} y={y + TILE * 0.30} width={TILE + 1} height={TILE * 0.035} fill={SKY.steelDark} />
        <Rect x={x} y={y + TILE * 0.62} width={TILE + 1} height={TILE * 0.035} fill={SKY.steelDark} />
        {/* the zigzag web between the chords */}
        <Path
          d={Array.from({ length: 4 }, (_, i) => {
            const x0 = x + (i * TILE) / 4;
            const x1 = x + ((i + 0.5) * TILE) / 4;
            const x2 = x + ((i + 1) * TILE) / 4;
            return `M ${x0} ${y + TILE * 0.32} L ${x1} ${y + TILE * 0.62} L ${x2} ${y + TILE * 0.32}`;
          }).join(' ')}
          stroke={SKY.steelDark} strokeWidth={1.1} fill="none"
        />
      </G>
    );
  }
  return (
    <G opacity={o}>
      <Rect x={x + TILE * 0.30} y={y} width={TILE * 0.035} height={TILE + 1} fill={SKY.steelDark} />
      <Rect x={x + TILE * 0.62} y={y} width={TILE * 0.035} height={TILE + 1} fill={SKY.steelDark} />
      <Path
        d={Array.from({ length: 4 }, (_, i) => {
          const y0 = y + (i * TILE) / 4;
          const y1 = y + ((i + 0.5) * TILE) / 4;
          const y2 = y + ((i + 1) * TILE) / 4;
          return `M ${x + TILE * 0.32} ${y0} L ${x + TILE * 0.62} ${y1} L ${x + TILE * 0.32} ${y2}`;
        }).join(' ')}
        stroke={SKY.steelDark} strokeWidth={1.1} fill="none"
      />
    </G>
  );
};

/** Door opening: jamb studs either side and a header, with the gap left open. */
export const DoorOpening = ({ tx, ty, horiz }) => {
  const x = tx * TILE, y = ty * TILE;
  const D = TILE * 0.30, off = (TILE - D) / 2;
  const jamb = TILE * 0.1;
  return (
    <G>
      {horiz ? (
        <>
          <Rect x={x} y={y + off} width={jamb} height={D} fill={SKY.steel} />
          <Rect x={x + TILE - jamb} y={y + off} width={jamb} height={D} fill={SKY.steel} />
        </>
      ) : (
        <>
          <Rect x={x + off} y={y} width={D} height={jamb} fill={SKY.steel} />
          <Rect x={x + off} y={y + TILE - jamb} width={D} height={jamb} fill={SKY.steel} />
        </>
      )}
    </G>
  );
};

// ─── People ──────────────────────────────────────────────────────────────────

/**
 * A worker from directly above: hard hat, shoulders, hi-vis vest with reflective
 * banding, boots showing either side, and a shadow. `facing` rotates the whole
 * body, and `step` swings the boots for a walk cycle.
 */
export const Worker = ({
  tx, ty, facing = 'down', step = 0, hat = SKY.amber, vest = SKY.vestLime,
  shirt = '#2E3440', ring = null, scale = 1,
}) => {
  const x = tx * TILE, y = ty * TILE;
  const rot = { up: 180, down: 0, left: 90, right: 270 }[facing] ?? 0;
  const s = TILE * 0.0135 * scale;   // body unit
  const swing = Math.sin(step) * 3.2;

  return (
    <G>
      <Shade x={x} y={y + 5 * s} rx={13 * s} ry={6.5 * s} />
      {ring && <Ellipse cx={x} cy={y + 4 * s} rx={16 * s} ry={8 * s} fill="none" stroke={ring} strokeWidth={2.2} opacity={0.9} />}
      <G transform={`rotate(${rot} ${x} ${y})`}>
        {/* boots — they swing, which is the whole walk cycle */}
        <Rect x={x - 9 * s} y={y + 6 * s + swing} width={6 * s} height={9 * s} rx={2.5 * s} fill="#2A2E35" />
        <Rect x={x + 3 * s} y={y + 6 * s - swing} width={6 * s} height={9 * s} rx={2.5 * s} fill="#2A2E35" />
        {/* arms */}
        <Rect x={x - 15 * s} y={y - 4 * s} width={5 * s} height={13 * s} rx={2.5 * s} fill={shirt} />
        <Rect x={x + 10 * s} y={y - 4 * s} width={5 * s} height={13 * s} rx={2.5 * s} fill={shirt} />
        {/* shoulders / torso in a vest */}
        <Rect x={x - 11 * s} y={y - 8 * s} width={22 * s} height={19 * s} rx={5 * s} fill={vest} />
        <Rect x={x - 11 * s} y={y - 2 * s} width={22 * s} height={3 * s} fill="#F5FBD6" opacity={0.85} />
        <Rect x={x - 11 * s} y={y + 5 * s} width={22 * s} height={3 * s} fill="#F5FBD6" opacity={0.85} />
        {/* tool pouch on the hip */}
        <Rect x={x + 9 * s} y={y + 1 * s} width={6 * s} height={8 * s} rx={2 * s} fill={SKY.woodDark} />
        {/* hard hat, with a brim toward the facing direction */}
        <Circle cx={x} cy={y - 3 * s} r={9.5 * s} fill={hat} />
        <Path d={`M ${x - 9.5 * s} ${y - 4 * s} a ${9.5 * s} ${9.5 * s} 0 0 1 ${19 * s} 0 Z`} fill={hat} opacity={0.55} />
        <Rect x={x - 10.5 * s} y={y - 7 * s} width={21 * s} height={3.5 * s} rx={1.7 * s} fill={hat} />
        <Ellipse cx={x} cy={y - 5 * s} rx={3 * s} ry={2 * s} fill="#fff" opacity={0.22} />
      </G>
    </G>
  );
};

/** Role presets, so a foreman is recognisably not an apprentice. */
export const ROLE_LOOK = {
  foreman:    { hat: '#DC2626', vest: SKY.vestOrange, shirt: '#3A2F2A' },
  journeyman: { hat: SKY.amber, vest: SKY.vestLime,   shirt: '#2E3440' },
  apprentice: { hat: '#3B82F6', vest: SKY.vestLime,   shirt: '#2E3440' },
  owner:      { hat: '#FFFFFF', vest: '#7FB3E8',      shirt: '#1F2937' },
  gc:         { hat: '#16A34A', vest: SKY.vestOrange, shirt: '#22303C' },
  inspector:  { hat: '#FFFFFF', vest: '#E879F9',      shirt: '#312A3A' },
  plumber:    { hat: '#0EA5E9', vest: '#9AD5F0',      shirt: '#24313A' },
  hvac:       { hat: '#64748B', vest: '#CBD5E1',      shirt: '#2B3038' },
};

// ─── Props ───────────────────────────────────────────────────────────────────

export const Panelboard = ({ tx, ty }) => {
  const x = tx * TILE, y = ty * TILE;
  const w = TILE * 0.36, h = TILE * 0.56;
  return (
    <G>
      <Shade x={x} y={y + h * 0.4} rx={w * 0.7} ry={h * 0.22} />
      <Rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={3} fill={SKY.panelGrey} />
      <Rect x={x - w / 2 + 3} y={y - h / 2 + 3} width={w - 6} height={h - 6} rx={2} fill="#9AA1A9" />
      {[0, 1, 2, 3, 4].map((i) => (
        <Rect key={i} x={x - w / 2 + 6} y={y - h / 2 + 7 + i * (h - 16) / 5} width={w - 12} height={3} rx={1.5} fill="#4B5058" />
      ))}
      <Circle cx={x + w / 2 - 5} cy={y} r={2} fill="#3A3F46" />
    </G>
  );
};

export const JBox = ({ tx, ty }) => {
  const x = tx * TILE, y = ty * TILE, s = TILE * 0.17;
  return (
    <G>
      <Shade x={x} y={y + s * 0.7} rx={s * 0.8} ry={s * 0.35} />
      <Rect x={x - s / 2} y={y - s / 2} width={s} height={s} rx={2} fill="#B34A2E" />
      <Rect x={x - s / 2 + 2} y={y - s / 2 + 2} width={s - 4} height={s - 4} rx={1} fill="#C85838" />
      <Circle cx={x} cy={y} r={s * 0.16} fill="#8C3A22" />
    </G>
  );
};

export const EmtRun = ({ tx, ty, len = 3, horiz = true }) => {
  const x = tx * TILE, y = ty * TILE;
  const L = len * TILE;
  return (
    <G>
      {horiz ? (
        <>
          <Rect x={x} y={y + 3} width={L} height={TILE * 0.075} rx={3} fill={SKY.shadow} />
          <Rect x={x} y={y} width={L} height={TILE * 0.075} rx={3} fill={SKY.emt} />
          <Rect x={x} y={y} width={L} height={1.5} rx={1} fill="#EDF1F5" />
        </>
      ) : (
        <>
          <Rect x={x + 3} y={y} width={TILE * 0.075} height={L} rx={3} fill={SKY.shadow} />
          <Rect x={x} y={y} width={TILE * 0.075} height={L} rx={3} fill={SKY.emt} />
        </>
      )}
      {Array.from({ length: len }, (_, i) => (
        horiz
          ? <Rect key={i} x={x + i * TILE + TILE * 0.4} y={y - 2} width={TILE * 0.06} height={TILE * 0.14} rx={2} fill={SKY.steelDark} />
          : <Rect key={i} x={x - 2} y={y + i * TILE + TILE * 0.4} width={TILE * 0.14} height={TILE * 0.06} rx={2} fill={SKY.steelDark} />
      ))}
    </G>
  );
};

export const AFrameLadder = ({ tx, ty }) => {
  const x = tx * TILE, y = ty * TILE, w = TILE * 0.34, h = TILE * 0.44;
  return (
    <G>
      <Shade x={x} y={y} rx={w * 0.75} ry={h * 0.5} />
      <Rect x={x - w / 2} y={y - h / 2} width={w * 0.16} height={h} rx={2} fill={SKY.amber} />
      <Rect x={x + w / 2 - w * 0.16} y={y - h / 2} width={w * 0.16} height={h} rx={2} fill="#D98C12" />
      {[0.2, 0.42, 0.64, 0.86].map((f) => (
        <Rect key={f} x={x - w / 2} y={y - h / 2 + h * f} width={w} height={h * 0.07} fill="#E5A62A" />
      ))}
    </G>
  );
};

export const WireReel = ({ tx, ty }) => {
  const x = tx * TILE, y = ty * TILE, r = TILE * 0.2;
  return (
    <G>
      <Shade x={x} y={y + r * 0.35} rx={r * 1.05} ry={r * 0.45} />
      <Circle cx={x} cy={y} r={r} fill={SKY.wood} />
      <Circle cx={x} cy={y} r={r * 0.92} fill="none" stroke={SKY.woodDark} strokeWidth={2} />
      <Circle cx={x} cy={y} r={r * 0.55} fill={SKY.copper} />
      <Circle cx={x} cy={y} r={r * 0.5} fill="none" stroke="#A5652F" strokeWidth={1.5} />
      <Circle cx={x} cy={y} r={r * 0.16} fill="#5E4526" />
    </G>
  );
};

export const GangBox = ({ tx, ty }) => {
  const x = tx * TILE, y = ty * TILE, w = TILE * 0.62, h = TILE * 0.34;
  return (
    <G>
      <Shade x={x} y={y + h * 0.55} rx={w * 0.55} ry={h * 0.3} />
      <Rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={4} fill="#2F5E8C" />
      <Rect x={x - w / 2} y={y - h / 2} width={w} height={h * 0.32} rx={4} fill="#3D74AA" />
      <Rect x={x - w * 0.12} y={y - h / 2} width={w * 0.24} height={h} fill="#24486B" opacity={0.6} />
      <Circle cx={x} cy={y + h * 0.06} r={3} fill="#D8DFE6" />
    </G>
  );
};

export const MaterialCart = ({ tx, ty }) => {
  const x = tx * TILE, y = ty * TILE, w = TILE * 0.66, h = TILE * 0.38;
  return (
    <G>
      <Shade x={x} y={y + h * 0.5} rx={w * 0.55} ry={h * 0.3} />
      <Rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={4} fill="#5A6069" />
      {[0.22, 0.42, 0.62, 0.82].map((f) => (
        <Rect key={f} x={x - w / 2 + 4} y={y - h / 2 + h * f} width={w - 8} height={h * 0.12} rx={2} fill={SKY.emt} />
      ))}
      {[-1, 1].map((sx) => [-1, 1].map((sy) => (
        <Circle key={`${sx}${sy}`} cx={x + sx * w * 0.4} cy={y + sy * h * 0.42} r={3.5} fill="#22262C" />
      )))}
    </G>
  );
};

export const PrintTable = ({ tx, ty }) => {
  const x = tx * TILE, y = ty * TILE, w = TILE * 0.6, h = TILE * 0.42;
  return (
    <G>
      <Shade x={x} y={y + h * 0.5} rx={w * 0.55} ry={h * 0.28} />
      <Rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={3} fill={SKY.wood} />
      <Rect x={x - w * 0.36} y={y - h * 0.3} width={w * 0.72} height={h * 0.6} rx={2} fill="#DCE9F3" />
      {[0.25, 0.45, 0.65].map((f) => (
        <Rect key={f} x={x - w * 0.3} y={y - h * 0.3 + h * f} width={w * 0.6} height={1.2} fill="#7FA8C9" />
      ))}
    </G>
  );
};

export const DrywallStack = ({ tx, ty }) => {
  const x = tx * TILE, y = ty * TILE, w = TILE * 0.74, h = TILE * 0.3;
  return (
    <G>
      <Shade x={x} y={y + h * 0.55} rx={w * 0.55} ry={h * 0.3} />
      {[0, 1, 2].map((i) => (
        <Rect key={i} x={x - w / 2} y={y - h / 2 - i * 2.5} width={w} height={h} rx={2}
          fill={i % 2 ? '#E8E2D2' : '#DED8C6'} stroke="#C6BFA9" strokeWidth={0.8} />
      ))}
    </G>
  );
};

export const SafetyCone = ({ tx, ty }) => {
  const x = tx * TILE, y = ty * TILE, r = TILE * 0.11;
  return (
    <G>
      <Shade x={x} y={y + r * 0.5} rx={r * 1.2} ry={r * 0.5} />
      <Circle cx={x} cy={y} r={r} fill="#F2600C" />
      <Circle cx={x} cy={y} r={r * 0.62} fill="#FFF4EC" />
      <Circle cx={x} cy={y} r={r * 0.3} fill="#F2600C" />
    </G>
  );
};

export const WorkTruck = ({ tx, ty }) => {
  const x = tx * TILE, y = ty * TILE, w = TILE * 1.5, h = TILE * 0.72;
  return (
    <G>
      <Shade x={x} y={y + h * 0.5} rx={w * 0.52} ry={h * 0.35} o={0.32} />
      <Rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={7} fill="#E8EAEC" />
      <Rect x={x - w / 2 + w * 0.05} y={y - h / 2 + 4} width={w * 0.3} height={h - 8} rx={5} fill="#C9CDD2" />
      <Rect x={x + w * 0.06} y={y - h / 2 + 5} width={w * 0.4} height={h - 10} rx={3} fill="#B3B8BE" />
      {[0.24, 0.5, 0.76].map((f) => (
        <Rect key={f} x={x + w * 0.08} y={y - h / 2 + 6 + (h - 12) * f} width={w * 0.36} height={2} fill="#9AA0A6" />
      ))}
      <Rect x={x - w / 2 - 2} y={y - h * 0.2} width={4} height={h * 0.4} rx={2} fill="#F4A11D" />
      {[-1, 1].map((sy) => (
        <G key={sy}>
          <Rect x={x - w * 0.34} y={y + sy * h * 0.44} width={w * 0.16} height={6} rx={3} fill="#1F2328" />
          <Rect x={x + w * 0.2} y={y + sy * h * 0.44} width={w * 0.16} height={6} rx={3} fill="#1F2328" />
        </G>
      ))}
    </G>
  );
};

export const Dumpster = ({ tx, ty }) => {
  const x = tx * TILE, y = ty * TILE, w = TILE * 1.25, h = TILE * 0.62;
  return (
    <G>
      <Shade x={x} y={y + h * 0.45} rx={w * 0.5} ry={h * 0.3} />
      <Rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={4} fill="#2F6B4F" />
      <Rect x={x - w / 2 + 4} y={y - h / 2 + 4} width={w - 8} height={h - 8} rx={2} fill="#245840" />
      {[0.3, 0.55, 0.8].map((f) => (
        <Rect key={f} x={x - w / 2 + w * f} y={y - h / 2 + 6} width={3} height={h - 12} fill="#1D4633" />
      ))}
    </G>
  );
};

export const SiteTrailer = ({ tx, ty }) => {
  const x = tx * TILE, y = ty * TILE, w = TILE * 2.1, h = TILE * 0.95;
  return (
    <G>
      <Shade x={x} y={y + h * 0.48} rx={w * 0.5} ry={h * 0.3} o={0.3} />
      <Rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={5} fill="#DFE3E7" />
      <Rect x={x - w / 2} y={y - h / 2} width={w} height={h * 0.18} fill="#C4C9CF" />
      {[0.2, 0.44, 0.68].map((f) => (
        <Rect key={f} x={x - w / 2 + w * f} y={y - h * 0.12} width={w * 0.13} height={h * 0.34} rx={2} fill="#8FB6D6" />
      ))}
      <Rect x={x + w * 0.3} y={y - h * 0.12} width={w * 0.11} height={h * 0.5} rx={2} fill="#7A828B" />
    </G>
  );
};

export const Tree = ({ tx, ty, r = TILE * 0.42 }) => {
  const x = tx * TILE, y = ty * TILE;
  return (
    <G>
      <Shade x={x + r * 0.2} y={y + r * 0.35} rx={r * 0.9} ry={r * 0.5} o={0.25} />
      <Circle cx={x} cy={y} r={r} fill="#4E7A3E" />
      <Circle cx={x - r * 0.25} cy={y - r * 0.25} r={r * 0.72} fill="#5E8F4A" />
      <Circle cx={x + r * 0.3} cy={y + r * 0.2} r={r * 0.5} fill="#436A35" />
    </G>
  );
};

export const Palm = ({ tx, ty }) => {
  const x = tx * TILE, y = ty * TILE, r = TILE * 0.36;
  return (
    <G>
      <Shade x={x + r * 0.2} y={y + r * 0.3} rx={r * 0.8} ry={r * 0.4} o={0.22} />
      {[0, 60, 120, 180, 240, 300].map((a) => {
        const rad = (a * Math.PI) / 180;
        return (
          <Ellipse key={a} cx={x + Math.cos(rad) * r * 0.62} cy={y + Math.sin(rad) * r * 0.62}
            rx={r * 0.46} ry={r * 0.2} fill="#4F8A46" transform={`rotate(${a} ${x + Math.cos(rad) * r * 0.62} ${y + Math.sin(rad) * r * 0.62})`} />
        );
      })}
      <Circle cx={x} cy={y} r={r * 0.2} fill="#7A5E33" />
    </G>
  );
};

export const FenceRun = ({ tx, ty, len = 4, horiz = true }) => {
  const x = tx * TILE, y = ty * TILE, L = len * TILE;
  return (
    <G opacity={0.9}>
      {horiz
        ? <Rect x={x} y={y} width={L} height={TILE * 0.06} fill="#8D949B" />
        : <Rect x={x} y={y} width={TILE * 0.06} height={L} fill="#8D949B" />}
      {Array.from({ length: len + 1 }, (_, i) => (
        horiz
          ? <Rect key={i} x={x + i * TILE} y={y - 3} width={4} height={TILE * 0.06 + 6} rx={2} fill="#6E757C" />
          : <Rect key={i} x={x - 3} y={y + i * TILE} width={TILE * 0.06 + 6} height={4} rx={2} fill="#6E757C" />
      ))}
    </G>
  );
};

export const Pallet = ({ tx, ty }) => {
  const x = tx * TILE, y = ty * TILE, w = TILE * 0.62, h = TILE * 0.46;
  return (
    <G>
      <Shade x={x} y={y + h * 0.4} rx={w * 0.5} ry={h * 0.25} />
      <Rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={2} fill={SKY.woodDark} />
      {[0.12, 0.4, 0.68].map((f) => (
        <Rect key={f} x={x - w / 2} y={y - h / 2 + h * f} width={w} height={h * 0.2} fill={SKY.wood} />
      ))}
    </G>
  );
};

// ─── Slab detail, lighting, atmosphere ──────────────────────────────────────
// The three layers that stop a floor plan reading as grey rectangles. All of
// them are DETERMINISTIC from tile coordinates — no randomness — so the slab
// looks the same every time you walk back into a room. A floor that reshuffles
// its own scuff marks between visits is worse than a plain one.

/** Cheap stable hash. Same tile, same marks, every render. */
const h2 = (a, b) => {
  let n = (a * 73856093) ^ (b * 19349663);
  n = (n ^ (n >>> 13)) >>> 0;
  return n / 4294967295;
};

/**
 * What is actually written on a commercial slab.
 *
 * Layout marks, chalk lines and pallet stains are the details a person who has
 * stood on one recognises instantly, and none of them cost more than a line.
 * Drawn as one layer above the tiles and below everything else, so it reads as
 * being ON the floor rather than as objects.
 */
export const SlabMarks = ({ tx, ty }) => {
  const x = tx * TILE, y = ty * TILE;
  const r = h2(tx, ty);
  const marks = [];

  // Blue chalk snap lines, running the length of a bay.
  if ((tx * 3 + ty * 5) % 11 === 0) {
    marks.push(
      <Line key="chalk" x1={x} y1={y + TILE * 0.32} x2={x + TILE} y2={y + TILE * 0.32}
        stroke="#3F6FA8" strokeWidth={1.4} opacity={0.42} />,
    );
  }
  // Layout marks: the crosses and short ticks that say where a box lands.
  if (r > 0.86) {
    marks.push(
      <G key="mark" opacity={0.5}>
        <Line x1={x + TILE * 0.42} y1={y + TILE * 0.58} x2={x + TILE * 0.62} y2={y + TILE * 0.58} stroke="#C0453A" strokeWidth={1.6} />
        <Line x1={x + TILE * 0.52} y1={y + TILE * 0.48} x2={x + TILE * 0.52} y2={y + TILE * 0.68} stroke="#C0453A" strokeWidth={1.6} />
      </G>,
    );
  }
  // Pallet stain — a square of clean slab where something sat for a month.
  if (r > 0.955) {
    marks.push(
      <Rect key="pallet" x={x + TILE * 0.16} y={y + TILE * 0.16} width={TILE * 0.66} height={TILE * 0.66}
        fill="#A7ACB0" opacity={0.26} rx={2} />,
    );
  }
  // Scuff: a boot arc, or a wheel drag.
  if (r > 0.62 && r < 0.70) {
    marks.push(
      <Path key="scuff" d={`M ${x + TILE * 0.2} ${y + TILE * 0.76} q ${TILE * 0.3} ${-TILE * 0.16} ${TILE * 0.6} ${TILE * 0.04}`}
        stroke="#8E949A" strokeWidth={2.2} fill="none" opacity={0.3} strokeLinecap="round" />,
    );
  }

  return marks.length ? <G>{marks}</G> : null;
};

/**
 * Daylight through the openings.
 *
 * Warm pools on the slab, cool everywhere else. This is the single biggest
 * change in how the site reads: an evenly lit floor looks like a diagram, and
 * a floor with light falling across it looks like a room. Drawn above the slab
 * and below the walls so the studs cast into it.
 */
export const Daylight = ({ pools = [] }) => (
  <G pointerEvents="none">
    <Defs>
      <RadialGradient id="sunpool" cx="50%" cy="50%" r="50%">
        <Stop offset="0%" stopColor="#FFE7BC" stopOpacity="0.30" />
        <Stop offset="60%" stopColor="#FFD79A" stopOpacity="0.12" />
        <Stop offset="100%" stopColor="#FFD79A" stopOpacity="0" />
      </RadialGradient>
    </Defs>
    {pools.map((p, i) => (
      <Ellipse key={i} cx={p.x * TILE} cy={p.y * TILE}
        rx={(p.r ?? 3) * TILE} ry={(p.r ?? 3) * TILE * 0.78} fill="url(#sunpool)" />
    ))}
  </G>
);

/**
 * The cool half of the same decision.
 *
 * A flat wash would kill the daylight; this is a soft vignette that only bites
 * at the edges of the viewport, so the middle of the room stays legible and the
 * corners fall away.
 */
export const AmbientShade = ({ w, h }) => (
  <G pointerEvents="none">
    <Defs>
      <RadialGradient id="vign" cx="50%" cy="45%" r="72%">
        <Stop offset="55%" stopColor="#0A1018" stopOpacity="0" />
        <Stop offset="100%" stopColor="#0A1018" stopOpacity="0.5" />
      </RadialGradient>
    </Defs>
    <Rect x={0} y={0} width={w} height={h} fill="url(#vign)" />
  </G>
);

/**
 * Dust in the light.
 *
 * Deliberately few and slow. Motes that move fast read as snow, and a screen
 * full of drifting particles is the thing that makes a game look cheap rather
 * than atmospheric. `t` is a frame counter from the screen; with reduced motion
 * the caller simply stops advancing it and the dust holds still.
 */
export const DustMotes = ({ pools = [], t = 0 }) => (
  <G pointerEvents="none" opacity={0.5}>
    {pools.flatMap((p, pi) => (
      [0, 1, 2, 3].map((k) => {
        const seed = h2(pi + 1, k + 1);
        const drift = Math.sin(t * 0.012 + seed * 6.28) * TILE * 0.5;
        const rise = ((t * 0.16 + seed * 200) % 140) / 140;
        return (
          <Circle
            key={`${pi}-${k}`}
            cx={p.x * TILE + drift + (seed - 0.5) * TILE * 2.2}
            cy={p.y * TILE + TILE * 1.4 - rise * TILE * 2.6}
            r={1.5 + seed}
            fill="#FFF0D0"
            opacity={0.5 * (1 - rise)}
          />
        );
      })
    ))}
  </G>
);

/**
 * Scissor lift, parked. Two tiles wide.
 *
 * The one object on site big enough that you go round it rather than past it,
 * which is why it is drawn to its real footprint instead of a tile-sized icon —
 * a lift you can walk through is the thing that makes the whole site read as a
 * painting.
 */
export const ScissorLift = ({ tx, ty }) => {
  const x = tx * TILE, y = ty * TILE, w = TILE * 1.7, h = TILE * 0.8;
  return (
    <G>
      <Shade x={x} y={y + h * 0.42} rx={w * 0.5} ry={h * 0.28} />
      {/* Deck */}
      <Rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={5} fill="#6B7076" />
      <Rect x={x - w / 2 + 3} y={y - h / 2 + 3} width={w - 6} height={h - 6} rx={4} fill="#8B9199" />
      {/* Rail, which is what you actually see from above */}
      <Rect x={x - w / 2 + 2} y={y - h / 2 + 2} width={w - 4} height={h - 4} rx={4}
        fill="none" stroke={SKY.amber} strokeWidth={3} />
      {/* Scissor legs showing through the deck grate */}
      {[-0.22, 0.22].map((f) => (
        <G key={f}>
          <Line x1={x + w * f - 10} y1={y - h * 0.22} x2={x + w * f + 10} y2={y + h * 0.22}
            stroke="#5A6068" strokeWidth={3} />
          <Line x1={x + w * f - 10} y1={y + h * 0.22} x2={x + w * f + 10} y2={y - h * 0.22}
            stroke="#5A6068" strokeWidth={3} />
        </G>
      ))}
      {[-1, 1].map((s) => [-1, 1].map((t) => (
        <Circle key={`${s}${t}`} cx={x + s * (w * 0.38)} cy={y + t * (h * 0.34)} r={4} fill="#3A3E44" />
      )))}
    </G>
  );
};

/**
 * Temporary power pole.
 *
 * First thing up on any site and the last thing down, which is exactly why it
 * belongs here: a site with no temp power has no explanation for where the
 * saws are plugged in.
 */
export const TempPower = ({ tx, ty }) => {
  const x = tx * TILE, y = ty * TILE, w = TILE * 0.5;
  return (
    <G>
      <Shade x={x} y={y + w * 0.3} rx={w * 0.6} ry={w * 0.3} />
      {/* Base and post, seen down the length of it */}
      <Rect x={x - w * 0.55} y={y - w * 0.25} width={w * 1.1} height={w * 0.5} rx={3} fill={SKY.woodDark} />
      <Rect x={x - w * 0.16} y={y - w * 0.7} width={w * 0.32} height={w * 1.4} rx={3} fill={SKY.wood} />
      {/* The board: a couple of outlets and the cords leaving it */}
      <Rect x={x - w * 0.4} y={y - w * 0.5} width={w * 0.8} height={w * 0.42} rx={3} fill="#3E4A5A" />
      {[-0.14, 0.14].map((f) => (
        <Circle key={f} cx={x + w * f} cy={y - w * 0.29} r={2.6} fill="#D8DFE6" />
      ))}
      <Path d={`M ${x + w * 0.3} ${y - w * 0.1} q ${w * 0.5} ${w * 0.3} ${w * 0.9} ${w * 0.1}`}
        stroke="#E2A11D" strokeWidth={2.5} fill="none" strokeLinecap="round" />
    </G>
  );
};

/** A strapped bundle of conduit, lying against a wall. Two tiles long. */
export const ConduitBundle = ({ tx, ty }) => {
  const x = tx * TILE, y = ty * TILE, w = TILE * 1.75;
  return (
    <G>
      <Shade x={x} y={y + 7} rx={w * 0.5} ry={7} />
      {[-6, -1, 4].map((dy, i) => (
        <Rect key={dy} x={x - w / 2 + i * 3} y={y + dy} width={w - i * 6} height={4.4} rx={2.2}
          fill={i === 1 ? SKY.emt : SKY.steelMid} />
      ))}
      {/* Straps */}
      {[-0.26, 0.26].map((f) => (
        <Rect key={f} x={x + w * f - 2} y={y - 9} width={4} height={19} rx={1.5} fill="#2E3238" opacity={0.75} />
      ))}
    </G>
  );
};

// ─── Markers ─────────────────────────────────────────────────────────────────

/** Orange objective pin, pulsing. */
export const ObjectiveMarker = ({ tx, ty, pulse = 0 }) => {
  const x = tx * TILE, y = ty * TILE - TILE * 0.5 - pulse * 3;
  const r = TILE * 0.15;
  return (
    <G>
      <Circle cx={x} cy={y} r={r * (1.6 + pulse * 0.35)} fill={SKY.orange} opacity={0.18} />
      <Path d={`M ${x} ${y + r * 1.9} L ${x - r} ${y + r * 0.3} A ${r} ${r} 0 1 1 ${x + r} ${y + r * 0.3} Z`} fill={SKY.orange} />
      <Circle cx={x} cy={y} r={r * 0.9} fill="#FFF6EC" />
      <Rect x={x - r * 0.13} y={y - r * 0.45} width={r * 0.26} height={r * 0.62} rx={r * 0.13} fill={SKY.orange} />
      <Circle cx={x} cy={y + r * 0.4} r={r * 0.14} fill={SKY.orange} />
    </G>
  );
};

export const DoneMarker = ({ tx, ty }) => {
  const x = tx * TILE, y = ty * TILE - TILE * 0.5;
  const r = TILE * 0.14;
  return (
    <G>
      <Circle cx={x} cy={y} r={r} fill={SKY.green} />
      <Path d={`M ${x - r * 0.45} ${y} l ${r * 0.32} ${r * 0.36} l ${r * 0.6} ${-r * 0.7}`}
        stroke="#fff" strokeWidth={r * 0.28} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </G>
  );
};
