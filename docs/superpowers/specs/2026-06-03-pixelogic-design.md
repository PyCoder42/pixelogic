# Pixelogic — Design Spec

_Date: 2026-06-03_

## 1. Concept

Pixelogic is a **nonogram** (a.k.a. picross / griddler) logic-puzzle game that runs
entirely in the browser. A nonogram is a grid where each row and column is labeled
with a sequence of numbers giving the lengths of the consecutive runs of filled
cells in that line. The player deduces — by pure logic — which cells are filled,
revealing a hidden pixel-art picture.

The project's intellectual core is the **logic engine**: a line solver, a full
propagating solver, a uniqueness prover, and a difficulty grader. Every puzzle the
game ships is *proven to be uniquely solvable by logic alone* (no guessing required,
exactly one solution). On top of the engine sits a calm, friendly UI and a custom
puzzle editor.

## 2. Goals & non-goals

**Goals**
- A correct, well-tested logic engine that proves uniqueness and grades difficulty.
- A polished, spacing-first player experience (no cramped cells or awkward targets).
- A curated library of recognizable pixel-art puzzles across sizes & difficulties.
- A hint system that explains *why* a cell is forced.
- A "watch the logic solve it" step-by-step explainer.
- A custom editor: draw a picture, auto-derive clues, prove uniqueness, play/share it.
- Fully static; deploys to GitHub Pages.

**Non-goals (YAGNI)**
- No backend, accounts, or online multiplayer.
- No colored/multi-value nonograms (classic black-and-white only).
- No server-side puzzle storage (custom puzzles live in `localStorage` + URL export).

## 3. Architecture

Two layers with a hard boundary:

```
src/engine/   pure, DOM-free, deterministic logic  (the tested core)
src/ui/       DOM rendering, input, state, persistence (consumes the engine)
src/main.ts   entry point / app wiring + view routing
```

### 3.1 Engine modules (`src/engine/`)

- **`types.ts`** — shared types.
  - `Cell = 0 | 1 | 2` where `0 = UNKNOWN`, `1 = FILLED`, `2 = EMPTY` (tri-state used
    by the solver). Exported as named constants `UNKNOWN/FILLED/EMPTY`.
  - `Line = Cell[]`.
  - `Clue = number[]` — run lengths for one line. An empty array means "no filled
    cells" (rendered as `0`).
  - `Puzzle = { id, title, width, height, solution: boolean[][], rowClues: Clue[],
    colClues: Clue[], difficulty: Difficulty }`.
  - `Difficulty = "easy" | "medium" | "hard" | "expert"`.

- **`clues.ts`**
  - `cluesForLine(line: boolean[]): Clue` — run-length encode the filled runs.
  - `cluesForGrid(solution: boolean[][]): { rowClues, colClues }`.

- **`lineSolver.ts`** — the deductive heart.
  - `solveLine(state: Line, clue: Clue): Line | null` — returns a new line in which
    every cell that is **filled in all valid completions** is set to `FILLED`, every
    cell **empty in all valid completions** is set to `EMPTY`, and the rest stay
    `UNKNOWN`. Returns `null` if the clue is **infeasible** given `state`.
  - Algorithm (provably correct, fast for n ≤ 25): a memoized feasibility predicate
    `lineFeasible(state, clue)` via DP `fitsFrom(cellIndex, clueIndex)` that either
    leaves a cell empty (allowed unless the cell is `FILLED`) or places the next run
    (all its cells allowed to be `FILLED`, the gap after allowed to be `EMPTY`). For
    each currently-`UNKNOWN` cell `c`, test feasibility with `c` forced `FILLED` and
    with `c` forced `EMPTY`; if only one is feasible, that cell is forced.

- **`solver.ts`** — whole-grid reasoning built on `solveLine`.
  - `propagate(rowClues, colClues, grid?): { status, grid }` where
    `status ∈ "solved" | "stuck" | "contradiction"`. Repeatedly applies `solveLine`
    to every row and column until a fixpoint; pure logical propagation, no guessing.
  - `countSolutions(rowClues, colClues, limit = 2): number` — propagate, then DFS on
    the first remaining `UNKNOWN` cell (try FILLED / EMPTY, re-propagate), counting
    full solutions up to `limit`. Node-bounded with a safe cap so it never hangs.
  - `solve(rowClues, colClues): { solution, viaSearch }` — returns the (a) solution
    and whether search beyond propagation was required.
  - Helpers: `isLineSolvable` (propagation alone solves it), `hasUniqueSolution`
    (`countSolutions === 1`).

- **`grader.ts`**
  - `grade(rowClues, colClues): Difficulty` — measures the hardest technique needed:
    line-solvable in few rounds → `easy`; line-solvable but many propagation rounds →
    `medium`; needs depth-1 hypothesis/contradiction → `hard`; needs deeper search →
    `expert`. Size also nudges difficulty.

- **`generator.ts`**
  - `puzzleFromBitmap(rows: string[], title, id): { puzzle, unique, difficulty }`
    — parse a `#`/`.` bitmap into a solution grid, derive clues, prove uniqueness,
    grade, and assemble a `Puzzle`. Used to build the library and the editor output.
  - `analyzeGrid(solution): { unique, solutionCount, difficulty }` — for the editor's
    live feedback.

