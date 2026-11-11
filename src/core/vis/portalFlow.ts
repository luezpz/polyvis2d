/**
 * Portal flow: the precise (but still conservative) portal-to-portal
 * visibility stage, after Teller (1992), Quake's `vis` (RecursiveLeafFlow) and
 * Golodetz (2009).
 *
 * For every *source* portal S we walk outward through the portal graph,
 * depth-first. The walk state is
 *
 *   - `source`: the part of S that can still see along the current chain,
 *   - `pass`:   the part of the latest portal visible through the chain,
 *   - `might`:  portals still possibly visible (intersection of "might see"
 *               sets of every portal on the chain).
 *
 * At each leaf, each outgoing *generator* portal G is tested:
 *
 *   1. The source is clipped to the back of G (sight lines go forward).
 *   2. G is clipped to the front of S's line.
 *   3. G is clipped by the antipenumbra of (source, pass): separators with
 *      `pass` in front. Whatever survives can be seen from the source through
 *      the whole chain.
 *   4. The source is clipped by the antipenumbra of (G, pass) — the "reverse"
 *      antipenumbra — shrinking it to the part that can actually see G. This
 *      tightens all further steps.
 *
 * If G survives, it is marked visible from S and the walk recurses through it.
 * Shrinking `source` and `pass` along the chain is conservative: any real
 * sight line through the chain hits each clipped winding, so it is never
 * clipped away.
 */

import { type Segment, clipSegmentFront, flipLine } from "../math";
import type { PortalGraph } from "../portals";
import { BitSet } from "./bitset";
import { buildSeparators, clipToLines } from "./antipenumbra";

export interface PortalFlowOptions {
  /** Clip the source by the reverse antipenumbra (step 4). Tighter results, slightly more work. */
  readonly clipSource: boolean;
  /**
   * Safety valve: maximum number of generator tests across the whole run.
   * When exceeded, remaining source portals fall back to their base "might see"
   * set (still conservative). 0 disables the limit.
   */
  readonly maxSteps: number;
}

export const DEFAULT_PORTAL_FLOW_OPTIONS: PortalFlowOptions = Object.freeze({
  clipSource: true,
  maxSteps: 20_000_000,
});

export interface PortalFlowStats {
  /** Number of generator portals tested. */
  readonly steps: number;
  /** Deepest portal chain explored. */
  readonly maxChainDepth: number;
  /** True if {@link PortalFlowOptions.maxSteps} was hit. */
  readonly truncated: boolean;
}

export interface PortalFlowResult {
  /** `portalVis[i]` = portals potentially visible through portal i. */
  readonly portalVis: BitSet[];
  readonly stats: PortalFlowStats;
}

export function computePortalFlow(graph: PortalGraph, mightSee: readonly BitSet[], options: Partial<PortalFlowOptions> = {}): PortalFlowResult {
  const opts: PortalFlowOptions = { ...DEFAULT_PORTAL_FLOW_OPTIONS, ...options };
  const { portals, portalsFrom } = graph;
  const n = portals.length;
  const portalVis: BitSet[] = new Array(n);
  const done = new Uint8Array(n);
  const onChain = new Uint8Array(graph.leafCount);
  let steps = 0;
  let maxChainDepth = 0;
  let truncated = false;

  // Process portals that might see the least first: their final results then
  // prune the searches of more complex portals (Quake's "sorted portals").
  const order = [...portals.keys()].sort((a, b) => mightSee[a].count() - mightSee[b].count());

  for (const sourceId of order) {
    const sourcePortal = portals[sourceId];
    if (truncated) {
      portalVis[sourceId] = mightSee[sourceId].clone();
      done[sourceId] = 1;
      continue;
    }
    const vis = new BitSet(n);
    const sourceLine = sourcePortal.line;

    const recurse = (leaf: number, source: Segment, pass: Segment | null, might: BitSet, depth: number): void => {
      if (depth > maxChainDepth) maxChainDepth = depth;
      for (const gid of portalsFrom[leaf]) {
        if (!might.has(gid)) continue;
        const gen = portals[gid];
        if (onChain[gen.to]) continue; // a straight line cannot re-enter a convex leaf

        // Prune: if G is already known visible and nothing new could be found beyond it, skip.
        const newMight = might.and(done[gid] ? portalVis[gid] : mightSee[gid]);
        if (vis.has(gid) && !newMight.hasAnyNotIn(vis)) continue;

        if (opts.maxSteps > 0 && ++steps > opts.maxSteps) {
          truncated = true;
          return;
        }

        // 1. Sight lines leave the source forward through G: keep the part of the source behind G.
        let src = clipSegmentFront(source, flipLine(gen.line));
        if (!src) continue;
        // 2. G must be in front of the original source portal.
        let g = clipSegmentFront(gen.seg, sourceLine);
        if (!g) continue;

        if (pass) {
          // 3. Clip G to the antipenumbra of (source, pass).
          g = clipToLines(g, buildSeparators(src, pass));
          if (!g) continue;
          // 4. Clip the source to the reverse antipenumbra of (G, pass).
          if (opts.clipSource) {
            src = clipToLines(src, buildSeparators(g, pass));
            if (!src) continue;
          }
        }

        vis.set(gid);
        onChain[gen.to] = 1;
        recurse(gen.to, src, g, newMight, depth + 1);
        onChain[gen.to] = 0;
        if (truncated) return;
      }
    };

    onChain[sourcePortal.from] = 1;
    onChain[sourcePortal.to] = 1;
    recurse(sourcePortal.to, sourcePortal.seg, null, mightSee[sourceId], 1);
    onChain.fill(0);

    // If we were cut short, fall back to the conservative estimate for this portal too.
    portalVis[sourceId] = truncated ? mightSee[sourceId].clone() : vis;
    done[sourceId] = 1;
  }

  return { portalVis, stats: { steps, maxChainDepth, truncated } };
}
