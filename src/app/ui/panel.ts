/**
 * Side panel: tools, level actions, layer toggles, compiler options, stats
 * and probe read-outs. Static controls are built once; {@link Panel.update}
 * refreshes the parts that depend on state.
 */

import { type BrushKind, type CompileOptions, type CompileResult, type PvsSymmetry, SAMPLE_LEVELS, locateLeaf } from "../../core";
import type { EditorModel } from "../editor/model";
import { type Layers, LAYER_LABELS, type ViewState } from "../editor/viewState";
import type { Tool, ToolId } from "../editor/tools/tool";
import { h } from "./dom";

/** What the panel needs from the application. */
export interface PanelHost {
  readonly model: EditorModel;
  readonly view: ViewState;
  readonly tools: readonly Tool[];
  readonly activeTool: Tool;
  readonly options: CompileOptions;
  compiled(): CompileResult | null;
  compileError(): string | null;
  setTool(id: ToolId): void;
  setOptions(options: Partial<CompileOptions>): void;
  requestRender(): void;
  newLevel(): void;
  loadSample(index: number): void;
  openLevel(): void;
  saveLevel(): void;
  exportPvsJson(): void;
  exportPvsText(): void;
  fitView(): void;
}

export class Panel {
  private readonly toolButtons = new Map<ToolId, HTMLButtonElement>();
  private readonly kindButtons = new Map<BrushKind, HTMLButtonElement>();
  private readonly selectionBox = h("div", { class: "readout" });
  private readonly statsBox = h("div", { class: "readout" });
  private readonly probeBox = h("div", { class: "readout" });
  private readonly undoButton: HTMLButtonElement;
  private readonly redoButton: HTMLButtonElement;

  constructor(root: HTMLElement, private readonly host: PanelHost) {
    const { model, view } = host;

    const tools = h("div", { class: "button-row" });
    for (const tool of host.tools) {
      const b = h("button", { title: `${tool.hint} [${tool.shortcut.toUpperCase()}]`, onclick: () => host.setTool(tool.id) }, `${tool.label} `, h("kbd", {}, tool.shortcut.toUpperCase()));
      this.toolButtons.set(tool.id, b);
      tools.append(b);
    }

    const kinds = h("div", { class: "button-row" });
    for (const kind of ["room", "solid"] as const) {
      const b = h("button", { class: `kind-${kind}`, onclick: () => { model.newBrushKind = kind; this.update(); } }, kind === "room" ? "Room (empty)" : "Solid (occluder)");
      this.kindButtons.set(kind, b);
      kinds.append(b);
    }

    this.undoButton = h("button", { onclick: () => model.undo(), title: "Ctrl+Z" }, "Undo");
    this.redoButton = h("button", { onclick: () => model.redo(), title: "Ctrl+Y / Ctrl+Shift+Z" }, "Redo");

    const sampleSelect = h("select", {}, ...SAMPLE_LEVELS.map((s, i) => h("option", { value: i, title: s.description }, s.name)));
    const level = h("div", { class: "stack" },
      h("div", { class: "button-row" },
        sampleSelect,
        h("button", { onclick: () => host.loadSample(Number(sampleSelect.value)) }, "Load sample"),
      ),
      h("div", { class: "button-row" },
        h("button", { onclick: () => host.newLevel() }, "New"),
        h("button", { onclick: () => host.openLevel() }, "Open…"),
        h("button", { onclick: () => host.saveLevel() }, "Save…"),
        this.undoButton,
        this.redoButton,
      ),
      h("div", { class: "button-row" },
        h("button", { class: "primary", onclick: () => host.exportPvsJson() }, "Export PVS (.json)"),
        h("button", { class: "primary", onclick: () => host.exportPvsText() }, "Export PVS (.txt)"),
      ),
    );

    const gridSelect = h("select", { onchange: (e: Event) => { view.gridSize = Number((e.target as HTMLSelectElement).value); host.requestRender(); } },
      ...[0.25, 0.5, 1, 2, 4].map((g) => h("option", { value: g, selected: g === view.gridSize }, `${g}`)));
    const snap = h("div", { class: "button-row" },
      checkbox("Snap to grid", view.snap, (v) => { view.snap = v; }),
      h("label", {}, "Grid ", gridSelect),
      h("button", { onclick: () => host.fitView(), title: "F" }, "Fit view"),
    );

    const layers = h("div", { class: "layers" });
    for (const key of Object.keys(view.layers) as (keyof Layers)[]) {
      layers.append(checkbox(LAYER_LABELS[key], view.layers[key], (v) => { view.layers[key] = v; host.requestRender(); }));
    }

    const opts = host.options;
    const symmetry = h("select", { onchange: (e: Event) => host.setOptions({ symmetry: (e.target as HTMLSelectElement).value as PvsSymmetry }) },
      ...(["none", "intersect", "union"] as const).map((s) => h("option", { value: s, selected: opts.symmetry === s }, s)));
    const compiler = h("div", { class: "stack" },
      numberField("BSP split weight", opts.bsp.splitWeight ?? 8, (v) => host.setOptions({ bsp: { ...host.options.bsp, splitWeight: v } })),
      numberField("BSP balance weight", opts.bsp.balanceWeight ?? 1, (v) => host.setOptions({ bsp: { ...host.options.bsp, balanceWeight: v } })),
      checkbox("Clip source by reverse antipenumbra", opts.flow.clipSource ?? true, (v) => host.setOptions({ flow: { ...host.options.flow, clipSource: v } })),
      h("label", { class: "field" }, h("span", {}, "PVS symmetry"), symmetry),
    );

    root.append(
      h("header", {}, h("h1", {}, "polyvis ", h("span", { class: "tag" }, "2D")), h("p", {}, "CSG → BSP → portals → portal flow → PVS")),
      section("Tools", tools, h("div", { class: "hint" }, "New brushes are:"), kinds),
      section("Selection", this.selectionBox),
      section("Level", level),
      section("Snapping", snap),
      section("Layers", layers),
      section("Compiler", compiler),
      section("Stats", this.statsBox),
      section("Probe", this.probeBox),
      section("Shortcuts", h("div", { class: "hint" },
        "Wheel zoom · middle/right drag or Space+drag pan · F fit · K toggle room/solid · Ctrl+Z/Y undo/redo")),
    );
    this.update();
  }

