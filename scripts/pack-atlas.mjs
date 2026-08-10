#!/usr/bin/env node
// ─── PACK THE SPRITE ATLAS ───────────────────────────────────────────────────
// Takes whatever PNGs are sitting in assets/game/raw/ and produces the atlas
// and the manifest the renderer reads.
//
//   npm run atlas          pack whatever is there
//   npm run atlas:check    fail if the committed atlas is stale
//
// WAVES ARE THE POINT. Art arrives one prop at a time from outside this repo,
// so this packs whatever exists and reports what does not. A name with no file
// keeps its vector component and the world still renders — that property is
// what made it safe to build the seam before any art existed.
//
// The manifest is COMPUTED, never hand-written. An earlier delivery arrived as
// a picture of a sprite sheet with a painted-on manifest whose numbers were
// wrong (it claimed 164 px for a 144 px tile). Numbers that came out of an
// image generator are not measurements.

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join, basename, extname } from 'node:path';
import { PNG } from 'pngjs';

const { ART, ART_SPEC, TILE_PX, ATLAS_SCALE } = await import('../src/core/game/artLayer.js');

const RAW = resolve(process.cwd(), 'assets/game/raw');
const OUT_PNG = resolve(process.cwd(), 'assets/game/atlas.png');
const OUT_JSON = resolve(process.cwd(), 'assets/game/atlas.json');
const check = process.argv.includes('--check');
const PAD = 2; // transparent gutter, so a neighbour never bleeds in when sampled

/**
 * Area-average downscale.
 *
 * Nearest-neighbour on a 5.8x reduction throws away five of every six pixels
 * and turns concrete grain into aliased noise that crawls as the camera moves.
 * Averaging the source area under each destination pixel is the cheap correct
 * answer.
 */
const resize = (src, dstW, dstH) => {
  const out = new PNG({ width: dstW, height: dstH });
  const sx = src.width / dstW;
  const sy = src.height / dstH;
  for (let y = 0; y < dstH; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.min(src.height, Math.max(y0 + 1, Math.ceil((y + 1) * sy)));
    for (let x = 0; x < dstW; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.min(src.width, Math.max(x0 + 1, Math.ceil((x + 1) * sx)));
      let r = 0; let g = 0; let b = 0; let a = 0; let n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = ((yy * src.width) + xx) << 2;
          const alpha = src.data[i + 3];
          // Weight colour by alpha so a transparent edge does not drag dark
          // pixels into the visible part — the classic halo around a cutout.
          r += src.data[i] * alpha; g += src.data[i + 1] * alpha; b += src.data[i + 2] * alpha;
          a += alpha; n++;
        }
      }
      const o = ((y * dstW) + x) << 2;
      const aa = a / n;
      out.data[o] = a > 0 ? Math.round(r / a) : 0;
      out.data[o + 1] = a > 0 ? Math.round(g / a) : 0;
      out.data[o + 2] = a > 0 ? Math.round(b / a) : 0;
      out.data[o + 3] = Math.round(aa);
    }
  }
  return out;
};

// ── Read whatever arrived ────────────────────────────────────────────────────

if (!existsSync(RAW)) { mkdirSync(RAW, { recursive: true }); }

const files = readdirSync(RAW).filter((f) => extname(f).toLowerCase() === '.png');
const found = [];
const unknown = [];

for (const f of files) {
  const name = basename(f, '.png');
  // Worker_down_0 and friends share the Worker spec.
  const specName = name.startsWith('Worker_') ? 'Worker' : name;
  if (!ART_SPEC[specName]) { unknown.push(f); continue; }
  const src = PNG.sync.read(readFileSync(join(RAW, f)));
  const [tw, th] = ART_SPEC[specName].tiles;
  const target = tw * TILE_PX * ATLAS_SCALE;
  // Height follows the source aspect, so a tall prop is not squashed into its
  // footprint — the footprint is what it BLOCKS, not what it looks like.
  const dstW = target;
  const dstH = Math.max(1, Math.round((src.height / src.width) * target));
  found.push({
    name, specName, src, dstW, dstH,
    tiles: [tw, th],
    anchor: ART_SPEC[specName].anchor,
    hasAlpha: src.colorType === 6 || src.colorType === 4,
  });
}

