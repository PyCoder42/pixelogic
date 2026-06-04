import { UNKNOWN, FILLED, type Cell, type Puzzle } from "../engine/types";

export type Mode = "fill" | "cross";

/** Current epoch ms. Wrapped so it is easy to stub in tests. */
function now(): number {
  return Date.now();
}

/**
 * The player's working board, independent of the hidden solution. Tracks
 * tri-state marks, an undo/redo history (one entry per stroke), an elapsed
 * timer, and the current input mode. Notifies subscribers on every change.
 */
export class GameState {
  readonly puzzle: Puzzle;
  marks: Cell[][];
  mode: Mode = "fill";

  private undoStack: Cell[][][] = [];
  private redoStack: Cell[][][] = [];
  private subscribers: Array<() => void> = [];

  private elapsedBase = 0;
  private runningSince: number | null = null;
  private suspendDepth = 0;

  constructor(puzzle: Puzzle, initialMarks?: Cell[][], elapsedMs = 0) {
    this.puzzle = puzzle;
    this.marks =
      initialMarks?.map((row) => row.slice()) ??
      Array.from({ length: puzzle.height }, () => Array<Cell>(puzzle.width).fill(UNKNOWN));
    this.elapsedBase = elapsedMs;
  }

  subscribe(fn: () => void): void {
    this.subscribers.push(fn);
  }

  private notify(): void {
    if (this.suspendDepth > 0) return;
    for (const fn of this.subscribers) fn();
  }

  /**
   * Apply many cell changes as a single undo entry and a single notification.
   * Used for bulk operations (reveal, restart) so we don't serialize/repaint
   * once per cell.
   */
  batch(recordHistory: boolean, fn: () => void): void {
    if (recordHistory) {
      this.undoStack.push(this.snapshot());
      this.redoStack = [];
    }
    this.suspendDepth++;
    try {
      fn();
    } finally {
      this.suspendDepth--;
    }
    this.notify();
  }

  private snapshot(): Cell[][] {
    return this.marks.map((row) => row.slice());
  }

  /** Set a cell. By default this opens a new undo entry; pass `recordHistory:
   * false` for the continuation of a drag stroke so the whole stroke is one undo. */
  setCell(r: number, c: number, value: Cell, recordHistory = true): void {
    if (r < 0 || c < 0 || r >= this.puzzle.height || c >= this.puzzle.width) return;
    if (this.marks[r][c] === value) return;
    if (recordHistory) {
      this.undoStack.push(this.snapshot());
      this.redoStack = [];
    }
    this.marks[r][c] = value;
    this.notify();
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(this.snapshot());
    this.marks = prev;
    this.notify();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.snapshot());
    this.marks = next;
    this.notify();
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  setMode(mode: Mode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.notify();
  }

  toggleMode(): void {
    this.setMode(this.mode === "fill" ? "cross" : "fill");
  }

  /** Solved when filled cells exactly match the solution (crosses are ignored). */
  isSolved(): boolean {
    for (let r = 0; r < this.puzzle.height; r++) {
      for (let c = 0; c < this.puzzle.width; c++) {
        const filled = this.marks[r][c] === FILLED;
        if (filled !== this.puzzle.solution[r][c]) return false;
      }
    }
    return true;
  }

  /** True if any filled mark sits on a cell that should be empty. */
  hasMistake(): boolean {
    for (let r = 0; r < this.puzzle.height; r++) {
      for (let c = 0; c < this.puzzle.width; c++) {
        if (this.marks[r][c] === FILLED && !this.puzzle.solution[r][c]) return true;
      }
    }
    return false;
  }

  /** Coordinates of every filled-on-empty mistake, for highlighting. */
  mistakes(): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    for (let r = 0; r < this.puzzle.height; r++) {
      for (let c = 0; c < this.puzzle.width; c++) {
        if (this.marks[r][c] === FILLED && !this.puzzle.solution[r][c]) out.push([r, c]);
      }
    }
    return out;
  }

  // ---- timer ----
  start(): void {
    if (this.runningSince === null) this.runningSince = now();
  }
  pause(): void {
    if (this.runningSince !== null) {
      this.elapsedBase += now() - this.runningSince;
      this.runningSince = null;
    }
  }
  elapsedMs(): number {
    return this.elapsedBase + (this.runningSince !== null ? now() - this.runningSince : 0);
  }
}
