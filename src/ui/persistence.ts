import type { Cell, Puzzle } from "../engine/types";
import { LIBRARY } from "../engine/puzzles";
import { pixelogicScore, type AssistTally } from "../engine/scoring";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface Progress {
  puzzleId: string;
  marks: Cell[][];
  elapsedMs: number;
}

export interface Settings {
  mistakeCheck: boolean;
  showTimer: boolean;
  highlightClues: boolean;
}

export interface SaveData {
  version: 1;
  progress: Record<string, Progress>;
  completed: string[];
  /** Fastest solve time (ms) per puzzle id. */
  bestTimes: Record<string, number>;
  /** Best per-puzzle score (0–100) per puzzle id. */
  bestScores: Record<string, number>;
  /** Assists used in the current (in-progress) attempt, per puzzle id. */
  assists: Record<string, AssistTally>;
  userPuzzles: Puzzle[];
  settings: Settings;
  tutorialSeen: boolean;
  /** True once progress has ever been wiped — disclosed when sharing a score. */
  progressReset: boolean;
}

const KEY = "pixelogic.save.v1";

export function defaultSaveData(): SaveData {
  return {
    version: 1,
    progress: {},
    completed: [],
    bestTimes: {},
    bestScores: {},
    assists: {},
    userPuzzles: [],
    settings: { mistakeCheck: false, showTimer: true, highlightClues: true },
    tutorialSeen: false,
    progressReset: false,
  };
}

/** An in-memory fallback used when localStorage is unavailable (e.g. tests, SSR). */
class MemoryStorage implements StorageLike {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

let fallback: StorageLike | null = null;

export function getStorage(): StorageLike {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    /* access can throw in sandboxed iframes */
  }
  if (!fallback) fallback = new MemoryStorage();
  return fallback;
}

/** Load save data, resetting to defaults on missing/corrupt/old-version data. */
export function loadSave(storage: StorageLike = getStorage()): SaveData {
  const raw = storage.getItem(KEY);
  if (!raw) return defaultSaveData();
  try {
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    if (!parsed || parsed.version !== 1) return defaultSaveData();
    const base = defaultSaveData();
    return {
      version: 1,
      progress: parsed.progress ?? base.progress,
      completed: Array.isArray(parsed.completed) ? parsed.completed : base.completed,
      bestTimes:
        parsed.bestTimes && typeof parsed.bestTimes === "object"
          ? (parsed.bestTimes as Record<string, number>)
          : base.bestTimes,
      bestScores:
        parsed.bestScores && typeof parsed.bestScores === "object"
          ? (parsed.bestScores as Record<string, number>)
          : base.bestScores,
      assists:
        parsed.assists && typeof parsed.assists === "object"
          ? (parsed.assists as Record<string, AssistTally>)
          : base.assists,
      userPuzzles: Array.isArray(parsed.userPuzzles) ? parsed.userPuzzles : base.userPuzzles,
      settings: { ...base.settings, ...(parsed.settings ?? {}) },
      tutorialSeen: parsed.tutorialSeen === true,
      progressReset: parsed.progressReset === true,
    };
  } catch {
    return defaultSaveData();
  }
}

export function writeSave(data: SaveData, storage: StorageLike = getStorage()): void {
  try {
    storage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* quota errors etc. are non-fatal — the game still works in-memory */
  }
}

export function recordProgress(progress: Progress, storage: StorageLike = getStorage()): void {
  const data = loadSave(storage);
  data.progress[progress.puzzleId] = progress;
  writeSave(data, storage);
}

export function clearProgress(puzzleId: string, storage: StorageLike = getStorage()): void {
  const data = loadSave(storage);
  delete data.progress[puzzleId];
  writeSave(data, storage);
}

export function markCompleted(id: string, storage: StorageLike = getStorage()): void {
  const data = loadSave(storage);
  if (!data.completed.includes(id)) data.completed.push(id);
  delete data.progress[id];
  delete data.assists[id];
  writeSave(data, storage);
}

/** Record a solve time, keeping only the fastest. Returns the best time and
 *  whether this solve set a new record. */
