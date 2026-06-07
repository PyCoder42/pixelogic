# Pixelogic v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use checkbox (`- [ ]`) syntax. TDD for pure engine/persistence; smoke-test for UI.

**Goal:** Deliver the 21-point v2: a 0–1,600 Pixelogic Score, per-puzzle scoring with tiered assist penalties, a 5-tier difficulty system with symmetry capping, larger/curated Extra Hard + Max content, slowed/explained watch-solve, a robust tutorial, richer sharing + link previews, and home/play UI for all of it.

**Architecture:** Pure, unit-tested engine modules (`scoring.ts`, `symmetry.ts`) feed DOM-free data into the existing view layer. Scoring/penalty state lives per play-attempt in `play.ts` and persists via `persistence.ts`. Difficulty becomes a 5-member union; symmetry caps grading. Content is hand-designed and engine-verified by `vite-node` scripts.

**Tech Stack:** TypeScript, Vite, Vitest, Playwright (`scripts/smoke.mjs`), GitHub Pages.

**Verification each phase:** `npx tsc --noEmit && npx vitest run`, then (UI phases) rebuild + `node scripts/smoke.mjs`.

---

## File map

- `src/engine/symmetry.ts` (new) — `detectSymmetry`, `isSymmetric`.
- `src/engine/scoring.ts` (new) — par, per-puzzle score, Pixelogic score, weights, titles, penalty table.
- `src/engine/types.ts` — add `"max"` to `Difficulty`.
- `src/engine/grader.ts` — symmetry cap + max promotion.
- `src/engine/deduce.ts` — readable proof captions.
- `src/engine/puzzles.ts` — `note` field; re-curated tiers; new Cat; new Max puzzles.
- `src/ui/format.ts` — `difficultyMeta("max")`, `symmetryMeta`.
- `src/ui/persistence.ts` — `bestScores`, `progressReset`, helpers.
- `src/ui/scoreState.ts` (new) — per-attempt assist ledger (penalties, check budget, voided).
- `src/ui/share.ts` — result/score/custom variants + reset disclosure.
- `src/ui/views/play.ts` — assist UI, scoring, post-solve bar, symmetry footer.
- `src/ui/views/menu.ts` — card score/time, Pixelogic header, Surprise adapt, mass delete, remove How-to-play btn, symmetry chip.
- `src/ui/views/explainer.ts` — slower + speed control + readable captions.
- `src/ui/views/tutorial.ts` — robust step engine.
- `src/ui/settings.ts` — auto-check toggle copy.
- `src/ui/router.ts` — first-view redirect correctness.
- `index.html` + `public/og-image.png` — social preview.
- `src/style.css` — laurel header, score badge, symmetry chip, check menu, post-solve bar, manage mode.
- Tests: `tests/symmetry.test.ts`, `tests/scoring.test.ts`, extend `tests/persistence.test.ts`, `tests/grader.test.ts`, `tests/deduce.test.ts`, `tests/puzzles.test.ts`; extend `scripts/smoke.mjs`.

---

## Phase 0 — Engine foundations (TDD)

### Task 0.1: Symmetry detection
**Files:** Create `src/engine/symmetry.ts`, `tests/symmetry.test.ts`.
- [ ] Test: a left-right mirror grid → `{horizontal:true,...}`, `isSymmetric=true`; an asymmetric grid → all false.
- [ ] Implement `detectSymmetry(grid: boolean[][])`: `horizontal` = rows equal reversed-columns; `vertical` = grid equals reversed-rows; `rotational` = grid equals 180° rotation. `isSymmetric` = any true.
- [ ] `tsc && vitest`; commit.

### Task 0.2: Difficulty gains `max`
**Files:** `types.ts`, `format.ts`, `puzzles.ts` (DIFFICULTY_ORDER), `menu.ts` (DIFF_HEADING).
- [ ] Add `"max"` to `Difficulty`. `difficultyMeta("max") = { label:"Max", className:"diff-max" }`. `DIFFICULTY_ORDER` ends `...,"expert","max"`. `DIFF_HEADING.max = "Max"`. (`expert` keeps label "Extra Hard".)
- [ ] `tsc`; commit.

