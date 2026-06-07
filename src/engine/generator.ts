import type { Puzzle, Difficulty } from "./types";
import { cluesForGrid } from "./clues";
import { countSolutionsDetailed, enumerateSolutions } from "./solver";
import { gradeGrid } from "./grader";

/** Parse a `#`/`.` bitmap (any non-`#` char is empty) into a boolean grid. */
export function bitmapToGrid(rows: string[]): boolean[][] {
  if (rows.length === 0) throw new Error("empty bitmap");
  const width = rows[0].length;
  return rows.map((row) => {
    if (row.length !== width) throw new Error(`ragged bitmap row: "${row}"`);
    return [...row].map((ch) => ch === "#");
  });
}

export interface GridAnalysis {
  unique: boolean;
  solutionCount: number;
  difficulty: Difficulty;
  /** When not unique, a 0-indexed cell whose value differs between two valid
   *  solutions — a spot the clues fail to pin down. */
  ambiguity?: { row: number; col: number };
}

/** Find a cell whose value differs between two valid solutions of these clues. */
export function findAmbiguity(solution: boolean[][]): { row: number; col: number } | null {
  const { rowClues, colClues } = cluesForGrid(solution);
  const sols = enumerateSolutions(rowClues, colClues, 2);
  if (sols.length < 2) return null;
  const [a, b] = sols;
  for (let r = 0; r < a.length; r++) {
    for (let c = 0; c < a[r].length; c++) {
      if (a[r][c] !== b[r][c]) return { row: r, col: c };
    }
  }
  return null;
}

/** Analyze a solution grid for uniqueness and difficulty (used by the editor). */
export function analyzeGrid(solution: boolean[][]): GridAnalysis {
  const { rowClues, colClues } = cluesForGrid(solution);
  const { count, capped } = countSolutionsDetailed(rowClues, colClues, 2);
  const difficulty = gradeGrid(solution);
  // If the bounded search was capped we can't certify uniqueness — treat as ambiguous.
  const unique = count === 1 && !capped;
  const result: GridAnalysis = { unique, solutionCount: count, difficulty };
  if (!unique) {
    const amb = findAmbiguity(solution);
    if (amb) result.ambiguity = amb;
  }
  return result;
}

/**
 * Build a `Puzzle` from a bitmap: derive clues, prove uniqueness, grade it.
 * `forcedDifficulty` overrides the computed grade (used to curate the library).
 */
export function puzzleFromBitmap(
  rows: string[],
  title: string,
  id: string,
  forcedDifficulty?: Difficulty,
): { puzzle: Puzzle; unique: boolean; difficulty: Difficulty } {
  const solution = bitmapToGrid(rows);
  const { rowClues, colClues } = cluesForGrid(solution);
  const { unique, difficulty } = analyzeGrid(solution);
  const puzzle: Puzzle = {
    id,
    title,
    width: solution[0].length,
    height: solution.length,
    solution,
    rowClues,
    colClues,
    difficulty: forcedDifficulty ?? difficulty,
  };
  return { puzzle, unique, difficulty };
}
