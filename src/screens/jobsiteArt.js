// ─── ART RESOLUTION, AT THE RENDERER ─────────────────────────────────────────
// The other half of core/game/artLayer.js.
//
// That module decides WHAT draws a name. This one draws it. Keeping them apart
// is what lets the decision stay a pure, tested function while the part that
// touches react-native-svg stays a component.
//
// THE PROPERTY THAT MATTERS: with no atlas — which is the state today, and the
// state until raster art actually arrives — `<Art>` renders the exact vector
// component the screen rendered before this file existed. Same element, same
// props, same output. Nothing about the world changes until an atlas is
// dropped in, and dropping one in is the whole change.
//
// The atlas is `require`d here and nowhere else, so there is one place to look
// when a sprite is wrong and one place to change when the art pack updates.

import React from 'react';
import { Defs, ClipPath, Rect, Image as SvgImage, G } from 'react-native-svg';

import { artLayer, Source, placeSprite, isTiled, tileVariant, variantTransform } from '../core/game/artLayer';

/**
 * The art pack, when there is one.
 *
 * Deliberately null rather than a require of a file that does not exist — a
 * missing require is a Metro bundling error at app start, which would take the
 * whole app down over art that has not shipped yet. When the atlas lands this
 * becomes:
 *
 *   const ATLAS = {
 *     image: require('../../assets/game/atlas.png'),
 *     width: 2048, height: 2048,   // the atlas's own pixel size
 *     sprites: MANIFEST,
 *   };
 *
 * `width` and `height` are required: a sprite is a rectangle CUT OUT of the
 * atlas, and cutting it out means drawing the whole sheet scaled and clipping
 * to the region. Without the sheet's real size there is nothing to scale.
 *
 * BOTH ARE GENERATED. `npm run atlas` reads assets/game/raw/, downscales each
 * sprite to its tile footprint, packs the sheet and COMPUTES the manifest. The
 * numbers are measurements, never typed — an earlier art delivery arrived as a
 * picture of a sprite sheet with a painted-on manifest whose figures were
 * simply wrong.
 *
 * A name with no file in raw/ is absent from the manifest and keeps its vector
 * component, so the art can land in waves and the world always renders.
 */
const MANIFEST = require('../../assets/game/atlas.json');

export const ATLAS = Object.keys(MANIFEST.sprites ?? {}).length > 0
  ? Object.freeze({
    image: require('../../assets/game/atlas.png'),
    width: MANIFEST.width,
    height: MANIFEST.height,
    sprites: MANIFEST.sprites,
  })
  : null;

/**
 * One resolver for the screen. Built once from the vector components the screen
 * already has, so a name that has no raster keeps its existing drawing.
 */
export const buildArt = (vector) => artLayer({ atlas: ATLAS, vector });

/**
 * Draw one named thing at a tile.
 *
 * Raster path: the sprite is a rectangle of the atlas, so it is clipped to its
 * own region and the whole atlas is offset behind that clip. Anchoring is done
 * by placeSprite and nowhere else — a prop nudged into place by a magic number
 * at one call site is a prop that is wrong at every other one.
 */
export function Art({ art, name, tx, ty, tile, turn = 0, children, ...rest }) {
  // The worker is the one name with animation frames. The vector component
  // reads `facing` and `step` itself; the raster ships eight sprites, so the
  // facing and the stride pick the frame here. ~6 ticks a frame is a walk
  // cadence at the 30fps world tick, and a missing frame falls through to the
  // vector worker rather than to nothing.
  let resolved = name;
  if (name === 'Worker') {
    const facing = ['up', 'down', 'left', 'right'].includes(rest.facing) ? rest.facing : 'down';
    const frame = Math.floor((Number(rest.step) || 0) / 6) % 2;
    const candidate = `Worker_${facing}_${frame}`;
    // Only switch to the frame when it actually packed — otherwise the base
    // name falls through to the vector worker, which animates itself.
    if (art.hasRaster(candidate)) resolved = candidate;
  }
  const r = art.resolve(resolved);

  if (r.source === Source.VECTOR) {
    return <r.Component tx={tx} ty={ty} {...rest} />;
  }

  if (r.source === Source.RASTER) {
    const box = placeSprite(r.sprite, { tileX: tx, tileY: ty, tile });
    // Atlas pixels → world units. The sprite's own width defines it, so every
    // sprite lands at the tile scale its manifest asked for.
    const k = box.width / r.sprite.w;
    const clipId = `clip-${name}-${tx}-${ty}`;
    // A repeating texture gets a stable orientation per tile, so a thousand
    // copies of one image stop assembling into a grid. Directional art is not
    // on the TILED list and is never turned.
    const variant = isTiled(name)
      ? variantTransform(tileVariant(tx, ty, { square: r.sprite.w === r.sprite.h }), box)
      : null;
    // Directional raster art is authored horizontal and TURNED for a vertical
    // run — a wall or a joist has an orientation that means something, so the
    // caller states it instead of the variant hash guessing. The pivot is the
    // tile centre, the same point placeSprite anchored the sprite to.
    const turned = turn
      ? `rotate(${turn}, ${tx * tile + tile / 2}, ${ty * tile + tile / 2})`
      : null;
    const transform = [turned, variant].filter(Boolean).join(' ');
    return (
      <G transform={transform || undefined}>
        <Defs>
          <ClipPath id={clipId}>
            <Rect x={box.left} y={box.top} width={box.width} height={box.height} />
          </ClipPath>
        </Defs>
        {/* The whole sheet, scaled and slid so the wanted region lands on the
            box, then clipped to it. */}
        <SvgImage
          href={r.image}
          x={box.left - r.sprite.x * k}
          y={box.top - r.sprite.y * k}
          width={ATLAS.width * k}
          height={ATLAS.height * k}
          preserveAspectRatio="none"
          clipPath={`url(#${clipId})`}
        />
      </G>
    );
  }

  // MISSING. Draw nothing rather than a placeholder box — a magenta square in a
  // screenshot reads as a bug in the game to everyone who is not holding the
  // art order. `coverage().missing` is where a hole gets reported.
  return children ?? null;
}
