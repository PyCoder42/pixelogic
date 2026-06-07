// Pure scoring model (DOM-free, unit-tested).
//
// Per-puzzle score (0–100):  round(100 × min(1, par/bestTime)) − assist penalties.
// Pixelogic Score (0–1600):  difficulty-weighted average of best per-puzzle scores
//                            across the whole library (a 1600 = perfect everywhere).

import type { Difficulty } from "./types";

/** How much a tier contributes to the overall rating. Harder ⇒ worth far more. */
export const DIFFICULTY_WEIGHT: Record<Difficulty, number> = {
  easy: 1,
  medium: 2,
  hard: 4,
  expert: 7,
  max: 12,
};

/** Target ("par") seconds-per-cell by tier — the pace a solid solver should hit. */
const SECONDS_PER_CELL: Record<Difficulty, number> = {
  easy: 1.0,
  medium: 1.5,
  hard: 2.2,
  expert: 3.2,
  max: 4.5,
};

/** Par time for a puzzle, in whole seconds. */
export function parSeconds(difficulty: Difficulty, area: number): number {
  return Math.round(area * SECONDS_PER_CELL[difficulty]);
}

/** Assist usage during a single solve attempt. */
export interface AssistTally {
  checkSquare: number;
  checkLine: number;
  checkBoard: number;
  hint: number;
  /** Fill-out or Watch-solve was used — the attempt scores 0. */
  voided: boolean;
}

export const PENALTY = { checkSquare: 5, checkLine: 15, checkBoard: 40, hint: 20 } as const;

export function emptyTally(): AssistTally {
  return { checkSquare: 0, checkLine: 0, checkBoard: 0, hint: 0, voided: false };
}

export function penaltyTotal(a: AssistTally): number {
  return (
    a.checkSquare * PENALTY.checkSquare +
    a.checkLine * PENALTY.checkLine +
    a.checkBoard * PENALTY.checkBoard +
    a.hint * PENALTY.hint
  );
}

/** Per-puzzle score in [0,100]. Hitting par (or faster) gives full speed credit. */
export function puzzleScore(opts: {
  difficulty: Difficulty;
  area: number;
  bestTimeMs: number;
  assists: AssistTally;
}): number {
  if (opts.assists.voided || opts.bestTimeMs <= 0) return 0;
  const par = parSeconds(opts.difficulty, opts.area);
  const speed = Math.min(1, par / (opts.bestTimeMs / 1000));
  return Math.max(0, Math.min(100, Math.round(100 * speed - penaltyTotal(opts.assists))));
}

export interface PuzzleMeta {
  id: string;
  difficulty: Difficulty;
}

/**
 * Overall Pixelogic Score in [0,1600]: a difficulty-weighted fraction of the
 * total possible score across `library`. Unsolved puzzles count as 0.
 */
export function pixelogicScore(bestScores: Record<string, number>, library: PuzzleMeta[]): number {
  let earned = 0;
  let possible = 0;
  for (const p of library) {
    const w = DIFFICULTY_WEIGHT[p.difficulty];
    possible += w;
    earned += w * ((bestScores[p.id] ?? 0) / 100);
  }
  return possible > 0 ? Math.round((1600 * earned) / possible) : 0;
}

/** How many "Check square" reveals a tier allows per attempt (∞ on easy/medium). */
export function checkBudget(difficulty: Difficulty): number {
  switch (difficulty) {
    case "hard":
      return 3;
    case "expert":
      return 2;
    case "max":
      return 1;
    default:
      return Infinity;
  }
}

/** A flavour title for a Pixelogic Score, shown beneath the laurel. */
export function scoreTitle(score: number): string {
  if (score >= 1500) return "Grandmaster";
  if (score >= 1350) return "Master";
  if (score >= 1100) return "Expert";
  if (score >= 850) return "Sharp";
  if (score >= 550) return "Solver";
  if (score >= 250) return "Apprentice";
  return "Novice";
}
