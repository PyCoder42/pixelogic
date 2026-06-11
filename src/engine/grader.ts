import { UNKNOWN, type Cell, type Clue, type Difficulty } from "./types";
import { solveLine } from "./lineSolver";
import { isLineSolvable } from "./solver";
import { solveByLogic } from "./deduce";
import { cluesForGrid } from "./clues";
import { isSymmetric } from "./symmetry";
import { detectPatterned } from "./badges";

const TIER_ORDER: Difficulty[] = ["easy", "medium", "hard", "expert", "max"];

function capAt(d: Difficulty, cap: Difficulty): Difficulty {
  return TIER_ORDER.indexOf(d) > TIER_ORDER.indexOf(cap) ? cap : d;
}

/**
 * Grade by reasoning effort, judged from the clues alone:
 *  - line-solvable puzzles are graded by how many full propagation sweeps a
 *    deduction-only solver needs (size doesn't matter — a big trivial picture
 *    is still easy);
 *  - puzzles where pure line logic stalls need hypothesis/contradiction
 *    reasoning and start at `expert`.
 * `gradeGrid` refines this with whole-picture rules (symmetry, pattern, Max).
 */
export function grade(rowClues: Clue[], colClues: Clue[]): Difficulty {
  if (!isLineSolvable(rowClues, colClues)) return "expert";
  const rounds = countPropagationRounds(rowClues, colClues);
  if (rounds <= 2) return "easy";
  if (rounds <= 4) return "medium";
  return "hard";
}

/**
 * Grade a full solution grid:
 *  - contradiction puzzles are split into Extra Hard vs Max by total reasoning
 *    effort (how many what-if proofs, how many forced steps, how long the lines);
 *  - a symmetric picture leaks information → capped at Hard;
 *  - a patterned picture (one run per line) is mostly "continue the shape" →
 *    capped at Medium.
 */
export function gradeGrid(solution: boolean[][]): Difficulty {
  const { rowClues, colClues } = cluesForGrid(solution);
  const area = solution.length * (solution[0]?.length ?? 0);

  let d: Difficulty;
  if (isLineSolvable(rowClues, colClues)) {
    d = grade(rowClues, colClues);
  } else {
    const { steps } = solveByLogic(rowClues, colClues);
    const contradictions = steps.filter((s) => s.technique === "contradiction").length;
    // Effort blends the number of what-if proofs (weighted heavily — each is a
    // full sub-deduction), the sheer number of forced steps, and the line size.
    const effort = steps.length + 15 * contradictions + area / 2;
    d = effort >= 200 ? "max" : "expert";
  }

  if (isSymmetric(solution)) d = capAt(d, "hard");
  if (detectPatterned(solution)) d = capAt(d, "medium");
  return d;
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
