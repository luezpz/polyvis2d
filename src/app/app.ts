/**
 * Application shell: owns the model, view state, camera, tools, renderer and
 * panel; routes input; recompiles the level whenever it changes.
 *
 * Compilation runs synchronously on the main thread, coalesced to at most once
 * per task — the 2D pipeline takes a few milliseconds for typical levels. (For
 * the 3D version this is the place to move compilation into a Web Worker.)
 */

import {
  type CompileOptions, type CompileResult, type Vec2,
  DEFAULT_COMPILE_OPTIONS, SAMPLE_LEVELS, aabbFromPoints, compileLevel, emptyLevel,
  exportPvsJson, exportPvsText, parseLevel, serializeLevel,
} from "../core";
import { Camera } from "./editor/camera";
import { EditorModel } from "./editor/model";
import { ViewState } from "./editor/viewState";
import type { Tool, ToolContext, ToolId, ToolPointer } from "./editor/tools/tool";
import { SelectTool } from "./editor/tools/selectTool";
import { BoxTool } from "./editor/tools/boxTool";
import { PolygonTool } from "./editor/tools/polygonTool";
import { InspectTool } from "./editor/tools/inspectTool";
import { Renderer } from "./render/renderer";
import { Panel, type PanelHost } from "./ui/panel";
import { downloadText, pickTextFile } from "./ui/dom";

const AUTOSAVE_KEY = "polyvis.level.v1";

export class App implements PanelHost, ToolContext {
  readonly model = new EditorModel();
  readonly view = new ViewState();
  readonly camera = new Camera();
  readonly tools: readonly Tool[];
  options: CompileOptions = { ...DEFAULT_COMPILE_OPTIONS, bsp: {}, flow: {} };

  private _activeTool: Tool;
  private readonly renderer: Renderer;
  private readonly panel: Panel;
  private result: CompileResult | null = null;
  private error: string | null = null;
  private compileScheduled = false;
  private frameRequested = false;
  private panning: { pointerId: number; last: Vec2 } | null = null;
  private spaceHeld = false;
  private cursorWorld: Vec2 | null = null;

  constructor(private readonly canvas: HTMLCanvasElement, panelRoot: HTMLElement, private readonly status: HTMLElement) {
    this.tools = [new SelectTool(this), new BoxTool(this), new PolygonTool(this), new InspectTool(this)];
    this._activeTool = this.tools[0];
    this.renderer = new Renderer(canvas, this.camera);
    this.panel = new Panel(panelRoot, this);

    this.model.onChange((change) => {
      if (change === "level") {
        this.scheduleCompile();
        this.autosave();
      }
      this.requestRender();
    });

    this.bindInput();
    new ResizeObserver(() => {
      this.renderer.resize();
      this.requestRender();
    }).observe(canvas);
    this.renderer.resize();

    this.model.loadLevel(this.restore() ?? SAMPLE_LEVELS[0].create());
    this.fitView();
  }

  // ---- PanelHost / ToolContext -------------------------------------------

  get activeTool(): Tool {
    return this._activeTool;
  }

  compiled(): CompileResult | null {
    return this.result;
  }

  compileError(): string | null {
    return this.error;
  }

  setTool(id: ToolId): void {
    const next = this.tools.find((t) => t.id === id);
    if (!next || next === this._activeTool) return;
    this._activeTool.deactivate?.();
    this._activeTool = next;
    next.activate?.();
    this.canvas.style.cursor = next.cursor;
    this.requestRender();
  }

  setOptions(options: Partial<CompileOptions>): void {
    this.options = { ...this.options, ...options };
    this.scheduleCompile();
  }

  requestRender(): void {
    if (this.frameRequested) return;
    this.frameRequested = true;
    requestAnimationFrame(() => {
      this.frameRequested = false;
      this.renderer.draw({ level: this.model.level, selectedId: this.model.selectedId, compiled: this.result, view: this.view, tool: this._activeTool });
      this.panel.update();
      this.updateStatus();
    });
  }

  newLevel(): void {
    this.model.loadLevel(emptyLevel(), true);
  }

  loadSample(index: number): void {
    const sample = SAMPLE_LEVELS[index];
    if (!sample) return;
    this.model.loadLevel(sample.create(), true);
    this.view.inspect = { point: null, pinned: false, portal: null };
    this.fitView();
  }

  async openLevel(): Promise<void> {
    const text = await pickTextFile();
    if (text === null) return;
    try {
      this.model.loadLevel(parseLevel(text), true);
      this.fitView();
    } catch (e) {
      alert(`Could not open level: ${(e as Error).message}`);
    }
  }

  saveLevel(): void {
    downloadText("level.polyvis.json", serializeLevel(this.model.level));
  }

  exportPvsJson(): void {
    if (this.result) downloadText("level.pvs.json", exportPvsJson(this.result));
  }

  exportPvsText(): void {
    if (this.result) downloadText("level.pvs.txt", exportPvsText(this.result), "text/plain");
  }

