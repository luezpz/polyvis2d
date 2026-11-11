/**
 * 2D camera mapping world units (y up) to canvas CSS pixels (y down).
 */

import type { Aabb, Vec2 } from "../../core";

export class Camera {
  /** World-space point at the centre of the viewport. */
  center: Vec2 = { x: 0, y: 0 };
  /** Pixels per world unit. */
  zoom = 20;
  /** Viewport size in CSS pixels. */
  width = 1;
  height = 1;

  static readonly MIN_ZOOM = 1;
  static readonly MAX_ZOOM = 400;

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  worldToScreen(p: Vec2): Vec2 {
    return { x: (p.x - this.center.x) * this.zoom + this.width / 2, y: this.height / 2 - (p.y - this.center.y) * this.zoom };
  }

  screenToWorld(p: Vec2): Vec2 {
    return { x: (p.x - this.width / 2) / this.zoom + this.center.x, y: (this.height / 2 - p.y) / this.zoom + this.center.y };
  }

  /** Converts a length in CSS pixels to world units. */
  pixels(px: number): number {
    return px / this.zoom;
  }

  /** Zooms by `factor`, keeping the world point under `screenPoint` fixed. */
  zoomAt(screenPoint: Vec2, factor: number): void {
    const before = this.screenToWorld(screenPoint);
    this.zoom = Math.min(Camera.MAX_ZOOM, Math.max(Camera.MIN_ZOOM, this.zoom * factor));
    const after = this.screenToWorld(screenPoint);
    this.center = { x: this.center.x + before.x - after.x, y: this.center.y + before.y - after.y };
  }

  /** Pans by a screen-space delta (drag direction). */
  panBy(dx: number, dy: number): void {
    this.center = { x: this.center.x - dx / this.zoom, y: this.center.y + dy / this.zoom };
  }

  /** Frames a world-space box with some padding. */
  fit(box: Aabb, paddingPx = 40): void {
    const w = Math.max(1e-3, box.max.x - box.min.x);
    const h = Math.max(1e-3, box.max.y - box.min.y);
    this.center = { x: (box.min.x + box.max.x) / 2, y: (box.min.y + box.max.y) / 2 };
    const zx = (this.width - paddingPx * 2) / w;
    const zy = (this.height - paddingPx * 2) / h;
    this.zoom = Math.min(Camera.MAX_ZOOM, Math.max(Camera.MIN_ZOOM, Math.min(zx, zy)));
  }

  /** Visible world-space rectangle. */
  visibleBounds(): Aabb {
    const a = this.screenToWorld({ x: 0, y: this.height });
    const b = this.screenToWorld({ x: this.width, y: 0 });
    return { min: a, max: b };
  }
}
