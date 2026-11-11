/**
 * Tool interface. Exactly one tool is active at a time; the canvas controller
 * forwards pointer/keyboard events to it (after handling pan/zoom itself).
 */

import type { CompileResult, Vec2 } from "../../../core";
import type { Camera } from "../camera";
import type { EditorModel } from "../model";
import type { ViewState } from "../viewState";
import type { Painter } from "../../render/painter";

export type ToolId = "select" | "box" | "polygon" | "inspect";

export interface ToolContext {
  readonly model: EditorModel;
  readonly view: ViewState;
  readonly camera: Camera;
  /** Latest compile result (may lag behind the level by a frame), or null if compilation failed. */
  compiled(): CompileResult | null;
  requestRender(): void;
}

export interface ToolPointer {
  /** Raw world position. */
  readonly world: Vec2;
  /** World position snapped to the grid (if snapping is enabled). */
  readonly snapped: Vec2;
  /** Position in canvas CSS pixels. */
  readonly screen: Vec2;
  readonly button: number;
  readonly shift: boolean;
  readonly ctrl: boolean;
  readonly alt: boolean;
}

export interface Tool {
  readonly id: ToolId;
  readonly label: string;
  /** Single-key shortcut (lower case). */
  readonly shortcut: string;
  /** One-line usage hint shown in the status bar. */
  readonly hint: string;
  readonly cursor: string;
  activate?(): void;
  deactivate?(): void;
  pointerDown?(p: ToolPointer): void;
  pointerMove?(p: ToolPointer): void;
  pointerUp?(p: ToolPointer): void;
  doubleClick?(p: ToolPointer): void;
  /** Returns true if the key was handled. */
  keyDown?(e: KeyboardEvent): boolean;
  drawOverlay?(painter: Painter): void;
}
