import { UNKNOWN, FILLED, EMPTY, type Cell } from "../engine/types";
import type { GameState } from "./gameState";
import type { Board } from "./render";

type Axis = "row" | "col" | null;

/**
 * Wire pointer + keyboard interaction for a play board. Returns a detach fn.
 *
 * - Left drag paints with the value set by the first cell (toggle), locked to
 *   the first axis of movement, filling any skipped cells along the way.
 * - Right-click toggles a cross regardless of mode.
 * - Keyboard: arrows move focus, Space fills, X crosses, Ctrl+Z/Y undo/redo,
 *   M toggles mode.
 */
export function attachInput(board: Board, state: GameState): () => void {
  const cellsEl = board.cellsEl;
  let dragging = false;
  let axis: Axis = null;
  let startR = 0;
  let startC = 0;
  let lastR = 0;
  let lastC = 0;
  let paintValue: Cell = FILLED;

  function cellFromPoint(x: number, y: number): [number, number] | null {
    const target = document.elementFromPoint(x, y) as HTMLElement | null;
    if (!target || !cellsEl.contains(target)) return null;
    const cell = target.closest<HTMLElement>(".cell");
    if (!cell || cell.dataset.r === undefined) return null;
    return [Number(cell.dataset.r), Number(cell.dataset.c)];
  }

  function valueForToggle(r: number, c: number, cross: boolean): Cell {
    const current = state.marks[r][c];
    if (cross) return current === EMPTY ? UNKNOWN : EMPTY;
    return current === FILLED ? UNKNOWN : FILLED;
  }

  function paintBetween(r: number, c: number): void {
    if (axis === "row") {
      const step = c >= lastC ? 1 : -1;
      for (let cc = lastC; cc !== c + step; cc += step) state.setCell(startR, cc, paintValue, false);
      lastC = c;
    } else if (axis === "col") {
      const step = r >= lastR ? 1 : -1;
      for (let rr = lastR; rr !== r + step; rr += step) state.setCell(rr, startC, paintValue, false);
      lastR = r;
    }
  }

  function onPointerDown(e: PointerEvent): void {
    const hit = cellFromPoint(e.clientX, e.clientY);
    if (!hit) return;
    e.preventDefault();
    const [r, c] = hit;
    const cross = e.button === 2 || state.mode === "cross";
    paintValue = valueForToggle(r, c, cross);
    dragging = true;
    axis = null;
    startR = lastR = r;
    startC = lastC = c;
    state.setCell(r, c, paintValue, true); // opens a fresh undo entry
  }

  function onPointerMove(e: PointerEvent): void {
    if (!dragging) return;
    const hit = cellFromPoint(e.clientX, e.clientY);
    if (!hit) return;
    const [r, c] = hit;
    if (axis === null) {
      if (r === startR && c === startC) return;
      if (r === startR) axis = "row";
      else if (c === startC) axis = "col";
      else axis = Math.abs(c - startC) >= Math.abs(r - startR) ? "row" : "col";
    }
    if (axis === "row" && r !== startR) return;
    if (axis === "col" && c !== startC) return;
    paintBetween(r, c);
  }

  function endDrag(): void {
    dragging = false;
    axis = null;
  }

  // ---- keyboard ----
  let cursorR = 0;
  let cursorC = 0;

  function focusCursor(): void {
    const prev = cellsEl.querySelector<HTMLElement>('.cell[tabindex="0"]');
    if (prev) prev.tabIndex = -1;
    const cell = cellsEl.querySelector<HTMLElement>(
      `.cell[data-r="${cursorR}"][data-c="${cursorC}"]`,
    );
    if (cell) {
      cell.tabIndex = 0; // roving tabindex: only the focused cell is tabbable
      cell.focus();
    }
  }

  function onKeyDown(e: KeyboardEvent): void {
    const active = document.activeElement as HTMLElement | null;
    if (active?.classList.contains("cell")) {
      cursorR = Number(active.dataset.r);
      cursorC = Number(active.dataset.c);
    }
    const h = state.puzzle.height;
    const w = state.puzzle.width;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) state.redo();
      else state.undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      state.redo();
      return;
    }

    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        cursorR = (cursorR - 1 + h) % h;
        focusCursor();
        break;
      case "ArrowDown":
        e.preventDefault();
        cursorR = (cursorR + 1) % h;
        focusCursor();
        break;
      case "ArrowLeft":
        e.preventDefault();
        cursorC = (cursorC - 1 + w) % w;
        focusCursor();
        break;
      case "ArrowRight":
        e.preventDefault();
        cursorC = (cursorC + 1) % w;
        focusCursor();
        break;
      case " ":
      case "Enter":
        e.preventDefault();
        state.setCell(cursorR, cursorC, valueForToggle(cursorR, cursorC, false), true);
        break;
      case "x":
      case "X":
        e.preventDefault();
        state.setCell(cursorR, cursorC, valueForToggle(cursorR, cursorC, true), true);
        break;
      case "m":
      case "M":
        e.preventDefault();
        state.toggleMode();
        break;
    }
  }

  function onContextMenu(e: Event): void {
    e.preventDefault();
  }

  cellsEl.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);
  cellsEl.addEventListener("contextmenu", onContextMenu);
  cellsEl.addEventListener("keydown", onKeyDown);

  return () => {
    cellsEl.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", endDrag);
    window.removeEventListener("pointercancel", endDrag);
    cellsEl.removeEventListener("contextmenu", onContextMenu);
    cellsEl.removeEventListener("keydown", onKeyDown);
  };
}
