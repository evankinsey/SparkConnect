// ─── JOBSITE ART ─────────────────────────────────────────────────────────────
// The isometric prop kit. Every piece draws in world space around its own tile
// origin and is positioned by the caller, so a prop can be dropped anywhere on
// the map without knowing about the camera.
//
// Style rules that keep twenty separate props looking like one job site:
//   • one light direction — top-left, so every left face is lit and every
//     right face is in shade
//   • the same four-value grey ramp for metal, the same two for concrete
//   • nothing is drawn in pure black or pure white; the site is lit by one
//     work light, not by a studio
//
// These are components, not data, so they live beside the screen rather than in
// core/ — a bundler turns them into render calls and a node test cannot import
// them.

import React from 'react';
import { G, Path, Rect, Circle, Ellipse, Line } from 'react-native-svg';

import { TILE_W, TILE_H, WALL_H, toIso } from '../core/game/iso';

export const PALETTE = {
  slab: '#33383F', slabAlt: '#2C3138', slabLine: '#272B31',
  ground: '#1B1E23', groundAlt: '#20242A',
  steelLit: '#9AA1AA', steelMid: '#767D86', steelDark: '#4C525A', steelEdge: '#3A3F46',
  track: '#5E656E',
  panelBody: '#3F464F', panelDoor: '#4A525C', panelTrim: '#2E343B',
  conduit: '#B9BFC6', conduitDark: '#858C94',
  wood: '#7A5C3A', woodDark: '#5C4429',
  amber: '#F4A11D', amberDim: '#B87A15',
  green: '#22C55E',
  shadow: 'rgba(0,0,0,0.45)',
  copper: '#B87333',
};

/** Ground shadow under anything that stands on the floor. */
export const Shadow = ({ x, y, rx = TILE_W * 0.3, ry = TILE_H * 0.3, o = 0.45 }) => {
  const p = toIso(x, y);
  return <Ellipse cx={p.x} cy={p.y} rx={rx} ry={ry} fill="#000" opacity={o} />;
};

/**
 * One metal stud wall section, standing on tile (x,y).
 *
 * Drawn as a real box: a lit left face, a shaded right face, a top cap and
 * individual studs with visible thickness. This is the single biggest reason
 * the site stopped looking like coloured tiles — a wall with two shaded faces
 * and a cap reads as an object with volume, and a flat rectangle never does.
 */
export const StudWall = ({ x, y, height = WALL_H, open = false }) => {
  const b = toIso(x, y);
  const hw = TILE_W / 2, hh = TILE_H / 2;
  const h = open ? height * 0.22 : height;   // a door opening keeps only its header

  // Diamond footprint corners
  const top = { x: b.x, y: b.y - hh };
  const right = { x: b.x + hw, y: b.y };
  const bottom = { x: b.x, y: b.y + hh };
  const left = { x: b.x - hw, y: b.y };

  return (
    <G>
      {/* Left face (lit) */}
      <Path
        d={`M ${left.x} ${left.y} L ${bottom.x} ${bottom.y} L ${bottom.x} ${bottom.y - h} L ${left.x} ${left.y - h} Z`}
        fill={PALETTE.steelMid} />
      {/* Right face (shade) */}
      <Path
        d={`M ${bottom.x} ${bottom.y} L ${right.x} ${right.y} L ${right.x} ${right.y - h} L ${bottom.x} ${bottom.y - h} Z`}
        fill={PALETTE.steelDark} />

      {/* Studs on the lit face, with thickness */}
      {!open && [0.3, 0.62, 0.94].map((f) => {
        const sx = left.x + (bottom.x - left.x) * f;
        const sy = left.y + (bottom.y - left.y) * f;
        return (
          <G key={`l${f}`}>
            <Rect x={sx - 2.5} y={sy - h} width={5} height={h} fill={PALETTE.steelLit} />
            <Rect x={sx + 2.5} y={sy - h} width={1.5} height={h} fill={PALETTE.steelEdge} />
          </G>
        );
      })}
      {/* Studs on the shaded face */}
      {!open && [0.3, 0.62, 0.94].map((f) => {
        const sx = bottom.x + (right.x - bottom.x) * f;
        const sy = bottom.y + (right.y - bottom.y) * f;
        return <Rect key={`r${f}`} x={sx - 2.5} y={sy - h} width={5} height={h} fill={PALETTE.steelMid} opacity={0.75} />;
      })}

      {/* Top and bottom track */}
      <Path d={`M ${left.x} ${left.y - h} L ${bottom.x} ${bottom.y - h} L ${right.x} ${right.y - h} L ${top.x} ${top.y - h} Z`}
        fill={PALETTE.track} />
      <Path d={`M ${left.x} ${left.y - h} L ${bottom.x} ${bottom.y - h} L ${right.x} ${right.y - h} L ${top.x} ${top.y - h} Z`}
        fill="none" stroke={PALETTE.steelEdge} strokeWidth={1} />
      {!open && (
        <Path d={`M ${left.x} ${left.y - 4} L ${bottom.x} ${bottom.y - 4} L ${right.x} ${right.y - 4}`}
          stroke={PALETTE.track} strokeWidth={3} fill="none" />
      )}
    </G>
  );
};

