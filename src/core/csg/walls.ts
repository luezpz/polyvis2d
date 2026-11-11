/**
 * CSG: turns overlapping convex brushes into the boundary "walls" of the
 * empty space.
 *
 *   empty = (∪ room brushes) − (∪ solid brushes)
 *
 * Algorithm (an edge-based variant of the classic Quake `qbsp` CSG step):
 *
 * 1. **Fragment.** Every brush edge is split at every point where another
 *    brush's edge crosses or touches it, and at every other-brush vertex lying
 *    on it. After this, any two collinear overlapping edges have been cut into
 *    identical pieces.
 * 2. **Classify.** For each piece, probe a point a tiny distance to its left
 *    and to its right. If exactly one side is empty space the piece is a wall;
 *    it is oriented so the empty side is on its left (its front).
 *    Pieces internal to the union (both sides empty) or buried in solid (both
 *    sides solid) are discarded — this is what removes the faces where rooms
 *    touch or overlap.
 * 3. **De-duplicate.** Coincident edges from different brushes produce
 *    identical wall pieces; keep one.
 * 4. **Merge.** Collinear, touching, same-facing pieces are welded back
 *    together so the BSP sees long clean walls instead of many fragments.
 *
 * The output boundary is always closed (watertight) because it is the boundary
 * of a union of polygons. Raw, possibly leaky input (e.g. imported meshes) can
 * skip this module and feed walls straight into the BSP compiler.
 */

import {
  type Vec2, type Segment, type Line2,
  addScaled, distance, lerp, midpoint, normalize, perpLeft, sub, dot,
  segmentIntersection, projectParam, distanceToSegmentLine, convexContains, lineFromPoints,
  KEY_QUANTUM, MIN_LENGTH, PLANE_EPSILON, PROBE_OFFSET,
} from "../math";
import type { Brush } from "../level";

/** A boundary segment of the empty space. Empty space is on its left (front). */
export interface Wall {
  readonly seg: Segment;
  /** Supporting line; its normal points into empty space. */
  readonly line: Line2;
  /** Brush that contributed this wall (for debugging/highlighting); -1 if unknown. */
  readonly brushId: number;
}

/** Point classifier for the CSG result. */
export type EmptySpaceTest = (p: Vec2) => boolean;

/** Builds the empty-space membership test for a set of brushes. */
export function makeEmptySpaceTest(brushes: readonly Brush[]): EmptySpaceTest {
  const rooms = brushes.filter((b) => b.kind === "room");
  const solids = brushes.filter((b) => b.kind === "solid");
  // Strict containment: brush boundaries are never empty on their own; the probes sit off the boundary.
  return (p) => rooms.some((b) => convexContains(b.vertices, p, true)) && !solids.some((b) => convexContains(b.vertices, p, true));
}

/** Creates a wall from a segment (empty space on the left). Returns null for degenerate segments. */
export function makeWall(seg: Segment, brushId = -1): Wall | null {
  const line = lineFromPoints(seg.a, seg.b);
  if (!line || distance(seg.a, seg.b) < MIN_LENGTH) return null;
  return { seg, line, brushId };
}

/** Computes the walls of the CSG result of `brushes`. */
export function buildWalls(brushes: readonly Brush[]): Wall[] {
  const isEmpty = makeEmptySpaceTest(brushes);
  const pieces: Wall[] = [];

  for (const brush of brushes) {
    const n = brush.vertices.length;
    for (let i = 0; i < n; i++) {
      const edge: Segment = { a: brush.vertices[i], b: brush.vertices[(i + 1) % n] };
      for (const piece of fragmentEdge(edge, brush, brushes)) {
        const wall = classifyPiece(piece, brush.id, isEmpty);
        if (wall) pieces.push(wall);
      }
    }
  }
  return mergeCollinear(dedupe(pieces));
}

