import { describe, it, expect } from "vitest";
import { GameState } from "../src/ui/gameState";
import { puzzleFromBitmap } from "../src/engine/generator";
import { FILLED, EMPTY, UNKNOWN } from "../src/engine/types";

const { puzzle } = puzzleFromBitmap(["#.", ".#"], "T", "t");

describe("GameState", () => {
  it("detects a solved board", () => {
    const gs = new GameState(puzzle);
    expect(gs.isSolved()).toBe(false);
    gs.setCell(0, 0, FILLED);
    gs.setCell(1, 1, FILLED);
    expect(gs.isSolved()).toBe(true);
  });

  it("ignores crosses for solved-check", () => {
    const gs = new GameState(puzzle);
    gs.setCell(0, 0, FILLED);
    gs.setCell(1, 1, FILLED);
    gs.setCell(0, 1, EMPTY); // a cross on a correctly-empty cell
    gs.setCell(1, 0, EMPTY);
    expect(gs.isSolved()).toBe(true);
  });

  it("flags a mistake when a filled mark is on an empty cell", () => {
    const gs = new GameState(puzzle);
    gs.setCell(0, 1, FILLED); // wrong
    expect(gs.hasMistake()).toBe(true);
    expect(gs.isSolved()).toBe(false);
    expect(gs.mistakes()).toEqual([[0, 1]]);
  });

  it("supports undo and redo per stroke", () => {
    const gs = new GameState(puzzle);
    gs.setCell(0, 0, FILLED);
    expect(gs.canUndo()).toBe(true);
    gs.undo();
    expect(gs.marks[0][0]).toBe(UNKNOWN);
    expect(gs.canRedo()).toBe(true);
    gs.redo();
    expect(gs.marks[0][0]).toBe(FILLED);
  });

  it("groups a drag stroke into a single undo", () => {
    const gs = new GameState(puzzle);
    gs.setCell(0, 0, FILLED, true); // stroke start
    gs.setCell(1, 1, FILLED, false); // stroke continuation
    gs.undo();
    expect(gs.marks[0][0]).toBe(UNKNOWN);
    expect(gs.marks[1][1]).toBe(UNKNOWN);
  });

  it("notifies subscribers on change", () => {
    const gs = new GameState(puzzle);
    let count = 0;
    gs.subscribe(() => count++);
    gs.setCell(0, 0, FILLED);
    gs.toggleMode();
    expect(count).toBe(2);
  });

  it("does not record history for a no-op set", () => {
    const gs = new GameState(puzzle);
    gs.setCell(0, 0, UNKNOWN); // already unknown
    expect(gs.canUndo()).toBe(false);
  });

  it("batch applies many changes as one undo and one notification", () => {
    const gs = new GameState(puzzle);
    let notifications = 0;
    gs.subscribe(() => notifications++);
    gs.batch(true, () => {
      gs.setCell(0, 0, FILLED, false);
      gs.setCell(1, 1, FILLED, false);
    });
    expect(notifications).toBe(1); // single notify for the whole batch
    expect(gs.isSolved()).toBe(true);
    gs.undo(); // one undo reverts the whole batch
    expect(gs.marks[0][0]).toBe(UNKNOWN);
    expect(gs.marks[1][1]).toBe(UNKNOWN);
  });
});
