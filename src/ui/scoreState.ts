// Per-attempt assist ledger for a single puzzle: tracks the penalties accrued
// this attempt and the remaining "check square" budget, persisting for library
// puzzles so penalties survive navigating away and back.

import type { Difficulty } from "../engine/types";
import { type AssistTally, emptyTally, penaltyTotal, checkBudget } from "../engine/scoring";
import { getAssists, setAssists, clearAssists } from "./persistence";

export class ScoreState {
  private tally: AssistTally;

  constructor(
    private readonly id: string,
    private readonly difficulty: Difficulty,
    /** Persist across sessions (true for built-in library puzzles only). */
    private readonly persist: boolean,
  ) {
    this.tally = persist ? getAssists(id) ?? emptyTally() : emptyTally();
  }

  tally_(): AssistTally {
    return { ...this.tally };
  }

  penalty(): number {
    return penaltyTotal(this.tally);
  }

  voided(): boolean {
    return this.tally.voided;
  }

  /** Remaining "check square" reveals (Infinity on easy/medium). */
  squaresLeft(): number {
    return checkBudget(this.difficulty) - this.tally.checkSquare;
  }

  canCheckSquare(): boolean {
    return this.squaresLeft() > 0;
  }

  useCheckSquare(): boolean {
    if (!this.canCheckSquare()) return false;
    this.tally.checkSquare++;
    this.save();
    return true;
  }
  useCheckLine(): void {
    this.tally.checkLine++;
    this.save();
  }
  useCheckBoard(): void {
    this.tally.checkBoard++;
    this.save();
  }
  useHint(): void {
    this.tally.hint++;
    this.save();
  }
  /** Fill-out or Watch-solve: the attempt can no longer score. */
  voidAttempt(): void {
    this.tally.voided = true;
    this.save();
  }

  reset(): void {
    this.tally = emptyTally();
    if (this.persist) clearAssists(this.id);
  }

  /** Drop the persisted ledger once the puzzle is solved + scored. */
  finish(): void {
    if (this.persist) clearAssists(this.id);
  }

  private save(): void {
    if (this.persist) setAssists(this.id, this.tally);
  }
}