/** Splits an edge at all intersections with other brushes' edges and vertices. */
function fragmentEdge(edge: Segment, owner: Brush, brushes: readonly Brush[]): Segment[] {
  const params: number[] = [0, 1];
  const len = distance(edge.a, edge.b);
  const paramEps = MIN_LENGTH / Math.max(len, MIN_LENGTH);

  for (const other of brushes) {
    if (other === owner) continue;
    const m = other.vertices.length;
    for (let j = 0; j < m; j++) {
      const p = other.vertices[j];
      const q = other.vertices[(j + 1) % m];
      const hit = segmentIntersection(edge.a, edge.b, p, q);
      if (hit) params.push(hit.t);
      // Vertices lying on the edge (covers collinear overlaps, which `segmentIntersection` ignores).
      if (distanceToSegmentLine(edge, p) < PLANE_EPSILON) params.push(projectParam(edge, p));
    }
  }

  params.sort((x, y) => x - y);
  const cuts: number[] = [];
  for (const t of params) {
    if (t < 0 || t > 1) continue;
    if (cuts.length === 0 || t - cuts[cuts.length - 1] > paramEps) cuts.push(t);
  }
  // Make sure the final cut is exactly 1 (it may have been merged with a nearby parameter).
  cuts[cuts.length - 1] = 1;

  const out: Segment[] = [];
  for (let k = 0; k + 1 < cuts.length; k++) {
    out.push({ a: k === 0 ? edge.a : lerp(edge.a, edge.b, cuts[k]), b: k + 2 === cuts.length ? edge.b : lerp(edge.a, edge.b, cuts[k + 1]) });
  }
  return out;
}

/** Decides whether a piece separates empty from non-empty space, and orients it. */
function classifyPiece(piece: Segment, brushId: number, isEmpty: EmptySpaceTest): Wall | null {
  if (distance(piece.a, piece.b) < MIN_LENGTH) return null;
  const m = midpoint(piece.a, piece.b);
  const left = normalize(perpLeft(sub(piece.b, piece.a)));
  const emptyLeft = isEmpty(addScaled(m, left, PROBE_OFFSET));
  const emptyRight = isEmpty(addScaled(m, left, -PROBE_OFFSET));
  if (emptyLeft === emptyRight) return null;
  return makeWall(emptyLeft ? piece : { a: piece.b, b: piece.a }, brushId);
}

const quant = (v: number): number => Math.round(v / KEY_QUANTUM);
const pointKey = (p: Vec2): string => `${quant(p.x)},${quant(p.y)}`;

function dedupe(walls: readonly Wall[]): Wall[] {
  const seen = new Set<string>();
  return walls.filter((w) => {
    const key = `${pointKey(w.seg.a)}>${pointKey(w.seg.b)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Welds chains of collinear, same-direction walls that touch end-to-start. */
function mergeCollinear(walls: readonly Wall[]): Wall[] {
  const byStart = new Map<string, number[]>();
  const byEnd = new Map<string, number[]>();
  walls.forEach((w, i) => {
    push(byStart, pointKey(w.seg.a), i);
    push(byEnd, pointKey(w.seg.b), i);
  });
  const used = new Uint8Array(walls.length);
  const collinear = (i: number, j: number) => dot(walls[i].line.n, walls[j].line.n) > 1 - 1e-9;

  const out: Wall[] = [];
  for (let i = 0; i < walls.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    let a = walls[i].seg.a;
    let b = walls[i].seg.b;
    // Extend forward.
    for (let cur = i; ;) {
      const next = (byStart.get(pointKey(b)) ?? []).find((j) => !used[j] && collinear(cur, j));
      if (next === undefined) break;
      used[next] = 1;
      b = walls[next].seg.b;
      cur = next;
    }
    // Extend backward.
    for (let cur = i; ;) {
      const prev = (byEnd.get(pointKey(a)) ?? []).find((j) => !used[j] && collinear(cur, j));
      if (prev === undefined) break;
      used[prev] = 1;
      a = walls[prev].seg.a;
      cur = prev;
    }
    const merged = makeWall({ a, b }, walls[i].brushId);
    if (merged) out.push(merged);
  }
  return out;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
