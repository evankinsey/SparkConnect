// ─── ART LAYER ───────────────────────────────────────────────────────────────
// The seam that lets raster art replace vector art one prop at a time. Its one
// job is to be boring: if a change here can move a wall or a walk path, it is
// in the wrong place.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ART, Source, artLayer, readSprite, isValidSprite, missingArt, placeSprite, ART_RULES,
  TILED, isTiled, tileVariant, variantTransform,
} from '../src/core/game/artLayer.js';
import { PROPS, PropKind, ROOM_STORY, propsInRoom, buildSiteMap, protectedTiles, reachableFrom } from '../src/core/game/props.js';

const vectorFor = (names) => Object.fromEntries(names.map((n) => [n, () => null]));

test('with no art pack at all, the world still draws exactly as it does today', () => {
  // The property that makes this safe to land before a single sprite arrives.
  const layer = artLayer({ atlas: null, vector: vectorFor(ART) });
  for (const name of ART) {
    assert.equal(layer.resolve(name).source, Source.VECTOR, `${name} lost its renderer`);
  }
  assert.equal(layer.coverage().percentRaster, 0);
  assert.equal(layer.coverage().complete, true, 'every name must draw as something');
});

test('raster and vector coexist on the same frame', () => {
  // A migration that has to be a cutover is a migration nobody dares do.
  const atlas = { image: 'atlas.png', sprites: { SlabTile: { x: 0, y: 0, w: 144, h: 144 } } };
  const layer = artLayer({ atlas, vector: vectorFor(ART) });
  assert.equal(layer.resolve('SlabTile').source, Source.RASTER);
  assert.equal(layer.resolve('AFrameLadder').source, Source.VECTOR);
  const c = layer.coverage();
  assert.deepEqual([...c.raster], ['SlabTile']);
  assert.ok(c.vectorOnly.includes('AFrameLadder'));
});

test('a malformed sprite is dropped, never half-used', () => {
  // Half-using it renders at a wrong size or position, which looks like an art
  // bug and costs a round trip to the artist to disprove.
  for (const bad of [null, {}, { x: 0, y: 0, w: 0, h: 10 }, { x: 'a', y: 0, w: 1, h: 1 }, { x: 0, y: 0, w: 10 }]) {
    assert.equal(readSprite(bad), null, `accepted ${JSON.stringify(bad)}`);
    assert.equal(isValidSprite(bad), false);
  }
  const layer = artLayer({
    atlas: { image: 'a.png', sprites: { SlabTile: { x: 0, y: 0, w: 0, h: 0 } } },
    vector: vectorFor(ART),
  });
  assert.equal(layer.resolve('SlabTile').source, Source.VECTOR, 'a broken sprite must fall back');
});

test('the anchor is applied in one place', () => {
  // A prop nudged into position by a magic number at one call site is a prop
  // that is wrong at every other call site.
  const s = readSprite({ x: 0, y: 0, w: 72, h: 144, anchorX: 0.5, anchorY: 1 });
  const p = placeSprite(s, { tileX: 2, tileY: 3, tile: 72 });
  assert.equal(p.width, 72);
  assert.equal(p.height, 144);
  // Anchored at the feet: the bottom of the sprite sits at the tile centre.
  assert.equal(p.top + p.height, 3 * 72 + 36);
  assert.equal(p.left + p.width / 2, 2 * 72 + 36);

  // Out-of-range anchors are clamped rather than trusted.
  assert.equal(readSprite({ x: 0, y: 0, w: 1, h: 1, anchorY: 9 }).anchorY, 1);
  assert.equal(readSprite({ x: 0, y: 0, w: 1, h: 1, anchorX: -3 }).anchorX, 0);
});

test('a name with no art of any kind is reported, not silently blank', () => {
  const missing = missingArt(vectorFor(ART.filter((n) => n !== 'Pallet')), null);
  assert.deepEqual([...missing], ['Pallet']);
  // And the real screen has art for everything.
  assert.equal(ART.length, new Set(ART).size, 'a name is listed twice');
});

test('the art brief and the code expect the same thing', () => {
  const joined = ART_RULES.join(' ');
  assert.match(joined, /72px tile/);
  assert.match(joined, /Transparent PNG/i);
  assert.match(joined, /baked/i);
  assert.match(joined, /two thin tracks with individual studs/i, 'the wall rule must survive');
  assert.match(joined, /Never a circle with a face/i);
  assert.match(joined, /No black/i);
  assert.match(joined, /90 degrees/, 'the camera decision belongs in the brief');
});

// ─── The world the art will dress ────────────────────────────────────────────

