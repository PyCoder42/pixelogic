import { describe, it, expect } from "vitest";
import {
  loadSave,
  writeSave,
  recordProgress,
  markCompleted,
  recordBestTime,
  getBestTime,
  recordPuzzleScore,
  getPuzzleScore,
  getPixelogicScore,
  wasProgressReset,
  saveUserPuzzle,
  deleteUserPuzzle,
  setSettings,
  isTutorialSeen,
  setTutorialSeen,
  resetProgress,
  defaultSaveData,
  type StorageLike,
} from "../src/ui/persistence";
import { puzzleFromBitmap } from "../src/engine/generator";
import { FILLED, UNKNOWN } from "../src/engine/types";

function memStore(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

describe("persistence", () => {
  it("returns defaults when empty", () => {
    expect(loadSave(memStore())).toEqual(defaultSaveData());
  });

  it("round-trips save data", () => {
    const s = memStore();
    const data = defaultSaveData();
    data.completed.push("heart");
    writeSave(data, s);
    expect(loadSave(s).completed).toEqual(["heart"]);
  });

  it("resets on corrupt JSON", () => {
    const s = memStore();
    s.setItem("pixelogic.save.v1", "{not valid json");
    expect(loadSave(s)).toEqual(defaultSaveData());
  });

  it("migrates the old highlightClues boolean to clueStyle", () => {
    const s = memStore();
    const old = { ...defaultSaveData(), settings: { mistakeCheck: true, showTimer: true, highlightClues: false } };
    s.setItem("pixelogic.save.v1", JSON.stringify(old));
    const loaded = loadSave(s);
    expect(loaded.settings.clueStyle).toBe("none"); // false → no styling
    expect(loaded.settings.mistakeCheck).toBe(true); // other settings preserved
    expect(loaded.settings.autoCross).toBe(false); // new setting gets its default

    const oldOn = { ...defaultSaveData(), settings: { mistakeCheck: false, showTimer: true, highlightClues: true } };
    s.setItem("pixelogic.save.v1", JSON.stringify(oldOn));
    expect(loadSave(s).settings.clueStyle).toBe("grey"); // true → default grey
  });

  it("resets on a wrong version", () => {
    const s = memStore();
    s.setItem("pixelogic.save.v1", JSON.stringify({ version: 99 }));
    expect(loadSave(s)).toEqual(defaultSaveData());
  });

  it("records and clears progress", () => {
    const s = memStore();
    recordProgress({ puzzleId: "heart", marks: [[FILLED, UNKNOWN]], elapsedMs: 1000 }, s);
    expect(loadSave(s).progress["heart"].elapsedMs).toBe(1000);
  });

  it("markCompleted is idempotent and clears progress", () => {
    const s = memStore();
    recordProgress({ puzzleId: "heart", marks: [[FILLED]], elapsedMs: 5 }, s);
    markCompleted("heart", s);
    markCompleted("heart", s);
    const data = loadSave(s);
    expect(data.completed).toEqual(["heart"]);
    expect(data.progress["heart"]).toBeUndefined();
  });

  it("saves, updates and deletes user puzzles", () => {
    const s = memStore();
    const { puzzle } = puzzleFromBitmap(["#.", ".#"], "Mine", "mine");
    saveUserPuzzle(puzzle, s);
    expect(loadSave(s).userPuzzles).toHaveLength(1);
    saveUserPuzzle({ ...puzzle, title: "Renamed" }, s); // update, not duplicate
    expect(loadSave(s).userPuzzles).toHaveLength(1);
    expect(loadSave(s).userPuzzles[0].title).toBe("Renamed");
    deleteUserPuzzle("mine", s);
    expect(loadSave(s).userPuzzles).toHaveLength(0);
  });

  it("updates settings", () => {
    const s = memStore();
    const settings = setSettings({ mistakeCheck: true }, s);
    expect(settings.mistakeCheck).toBe(true);
    expect(loadSave(s).settings.mistakeCheck).toBe(true);
  });

  it("tracks the tutorial-seen flag", () => {
    const s = memStore();
    expect(isTutorialSeen(s)).toBe(false);
    setTutorialSeen(true, s);
    expect(isTutorialSeen(s)).toBe(true);
  });

  it("resetProgress clears completion/progress/best times but keeps custom puzzles and settings", () => {
    const s = memStore();
    const { puzzle } = puzzleFromBitmap(["#.", ".#"], "Mine", "mine");
    saveUserPuzzle(puzzle, s);
    setSettings({ mistakeCheck: true }, s);
    recordProgress({ puzzleId: "heart", marks: [[FILLED]], elapsedMs: 5 }, s);
    markCompleted("smiley", s);
    recordBestTime("smiley", 4200, s);
    recordPuzzleScore("smiley", 88, s);

    resetProgress(s);

    const data = loadSave(s);
    expect(data.completed).toEqual([]);
    expect(data.progress).toEqual({});
    expect(data.bestTimes).toEqual({});
    expect(data.bestScores).toEqual({});
    expect(data.progressReset).toBe(true); // disclosed when sharing a score
    expect(data.userPuzzles).toHaveLength(1); // kept
    expect(data.settings.mistakeCheck).toBe(true); // kept
  });

  it("records the best per-puzzle score and computes a Pixelogic Score", () => {
    const s = memStore();
    expect(getPuzzleScore("heart", s)).toBeUndefined();
    expect(wasProgressReset(s)).toBe(false);

    expect(recordPuzzleScore("heart", 70, s)).toEqual({ best: 70, isNew: true });
    expect(recordPuzzleScore("heart", 60, s)).toEqual({ best: 70, isNew: false }); // keeps max
    expect(recordPuzzleScore("heart", 95, s)).toEqual({ best: 95, isNew: true });
    expect(getPuzzleScore("heart", s)).toBe(95);

    // A real library id contributes to the overall rating (0 with nothing solved).
    expect(getPixelogicScore(memStore())).toBe(0);
    expect(getPixelogicScore(s)).toBeGreaterThan(0);
  });

  it("records only the fastest best time and reports new records", () => {
    const s = memStore();
    expect(getBestTime("heart", s)).toBeUndefined();

    const first = recordBestTime("heart", 9000, s);
    expect(first).toEqual({ best: 9000, isNew: true });
    expect(getBestTime("heart", s)).toBe(9000);

    const slower = recordBestTime("heart", 12000, s);
    expect(slower).toEqual({ best: 9000, isNew: false }); // not improved
    expect(getBestTime("heart", s)).toBe(9000);

    const faster = recordBestTime("heart", 7000, s);
    expect(faster).toEqual({ best: 7000, isNew: true });
    expect(getBestTime("heart", s)).toBe(7000);
  });
});
