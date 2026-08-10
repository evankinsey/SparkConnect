# Job Site art order — 24 sprites

Everything needed to replace the vector world with painted sprites. The code
side is already done: `src/core/game/artLayer.js` resolves every drawable by
name, `src/screens/jobsiteArt.js` draws it, and with no atlas present every
name falls back to the vector component it uses today. Dropping the atlas in is
the entire change — no gameplay, collision, pathfinding or save-state work.

**Nothing renders differently until these files exist.** That is why the last
three builds looked the same.

---

## The global rules

Every sprite, no exceptions. These are in `ART_RULES` in code so the brief and
the thing the renderer expects are the same document.

1. **Top-down, straight overhead.** The camera is 90°, looking down. Not
   isometric, not three-quarter, not tilted. A sprite drawn at an angle will
   sit wrong next to every other one and cannot be fixed by scaling.
2. **Transparent PNG**, delivered at **@2x and @3x** against a **72 px tile**.
   So a one-tile prop is 144 px at @2x and 216 px at @3x.
3. **Shadows baked in** — a soft contact shadow under anything that stands up.
   No shadow layer is drawn at runtime.
4. **One sun, one direction, every sprite.** Pick a direction (top-left is
   conventional) and hold it across all 24. Mixed lighting is the single most
   obvious tell that art came from different passes.
5. **Real construction proportions.** A gang box is not the size of a pallet.
   Check anything you are unsure of against the tile size below.
6. **Walls are framing** — two thin tracks with individual studs and open
   cavity between them. A filled rectangle reads as a shipping container, and
   that is what made an earlier pass fail.
7. **A worker reads as a person from above** — hard hat, shoulders, hi-vis
   vest, boots. Never a circle with a face on it.
8. **No black.** Exterior ground is dirt, grass or asphalt. Never a void.

