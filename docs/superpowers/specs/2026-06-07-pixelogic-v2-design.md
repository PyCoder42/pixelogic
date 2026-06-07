# Pixelogic v2 — Scoring, Difficulty, Assists & Polish

Date: 2026-06-07
Status: approved-in-principle (key model decisions confirmed by the user)

This spec turns the user's 21-point feedback list into a buildable design. It is organized by
**system**, with each feedback item mapped to the system that delivers it.

## Confirmed design decisions (from the user)

1. **Pixelogic Score** is a *skill rating* on a **0–1,600** scale (SAT-style), derived from your
   **best per-puzzle scores weighted by difficulty**. Mastering harder puzzles raises it most.
2. **Per-puzzle score** (0–100) = `round(100 × min(1, par/bestTime)) − Σ penalties`, clamped 0–100.
3. **Assist penalties are tiered by severity** (table below).
4. **Five difficulty tiers**: Easy · Medium · Hard · Extra Hard · **Max**. **Symmetric puzzles are
   capped at Hard** and wear a **cyan "Symmetric" chip**.

---

## 1. Scoring engine (`src/engine/scoring.ts`, pure + unit-tested)

### Par
`parSeconds(difficulty, area)` = `round(area × secondsPerCell[difficulty])`, with
`secondsPerCell = { easy:1.0, medium:1.5, hard:2.2, "extra-hard":3.2, max:4.5 }` (tunable constants).

### Per-puzzle score (0–100)
```
speedFactor = min(1, parSeconds / bestTimeSeconds)   // hit par or faster ⇒ full speed credit
raw         = 100 × speedFactor − penaltyTotal
score       = voided ? 0 : clamp(round(raw), 0, 100)
```
Only the **best** score per puzzle is kept (monotonic, like best time). Restart begins a fresh attempt.