/** A floor tile. Concrete inside rooms, dirt in the yard. */
export const FloorTile = ({ x, y, indoor }) => {
  const b = toIso(x, y);
  const hw = TILE_W / 2, hh = TILE_H / 2;
  const base = indoor
    ? ((x + y) % 2 === 0 ? PALETTE.slab : PALETTE.slabAlt)
    : ((x + y) % 2 === 0 ? PALETTE.ground : PALETTE.groundAlt);
  return (
    <G>
      <Path d={`M ${b.x} ${b.y - hh} L ${b.x + hw} ${b.y} L ${b.x} ${b.y + hh} L ${b.x - hw} ${b.y} Z`}
        fill={base} stroke={indoor ? PALETTE.slabLine : 'none'} strokeWidth={indoor ? 0.75 : 0} />
    </G>
  );
};

/** Electrical panel on a wall. The thing the whole game points at. */
export const Panel = ({ x, y, energized = false }) => {
  const b = toIso(x, y);
  const w = 22, h = 34, lift = 26;
  return (
    <G>
      <Shadow x={x} y={y} rx={16} ry={8} o={0.35} />
      <Rect x={b.x - w / 2} y={b.y - lift - h} width={w} height={h} rx={2} fill={PALETTE.panelBody} />
      <Rect x={b.x - w / 2 + 3} y={b.y - lift - h + 3} width={w - 6} height={h - 6} rx={1} fill={PALETTE.panelDoor} />
      <Rect x={b.x - w / 2} y={b.y - lift - h} width={w} height={h} rx={2} fill="none" stroke={PALETTE.panelTrim} strokeWidth={1.5} />
      {/* Breaker rows */}
      {[0, 1, 2, 3].map((i) => (
        <Rect key={i} x={b.x - w / 2 + 5} y={b.y - lift - h + 7 + i * 6} width={w - 10} height={3} rx={1}
          fill={energized ? PALETTE.amber : PALETTE.steelDark} opacity={energized ? 0.9 : 0.7} />
      ))}
      <Circle cx={b.x + w / 2 - 4} cy={b.y - lift - h / 2} r={1.6} fill={PALETTE.steelLit} />
    </G>
  );
};

/** Gang box / junction box on a stud. */
export const JunctionBox = ({ x, y }) => {
  const b = toIso(x, y);
  return (
    <G>
      <Rect x={b.x - 7} y={b.y - 30} width={14} height={12} rx={1} fill={PALETTE.steelDark} stroke={PALETTE.steelEdge} strokeWidth={1} />
      <Rect x={b.x - 5} y={b.y - 28} width={10} height={8} fill={PALETTE.panelDoor} />
      <Line x1={b.x} y1={b.y - 18} x2={b.x} y2={b.y - 4} stroke={PALETTE.conduitDark} strokeWidth={2.5} />
    </G>
  );
};

/** A run of EMT along a wall. */
export const ConduitRun = ({ x, y, length = 2 }) => {
  const a = toIso(x, y, 40);
  const b = toIso(x + length, y, 40);
  return (
    <G>
      <Line x1={a.x} y1={a.y + 1.5} x2={b.x} y2={b.y + 1.5} stroke={PALETTE.conduitDark} strokeWidth={5} strokeLinecap="round" />
      <Line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={PALETTE.conduit} strokeWidth={3.5} strokeLinecap="round" />
      {/* Straps */}
      {Array.from({ length: Math.max(2, Math.round(length)) }, (_, i) => {
        const t = i / Math.max(1, Math.round(length) - 1);
        const px = a.x + (b.x - a.x) * t;
        const py = a.y + (b.y - a.y) * t;
        return <Rect key={i} x={px - 2} y={py - 3} width={4} height={7} rx={1} fill={PALETTE.steelMid} />;
      })}
    </G>
  );
};

