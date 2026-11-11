/**
 * Empty-leaf refinement: extra, non-wall splits applied to empty leaves after
 * the solid-leaf build has used up every wall.
 *
 * A plain solid-leaf BSP only splits space along wall planes, and each plane
 * only cuts the node region it was chosen in. Around a convex solid corner
 * (a reflex vertex of the empty space — pillar corners, door jambs, the inner
 * corner of an L) one of the two walls usually gets extended into the room and
 * the other does not, so a single big leaf wraps around the corner and the
 * PVS of everything in it is the union of what can be seen from both sides.
 *
 * Two refinements fix that:
 *
 * 1. **Corner splits.** For each empty leaf, every wall whose endpoint touches
 *    the leaf and whose supporting line passes through the leaf's interior is
 *    a candidate splitter: the line is the wall's extension past the corner.
 *    These are exactly the lines where the view "around the corner" changes
 *    (a subset of the visibility event lines of Teller's analysis), so cells
 *    that end on them get much tighter PVS rows. Quake's `qbsp` gets a similar
 *    effect for free from splitting by every brush face in the tree.
 * 2. **Cell size limits.** Empty leaves larger than `maxCellSize` along x or y
 *    are halved by an axis-aligned line (like `qbsp`'s block grid), and no
 *    refinement split may create a cell thinner than `minCellSize` along the
 *    split normal — this keeps corner splits from producing slivers.
 *
 * Refinement never changes what is solid or empty, it only subdivides empty
 * leaves, so the PVS stays conservative; it just has more, smaller cells.
 */

import {
  type Line2, type Vec2, type ConvexPolygon,
  Side, aabbFromPoints, aabbContains, classifyPoints, convexContains, signedDistance, PLANE_EPSILON, PROBE_OFFSET,
} from "../math";
import type { Wall } from "../csg";

export interface RefineOptions {
  /** Split empty leaves along the extensions of walls that end on them (see module docs). */
  readonly cornerSplits: boolean;
  /**
   * Refinement splits that would leave either side thinner than this (measured
   * along the split normal, world units) are rejected. 0 disables the limit.
   * Does not affect wall splits.
   */
  readonly minCellSize: number;
  /** Empty leaves wider/taller than this are halved by axis-aligned splits. 0 disables. */
  readonly maxCellSize: number;
}

/** A wall endpoint together with the wall's supporting line. */
export interface WallVertex {
  readonly p: Vec2;
  readonly line: Line2;
}

/** Both endpoints of every wall. */
export function wallVertices(walls: readonly Wall[]): WallVertex[] {
  return walls.flatMap((w) => [{ p: w.seg.a, line: w.line }, { p: w.seg.b, line: w.line }]);
}

/** True if any refinement is enabled (so the builder can skip the work entirely). */
export function refinementEnabled(opts: RefineOptions): boolean {
  return opts.cornerSplits || opts.maxCellSize > 0;
}

/**
 * Picks the next refinement splitter for an empty leaf region, or null if the
 * leaf should stay as it is.
 *
 * Corner splits come first; among them the most balanced one wins (largest
 * thinner side), which keeps cells compact. Only when no corner split applies
 * is the size limit enforced. Termination: a line that already bounds or cut
 * an ancestor region cannot span a descendant, so each corner line is used at
 * most once per path; size splits halve the region's extent.
 */
export function chooseRefineSplit(region: ConvexPolygon, vertices: readonly WallVertex[], opts: RefineOptions): Line2 | null {
  const box = aabbFromPoints(region.vertices);
  if (!box) return null;

  // Never cut slivers thinner than the probe offset, even with no minimum set.
  const minThickness = Math.max(opts.minCellSize, PROBE_OFFSET);
  if (opts.cornerSplits) {
    let best: Line2 | null = null;
    let bestThickness = 0;
    for (const v of vertices) {
      if (!aabbContains(box, v.p, PLANE_EPSILON) || !convexContains(region.vertices, v.p, false)) continue;
      const t = splitThickness(region, v.line);
      if (t > bestThickness && t >= minThickness) {
        best = v.line;
        bestThickness = t;
      }
    }
    if (best) return best;
  }

  if (opts.maxCellSize > 0) {
    const w = box.max.x - box.min.x;
    const h = box.max.y - box.min.y;
    if (Math.max(w, h) > opts.maxCellSize && Math.max(w, h) / 2 >= minThickness) {
      return w >= h
        ? { n: { x: 1, y: 0 }, d: (box.min.x + box.max.x) / 2 }
        : { n: { x: 0, y: 1 }, d: (box.min.y + box.max.y) / 2 };
    }
  }
  return null;
}

/**
 * Thickness of the thinner side when `line` splits `region`: min over sides of
 * the farthest vertex distance. 0 if the line does not span the region.
 */
function splitThickness(region: ConvexPolygon, line: Line2): number {
  if (classifyPoints(line, region.vertices) !== Side.Spanning) return 0;
  let front = 0, back = 0;
  for (const p of region.vertices) {
    const s = signedDistance(line, p);
    if (s > front) front = s;
    if (-s > back) back = -s;
  }
  return Math.min(front, back);
}
