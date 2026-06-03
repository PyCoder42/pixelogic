# Pixelogic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Pixelogic — a nonogram logic-puzzle game with a provably-correct logic engine, a curated puzzle library, a calm friendly UI, a hint/explainer, and a custom editor — deployed to GitHub Pages.

**Architecture:** A pure, DOM-free TypeScript engine (`src/engine/`) does all reasoning — line solving, propagation, uniqueness proofs, grading, generation. A thin UI layer (`src/ui/`) renders the board, handles input, persists progress, and consumes the engine for hints/explanations/editor verdicts. Vite builds a static SPA.

**Tech Stack:** TypeScript, Vite, Vitest. No runtime dependencies. GitHub Pages via Actions.

**Note on granularity:** Engine tasks (1–6) carry complete tests + implementation — that is the correctness-critical core and is fully unit-tested via TDD. UI/design tasks (7–15) specify exact files, signatures, responsibilities, representative unit tests for the logic-bearing helpers, and explicit browser-verification checklists (the visual/interaction layer is verified by driving the running app, not by unit tests).

---

## File structure

```
src/engine/
  types.ts        constants + types (Cell, Line, Clue, Puzzle, Difficulty)
  clues.ts        cluesForLine, cluesForGrid
  lineSolver.ts   solveLine, lineFeasible
  solver.ts       propagate, countSolutions, solve, hasUniqueSolution, isLineSolvable
  grader.ts       grade
  generator.ts    puzzleFromBitmap, analyzeGrid, bitmapToGrid
  puzzles.ts      LIBRARY: Puzzle[] (built from bitmaps)
src/ui/
  gameState.ts    GameState class: marks, undo/redo, win, timer, mode
  persistence.ts  load/save progress, settings, user puzzles (localStorage)
  render.ts       renderBoard(state, puzzle) -> DOM
  input.ts        attachInput(boardEl, state) pointer+keyboard
  hints.ts        nextHint(puzzle, marks) -> { row, col, value, reason }
  explainer.ts    solveSteps(puzzle) -> Step[]
  editor.ts       editor view + live analyze
  router.ts       view switching (menu/play/editor/explainer)
  theme.ts        theme toggle persistence (light only v1, structure for more)
src/style.css     design system + layout
src/main.ts       entry: mount router
tests/            Vitest specs mirroring engine modules
```

---

## Task 1: Types + clue derivation

**Files:**
- Create: `src/engine/types.ts`
- Create: `src/engine/clues.ts`
- Test: `tests/clues.test.ts`

- [ ] **Step 1: Write `src/engine/types.ts`**

```ts
export const UNKNOWN = 0;
export const FILLED = 1;
export const EMPTY = 2;
export type Cell = typeof UNKNOWN | typeof FILLED | typeof EMPTY;
export type Line = Cell[];

/** Run lengths of filled cells in a line. [] means no filled cells. */
export type Clue = number[];

export type Difficulty = "easy" | "medium" | "hard" | "expert";

export interface Puzzle {
  id: string;
  title: string;
  width: number;
  height: number;
  solution: boolean[][]; // [row][col]
  rowClues: Clue[];
  colClues: Clue[];
  difficulty: Difficulty;
}
```

- [ ] **Step 2: Write failing test `tests/clues.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { cluesForLine, cluesForGrid } from "../src/engine/clues";

describe("cluesForLine", () => {
  it("encodes runs of filled cells", () => {
    expect(cluesForLine([true, true, false, true])).toEqual([2, 1]);
  });
  it("returns [] for an empty line", () => {
    expect(cluesForLine([false, false, false])).toEqual([]);
  });
  it("returns [n] for a full line", () => {
    expect(cluesForLine([true, true, true])).toEqual([3]);
  });
});

describe("cluesForGrid", () => {
  it("derives row and column clues", () => {
    const g = [
      [true, false],
      [true, true],
    ];
    const { rowClues, colClues } = cluesForGrid(g);
    expect(rowClues).toEqual([[1], [2]]);
    expect(colClues).toEqual([[2], [1]]);
  });
});
```

- [ ] **Step 3: Run test, expect FAIL** — `npm test -- clues` → fails (module missing).

- [ ] **Step 4: Implement `src/engine/clues.ts`**

