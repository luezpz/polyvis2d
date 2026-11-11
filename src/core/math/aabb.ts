/** Axis-aligned bounding boxes. */

import type { Vec2 } from "./vec2";

export interface Aabb {
  readonly min: Vec2;
  readonly max: Vec2;
}

export function aabbFromPoints(points: Iterable<Vec2>): Aabb | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return minX <= maxX ? { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } } : null;
}

export const expandAabb = (b: Aabb, margin: number): Aabb => ({
  min: { x: b.min.x - margin, y: b.min.y - margin },
  max: { x: b.max.x + margin, y: b.max.y + margin },
});

export const aabbOverlaps = (a: Aabb, b: Aabb, eps = 0): boolean =>
  a.min.x <= b.max.x + eps && b.min.x <= a.max.x + eps && a.min.y <= b.max.y + eps && b.min.y <= a.max.y + eps;

export const aabbContains = (b: Aabb, p: Vec2, eps = 0): boolean =>
  p.x >= b.min.x - eps && p.x <= b.max.x + eps && p.y >= b.min.y - eps && p.y <= b.max.y + eps;
