/**
 * Portal visibility → leaf visibility (the PVS proper).
 *
 * A leaf sees itself, its direct neighbours, and every leaf that any of its
 * outgoing portals can see into (Golodetz Listing 6).
 */

import type { BspTree } from "../bsp";
import type { PortalGraph } from "../portals";
import { BitSet } from "./bitset";

/**
 * How to reconcile A→B and B→A results. True visibility is symmetric and the
 * flow is conservative in both directions, so intersecting the two is still
 * conservative and slightly tighter; union is the most defensive option.
 */
export type PvsSymmetry = "none" | "intersect" | "union";

/** Returns one PVS row per BSP leaf (solid and degenerate leaves get empty rows). */
export function computeLeafPvs(tree: BspTree, graph: PortalGraph, portalVis: readonly BitSet[], symmetry: PvsSymmetry = "none"): BitSet[] {
  const leafCount = tree.leaves.length;
  const pvs = tree.leaves.map((leaf, i) => {
    const row = new BitSet(leafCount);
    if (leaf.contents !== "empty" || !leaf.region) return row;
    row.set(i);
    for (const pid of graph.portalsFrom[i]) {
      row.set(graph.portals[pid].to);
      for (const k of portalVis[pid].toArray()) row.set(graph.portals[k].to);
    }
    return row;
  });

  if (symmetry === "none") return pvs;
  const out = pvs.map((row) => row.clone());
  for (let a = 0; a < leafCount; a++) {
    for (let b = 0; b < leafCount; b++) {
      const ab = pvs[a].has(b), ba = pvs[b].has(a);
      const keep = symmetry === "intersect" ? ab && ba : ab || ba;
      if (keep) out[a].set(b);
      else out[a].clear(b);
    }
  }
  return out;
}