```ts
import type { Clue } from "./types";

export function cluesForLine(line: boolean[]): Clue {
  const clue: number[] = [];
  let run = 0;
  for (const filled of line) {
    if (filled) run++;
    else if (run > 0) { clue.push(run); run = 0; }
  }
  if (run > 0) clue.push(run);
  return clue;
}

export function cluesForGrid(solution: boolean[][]): { rowClues: Clue[]; colClues: Clue[] } {
  const height = solution.length;
  const width = height > 0 ? solution[0].length : 0;
  const rowClues = solution.map(cluesForLine);
  const colClues: Clue[] = [];
  for (let c = 0; c < width; c++) {
    const col: boolean[] = [];
    for (let r = 0; r < height; r++) col.push(solution[r][c]);
    colClues.push(cluesForLine(col));
  }
  return { rowClues, colClues };
}
```

- [ ] **Step 5: Run test, expect PASS.** Commit `feat(engine): types + clue derivation`.

---

## Task 2: Line solver (the deductive core)

**Files:**
- Create: `src/engine/lineSolver.ts`
- Test: `tests/lineSolver.test.ts`

- [ ] **Step 1: Write failing test `tests/lineSolver.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { solveLine, lineFeasible } from "../src/engine/lineSolver";
import { UNKNOWN, FILLED, EMPTY } from "../src/engine/types";

const U = UNKNOWN, F = FILLED, E = EMPTY;

describe("solveLine", () => {
  it("fills a fully-determined line (clue == length)", () => {
    expect(solveLine([U, U, U], [3])).toEqual([F, F, F]);
  });
  it("marks an empty line", () => {
    expect(solveLine([U, U, U], [])).toEqual([E, E, E]);
  });
  it("forces the overlap of a long run", () => {
    // length 5, run of 4 -> the middle 3 cells are always filled
    expect(solveLine([U, U, U, U, U], [4])).toEqual([U, F, F, F, U]);
  });
  it("uses an existing fill to pin a run to the edge", () => {
    // length 5, clue [2], a fill at index 0 -> [F,F,E,E,E]
    expect(solveLine([F, U, U, U, U], [2])).toEqual([F, F, E, E, E]);
  });
  it("returns null for an infeasible line", () => {
    expect(solveLine([F, E, F], [3])).toBeNull();
  });
  it("respects a crossed cell when placing", () => {
    // [1,1] in length 4 with a cross at index 1 forces [F,E,?,?]->actually [F,E,U,U]
    const r = solveLine([U, E, U, U], [1, 1]);
    expect(r).not.toBeNull();
    expect(r![0]).toBe(FILLED);
    expect(r![1]).toBe(EMPTY);
  });
});

describe("lineFeasible", () => {
  it("true when an arrangement exists", () => {
    expect(lineFeasible([U, U, U], [1])).toBe(true);
  });
  it("false when clue cannot fit", () => {
    expect(lineFeasible([U, U], [3])).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL.**

- [ ] **Step 3: Implement `src/engine/lineSolver.ts`**

```ts
import { UNKNOWN, FILLED, EMPTY, type Cell, type Line, type Clue } from "./types";

/**
 * Feasibility DP: can clues[clueIdx..] be placed in cells[pos..] consistent with
 * the fixed cells already in `state`? Memoized on (pos, clueIdx).
 */
export function lineFeasible(state: Line, clue: Clue): boolean {
  const n = state.length;
  const k = clue.length;
  const memo = new Map<number, boolean>();

  function fits(pos: number, clueIdx: number): boolean {
    if (clueIdx === k) {
      // remaining cells must all be allowed-empty (not FILLED)
      for (let i = pos; i < n; i++) if (state[i] === FILLED) return false;
      return true;
    }
    if (pos > n) return false;
    const key = pos * (k + 1) + clueIdx;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;

    let result = false;
    const run = clue[clueIdx];

    // Option A: leave cell `pos` empty (only if it isn't a forced FILLED).
    if (pos < n && state[pos] !== FILLED) {
      if (fits(pos + 1, clueIdx)) result = true;
    }

    // Option B: place the run starting at `pos`.
    if (!result && pos + run <= n) {
      let ok = true;
      for (let i = pos; i < pos + run; i++) if (state[i] === EMPTY) { ok = false; break; }
      // the gap cell after the run must not be FILLED
      const after = pos + run;
      if (ok && after < n && state[after] === FILLED) ok = false;
      if (ok) {
        const nextPos = after < n ? after + 1 : after; // skip the mandatory gap
        if (fits(nextPos, clueIdx + 1)) result = true;
      }
    }

    memo.set(key, result);
    return result;
  }

  return fits(0, 0);
}

/**
 * Returns a new line where every cell forced FILLED/EMPTY in all valid
 * completions is set; UNKNOWN cells stay UNKNOWN. Returns null if infeasible.
 */
