/**
 * Solid-leaf BSP construction from walls.
 *
 * Classic recursive build:
 *
 * 1. Pick a splitter plane among the planes of the remaining wall fragments
 *    (heuristic: few splits, balanced sides).
 * 2. Fragments lying on the splitter and facing the same way are *consumed* by
 *    the node — this is what de-duplicates coplanar walls, so a long wall made
 *    of many collinear pieces only ever produces one split.
 * 3. Others go front/back; fragments spanning the plane are split in two.
 *    Coplanar fragments facing the opposite way go to the back.
 * 4. Recurse. An empty front list yields an *empty* leaf (we are in front of
 *    every wall); an empty back list yields a *solid* leaf.
 *
 * 5. Optionally refine empty leaves with extra non-wall splits (corner
 *    extensions, cell size limits) — see `refine.ts`.
 *
 * While recursing, each node carries its convex region (the bounding box
 * clipped by all ancestor planes); leaves keep theirs. Region edges are tagged
 * with the plane that produced them so portals can be found exactly later.
 */

import {
  type Line2, type Segment, type ConvexPolygon,
  Side, classifySegment, splitSegment, dot, sameLine, clipPolygon, flipLine,
  aabbFromPoints, expandAabb, polygonFromAabb, segmentLength, MIN_LENGTH,
} from "../math";
import type { Wall } from "../csg";
import { type RefineOptions, chooseRefineSplit, refinementEnabled, wallVertices } from "./refine";
import { type BspLeaf, type BspNode, type BspStats, type BspTree, type ChildRef, type LeafContents, BOUNDS_TAG, leafRef } from "./types";

export interface BspBuildOptions extends RefineOptions {
  /** Cost of each wall split when scoring a candidate splitter. */
  readonly splitWeight: number;
  /** Cost of front/back imbalance (|front − back|) when scoring a splitter. */
  readonly balanceWeight: number;
  /** Margin added around the walls' bounding box to close off leaf regions. */
  readonly boundsMargin: number;
}

export const DEFAULT_BSP_OPTIONS: BspBuildOptions = Object.freeze({
  splitWeight: 8,
  balanceWeight: 1,
  boundsMargin: 4,
  cornerSplits: true,
  minCellSize: 0.5,
  maxCellSize: 0,
});

interface Fragment {
  readonly seg: Segment;
  readonly plane: number;
}

interface Partition {
  readonly front: Fragment[];
  readonly back: Fragment[];
  readonly splits: number;
}

export interface BspBuildResult {
  readonly tree: BspTree;
  readonly stats: BspStats;
}