/** Step ladder. */
export const Ladder = ({ x, y }) => {
  const b = toIso(x, y);
  const h = 40;
  return (
    <G>
      <Shadow x={x} y={y} rx={15} ry={7} />
      <Line x1={b.x - 9} y1={b.y} x2={b.x - 3} y2={b.y - h} stroke={PALETTE.amberDim} strokeWidth={3} strokeLinecap="round" />
      <Line x1={b.x + 4} y1={b.y + 2} x2={b.x - 1} y2={b.y - h} stroke={PALETTE.amber} strokeWidth={3} strokeLinecap="round" />
      {[0.25, 0.5, 0.75].map((f) => (
        <Line key={f} x1={b.x - 9 + 6 * f} y1={b.y - h * f} x2={b.x + 4 - 5 * f} y2={b.y - h * f + 2 - 2 * f}
          stroke={PALETTE.amberDim} strokeWidth={2} />
      ))}
      <Line x1={b.x + 10} y1={b.y + 1} x2={b.x + 1} y2={b.y - h + 2} stroke={PALETTE.amberDim} strokeWidth={2.5} strokeLinecap="round" />
    </G>
  );
};

/** Wire spool on its side. */
export const WireSpool = ({ x, y }) => {
  const b = toIso(x, y);
  return (
    <G>
      <Shadow x={x} y={y} rx={13} ry={6} />
      <Ellipse cx={b.x} cy={b.y - 9} rx={12} ry={11} fill={PALETTE.woodDark} />
      <Ellipse cx={b.x} cy={b.y - 11} rx={12} ry={11} fill={PALETTE.wood} />
      <Ellipse cx={b.x} cy={b.y - 11} rx={5} ry={4.5} fill={PALETTE.copper} />
      <Ellipse cx={b.x} cy={b.y - 11} rx={2} ry={1.8} fill={PALETTE.steelEdge} />
    </G>
  );
};

/** Work bench with a tool bag on it. */
export const WorkBench = ({ x, y }) => {
  const b = toIso(x, y);
  return (
    <G>
      <Shadow x={x} y={y} rx={24} ry={11} />
      <Path d={`M ${b.x - 26} ${b.y - 14} L ${b.x} ${b.y - 27} L ${b.x + 26} ${b.y - 14} L ${b.x} ${b.y - 1} Z`} fill={PALETTE.wood} />
      <Path d={`M ${b.x - 26} ${b.y - 14} L ${b.x} ${b.y - 1} L ${b.x} ${b.y + 4} L ${b.x - 26} ${b.y - 9} Z`} fill={PALETTE.woodDark} />
      <Path d={`M ${b.x + 26} ${b.y - 14} L ${b.x} ${b.y - 1} L ${b.x} ${b.y + 4} L ${b.x + 26} ${b.y - 9} Z`} fill="#4A3721" />
      <Rect x={b.x - 8} y={b.y - 30} width={16} height={9} rx={2} fill="#2E3238" />
      <Rect x={b.x - 8} y={b.y - 30} width={16} height={3} rx={1} fill={PALETTE.amberDim} />
    </G>
  );
};

/** Material cart. */
export const MaterialCart = ({ x, y }) => {
  const b = toIso(x, y);
  return (
    <G>
      <Shadow x={x} y={y} rx={20} ry={9} />
      <Path d={`M ${b.x - 20} ${b.y - 10} L ${b.x} ${b.y - 20} L ${b.x + 20} ${b.y - 10} L ${b.x} ${b.y} Z`} fill={PALETTE.steelDark} />
      {[0, 1, 2].map((i) => (
        <Line key={i} x1={b.x - 16 + i * 5} y1={b.y - 12 - i * 3} x2={b.x + 14 - i * 3} y2={b.y - 20 + i * 4}
          stroke={PALETTE.conduit} strokeWidth={2.5} strokeLinecap="round" />
      ))}
      <Circle cx={b.x - 12} cy={b.y + 2} r={3} fill="#1A1D21" />
      <Circle cx={b.x + 12} cy={b.y + 2} r={3} fill="#1A1D21" />
    </G>
  );
};

/** Temporary string light — the only warm thing on the site. */
export const TempLight = ({ x, y }) => {
  const b = toIso(x, y, 62);
  return (
    <G>
      <Circle cx={b.x} cy={b.y} r={16} fill={PALETTE.amber} opacity={0.12} />
      <Circle cx={b.x} cy={b.y} r={8} fill={PALETTE.amber} opacity={0.25} />
      <Circle cx={b.x} cy={b.y} r={3.2} fill="#FFE9B0" />
      <Line x1={b.x} y1={b.y - 3} x2={b.x} y2={b.y - 16} stroke={PALETTE.steelDark} strokeWidth={1.5} />
    </G>
  );
};