### Task 0.3: Grader symmetry cap + max
**Files:** `grader.ts`, `tests/grader.test.ts`.
- [ ] Test: a symmetric, non-line-solvable grid grades ≤ `hard`; a large (≥196) non-line-solvable asymmetric grid grades `max`.
- [ ] In `grade()`: compute base as today; if `!isLineSolvable` and area ≥ 196 → `max`; else if `!isLineSolvable` → `expert`. Then if `isSymmetric(solutionFromClues?)` cap at `hard`. (Grader takes clues; add an overload/param to pass the solution grid, or accept symmetry via the caller `analyzeGrid`/`puzzleFromBitmap` which have the grid.)
- [ ] `tsc && vitest`; commit.

> NOTE: `grade()` currently takes clues only. Add `gradeGrid(solution)` that derives clues + symmetry and applies the cap, and have `puzzleFromBitmap`/`analyzeGrid` call it. Keep `grade(clues)` for the existing rounds logic.

### Task 0.4: Scoring engine
**Files:** Create `src/engine/scoring.ts`, `tests/scoring.test.ts`.
```ts
export const DIFFICULTY_WEIGHT: Record<Difficulty, number> =
  { easy:1, medium:2, hard:4, expert:7, max:12 };
const SECONDS_PER_CELL: Record<Difficulty, number> =
  { easy:1.0, medium:1.5, hard:2.2, expert:3.2, max:4.5 };
export function parSeconds(d: Difficulty, area: number): number { return Math.round(area * SECONDS_PER_CELL[d]); }

export interface AssistTally { checkSquare:number; checkLine:number; checkBoard:number; hint:number; voided:boolean; }
export const PENALTY = { checkSquare:5, checkLine:15, checkBoard:40, hint:20 } as const;
export function penaltyTotal(a: AssistTally): number {
  return a.checkSquare*PENALTY.checkSquare + a.checkLine*PENALTY.checkLine + a.checkBoard*PENALTY.checkBoard + a.hint*PENALTY.hint;
}
export function puzzleScore(opts:{difficulty:Difficulty; area:number; bestTimeMs:number; assists:AssistTally;}): number {
  if (opts.assists.voided || opts.bestTimeMs<=0) return 0;
  const par = parSeconds(opts.difficulty, opts.area);
  const speed = Math.min(1, par / (opts.bestTimeMs/1000));
  return Math.max(0, Math.min(100, Math.round(100*speed - penaltyTotal(opts.assists))));
}
export interface PuzzleMeta { id:string; difficulty:Difficulty; }
export function pixelogicScore(best: Record<string,number>, library: PuzzleMeta[]): number {
  let earned=0, possible=0;
  for (const p of library){ const w=DIFFICULTY_WEIGHT[p.difficulty]; possible+=w; earned += w*((best[p.id]??0)/100); }
  return possible? Math.round(1600*earned/possible) : 0;
}
export function checkBudget(d: Difficulty): number { return d==="hard"?3 : d==="expert"?2 : d==="max"?1 : Infinity; }
export function scoreTitle(s:number): string { /* bands: Novice<250, Apprentice<550, Solver<850, Sharp<1100, Expert<1350, Master<1500, Grandmaster>=1500 */ }
```
- [ ] Tests: par values; perfect fast solve = 100; at-par = 100; 2×par ⇒ 50; penalties subtract; voided ⇒ 0; pixelogicScore weighting + 1600 cap; title bands; checkBudget per tier.
- [ ] Implement; `tsc && vitest`; commit.

---

## Phase 1 — Persistence

### Task 1.1: scores + reset flag
**Files:** `persistence.ts`, `tests/persistence.test.ts`.
- [ ] Add `bestScores: Record<string,number>` and `progressReset: boolean` to `SaveData` + `defaultSaveData` + back-compat merge in `loadSave`.
- [ ] `recordPuzzleScore(id, score)` keeps the max; `getPuzzleScore(id)`; `getPixelogicScore()` (uses `pixelogicScore(bestScores, LIBRARY)`); `resetProgress` also clears `bestScores` and sets `progressReset=true`.
- [ ] Tests: defaults round-trip; record keeps max; reset clears + sets flag. `tsc && vitest`; commit.

---

## Phase 2 — Content (engine-verified)

