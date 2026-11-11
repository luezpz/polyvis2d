/** Hit-testing helpers for the editor. */

import { type Brush, type Level, type Vec2, type PortalGraph, convexContains, distance, distanceToSegment, signedArea } from "../../core";

/** The smallest brush containing `p` (small brushes inside big rooms stay clickable). */
export function brushAt(level: Level, p: Vec2): Brush | null {
  let best: Brush | null = null;
  let bestArea = Infinity;
  for (const b of level.brushes) {
    if (!convexContains(b.vertices, p)) continue;
    const area = signedArea(b.vertices);
    if (area < bestArea) {
      best = b;
      bestArea = area;
    }
  }
  return best;
}

/** Index of the vertex of `brush` within `radius` of `p`, or -1. */
export function vertexAt(brush: Brush, p: Vec2, radius: number): number {
  let best = -1;
  let bestDist = radius;
  brush.vertices.forEach((v, i) => {
    const d = distance(v, p);
    if (d <= bestDist) {
      best = i;
      bestDist = d;
    }
  });
  return best;
}

/** Closest portal (by segment distance) within `radius` of `p`, or null. Prefers the portal whose `from` side contains `p`. */
export function portalAt(graph: PortalGraph, p: Vec2, radius: number): number | null {
  let best: number | null = null;
  let bestDist = radius;
  for (const portal of graph.portals) {
    const d = distanceToSegment(portal.seg, p);
    // Twins have the same distance; pick the one we are "looking through" (p behind it).
    const behind = portal.line.n.x * p.x + portal.line.n.y * p.y - portal.line.d <= 0;
    if (behind && d <= bestDist) {
      best = portal.id;
      bestDist = d;
    }
  }
  return best;
}