export function buildBsp(walls: readonly Wall[], options: Partial<BspBuildOptions> = {}): BspBuildResult {
  const opts: BspBuildOptions = { ...DEFAULT_BSP_OPTIONS, ...options };
  const planes: Line2[] = [];
  const fragments: Fragment[] = walls.map((w) => ({ seg: w.seg, plane: internPlane(planes, w.line) }));

  const points = walls.flatMap((w) => [w.seg.a, w.seg.b]);
  const bounds = expandAabb(aabbFromPoints(points) ?? { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } }, opts.boundsMargin);
  const rootRegion = polygonFromAabb(bounds, [BOUNDS_TAG, BOUNDS_TAG, BOUNDS_TAG, BOUNDS_TAG]);

  const nodes: BspNode[] = [];
  const leaves: BspLeaf[] = [];
  let splitCount = 0;
  let refineSplitCount = 0;
  const vertices = refinementEnabled(opts) ? wallVertices(walls) : [];
  let maxDepth = 0;

  const addLeaf = (contents: LeafContents, region: ConvexPolygon | null, depth: number): ChildRef => {
    leaves.push({ contents, region, depth });
    maxDepth = Math.max(maxDepth, depth);
    return leafRef(leaves.length - 1);
  };

  /** Empty space: either refine it with extra splits or close it off as an empty leaf. */
  const buildEmpty = (region: ConvexPolygon | null, depth: number): ChildRef => {
    const line = region && refinementEnabled(opts) ? chooseRefineSplit(region, vertices, opts) : null;
    if (!line || !region) return addLeaf("empty", region, depth);
    const planeIndex = internPlane(planes, line);
    refineSplitCount++;
    const nodeIndex = nodes.length;
    nodes.push(null as unknown as BspNode);
    const front = buildEmpty(clipPolygon(region, line, planeIndex), depth + 1);
    const back = buildEmpty(clipPolygon(region, flipLine(line), planeIndex), depth + 1);
    nodes[nodeIndex] = { plane: planeIndex, front, back, region };
    return nodeIndex;
  };

  const build = (frags: readonly Fragment[], region: ConvexPolygon | null, depth: number): ChildRef => {
    const planeIndex = chooseSplitter(frags, planes, opts);
    const line = planes[planeIndex];
    const part = partition(frags, planeIndex, planes);
    splitCount += part.splits;

    // Reserve the node slot first so parents get lower indices than children (nicer for export/debugging).
    const nodeIndex = nodes.length;
    nodes.push(null as unknown as BspNode);
    const frontRegion = region && clipPolygon(region, line, planeIndex);
    const backRegion = region && clipPolygon(region, flipLine(line), planeIndex);
    const front = part.front.length > 0 ? build(part.front, frontRegion, depth + 1) : buildEmpty(frontRegion, depth + 1);
    const back = part.back.length > 0 ? build(part.back, backRegion, depth + 1) : addLeaf("solid", backRegion, depth + 1);
    nodes[nodeIndex] = { plane: planeIndex, front, back, region };
    return nodeIndex;
  };

  const root = fragments.length > 0 ? build(fragments, rootRegion, 0) : addLeaf("solid", rootRegion, 0);

  const tree: BspTree = { planes, nodes, leaves, root, bounds };
  const emptyLeafCount = leaves.filter((l) => l.contents === "empty").length;
  return {
    tree,
    stats: {
      nodeCount: nodes.length,
      leafCount: leaves.length,
      emptyLeafCount,
      solidLeafCount: leaves.length - emptyLeafCount,
      maxDepth,
      splitCount,
      refineSplitCount,
    },
  };
}

/** Returns the index of an existing identically-oriented plane, or adds a new one. */
function internPlane(planes: Line2[], line: Line2): number {
  const i = planes.findIndex((p) => dot(p.n, line.n) > 0 && sameLine(p, line));
  if (i >= 0) return i;
  planes.push(line);
  return planes.length - 1;
}

/** Scores every distinct plane among the fragments and returns the cheapest. */
function chooseSplitter(frags: readonly Fragment[], planes: readonly Line2[], opts: BspBuildOptions): number {
  const candidates = [...new Set(frags.map((f) => f.plane))];
  if (candidates.length === 1) return candidates[0];
  let best = candidates[0];
  let bestScore = Infinity;
  for (const plane of candidates) {
    const line = planes[plane];
    let front = 0, back = 0, splits = 0;
    for (const f of frags) {
      if (f.plane === plane) continue;
      switch (classifySegment(line, f.seg)) {
        case Side.Front: front++; break;
        case Side.Back: back++; break;
        case Side.Spanning: splits++; front++; back++; break;
        case Side.On: if (dot(planes[f.plane].n, line.n) < 0) back++; break;
      }
    }
    const score = splits * opts.splitWeight + Math.abs(front - back) * opts.balanceWeight;
    if (score < bestScore) {
      bestScore = score;
      best = plane;
    }
  }
  return best;
}

/** Distributes fragments to the front/back of a plane, consuming same-facing coplanar ones. */
function partition(frags: readonly Fragment[], planeIndex: number, planes: readonly Line2[]): Partition {
  const line = planes[planeIndex];
  const front: Fragment[] = [];
  const back: Fragment[] = [];
  let splits = 0;
  for (const f of frags) {
    if (f.plane === planeIndex) continue; // consumed by this node
    switch (classifySegment(line, f.seg)) {
      case Side.Front: front.push(f); break;
      case Side.Back: back.push(f); break;
      case Side.On:
        if (dot(planes[f.plane].n, line.n) < 0) back.push(f); // opposite-facing coplanar wall
        break; // same-facing coplanar (different plane id within tolerance): consumed
      case Side.Spanning: {
        const { front: fs, back: bs } = splitSegment(f.seg, line);
        if (segmentLength(fs) >= MIN_LENGTH) front.push({ seg: fs, plane: f.plane });
        if (segmentLength(bs) >= MIN_LENGTH) back.push({ seg: bs, plane: f.plane });
        splits++;
        break;
      }
    }
  }
  return { front, back, splits };
}