export function recordBestTime(
  id: string,
  elapsedMs: number,
  storage: StorageLike = getStorage(),
): { best: number; isNew: boolean } {
  const data = loadSave(storage);
  const prev = data.bestTimes[id];
  const isNew = prev === undefined || elapsedMs < prev;
  if (isNew) {
    data.bestTimes[id] = elapsedMs;
    writeSave(data, storage);
    return { best: elapsedMs, isNew: true };
  }
  return { best: prev, isNew: false };
}

export function getBestTime(id: string, storage: StorageLike = getStorage()): number | undefined {
  return loadSave(storage).bestTimes[id];
}

/** Record a per-puzzle score (0–100), keeping the best. Returns the kept best
 *  and whether this beat the previous record. */
export function recordPuzzleScore(
  id: string,
  score: number,
  storage: StorageLike = getStorage(),
): { best: number; isNew: boolean } {
  const data = loadSave(storage);
  const prev = data.bestScores[id];
  const isNew = prev === undefined || score > prev;
  if (isNew) {
    data.bestScores[id] = score;
    writeSave(data, storage);
    return { best: score, isNew: true };
  }
  return { best: prev, isNew: false };
}

export function getPuzzleScore(id: string, storage: StorageLike = getStorage()): number | undefined {
  return loadSave(storage).bestScores[id];
}

/** The overall Pixelogic Score (0–1600) across the built-in library. */
export function getPixelogicScore(storage: StorageLike = getStorage()): number {
  const best = loadSave(storage).bestScores;
  return pixelogicScore(best, LIBRARY.map((p) => ({ id: p.id, difficulty: p.difficulty })));
}

export function wasProgressReset(storage: StorageLike = getStorage()): boolean {
  return loadSave(storage).progressReset;
}

export function getAssists(id: string, storage: StorageLike = getStorage()): AssistTally | undefined {
  return loadSave(storage).assists[id];
}

export function setAssists(id: string, tally: AssistTally, storage: StorageLike = getStorage()): void {
  const data = loadSave(storage);
  data.assists[id] = tally;
  writeSave(data, storage);
}

export function clearAssists(id: string, storage: StorageLike = getStorage()): void {
  const data = loadSave(storage);
  if (data.assists[id]) {
    delete data.assists[id];
    writeSave(data, storage);
  }
}

export function saveUserPuzzle(puzzle: Puzzle, storage: StorageLike = getStorage()): void {
  const data = loadSave(storage);
  const idx = data.userPuzzles.findIndex((p) => p.id === puzzle.id);
  if (idx >= 0) data.userPuzzles[idx] = puzzle;
  else data.userPuzzles.push(puzzle);
  writeSave(data, storage);
}

export function deleteUserPuzzle(id: string, storage: StorageLike = getStorage()): void {
  const data = loadSave(storage);
  data.userPuzzles = data.userPuzzles.filter((p) => p.id !== id);
  writeSave(data, storage);
}

export function setSettings(patch: Partial<Settings>, storage: StorageLike = getStorage()): Settings {
  const data = loadSave(storage);
  data.settings = { ...data.settings, ...patch };
  writeSave(data, storage);
  return data.settings;
}

export function getSettings(storage: StorageLike = getStorage()): Settings {
  return loadSave(storage).settings;
}

export function isTutorialSeen(storage: StorageLike = getStorage()): boolean {
  return loadSave(storage).tutorialSeen;
}

export function setTutorialSeen(seen: boolean, storage: StorageLike = getStorage()): void {
  const data = loadSave(storage);
  data.tutorialSeen = seen;
  writeSave(data, storage);
}

/** Danger zone: wipe solved/in-progress state and records. Keeps custom puzzles and
 *  settings. Sets a permanent flag so a shared Pixelogic Score can disclose the reset. */
export function resetProgress(storage: StorageLike = getStorage()): void {
  const data = loadSave(storage);
  data.progress = {};
  data.completed = [];
  data.bestTimes = {};
  data.bestScores = {};
  data.assists = {};
  data.progressReset = true;
  writeSave(data, storage);
}
