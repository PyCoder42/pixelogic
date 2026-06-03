import { describe, it, expect } from "vitest";
import { formatTime, difficultyMeta, sizeLabel } from "../src/ui/format";

describe("formatTime", () => {
  it("formats sub-minute times", () => {
    expect(formatTime(5_000)).toBe("0:05");
  });
  it("formats minutes and seconds", () => {
    expect(formatTime(125_000)).toBe("2:05");
  });
  it("formats hours", () => {
    expect(formatTime(3_725_000)).toBe("1:02:05");
  });
  it("clamps negatives to zero", () => {
    expect(formatTime(-10)).toBe("0:00");
  });
});

describe("difficultyMeta", () => {
  it("maps each difficulty to a label + class", () => {
    expect(difficultyMeta("easy").label).toBe("Easy");
    expect(difficultyMeta("hard").className).toBe("diff-hard");
  });
});

describe("sizeLabel", () => {
  it("formats dimensions", () => {
    expect(sizeLabel(10, 10)).toBe("10 × 10");
  });
});
