import type { Clue } from "../engine/types";
import { cluesForLine } from "../engine/clues";
import { el } from "./dom";

export type CellView = "filled" | "cross" | "empty";

export interface BoardConfig {
  width: number;
  height: number;
  rowClues: Clue[];
  colClues: Clue[];
  getCell: (r: number, c: number) => CellView;
  isMistake?: (r: number, c: number) => boolean;
  /** Dim a clue once its line's filled runs match it (play mode). */
  dimSatisfied?: boolean;
  /** Adds button semantics + data attributes used by input handling. */
  interactive?: boolean;
  /** Accessible name for the grid (interactive boards). */
  gridLabel?: string;
}

function cellLabel(r: number, c: number, view: CellView): string {
  const state = view === "filled" ? ", filled" : view === "cross" ? ", crossed" : "";
  return `Row ${r + 1}, column ${c + 1}${state}`;
}

export interface Board {
  element: HTMLElement;
  cellsEl: HTMLElement;
  refresh(): void;
  destroy(): void;
}

function clueNumbers(clue: Clue): HTMLElement {
  const wrap = el("div", { class: "clue-stack" });
  if (clue.length === 0) {
    wrap.append(el("span", { class: "clue-num clue-zero", text: "0" }));
  } else {
    for (const n of clue) wrap.append(el("span", { class: "clue-num", text: String(n) }));
  }
  return wrap;
}

/** Build a board element with aligned clues and a refreshable cell grid. */
export function createBoard(config: BoardConfig): Board {
  const { width, height, rowClues, colClues } = config;

  const maxRowClue = Math.max(1, ...rowClues.map((c) => c.length));
  const maxColClue = Math.max(1, ...colClues.map((c) => c.length));

  // NB: CSS repeat() requires a *literal* count — a custom property only works as
  // the track size, not the repetition count — so the templates are set inline here.
  const colsTemplate = `repeat(${width}, var(--cell))`;
  const rowsTemplate = `repeat(${height}, var(--cell))`;

  const corner = el("div", { class: "board-corner" });

  const colCluesEl = el("div", { class: "col-clues", style: { gridTemplateColumns: colsTemplate } });
  const colClueEls: HTMLElement[] = [];
  for (let c = 0; c < width; c++) {
    const cell = el("div", { class: "col-clue", dataset: { c: String(c) } }, [clueNumbers(colClues[c])]);
    if ((c + 1) % 5 === 0 && c + 1 < width) cell.classList.add("major-col");
    colCluesEl.append(cell);
    colClueEls.push(cell);
  }

  const rowCluesEl = el("div", { class: "row-clues", style: { gridTemplateRows: rowsTemplate } });
  const rowClueEls: HTMLElement[] = [];
  for (let r = 0; r < height; r++) {
    const cell = el("div", { class: "row-clue", dataset: { r: String(r) } }, [clueNumbers(rowClues[r])]);
    if ((r + 1) % 5 === 0 && r + 1 < height) cell.classList.add("major-row");
    rowCluesEl.append(cell);
    rowClueEls.push(cell);
  }

  const cellsEl = el("div", {
    class: "board-cells",
    style: { gridTemplateColumns: colsTemplate, gridTemplateRows: rowsTemplate },
  });
  if (config.interactive) {
    cellsEl.setAttribute("role", "group");
    cellsEl.setAttribute("aria-label", config.gridLabel ?? "Puzzle grid");
  }
  const cellEls: HTMLElement[][] = [];
  for (let r = 0; r < height; r++) {
    const row: HTMLElement[] = [];
    for (let c = 0; c < width; c++) {
      const cell = el(config.interactive ? "button" : "div", {
        class: "cell",
        dataset: { r: String(r), c: String(c) },
        style: { ["--i" as string]: String(r * width + c) },
      });
      if (config.interactive) {
        cell.setAttribute("type", "button");
        cell.setAttribute("aria-label", cellLabel(r, c, "empty"));
        cell.setAttribute("aria-pressed", "false");
        cell.tabIndex = r === 0 && c === 0 ? 0 : -1; // roving tabindex
      }
      if ((c + 1) % 5 === 0 && c + 1 < width) cell.classList.add("major-col");
      if ((r + 1) % 5 === 0 && r + 1 < height) cell.classList.add("major-row");
      cellsEl.append(cell);
      row.push(cell);
    }
    cellEls.push(row);
  }

  const element = el(
    "div",
    {
      class: "board",
      style: {
        ["--cols" as string]: String(width),
        ["--rows" as string]: String(height),
        ["--max-row-clue" as string]: String(maxRowClue),
        ["--max-col-clue" as string]: String(maxColClue),
      },
    },
    [corner, colCluesEl, rowCluesEl, cellsEl],
  );

  function fitCell(): void {
    const availW = Math.min(window.innerWidth * 0.94, 620);
    const availH = Math.max(260, window.innerHeight * 0.6);
    const byW = availW / (width + 0.62 * maxRowClue);
    const byH = availH / (height + 0.62 * maxColClue);
    const size = Math.max(18, Math.min(64, Math.floor(Math.min(byW, byH) * 0.98)));
    element.style.setProperty("--cell", `${size}px`);
  }

  function refresh(): void {
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const view = config.getCell(r, c);
        const cell = cellEls[r][c];
        cell.classList.toggle("filled", view === "filled");
        cell.classList.toggle("cross", view === "cross");
        if (config.interactive) {
          cell.setAttribute("aria-label", cellLabel(r, c, view));
          cell.setAttribute("aria-pressed", view === "filled" ? "true" : "false");
        }
        if (config.isMistake) cell.classList.toggle("mistake", config.isMistake(r, c));
      }
    }
    if (config.dimSatisfied) {
      for (let r = 0; r < height; r++) {
        const filled = Array.from({ length: width }, (_, c) => config.getCell(r, c) === "filled");
        rowClueEls[r].classList.toggle("done", clueEquals(cluesForLine(filled), rowClues[r]));
      }
      for (let c = 0; c < width; c++) {
        const filled = Array.from({ length: height }, (_, r) => config.getCell(r, c) === "filled");
        colClueEls[c].classList.toggle("done", clueEquals(cluesForLine(filled), colClues[c]));
      }
    }
  }

  fitCell();
  refresh();
  window.addEventListener("resize", fitCell);

  return {
    element,
    cellsEl,
    refresh,
    destroy() {
      window.removeEventListener("resize", fitCell);
    },
  };
}

function clueEquals(a: Clue, b: Clue): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Trigger the staggered win reveal animation on a board. */
export function playWinReveal(board: Board): void {
  board.element.classList.add("solved");
}