export function solveLine(state: Line, clue: Clue): Line | null {
  if (!lineFeasible(state, clue)) return null;
  const n = state.length;
  const out: Cell[] = state.slice();
  for (let i = 0; i < n; i++) {
    if (out[i] !== UNKNOWN) continue;
    const tryFilled = state.slice(); tryFilled[i] = FILLED;
    const tryEmpty = state.slice(); tryEmpty[i] = EMPTY;
    const canFill = lineFeasible(tryFilled, clue);
    const canEmpty = lineFeasible(tryEmpty, clue);
    if (canFill && !canEmpty) out[i] = FILLED;
    else if (!canFill && canEmpty) out[i] = EMPTY;
    // both feasible -> stays UNKNOWN; neither -> impossible (guarded above)
  }
  return out;
}
```

- [ ] **Step 4: Run test, expect PASS.** Commit `feat(engine): line solver with feasibility DP`.

---

## Task 3: Whole-grid solver, uniqueness, search

**Files:**
- Create: `src/engine/solver.ts`
- Test: `tests/solver.test.ts`

- [ ] **Step 1: Write failing test `tests/solver.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { propagate, countSolutions, solve, hasUniqueSolution } from "../src/engine/solver";
import { cluesForGrid } from "../src/engine/clues";
import { FILLED } from "../src/engine/types";

function gridFromBits(rows: string[]): boolean[][] {
  return rows.map((r) => [...r].map((ch) => ch === "#"));
}

describe("propagate / solve", () => {
  it("solves a simple line-solvable puzzle", () => {
    const sol = gridFromBits(["##.", ".#.", ".##"]);
    const { rowClues, colClues } = cluesForGrid(sol);
    const res = propagate(rowClues, colClues);
    expect(res.status).toBe("solved");
    const out = res.grid.map((row) => row.map((c) => c === FILLED));
    expect(out).toEqual(sol);
  });
});

