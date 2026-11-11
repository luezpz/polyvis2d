/**
 * Inspect tool: probe the compiled visibility.
 *
 * - Hover anywhere: the leaf under the cursor and its PVS are highlighted, and
 *   the exact line-of-sight polygon from the cursor is drawn for comparison.
 * - Click to pin the probe (click again elsewhere to move it, Esc to unpin).
 * - Hover near a portal to see what that portal can see (base vis vs flow).
 */

import type { Tool, ToolContext, ToolPointer } from "./tool";
import { portalAt } from "../picking";

const PORTAL_PICK_PX = 6;

export class InspectTool implements Tool {
  readonly id = "inspect" as const;
  readonly label = "Inspect";
  readonly shortcut = "i";
  readonly hint = "Hover to probe the PVS · click to pin · Esc to unpin · hover a portal to see its portal-vis";
  readonly cursor = "crosshair";

  constructor(private readonly ctx: ToolContext) {}

  deactivate(): void {
    const { inspect } = this.ctx.view;
    if (!inspect.pinned) inspect.point = null;
    inspect.portal = null;
  }

  pointerDown(p: ToolPointer): void {
    if (p.button !== 0) return;
    const { inspect } = this.ctx.view;
    inspect.point = p.world;
    inspect.pinned = true;
    this.ctx.requestRender();
  }

  pointerMove(p: ToolPointer): void {
    const { inspect } = this.ctx.view;
    if (!inspect.pinned) inspect.point = p.world;
    const compiled = this.ctx.compiled();
    inspect.portal = compiled ? portalAt(compiled.graph, p.world, this.ctx.camera.pixels(PORTAL_PICK_PX)) : null;
    this.ctx.requestRender();
  }

  keyDown(e: KeyboardEvent): boolean {
    if (e.key === "Escape") {
      this.ctx.view.inspect.pinned = false;
      this.ctx.requestRender();
      return true;
    }
    return false;
  }
}