- **`puzzles.ts`** — the curated library: ~18–24 hand-designed pixel-art bitmaps
  across 5×5, 10×10, and 15×15, grouped by difficulty. A unit test asserts **every**
  library puzzle is uniquely solvable and matches its declared difficulty.

### 3.2 UI modules (`src/ui/`)

- **`gameState.ts`** — the player's working grid (tri-state marks, independent of the
  hidden solution), undo/redo history, elapsed timer, win detection, current mode
  (fill vs. cross). Emits change events the renderer subscribes to.
- **`render.ts`** — builds the board DOM: clue panels (top + left), the cell grid,
  satisfied-clue dimming, the win reveal. Pure render from state; no game logic.
- **`input.ts`** — pointer drag-fill (lock to one axis while dragging), left=fill /
  right=cross, mode toggle, full keyboard navigation, touch support.
- **`persistence.ts`** — `localStorage`: in-progress board, completed puzzles,
  settings (mistake-check on/off, theme), and user-created puzzles.
- **`hints.ts`** — runs the solver from the player's current marks to find the next
  forced cell and produces a human-readable explanation of the deduction.
- **`explainer.ts`** — a stepwise version of propagation that yields one deduction at
  a time with a caption, for the "watch it solve" view.
- **`editor.ts`** — a draw grid with live clue preview and a uniqueness verdict
  ("✓ unique" / "⚠ N solutions"); save to the user library and export via URL.
- **`router.ts`** — switches between Menu / Play / Editor / Explainer views.

## 4. Data flow

1. Menu lists library + user puzzles (from `puzzles.ts` and `localStorage`).
2. Selecting a puzzle loads it into `gameState`; `render` paints the board.
3. `input` mutates `gameState` (with undo history); `render` re-paints; `persistence`
   autosaves.
4. Win = player's filled cells exactly match `puzzle.solution`; triggers the reveal.
5. Hints/Explainer call the **engine** with the current marks; never peek at pixels
   that aren't logically forced.
6. Editor builds a solution grid → `generator.analyzeGrid` → verdict → save/play.

## 5. Error handling & edge cases

- Empty lines (clue `[]`) — all cells `EMPTY`.
- Full lines, lines whose clue sum + gaps == length (fully forced).
- Infeasible partial states surface as `solveLine` → `null` / `contradiction` (used
  by mistake-check and by the editor's uniqueness verdict).
- Editor caps grids at 15×15 so uniqueness checks stay fast and reliable.
- `countSolutions` is bounded (node cap) so a pathological grid can't hang the UI;
  if the cap is hit it reports "≥2 / unknown" rather than freezing.
- Corrupt/old `localStorage` is detected and reset rather than crashing.

## 6. Testing strategy

- **Engine (Vitest, the bulk of the tests):**
  - `cluesForLine` / `cluesForGrid` round-trips and edge cases.
  - `solveLine`: known forced-cell cases (overlap, edge fills, empties, infeasible).
  - `propagate` / `solve` on small puzzles with known solutions.
  - `countSolutions`: ambiguous grids → ≥2; well-formed → exactly 1.
  - `grader`: monotonic sanity (a hand-picked easy puzzle grades ≤ a hard one).
  - **Library invariant:** every puzzle in `puzzles.ts` is unique + grade matches.
- **UI:** logic-bearing UI helpers (win detection, hint selection, persistence
  serialization) unit-tested with a jsdom-free, function-level approach where
  possible.
- **Manual / browser:** the author drives the running app in Chrome to verify play,
  drag-fill, cross mode, hints, win reveal, editor, and responsive layout.
- CI runs `npm test` before building/deploying.

## 7. Design / UX

- **Palette:** soft baby-blue / turquoise-green. Calm off-white background, turquoise
  primary, baby-blue secondary accents, deep-teal filled cells, slate text. Gentle,
  diffuse shadows.
- **Shape & space:** generously rounded corners on panels; comfortable cell size and
  gaps (no cramped grids); roomy padding around clue panels and controls; clear 5-cell
  guide lines on larger grids.
- **Type:** a friendly-but-modern rounded sans (e.g. Nunito) with a system fallback;
  highly legible clue numerals.
- **Motion:** restrained — a soft cell "pop" on fill, a gentle staged color reveal on
  win. Respects `prefers-reduced-motion`.
- **Responsive & accessible:** works down to mobile widths; keyboard playable; visible
  focus rings; sufficient contrast; ARIA on controls.

## 8. Deployment

- Vite static build; `base = "/pixelogic/"`.
- GitHub Actions (`.github/workflows/deploy.yml`) runs tests, builds, and publishes
  `dist/` to GitHub Pages on every push to `main`.
- Live URL: **https://pycoder42.github.io/pixelogic/**

## 9. Build order (high level)

1. Engine: types → clues → lineSolver → solver → grader → generator (all TDD).
2. Puzzle library + uniqueness/grade invariant test.
3. UI: state → render → input → persistence → hints → explainer → editor → router.
4. Design system (CSS) applied throughout, spacing-first.
5. Multi-agent code review → fixes; browser verification; simplify; final verify.
6. Deploy + confirm the live URL in a real browser.
