/**
 * Portal discovery and the leaf/portal graph.
 *
 * A portal is the shared boundary between two *empty* convex leaves — in 2D a
 * segment, in 3D a convex polygon. Because every leaf region edge is tagged
 * with the BSP plane that created it, two leaves can only touch along edges
 * with the same plane tag, and on that plane one leaf lies in front and the
 * other behind. Their shared part is simply the overlap of the two edges'
 * intervals along the plane — no fuzzy collinearity tests needed.
 *
 * (This is equivalent to the "push a huge portal polygon down the tree" method
 * used by Quake's qbsp, but simpler to reason about. In 3D the interval overlap
 * becomes a 2D convex polygon intersection on the shared plane.)
 *
 * Every geometric opening yields two *directed* portals, one per direction.
 * A directed portal `p` leads from leaf `p.from` into leaf `p.to`; its line's
 * normal points into `p.to` and its segment runs a→b with `p.to` on the left.
 *
 * The resulting graph has leaves as nodes and directed portals as edges.
 */

import { type Line2, type Segment, type Vec2, dot, flipLine, lineDirection, MIN_LENGTH } from "../math";
import type { BspTree } from "../bsp";

export interface Portal {
  /** Index of this portal in {@link PortalGraph.portals}. */
  readonly id: number;
  /** Leaf the portal leads out of. */
  readonly from: number;
  /** Leaf the portal leads into. */
  readonly to: number;
  /** BSP plane index the portal lies on. */
  readonly plane: number;
  /** Line with the normal pointing into `to`. */
  readonly line: Line2;
  /** The opening, oriented a→b with `to` on the left. */
  readonly seg: Segment;
  /** Index of the reverse portal (to → from). */
  readonly twin: number;
}

export interface PortalGraph {
  readonly leafCount: number;
  readonly portals: readonly Portal[];
  /** `portalsFrom[leaf]` = ids of portals leading out of `leaf`. */
  readonly portalsFrom: readonly (readonly number[])[];
}

interface EdgeInterval {
  readonly leaf: number;
  /** Interval along the plane direction. */
  readonly lo: number;
  readonly hi: number;
}

/** Finds all portals between empty leaves of the tree. */
export function buildPortalGraph(tree: BspTree): PortalGraph {
  // Bucket edges of empty leaves by plane, split into the leaves in front/behind the plane.
  const frontEdges = new Map<number, EdgeInterval[]>();
  const backEdges = new Map<number, EdgeInterval[]>();

  tree.leaves.forEach((leaf, leafIndex) => {
    if (leaf.contents !== "empty" || !leaf.region) return;
    const { vertices, tags } = leaf.region;
    for (let i = 0; i < vertices.length; i++) {
      const plane = tags[i];
      if (plane < 0) continue; // bounding-box edge
      const line = tree.planes[plane];
      const dir = lineDirection(line);
      const a = vertices[i], b = vertices[(i + 1) % vertices.length];
      const ta = dot(a, dir), tb = dot(b, dir);
      // Region interior is left of a→b. The plane's front is left of `dir`, so the
      // leaf is in front of the plane iff the edge runs along `dir`.
      const inFront = tb > ta;
      const interval: EdgeInterval = { leaf: leafIndex, lo: Math.min(ta, tb), hi: Math.max(ta, tb) };
      const bucket = inFront ? frontEdges : backEdges;
      const list = bucket.get(plane);
      if (list) list.push(interval);
      else bucket.set(plane, [interval]);
    }
  });

  const portals: Portal[] = [];
  const portalsFrom: number[][] = tree.leaves.map(() => []);

  // Deterministic order: planes ascending.
  const planeIds = [...frontEdges.keys()].filter((p) => backEdges.has(p)).sort((a, b) => a - b);
  for (const plane of planeIds) {
    const line = tree.planes[plane];
    const dir = lineDirection(line);
    const origin: Vec2 = { x: line.n.x * line.d, y: line.n.y * line.d };
    const at = (t: number): Vec2 => ({ x: origin.x + dir.x * t, y: origin.y + dir.y * t });

    for (const f of frontEdges.get(plane)!) {
      for (const b of backEdges.get(plane)!) {
        const lo = Math.max(f.lo, b.lo);
        const hi = Math.min(f.hi, b.hi);
        if (hi - lo < MIN_LENGTH) continue;
        // back leaf → front leaf: normal = plane normal, front on the left of `dir`.
        const id = portals.length;
        const forward: Portal = { id, from: b.leaf, to: f.leaf, plane, line, seg: { a: at(lo), b: at(hi) }, twin: id + 1 };
        const backward: Portal = { id: id + 1, from: f.leaf, to: b.leaf, plane, line: flipLine(line), seg: { a: at(hi), b: at(lo) }, twin: id };
        portals.push(forward, backward);
        portalsFrom[b.leaf].push(id);
        portalsFrom[f.leaf].push(id + 1);
      }
    }
  }

  return { leafCount: tree.leaves.length, portals, portalsFrom };
}

/** Connected components of empty leaves, as a leaf → component id map (-1 for solid/degenerate leaves). */
export function leafComponents(tree: BspTree, graph: PortalGraph): Int32Array {
  const comp = new Int32Array(tree.leaves.length).fill(-1);
  let next = 0;
  for (let start = 0; start < tree.leaves.length; start++) {
    const leaf = tree.leaves[start];
    if (comp[start] !== -1 || leaf.contents !== "empty" || !leaf.region) continue;
    const stack = [start];
    comp[start] = next;
    while (stack.length) {
      const l = stack.pop()!;
      for (const pid of graph.portalsFrom[l]) {
        const to = graph.portals[pid].to;
        if (comp[to] === -1) {
          comp[to] = next;
          stack.push(to);
        }
      }
    }
    next++;
  }
  return comp;
}

