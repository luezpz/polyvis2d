/**
 * Level data model: the editable, serializable source of truth.
 *
 * A level is a list of convex *brushes*. Brushes are combined with CSG:
 *
 *   empty space = (union of all `room` brushes) − (union of all `solid` brushes)
 *
 * `room` brushes carve walkable space (rooms, corridors). `solid` brushes put
 * matter back inside rooms (pillars, crates, dividing walls) and act as
 * occluders. Brush order does not matter.
 */

import { type Vec2, convexHull, signedArea, MIN_AREA } from "../math";

export type BrushKind = "room" | "solid";

export interface Brush {
  /** Stable identifier, unique within a level. */
  readonly id: number;
  readonly kind: BrushKind;
  /** Convex, counter-clockwise vertex loop. Use {@link makeBrush} to guarantee this. */
  readonly vertices: readonly Vec2[];
}

export const LEVEL_FORMAT = "polyvis-level-2d";
export const LEVEL_VERSION = 1;

export interface Level {
  readonly format: typeof LEVEL_FORMAT;
  readonly version: typeof LEVEL_VERSION;
  readonly brushes: readonly Brush[];
}

export const emptyLevel = (): Level => ({ format: LEVEL_FORMAT, version: LEVEL_VERSION, brushes: [] });

/**
 * Creates a brush from arbitrary points by taking their convex hull, which
 * guarantees a convex counter-clockwise loop. Returns null for degenerate input.
 */
export function makeBrush(id: number, kind: BrushKind, points: readonly Vec2[]): Brush | null {
  const hull = convexHull(points.map((p) => ({ x: p.x, y: p.y })));
  if (hull.length < 3 || signedArea(hull) < MIN_AREA) return null;
  return { id, kind, vertices: hull };
}

/** Axis-aligned box brush spanning two corners. */
export function makeBoxBrush(id: number, kind: BrushKind, a: Vec2, b: Vec2): Brush | null {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  return makeBrush(id, kind, [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ]);
}

export const nextBrushId = (level: Level): number => level.brushes.reduce((m, b) => Math.max(m, b.id), 0) + 1;

export const serializeLevel = (level: Level): string => JSON.stringify(level, null, 2);

/** Parses and validates a level JSON document. Throws with a readable message on malformed input. */
export function parseLevel(json: string): Level {
  const raw: unknown = JSON.parse(json);
  if (typeof raw !== "object" || raw === null) throw new Error("Level must be a JSON object");
  const obj = raw as Record<string, unknown>;
  if (obj.format !== LEVEL_FORMAT) throw new Error(`Unknown level format: ${String(obj.format)}`);
  if (obj.version !== LEVEL_VERSION) throw new Error(`Unsupported level version: ${String(obj.version)}`);
  if (!Array.isArray(obj.brushes)) throw new Error("Level.brushes must be an array");

  const brushes: Brush[] = [];
  const seen = new Set<number>();
  for (const [i, b] of (obj.brushes as unknown[]).entries()) {
    const rb = b as Record<string, unknown>;
    const kind = rb.kind;
    if (kind !== "room" && kind !== "solid") throw new Error(`Brush ${i}: invalid kind ${String(kind)}`);
    if (!Array.isArray(rb.vertices)) throw new Error(`Brush ${i}: vertices must be an array`);
    const pts = (rb.vertices as unknown[]).map((v, j) => {
      const rv = v as Record<string, unknown>;
      if (typeof rv?.x !== "number" || typeof rv?.y !== "number") throw new Error(`Brush ${i}: vertex ${j} is not {x, y}`);
      return { x: rv.x, y: rv.y };
    });
    let id = typeof rb.id === "number" && Number.isInteger(rb.id) ? rb.id : -1;
    if (id < 0 || seen.has(id)) id = Math.max(0, ...seen) + 1;
    seen.add(id);
    const brush = makeBrush(id, kind, pts);
    if (brush) brushes.push(brush);
  }
  return { format: LEVEL_FORMAT, version: LEVEL_VERSION, brushes };
}
