import { UNKNOWN, FILLED, EMPTY, type Cell, type Clue } from "./types";
import { solveLine } from "./lineSolver";

export type Grid = Cell[][];
export type SolveStatus = "solved" | "stuck" | "contradiction";

export function makeGrid(h: number, w: number): Grid {
  return Array.from({ length: h }, () => Array<Cell>(w).fill(UNKNOWN));
}

function getColumn(grid: Grid, c: number): Cell[] {
  return grid.map((row) => row[c]);
}

function isComplete(grid: Grid): boolean {
  return grid.every((row) => row.every((cell) => cell !== UNKNOWN));
}

/**
 * Iterated line solving across all rows and columns to a fixpoint. Pure logical
 * propagation — never guesses. Accepts an optional starting grid.
 */
export function propagate(
  rowClues: Clue[],
  colClues: Clue[],
  start?: Grid,
): { status: SolveStatus; grid: Grid } {
  const h = rowClues.length;
  const w = colClues.length;
  const grid = start ? start.map((row) => row.slice()) : makeGrid(h, w);

  let changed = true;
  while (changed) {
    changed = false;
    for (let r = 0; r < h; r++) {
      const next = solveLine(grid[r], rowClues[r]);
      if (next === null) return { status: "contradiction", grid };
      for (let c = 0; c < w; c++) {
        if (next[c] !== grid[r][c]) {
          grid[r][c] = next[c];
          changed = true;
        }
      }
    }
    for (let c = 0; c < w; c++) {
      const next = solveLine(getColumn(grid, c), colClues[c]);
      if (next === null) return { status: "contradiction", grid };
      for (let r = 0; r < h; r++) {
        if (next[r] !== grid[r][c]) {
          grid[r][c] = next[r];
          changed = true;
        }
      }
    }
  }

  return { status: isComplete(grid) ? "solved" : "stuck", grid };
}

function firstUnknown(grid: Grid): [number, number] | null {
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c] === UNKNOWN) return [r, c];
    }
  }
  return null;
}

/** Safety cap so a pathological grid can never hang the UI. */
const NODE_CAP = 200_000;

export interface SolutionCount {
  count: number;
  /** True if the node cap was hit before the search finished — the count is a
   *  lower bound and uniqueness must NOT be inferred. */
  capped: boolean;
}

/**
 * Count solutions up to `limit` via propagation interleaved with DFS on the
 * first unknown cell. Node-bounded so a pathological grid can't hang; if the
 * cap is hit, `capped` is set so callers never certify uniqueness they didn't
 * actually prove.
 */
export function countSolutionsDetailed(rowClues: Clue[], colClues: Clue[], limit = 2): SolutionCount {
  let count = 0;
  let nodes = 0;
  let capped = false;

  function dfs(grid: Grid): void {
    if (count >= limit) return;
    if (++nodes > NODE_CAP) {
      capped = true;
      return;
    }
    const res = propagate(rowClues, colClues, grid);
    if (res.status === "contradiction") return;
    if (res.status === "solved") {
      count++;
      return;
    }
    const cell = firstUnknown(res.grid);
    if (!cell) return;
    const [r, c] = cell;
    for (const value of [FILLED, EMPTY] as Cell[]) {
      if (count >= limit) return;
      const next = res.grid.map((row) => row.slice());
      next[r][c] = value;
      dfs(next);
    }
  }

  dfs(makeGrid(rowClues.length, colClues.length));
  return { count, capped };
}

export function countSolutions(rowClues: Clue[], colClues: Clue[], limit = 2): number {
  return countSolutionsDetailed(rowClues, colClues, limit).count;
}

export function hasUniqueSolution(rowClues: Clue[], colClues: Clue[]): boolean {
  const { count, capped } = countSolutionsDetailed(rowClues, colClues, 2);
  return count === 1 && !capped;
}

/**
 * Return a solution grid and whether search beyond pure propagation was needed.
 * Throws if the clues admit no solution at all.
 */
export function solve(
  rowClues: Clue[],
  colClues: Clue[],
): { solution: boolean[][]; viaSearch: boolean } {
  const prop = propagate(rowClues, colClues);
  if (prop.status === "solved") {
    return { solution: toBooleans(prop.grid), viaSearch: false };
  }

  let found: Grid | null = null;
  function dfs(grid: Grid): boolean {
    const res = propagate(rowClues, colClues, grid);
    if (res.status === "contradiction") return false;
    if (res.status === "solved") {
      found = res.grid;
      return true;
    }
    const cell = firstUnknown(res.grid);
    if (!cell) return false;
    const [r, c] = cell;
    for (const value of [FILLED, EMPTY] as Cell[]) {
      const next = res.grid.map((row) => row.slice());
      next[r][c] = value;
      if (dfs(next)) return true;
    }
    return false;
  }

  dfs(makeGrid(rowClues.length, colClues.length));
  if (!found) throw new Error("unsolvable puzzle");
  return { solution: toBooleans(found), viaSearch: true };
}

/** True if pure propagation (no guessing) fully solves the puzzle. */
export function isLineSolvable(rowClues: Clue[], colClues: Clue[]): boolean {
  return propagate(rowClues, colClues).status === "solved";
}

function toBooleans(grid: Grid): boolean[][] {
  return grid.map((row) => row.map((cell) => cell === FILLED));
}