### Task 2.1: `note` field + readable enrichment
- [ ] Add optional `note?: string` to the puzzles `Entry` and pass through to `Puzzle` (add `note?` to `Puzzle` type). Existing puzzles get short name reasons (#19): e.g. Cipher "a grid that looks like encrypted text", Static "TV snow", Enigma, Labyrinth.

### Task 2.2: Cat redesign + Max designs + re-curation
- [ ] Write `scripts/design.ts` (vite-node, gitignored or kept) that classifies candidate bitmaps (unique? line-solvable? logic-solvable? symmetric? graded tier?).
- [ ] Design a recognizable **Cat** (10×10) — verify unique + logic-solvable. Place by its graded tier.
- [ ] Design ≥3 **Max** puzzles (≥14×14, non-line-solvable, unique, logic-solvable). Move `Static`/`Cipher`/`Labyrinth` to Max if a tier above the small experts; keep Extra Hard consistent (small contradiction puzzles).
- [ ] `tests/puzzles.test.ts` invariants cover them; add a test that `byDifficulty("max").length>0` and Max members are non-line-solvable. `tsc && vitest`; commit.

---

## Phase 3 — Watch-solve

### Task 3.1: readable proof captions
**Files:** `deduce.ts`, `tests/deduce.test.ts`.
- [ ] Enrich `caption` to undeniable plain-language reasons (full row/empty row/overlap/edge/contradiction). Keep `technique`. Test a few captions contain the reason words.

### Task 3.2: slower explainer + speed control + void
**Files:** `explainer.ts`, `play.ts` (Watch-solve marks the puzzle `voided` for scoring).
- [ ] Default interval 1600ms; add 0.5×/1×/2× control. Opening watch-solve for a puzzle sets its attempt voided.

---

## Phase 4 — Assists + scoring in play

### Task 4.1: per-attempt ledger
**Files:** Create `src/ui/scoreState.ts` — holds `AssistTally` + check budget; methods `useCheckSquare/Line/Board`, `useHint`, `void`, `reset`, `tally()`.

### Task 4.2: play.ts assist UI + scoring
- [ ] Rename mode toggle to **Paint/Cross**; rename Reveal → **Fill out** (voids). Move auto-check to Settings.
- [ ] Add **Check** controls: Square (click a cell to reveal truth; −5; budget-limited), Line (−15), Board (−40). Hint stays (−20). Show running penalty.
- [ ] On solve: record best time, compute `puzzleScore(...)` from the attempt, `recordPuzzleScore`; show score + (new best) in popup.
- [ ] Post-solve bar (#7): after ✕, hide solving tools; show **Next · Share · Restart · Menu**.
- [ ] Symmetry footer (#11): if symmetric, a prominent cyan "Symmetric puzzle" strip at the very bottom.

---

## Phase 5 — Menu / home

- [ ] Remove "How to play" action button (#3).
- [ ] Card: score badge top-left, best time top-right, title, difficulty + symmetry chips, size (#10, #11).
- [ ] Pixelogic Score laurel header top-center with title band (#10).
- [ ] Surprise me adapts to frontier tier (#4).
- [ ] My Puzzles **Manage** mode → checkboxes, Delete selected, Delete all (#2).

## Phase 6 — Symmetry chips (#11): cyan chip on cards + play footer; `--symmetry` color.

## Phase 7 — Sharing (#16,#17): `share.ts` variants (result/score/custom); score share discloses `progressReset`.

## Phase 8 — Tutorial robustness (#1): rewrite step satisfaction to accept any path; never require undo/redo; acknowledge early solve.

## Phase 9 — Social + routing: OG/Twitter meta + `public/og-image.png` (#20); verify first-view redirect (#21).

## Phase 10 — CSS for all new surfaces.

## Phase 11 — Verify + deploy: extend `scripts/smoke.mjs`; full unit + smoke; build; push; watch Actions; smoke vs live URL.

---

## Self-review (spec coverage)
#1 tutorial→P8 · #2 mass delete→P5 · #3 remove btn→P5 · #4 surprise→P5 · #5 score→P0.4/P1/P4 · #6 max/larger→P0.2-3/P2 · #7 post-solve→P4 · #8 slower→P3.2 · #9 checks harder+score→P0.4/P4 · #10 score+laurel→P4/P5 · #11 symmetry→P0.1/P0.3/P5/P6 · #12 cat→P2 · #13 readable logic→P3.1 · #14 consistency→P2 · #15 fill rename/out→P4 · #16 reset disclosure→P1/P7 · #17 shareable→P7 · #18 assist taxonomy→P0.4/P4 · #19 name reasons→P2.1 · #20 OG preview→P9 · #21 first-view→P9. All mapped.
