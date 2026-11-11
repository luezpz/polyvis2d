/**
 * Line segments (2D "windings") and their clipping operations.
 *
 * In 2D, a wall face or a portal is a segment. Segments are oriented: a→b with
 * the *front* (empty space for walls, destination leaf for portals) on the left.
 */

import { type Vec2, distance, lerp, sub, cross } from "./vec2";
import { type Line2, Side, signedDistance } from "./line2";
import { MIN_LENGTH, PLANE_EPSILON } from "./tolerance";

export interface Segment {
  readonly a: Vec2;
  readonly b: Vec2;
}

export const segmentLength = (s: Segment): number => distance(s.a, s.b);

/** Reverses the orientation of a segment. */
export const reverseSegment = (s: Segment): Segment => ({ a: s.b, b: s.a });

export function classifySegment(line: Line2, s: Segment, eps = PLANE_EPSILON): Side {
  const da = signedDistance(line, s.a);
  const db = signedDistance(line, s.b);
  const fa = da > eps, fb = db > eps, ba = da < -eps, bb = db < -eps;
  if ((fa && bb) || (ba && fb)) return Side.Spanning;
  if (fa || fb) return Side.Front;
  if (ba || bb) return Side.Back;
  return Side.On;
}

/**
 * Keeps the part of `s` strictly in front of `line`.
 *
 * Parts lying *on* the line are discarded: for visibility purposes a portal
 * that only touches a separating line cannot be seen through.
 * Returns null if nothing (of meaningful length) remains.
 */
export function clipSegmentFront(s: Segment, line: Line2, eps = PLANE_EPSILON): Segment | null {
  const da = signedDistance(line, s.a);
  const db = signedDistance(line, s.b);
  if (da <= eps && db <= eps) return null; // fully behind or on
  if (da >= -eps && db >= -eps) return s; // fully in front (touching allowed)
  const p = lerp(s.a, s.b, da / (da - db));
  const out = da > 0 ? { a: s.a, b: p } : { a: p, b: s.b };
  return segmentLength(out) < MIN_LENGTH ? null : out;
}

/** Splits a segment that spans `line` into its front and back parts. */
export function splitSegment(s: Segment, line: Line2): { front: Segment; back: Segment } {
  const da = signedDistance(line, s.a);
  const db = signedDistance(line, s.b);
  const p = lerp(s.a, s.b, da / (da - db));
  return da > 0
    ? { front: { a: s.a, b: p }, back: { a: p, b: s.b } }
    : { front: { a: p, b: s.b }, back: { a: s.a, b: p } };
}

/**
 * Intersection of segments p0→p1 and q0→q1.
 *
 * Returns the parameters (`t` along p, `u` along q) if they intersect within
 * both segments (endpoints included, with tolerance `eps` in parameter space),
 * otherwise null. Parallel segments return null.
 */
export function segmentIntersection(p0: Vec2, p1: Vec2, q0: Vec2, q1: Vec2, eps = 1e-9): { t: number; u: number } | null {
  const r = sub(p1, p0);
  const s = sub(q1, q0);
  const denom = cross(r, s);
  if (Math.abs(denom) < 1e-12) return null;
  const qp = sub(q0, p0);
  const t = cross(qp, s) / denom;
  const u = cross(qp, r) / denom;
  if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return null;
  return { t, u };
}

/** Projects `p` onto the infinite line through `s`; returns the parameter (0 at a, 1 at b). */
export function projectParam(s: Segment, p: Vec2): number {
  const d = sub(s.b, s.a);
  const len2 = d.x * d.x + d.y * d.y;
  return len2 > 0 ? ((p.x - s.a.x) * d.x + (p.y - s.a.y) * d.y) / len2 : 0;
}

/** Distance from point `p` to the infinite line through `s`. */
export function distanceToSegmentLine(s: Segment, p: Vec2): number {
  const len = segmentLength(s);
  return len > 0 ? Math.abs(cross(sub(s.b, s.a), sub(p, s.a))) / len : distance(s.a, p);
}

/** Distance from point `p` to the closest point of the (finite) segment `s`. */
export function distanceToSegment(s: Segment, p: Vec2): number {
  const t = Math.min(1, Math.max(0, projectParam(s, p)));
  return distance(lerp(s.a, s.b, t), p);
}
