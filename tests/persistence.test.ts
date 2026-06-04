import { describe, it, expect } from "vitest";
import {
  loadSave,
  writeSave,
  recordProgress,
  markCompleted,
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

  it("resetProgress clears completion/progress but keeps custom puzzles and settings", () => {
    const s = memStore();
    const { puzzle } = puzzleFromBitmap(["#.", ".#"], "Mine", "mine");
    saveUserPuzzle(puzzle, s);
    setSettings({ mistakeCheck: true }, s);
    recordProgress({ puzzleId: "heart", marks: [[FILLED]], elapsedMs: 5 }, s);
    markCompleted("smiley", s);

    resetProgress(s);

    const data = loadSave(s);
    expect(data.completed).toEqual([]);
    expect(data.progress).toEqual({});
    expect(data.userPuzzles).toHaveLength(1); // kept
    expect(data.settings.mistakeCheck).toBe(true); // kept
  });
});
