/** Snapshot-based undo/redo stack for immutable values. */
export class History<T> {
  private readonly undoStack: T[] = [];
  private readonly redoStack: T[] = [];

  constructor(private readonly limit = 200) {}

  /** Records `previous` as the state to return to on undo. Clears the redo stack. */
  record(previous: T): void {
    this.undoStack.push(previous);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  /** Returns the state to restore, given the current one, or null if nothing to undo. */
  undo(current: T): T | null {
    const prev = this.undoStack.pop();
    if (prev === undefined) return null;
    this.redoStack.push(current);
    return prev;
  }

  redo(current: T): T | null {
    const next = this.redoStack.pop();
    if (next === undefined) return null;
    this.undoStack.push(current);
    return next;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}