Palette to sit against: warm concrete floor (#D9CBB2-ish), hi-vis lime, safety
amber, and the electric blue already used for navigation.

---

## The 24

`Tiles` is the footprint the collision grid already uses — build to it.
`Anchor` is where the sprite sits on its tile, as a fraction of the image
(x, y). 0.5/0.85 means horizontally centred with the base near the bottom,
which is right for anything standing up. Flat things anchor at 0.5/0.5.

### Ground and structure — 4

| Name | Tiles | Anchor | Notes |
|---|---|---|---|
| `SlabTile` | 1×1 | 0.5 / 0.5 | Poured concrete, seamless when tiled. Faint trowel marks and a control joint. Must not read as a grid. |
| `StudWall` | 1×1 | 0.5 / 0.5 | A horizontal run of framing seen from above: two thin plates with studs between, cavity open. Tiles end-to-end. |
| `BarJoist` | 1×1 | 0.5 / 0.5 | Open-web steel joist overhead, seen from below-ish. Drawn over the floor at 30-40% opacity in code, so keep it light. |
| `DoorOpening` | 1×1 | 0.5 / 0.5 | A gap in the framing with a header. Daylight spill is drawn separately — don't paint it in. |

### People — 1

| Name | Tiles | Anchor | Notes |
|---|---|---|---|
| `Worker` | 1×1 | 0.5 / 0.7 | Straight down: hard hat crown, shoulders, hi-vis vest, boots just visible. **Needs 4 facings** (up/down/left/right) and ideally a 2-frame walk each. Deliver as `Worker_down_0`, `Worker_down_1`, `Worker_left_0`… Hat and vest colour are recoloured in code, so paint them light and neutral. |

### Electrical — 3

| Name | Tiles | Anchor | Notes |
|---|---|---|---|
| `Panelboard` | 1×1 | 0.5 / 0.8 | Load centre on a wall, door open, breakers visible. The hero prop — this is what the game is about. |
| `JBox` | 1×1 | 0.5 / 0.6 | 4-square box on a stud with a mud ring. Small — about a third of a tile. |
| `EmtRun` | 1×1 | 0.5 / 0.5 | A length of ½" EMT with a strap. Tiles end-to-end in both directions, so make the ends butt cleanly. |

### Site material and tools — 8

| Name | Tiles | Anchor | Notes |
|---|---|---|---|
| `AFrameLadder` | 1×1 | 0.5 / 0.75 | Fibreglass step ladder, open, seen from above. |
| `WireReel` | 1×1 | 0.5 / 0.7 | Wooden spool on its side, THHN visible. |
| `GangBox` | 2×1 | 0.5 / 0.8 | Job box, lid closed, padlock. Wide. |
| `MaterialCart` | 1×1 | 0.5 / 0.75 | Rolling cart with fittings and a few sticks of pipe. |
| `PrintTable` | 1×1 | 0.5 / 0.7 | Sawhorses with a sheet of plans, corners weighted. |
| `DrywallStack` | 1×1 | 0.5 / 0.8 | Stacked board on the floor, edges slightly ragged. |
| `SafetyCone` | 1×1 | 0.5 / 0.8 | Standard orange cone. Small. |
| `Pallet` | 2×1 | 0.5 / 0.6 | Wooden pallet, some strapped material on it. |

### Exterior — 6

| Name | Tiles | Anchor | Notes |
|---|---|---|---|
| `WorkTruck` | 2×3 | 0.5 / 0.6 | Pickup with a ladder rack and pipe. **No real brand, no logo, no readable text.** |
| `Dumpster` | 2×2 | 0.5 / 0.7 | Roll-off, half full of construction debris. No company name. |
| `SiteTrailer` | 3×2 | 0.5 / 0.7 | Job trailer with steps and a door. No signage. |
| `Tree` | 2×2 | 0.5 / 0.7 | Generic broadleaf from above. Florida-appropriate. |
| `Palm` | 2×2 | 0.5 / 0.7 | Palm crown from above. The site is Tampa. |
| `FenceRun` | 1×1 | 0.5 / 0.5 | Chain-link panel with a post. Tiles end-to-end horizontally and vertically. |

### Markers — 2

| Name | Tiles | Anchor | Notes |
|---|---|---|---|
| `ObjectiveMarker` | 1×1 | 0.5 / 1.0 | Amber pin, pointed at the bottom. Anchor is the point, not the centre. Code pulses it — deliver one static frame. |
| `DoneMarker` | 1×1 | 0.5 / 1.0 | Green tick pin, same silhouette and same anchor. |

---

## Priority, if they arrive in waves

The world can go raster a piece at a time — mixed raster and vector renders
fine on the same frame. In order of how much each changes the look:

1. `SlabTile`, `StudWall` — the floor and walls are most of the screen.
2. `Worker` — the thing you look at constantly.
3. `Panelboard`, `JBox`, `EmtRun` — what makes it read as electrical.
4. `AFrameLadder`, `WireReel`, `GangBox`, `MaterialCart`, `DrywallStack`.
5. Exterior, then markers.

---

## What to hand back

An atlas PNG plus a manifest. Sprites can also be delivered as individual PNGs
and packed afterwards — say which and it gets packed here.

```json
{
  "SlabTile":   { "x": 0,   "y": 0, "w": 144, "h": 144, "anchorX": 0.5, "anchorY": 0.5,  "scale": 1 },
  "GangBox":    { "x": 144, "y": 0, "w": 288, "h": 176, "anchorX": 0.5, "anchorY": 0.8,  "scale": 2 },
  "WorkTruck":  { "x": 432, "y": 0, "w": 288, "h": 432, "anchorX": 0.5, "anchorY": 0.6,  "scale": 2 }
}
```

- `x, y, w, h` — the sprite's rectangle in atlas pixels.
- `anchorX, anchorY` — from the table above, as a 0-1 fraction of the sprite.
- `scale` — how many tiles wide it is. `2` means it spans two 72 px tiles.
- The atlas's own pixel width and height are also needed.

Drop the PNG at `assets/game/atlas.png`, the manifest beside it, and set
`ATLAS` in `src/screens/jobsiteArt.js`. `artLayer().coverage()` then reports
what is raster, what is still vector, and what is missing — nothing has to
arrive at once.

---

## Prompt to give an image generator

> Top-down orthographic game sprite, camera looking straight down at 90 degrees.
> [SUBJECT]. Modern commercial construction site, realistic proportions.
> Soft baked contact shadow beneath, single consistent sun from the upper left.
> Clean stylised realism, muted warm palette, no outline. Transparent
> background. No text, no logos, no brand names, no people unless specified.
> Centred, full object visible, no cropping.

Replace `[SUBJECT]` with the row's description. Generate every sprite in one
session if the tool allows it — consistency across the set matters far more
than any individual sprite, and a re-roll of one prop weeks later will not
match.
