/**
 * Oriented infinite lines — the 2D analogue of planes.
 *
 * A line is stored in Hessian normal form: the set of points `p` with
 * `dot(n, p) = d`, where `n` is a unit normal. The half-space the normal points
 * into is the line's *front*; the other half is its *back*. Every algorithm in
 * the compiler (BSP splitting, portal clipping, antipenumbra separators) works
 * in terms of these lines, so moving to 3D mostly means swapping this module
 * for a `Plane3`.
 */

import { type Vec2, dot, normalize, perpLeft, sub, neg } from "./vec2";
import { PLANE_EPSILON } from "./tolerance";

export interface Line2 {
  /** Unit normal. Points into the front half-space. */
  readonly n: Vec2;
  /** Signed distance of the line from the origin along `n`. */
  readonly d: number;
}

/** Classification of a point or primitive against a line. */
export const Side = {
  Front: 1,
  Back: -1,
  On: 0,
  /** Primitive has parts strictly on both sides. */
  Spanning: 2,
} as const;
export type Side = (typeof Side)[keyof typeof Side];

/**
 * Line through `a` and `b` whose front is to the *left* of the direction a→b.
 * Returns null if the points coincide.
 */
export function lineFromPoints(a: Vec2, b: Vec2): Line2 | null {
  const n = normalize(perpLeft(sub(b, a)));
  if (n.x === 0 && n.y === 0) return null;
  return { n, d: dot(n, a) };
}

/** Line through `p` with (not necessarily unit) normal `normal`. */
export function lineFromPointNormal(p: Vec2, normal: Vec2): Line2 {
  const n = normalize(normal);
  return { n, d: dot(n, p) };
}

/** Same line, opposite orientation. */
export const flipLine = (l: Line2): Line2 => ({ n: neg(l.n), d: -l.d });

/** Signed distance from the line: positive in front, negative behind. */
export const signedDistance = (l: Line2, p: Vec2): number => dot(l.n, p) - l.d;

export function classifyPoint(l: Line2, p: Vec2, eps = PLANE_EPSILON): Side {
  const s = signedDistance(l, p);
  if (s > eps) return Side.Front;
  if (s < -eps) return Side.Back;
  return Side.On;
}

/** Classifies a set of points (e.g. a polygon's vertices) against a line. */
export function classifyPoints(l: Line2, points: readonly Vec2[], eps = PLANE_EPSILON): Side {
  let front = false;
  let back = false;
  for (const p of points) {
    const s = signedDistance(l, p);
    if (s > eps) front = true;
    else if (s < -eps) back = true;
    if (front && back) return Side.Spanning;
  }
  if (front) return Side.Front;
  if (back) return Side.Back;
  return Side.On;
}

/** True if two lines are the same geometric line (orientation ignored). */
export function sameLine(a: Line2, b: Line2, eps = PLANE_EPSILON): boolean {
  const k = dot(a.n, b.n);
  if (Math.abs(Math.abs(k) - 1) > 1e-9 + eps) return false;
  return Math.abs(a.d - Math.sign(k) * b.d) <= eps;
}

/** Unit direction along the line, chosen so that the front is on its left. */
export const lineDirection = (l: Line2): Vec2 => ({ x: l.n.y, y: -l.n.x });
