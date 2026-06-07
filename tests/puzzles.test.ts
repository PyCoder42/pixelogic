import { describe, it, expect } from "vitest";
import { LIBRARY, getPuzzle, byDifficulty } from "../src/engine/puzzles";
import { hasUniqueSolution, isLineSolvable, solve } from "../src/engine/solver";
import { isLogicSolvable } from "../src/engine/deduce";
import { isSymmetric } from "../src/engine/symmetry";

describe("puzzle library invariants", () => {
  it("ships a healthy number of puzzles", () => {
    expect(LIBRARY.length).toBeGreaterThanOrEqual(20);
  });

  it("has unique ids", () => {
    const ids = LIBRARY.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers every difficulty tier", () => {
    expect(byDifficulty("easy").length).toBeGreaterThan(0);
    expect(byDifficulty("medium").length).toBeGreaterThan(0);
    expect(byDifficulty("hard").length).toBeGreaterThan(0);
    expect(byDifficulty("expert").length).toBeGreaterThan(0);
    expect(byDifficulty("max").length).toBeGreaterThan(0);
  });

  for (const p of LIBRARY) {
    describe(`"${p.title}" (${p.id})`, () => {
      it("has exactly one solution", () => {
        expect(hasUniqueSolution(p.rowClues, p.colClues)).toBe(true);
      });
      it("is solvable by logic and obeys its tier's rules", () => {
        const lineSolvable = isLineSolvable(p.rowClues, p.colClues);
        // Every puzzle is solvable without guessing (line logic + depth-1 contradiction).
        expect(isLogicSolvable(p.rowClues, p.colClues)).toBe(true);
        if (p.difficulty === "easy" || p.difficulty === "medium") {
          expect(lineSolvable).toBe(true); // pure line logic
        }
        if (p.difficulty === "expert" || p.difficulty === "max") {
          // Extra Hard / Max genuinely need contradiction, and are never symmetric
          // (a symmetric picture is capped at Hard).
          expect(lineSolvable).toBe(false);
          expect(isSymmetric(p.solution)).toBe(false);
        }
      });
      it("the engine's solution matches the stored picture", () => {
        const { solution } = solve(p.rowClues, p.colClues);
        expect(solution).toEqual(p.solution);
      });
      it("clue counts match the grid dimensions", () => {
        expect(p.rowClues.length).toBe(p.height);
        expect(p.colClues.length).toBe(p.width);
      });
    });
  }
});

describe("getPuzzle", () => {
  it("finds a known puzzle", () => {
    expect(getPuzzle("heart")?.title).toBe("Heart");
  });
  it("returns undefined for an unknown id", () => {
    expect(getPuzzle("nope")).toBeUndefined();
  });
});
