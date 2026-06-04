import { describe, it, expect } from "vitest";
import { solveByLogic, isLogicSolvable, deduceStep } from "../src/engine/deduce";
import { findAmbiguity } from "../src/engine/generator";
import { getPuzzle } from "../src/engine/puzzles";
import { cluesForGrid } from "../src/engine/clues";
import { UNKNOWN, type Cell } from "../src/engine/types";

describe("solveByLogic", () => {
  it("solves a line-solvable puzzle with line steps only", () => {
    const plus = getPuzzle("plus")!;
    const { solved, grid, steps } = solveByLogic(plus.rowClues, plus.colClues);
    expect(solved).toBe(true);
    expect(steps.every((s) => s.technique === "line")).toBe(true);
    const asBool = grid.map((row) => row.map((c) => c === 1));
    expect(asBool).toEqual(plus.solution);
  });

  it("solves an Extra-Hard puzzle using a contradiction step", () => {
    const cat = getPuzzle("cat")!;
    const { solved, steps } = solveByLogic(cat.rowClues, cat.colClues);
    expect(solved).toBe(true);
    expect(steps.some((s) => s.technique === "contradiction")).toBe(true);
  });

  it("isLogicSolvable agrees", () => {
    const cat = getPuzzle("cat")!;
    expect(isLogicSolvable(cat.rowClues, cat.colClues)).toBe(true);
  });
});

describe("deduceStep", () => {
  it("returns null when the grid is already solved", () => {
    const plus = getPuzzle("plus")!;
    const grid = plus.solution.map((row) => row.map((b) => (b ? 1 : 2) as Cell));
    expect(deduceStep(plus.rowClues, plus.colClues, grid)).toBeNull();
  });
  it("finds a first deduction from an empty grid", () => {
    const plus = getPuzzle("plus")!;
    const empty: Cell[][] = Array.from({ length: plus.height }, () =>
      Array<Cell>(plus.width).fill(UNKNOWN),
    );
    const step = deduceStep(plus.rowClues, plus.colClues, empty);
    expect(step).not.toBeNull();
    expect(step!.cells.length).toBeGreaterThan(0);
  });
});

describe("findAmbiguity", () => {
  it("locates a differing cell for an ambiguous grid", () => {
    const amb = findAmbiguity([
      [true, false],
      [false, true],
    ]);
    expect(amb).not.toBeNull();
  });
  it("returns null for a uniquely-determined grid", () => {
    const plus = getPuzzle("plus")!;
    expect(findAmbiguity(plus.solution)).toBeNull();
  });
  it("derives clues without throwing for any library puzzle", () => {
    const cat = getPuzzle("cat")!;
    expect(cluesForGrid(cat.solution).rowClues.length).toBe(cat.height);
  });
});
