import { describe, it, expect } from "vitest";
import {
  detectPatterned,
  symmetryDetail,
  puzzleBadges,
  badgeWeightMultiplier,
  BADGE_INFO,
} from "../src/engine/badges";

function grid(rows: string[]): boolean[][] {
  return rows.map((r) => [...r].map((ch) => ch === "#"));
}

describe("detectPatterned", () => {
  it("flags a diamond (one run per row and column)", () => {
    const diamond = grid(["..#..", ".###.", "#####", ".###.", "..#.."]);
    expect(detectPatterned(diamond)).toBe(true);
  });
  it("rejects a heart (rows with two runs)", () => {
    const heart = grid([".#.#.", "#####", "#####", ".###.", "..#.."]);
    expect(detectPatterned(heart)).toBe(false);
  });
  it("rejects a frame (columns with two runs)", () => {
    const frame = grid(["#####", "#...#", "#####"]);
    expect(detectPatterned(frame)).toBe(false);
  });
});

describe("symmetryDetail", () => {
  it("distinguishes horizontal, vertical, both, and 180°", () => {
    expect(symmetryDetail(grid(["#.#", "###", "..."]))).toBe("H");
    expect(symmetryDetail(grid(["##.", "...", "##."]))).toBe("V");
    expect(symmetryDetail(grid(["#.#", "...", "#.#"]))).toBe("H+V");
    expect(symmetryDetail(grid(["#..", "...", "..#"]))).toBe("180°");
    expect(symmetryDetail(grid(["#..", "#..", ".##"]))).toBeNull();
  });
});

describe("puzzleBadges", () => {
  it("collects symmetric (with detail), named, and patterned", () => {
    const diamond = grid(["..#..", ".###.", "#####", ".###.", "..#.."]);
    const badges = puzzleBadges({ solution: diamond, named: true });
    const keys = badges.map((b) => b.key).sort();
    expect(keys).toEqual(["named", "patterned", "symmetric"]);
    const sym = badges.find((b) => b.key === "symmetric")!;
    expect(sym.label).toContain("H+V");
  });

  it("returns nothing for an asymmetric, unnamed, multi-run picture", () => {
    const messy = grid(["##.", "#.#", "..#"]);
    expect(puzzleBadges({ solution: messy })).toEqual([]);
  });
});

describe("badgeWeightMultiplier", () => {
  it("multiplies the badge weights together (1 with no badges)", () => {
    expect(badgeWeightMultiplier([])).toBe(1);
    const diamond = grid(["..#..", ".###.", "#####", ".###.", "..#.."]);
    const badges = puzzleBadges({ solution: diamond, named: true });
    const expected =
      BADGE_INFO.symmetric.multiplier * BADGE_INFO.named.multiplier * BADGE_INFO.patterned.multiplier;
    expect(badgeWeightMultiplier(badges)).toBeCloseTo(expected, 10);
  });
});
