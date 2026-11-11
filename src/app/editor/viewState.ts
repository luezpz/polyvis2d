/**
 * View-only state: which debug layers are visible and what the inspect tool
 * is currently probing. Nothing here affects compilation.
 */

import type { Vec2 } from "../../core";

export interface Layers {
  grid: boolean;
  brushes: boolean;
  leaves: boolean;
  splitters: boolean;
  walls: boolean;
  portals: boolean;
  labels: boolean;
  pvs: boolean;
  lineOfSight: boolean;
}

export const LAYER_LABELS: Record<keyof Layers, string> = {
  grid: "Grid",
  brushes: "Brushes",
  leaves: "BSP leaves",
  splitters: "BSP splitters",
  walls: "Walls (CSG result)",
  portals: "Portals",
  labels: "Leaf / portal ids",
  pvs: "PVS of probed leaf",
  lineOfSight: "True line of sight",
};

export interface InspectState {
  /** World point being probed (hover or pinned), or null. */
  point: Vec2 | null;
  /** If pinned, hovering no longer moves the probe. */
  pinned: boolean;
  /** Portal under the cursor (shows its portal vis), or null. */
  portal: number | null;
}

export class ViewState {
  layers: Layers = {
    grid: true,
    brushes: true,
    leaves: true,
    splitters: false,
    walls: true,
    portals: true,
    labels: false,
    pvs: true,
    lineOfSight: true,
  };

  inspect: InspectState = { point: null, pinned: false, portal: null };

  /** Grid / snapping step in world units (0 disables snapping). */
  gridSize = 1;
  snap = true;

  snapPoint(p: Vec2): Vec2 {
    if (!this.snap || this.gridSize <= 0) return p;
    const g = this.gridSize;
    return { x: Math.round(p.x / g) * g, y: Math.round(p.y / g) * g };
  }
}
