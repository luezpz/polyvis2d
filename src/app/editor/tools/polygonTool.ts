/**
 * Polygon tool: click points, then Enter / double-click / click the first
 * point to create a convex brush (the convex hull of the clicked points).
 */

import { type Vec2, convexHull, distance } from "../../../core";
import type { Painter } from "../../render/painter";
import type { Tool, ToolContext, ToolPointer } from "./tool";
import { kindColors } from "../../render/colors";

const CLOSE_PX = 8;

export class PolygonTool implements Tool {
  readonly id = "polygon" as const;
  readonly label = "Polygon";
  readonly shortcut = "p";
  readonly hint = "Click points · Enter/double-click/first point to finish · Backspace undo point · Esc cancel";
  readonly cursor = "crosshair";

  private points: Vec2[] = [];
  private cursorPoint: Vec2 | null = null;

  constructor(private readonly ctx: ToolContext) {}

  deactivate(): void {
    this.points = [];
  }

  pointerDown(p: ToolPointer): void {
    if (p.button !== 0) return;
    const first = this.points[0];
    if (first && this.points.length >= 3 && distance(first, p.world) <= this.ctx.camera.pixels(CLOSE_PX)) {
      this.finish();
      return;
    }
    const last = this.points[this.points.length - 1];
    if (!last || distance(last, p.snapped) > 1e-9) this.points.push(p.snapped);
    this.ctx.requestRender();
  }

  pointerMove(p: ToolPointer): void {
    this.cursorPoint = p.snapped;
    this.ctx.requestRender();
  }

  doubleClick(): void {
    this.finish();
  }

  keyDown(e: KeyboardEvent): boolean {
    if (e.key === "Enter") {
      this.finish();
      return true;
    }
    if (e.key === "Escape" && this.points.length) {
      this.points = [];
      this.ctx.requestRender();
      return true;
    }
    if (e.key === "Backspace" && this.points.length) {
      this.points.pop();
      this.ctx.requestRender();
      return true;
    }
    return false;
  }

  private finish(): void {
    if (this.points.length >= 3) this.ctx.model.addBrush(this.ctx.model.newBrushKind, this.points);
    this.points = [];
    this.ctx.requestRender();
  }

  drawOverlay(painter: Painter): void {
    const c = kindColors(this.ctx.model.newBrushKind);
    const pts = this.cursorPoint ? [...this.points, this.cursorPoint] : this.points;
    if (pts.length >= 3) painter.polygon(convexHull(pts), c.fill, { color: c.stroke, width: 1, dash: [5, 4] });
    painter.polyline(pts, { color: c.stroke, width: 1.5 });
    this.points.forEach((p, i) => painter.dot(p, i === 0 ? 5 : 3, c.stroke));
  }
}