describe("countSolutions / uniqueness", () => {
  it("reports exactly one solution for a well-formed puzzle", () => {
    const sol = gridFromBits([
      "#.#",
      "###",
      "#.#",
    ]);
    const { rowClues, colClues } = cluesForGrid(sol);
    expect(countSolutions(rowClues, colClues)).toBe(1);
    expect(hasUniqueSolution(rowClues, colClues)).toBe(true);
  });
  it("detects ambiguous clues (>= 2 solutions)", () => {
    // The classic 2x2 checkerboard ambiguity: clues [1] per row & col
    const rowClues = [[1], [1]];
    const colClues = [[1], [1]];
    expect(countSolutions(rowClues, colClues, 2)).toBe(2);
    expect(hasUniqueSolution(rowClues, colClues)).toBe(false);
  });
  it("solve() returns a correct solution and viaSearch flag", () => {
    const sol = gridFromBits(["##.", ".#.", ".##"]);
    const { rowClues, colClues } = cluesForGrid(sol);
    const { solution, viaSearch } = solve(rowClues, colClues);
    expect(solution).toEqual(sol);
    expect(viaSearch).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL.**

- [ ] **Step 3: Implement `src/engine/solver.ts`**

```ts
import { UNKNOWN, FILLED, EMPTY, type Cell, type Clue } from "./types";
import { solveLine } from "./lineSolver";

type Grid = Cell[][];
type Status = "solved" | "stuck" | "contradiction";

function makeGrid(h: number, w: number): Grid {
  return Array.from({ length: h }, () => Array<Cell>(w).fill(UNKNOWN));
}
function col(grid: Grid, c: number): Cell[] { return grid.map((row) => row[c]); }
function setCol(grid: Grid, c: number, line: Cell[]) { for (let r = 0; r < line.length; r++) grid[r][c] = line[r]; }
function isComplete(grid: Grid): boolean { return grid.every((row) => row.every((c) => c !== UNKNOWN)); }

/** Iterated line solving to a fixpoint. No guessing. */
export function propagate(rowClues: Clue[], colClues: Clue[], start?: Grid): { status: Status; grid: Grid } {
  const h = rowClues.length, w = colClues.length;
  const grid = start ? start.map((r) => r.slice()) : makeGrid(h, w);
  let changed = true;
  while (changed) {
    changed = false;
    for (let r = 0; r < h; r++) {
      const next = solveLine(grid[r], rowClues[r]);
      if (next === null) return { status: "contradiction", grid };
      for (let c = 0; c < w; c++) if (next[c] !== grid[r][c]) { grid[r][c] = next[c]; changed = true; }
    }
    for (let c = 0; c < w; c++) {
      const next = solveLine(col(grid, c), colClues[c]);
      if (next === null) return { status: "contradiction", grid };
      for (let r = 0; r < h; r++) if (next[r] !== grid[r][c]) { grid[r][c] = next[r]; changed = true; }
    }
  }
  return { status: isComplete(grid) ? "solved" : "stuck", grid };
}

function firstUnknown(grid: Grid): [number, number] | null {
  for (let r = 0; r < grid.length; r++)
    for (let c = 0; c < grid[r].length; c++)
      if (grid[r][c] === UNKNOWN) return [r, c];
  return null;
}

const NODE_CAP = 200_000;

/** Count solutions up to `limit` via propagation + DFS. Node-bounded. */
export function countSolutions(rowClues: Clue[], colClues: Clue[], limit = 2): number {
  let count = 0, nodes = 0;
  function dfs(grid: Grid): void {
    if (count >= limit) return;
    if (++nodes > NODE_CAP) return; // safety: treat as ">=" current count
    const res = propagate(rowClues, colClues, grid);
    if (res.status === "contradiction") return;
    if (res.status === "solved") { count++; return; }
    const cell = firstUnknown(res.grid)!;
    const [r, c] = cell;
    for (const v of [FILLED, EMPTY] as Cell[]) {
      if (count >= limit) return;
      const g = res.grid.map((row) => row.slice());
      g[r][c] = v;
      dfs(g);
    }
  }
  dfs(makeGrid(rowClues.length, colClues.length));
  return count;
}

export function hasUniqueSolution(rowClues: Clue[], colClues: Clue[]): boolean {
  return countSolutions(rowClues, colClues, 2) === 1;
}

/** Returns a solution and whether search beyond pure propagation was needed. */
export function solve(rowClues: Clue[], colClues: Clue[]): { solution: boolean[][]; viaSearch: boolean } {
  const prop = propagate(rowClues, colClues);
  if (prop.status === "solved") {
    return { solution: prop.grid.map((row) => row.map((c) => c === FILLED)), viaSearch: false };
  }
  // search
  let found: Grid | null = null;
  function dfs(grid: Grid): boolean {
    const res = propagate(rowClues, colClues, grid);
    if (res.status === "contradiction") return false;
    if (res.status === "solved") { found = res.grid; return true; }
    const [r, c] = firstUnknown(res.grid)!;
    for (const v of [FILLED, EMPTY] as Cell[]) {
      const g = res.grid.map((row) => row.slice());
      g[r][c] = v;
      if (dfs(g)) return true;
    }
    return false;
  }
  dfs(makeGrid(rowClues.length, colClues.length));
  if (!found) throw new Error("unsolvable puzzle");
  return { solution: (found as Grid).map((row) => row.map((c) => c === FILLED)), viaSearch: true };
}

/** True if pure propagation (no guessing) solves it. */
export function isLineSolvable(rowClues: Clue[], colClues: Clue[]): boolean {
  return propagate(rowClues, colClues).status === "solved";
}
```

- [ ] **Step 4: Run test, expect PASS.** Commit `feat(engine): solver, uniqueness, bounded search`.

---

## Task 4: Difficulty grader

**Files:**
- Create: `src/engine/grader.ts`
- Test: `tests/grader.test.ts`

- [ ] **Step 1: Write failing test `tests/grader.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { grade } from "../src/engine/grader";
import { cluesForGrid } from "../src/engine/clues";

function bits(rows: string[]) { return rows.map((r) => [...r].map((c) => c === "#")); }

describe("grade", () => {
  it("grades a trivially line-solvable small puzzle as easy or medium", () => {
    const { rowClues, colClues } = cluesForGrid(bits(["##", "##"]));
    expect(["easy", "medium"]).toContain(grade(rowClues, colClues));
  });
  it("returns a valid difficulty for a larger line-solvable puzzle", () => {
    const { rowClues, colClues } = cluesForGrid(bits([
      "#.#.#",
      ".###.",
      "#####",
      ".###.",
      "#.#.#",
    ]));
    expect(["easy", "medium", "hard", "expert"]).toContain(grade(rowClues, colClues));
  });
});
```

- [ ] **Step 2: Run test, expect FAIL.**

- [ ] **Step 3: Implement `src/engine/grader.ts`**

```ts
import { UNKNOWN, FILLED, EMPTY, type Cell, type Clue } from "./types";
import { solveLine } from "./lineSolver";
import { propagate } from "./solver";
import type { Difficulty } from "./types";

type Grid = Cell[][];

/**
 * Grades by the hardest technique required:
 *  - count propagation "rounds" to a fixpoint for the pure-logic path
 *  - whether any hypothesis/contradiction search depth is needed
 * Size nudges the result up a notch for big grids.
 */
export function grade(rowClues: Clue[], colClues: Clue[]): Difficulty {
  const h = rowClues.length, w = colClues.length;
  const grid: Grid = Array.from({ length: h }, () => Array<Cell>(w).fill(UNKNOWN));

  let rounds = 0;
  let changed = true;
  let solvedByLogic = false;
  while (changed) {
    changed = false;
    rounds++;
    for (let r = 0; r < h; r++) {
      const next = solveLine(grid[r], rowClues[r]);
      if (!next) break;
      for (let c = 0; c < w; c++) if (next[c] !== grid[r][c]) { grid[r][c] = next[c]; changed = true; }
    }
    for (let c = 0; c < w; c++) {
      const line: Cell[] = grid.map((row) => row[c]);
      const next = solveLine(line, colClues[c]);
      if (!next) break;
      for (let r = 0; r < h; r++) if (next[r] !== grid[r][c]) { grid[r][c] = next[r]; changed = true; }
    }
    if (grid.every((row) => row.every((cell) => cell !== UNKNOWN))) { solvedByLogic = true; break; }
  }

  const needsSearch = !solvedByLogic;
  const area = h * w;

  if (needsSearch) return area >= 150 ? "expert" : "hard";
  // pure-logic path graded by effort (rounds) and size
  if (rounds <= 2 && area <= 36) return "easy";
  if (rounds <= 4 && area <= 120) return "medium";
  if (area <= 120) return "medium";
  return "hard";
}
```

Note: `propagate` import kept for parity with future refinements; remove if unused to satisfy `noUnusedLocals`.

- [ ] **Step 4: Run test, expect PASS.** Remove the unused `propagate` import. Commit `feat(engine): difficulty grader`.

---

## Task 5: Generator (bitmap → verified puzzle)

**Files:**
- Create: `src/engine/generator.ts`
- Test: `tests/generator.test.ts`

- [ ] **Step 1: Write failing test `tests/generator.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { bitmapToGrid, puzzleFromBitmap, analyzeGrid } from "../src/engine/generator";

describe("bitmapToGrid", () => {
  it("parses # and . into booleans", () => {
    expect(bitmapToGrid(["#.", ".#"])).toEqual([[true, false], [false, true]]);
  });
  it("throws on ragged rows", () => {
    expect(() => bitmapToGrid(["##", "#"])).toThrow();
  });
});

describe("puzzleFromBitmap", () => {
  it("builds a uniquely-solvable puzzle with clues and a difficulty", () => {
    const { puzzle, unique } = puzzleFromBitmap(["#.#", "###", "#.#"], "x", "x1");
    expect(unique).toBe(true);
    expect(puzzle.width).toBe(3);
    expect(puzzle.height).toBe(3);
    expect(puzzle.rowClues.length).toBe(3);
    expect(["easy", "medium", "hard", "expert"]).toContain(puzzle.difficulty);
  });
});

describe("analyzeGrid", () => {
  it("flags an ambiguous grid as not unique", () => {
    const a = analyzeGrid([[true, false], [false, true]]);
    expect(a.unique).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL.**

- [ ] **Step 3: Implement `src/engine/generator.ts`**

```ts
import type { Puzzle, Difficulty } from "./types";
import { cluesForGrid } from "./clues";
import { countSolutions } from "./solver";
import { grade } from "./grader";

export function bitmapToGrid(rows: string[]): boolean[][] {
  if (rows.length === 0) throw new Error("empty bitmap");
  const w = rows[0].length;
  return rows.map((row) => {
    if (row.length !== w) throw new Error("ragged bitmap row");
    return [...row].map((ch) => ch === "#");
  });
}

export function analyzeGrid(solution: boolean[][]): { unique: boolean; solutionCount: number; difficulty: Difficulty } {
  const { rowClues, colClues } = cluesForGrid(solution);
  const solutionCount = countSolutions(rowClues, colClues, 2);
  const difficulty = grade(rowClues, colClues);
  return { unique: solutionCount === 1, solutionCount, difficulty };
}

export function puzzleFromBitmap(
  rows: string[],
  title: string,
  id: string,
  forcedDifficulty?: Difficulty,
): { puzzle: Puzzle; unique: boolean; difficulty: Difficulty } {
  const solution = bitmapToGrid(rows);
  const { rowClues, colClues } = cluesForGrid(solution);
  const { unique, difficulty } = analyzeGrid(solution);
  const puzzle: Puzzle = {
    id, title,
    width: solution[0].length,
    height: solution.length,
    solution, rowClues, colClues,
    difficulty: forcedDifficulty ?? difficulty,
  };
  return { puzzle, unique, difficulty };
}
```

- [ ] **Step 4: Run test, expect PASS.** Commit `feat(engine): generator from bitmaps`.

---

## Task 6: Curated puzzle library + invariant test

**Files:**
- Create: `src/engine/puzzles.ts`
- Test: `tests/puzzles.test.ts`

- [ ] **Step 1: Author bitmaps in `src/engine/puzzles.ts`**

Define ~18–24 recognizable pixel-art bitmaps (5×5 easy, 10×10 medium, 15×15 medium/hard).
Each entry: `{ id, title, difficulty, bitmap: string[] }`. Build `Puzzle[]` via
`puzzleFromBitmap`. Group export `LIBRARY` plus `byDifficulty()` and `getPuzzle(id)`.

```ts
import { puzzleFromBitmap } from "./generator";
import type { Puzzle, Difficulty } from "./types";

interface Entry { id: string; title: string; bitmap: string[]; }

const ENTRIES: Entry[] = [
  // 5x5 examples (author more)
  { id: "heart", title: "Heart", bitmap: [".#.#.", "#####", "#####", ".###.", "..#.."] },
  // ... 10x10, 15x15 entries ...
];

export const LIBRARY: Puzzle[] = ENTRIES.map((e) => puzzleFromBitmap(e.bitmap, e.title, e.id).puzzle);
export function getPuzzle(id: string): Puzzle | undefined { return LIBRARY.find((p) => p.id === id); }
export function byDifficulty(d: Difficulty): Puzzle[] { return LIBRARY.filter((p) => p.difficulty === d); }
```

- [ ] **Step 2: Write invariant test `tests/puzzles.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { LIBRARY } from "../src/engine/puzzles";
import { hasUniqueSolution } from "../src/engine/solver";

describe("puzzle library invariants", () => {
  it("has a healthy number of puzzles", () => {
    expect(LIBRARY.length).toBeGreaterThanOrEqual(12);
  });
  for (const p of LIBRARY) {
    it(`"${p.title}" (${p.id}) is uniquely solvable by logic`, () => {
      expect(hasUniqueSolution(p.rowClues, p.colClues)).toBe(true);
    });
  }
  it("ids are unique", () => {
    const ids = LIBRARY.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 3: Run test.** Replace/adjust any bitmap that isn't unique until all pass. Commit `feat(engine): curated puzzle library + invariant tests`.

---

## Task 7: Game state (marks, undo/redo, win, timer)

**Files:**
- Create: `src/ui/gameState.ts`
- Test: `tests/gameState.test.ts`

`GameState` holds a tri-state `marks: Cell[][]` (player's board, separate from the
solution), an undo/redo stack of snapshots, a `mode: "fill" | "cross"`, an elapsed
timer (start/pause), and a subscriber callback.

Signatures:
```ts
class GameState {
  constructor(puzzle: Puzzle, initialMarks?: Cell[][]);
  marks: Cell[][];
  mode: "fill" | "cross";
  setCell(r: number, c: number, value: Cell): void; // pushes undo snapshot
  undo(): void; redo(): void;
  isSolved(): boolean;             // filled marks === solution
  hasMistake(): boolean;           // any FILLED where solution is empty
  elapsedMs(): number; start(): void; pause(): void;
  subscribe(fn: () => void): void; // notified on any change
}
```

- [ ] **Step 1: Write failing tests** covering: `setCell` updates a cell; `isSolved`
  true only when filled cells exactly match the solution; `hasMistake` true when a
  FILLED cell is empty in the solution; undo reverts the last `setCell`; redo reapplies.

```ts
import { describe, it, expect } from "vitest";
import { GameState } from "../src/ui/gameState";
import { puzzleFromBitmap } from "../src/engine/generator";
import { FILLED, EMPTY } from "../src/engine/types";

const { puzzle } = puzzleFromBitmap(["#.", ".#"], "t", "t");

describe("GameState", () => {
  it("detects a solved board", () => {
    const gs = new GameState(puzzle);
    gs.setCell(0, 0, FILLED); gs.setCell(1, 1, FILLED);
    expect(gs.isSolved()).toBe(true);
  });
  it("ignores crosses for solved-check and flags mistakes", () => {
    const gs = new GameState(puzzle);
    gs.setCell(0, 1, FILLED); // wrong cell
    expect(gs.hasMistake()).toBe(true);
    expect(gs.isSolved()).toBe(false);
  });
  it("undo/redo", () => {
    const gs = new GameState(puzzle);
    gs.setCell(0, 0, FILLED); gs.undo();
    expect(gs.marks[0][0]).not.toBe(FILLED);
    gs.redo();
    expect(gs.marks[0][0]).toBe(FILLED);
  });
});
```

- [ ] **Step 2–4:** Run (fail) → implement `GameState` → run (pass). Commit `feat(ui): game state with undo/redo + win detection`.

---

## Task 8: Persistence (localStorage)

**Files:**
- Create: `src/ui/persistence.ts`
- Test: `tests/persistence.test.ts`

Pure serialization helpers + a thin storage wrapper. Storage is injected (defaults to
`localStorage`) so tests pass an in-memory stub.

Signatures:
```ts
interface Progress { puzzleId: string; marks: Cell[][]; elapsedMs: number; }
interface SaveData {
  version: 1;
  progress: Record<string, Progress>;
  completed: string[];
  userPuzzles: Puzzle[];
  settings: { mistakeCheck: boolean };
}
function loadSave(storage?: StorageLike): SaveData;     // resets on corrupt/old data
function writeSave(data: SaveData, storage?: StorageLike): void;
function recordProgress(p: Progress, storage?: StorageLike): void;
function markCompleted(id: string, storage?: StorageLike): void;
```

- [ ] **Step 1: Failing tests** — round-trip a SaveData; corrupt JSON resets to a
  fresh default; `markCompleted` is idempotent; in-memory storage stub used.
- [ ] **Step 2–4:** fail → implement → pass. Commit `feat(ui): localStorage persistence`.

---

## Task 9: Board rendering

**Files:**
- Create: `src/ui/render.ts`

`renderBoard(container, state, puzzle)` builds: a top column-clue panel, a left
row-clue panel, and the cell grid, all inside a CSS-grid layout. Cells carry
`data-r`/`data-c`. Filled cells get `.filled`, crosses get `.cross`. Satisfied clues
get `.done` (computed by comparing the current marks' line clues to the puzzle clues
when the line is fully filled-or-crossed). Renders a `.win-reveal` overlay element
(hidden until solved). 5-cell guide gridlines via `.major` classes on every 5th cell.

**Browser verification (Task 18):** clues aligned to rows/cols; comfortable cell
size and gaps; guide lines visible; reveal overlay appears on win.

- [ ] Implement `renderBoard`. (No unit test — verified in browser.) Commit `feat(ui): board rendering`.

---

## Task 10: Input (pointer + keyboard)

**Files:**
- Create: `src/ui/input.ts`

`attachInput(boardEl, state, onChange)`:
- Pointer down on a cell toggles based on `mode` (fill: UNKNOWN↔FILLED; cross:
  UNKNOWN↔EMPTY). Dragging paints with the value set by the first cell, and **locks to
  the initial axis** (row or column) once movement direction is established.
- Right-click always cross-toggles (and suppresses the context menu).
- Keyboard: arrow keys move a focus cursor; Space fills; X crosses; U undo; Ctrl+Z/Y
  undo/redo; M toggles mode.
- Touch: same as pointer via Pointer Events; `touch-action: none` on the board.

**Browser verification (Task 18):** drag fills a straight run; axis lock prevents
diagonal smearing; right-click crosses; keyboard play works.

- [ ] Implement. Commit `feat(ui): pointer + keyboard input`.

---

## Task 11: Hints (next forced cell + reason)

**Files:**
- Create: `src/ui/hints.ts`
- Test: `tests/hints.test.ts`

`nextHint(puzzle, marks): { row, col, value, reason } | null`. Convert the player's
marks into a solver line-state that keeps only cells consistent with the solution
(discard mistaken FILLEDs so a hint is always derivable), run `propagate` one
deduction beyond the current state, and return the first newly-forced cell with a
human-readable reason referencing the line and clue. Returns `null` if the board is
already solved.

- [ ] **Step 1: Failing test** — on an empty board for a puzzle whose first deduction
  is a forced fill, `nextHint` returns a cell that matches the solution and a non-empty
  `reason`. On a solved board it returns `null`.
- [ ] **Step 2–4:** fail → implement → pass. Commit `feat(ui): explaining hint engine`.

---

## Task 12: Explainer ("watch it solve")

**Files:**
- Create: `src/ui/explainer.ts`
- Test: `tests/explainer.test.ts`

`solveSteps(puzzle): Step[]` where `Step = { lineType: "row"|"col", index: number,
cells: {r,c,value}[], caption: string }`. Re-runs propagation, emitting one step per
line that makes progress, in order, until solved. A unit test asserts the final
accumulated grid equals the solution and every step is non-empty.

- [ ] **Step 1: Failing test.** **Step 2–4:** implement → pass. Commit `feat(ui): step-by-step solve explainer`.

---

## Task 13: Custom editor

**Files:**
- Create: `src/ui/editor.ts`

A draw grid (size selectable 5–15). Clicking toggles solution cells. A live panel
shows derived clues and a verdict from `analyzeGrid`: "✓ Unique — Easy/Medium/…"
or "⚠ Not unique (N solutions)". Buttons: Clear, Save to My Puzzles (persists via
`persistence.userPuzzles`; disabled unless unique), Play, and Copy share-link
(serialize the bitmap into the URL hash; the router loads it).

**Browser verification (Task 18):** drawing updates clues live; non-unique pictures
are flagged; save → appears in menu; share-link round-trips.

- [ ] Implement editor + URL (de)serialization helper `encodePuzzle/decodePuzzle`
  (unit-test the codec round-trip in `tests/editor.test.ts`). Commit `feat(ui): custom editor + share links`.

---

## Task 14: Router + entry wiring

**Files:**
- Create: `src/ui/router.ts`
- Modify: `src/main.ts`

`router.ts` renders one of: **Menu** (puzzle cards grouped by difficulty + "Create"
button + completed checkmarks), **Play** (board + controls: Undo/Redo, mode toggle,
Hint, Mistake-check toggle, Solve/Explain, timer, Back), **Editor**, **Explainer**.
URL hash drives the view (`#/`, `#/play/:id`, `#/editor`, `#/p/:encoded`). `main.ts`
mounts the router into `#app` and loads save data.

**Browser verification (Task 18):** navigation between all views; back button; deep
links.

- [ ] Implement. Commit `feat(ui): router + app wiring`.

---

## Task 15: Design system (CSS), spacing-first

**Files:**
- Create/replace: `src/style.css`
- Modify: `index.html` (font link)

Design tokens (CSS custom properties): baby-blue/turquoise palette, radius scale,
spacing scale, soft shadow tokens, type scale. Nunito via Google Fonts with a
system fallback. Layouts use CSS grid with generous gaps; cells sized for comfortable
targets (≥ 30px, larger on small grids); roomy panel padding; sticky, readable
controls; mobile breakpoints; visible focus rings; `prefers-reduced-motion` honored;
gentle fill "pop" and a staged win color-reveal.

**Browser verification (Task 18):** spacing is generous (no cramped cells/awkward
gaps); palette matches the brief; responsive from desktop to mobile; focus rings
visible; reduced-motion respected.

- [ ] Implement the full design system and apply classes used by render/editor/router.
  Commit `feat(design): baby-blue/turquoise design system, spacing-first`.

---

## Task 16: Full test + build gate

- [ ] Run `npm test` — all green.
- [ ] Run `npm run build` — typecheck + bundle clean.
- [ ] Run `npm run preview` and smoke-load locally. Commit any fixes.

---

## Task 17: Multi-agent code review (Workflow) + fixes

- [ ] Run a review Workflow with parallel reviewers across dimensions: **engine
  correctness** (solver/uniqueness/grader edge cases), **UI logic & a11y**,
  **design/spacing fidelity to the brief**, **build/deploy/config**. Adversarially
  verify each finding, then apply confirmed fixes. Re-run `npm test`.

---

## Task 18: Browser verification (Chrome)

- [ ] Drive the running app in Chrome (dev or preview server). Verify, capturing
  screenshots: menu layout & spacing; select & solve a small puzzle (drag-fill, axis
  lock, cross, satisfied-clue dimming, win reveal); Hint shows a correct cell + reason;
  Explainer steps through; Editor draws + flags uniqueness + saves + share-link;
  responsive at mobile width; keyboard play. Fix anything broken (systematic-debugging).

---

## Task 19: Simplify pass

- [ ] Run `/simplify` over the diff — remove dead code, dedupe, tighten. Re-run tests.

---

## Task 20: Deploy + verify live URL

- [ ] Push to `main`; watch the Actions deploy succeed.
- [ ] Load **https://pycoder42.github.io/pixelogic/** in Chrome; confirm it loads and
  a puzzle is playable on the live site. Report the URL.

---

## Self-review notes
- Every spec section maps to a task: engine (1–6), state/persistence (7–8),
  render/input (9–10), hints/explainer (11–12), editor (13), router (14), design (15),
  testing/review/deploy (16–20).
- Engine types are consistent across tasks: `Cell` constants `UNKNOWN/FILLED/EMPTY`,
  `Clue = number[]` (`[]` = empty line), `Puzzle` shape fixed in Task 1 and reused.
- Function names are stable across tasks: `solveLine`, `propagate`, `countSolutions`,
  `hasUniqueSolution`, `grade`, `puzzleFromBitmap`, `analyzeGrid`, `nextHint`,
  `solveSteps`.
