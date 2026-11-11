/** Shared test utilities. */

import {
  type Brush, type BrushKind, type Level, type Vec2, type Wall, type CompileResult,
  LEVEL_FORMAT, LEVEL_VERSION, makeBoxBrush, segmentIntersection, locateLeaf, convexContains,
} from "../src/core";

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function boxLevel(boxes: [BrushKind, number, number, number, number][]): Level {
  const brushes: Brush[] = boxes.map(([kind, x0, y0, x1, y1], i) => makeBoxBrush(i + 1, kind, { x: x0, y: y0 }, { x: x1, y: y1 })!);
  return { format: LEVEL_FORMAT, version: LEVEL_VERSION, brushes };
}

/** Random grid-aligned level: a chain of overlapping rooms plus some solid blocks. */
export function randomLevel(seed: number, roomCount = 8): Level {
  const r = rng(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const boxes: [BrushKind, number, number, number, number][] = [];
  let x = 0, y = 0;
  for (let i = 0; i < roomCount; i++) {
    const w = int(2, 9), h = int(2, 9);
    boxes.push(["room", x, y, x + w, y + h]);
    // Next room overlaps or touches this one.
    if (r() < 0.5) { x += int(1, w); y += int(-h + 1, h - 1); }
    else { y += int(1, h); x += int(-w + 1, w - 1); }
  }
  for (let i = 0; i < roomCount / 2; i++) {
    const [, x0, y0, x1, y1] = boxes[int(0, boxes.length - 1)];
    if (x1 - x0 < 4 || y1 - y0 < 4) continue;
    const sx = int(x0 + 1, x1 - 2), sy = int(y0 + 1, y1 - 2);
    boxes.push(["solid", sx, sy, sx + 1, sy + 1]);
  }
  return boxLevel(boxes);
}

/** True if the open segment p→q does not touch any wall. */
export function lineOfSight(walls: readonly Wall[], p: Vec2, q: Vec2): boolean {
  return !walls.some((w) => segmentIntersection(p, q, w.seg.a, w.seg.b, 1e-6) !== null);
}

/** Random point uniformly inside a leaf's convex region (rejection sampling in its AABB). */
export function randomPointInLeaf(result: CompileResult, leaf: number, rand: () => number): Vec2 | null {
  const region = result.tree.leaves[leaf].region;
  if (!region) return null;
  const xs = region.vertices.map((v) => v.x), ys = region.vertices.map((v) => v.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  for (let i = 0; i < 64; i++) {
    const p = { x: x0 + (x1 - x0) * rand(), y: y0 + (y1 - y0) * rand() };
    if (convexContains(region.vertices, p, true, 1e-3) && locateLeaf(result.tree, p) === leaf) return p;
  }
  return null;
}

export function emptyLeaves(result: CompileResult): number[] {
  return result.tree.leaves.flatMap((l, i) => (l.contents === "empty" && l.region ? [i] : []));
}