  fitView(): void {
    const box = aabbFromPoints(this.model.level.brushes.flatMap((b) => b.vertices));
    if (box) this.camera.fit(box);
    else {
      this.camera.center = { x: 0, y: 0 };
      this.camera.zoom = 20;
    }
    this.requestRender();
  }

  // ---- Compilation & persistence -----------------------------------------

  private scheduleCompile(): void {
    if (this.compileScheduled) return;
    this.compileScheduled = true;
    queueMicrotask(() => {
      this.compileScheduled = false;
      try {
        this.result = compileLevel(this.model.level, this.options);
        this.error = null;
      } catch (e) {
        console.error(e);
        this.result = null;
        this.error = (e as Error).message;
      }
      this.requestRender();
    });
  }

  private autosave(): void {
    try {
      localStorage.setItem(AUTOSAVE_KEY, serializeLevel(this.model.level));
    } catch {
      // Storage may be unavailable (private mode, quota); autosave is best-effort.
    }
  }

  private restore(): ReturnType<typeof parseLevel> | null {
    try {
      const text = localStorage.getItem(AUTOSAVE_KEY);
      return text ? parseLevel(text) : null;
    } catch {
      return null;
    }
  }

  // ---- Input -------------------------------------------------------------

  private toolPointer(e: PointerEvent | MouseEvent): ToolPointer {
    const rect = this.canvas.getBoundingClientRect();
    const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const world = this.camera.screenToWorld(screen);
    return { world, snapped: this.view.snapPoint(world), screen, button: e.button, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey };
  }

  private bindInput(): void {
    const c = this.canvas;
    c.addEventListener("contextmenu", (e) => e.preventDefault());

    c.addEventListener("pointerdown", (e) => {
      c.setPointerCapture(e.pointerId);
      const p = this.toolPointer(e);
      if (e.button === 1 || e.button === 2 || (e.button === 0 && this.spaceHeld)) {
        this.panning = { pointerId: e.pointerId, last: p.screen };
        c.style.cursor = "grabbing";
        return;
      }
      this._activeTool.pointerDown?.(p);
      this.requestRender();
    });

    c.addEventListener("pointermove", (e) => {
      const p = this.toolPointer(e);
      this.cursorWorld = p.world;
      if (this.panning && this.panning.pointerId === e.pointerId) {
        this.camera.panBy(p.screen.x - this.panning.last.x, p.screen.y - this.panning.last.y);
        this.panning.last = p.screen;
      } else {
        this._activeTool.pointerMove?.(p);
      }
      this.requestRender();
    });

    const endPointer = (e: PointerEvent) => {
      if (this.panning && this.panning.pointerId === e.pointerId) {
        this.panning = null;
        c.style.cursor = this._activeTool.cursor;
        return;
      }
      this._activeTool.pointerUp?.(this.toolPointer(e));
      this.requestRender();
    };
    c.addEventListener("pointerup", endPointer);
    c.addEventListener("pointercancel", endPointer);

    c.addEventListener("dblclick", (e) => this._activeTool.doubleClick?.(this.toolPointer(e)));

    c.addEventListener("wheel", (e) => {
      e.preventDefault();
      const p = this.toolPointer(e);
      this.camera.zoomAt(p.screen, Math.exp(-e.deltaY * 0.0015));
      this.requestRender();
    }, { passive: false });

    window.addEventListener("keydown", (e) => this.onKeyDown(e));
    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") this.spaceHeld = false;
    });
  }

  private onKeyDown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;

    if (e.code === "Space") {
      this.spaceHeld = true;
      e.preventDefault();
      return;
    }
    if (this._activeTool.keyDown?.(e)) {
      e.preventDefault();
      this.requestRender();
      return;
    }
    const key = e.key.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && key === "z") {
      if (e.shiftKey) this.model.redo();
      else this.model.undo();
    } else if (ctrl && key === "y") {
      this.model.redo();
    } else if (ctrl) {
      return; // leave other browser shortcuts alone
    } else if (key === "k") {
      const sel = this.model.selectedBrush;
      if (sel && this._activeTool.id === "select") this.model.updateBrush(sel.id, { kind: sel.kind === "room" ? "solid" : "room" });
      else this.model.newBrushKind = this.model.newBrushKind === "room" ? "solid" : "room";
    } else if (key === "f") {
      this.fitView();
    } else {
      const tool = this.tools.find((t) => t.shortcut === key);
      if (!tool) return;
      this.setTool(tool.id);
    }
    e.preventDefault();
    this.requestRender();
  }

  private updateStatus(): void {
    const pos = this.cursorWorld ? `${this.cursorWorld.x.toFixed(2)}, ${this.cursorWorld.y.toFixed(2)}` : "—";
    const kind = this.model.newBrushKind === "room" ? "room" : "solid";
    this.status.textContent = `${pos}  ·  ${this._activeTool.label} (${kind})  ·  ${this._activeTool.hint}`;
  }
}
