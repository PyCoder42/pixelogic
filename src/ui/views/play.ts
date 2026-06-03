import { UNKNOWN, FILLED, EMPTY, type Cell, type Puzzle } from "../../engine/types";
import { GameState } from "../gameState";
import { createBoard, playWinReveal, type CellView } from "../render";
import { attachInput } from "../input";
import { nextHint } from "../hints";
import { el, mount } from "../dom";
import { formatTime, difficultyMeta, sizeLabel } from "../format";
import {
  loadSave,
  recordProgress,
  markCompleted,
  setSettings,
} from "../persistence";
import { navigate } from "../router";
import { LIBRARY } from "../../engine/puzzles";

type Cleanup = () => void;

/** Render the play view for a puzzle. `library` indicates a built-in puzzle
 *  (enables "next" + completion tracking by id). */
export function renderPlay(host: HTMLElement, puzzle: Puzzle, fromLibrary: boolean): Cleanup {
  const save = loadSave();
  const saved = save.progress[puzzle.id];
  const state = new GameState(
    puzzle,
    fromLibrary && saved ? saved.marks : undefined,
    fromLibrary && saved ? saved.elapsedMs : 0,
  );
  let mistakeCheck = save.settings.mistakeCheck;
  let solved = false;

  const cellView = (r: number, c: number): CellView =>
    state.marks[r][c] === FILLED ? "filled" : state.marks[r][c] === EMPTY ? "cross" : "empty";

  const board = createBoard({
    width: puzzle.width,
    height: puzzle.height,
    rowClues: puzzle.rowClues,
    colClues: puzzle.colClues,
    getCell: cellView,
    isMistake: (r, c) => mistakeCheck && state.marks[r][c] === FILLED && !puzzle.solution[r][c],
    dimSatisfied: true,
    interactive: true,
  });

  const detachInput = attachInput(board, state);

  // ---- header ----
  const meta = difficultyMeta(puzzle.difficulty);
  const timerEl = el("span", { class: "timer", text: formatTime(state.elapsedMs()) });
  const header = el("header", { class: "play-header" }, [
    el("button", { class: "btn ghost back-btn", text: "‹ Menu", on: { click: () => navigate("/") } }),
    el("div", { class: "play-title" }, [
      el("h1", { text: puzzle.title }),
      el("div", { class: "play-sub" }, [
        el("span", { class: `chip ${meta.className}`, text: meta.label }),
        el("span", { class: "chip muted", text: sizeLabel(puzzle.width, puzzle.height) }),
      ]),
    ]),
    el("div", { class: "timer-wrap" }, [timerEl]),
  ]);

  // ---- banner (hints / messages) ----
  const banner = el("div", { class: "banner", attrs: { role: "status", "aria-live": "polite" } });

  // ---- controls ----
  const fillBtn = el("button", { class: "seg active", text: "✏️ Fill", attrs: { type: "button" } });
  const crossBtn = el("button", { class: "seg", text: "✕ Cross", attrs: { type: "button" } });
  fillBtn.addEventListener("click", () => state.setMode("fill"));
  crossBtn.addEventListener("click", () => state.setMode("cross"));
  const modeToggle = el("div", { class: "segmented", attrs: { role: "group", "aria-label": "Mark mode" } }, [
    fillBtn,
    crossBtn,
  ]);

  const undoBtn = el("button", { class: "btn", text: "↶ Undo", on: { click: () => state.undo() } });
  const redoBtn = el("button", { class: "btn", text: "↷ Redo", on: { click: () => state.redo() } });

  const hintBtn = el("button", { class: "btn", text: "💡 Hint", on: { click: showHint } });

  const mistakeBtn = el("button", {
    class: `btn toggle ${mistakeCheck ? "on" : ""}`,
    text: "🔎 Check mistakes",
    on: {
      click: () => {
        mistakeCheck = !mistakeCheck;
        setSettings({ mistakeCheck });
        mistakeBtn.classList.toggle("on", mistakeCheck);
        board.refresh();
      },
    },
  });

  const explainBtn = el("button", {
    class: "btn",
    text: "🧠 Watch solve",
    on: { click: () => navigate(`/explain/${encodeURIComponent(puzzle.id)}`) },
  });

  const solveBtn = el("button", {
    class: "btn ghost",
    text: "Reveal",
    on: { click: revealSolution },
  });

  const restartBtn = el("button", {
    class: "btn ghost",
    text: "↺ Restart",
    on: { click: restart },
  });

  const controls = el("div", { class: "controls" }, [
    modeToggle,
    el("div", { class: "control-group" }, [undoBtn, redoBtn]),
    el("div", { class: "control-group" }, [hintBtn, mistakeBtn]),
    el("div", { class: "control-group" }, [explainBtn, solveBtn, restartBtn]),
  ]);

  // ---- win overlay ----
  const winTime = el("p", { class: "win-time" });
  const winOverlay = el("div", { class: "win-overlay hidden" }, [
    el("div", { class: "win-card" }, [
      el("div", { class: "win-emoji", text: "🎉" }),
      el("h2", { text: "Solved!" }),
      winTime,
      el("div", { class: "win-actions" }, [
        el("button", { class: "btn primary", text: "Menu", on: { click: () => navigate("/") } }),
        fromLibrary
          ? el("button", { class: "btn", text: "Next puzzle →", on: { click: goNext } })
          : el("button", { class: "btn", text: "Edit more", on: { click: () => navigate("/editor") } }),
      ]),
    ]),
  ]);

  const layout = el("div", { class: "view play" }, [
    header,
    el("div", { class: "board-wrap" }, [board.element]),
    banner,
    controls,
    winOverlay,
  ]);
  mount(host, layout);

  // ---- behaviour ----
  function refreshControls(): void {
    undoBtn.toggleAttribute("disabled", !state.canUndo());
    redoBtn.toggleAttribute("disabled", !state.canRedo());
    fillBtn.classList.toggle("active", state.mode === "fill");
    crossBtn.classList.toggle("active", state.mode === "cross");
  }

  function onChange(): void {
    board.refresh();
    refreshControls();
    if (fromLibrary && !solved) {
      recordProgress({ puzzleId: puzzle.id, marks: state.marks, elapsedMs: state.elapsedMs() });
    }
    if (!solved && state.isSolved()) handleWin();
  }
  state.subscribe(onChange);

  function showHint(): void {
    const hint = nextHint(puzzle, state.marks);
    if (!hint) {
      banner.textContent = state.isSolved() ? "Already solved! 🎉" : "No further logical step found.";
      return;
    }
    banner.textContent = `💡 ${hint.reason}`;
    const cell = board.cellsEl.querySelector<HTMLElement>(
      `.cell[data-r="${hint.row}"][data-c="${hint.col}"]`,
    );
    if (cell) {
      cell.classList.add("hinted");
      window.setTimeout(() => cell.classList.remove("hinted"), 1600);
    }
  }

  function revealSolution(): void {
    state.pause();
    for (let r = 0; r < puzzle.height; r++) {
      for (let c = 0; c < puzzle.width; c++) {
        const value: Cell = puzzle.solution[r][c] ? FILLED : EMPTY;
        state.setCell(r, c, value, r === 0 && c === 0);
      }
    }
  }

  function restart(): void {
    for (let r = 0; r < puzzle.height; r++) {
      for (let c = 0; c < puzzle.width; c++) state.setCell(r, c, UNKNOWN, r === 0 && c === 0);
    }
    banner.textContent = "";
    solved = false;
    winOverlay.classList.add("hidden");
    board.element.classList.remove("solved");
    state.start();
  }

  function handleWin(): void {
    solved = true;
    state.pause();
    if (fromLibrary) markCompleted(puzzle.id);
    playWinReveal(board);
    winTime.textContent = `Time: ${formatTime(state.elapsedMs())}`;
    window.setTimeout(() => winOverlay.classList.remove("hidden"), 650);
  }

  function goNext(): void {
    const idx = LIBRARY.findIndex((p) => p.id === puzzle.id);
    const next = LIBRARY[(idx + 1) % LIBRARY.length];
    navigate(`/play/${encodeURIComponent(next.id)}`);
  }

  // timer tick
  state.start();
  refreshControls();
  const tick = window.setInterval(() => {
    if (!solved) timerEl.textContent = formatTime(state.elapsedMs());
  }, 500);

  return () => {
    window.clearInterval(tick);
    detachInput();
    board.destroy();
    state.pause();
  };
}