### Assist penalties (per attempt)
| Assist | Penalty | Notes |
|---|---|---|
| Auto-check (settings toggle) | 0 | Flags only *your own* wrong fills; never reveals unknown cells. |
| Check one square | −5 each | Limited uses: Easy/Medium ∞, Hard 3, Extra Hard 2, Max 1. |
| Check row/column | −15 | Reveals one full line's truth. |
| Check whole board | −40 | Reveals every current mistake. |
| Hint (next forced deduction) | −20 | |
| Fill out (auto-complete) | voids → 0 | |
| Watch solve (open explainer for that puzzle) | voids → 0 | Same as Fill out (#18). |

Penalties accumulate during the current attempt; `Restart` resets them and the check budget.

### Pixelogic Score (0–1,600)
```
weight = { easy:1, medium:2, hard:4, "extra-hard":7, max:12 }
earned   = Σ over library puzzles ( weight_i × bestScore_i / 100 )
possible = Σ over library puzzles ( weight_i )
pixelogicScore = round(1600 × earned / possible)
```
1,600 = a perfect 100 on every library puzzle. Unsolved puzzles count as 0 (it measures mastery of
the whole library). Title bands: Novice <250, Apprentice, Solver, Sharp, Expert, Master, Grandmaster ≥1500.
Custom puzzles do **not** affect the rating.

Covers: #5, #9, #10, #16 (partial), #18.

---

## 2. Assist UI redesign (`play.ts`) — #7, #9, #15, #18

- **Mode toggle renamed** to disambiguate from "fill out the answer": **`✏️ Paint` / `✕ Cross`**.
- **`Fill out`** button replaces "Reveal" — auto-completes the solution and **voids** the score.
- **Assists, cleanly divided**:
  - *Auto-check* → moved to **Settings** (free toggle; flags your wrong fills live).
  - *Check ▾* split-button → **Square** (−5, limited), **Line** (−15), **Board** (−40).
  - *Hint* (−20) — highlights the next forced cell with its reason.
  - *Watch solve* — opens the (slowed) explainer; marks the puzzle assisted/voided.
- A small **"Assists used"** readout shows the running penalty so the score is never a surprise.
- **Post-solve bar (#7)**: once solved and the popup is ✕'d, the solving tools (Paint/Cross, Check,
  Hint, Fill out, Watch solve, Undo/Redo) are **hidden** and replaced by a clean
  **Next · Share · Restart · Menu** bar — so *Next* is reachable without reopening the popup.

---

## 3. Difficulty + symmetry (`engine/types.ts`, `grader.ts`, new `engine/symmetry.ts`) — #6, #11, #14

- `Difficulty` gains `"max"`. Update every exhaustive switch (`format`, `menu`, `DIFFICULTY_ORDER`).
- **`symmetry.ts`**: `detectSymmetry(grid)` → `{ horizontal, vertical, rotational }`;
  `isSymmetric(grid)` = any of those. (Mirror-LR, mirror-UD, 180° rotation.)
- **Grader rule**: if `isSymmetric`, cap the graded difficulty at `hard`. `max` is a **curated/forced**
  label for hand-designed monsters (the generator already supports `forcedDifficulty`); the auto-grader
  may also promote a non-line-solvable puzzle of area ≥ 196 to `max`.
- **Consistency (#14)**: re-curate Extra Hard so members are comparable; relocate outliers
  (e.g. `Static`/`Cipher`/`Labyrinth`) to **Max** if they're genuinely a tier above.
- **Max content (#6)**: hand-design several large, brutal, *unique + logic-solvable* puzzles
  (≥14×14), engine-verified via a `vite-node` script. Designed, not random.

### Symmetry chip (#11)
Cyan chip (`--symmetry: #19c8d8`-ish). Shown on **home cards** beside the difficulty chip, and at the
**very bottom of the play view**, prominent, same cyan.

---

## 4. Content & naming — #12, #19, #14

- **Cat redesign (#12)**: a recognizably feline 10×10 (ears, eyes, muzzle, tail), engine-verified.
- **Naming reasons (#19)**: each puzzle gets an optional `note` explaining the name (e.g. why
  "Cipher"/"Enigma"/"Static"). Shown in the solved popup ("ℹ Why 'Cipher'?") and/or a puzzle info line.
- Re-grade/re-order Extra Hard and Max so within-tier difficulty is consistent.

---

## 5. Watch-solve: slower + real logic — #8, #13

- Slow the explainer auto-step from 650 ms to ~1,600 ms, with a **speed control** (1×/2×/0.5×).
- **Readable proofs (#13)**: enrich `deduce.ts` captions into full sentences that state the
  *undeniable* reason (e.g. "Row 3's clue is 5 and the row is 5 wide → every cell is filled", or
  "In every placement of clue `3 1`, these two cells are always filled → forced"). The ordered
  deduction list *is* the stored proof; the explainer renders it in plain language, step by step.

---

## 6. Tutorial robustness — #1

Rewrite the step engine so it is impossible to get stuck:
- Each action step is satisfied by **reaching the goal state by any path**; extra correct marks are fine.
- Re-evaluate satisfaction on every change; **never require undo/redo**.
- If the player solves the 5×5 ahead of the script, acknowledge and jump to the success step.
- Highlights only target not-yet-correct cells (already implemented) and update live.

---

## 7. Menu & home — #2, #3, #4, #10, #21

- **#3** Remove the "How to play" button from the action row (keep the 🎓 top-right tool).
- **#2 Mass delete**: a **Manage** toggle in *My Puzzles* → per-card checkboxes + **Delete selected**
  and **Delete all** (with confirm).
- **#4 Surprise me adapts**: pick a random **unsolved** puzzle from the player's *frontier tier* —
  the hardest tier they've started, bumped one tier up if that tier is fully solved (clamped to Max).
  Fallbacks: any unsolved → any.
- **#10 Card layout**: top-left **score badge**, top-right **best time**; title; then difficulty +
  symmetry chips + size. **Pixelogic Score** sits **top-center of the home header** inside a
  **laurel-wreath** motif (🌿 score 🌿 + title band), styled to fit the design system.
- **#21 First-view redirect**: bare URL (no hash) shows the **menu** normally; only a *first-ever*
  visit (no save) shows the tutorial — without leaving the user stuck on `#/tutorial`. Verify the
  router never forces a hash the user must keep.

---

## 8. Sharing — #16, #17, #20

- **`share.ts`** grows variants: **puzzle result**, **Pixelogic Score**, **custom puzzle link**.
- **#16** Persist a `progressReset` flag (set by Reset progress). Score shares **disclose** it
  ("Pixelogic Score 1,240 · progress was reset").
- **#20 Link previews**: add Open Graph + Twitter meta to `index.html` (`og:title`, `og:description`,
  `og:image`, `og:url`, `twitter:card=summary_large_image`). Ship a branded **`public/og-image.png`**
  (absolute URL under the Pages origin). Verify tags are present in the deployed HTML.

---

## 9. Persistence additions (`persistence.ts`)

Add to `SaveData` (back-compat merges, default `{}`/`false`): `bestScores: Record<string, number>`,
`progressReset: boolean`. `resetProgress` clears scores/times/completion and **sets `progressReset=true`**.
New helpers: `recordPuzzleScore(id, score)`, `getPuzzleScore(id)`, `getPixelogicScore()`. Unit-tested.

---

## 10. Testing strategy (verification-before-completion)

- **Unit (vitest)**: scoring math (par, per-puzzle, Pixelogic, weights, clamping), symmetry detection,
  grader symmetry cap + max tier, persistence (scores, reset flag), each new Max/Cat puzzle's
  uniqueness + logic-solvability + tier (via the existing library invariants test).
- **E2E (Playwright `scripts/smoke.mjs`)**: extend to cover the new assist buttons + penalties,
  post-solve bar + Next, score/time on cards, Pixelogic header, symmetry chip, mass-delete, surprise
  adaptation, slowed watch-solve, OG tags, first-view behavior. Run against the **preview** build.
- **Visual**: capture screenshots of every new surface and review them.
- **Live**: re-run the smoke suite against the deployed Pages URL after deploy.

## Out of scope / YAGNI
No accounts/cloud sync (static site). No audio. Numeric 1–10 difficulty rejected in favor of named
tiers. Score formula constants are centralized and tunable, not user-configurable.
