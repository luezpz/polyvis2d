/**
 * Editor document model: the current level, selection and undo history.
 *
 * Levels are immutable values; every edit produces a new `Level`. Continuous
 * gestures (dragging) use {@link EditorModel.beginGesture} /
 * {@link EditorModel.endGesture} so a whole drag becomes one undo step.
 */

import { type Brush, type BrushKind, type Level, type Vec2, emptyLevel, makeBrush, nextBrushId } from "../../core";
import { History } from "./history";

export type ModelChange = "level" | "selection";
type Listener = (change: ModelChange) => void;

export class EditorModel {
  private _level: Level = emptyLevel();
  private _selectedId: number | null = null;
  private gestureStart: Level | null = null;
  private readonly history = new History<Level>();
  private readonly listeners = new Set<Listener>();

  /** Kind used for newly created brushes. */
  newBrushKind: BrushKind = "room";

  get level(): Level {
    return this._level;
  }

  get selectedId(): number | null {
    return this._selectedId;
  }

  get selectedBrush(): Brush | null {
    return this._level.brushes.find((b) => b.id === this._selectedId) ?? null;
  }

  get canUndo(): boolean {
    return this.history.canUndo;
  }

  get canRedo(): boolean {
    return this.history.canRedo;
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(change: ModelChange): void {
    for (const l of this.listeners) l(change);
  }

  /** Replaces the whole level (e.g. on load). Clears history unless `undoable`. */
  loadLevel(level: Level, undoable = false): void {
    if (undoable) this.history.record(this._level);
    else this.history.clear();
    this._level = level;
    this._selectedId = null;
    this.emit("level");
    this.emit("selection");
  }

  select(id: number | null): void {
    if (id === this._selectedId) return;
    this._selectedId = id;
    this.emit("selection");
  }

  /** Applies an edit. Inside a gesture, history is recorded once at the end. */
  private apply(next: Level): void {
    if (next === this._level) return;
    if (!this.gestureStart) this.history.record(this._level);
    this._level = next;
    this.emit("level");
  }

  beginGesture(): void {
    this.gestureStart ??= this._level;
  }

  endGesture(): void {
    if (this.gestureStart && this.gestureStart !== this._level) this.history.record(this.gestureStart);
    this.gestureStart = null;
  }

  /** Adds a brush from points (convex hull is taken). Returns the new brush id, or null if degenerate. */
  addBrush(kind: BrushKind, points: readonly Vec2[]): number | null {
    const brush = makeBrush(nextBrushId(this._level), kind, points);
    if (!brush) return null;
    this.apply({ ...this._level, brushes: [...this._level.brushes, brush] });
    this.select(brush.id);
    return brush.id;
  }

  /** Replaces a brush's geometry/kind. Invalid (degenerate) geometry is ignored. */
  updateBrush(id: number, changes: { kind?: BrushKind; vertices?: readonly Vec2[] }): void {
    const brushes = this._level.brushes.map((b) => {
      if (b.id !== id) return b;
      return makeBrush(id, changes.kind ?? b.kind, changes.vertices ?? b.vertices) ?? b;
    });
    this.apply({ ...this._level, brushes });
  }

  translateBrush(id: number, original: Brush, delta: Vec2): void {
    this.updateBrush(id, { vertices: original.vertices.map((v) => ({ x: v.x + delta.x, y: v.y + delta.y })) });
  }

  removeBrush(id: number): void {
    this.apply({ ...this._level, brushes: this._level.brushes.filter((b) => b.id !== id) });
    if (this._selectedId === id) this.select(null);
  }

  duplicateBrush(id: number, offset: Vec2): void {
    const b = this._level.brushes.find((x) => x.id === id);
    if (b) this.addBrush(b.kind, b.vertices.map((v) => ({ x: v.x + offset.x, y: v.y + offset.y })));
  }

  /** Moves a brush to the end (drawn on top / picked first). */
  bringToFront(id: number): void {
    const b = this._level.brushes.find((x) => x.id === id);
    if (!b) return;
    this.apply({ ...this._level, brushes: [...this._level.brushes.filter((x) => x.id !== id), b] });
  }

  undo(): void {
    const prev = this.history.undo(this._level);
    if (prev) {
      this._level = prev;
      if (!prev.brushes.some((b) => b.id === this._selectedId)) this._selectedId = null;
      this.emit("level");
      this.emit("selection");
    }
  }

  redo(): void {
    const next = this.history.redo(this._level);
    if (next) {
      this._level = next;
      this.emit("level");
    }
  }
}
