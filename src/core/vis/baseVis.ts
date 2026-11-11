/**
 * Base vis: a cheap, conservative first estimate of portal-to-portal
 * visibility ("might see"), used to prune the expensive flow stage.
 *
 * Two rules (Golodetz 2009, Listing 4; Quake `vis` "BasePortalVis"):
 *
 * 1. Portal `i` can only see portal `j` if `j` has some part strictly *in
 *    front* of `i` — i.e. on the destination side of `i`.
 * 2. Portal `j` must lead *away* from `i`: `i` must have some part strictly
 *    *behind* `j`. (A portal pointing back towards `i` is seen from its back.)
 *
 * Then a flood fill from `i` through the graph, only along portals passing
 * both rules, removes portals that pass the rules but are not reachable
 * (Golodetz Listing 5).
 */

import { Side, classifySegment } from "../math";
import type { PortalGraph } from "../portals";
import { BitSet } from "./bitset";

/** Rule 1 + rule 2 for an ordered portal pair. */
export function portalMightSeePortal(graph: PortalGraph, i: number, j: number): boolean {
  if (i === j) return false;
  const pi = graph.portals[i], pj = graph.portals[j];
  const jVsI = classifySegment(pi.line, pj.seg);
  if (jVsI !== Side.Front && jVsI !== Side.Spanning) return false;
  const iVsJ = classifySegment(pj.line, pi.seg);
  return iVsJ === Side.Back || iVsJ === Side.Spanning;
}

/** Computes the "might see" set of every portal. */
export function computeBaseVis(graph: PortalGraph): BitSet[] {
  const n = graph.portals.length;
  const result: BitSet[] = [];
  for (let i = 0; i < n; i++) {
    const candidate = new BitSet(n);
    for (let j = 0; j < n; j++) if (portalMightSeePortal(graph, i, j)) candidate.set(j);

    // Flood through candidate portals starting from the leaf portal i leads into.
    const reached = new BitSet(n);
    const stack = [graph.portals[i].to];
    const visitedLeaf = new Uint8Array(graph.leafCount);
    visitedLeaf[graph.portals[i].to] = 1;
    while (stack.length) {
      const leaf = stack.pop()!;
      for (const pid of graph.portalsFrom[leaf]) {
        if (!candidate.has(pid) || reached.has(pid)) continue;
        reached.set(pid);
        const to = graph.portals[pid].to;
        if (!visitedLeaf[to]) {
          visitedLeaf[to] = 1;
          stack.push(to);
        }
      }
    }
    result.push(reached);
  }
  return result;
}