test('every room tells a different story', () => {
  // Visual discovery, not random clutter: you should be able to tell which room
  // you are in from the floor rather than from a label.
  const seen = new Map();
  for (const roomId of Object.keys(ROOM_STORY)) {
    const kinds = propsInRoom(roomId).map((p) => p.kind).sort().join(',');
    assert.ok(kinds.length > 0, `${roomId} is empty`);
    assert.ok(!seen.has(kinds), `${roomId} is dressed identically to ${seen.get(kinds)}`);
    seen.set(kinds, roomId);
  }
});

test('each room owns at least one prop kind no other room has', () => {
  const rooms = Object.keys(ROOM_STORY);
  const kindsBy = Object.fromEntries(rooms.map((r) => [r, new Set(propsInRoom(r).map((p) => p.kind))]));
  for (const r of rooms) {
    const others = new Set(rooms.filter((x) => x !== r).flatMap((x) => [...kindsBy[x]]));
    const unique = [...kindsBy[r]].filter((k) => !others.has(k));
    assert.ok(unique.length > 0, `${r} has nothing another room does not also have`);
  }
});

test('the story sentence and the props do not contradict each other', () => {
  // When they disagree the sentence is the design intent and the props are what
  // is wrong, so this checks the props against it rather than the reverse.
  const has = (room, kind) => propsInRoom(room).some((p) => p.kind === kind);
  assert.ok(has('living', PropKind.PRINT_TABLE), 'the site desk has no prints on it');
  assert.ok(has('hall', PropKind.DRYWALL), 'closing up with no drywall staged');
  assert.ok(has('bedroom', PropKind.SPOOL), 'wire pulling with no reel');
  assert.ok(has('garage', PropKind.LADDER), 'the panel wall with nothing to stand on');
  assert.ok(has('bath', PropKind.HVAC), 'no sign of the trades crossing over');
});

test('set dressing describes, it never states a requirement', () => {
  // A prop caption that starts quoting code is narrative content asserting an
  // electrical fact, which the app forbids everywhere else.
  for (const p of PROPS) {
    if (!p.look) continue;
    assert.doesNotMatch(p.look, /\bNEC\b|\bmust\b|\brequired\b|\bshall\b|\bcode requires\b/i,
      `${p.id} states a requirement: ${p.look}`);
  }
});

test('clutter never seals a room off', () => {
  // Solid props take tiles out of the walkable grid. One badly placed pallet in
  // a doorway makes a station unreachable, and it would only show up on the
  // save file that walked there.
  const grid = buildSiteMap();
  const reached = reachableFrom(grid);
  const protectedKeys = [...protectedTiles()];
  assert.ok(protectedKeys.length > 0, 'nothing is being protected');
  for (const key of protectedKeys) {
    assert.ok(reached.has(key), `tile ${key} was walled off by a prop`);
  }
});

// ─── The wiring ──────────────────────────────────────────────────────────────
// artLayer being correct is worthless if the screen never calls it. These read
// the screen source, because the failure they catch is a seam that exists and
// is not connected to anything — which is exactly what shipped last build.

test('the jobsite screen actually resolves its props through the art layer', () => {
  const src = readFileSync(new URL('../src/screens/JobsiteScreen.js', import.meta.url), 'utf8');

  assert.match(src, /buildArt\(VECTOR_ART\)/, 'the screen never builds a resolver');
  assert.match(src, /<Art\b/, 'the screen never draws through the resolver');

  // Every name the screen asks for must be a name the art order knows, or the
  // atlas can never satisfy it.
  const asked = [...src.matchAll(/name="([A-Za-z]+)"/g)].map((m) => m[1]);
  const mapped = [...src.matchAll(/:\s*'([A-Z][A-Za-z]+)',/g)].map((m) => m[1]);
  const names = new Set([...asked, ...mapped]);
  assert.ok(names.size > 10, `only found ${names.size} art names in the screen`);
  for (const n of names) {
    assert.ok(ART.includes(n), `"${n}" is drawn but is not in the art order`);
  }
});

test('every art name the screen can ask for has a vector fallback declared', () => {
  const src = readFileSync(new URL('../src/screens/JobsiteScreen.js', import.meta.url), 'utf8');
  const block = src.match(/const VECTOR_ART = \{([\s\S]*?)\};/);
  assert.ok(block, 'VECTOR_ART is gone, so nothing falls back');
  const declared = new Set(block[1].split(/[,\s]+/).filter(Boolean));

  const asked = new Set([
    ...[...src.matchAll(/name="([A-Za-z]+)"/g)].map((m) => m[1]),
    ...[...src.matchAll(/:\s*'([A-Z][A-Za-z]+)',/g)].map((m) => m[1]),
  ]);
  for (const n of asked) {
    assert.ok(declared.has(n), `"${n}" would render as nothing with no atlas`);
  }
});

