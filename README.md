# polyvis

Bake **PVS (potentially visible set)** occlusion-culling data for levels made of convex rooms,
using the classic Quake/Teller pipeline:

```
brushes ──CSG──▶ walls ──BSP──▶ convex leaves ──▶ portals ──base vis──▶ might-see
                                                      │
                                                      └──portal flow (antipenumbra clipping)──▶ portal vis ──▶ leaf PVS ──▶ export
```

This repository is the **2D version**: an interactive web editor plus a framework-free,
DOM-free compiler core. In 2D, planes are lines and portals are segments. The 3D version
for Blender levels comes next; the code is structured so each stage maps one-to-one onto
its 3D counterpart (see [docs/ALGORITHMS.md](docs/ALGORITHMS.md#porting-to-3d)).

## Quick start

```sh
npm install
npm run dev        # editor at http://localhost:5173
npm test           # unit tests + randomized line-of-sight ground-truth checks
npm run build      # typecheck + production bundle in dist/
```

Requires Node 20+.

## Using the editor

| Tool | Key | What it does |
|---|---|---|
| Select | `V` | Click to select (smallest brush under cursor), drag to move, drag vertex handles to reshape, `Del` delete, `Ctrl+D` duplicate |
| Box | `B` | Drag a rectangle brush |
| Polygon | `P` | Click points; `Enter` / double-click / click the first point to finish. The brush is the convex hull of the points |
| Inspect | `I` | Hover to probe the PVS of the leaf under the cursor; click to pin; hover a portal to see its portal vis |

- `K` toggles between **room** brushes (carve empty space) and **solid** brushes (occluders such as
  pillars put back inside rooms). With a brush selected in Select mode, `K` toggles that brush.
- Wheel zooms; middle/right drag or `Space`+drag pans; `F` fits the view; `Ctrl+Z` / `Ctrl+Y` undo/redo.
- The level recompiles on every edit (a few ms) and is autosaved to `localStorage`.
- **Save…/Open…** read and write the level as JSON. **Export PVS** writes the compiled
  BSP + portals + PVS as JSON or as a line-based text file.

### Reading the view

- Coloured cells: empty BSP leaves. White lines: walls (ticks point into empty space).
  Yellow: portals. Orange dashed (optional): BSP splitters.
- Inspect: the probed leaf is bright green, its PVS light green, everything it cannot see is
  darkened. The white fan is the **exact** visibility from the cursor. The PVS must always cover
  the fan (it is conservative: it can be larger, never smaller).
- Hovering a portal: cyan = portals it sees after the portal flow; purple dashed = portals the
  cheap base vis allowed but the flow rejected.
- Red dashed cells: leak (an empty leaf touches the level bounds — only possible with raw,
  non-CSG input).

## Export format

Two equivalent encodings (`src/core/export/pvsExport.ts` documents both in detail):

- `level.pvs.json` — `{ format: "polyvis-pvs-2d", planes, nodes, root, leaves, portals, pvs }`
- `level.pvs.txt` — line-oriented, parseable with `sscanf`, no JSON library needed.

Runtime use: walk the BSP with the camera position (front if `n·p − d ≥ 0`; negative child
references are leaves, `leaf = -ref - 1`), then draw only what lies in the leaves whose bits are
set in that leaf's PVS row. Rows are hex, LSB-first per byte (bit `j` → byte `j >> 3`,
bit `j & 7`), like Quake.

## Project layout

```
src/
  core/                 pure TypeScript compiler, no DOM — runs in browser, Node, workers
    math/               vectors, lines (2D planes), segments, convex polygons, tolerances
    level/              level model (brushes), JSON (de)serialization, sample levels
    csg/                brushes → walls (union of rooms minus solids, duplicate removal)
    bsp/                solid-leaf BSP build, leaf regions, point location
    portals/            portal discovery, leaf/portal graph, leak detection
    vis/                bitsets, antipenumbra, base vis, portal flow, leaf PVS
    analysis/           exact point visibility (ground truth for debugging/tests)
    export/             PVS JSON/text writers
    pipeline.ts         wires the stages together with timings and stats
  app/                  browser editor (canvas, tools, panel)
tests/                  vitest suites
docs/ALGORITHMS.md      how each stage works + 3D porting notes
```

## References

- Stuart Golodetz, *If You Can't See Me, I Can't See You*, Overload 90 (2009) — portal flow and antipenumbra clipping.
- Seth Teller, *Visibility Computations in Densely Occluded Polyhedral Environments*, PhD thesis (1992).
- Pekka Väänänen, [vis.py](https://github.com/pekkavaa/vis.py) — a readable Python port of Quake's vis.
- id Software, Quake `qbsp` / `vis` sources.
