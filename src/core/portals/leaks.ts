/**
 * Leak detection.
 *
 * In a watertight level every empty leaf is enclosed by walls, so no empty
 * leaf touches the outer bounding box. If one does, the level *leaks*: there is
 * a path from the void into the playable space (missing wall, cracks in an
 * imported mesh, ...).
 *
 * Quake's `qbsp` reacts by flood-filling from the outside and reporting the
 * path. We do the same: every empty leaf reachable through portals from a
 * bounds-touching leaf is reported as "outside". The compiler does *not* delete
 * those leaves — clipping every region to the bounding box already keeps them
 * finite, so vis still produces a (less effective, but correct) result.
 */

import type { BspTree } from "../bsp";
import { BOUNDS_TAG } from "../bsp";
import type { PortalGraph } from "./portals";

export interface LeakReport {
  /** True if any empty leaf touches the bounding box. */
  readonly leaking: boolean;
  /** Empty leaves that touch the bounding box directly. */
  readonly boundaryLeaves: readonly number[];
  /** All empty leaves reachable from the boundary leaves (includes them). */
  readonly outsideLeaves: readonly number[];
}

export function detectLeaks(tree: BspTree, graph: PortalGraph): LeakReport {
  const boundaryLeaves: number[] = [];
  tree.leaves.forEach((leaf, i) => {
    if (leaf.contents === "empty" && leaf.region?.tags.includes(BOUNDS_TAG)) boundaryLeaves.push(i);
  });

  const reached = new Uint8Array(tree.leaves.length);
  const stack = [...boundaryLeaves];
  for (const l of stack) reached[l] = 1;
  while (stack.length) {
    const l = stack.pop()!;
    for (const pid of graph.portalsFrom[l]) {
      const to = graph.portals[pid].to;
      if (!reached[to]) {
        reached[to] = 1;
        stack.push(to);
      }
    }
  }
  const outsideLeaves: number[] = [];
  reached.forEach((r, i) => r && outsideLeaves.push(i));
  return { leaking: boundaryLeaves.length > 0, boundaryLeaves, outsideLeaves };
}
