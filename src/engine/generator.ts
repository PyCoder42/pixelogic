import type { Puzzle, Difficulty } from "./types";
import { cluesForGrid } from "./clues";
import { countSolutionsDetailed } from "./solver";
import { grade } from "./grader";

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
}

/** Analyze a solution grid for uniqueness and difficulty (used by the editor). */
export function analyzeGrid(solution: boolean[][]): GridAnalysis {
  const { rowClues, colClues } = cluesForGrid(solution);
  const { count, capped } = countSolutionsDetailed(rowClues, colClues, 2);
  const difficulty = grade(rowClues, colClues);
  // If the bounded search was capped we can't certify uniqueness — treat as ambiguous.
  return { unique: count === 1 && !capped, solutionCount: count, difficulty };
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
