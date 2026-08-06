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
import { G, Rect, Circle, Ellipse, Path, Line, Defs, LinearGradient, Stop } from 'react-native-svg';

import { TILE } from '../core/game/topdown';

export const SKY = {
  // Daylight. The old palette was near-black and made an unfinished shell look
  // like a dungeon.
  dirt: '#B8A88C', dirtAlt: '#AE9E82', dirtDark: '#9C8C72',
  slab: '#BFC3C6', slabAlt: '#B7BBBE', joint: '#9DA2A6',
  grass: '#7C9A62', asphalt: '#6E7278',
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

export const SlabTile = ({ tx, ty, indoor }) => {
  const x = tx * TILE, y = ty * TILE;
  const alt = (tx + ty) % 2 === 0;
  if (!indoor) {
    return (
      <G>
        <Rect x={x} y={y} width={TILE + 1} height={TILE + 1} fill={alt ? SKY.dirt : SKY.dirtAlt} />
        {/* tyre ruts and scuff, so the yard is not a flat colour */}
        {(tx * 7 + ty * 3) % 5 === 0 && (
          <Ellipse cx={x + TILE * 0.4} cy={y + TILE * 0.6} rx={TILE * 0.3} ry={TILE * 0.12} fill={SKY.dirtDark} opacity={0.5} />
        )}
      </G>
    );
  }
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
export const StudWall = ({ tx, ty, horiz }) => {
  const x = tx * TILE, y = ty * TILE;
  const T = TILE * 0.115;          // track thickness
  const D = TILE * 0.30;           // wall depth (track to track)
  const off = (TILE - D) / 2;
  const studs = [0.14, 0.38, 0.62, 0.86];

  if (horiz) {
    return (
      <G>
        <Rect x={x} y={y + off + D} width={TILE + 1} height={TILE * 0.09} fill={SKY.shadow} />
        {studs.map((f) => (
          <Rect key={f} x={x + TILE * f - TILE * 0.035} y={y + off} width={TILE * 0.07} height={D}
            fill={SKY.steelMid} />
        ))}
        <Rect x={x} y={y + off} width={TILE + 1} height={T} fill={SKY.steel} />
        <Rect x={x} y={y + off + D - T} width={TILE + 1} height={T} fill={SKY.steelMid} />
        <Rect x={x} y={y + off} width={TILE + 1} height={0.8} fill="#F2F5F8" opacity={0.8} />
      </G>
    );
  }
  return (
    <G>
      <Rect x={x + off + D} y={y} width={TILE * 0.09} height={TILE + 1} fill={SKY.shadow} />
      {studs.map((f) => (
        <Rect key={f} x={x + off} y={y + TILE * f - TILE * 0.035} width={D} height={TILE * 0.07}
          fill={SKY.steelMid} />
      ))}
      <Rect x={x + off} y={y} width={T} height={TILE + 1} fill={SKY.steel} />
      <Rect x={x + off + D - T} y={y} width={T} height={TILE + 1} fill={SKY.steelMid} />
      <Rect x={x + off} y={y} width={0.8} height={TILE + 1} fill="#F2F5F8" opacity={0.8} />
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
