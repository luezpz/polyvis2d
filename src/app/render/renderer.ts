/**
 * Draws the editor scene: grid, compiled BSP/portal/PVS debug layers, brushes
 * and the active tool's overlay. Stateless apart from the canvas it owns; all
 * inputs are passed to {@link Renderer.draw}.
 */

import {
  type CompileResult, type Level, type Vec2,
  centroid, locateLeaf, midpoint, splitterSegments, visibilityPolygon, addScaled,
} from "../../core";
import type { Camera } from "../editor/camera";
import type { ViewState } from "../editor/viewState";
import type { Tool } from "../editor/tools/tool";
import { Painter } from "./painter";
import { COLORS, kindColors, leafColor } from "./colors";

export interface SceneInput {
  readonly level: Level;
  readonly selectedId: number | null;
  readonly compiled: CompileResult | null;
  readonly view: ViewState;
  readonly tool: Tool;
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly painter: Painter;
  /** Splitter segments are cached per compile result. */
  private splitterCache: { result: CompileResult; segments: ReturnType<typeof splitterSegments> } | null = null;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly camera: Camera) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    this.ctx = ctx;
    this.painter = new Painter(ctx, camera);
  }

  /** Matches the backing store to the element size and device pixel ratio. */
  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const { clientWidth: w, clientHeight: h } = this.canvas;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.camera.resize(w, h);
  }

  draw(scene: SceneInput): void {
    const { ctx, camera } = this;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, camera.width, camera.height);

    const { layers } = scene.view;
    const result = scene.compiled;
    if (layers.grid) this.drawGrid(scene.view.gridSize);
    if (result && layers.leaves) this.drawLeaves(result);
    if (result && layers.pvs) this.drawPvs(result, scene.view);
    if (result && layers.lineOfSight) this.drawLineOfSight(result, scene.view);
    if (layers.brushes) this.drawBrushes(scene.level, scene.selectedId);
    if (result && layers.splitters) this.drawSplitters(result, layers.labels);
    if (result && layers.walls) this.drawWalls(result);
    if (result && layers.portals) this.drawPortals(result, scene.view);
    if (result && layers.labels) this.drawLabels(result);
    if (result?.leaks.leaking) this.drawLeaks(result);
    if (scene.view.inspect.point && scene.tool.id === "inspect") {
      this.painter.dot(scene.view.inspect.point, scene.view.inspect.pinned ? 5 : 3.5, COLORS.probe, { color: "#000", width: 1 });
    }
    scene.tool.drawOverlay?.(this.painter);
  }

  private drawGrid(step: number): void {
    const { camera, painter } = this;
    const g = step > 0 ? step : 1;
    // Skip minor lines when they would be closer than 6px.
    let minor = g;
    while (minor * camera.zoom < 6) minor *= 2;
    const major = minor * 8;
    const vb = camera.visibleBounds();
    const lines = (spacing: number, color: string) => {
      for (let x = Math.floor(vb.min.x / spacing) * spacing; x <= vb.max.x; x += spacing)
        painter.line({ x, y: vb.min.y }, { x, y: vb.max.y }, { color });
      for (let y = Math.floor(vb.min.y / spacing) * spacing; y <= vb.max.y; y += spacing)
        painter.line({ x: vb.min.x, y }, { x: vb.max.x, y }, { color });
    };
    lines(minor, COLORS.gridMinor);
    lines(major, COLORS.gridMajor);
    painter.line({ x: 0, y: vb.min.y }, { x: 0, y: vb.max.y }, { color: COLORS.axis });
    painter.line({ x: vb.min.x, y: 0 }, { x: vb.max.x, y: 0 }, { color: COLORS.axis });
  }

  private drawLeaves(result: CompileResult): void {
    result.tree.leaves.forEach((leaf, i) => {
      if (leaf.contents !== "empty" || !leaf.region) return;
      this.painter.polygon(leaf.region.vertices, leafColor(i), { color: COLORS.leafStroke, width: 1 });
    });
  }

  /** Highlights the probed leaf, its PVS, and dims everything it cannot see. */
  private drawPvs(result: CompileResult, view: ViewState): void {
    const p = view.inspect.point;
    if (!p) return;
    const current = locateLeaf(result.tree, p);
    if (result.tree.leaves[current].contents !== "empty") return;
    const row = result.pvs[current];
    result.tree.leaves.forEach((leaf, i) => {
      if (leaf.contents !== "empty" || !leaf.region) return;
      const fill = i === current ? COLORS.pvsCurrent : row.has(i) ? COLORS.pvsVisible : COLORS.pvsHidden;
      this.painter.polygon(leaf.region.vertices, fill);
    });
  }

  /** Exact visibility polygon from the probe point — the PVS must always cover it. */
  private drawLineOfSight(result: CompileResult, view: ViewState): void {
    const p = view.inspect.point;
    if (!p || result.tree.leaves[locateLeaf(result.tree, p)].contents !== "empty") return;
    const b = result.tree.bounds;
    const maxDist = Math.hypot(b.max.x - b.min.x, b.max.y - b.min.y);
    const poly = visibilityPolygon(result.walls.map((w) => w.seg), p, maxDist);
    this.painter.polygon(poly, COLORS.lineOfSight, { color: COLORS.lineOfSightStroke, width: 1 });
  }

  private drawBrushes(level: Level, selectedId: number | null): void {
    for (const b of level.brushes) {
      const c = kindColors(b.kind);
      const selected = b.id === selectedId;
      this.painter.polygon(b.vertices, b.kind === "solid" ? c.fill : null, {
        color: c.stroke,
        width: selected ? 2.5 : 1,
        dash: b.kind === "room" && !selected ? [4, 3] : [],
      });
    }
  }

  private drawSplitters(result: CompileResult, labels: boolean): void {
    if (this.splitterCache?.result !== result) this.splitterCache = { result, segments: splitterSegments(result.tree) };
    this.splitterCache.segments.forEach((s, i) => {
      if (!s) return;
      this.painter.line(s.a, s.b, { color: COLORS.splitter, width: 1, dash: [6, 4] });
      if (labels) this.painter.text(midpoint(s.a, s.b), `n${i}`, COLORS.splitter, 10);
    });
  }

  private drawWalls(result: CompileResult): void {
    const tick = this.camera.pixels(5);
    for (const w of result.walls) {
      this.painter.line(w.seg.a, w.seg.b, { color: COLORS.wall, width: 2 });
      const m = midpoint(w.seg.a, w.seg.b);
      this.painter.line(m, addScaled(m, w.line.n, tick), { color: COLORS.wallTick, width: 1 });
    }
  }

  private drawPortals(result: CompileResult, view: ViewState): void {
    const { graph, mightSee, portalVis } = result;
    const hovered = view.inspect.portal;
    const drawn = new Set<number>();
    for (const p of graph.portals) {
      if (drawn.has(p.twin)) continue; // draw each opening once
      drawn.add(p.id);
      this.painter.line(p.seg.a, p.seg.b, { color: hovered === null ? COLORS.portal : COLORS.portalDim, width: 2 });
    }
    if (hovered === null || !graph.portals[hovered]) return;

    // Hovered portal: base-vis ("might see") in purple, final flow result in cyan.
    for (const id of mightSee[hovered].toArray()) {
      const q = graph.portals[id];
      if (!portalVis[hovered].has(id)) this.painter.line(q.seg.a, q.seg.b, { color: COLORS.portalMightSee, width: 3, dash: [4, 3] });
    }
    for (const id of portalVis[hovered].toArray()) {
      const q = graph.portals[id];
      this.painter.line(q.seg.a, q.seg.b, { color: COLORS.portalVis, width: 3 });
    }
    const p = graph.portals[hovered];
    const m = midpoint(p.seg.a, p.seg.b);
    this.painter.line(p.seg.a, p.seg.b, { color: COLORS.portalSelected, width: 4 });
    this.painter.arrow(m, addScaled(m, p.line.n, this.camera.pixels(18)), { color: COLORS.portalSelected, width: 2 });
  }

  private drawLabels(result: CompileResult): void {
    result.tree.leaves.forEach((leaf, i) => {
      if (leaf.contents !== "empty" || !leaf.region) return;
      this.painter.text(centroid(leaf.region.vertices), `L${i}`, COLORS.label, 11);
    });
    const drawn = new Set<number>();
    for (const p of result.graph.portals) {
      if (drawn.has(p.twin)) continue;
      drawn.add(p.id);
      const at: Vec2 = addScaled(midpoint(p.seg.a, p.seg.b), p.line.n, this.camera.pixels(9));
      this.painter.text(at, `${p.id}/${p.twin}`, COLORS.portal, 9);
    }
  }

  private drawLeaks(result: CompileResult): void {
    for (const i of result.leaks.boundaryLeaves) {
      const region = result.tree.leaves[i].region;
      if (region) this.painter.polygon(region.vertices, "rgba(255, 59, 59, 0.15)", { color: COLORS.leak, width: 2, dash: [8, 4] });
    }
  }
}
