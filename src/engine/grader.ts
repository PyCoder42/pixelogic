import { UNKNOWN, type Cell, type Clue, type Difficulty } from "./types";
import { solveLine } from "./lineSolver";
import { isLineSolvable } from "./solver";

/**
 * Grade a puzzle by the hardest technique it requires:
 *  - `expert` (Extra Hard): pure line-solving stalls — it needs
 *    hypothesis/contradiction reasoning (it is still uniquely solvable).
 *  - otherwise grade the line-solvable puzzle by effort (rounds) and size.
 */
export function grade(rowClues: Clue[], colClues: Clue[]): Difficulty {
  const h = rowClues.length;
  const w = colClues.length;
  const area = h * w;

  if (!isLineSolvable(rowClues, colClues)) return "expert";

  const rounds = countPropagationRounds(rowClues, colClues);

  if (area <= 36) return rounds <= 2 ? "easy" : "medium";
  if (area <= 120) return rounds <= 4 ? "medium" : "hard";
  return "hard";
}

/** Number of full row+column sweeps propagation needs to reach its fixpoint. */
function countPropagationRounds(rowClues: Clue[], colClues: Clue[]): number {
  const h = rowClues.length;
  const w = colClues.length;
  const grid: Cell[][] = Array.from({ length: h }, () => Array<Cell>(w).fill(UNKNOWN));

  let rounds = 0;
  let changed = true;
  while (changed) {
    changed = false;
    rounds++;
    for (let r = 0; r < h; r++) {
      const next = solveLine(grid[r], rowClues[r]);
      if (!next) return rounds;
      for (let c = 0; c < w; c++) {
        if (next[c] !== grid[r][c]) {
          grid[r][c] = next[c];
          changed = true;
        }
      }
    }
    for (let c = 0; c < w; c++) {
      const column = grid.map((row) => row[c]);
      const next = solveLine(column, colClues[c]);
      if (!next) return rounds;
      for (let r = 0; r < h; r++) {
        if (next[r] !== grid[r][c]) {
          grid[r][c] = next[r];
          changed = true;
        }
      }
    }
  }
  return rounds;
}
