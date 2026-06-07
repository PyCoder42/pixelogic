import { describe, it, expect } from "vitest";
import { grade, gradeGrid } from "../src/engine/grader";
import { cluesForGrid } from "../src/engine/clues";
import { isLineSolvable } from "../src/engine/solver";
import { isSymmetric } from "../src/engine/symmetry";

function bits(rows: string[]) {
  return rows.map((r) => [...r].map((c) => c === "#"));
}

const DIFFS = ["easy", "medium", "hard", "expert"] as const;

describe("grade", () => {
  it("grades a trivially line-solvable small puzzle as easy or medium", () => {
    const { rowClues, colClues } = cluesForGrid(bits(["##", "##"]));
    expect(["easy", "medium"]).toContain(grade(rowClues, colClues));
  });

  it("returns a valid difficulty for a larger line-solvable puzzle", () => {
    const { rowClues, colClues } = cluesForGrid(
      bits(["#.#.#", ".###.", "#####", ".###.", "#.#.#"]),
    );
    expect(DIFFS).toContain(grade(rowClues, colClues));
  });

  it("classifies a non-line-solvable puzzle as hard or expert", () => {
    // checkerboard ambiguity is not line-solvable
    const rowClues = [[1], [1]];
    const colClues = [[1], [1]];
    expect(["hard", "expert"]).toContain(grade(rowClues, colClues));
  });
});

describe("gradeGrid", () => {
  it("caps a symmetric contradiction picture at hard", () => {
    // Letter A is left-right symmetric AND needs contradiction reasoning. The
    // base grader calls it expert; the symmetry rule caps it at hard.
    const letterA = bits([".###.", "#...#", "#####", "#...#", "#...#"]);
    const { rowClues, colClues } = cluesForGrid(letterA);
    expect(isSymmetric(letterA)).toBe(true);
    expect(isLineSolvable(rowClues, colClues)).toBe(false);
    expect(grade(rowClues, colClues)).toBe("expert");
    expect(gradeGrid(letterA)).toBe("hard");
  });

  it("leaves an asymmetric line-solvable picture below expert", () => {
    const cornerBlock = bits(["###..", "###..", "###..", ".....", "....."]);
    expect(isSymmetric(cornerBlock)).toBe(false);
    expect(["easy", "medium", "hard"]).toContain(gradeGrid(cornerBlock));
  });
});
