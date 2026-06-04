import type { Cell, Puzzle } from "../engine/types";

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
  userPuzzles: Puzzle[];
  settings: Settings;
  tutorialSeen: boolean;
}

const KEY = "pixelogic.save.v1";

export function defaultSaveData(): SaveData {
  return {
    version: 1,
    progress: {},
    completed: [],
    userPuzzles: [],
    settings: { mistakeCheck: false, showTimer: true, highlightClues: true },
    tutorialSeen: false,
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
      userPuzzles: Array.isArray(parsed.userPuzzles) ? parsed.userPuzzles : base.userPuzzles,
      settings: { ...base.settings, ...(parsed.settings ?? {}) },
      tutorialSeen: parsed.tutorialSeen === true,
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
  writeSave(data, storage);
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

/** Danger zone: wipe solved/in-progress state. Keeps custom puzzles and settings. */
export function resetProgress(storage: StorageLike = getStorage()): void {
  const data = loadSave(storage);
  data.progress = {};
  data.completed = [];
  writeSave(data, storage);
}
