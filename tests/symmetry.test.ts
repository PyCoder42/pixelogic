import { describe, it, expect } from "vitest";
import { detectSymmetry, isSymmetric } from "../src/engine/symmetry";

function grid(rows: string[]): boolean[][] {
  return rows.map((r) => [...r].map((ch) => ch === "#"));
}

describe("symmetry", () => {
  it("detects a left-right mirror", () => {
    const g = grid(["#.#", "###", "#.#"]);
    const s = detectSymmetry(g);
    expect(s.horizontal).toBe(true);
    expect(isSymmetric(g)).toBe(true);
  });

  it("detects a top-bottom mirror", () => {
    const g = grid(["###", "#..", "###"]);
    expect(detectSymmetry(g).vertical).toBe(true);
  });

  it("detects 180° rotational symmetry without mirror symmetry", () => {
    const g = grid(["#..", "...", "..#"]);
    const s = detectSymmetry(g);
    expect(s.rotational).toBe(true);
    expect(s.horizontal).toBe(false);
    expect(s.vertical).toBe(false);
    expect(isSymmetric(g)).toBe(true);
  });

  it("reports an asymmetric picture", () => {
    const g = grid(["##.", "#..", "..#"]);
    expect(isSymmetric(g)).toBe(false);
    expect(detectSymmetry(g)).toEqual({ horizontal: false, vertical: false, rotational: false });
  });
});
