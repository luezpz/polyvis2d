/**
 * BSP tree data structures.
 *
 * The tree is stored in flat arrays (Quake-style) so it can be exported to a
 * game engine verbatim:
 *
 * - `planes[i]` — oriented splitting lines (2D planes). Walls lying on the same
 *   line share a plane.
 * - `nodes[i]` — interior nodes. `front`/`back` are *child references*:
 *   `ref >= 0` is a node index, `ref < 0` is the leaf `~ref` (i.e. `-ref - 1`).
 * - `leaves[i]` — convex cells. Each is either solid or empty.
 *
 * This is a *solid-leaf* BSP: walls are oriented with empty space in front, so
 * after all walls have been used as splitters every leaf is unambiguously solid
 * (behind a wall) or empty (in front of all walls bounding it).
 */

import type { Aabb, ConvexPolygon, Line2 } from "../math";

/** Child reference: `>= 0` node index, `< 0` leaf index encoded as `~leaf`. */
export type ChildRef = number;

export const leafRef = (leaf: number): ChildRef => ~leaf;
export const isLeafRef = (ref: ChildRef): boolean => ref < 0;
export const refToLeaf = (ref: ChildRef): number => ~ref;

/** Edge tag used for leaf-region edges that come from the outer bounding box rather than a BSP plane. */
export const BOUNDS_TAG = -2;

export type LeafContents = "empty" | "solid";

export interface BspNode {
  /** Index into {@link BspTree.planes}. Front child is on the side the plane normal points to. */
  readonly plane: number;
  readonly front: ChildRef;
  readonly back: ChildRef;
  /** Convex region of space covered by this node (bounds clipped by all ancestor planes). */
  readonly region: ConvexPolygon | null;
}

export interface BspLeaf {
  readonly contents: LeafContents;
  /**
   * Convex region of the leaf, clipped to the level bounds. Edge tags are plane
   * indices (or {@link BOUNDS_TAG}). Null if the leaf has no area (can happen
   * with nearly-parallel splitters).
   */
  readonly region: ConvexPolygon | null;
  /** Depth of the leaf in the tree (root children have depth 1). */
  readonly depth: number;
}

export interface BspTree {
  readonly planes: readonly Line2[];
  readonly nodes: readonly BspNode[];
  readonly leaves: readonly BspLeaf[];
  /** Root reference (a leaf reference if the level has no walls). */
  readonly root: ChildRef;
  /** Bounding box used to close off leaf regions. */
  readonly bounds: Aabb;
}

export interface BspStats {
  readonly nodeCount: number;
  readonly leafCount: number;
  readonly emptyLeafCount: number;
  readonly solidLeafCount: number;
  readonly maxDepth: number;
  /** Number of wall fragments created by splitting. */
  readonly splitCount: number;
  /** Number of extra empty-leaf splits (corner extensions and cell size limits). */
  readonly refineSplitCount: number;
}