test('the atlas is declared in one place and is honest about being absent', () => {
  const src = readFileSync(new URL('../src/screens/jobsiteArt.js', import.meta.url), 'utf8');
  assert.match(src, /export const ATLAS = null;/,
    'the atlas must stay null until real art exists — a require of a missing '
    + 'file is a bundling error that takes the whole app down at launch');
  // Comment lines are the documented shape of a future atlas, not a require.
  const code = src.split('\n').filter((l) => !/^\s*(\*|\/\/)/.test(l)).join('\n');
  assert.equal((code.match(/require\(/g) ?? []).length, 0,
    'no asset is required until there is one to require');
});

// ─── Tiling ──────────────────────────────────────────────────────────────────
// A floor is a thousand copies of one image. Anything in that image lands at
// the same place in every copy and the eye assembles it into a grid — which is
// how a good texture makes a bad floor.

test('a repeating tile gets a stable orientation, and neighbours differ', () => {
  // Stable: a floor that reshuffles as you walk is worse than one with a grid.
  assert.equal(tileVariant(5, 5), tileVariant(5, 5));
  assert.equal(tileVariant(0, 0), tileVariant(0, 0));

  // And adjacent tiles must not agree, or the variation achieves nothing.
  let sameAsNeighbour = 0;
  for (let y = 0; y < 14; y++) {
    for (let x = 0; x < 26; x++) {
      if (tileVariant(x, y) === tileVariant(x + 1, y)) sameAsNeighbour++;
    }
  }
  assert.ok(sameAsNeighbour < 26 * 14 * 0.25,
    `${sameAsNeighbour} tiles match their neighbour — the variation is banding`);
});

test('the orientations are evenly spread over a real floor', () => {
  const counts = {};
  for (let y = 0; y < 14; y++) {
    for (let x = 0; x < 26; x++) {
      const v = tileVariant(x, y);
      counts[v] = (counts[v] ?? 0) + 1;
    }
  }
  assert.equal(Object.keys(counts).length, 8, 'not every orientation is used');
  const values = Object.values(counts);
  const spread = Math.max(...values) - Math.min(...values);
  assert.ok(spread <= 364 * 0.05, `orientation counts vary by ${spread} — the hash is clumping`);
});

test('only the ground repeats — directional art is never turned', () => {
  assert.equal(isTiled('SlabTile'), true);
  // A wall run, a conduit run and a fence have an orientation that means
  // something. Mirroring one breaks the run it belongs to.
  for (const directional of ['StudWall', 'EmtRun', 'FenceRun', 'BarJoist', 'Worker', 'WorkTruck']) {
    assert.equal(isTiled(directional), false, `${directional} would be mirrored`);
  }
});

test('a variant transform turns about the sprite, not about the world', () => {
  const box = { left: 720, top: 360, width: 72, height: 72 };
  // Identity must not move anything.
  assert.doesNotMatch(variantTransform(0, box), /rotate|scale/);

  const turned = variantTransform(4, box);
  assert.match(turned, /translate\(756, 396\)/, 'the pivot is not the sprite centre');
  assert.match(turned, /rotate\(90\)/);
  assert.match(turned, /translate\(-756, -396\)/, 'the sprite is not translated back');

  // A mirror is a scale of -1 on one axis only.
  assert.match(variantTransform(1, box), /scale\(-1, 1\)/);
  assert.match(variantTransform(2, box), /scale\(1, -1\)/);
});

test('a non-square sprite is never given a quarter turn', () => {
  // Rotating a 2x1 prop changes the footprint it was placed on.
  for (let x = 0; x < 40; x++) {
    for (let y = 0; y < 40; y++) {
      assert.ok(tileVariant(x, y, { square: false }) < 4,
        'a non-square sprite was offered a rotation');
    }
  }
});

test('the screen applies the variation, and only to tiled names', () => {
  const src = readFileSync(new URL('../src/screens/jobsiteArt.js', import.meta.url), 'utf8');
  assert.match(src, /isTiled\(name\)/, 'every sprite would be turned, including directional runs');
  assert.match(src, /tileVariant\(tx, ty/, 'the orientation is not derived from the tile');
  assert.match(src, /square: r\.sprite\.w === r\.sprite\.h/,
    'a non-square sprite could be rotated off its footprint');
});
