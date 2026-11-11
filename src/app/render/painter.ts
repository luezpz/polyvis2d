/**
 * Thin wrapper around CanvasRenderingContext2D that draws in *world*
 * coordinates while keeping line widths and text sizes in screen pixels.
 */

import type { Vec2 } from "../../core";
import type { Camera } from "../editor/camera";

export interface StrokeStyle {
  readonly color: string;
  readonly width?: number;
  readonly dash?: readonly number[];
}

export class Painter {
  constructor(readonly ctx: CanvasRenderingContext2D, readonly camera: Camera) {}

  private moveLine(points: readonly Vec2[], close: boolean): void {
    const { ctx, camera } = this;
    ctx.beginPath();
    points.forEach((p, i) => {
      const s = camera.worldToScreen(p);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    });
    if (close) ctx.closePath();
  }

  private applyStroke(style: StrokeStyle): void {
    this.ctx.strokeStyle = style.color;
    this.ctx.lineWidth = style.width ?? 1;
    this.ctx.setLineDash(style.dash ?? []);
  }

  polygon(points: readonly Vec2[], fill: string | null, stroke?: StrokeStyle): void {
    if (points.length < 2) return;
    this.moveLine(points, true);
    if (fill) {
      this.ctx.fillStyle = fill;
      this.ctx.fill();
    }
    if (stroke) {
      this.applyStroke(stroke);
      this.ctx.stroke();
    }
  }

  polyline(points: readonly Vec2[], stroke: StrokeStyle): void {
    if (points.length < 2) return;
    this.moveLine(points, false);
    this.applyStroke(stroke);
    this.ctx.stroke();
  }

  line(a: Vec2, b: Vec2, stroke: StrokeStyle): void {
    this.polyline([a, b], stroke);
  }

  /** Line with an arrowhead at `b` (size in pixels). */
  arrow(a: Vec2, b: Vec2, stroke: StrokeStyle, headPx = 6): void {
    this.line(a, b, stroke);
    const sa = this.camera.worldToScreen(a), sb = this.camera.worldToScreen(b);
    const ang = Math.atan2(sb.y - sa.y, sb.x - sa.x);
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(sb.x, sb.y);
    ctx.lineTo(sb.x - headPx * Math.cos(ang - 0.5), sb.y - headPx * Math.sin(ang - 0.5));
    ctx.lineTo(sb.x - headPx * Math.cos(ang + 0.5), sb.y - headPx * Math.sin(ang + 0.5));
    ctx.closePath();
    ctx.fillStyle = stroke.color;
    ctx.fill();
  }

  /** Circle with a radius in pixels. */
  dot(p: Vec2, radiusPx: number, fill: string, stroke?: StrokeStyle): void {
    const s = this.camera.worldToScreen(p);
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(s.x, s.y, radiusPx, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      this.applyStroke(stroke);
      ctx.stroke();
    }
  }

  /** Text anchored at a world point (centred). */
  text(p: Vec2, text: string, color: string, sizePx = 11, align: CanvasTextAlign = "center"): void {
    const s = this.camera.worldToScreen(p);
    const { ctx } = this;
    ctx.font = `${sizePx}px ui-monospace, Consolas, monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.fillText(text, s.x, s.y);
  }
}
