import { UNKNOWN, FILLED, EMPTY, type Cell, type Puzzle } from "../engine/types";
import { deduceStep } from "../engine/deduce";

export interface Hint {
  row: number;
  col: number;
  value: typeof FILLED | typeof EMPTY;
  reason: string;
}

function clueText(clue: number[]): string {
  return clue.length === 0 ? "0" : clue.join(" ");
}

/** True if the player's filled cells already match the solution exactly. */
function isSolved(puzzle: Puzzle, marks: Cell[][]): boolean {
  for (let r = 0; r < puzzle.height; r++) {
    for (let c = 0; c < puzzle.width; c++) {
      if ((marks[r][c] === FILLED) !== puzzle.solution[r][c]) return false;
    }
  }
  return true;
}

/**
 * Build a solver grid keeping only the player's *correct* marks. Mistaken fills
 * and mistaken crosses are discarded (treated as UNKNOWN) so a hint is always a
 * valid logical deduction toward the real solution.
 */
function cleanState(puzzle: Puzzle, marks: Cell[][]): Cell[][] {
  return marks.map((row, r) =>
    row.map((cell, c) => {
      const shouldFill = puzzle.solution[r][c];
      if (cell === FILLED && shouldFill) return FILLED;
      if (cell === EMPTY && !shouldFill) return EMPTY;
      return UNKNOWN;
    }),
  );
}

/**
 * Return the next logically-forced cell given the player's current (correct)
 * marks, with a human-readable reason — or null if the board is already solved.
 */
export function nextHint(puzzle: Puzzle, marks: Cell[][]): Hint | null {
  if (isSolved(puzzle, marks)) return null;

  const clean = cleanState(puzzle, marks);
  const step = deduceStep(puzzle.rowClues, puzzle.colClues, clean);

  if (step && step.cells.length > 0) {
    const { r, c, value } = step.cells[0];
    let reason: string;
    if (step.technique === "line" && step.lineType && step.index !== undefined) {
      const clue =
        step.lineType === "row" ? puzzle.rowClues[step.index] : puzzle.colClues[step.index];
      const label = step.lineType === "row" ? "Row" : "Column";
      reason = `${label} ${step.index + 1} (clue ${clueText(clue)}): this cell must be ${
        value === FILLED ? "filled" : "empty"
      }.`;
    } else {
      reason = step.caption;
    }
    return { row: r, col: c, value: value as typeof FILLED | typeof EMPTY, reason };
  }

  // Fallback: point at the next cell from the known unique solution.
  for (let r = 0; r < puzzle.height; r++) {
    for (let c = 0; c < puzzle.width; c++) {
      if (clean[r][c] === UNKNOWN) {
        const value = puzzle.solution[r][c] ? FILLED : EMPTY;
        return { row: r, col: c, value, reason: "This cell is fixed by the puzzle's only solution." };
      }
    }
  }
  return null;
}