/** Blueprint table. */
export const PrintTable = ({ x, y }) => {
  const b = toIso(x, y);
  return (
    <G>
      <Shadow x={x} y={y} rx={22} ry={10} />
      <Path d={`M ${b.x - 22} ${b.y - 12} L ${b.x} ${b.y - 23} L ${b.x + 22} ${b.y - 12} L ${b.x} ${b.y - 1} Z`} fill="#3A4048" />
      <Path d={`M ${b.x - 14} ${b.y - 14} L ${b.x} ${b.y - 21} L ${b.x + 14} ${b.y - 14} L ${b.x} ${b.y - 7} Z`} fill="#7FA8C9" opacity={0.85} />
      {[0.35, 0.5, 0.65].map((f) => (
        <Line key={f} x1={b.x - 10} y1={b.y - 14 - (f - 0.5) * 8} x2={b.x + 10} y2={b.y - 14 - (f - 0.5) * 8}
          stroke="#2C4A63" strokeWidth={0.8} />
      ))}
    </G>
  );
};

/**
 * The player. An electrician seen from an isometric three-quarter view: hard
 * hat, hi-vis vest, tool pouch, and a facing indicator so you can tell which
 * way you are pointed without an animation system.
 */
export const Electrician = ({ x, y, facing = 'S', walking = false, ring = true }) => {
  const b = toIso(x, y);
  const bob = walking ? Math.sin(Date.now() / 90) * 1.2 : 0;
  const faceLeft = facing === 'W' || facing === 'NW' || facing === 'SW';
  const faceUp = facing === 'N' || facing === 'NE' || facing === 'NW';

  return (
    <G>
      <Shadow x={x} y={y} rx={11} ry={5.5} o={0.5} />
      {ring && <Ellipse cx={b.x} cy={b.y} rx={16} ry={8} fill="none" stroke={PALETTE.green} strokeWidth={2} opacity={0.8} />}
      {/* Legs */}
      <Rect x={b.x - 5} y={b.y - 16 + bob} width={4} height={14} rx={1.5} fill="#22262C" />
      <Rect x={b.x + 1} y={b.y - 16 - bob} width={4} height={14} rx={1.5} fill="#1C2026" />
      {/* Torso in a hi-vis vest */}
      <Rect x={b.x - 7} y={b.y - 30 + bob * 0.4} width={14} height={16} rx={3} fill="#1F242A" />
      <Rect x={b.x - 7} y={b.y - 27 + bob * 0.4} width={14} height={4} fill="#D7F205" opacity={0.92} />
      <Rect x={b.x - 7} y={b.y - 19 + bob * 0.4} width={14} height={3} fill="#D7F205" opacity={0.92} />
      {/* Tool pouch, on the side he faces */}
      <Rect x={faceLeft ? b.x - 11 : b.x + 6} y={b.y - 19} width={5} height={7} rx={1.5} fill="#4A3721" />
      {/* Head and hard hat */}
      <Circle cx={b.x} cy={b.y - 34 + bob * 0.4} r={4.6} fill="#C98C5A" />
      <Path d={`M ${b.x - 6.5} ${b.y - 35 + bob * 0.4} a 6.5 6 0 0 1 13 0 Z`} fill={PALETTE.amber} />
      <Rect x={b.x - 7.5} y={b.y - 35.5 + bob * 0.4} width={15} height={2.2} rx={1.1} fill="#FFB93A" />
      {/* Facing pip — cheap, readable, and it tells you where you will walk */}
      <Circle cx={b.x + (faceLeft ? -8 : 8)} cy={b.y - (faceUp ? 30 : 24)} r={1.8} fill={PALETTE.green} />
    </G>
  );
};

/** Objective pin: high-vis orange, floating over an active station. */
export const ObjectivePin = ({ x, y, pulse = 0 }) => {
  const b = toIso(x, y, 52 + pulse);
  return (
    <G>
      <Path d={`M ${b.x} ${b.y + 12} L ${b.x - 9} ${b.y - 4} A 9 9 0 1 1 ${b.x + 9} ${b.y - 4} Z`} fill={PALETTE.amber} />
      <Circle cx={b.x} cy={b.y - 6} r={7.5} fill={PALETTE.amber} />
      <Circle cx={b.x} cy={b.y - 6} r={7.5} fill="none" stroke="#7A4E06" strokeWidth={1} />
      <Rect x={b.x - 1.2} y={b.y - 11} width={2.4} height={6} rx={1.2} fill="#1A1408" />
      <Circle cx={b.x} cy={b.y - 2.5} r={1.3} fill="#1A1408" />
    </G>
  );
};

/** Done marker. */
export const DoneMarker = ({ x, y }) => {
  const b = toIso(x, y, 52);
  return (
    <G>
      <Circle cx={b.x} cy={b.y} r={8} fill={PALETTE.green} />
      <Path d={`M ${b.x - 3.6} ${b.y} l 2.6 2.8 l 4.8 -5.6`} stroke="#fff" strokeWidth={2.2} fill="none"
        strokeLinecap="round" strokeLinejoin="round" />
    </G>
  );
};
