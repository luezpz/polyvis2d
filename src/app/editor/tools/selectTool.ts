/**
 * Select / move / edit tool.
 *
 * - Click a brush to select it (the smallest brush under the cursor wins).
 * - Drag a brush to move it; drag a vertex handle of the selected brush to
 *   reshape it (the result is re-hulled, so it always stays convex).
 * - Delete/Backspace deletes, Ctrl+D duplicates.
 */

import { type Brush, type Vec2, sub } from "../../../core";
import type { Painter } from "../../render/painter";
import { brushAt, vertexAt } from "../picking";
import type { Tool, ToolContext, ToolPointer } from "./tool";
import { COLORS } from "../../render/colors";

type Drag =
  | { kind: "move"; brush: Brush; start: Vec2 }
  | { kind: "vertex"; brush: Brush; index: number };

const HANDLE_PX = 7;

export class SelectTool implements Tool {
  readonly id = "select" as const;
  readonly label = "Select";
  readonly shortcut = "v";
  readonly hint = "Click to select · drag to move · drag handles to reshape · Del delete · Ctrl+D duplicate";
  readonly cursor = "default";

  private drag: Drag | null = null;
  private hoverId: number | null = null;

  constructor(private readonly ctx: ToolContext) {}

  deactivate(): void {
    this.drag = null;
    this.hoverId = null;
  }

  pointerDown(p: ToolPointer): void {
    if (p.button !== 0) return;
    const { model, camera } = this.ctx;
    const selected = model.selectedBrush;
    if (selected) {
      const vi = vertexAt(selected, p.world, camera.pixels(HANDLE_PX));
      if (vi >= 0) {
        model.beginGesture();
        this.drag = { kind: "vertex", brush: selected, index: vi };
        return;
      }
    }
    const hit = brushAt(model.level, p.world);
    model.select(hit?.id ?? null);
    if (hit) {
      model.beginGesture();
      this.drag = { kind: "move", brush: hit, start: p.snapped };
    }
  }

  pointerMove(p: ToolPointer): void {
    const { model } = this.ctx;
    if (!this.drag) {
      const id = brushAt(model.level, p.world)?.id ?? null;
      if (id !== this.hoverId) {
        this.hoverId = id;
        this.ctx.requestRender();
      }
      return;
    }
    if (this.drag.kind === "move") {
      model.translateBrush(this.drag.brush.id, this.drag.brush, sub(p.snapped, this.drag.start));
    } else {
      const { brush, index } = this.drag;
      const vertices = brush.vertices.map((v, i) => (i === index ? p.snapped : v));
      model.updateBrush(brush.id, { vertices });
    }
  }

  pointerUp(): void {
    if (this.drag) this.ctx.model.endGesture();
    this.drag = null;
  }

  keyDown(e: KeyboardEvent): boolean {
    const { model, view } = this.ctx;
    const id = model.selectedId;
    if (id === null) return false;
    if (e.key === "Delete" || e.key === "Backspace") {
      model.removeBrush(id);
      return true;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
      const g = view.gridSize > 0 ? view.gridSize : 1;
      model.duplicateBrush(id, { x: g, y: -g });
      return true;
    }
    if (e.key === "Escape") {
      model.select(null);
      return true;
    }
    return false;
  }

  drawOverlay(painter: Painter): void {
    const { model } = this.ctx;
    const hover = model.level.brushes.find((b) => b.id === this.hoverId);
    if (hover && hover.id !== model.selectedId) painter.polygon(hover.vertices, null, { color: COLORS.hover, width: 2 });
    const sel = model.selectedBrush;
    if (sel) for (const v of sel.vertices) painter.dot(v, 4, COLORS.handleFill, { color: COLORS.selection, width: 1.5 });
  }
}
