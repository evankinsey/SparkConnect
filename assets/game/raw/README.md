# Drop sprites here

One PNG per sprite, transparent background, named exactly as in
`docs/v2/ART-ORDER.md` — `SlabTile.png`, `StudWall.png`, `Panelboard.png`,
`Worker_down_0.png` and so on.

Uploading through the GitHub web UI is the path that works: repo → this branch
→ **Add file → Upload files** → drop them in this folder. Pasting an image into
a chat shows the picture but never delivers the file, and recompresses it on
the way.

They can arrive in waves. Raster and vector render on the same frame, so a name
with no file here keeps its current vector art until one turns up —
`artLayer().coverage()` reports exactly which is which.
