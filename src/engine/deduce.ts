import { UNKNOWN, FILLED, EMPTY, type Cell, type Clue } from "./types";
import { solveLine } from "./lineSolver";
import { propagate, type Grid } from "./solver";

export interface DeducedCell {
  r: number;
  c: number;
  value: Cell;
}

export interface Deduction {
  cells: DeducedCell[];
  caption: string;
  technique: "line" | "contradiction";
  lineType?: "row" | "col";
  index?: number;
}

function clueText(clue: Clue): string {
  return clue.length === 0 ? "0" : clue.join(" ");
}

function column(grid: Grid, c: number): Cell[] {
  return grid.map((row) => row[c]);
}

function isComplete(grid: Grid): boolean {
  return grid.every((row) => row.every((cell) => cell !== UNKNOWN));
}

function describe(cells: DeducedCell[]): string {
  const fills = cells.filter((c) => c.value === FILLED).length;
  const empties = cells.length - fills;
  const parts: string[] = [];
  if (fills) parts.push(`fill ${fills}`);
  if (empties) parts.push(`cross ${empties}`);
  return parts.join(" and ");
}

/**
 * Find the next logical deduction for the current grid. Single-line deductions
 * are preferred (easy to explain). If none remain, a depth-1 contradiction is
 * attempted: assume a cell's value, propagate, and if that forces a
 * contradiction, the opposite value is proven. Returns null when no logical
 * step is available (already solved, or needs deeper reasoning).
 */
export function deduceStep(rowClues: Clue[], colClues: Clue[], grid: Grid): Deduction | null {
  const h = rowClues.length;
  const w = colClues.length;

  // 1) Single-line deductions.
  for (let r = 0; r < h; r++) {
    const solved = solveLine(grid[r], rowClues[r]);
    if (!solved) continue;
    const cells: DeducedCell[] = [];
    for (let c = 0; c < w; c++) {
      if (grid[r][c] === UNKNOWN && solved[c] !== UNKNOWN) cells.push({ r, c, value: solved[c] });
    }
    if (cells.length) {
      return {
        cells,
        technique: "line",
        lineType: "row",
        index: r,
        caption: `Row ${r + 1} (clue ${clueText(rowClues[r])}) → ${describe(cells)}.`,
      };
    }
  }
  for (let c = 0; c < w; c++) {
    const solved = solveLine(column(grid, c), colClues[c]);
    if (!solved) continue;
    const cells: DeducedCell[] = [];
    for (let r = 0; r < h; r++) {
      if (grid[r][c] === UNKNOWN && solved[r] !== UNKNOWN) cells.push({ r, c, value: solved[r] });
    }
    if (cells.length) {
      return {
        cells,
        technique: "line",
        lineType: "col",
        index: c,
        caption: `Column ${c + 1} (clue ${clueText(colClues[c])}) → ${describe(cells)}.`,
      };
    }
  }

  // 2) Depth-1 contradiction (hypothesis testing).
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (grid[r][c] !== UNKNOWN) continue;
      const gF = grid.map((row) => row.slice());
      gF[r][c] = FILLED;
      if (propagate(rowClues, colClues, gF).status === "contradiction") {
        return {
          cells: [{ r, c, value: EMPTY }],
          technique: "contradiction",
          caption: `Cell R${r + 1}C${c + 1}: filling it would break a clue, so it must be crossed.`,
        };
      }
      const gE = grid.map((row) => row.slice());
      gE[r][c] = EMPTY;
      if (propagate(rowClues, colClues, gE).status === "contradiction") {
        return {
          cells: [{ r, c, value: FILLED }],
          technique: "contradiction",
          caption: `Cell R${r + 1}C${c + 1}: crossing it would break a clue, so it must be filled.`,
        };
      }
    }
  }

  return null;
}

/**
 * Solve purely by logic — line deductions plus depth-1 contradiction — and
 * return whether it fully solved, the resulting grid, and the ordered steps.
 */
export function solveByLogic(
  rowClues: Clue[],
  colClues: Clue[],
): { solved: boolean; grid: Grid; steps: Deduction[] } {
  const h = rowClues.length;
  const w = colClues.length;
  const grid: Grid = Array.from({ length: h }, () => Array<Cell>(w).fill(UNKNOWN));
  const steps: Deduction[] = [];
  const maxSteps = h * w * 2 + 50;
  let guard = 0;
  while (!isComplete(grid) && guard++ < maxSteps) {
    const step = deduceStep(rowClues, colClues, grid);
    if (!step) break;
    for (const { r, c, value } of step.cells) grid[r][c] = value;
    steps.push(step);
  }
  return { solved: isComplete(grid), grid, steps };
}

/** True if the puzzle is fully solvable by logic alone (incl. depth-1 contradiction). */
export function isLogicSolvable(rowClues: Clue[], colClues: Clue[]): boolean {
  return solveByLogic(rowClues, colClues).solved;
}
