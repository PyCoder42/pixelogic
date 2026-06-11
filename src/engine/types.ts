// Core types for the Pixelogic logic engine. Pure data — no DOM, no side effects.

/** Tri-state cell used by the solver. */
export const UNKNOWN = 0;
export const FILLED = 1;
export const EMPTY = 2;
export type Cell = typeof UNKNOWN | typeof FILLED | typeof EMPTY;
export type Line = Cell[];

/** Run lengths of consecutive filled cells in a line. `[]` means no filled cells. */
export type Clue = number[];

/** `expert` is shown as "Extra Hard"; `max` is the curated, brutal top tier. */
export type Difficulty = "easy" | "medium" | "hard" | "expert" | "max";

export interface Puzzle {
  id: string;
  title: string;
  width: number;
  height: number;
  /** The intended solution as booleans, indexed `[row][col]`. */
  solution: boolean[][];
  rowClues: Clue[];
  colClues: Clue[];
  difficulty: Difficulty;
  /** Optional flavour note explaining the title (shown after solving). */
  note?: string;
  /** True when the title plainly describes the picture (earns the Name-hint badge). */
  named?: boolean;
}
