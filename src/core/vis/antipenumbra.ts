/**
 * Antipenumbra (separating-line) construction and clipping, 2D version.
 *
 * Given a *source* portal S and a *pass* portal P, the set of points that can
 * be seen from somewhere on S through P is bounded by *separating planes*:
 * planes through an edge of one portal and a vertex of the other such that the
 * two portals lie on opposite sides (Teller 1992; Golodetz 2009).
 *
 * In 2D the "edges" of a segment are its endpoints, so a separator is a line
 * through one endpoint of S and one endpoint of P with the remaining endpoints
 * strictly on opposite sides. There are at most two of them; they cross
 * between S and P (an "X"), and the wedge of the X that opens up beyond P is
 * the region visible from S through P:
 *
 *     S0 ●.               .● P1
 *        |  ' .       . '  |    ' .
 *        |      ' X '      |          wedge visible
 *        |    . '   ' .    |    . '   through P
 *     S1 ●'               '● P0
 *
 * Anything (another portal, or the source itself when looking backwards) must
 * be in front of every separator to be potentially visible. If the portals
 * share an endpoint there may be fewer separators; the region is then larger
 * (still conservative).
 *
 * When porting to 3D: iterate over edges of `from` × vertices of `to` *and*
 * edges of `to` × vertices of `from`, exactly as in Golodetz's Listing 2.
 */

import { type Line2, type Segment, type Vec2, distance, flipLine, lineFromPoints, signedDistance, clipSegmentFront, MIN_LENGTH, PLANE_EPSILON } from "../math";

/**
 * Builds the separating lines between `from` and `to`, oriented so that `to`
 * (and therefore the region beyond it, as seen from `from`) is in front.
 */
export function buildSeparators(from: Segment, to: Segment, eps = PLANE_EPSILON): Line2[] {
  const fv: readonly Vec2[] = [from.a, from.b];
  const tv: readonly Vec2[] = [to.a, to.b];
  const out: Line2[] = [];
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const p = fv[i], q = tv[j];
      if (distance(p, q) < MIN_LENGTH) continue; // portals share this vertex: no separator through it
      const line = lineFromPoints(p, q);
      if (!line) continue;
      const dFrom = signedDistance(line, fv[1 - i]);
      const dTo = signedDistance(line, tv[1 - j]);
      if (dFrom < -eps && dTo > eps) out.push(line);
      else if (dFrom > eps && dTo < -eps) out.push(flipLine(line));
      // Otherwise both remaining endpoints are on the same side (or on the line): not a separator.
    }
  }
  return out;
}

/** Clips a segment to the front of every line; returns null as soon as it vanishes. */
export function clipToLines(seg: Segment, lines: readonly Line2[]): Segment | null {
  let s: Segment | null = seg;
  for (const l of lines) {
    s = clipSegmentFront(s, l);
    if (!s) return null;
  }
  return s;
}
