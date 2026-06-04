import type { Puzzle } from "../engine/types";
import { solveByLogic, type Deduction } from "../engine/deduce";

export type SolveStep = Deduction;

/**
 * Replay the logical solution as an ordered list of human-readable steps —
 * line deductions and, where needed, depth-1 contradiction steps. Used by the
 * "watch it solve" view.
 */
export function solveSteps(puzzle: Puzzle): SolveStep[] {
  return solveByLogic(puzzle.rowClues, puzzle.colClues).steps;
}
