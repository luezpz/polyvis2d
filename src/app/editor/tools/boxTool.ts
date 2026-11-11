/** Box tool: drag a rectangle to create a room (or solid) brush. */

import type { Vec2 } from "../../../core";
import type { Painter } from "../../render/painter";
import type { Tool, ToolContext, ToolPointer } from "./tool";
import { kindColors } from "../../render/colors";

export class BoxTool implements Tool {
  readonly id = "box" as const;
  readonly label = "Box";
  readonly shortcut = "b";
  readonly hint = "Drag to create a box brush · K toggles room/solid";
  readonly cursor = "crosshair";

  private start: Vec2 | null = null;
  private current: Vec2 | null = null;

  constructor(private readonly ctx: ToolContext) {}

  deactivate(): void {
    this.start = this.current = null;
  }

  pointerDown(p: ToolPointer): void {
    if (p.button !== 0) return;
    this.start = this.current = p.snapped;
  }

  pointerMove(p: ToolPointer): void {
    this.current = p.snapped;
    this.ctx.requestRender();
  }

  pointerUp(p: ToolPointer): void {
    if (!this.start) return;
    const a = this.start, b = p.snapped;
    this.start = null;
    if (Math.abs(a.x - b.x) > 1e-6 && Math.abs(a.y - b.y) > 1e-6) {
      this.ctx.model.addBrush(this.ctx.model.newBrushKind, [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }]);
    }
    this.ctx.requestRender();
  }

  keyDown(e: KeyboardEvent): boolean {
    if (e.key === "Escape" && this.start) {
      this.start = null;
      this.ctx.requestRender();
      return true;
    }
    return false;
  }

  drawOverlay(painter: Painter): void {
    const c = kindColors(this.ctx.model.newBrushKind);
    if (this.current && !this.start) painter.dot(this.current, 3, c.stroke);
    if (!this.start || !this.current) return;
    const a = this.start, b = this.current;
    painter.polygon([a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }], c.fill, { color: c.stroke, width: 1.5, dash: [5, 4] });
    const w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
    painter.text({ x: (a.x + b.x) / 2, y: Math.max(a.y, b.y) }, `${+w.toFixed(3)} × ${+h.toFixed(3)}`, c.stroke, 11);
  }
}
