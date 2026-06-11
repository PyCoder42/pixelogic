// Measure solver-effort metrics for every library puzzle so we can re-tune the
// grader empirically: propagation rounds (line-solvable effort) and contradiction
// steps (expert effort), plus pattern/symmetry flags.
import { UNKNOWN, type Cell, type Clue } from "../src/engine/types";
import { LIBRARY } from "../src/engine/puzzles";
import { cluesForGrid } from "../src/engine/clues";
import { solveLine } from "../src/engine/lineSolver";
import { isLineSolvable } from "../src/engine/solver";
import { solveByLogic } from "../src/engine/deduce";
import { detectSymmetry } from "../src/engine/symmetry";

function rounds(rowClues: Clue[], colClues: Clue[]): number {
  const h = rowClues.length;
  const w = colClues.length;
  const grid: Cell[][] = Array.from({ length: h }, () => Array<Cell>(w).fill(UNKNOWN));
  let n = 0;
  let changed = true;
  while (changed) {
    changed = false;
    n++;
    for (let r = 0; r < h; r++) {
      const next = solveLine(grid[r], rowClues[r]);
      if (!next) return n;
      for (let c = 0; c < w; c++)
        if (next[c] !== grid[r][c]) {
          grid[r][c] = next[c];
          changed = true;
        }
    }
    for (let c = 0; c < w; c++) {
      const col = grid.map((row) => row[c]);
      const next = solveLine(col, colClues[c]);
      if (!next) return n;
      for (let r = 0; r < h; r++)
        if (next[r] !== grid[r][c]) {
          grid[r][c] = next[r];
          changed = true;
        }
    }
  }
  return n;
}

function maxOneRunPerLine(grid: boolean[][]): boolean {
  const runs = (line: boolean[]) => {
    let n = 0;
    let inRun = false;
    for (const v of line) {
      if (v && !inRun) {
        n++;
        inRun = true;
      } else if (!v) inRun = false;
    }
    return n;
  };
  if (grid.some((row) => runs(row) > 1)) return false;
  for (let c = 0; c < grid[0].length; c++) {
    if (runs(grid.map((r) => r[c])) > 1) return false;
  }
  return true;
}

for (const p of LIBRARY) {
  const { rowClues, colClues } = cluesForGrid(p.solution);
  const line = isLineSolvable(rowClues, colClues);
  const s = detectSymmetry(p.solution);
  const sym = [s.horizontal && "H", s.vertical && "V", s.rotational && "R"].filter(Boolean).join("") || "-";
  let metric: string;
  if (line) {
    metric = `rounds=${rounds(rowClues, colClues)}`;
  } else {
    const { steps } = solveByLogic(rowClues, colClues);
    const contras = steps.filter((x) => x.technique === "contradiction").length;
    metric = `contras=${contras} steps=${steps.length}`;
  }
  console.log(
    `${p.title.padEnd(13)} ${(p.width + "x" + p.height).padEnd(6)} cur=${p.difficulty.padEnd(7)} line=${line ? "Y" : "N"} sym=${sym.padEnd(3)} pat=${maxOneRunPerLine(p.solution) ? "Y" : "N"} ${metric}`,
  );
}