if (found.length === 0) {
  console.log('No sprites in assets/game/raw yet. Nothing to pack.');
  console.log(`Waiting on ${ART.length} names — see docs/v2/ART-ORDER.md.`);
  process.exit(check ? 0 : 0);
}

// ── Shelf-pack, tallest first ────────────────────────────────────────────────

found.sort((a, b) => b.dstH - a.dstH || a.name.localeCompare(b.name));

const maxRow = 2048;
let cx = PAD; let cy = PAD; let rowH = 0; let atlasW = 0;
for (const s of found) {
  if (cx + s.dstW + PAD > maxRow && cx > PAD) { cx = PAD; cy += rowH + PAD; rowH = 0; }
  s.x = cx; s.y = cy;
  cx += s.dstW + PAD;
  rowH = Math.max(rowH, s.dstH);
  atlasW = Math.max(atlasW, cx);
}
const atlasH = cy + rowH + PAD;

const atlas = new PNG({ width: atlasW, height: atlasH });
atlas.data.fill(0);
for (const s of found) {
  const scaled = resize(s.src, s.dstW, s.dstH);
  for (let y = 0; y < s.dstH; y++) {
    for (let x = 0; x < s.dstW; x++) {
      const from = ((y * s.dstW) + x) << 2;
      const to = (((s.y + y) * atlasW) + (s.x + x)) << 2;
      atlas.data[to] = scaled.data[from];
      atlas.data[to + 1] = scaled.data[from + 1];
      atlas.data[to + 2] = scaled.data[from + 2];
      // A floor tile arrives as opaque RGB with no alpha channel. That is
      // correct for a floor and must not become a fully transparent sprite.
      atlas.data[to + 3] = s.hasAlpha ? scaled.data[from + 3] : 255;
    }
  }
}

const manifest = {
  _generated: 'npm run atlas — do not edit by hand',
  tilePx: TILE_PX,
  scale: ATLAS_SCALE,
  width: atlasW,
  height: atlasH,
  sprites: Object.fromEntries(found
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => [s.name, {
      x: s.x, y: s.y, w: s.dstW, h: s.dstH,
      anchorX: s.anchor[0], anchorY: s.anchor[1],
      scale: s.tiles[0],
    }])),
};

const json = `${JSON.stringify(manifest, null, 2)}\n`;
const png = PNG.sync.write(atlas);

if (check) {
  const stale = !existsSync(OUT_JSON) || readFileSync(OUT_JSON, 'utf8') !== json;
  if (stale) { console.error('assets/game/atlas.json is stale. Run: npm run atlas'); process.exit(1); }
  console.log(`Atlas matches raw/ — ${found.length} sprite(s).`);
  process.exit(0);
}

mkdirSync(resolve(process.cwd(), 'assets/game'), { recursive: true });
writeFileSync(OUT_PNG, png);
writeFileSync(OUT_JSON, json);

const packed = new Set(found.map((s) => (s.name.startsWith('Worker_') ? 'Worker' : s.name)));
const missing = ART.filter((n) => !packed.has(n));

console.log(`atlas.png  ${atlasW}x${atlasH}  ${(png.length / 1024).toFixed(0)} KB`);
for (const s of found) {
  console.log(`  ${s.name.padEnd(18)} ${String(s.src.width).padStart(5)}px -> ${s.dstW}x${s.dstH}` +
    `  anchor ${s.anchor[0]}/${s.anchor[1]}${s.hasAlpha ? '' : '  (opaque)'}`);
}
if (unknown.length) console.log(`\nIgnored (not an art name): ${unknown.join(', ')}`);
console.log(`\nRaster ${packed.size}/${ART.length}. Still vector: ${missing.join(', ') || 'none'}`);
