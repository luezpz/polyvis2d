/**
 * Exact point visibility (ground truth), used to visualise and validate the
 * PVS: the PVS of a leaf must contain every leaf this polygon touches, for
 * every viewpoint inside the leaf.
 */

import { type Vec2, type Segment, cross, sub } from "../math";

/**
 * Visibility polygon of `origin` among `walls`, by angular ray casting.
 * Rays are cast towards every wall endpoint (±ε) plus `extraRays` evenly spaced
 * directions, so corners are captured exactly. Rays travel at most `maxDistance`.
 * Returns the hit points sorted by angle (a star-shaped polygon around `origin`).
 */
export function visibilityPolygon(walls: readonly Segment[], origin: Vec2, maxDistance: number, extraRays = 64): Vec2[] {
  const angles: number[] = [];
  const eps = 1e-5;
  for (const w of walls) {
    for (const p of [w.a, w.b]) {
      const a = Math.atan2(p.y - origin.y, p.x - origin.x);
      angles.push(a - eps, a, a + eps);
    }
  }
  for (let i = 0; i < extraRays; i++) angles.push(-Math.PI + (i / extraRays) * Math.PI * 2);
  angles.sort((x, y) => x - y);

  const out: Vec2[] = [];
  for (const angle of angles) {
    const dir = { x: Math.cos(angle), y: Math.sin(angle) };
    let best = maxDistance;
    for (const w of walls) {
      const t = rayHit(origin, dir, w);
      if (t !== null && t < best) best = t;
    }
    out.push({ x: origin.x + dir.x * best, y: origin.y + dir.y * best });
  }
  return out;
}

/** Distance along the ray to segment `s`, or null if missed. */
function rayHit(o: Vec2, d: Vec2, s: Segment): number | null {
  const e = sub(s.b, s.a);
  const denom = cross(d, e);
  if (Math.abs(denom) < 1e-12) return null;
  const ao = sub(s.a, o);
  const t = cross(ao, e) / denom;
  const u = cross(ao, d) / denom;
  return t >= 0 && u >= 0 && u <= 1 ? t : null;
}
