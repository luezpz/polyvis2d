# Algorithms

This document explains each compiler stage, the conventions that tie them together, and what
changes when moving from 2D to 3D. Source files are referenced relative to `src/core/`.

## Conventions (read this first)

| Concept | 2D representation | Convention |
|---|---|---|
| Plane | `Line2 { n, d }` (`math/line2.ts`) | Points with `n·p = d`. **Front** = side the unit normal points to |
| Wall / face | `Segment` + `Line2` | Oriented a→b, **empty space on the left = front** |
| Leaf region | `ConvexPolygon` | CCW; `tags[i]` = index of the BSP plane that produced edge i (`BOUNDS_TAG` for the bounding box) |
| Directed portal | `Portal` | Leads `from` → `to`; normal points **into `to`**; segment has `to` on its left |
| BSP child ref | `number` | `>= 0` node index, `< 0` leaf `~ref` (= `-ref - 1`) |

All tolerances live in `math/tolerance.ts`. "On a plane" means within `PLANE_EPSILON`.
Clipping *discards* parts lying exactly on a clip plane: for visibility, grazing contact cannot be
seen through.

## 1. CSG: brushes → walls (`csg/walls.ts`)

`empty = (∪ room brushes) − (∪ solid brushes)`.

1. **Fragment** every brush edge at every intersection with other brushes' edges and at other
   brushes' vertices lying on it. Collinear overlapping edges end up cut into identical pieces.
2. **Classify** each piece by probing just left and right of its midpoint
   (`PROBE_OFFSET`). Exactly one side empty → it is a wall, oriented with the empty side in front.
   Both sides empty (rooms touching/overlapping) or both solid → discarded. This removes the
   interior faces between rooms.
3. **De-duplicate** identical pieces (coincident edges of two brushes).
4. **Merge** collinear touching same-facing pieces so the BSP sees long walls.

The result is always watertight. Non-CSG input (imported meshes) can bypass this stage via
`compileWalls()`.

## 2. Solid-leaf BSP (`bsp/build.ts`)

Recursive build over wall fragments:

- Candidate splitters are the distinct planes of the remaining fragments. Score =
  `splits × splitWeight + |front − back| × balanceWeight`; lowest wins.
- Fragments on the splitter facing the same way are **consumed** (this is what de-duplicates
  coplanar walls: a plane splits at most once on any root-to-leaf path). Opposite-facing
  coplanar fragments go back; spanning ones are split.
- No fragments left in front → **empty** leaf. None left behind → **solid** leaf.

Each node carries its convex region (the bounding box, expanded by `boundsMargin`, clipped by all
ancestor planes); leaves keep theirs. The bounding box keeps regions finite even when the level
leaks, as suggested in the design brief.

## 3. Portals (`portals/portals.ts`)

Two empty leaves are adjacent iff they have edges tagged with the same plane, one leaf in front of
it and the other behind. The portal is the overlap of those two edges' intervals along the plane.
Tags make this exact: no fuzzy collinearity tests, and T-junctions (one long leaf edge facing
several small leaves) fall out naturally.

Every opening produces two directed portals (twins). Graph: nodes = leaves, edges = directed
portals (`portalsFrom[leaf]`).

**Leaks** (`portals/leaks.ts`): an empty leaf with a `BOUNDS_TAG` edge touches the void. We
report it plus everything reachable from it (Quake's outside flood), but keep compiling.

## 4. Base vis (`vis/baseVis.ts`)

Cheap conservative "might see" set per portal *i* (Golodetz Listings 4–5):

1. *j* must be partly in front of *i*;
2. *i* must be partly behind *j* (portals are looked through from behind);
3. flood fill from `i.to` along portals passing 1 and 2.

## 5. Portal flow (`vis/portalFlow.ts`, `vis/antipenumbra.ts`)

Depth-first walk from each source portal *S* through the graph, carrying:

- `source` — the part of *S* that can still see down the chain,
- `pass` — the visible part of the latest portal,
- `might` — the intersection of "might see" sets along the chain (prunes the search).

For each generator portal *G* leaving the current leaf:

1. clip `source` to the back of *G*;
2. clip *G* to the front of *S*;
3. clip *G* by the separators of (`source`, `pass`) — the **antipenumbra**;
4. clip `source` by the separators of (*G*, `pass`) — the **reverse antipenumbra**.

If *G* survives, *S* sees *G*; recurse through *G* with the clipped windings. That is the
"source portal + target portal → clip a third portal" idea: if the third portal is clipped away
entirely, nothing beyond it along that chain can be visible.

**Separators in 2D** are lines through one endpoint of each portal with the remaining endpoints
strictly on opposite sides — at most two, crossing between the portals. In 3D they are planes
through an edge of one portal and a vertex of the other, built in both directions.

Shrinking `source` and `pass` is conservative: any real sight line through the chain intersects
every clipped winding. Portals are processed in increasing "might see" size so finished results
(`portalVis`) can replace `mightSee` for pruning, as Quake does. A `maxSteps` safety valve falls
back to base vis if a pathological level explodes combinatorially.

## 6. Leaf PVS (`vis/leafPvs.ts`)

`PVS(leaf) = {leaf} ∪ neighbours ∪ ⋃_{p ∈ portalsFrom(leaf)} { q.to | q ∈ portalVis[p] }`.

Optional symmetry: since both directions are conservative, `intersect` (A sees B only if B sees A)
remains conservative and is slightly tighter; `union` is the most defensive.

## Correctness checks

`tests/vis.test.ts` samples random point pairs in random levels; whenever the straight segment
between them crosses no wall, the PVS **must** contain the target leaf. That invariant (PVS ⊇ true
visibility) is the definition of a correct PVS. The editor's "True line of sight" layer shows the
same thing interactively.

## Porting to 3D

| 2D (here) | 3D |
|---|---|
| `Vec2`, `Line2` | `Vec3`, `Plane3` |
| `Segment` (wall, portal) | convex polygon *winding* |
| `clipSegmentFront` | Sutherland–Hodgman polygon clip against a plane |
| `ConvexPolygon` leaf region with edge tags | convex polyhedron = list of face windings, each tagged with its plane |
| CSG by edge fragmentation + side probing | same idea on polygons: split faces by other brushes' planes, probe both sides, drop interior/duplicate faces. For Blender meshes: merge coplanar triangles into polygons first, use face normals for orientation |
| Portals = interval overlap on a shared plane | 2D convex polygon intersection of the two faces on the shared plane (project to the plane's 2D basis) — or Quake's method of pushing a huge plane winding down the tree |
| Separators: endpoint × endpoint | edge × vertex, both directions (Golodetz Listing 2) |
| Leak = touches bounding box | identical; bounds become an AABB of 6 planes |

Everything above the geometry layer — tree layout, portal graph, bitsets, base vis, flow
recursion, PVS assembly, export — carries over unchanged in structure.

For Blender input, expect a mesh that is *not* watertight. Plan: export triangles (with normals
pointing into rooms) → merge coplanar faces → feed straight into the BSP (`compileWalls`
equivalent) → leaf regions are closed by the bounding box → leaks are reported, not fatal.
