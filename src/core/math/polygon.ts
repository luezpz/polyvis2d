/**
 * Convex polygons with per-edge tags.
 *
 * BSP leaf regions are convex polygons produced by repeatedly clipping a big
 * bounding polygon with splitter lines. Each edge remembers *which* line
 * produced it (its `tag`, usually a BSP plane index). Two leaves can only share
 * a portal along edges with the same tag, which makes portal discovery robust
 * without fuzzy collinearity tests.
 *
 * Vertices are stored counter-clockwise; edge `i` runs from `vertices[i]` to
 * `vertices[(i + 1) % n]` and has the interior on its left.
 */

import { type Vec2, cross, distance, lerp, sub } from "./vec2";
import { type Line2, flipLine, signedDistance } from "./line2";
import { MIN_AREA, MIN_LENGTH, PLANE_EPSILON } from "./tolerance";
import type { Aabb } from "./aabb";

/** Tag used for edges that do not originate from any known line. */
export const NO_TAG = -1;

export interface ConvexPolygon {
  /** Counter-clockwise vertex loop. */
  readonly vertices: readonly Vec2[];
  /** `tags[i]` identifies the line that produced edge i (vertices[i] → vertices[i+1]). */
  readonly tags: readonly number[];
}

export function makePolygon(vertices: readonly Vec2[], tags?: readonly number[]): ConvexPolygon {
  return { vertices, tags: tags ?? vertices.map(() => NO_TAG) };
}

/** Rectangle for a bounding box. Edge order: bottom, right, top, left. */
export function polygonFromAabb(b: Aabb, tags: readonly [number, number, number, number] = [NO_TAG, NO_TAG, NO_TAG, NO_TAG]): ConvexPolygon {
  return {
    vertices: [
      { x: b.min.x, y: b.min.y },
      { x: b.max.x, y: b.min.y },
      { x: b.max.x, y: b.max.y },
      { x: b.min.x, y: b.max.y },
    ],
    tags: [...tags],
  };
}

/** Signed area (positive for counter-clockwise loops). */
export function signedArea(vertices: readonly Vec2[]): number {
  let a = 0;
  for (let i = 0, n = vertices.length; i < n; i++) {
    const p = vertices[i], q = vertices[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return a * 0.5;
}

/** Area centroid (falls back to the vertex average for degenerate loops). */
export function centroid(vertices: readonly Vec2[]): Vec2 {
  const n = vertices.length;
  let cx = 0, cy = 0, a = 0;
  for (let i = 0; i < n; i++) {
    const p = vertices[i], q = vertices[(i + 1) % n];
    const w = p.x * q.y - q.x * p.y;
    a += w;
    cx += (p.x + q.x) * w;
    cy += (p.y + q.y) * w;
  }
  if (Math.abs(a) < 1e-12) {
    let sx = 0, sy = 0;
    for (const p of vertices) { sx += p.x; sy += p.y; }
    return { x: sx / Math.max(1, n), y: sy / Math.max(1, n) };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

/**
 * Point-in-convex-polygon test for a counter-clockwise loop.
 * With `strict` the boundary (± eps) counts as outside, otherwise as inside.
 */
export function convexContains(vertices: readonly Vec2[], p: Vec2, strict = false, eps = PLANE_EPSILON): boolean {
  for (let i = 0, n = vertices.length; i < n; i++) {
    const a = vertices[i], b = vertices[(i + 1) % n];
    const e = sub(b, a);
    const len = Math.hypot(e.x, e.y);
    if (len === 0) continue;
    const d = cross(e, sub(p, a)) / len; // distance to the left of the edge
    if (strict ? d <= eps : d < -eps) return false;
  }
  return true;
}

/**
 * Clips a convex polygon to the front half-space of `line` (Sutherland–Hodgman).
 *
 * Edges created along the clip line receive `newTag`; surviving edges keep
 * their tags. Returns null if the result is empty or degenerate.
 */
export function clipPolygon(poly: ConvexPolygon, line: Line2, newTag: number, eps = PLANE_EPSILON): ConvexPolygon | null {
  const { vertices, tags } = poly;
  const n = vertices.length;
  const dist = vertices.map((v) => signedDistance(line, v));
  if (dist.every((d) => d >= -eps)) return poly;
  if (dist.every((d) => d <= eps)) return null;

  const outV: Vec2[] = [];
  const outT: number[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dc = dist[i], dn = dist[j];
    const curIn = dc >= -eps;
    const nextIn = dn >= -eps;
    const crossing = (dc > eps && dn < -eps) || (dc < -eps && dn > eps);
    if (curIn) {
      outV.push(vertices[i]);
      // Leaving the half-space exactly at this vertex: the outgoing edge runs along the clip line.
      outT.push(!nextIn && !crossing ? newTag : tags[i]);
    }
    if (crossing) {
      outV.push(lerp(vertices[i], vertices[j], dc / (dc - dn)));
      // Leaving → the next edge runs along the clip line. Entering → continue along the original edge.
      outT.push(curIn ? newTag : tags[i]);
    }
  }
  return sanitizePolygon(outV, outT);
}

/** Splits a polygon by `line` into front and back parts (either may be null). */
export function splitPolygon(poly: ConvexPolygon, line: Line2, tag: number, eps = PLANE_EPSILON): { front: ConvexPolygon | null; back: ConvexPolygon | null } {
  return { front: clipPolygon(poly, line, tag, eps), back: clipPolygon(poly, flipLine(line), tag, eps) };
}

/** Removes near-duplicate consecutive vertices; returns null if the polygon degenerates. */
function sanitizePolygon(v: Vec2[], t: number[]): ConvexPolygon | null {
  const outV: Vec2[] = [];
  const outT: number[] = [];
  for (let i = 0; i < v.length; i++) {
    // Drop v[i] if it coincides with the next vertex; that vertex keeps its own outgoing tag.
    if (distance(v[i], v[(i + 1) % v.length]) < MIN_LENGTH) continue;
    outV.push(v[i]);
    outT.push(t[i]);
  }
  if (outV.length < 3 || signedArea(outV) < MIN_AREA) return null;
  return { vertices: outV, tags: outT };
}

/** Convex hull (Andrew's monotone chain): counter-clockwise, collinear points removed. */
export function convexHull(points: readonly Vec2[]): Vec2[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const chain = (src: readonly Vec2[]): Vec2[] => {
    const h: Vec2[] = [];
    for (const p of src) {
      while (h.length >= 2 && cross(sub(h[h.length - 1], h[h.length - 2]), sub(p, h[h.length - 2])) <= 1e-12) h.pop();
      h.push(p);
    }
    h.pop();
    return h;
  };
  return chain(pts).concat(chain([...pts].reverse()));
}

/** True if the loop is strictly convex and counter-clockwise. */
export function isConvexCCW(vertices: readonly Vec2[]): boolean {
  const n = vertices.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    const a = vertices[i], b = vertices[(i + 1) % n], c = vertices[(i + 2) % n];
    if (cross(sub(b, a), sub(c, b)) <= 0) return false;
  }
  return true;
}
