import { describe, it, expect } from "vitest";
import {
  parSeconds,
  puzzleScore,
  pixelogicScore,
  penaltyTotal,
  emptyTally,
  checkBudget,
  scoreTitle,
  DIFFICULTY_WEIGHT,
} from "../src/engine/scoring";
import type { AssistTally } from "../src/engine/scoring";

const clean = (): AssistTally => emptyTally();

describe("parSeconds", () => {
  it("scales with area and tier", () => {
    expect(parSeconds("easy", 25)).toBe(25); // 25 * 1.0
    expect(parSeconds("medium", 100)).toBe(150); // 100 * 1.5
    expect(parSeconds("max", 196)).toBe(882); // 196 * 4.5
  });
});

describe("puzzleScore", () => {
  it("awards 100 for solving at or under par with no assists", () => {
    const par = parSeconds("easy", 25) * 1000; // ms
    expect(puzzleScore({ difficulty: "easy", area: 25, bestTimeMs: par, assists: clean() })).toBe(100);
    expect(puzzleScore({ difficulty: "easy", area: 25, bestTimeMs: par / 2, assists: clean() })).toBe(100);
  });

  it("halves the speed credit at twice par", () => {
    const par = parSeconds("medium", 100) * 1000;
    expect(puzzleScore({ difficulty: "medium", area: 100, bestTimeMs: par * 2, assists: clean() })).toBe(50);
  });

  it("subtracts assist penalties", () => {
    const par = parSeconds("hard", 100) * 1000;
    const assists: AssistTally = { checkSquare: 2, checkLine: 1, checkBoard: 0, hint: 1, voided: false };
    // 100 - (2*5 + 1*15 + 0 + 1*20) = 100 - 45 = 55
    expect(penaltyTotal(assists)).toBe(45);
    expect(puzzleScore({ difficulty: "hard", area: 100, bestTimeMs: par, assists })).toBe(55);
  });

  it("voids the score when fill-out / watch-solve was used", () => {
    const par = parSeconds("easy", 25) * 1000;
    expect(
      puzzleScore({ difficulty: "easy", area: 25, bestTimeMs: par, assists: { ...clean(), voided: true } }),
    ).toBe(0);
  });

  it("never goes below 0", () => {
    const par = parSeconds("easy", 25) * 1000;
    const assists: AssistTally = { checkSquare: 0, checkLine: 0, checkBoard: 3, hint: 0, voided: false };
    expect(puzzleScore({ difficulty: "easy", area: 25, bestTimeMs: par, assists })).toBe(0);
  });
});

describe("pixelogicScore", () => {
  const lib = [
    { id: "e", difficulty: "easy" as const },
    { id: "x", difficulty: "expert" as const },
  ];
  it("is 0 with nothing solved and 1600 with everything perfect", () => {
    expect(pixelogicScore({}, lib)).toBe(0);
    expect(pixelogicScore({ e: 100, x: 100 }, lib)).toBe(1600);
  });
  it("weights harder puzzles more", () => {
    // only the easy puzzle perfect: weight 1 of (1+7) => 1600*1/8 = 200
    expect(pixelogicScore({ e: 100 }, lib)).toBe(200);
    // only the expert puzzle perfect: weight 7 of 8 => 1400
    expect(pixelogicScore({ x: 100 }, lib)).toBe(1400);
  });
  it("uses the documented weights", () => {
    expect(DIFFICULTY_WEIGHT).toEqual({ easy: 1, medium: 2, hard: 4, expert: 7, max: 12 });
  });
  it("badge multipliers shift a puzzle's share without breaking the 1600 ceiling", () => {
    const badged = [
      { id: "e", difficulty: "easy" as const, weightMult: 0.5 }, // easier-badged: worth half
      { id: "x", difficulty: "expert" as const },
    ];
    // perfect everywhere is still a perfect 1600 (both sides scale together)
    expect(pixelogicScore({ e: 100, x: 100 }, badged)).toBe(1600);
    // the badged easy is now 0.5 of 7.5 total → 1600*0.5/7.5 ≈ 107 (vs 200 unbadged)
    expect(pixelogicScore({ e: 100 }, badged)).toBe(Math.round((1600 * 0.5) / 7.5));
  });
});

describe("checkBudget", () => {
  it("tightens with difficulty", () => {
    expect(checkBudget("easy")).toBe(Infinity);
    expect(checkBudget("medium")).toBe(Infinity);
    expect(checkBudget("hard")).toBe(3);
    expect(checkBudget("expert")).toBe(2);
    expect(checkBudget("max")).toBe(1);
  });
});

describe("scoreTitle", () => {
  it("bands the rating", () => {
    expect(scoreTitle(0)).toBe("Novice");
    expect(scoreTitle(300)).toBe("Apprentice");
    expect(scoreTitle(900)).toBe("Sharp");
    expect(scoreTitle(1600)).toBe("Grandmaster");
  });
});