  /** Refreshes all state-dependent parts of the panel. */
  update(): void {
    const { model, view } = this.host;
    for (const [id, b] of this.toolButtons) b.classList.toggle("active", id === this.host.activeTool.id);
    for (const [kind, b] of this.kindButtons) b.classList.toggle("active", kind === model.newBrushKind);
    this.undoButton.disabled = !model.canUndo;
    this.redoButton.disabled = !model.canRedo;
    this.renderSelection();
    this.renderStats();
    this.renderProbe(view);
  }

  private renderSelection(): void {
    const { model } = this.host;
    const b = model.selectedBrush;
    if (!b) {
      this.selectionBox.replaceChildren(h("span", { class: "muted" }, "Nothing selected"));
      return;
    }
    this.selectionBox.replaceChildren(
      kv("Brush", `#${b.id} (${b.kind})`),
      kv("Vertices", String(b.vertices.length)),
      h("div", { class: "button-row" },
        h("button", { onclick: () => model.updateBrush(b.id, { kind: b.kind === "room" ? "solid" : "room" }) }, "Toggle kind"),
        h("button", { onclick: () => model.bringToFront(b.id) }, "To front"),
        h("button", { onclick: () => model.duplicateBrush(b.id, { x: 1, y: -1 }) }, "Duplicate"),
        h("button", { class: "danger", onclick: () => model.removeBrush(b.id) }, "Delete"),
      ),
    );
  }

