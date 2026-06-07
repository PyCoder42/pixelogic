import { UNKNOWN, FILLED, EMPTY, type Cell, type Puzzle } from "../../engine/types";
import { solveSteps, type SolveStep } from "../explainer";
import { createBoard, type Board, type CellView } from "../render";
import { el, mount } from "../dom";
import { navigate } from "../router";

type Cleanup = () => void;

export function renderExplainer(host: HTMLElement, puzzle: Puzzle): Cleanup {
  const steps: SolveStep[] = solveSteps(puzzle);
  const grid: Cell[][] = Array.from({ length: puzzle.height }, () =>
    Array<Cell>(puzzle.width).fill(UNKNOWN),
  );
  let stepIndex = 0; // number of steps applied
  let timer: number | null = null;
  let speed = 1; // 0.5× = slower, 2× = faster
  const BASE_MS = 1600; // deliberately slow so each deduction can be read
  const intervalMs = (): number => Math.round(BASE_MS / speed);

  const cellView = (r: number, c: number): CellView =>
    grid[r][c] === FILLED ? "filled" : grid[r][c] === EMPTY ? "cross" : "empty";

  const board: Board = createBoard({
    width: puzzle.width,
    height: puzzle.height,
    rowClues: puzzle.rowClues,
    colClues: puzzle.colClues,
    getCell: cellView,
    interactive: false,
  });

  const caption = el("div", { class: "banner explain-caption", text: "Press play to watch the deductions." });
  const progress = el("span", { class: "explain-progress", text: `0 / ${steps.length}` });

  const playBtn = el("button", { class: "btn primary", text: "▶ Play", on: { click: togglePlay } });
  const stepBtn = el("button", { class: "btn", text: "Step ▸", on: { click: stepForward } });
  const resetBtn = el("button", { class: "btn ghost", text: "↺ Reset", on: { click: reset } });

  // Speed control (0.5× / 1× / 2×).
  const speedBtns = ([0.5, 1, 2] as const).map((mult) =>
    el("button", {
      class: `seg ${mult === speed ? "active" : ""}`,
      text: `${mult}×`,
      attrs: { type: "button" },
      on: {
        click: () => {
          speed = mult;
          speedBtns.forEach((b, i) => b.classList.toggle("active", [0.5, 1, 2][i] === speed));
          if (timer !== null) {
            window.clearInterval(timer);
            timer = window.setInterval(stepForward, intervalMs());
          }
        },
      },
    }),
  );
  const speedControl = el(
    "div",
    { class: "segmented speed-control", attrs: { role: "group", "aria-label": "Playback speed" } },
    speedBtns,
  );

  const view = el("div", { class: "view explainer" }, [
    el("header", { class: "play-header" }, [
      el("button", { class: "btn ghost back-btn", text: "‹ Back", on: { click: () => navigate(`/play/${encodeURIComponent(puzzle.id)}`) } }),
      el("div", { class: "play-title" }, [
        el("h1", { text: `Solving “${puzzle.title}”` }),
        el("div", { class: "play-sub" }, [progress]),
      ]),
      el("div", { class: "header-spacer" }),
    ]),
    el("div", { class: "board-wrap" }, [board.element]),
    caption,
    el("div", { class: "controls" }, [
      el("div", { class: "control-group" }, [resetBtn, playBtn, stepBtn]),
      el("div", { class: "control-group" }, [speedControl]),
    ]),
  ]);
  mount(host, view);

  function highlight(step: SolveStep): void {
    for (const { r, c } of step.cells) {
      const cell = board.cellsEl.querySelector<HTMLElement>(`.cell[data-r="${r}"][data-c="${c}"]`);
      if (cell) {
        cell.classList.add("pulse");
        window.setTimeout(() => cell.classList.remove("pulse"), 600);
      }
    }
    const clueSel = step.lineType === "row" ? ".row-clue" : ".col-clue";
    const attr = step.lineType === "row" ? "r" : "c";
    board.element
      .querySelectorAll<HTMLElement>(`${clueSel}[data-${attr}="${step.index}"]`)
      .forEach((node) => {
        node.classList.add("clue-active");
        window.setTimeout(() => node.classList.remove("clue-active"), 600);
      });
  }

  function stepForward(): void {
    if (stepIndex >= steps.length) {
      stopPlay();
      return;
    }
    const step = steps[stepIndex];
    for (const { r, c, value } of step.cells) grid[r][c] = value === EMPTY ? EMPTY : FILLED;
    board.refresh();
    highlight(step);
    caption.textContent = step.caption;
    stepIndex++;
    progress.textContent = `${stepIndex} / ${steps.length}`;
    if (stepIndex >= steps.length) {
      caption.textContent = "Solved by pure logic! 🎉";
      board.element.classList.add("solved");
      stopPlay();
    }
  }

  function togglePlay(): void {
    if (timer !== null) {
      stopPlay();
      return;
    }
    if (stepIndex >= steps.length) reset();
    playBtn.textContent = "⏸ Pause";
    timer = window.setInterval(stepForward, intervalMs());
  }

  function stopPlay(): void {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
    playBtn.textContent = stepIndex >= steps.length ? "▶ Replay" : "▶ Play";
  }

  function reset(): void {
    stopPlay();
    for (let r = 0; r < puzzle.height; r++) for (let c = 0; c < puzzle.width; c++) grid[r][c] = UNKNOWN;
    stepIndex = 0;
    board.element.classList.remove("solved");
    board.refresh();
    caption.textContent = "Press play to watch the deductions.";
    progress.textContent = `0 / ${steps.length}`;
    playBtn.textContent = "▶ Play";
  }

  return () => {
    stopPlay();
    board.destroy();
  };
}
