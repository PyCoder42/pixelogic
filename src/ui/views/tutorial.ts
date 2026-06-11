import { FILLED, EMPTY, type Cell } from "../../engine/types";
import { GameState } from "../gameState";
import { createBoard, type Board, type CellView } from "../render";
import { attachInput } from "../input";
import { el, mount } from "../dom";
import { setTutorialSeen } from "../persistence";
import { getPuzzle } from "../../engine/puzzles";
import { navigate } from "../router";

type Cleanup = () => void;

interface Step {
  kind: "info" | "fill" | "cross";
  text: string;
  cells?: Array<[number, number]>;
  /** For action steps: forced input mode. */
  mode?: "fill" | "cross";
}

// The tutorial solves the 5×5 "Plus": middle row + middle column.
const STEPS: Step[] = [
  {
    kind: "info",
    text:
      "Welcome to Pixelogic! 👋 The numbers around the grid tell you the runs of filled cells in each row and column. Let's solve this little 5×5 together.",
  },
  {
    kind: "fill",
    mode: "fill",
    text:
      "Row 3's clue is 5 — and the grid is 5 wide, so the whole row is filled. Tap each highlighted cell to fill it.",
    cells: [
      [2, 0],
      [2, 1],
      [2, 2],
      [2, 3],
      [2, 4],
    ],
  },
  {
    kind: "cross",
    mode: "cross",
    text:
      "Cells you know are empty can be crossed so you don't fill them by mistake. We've switched you to ✕ Cross mode — cross the highlighted top-left corner. (You can also right-click.)",
    cells: [[0, 0]],
  },
  {
    kind: "fill",
    mode: "fill",
    text:
      "Back to filling. Column 3's clue is also 5 — fill the whole highlighted column to finish the picture.",
    cells: [
      [0, 2],
      [1, 2],
      [2, 2],
      [3, 2],
      [4, 2],
    ],
  },
  {
    kind: "info",
    text:
      "🎉 You solved it! That's the whole game: read the clues, fill what's forced, and cross what's empty. Every puzzle is solvable by logic alone — and Hint or Watch-solve are there if you get stuck.",
  },
];

export function renderTutorial(host: HTMLElement): Cleanup {
  const puzzle = getPuzzle("plus")!;
  const state = new GameState(puzzle);
  let stepIndex = 0;

  const cellView = (r: number, c: number): CellView =>
    state.marks[r][c] === FILLED ? "filled" : state.marks[r][c] === EMPTY ? "cross" : "empty";

  const board: Board = createBoard({
    width: puzzle.width,
    height: puzzle.height,
    rowClues: puzzle.rowClues,
    colClues: puzzle.colClues,
    getCell: cellView,
    satisfiedStyle: "grey",
    interactive: true,
    gridLabel: "Tutorial puzzle",
  });
  const detachInput = attachInput(board, state);

  const fillBtn = el("button", { class: "seg active", text: "✏️ Fill", attrs: { type: "button" } });
  const crossBtn = el("button", { class: "seg", text: "✕ Cross", attrs: { type: "button" } });
  fillBtn.addEventListener("click", () => state.setMode("fill"));
  crossBtn.addEventListener("click", () => state.setMode("cross"));
  const modeToggle = el("div", { class: "segmented", attrs: { role: "group", "aria-label": "Mark mode" } }, [
    fillBtn,
    crossBtn,
  ]);

  const bubbleText = el("p", { class: "tut-text" });
  const nextBtn = el("button", { class: "btn primary", text: "Next", on: { click: advance } });
  const bubble = el("div", { class: "tut-bubble", attrs: { role: "status", "aria-live": "polite" } }, [
    bubbleText,
    nextBtn,
  ]);

  const skipBtn = el("button", {
    class: "btn ghost tut-skip",
    text: "Skip tutorial",
    on: { click: finish },
  });

  const view = el("div", { class: "view tutorial" }, [
    el("header", { class: "tut-header" }, [
      el("div", { class: "brand small" }, [
        el("span", { class: "logo", text: "▦" }),
        el("h1", { text: "How to play" }),
      ]),
      skipBtn,
    ]),
    el("div", { class: "board-wrap" }, [board.element]),
    modeToggle,
    bubble,
  ]);
  mount(host, view);

  function wantFor(step: Step): Cell {
    return step.kind === "cross" ? EMPTY : FILLED;
  }

  /** Highlight only the step's cells that are NOT yet in their goal state, so a
   *  player never gets nudged to tap a cell that's already correct (which would
   *  toggle it back off). Pass `null` to clear all highlights. */
  function highlight(step: Step | null): void {
    board.cellsEl.querySelectorAll(".tut-target").forEach((n) => n.classList.remove("tut-target"));
    if (!step || !step.cells) return;
    const want = wantFor(step);
    for (const [r, c] of step.cells) {
      if (state.marks[r][c] === want) continue;
      board.cellsEl
        .querySelector(`.cell[data-r="${r}"][data-c="${c}"]`)
        ?.classList.add("tut-target");
    }
  }

  function stepSatisfied(step: Step): boolean {
    if (!step.cells) return false;
    const want = wantFor(step);
    return step.cells.every(([r, c]) => state.marks[r][c] === want);
  }

  function showStep(): void {
    const step = STEPS[stepIndex];
    bubbleText.textContent = step.text;
    const isAction = step.kind !== "info";
    nextBtn.classList.toggle("hidden", isAction);
    nextBtn.textContent = stepIndex === STEPS.length - 1 ? "Start playing →" : "Next";
    modeToggle.classList.toggle("hidden", !isAction);
    if (step.mode) {
      state.setMode(step.mode);
      fillBtn.classList.toggle("active", step.mode === "fill");
      crossBtn.classList.toggle("active", step.mode === "cross");
    }
    highlight(step);
  }

  function advance(): void {
    if (stepIndex >= STEPS.length - 1) {
      finish();
      return;
    }
    stepIndex++;
    showStep();
  }

  function onChange(): void {
    board.refresh();
    fillBtn.classList.toggle("active", state.mode === "fill");
    crossBtn.classList.toggle("active", state.mode === "cross");
    // Robustness: if the player completes the picture by ANY path (e.g. they fill
    // the whole plus without bothering to cross), celebrate immediately — never
    // trap them on a scripted sub-step they've effectively already satisfied.
    if (state.isSolved() && stepIndex < STEPS.length - 1) {
      highlight(null);
      stepIndex = STEPS.length - 1;
      showStep();
      return;
    }
    const step = STEPS[stepIndex];
    if (step.kind === "info") return;
    if (stepSatisfied(step)) {
      highlight(null);
      window.setTimeout(advance, 350);
    } else {
      // Re-highlight remaining targets as the player fills them in.
      highlight(step);
    }
  }
  state.subscribe(onChange);

  function finish(): void {
    setTutorialSeen(true);
    navigate("/");
  }

  showStep();

  return () => {
    detachInput();
    board.destroy();
  };
}