  private renderStats(): void {
    const error = this.host.compileError();
    const r = this.host.compiled();
    if (error) {
      this.statsBox.replaceChildren(h("div", { class: "error" }, `Compile error: ${error}`));
      return;
    }
    if (!r) {
      this.statsBox.replaceChildren(h("span", { class: "muted" }, "Not compiled"));
      return;
    }
    const total = r.timings.reduce((s, t) => s + t.ms, 0);
    this.statsBox.replaceChildren(
      kv("Brushes", String(this.host.model.level.brushes.length)),
      kv("Walls", String(r.walls.length)),
      kv("BSP nodes / depth", `${r.bspStats.nodeCount} / ${r.bspStats.maxDepth}`),
      kv("Leaves (empty / solid)", `${r.summary.emptyLeafCount} / ${r.bspStats.solidLeafCount}`),
      kv("Wall splits", String(r.bspStats.splitCount)),
      kv("Portals (directed)", String(r.graph.portals.length)),
      kv("Avg might-see → flow", `${r.summary.averageMightSee.toFixed(1)} → ${r.summary.averagePortalVis.toFixed(1)}`),
      kv("Avg visible leaves", `${r.summary.averageVisibleLeaves.toFixed(1)} (${(r.summary.averageVisibleFraction * 100).toFixed(0)}%)`),
      kv("Flow steps", `${r.flowStats.steps}${r.flowStats.truncated ? " (TRUNCATED)" : ""}`),
      ...(r.leaks.leaking ? [h("div", { class: "error" }, `Leak: ${r.leaks.boundaryLeaves.length} empty leaves touch the bounds`)] : []),
      h("div", { class: "timings" },
        ...r.timings.map((t) => kv(t.stage, `${t.ms.toFixed(2)} ms`)),
        kv("total", `${total.toFixed(2)} ms`)),
    );
  }

  private renderProbe(view: ViewState): void {
    const r = this.host.compiled();
    const p = view.inspect.point;
    if (!r || !p) {
      this.probeBox.replaceChildren(h("span", { class: "muted" }, "Use the Inspect tool to probe visibility"));
      return;
    }
    const leaf = locateLeaf(r.tree, p);
    const contents = r.tree.leaves[leaf].contents;
    const rows: (HTMLElement | null)[] = [
      kv("Point", `${p.x.toFixed(2)}, ${p.y.toFixed(2)}${view.inspect.pinned ? " (pinned)" : ""}`),
      kv("Leaf", `L${leaf} (${contents})`),
    ];
    if (contents === "empty") {
      const vis = r.pvs[leaf].toArray();
      rows.push(kv("PVS", `${vis.length} / ${r.summary.emptyLeafCount} leaves`));
      rows.push(h("div", { class: "ids" }, vis.map((i) => `L${i}`).join(" ")));
      rows.push(kv("Portals out", r.graph.portalsFrom[leaf].map((i) => `${i}`).join(", ") || "—"));
    }
    const portalId = view.inspect.portal;
    if (portalId !== null && r.graph.portals[portalId]) {
      const portal = r.graph.portals[portalId];
      rows.push(h("hr"));
      rows.push(kv("Portal", `#${portal.id}: L${portal.from} → L${portal.to}`));
      rows.push(kv("Might see (base vis)", String(r.mightSee[portalId].count())));
      rows.push(kv("Sees (portal flow)", String(r.portalVis[portalId].count())));
    }
    this.probeBox.replaceChildren(...rows.filter((x): x is HTMLElement => x !== null));
  }
}

function section(title: string, ...children: (Node | null)[]): HTMLElement {
  return h("section", {}, h("h2", {}, title), ...children);
}

function kv(key: string, value: string): HTMLElement {
  return h("div", { class: "kv" }, h("span", { class: "k" }, key), h("span", { class: "v" }, value));
}

function checkbox(label: string, checked: boolean, onChange: (v: boolean) => void): HTMLElement {
  const input = h("input", { type: "checkbox", checked, onchange: (e: Event) => onChange((e.target as HTMLInputElement).checked) });
  return h("label", { class: "check" }, input, label);
}

function numberField(label: string, value: number, onChange: (v: number) => void): HTMLElement {
  const input = h("input", {
    type: "number", min: 0, step: 0.5, value,
    onchange: (e: Event) => {
      const v = Number((e.target as HTMLInputElement).value);
      if (Number.isFinite(v) && v >= 0) onChange(v);
    },
  });
  return h("label", { class: "field" }, h("span", {}, label), input);
}
