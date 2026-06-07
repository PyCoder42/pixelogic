import { UNKNOWN, FILLED, EMPTY, type Puzzle } from "../../engine/types";
import { isSymmetric } from "../../engine/symmetry";
import { puzzleScore } from "../../engine/scoring";
import { GameState } from "../gameState";
import { createBoard, playWinReveal, type CellView, type BoardConfig } from "../render";
import { attachInput } from "../input";
import { nextHint } from "../hints";
import { el, mount } from "../dom";
import { formatTime, difficultyMeta, sizeLabel } from "../format";
import {
  loadSave,
  getSettings,
  recordProgress,
  clearProgress,
  markCompleted,
  recordBestTime,
  recordPuzzleScore,
} from "../persistence";
import { ScoreState } from "../scoreState";
import { openSettings, openRules } from "../settings";
import { puzzleLink, shareResult } from "../share";
import { navigate } from "../router";
import { LIBRARY } from "../../engine/puzzles";

type Cleanup = () => void;

export interface PlayOptions {
  fromLibrary: boolean;
  /** Set when test-playing an editor draft. Back/overlay return here (not Menu). */
  testReturn?: string;
}

export function renderPlay(host: HTMLElement, puzzle: Puzzle, opts: PlayOptions): Cleanup {
  const { fromLibrary, testReturn } = opts;
  const isTest = !!testReturn;
  const isCustomSaved = !fromLibrary && puzzle.id.startsWith("u-");
  const scored = fromLibrary; // only built-in puzzles feed the Pixelogic Score
  const symmetric = isSymmetric(puzzle.solution);
  const area = puzzle.width * puzzle.height;

  const save = loadSave();
  const saved = save.progress[puzzle.id];
  const state = new GameState(
    puzzle,
    fromLibrary && saved ? saved.marks : undefined,
    fromLibrary && saved ? saved.elapsedMs : 0,
  );
  const score = new ScoreState(puzzle.id, puzzle.difficulty, scored);
  let settings = save.settings;
  let mistakeCheck = settings.mistakeCheck;
  let solved = false;
  let filledOut = false;
  let saveTimer: number | null = null;
  let pendingCheck: "square" | "line" | null = null;

  const cellView = (r: number, c: number): CellView =>
    state.marks[r][c] === FILLED ? "filled" : state.marks[r][c] === EMPTY ? "cross" : "empty";

  const boardConfig: BoardConfig = {
    width: puzzle.width,
    height: puzzle.height,
    rowClues: puzzle.rowClues,
    colClues: puzzle.colClues,
    getCell: cellView,
    isMistake: (r, c) => mistakeCheck && state.marks[r][c] === FILLED && !puzzle.solution[r][c],
    dimSatisfied: settings.highlightClues,
    interactive: true,
    gridLabel: `${puzzle.title} — ${puzzle.height} by ${puzzle.width} nonogram grid`,
  };
  const board = createBoard(boardConfig);
  const detachInput = attachInput(board, state);

  // ---- header ----
  const meta = difficultyMeta(puzzle.difficulty);
  const timerEl = el("span", { class: "timer", text: formatTime(state.elapsedMs()) });
  const timerWrap = el("div", { class: "timer-wrap" }, [timerEl]);
  const rulesBtn = el("button", {
    class: "icon-btn",
    text: "❔",
    attrs: { type: "button", "aria-label": "How to play", title: "How to play" },
    on: { click: () => openRules() },
  });
  const settingsBtn = el("button", {
    class: "icon-btn",
    text: "⚙",
    attrs: { type: "button", "aria-label": "Game settings", title: "Settings" },
    on: { click: () => openSettings("game", applySettings) },
  });
  const backBtn = el("button", {
    class: "btn ghost back-btn",
    text: isTest ? "‹ Editor" : "‹ Menu",
    on: { click: goBack },
  });
  const header = el("header", { class: "play-header" }, [
    backBtn,
    el("div", { class: "play-title" }, [
      el("h1", { text: puzzle.title }),
      el("div", { class: "play-sub" }, [
        el("span", { class: `chip ${meta.className}`, text: meta.label }),
        el("span", { class: "chip muted", text: sizeLabel(puzzle.width, puzzle.height) }),
        symmetric ? el("span", { class: "chip chip-symmetry", text: "◈ Symmetric" }) : null,
        isTest ? el("span", { class: "chip muted", text: "Test play" }) : null,
      ]),
    ]),
    el("div", { class: "play-tools" }, [rulesBtn, settingsBtn, timerWrap]),
  ]);

  const banner = el("div", { class: "banner", attrs: { role: "status", "aria-live": "polite" } });

  // ---- mode toggle (Paint / Cross — renamed to avoid "fill out the answer") ----
  const fillBtn = el("button", { class: "seg active", text: "🖌 Paint", attrs: { type: "button" } });
  const crossBtn = el("button", { class: "seg", text: "✕ Cross", attrs: { type: "button" } });
  fillBtn.addEventListener("click", () => state.setMode("fill"));
  crossBtn.addEventListener("click", () => state.setMode("cross"));
  const modeToggle = el("div", { class: "segmented", attrs: { role: "group", "aria-label": "Mark mode" } }, [
    fillBtn,
    crossBtn,
  ]);

  const undoBtn = el("button", { class: "btn", text: "↶ Undo", on: { click: () => state.undo() } });
  const redoBtn = el("button", { class: "btn", text: "↷ Redo", on: { click: () => state.redo() } });

  // ---- assists ----
  const hintBtn = el("button", { class: "btn", text: "💡 Hint −20", on: { click: useHint } });
  const checkSquareBtn = el("button", { class: "btn", text: "🔍 Square −5", on: { click: () => armCheck("square") } });
  const checkLineBtn = el("button", { class: "btn", text: "🔍 Line −15", on: { click: () => armCheck("line") } });
  const checkBoardBtn = el("button", { class: "btn", text: "🔍 Board −40", on: { click: checkBoard } });
  const fillOutBtn = el("button", { class: "btn ghost", text: "Fill out", on: { click: fillOut } });
  const explainBtn = el("button", { class: "btn", text: "🧠 Watch solve", on: { click: watchSolve } });
  const restartBtn = el("button", { class: "btn ghost", text: "↺ Restart", on: { click: restart } });

  const assistMeter = el("div", { class: "assist-meter", attrs: { "aria-live": "polite" } });

  const controls = el("div", { class: "controls" }, [
    modeToggle,
    el("div", { class: "control-group" }, [undoBtn, redoBtn]),
    el("div", { class: "control-group" }, [hintBtn, checkSquareBtn, checkLineBtn, checkBoardBtn]),
    el("div", { class: "control-group" }, [explainBtn, fillOutBtn, restartBtn]),
    assistMeter,
  ]);

  // ---- post-solve bar (shown after closing the win popup) ----
  const postSolveBar = el("div", { class: "controls post-solve hidden" });

  // ---- symmetry footer (#11) ----
  const symmetryFooter = symmetric
    ? el("div", { class: "symmetry-strip", attrs: { role: "note" } }, [
        el("span", { text: "◈ Symmetric puzzle — its halves mirror each other, so each deduction does double duty." }),
      ])
    : null;

  // ---- win overlay ----
  const winEmoji = el("div", { class: "win-emoji", text: "🎉" });
  const winHeading = el("h2", { text: "Solved!" });
  const winTime = el("p", { class: "win-time" });
  const winScoreEl = el("p", { class: "win-score" });
  const winActions = el("div", { class: "win-actions" });
  const winClose = el("button", {
    class: "modal-close",
    text: "✕",
    attrs: { type: "button", "aria-label": "Close and admire the picture" },
    on: { click: closeWinOverlay },
  });
  const winCard = el("div", { class: "win-card" }, [winClose, winEmoji, winHeading, winScoreEl, winTime, winActions]);
  const winOverlay = el(
    "div",
    { class: "win-overlay hidden", attrs: { role: "dialog", "aria-modal": "true", "aria-label": "Puzzle solved" } },
    [winCard],
  );

  const layout = el("div", { class: "view play" }, [
    header,
    el("div", { class: "board-wrap" }, [board.element]),
    banner,
    controls,
    postSolveBar,
    symmetryFooter,
    winOverlay,
  ]);
  mount(host, layout);

  // ====================================================================
  function goBack(): void {
    navigate(isTest ? testReturn! : "/");
  }

  function applySettings(): void {
    settings = getSettings();
    mistakeCheck = settings.mistakeCheck;
    boardConfig.dimSatisfied = settings.highlightClues;
    timerWrap.classList.toggle("hidden", !settings.showTimer);
    board.refresh();
  }

  function refreshControls(): void {
    undoBtn.toggleAttribute("disabled", !state.canUndo());
    redoBtn.toggleAttribute("disabled", !state.canRedo());
    fillBtn.classList.toggle("active", state.mode === "fill");
    crossBtn.classList.toggle("active", state.mode === "cross");
    const left = score.squaresLeft();
    checkSquareBtn.textContent = left === Infinity ? "🔍 Square −5" : `🔍 Square −5 (${Math.max(0, left)})`;
    checkSquareBtn.toggleAttribute("disabled", !score.canCheckSquare());
    updateAssistMeter();
  }

  function updateAssistMeter(): void {
    if (!scored) {
      assistMeter.textContent = "";
      return;
    }
    if (score.voided()) {
      assistMeter.textContent = "⚠ No score this attempt (Fill out / Watch solve used) — Restart for a clean run.";
      return;
    }
    const p = score.penalty();
    assistMeter.textContent = p > 0 ? `Assists used: −${p} to your score` : "Clean solve — no assists yet";
  }

  function scheduleSave(): void {
    if (!fromLibrary || solved) return;
    if (saveTimer !== null) return;
    saveTimer = window.setTimeout(flushSave, 400);
  }
  function flushSave(): void {
    if (saveTimer !== null) {
      window.clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (!fromLibrary || solved) return;
    recordProgress({ puzzleId: puzzle.id, marks: state.marks, elapsedMs: state.elapsedMs() });
  }
  function cancelSave(): void {
    if (saveTimer !== null) {
      window.clearTimeout(saveTimer);
      saveTimer = null;
    }
  }

  function onChange(): void {
    board.refresh();
    refreshControls();
    scheduleSave();
    if (!solved && state.isSolved()) handleWin();
  }
  state.subscribe(onChange);

  // ---- hint ----
  function useHint(): void {
    const hint = nextHint(puzzle, state.marks);
    if (!hint) {
      banner.textContent = state.isSolved() ? "Already solved! 🎉" : "No further logical step found.";
      return;
    }
    if (scored) {
      score.useHint();
      updateAssistMeter();
    }
    banner.textContent = `💡 ${hint.reason}`;
    flashCell(hint.row, hint.col, "hinted", 1600);
  }

  // ---- checks ----
  function armCheck(kind: "square" | "line"): void {
    if (kind === "square" && !score.canCheckSquare()) {
      banner.textContent = "No more square checks at this difficulty.";
      return;
    }
    pendingCheck = kind;
    board.cellsEl.classList.add("checking");
    banner.textContent =
      kind === "square" ? "Tap a square to reveal it (−5)." : "Tap a cell to reveal its row & column (−15).";
  }

  function onCheckClick(e: PointerEvent): void {
    if (!pendingCheck) return;
    const cell = (e.target as HTMLElement).closest<HTMLElement>(".cell");
    if (!cell || cell.dataset.r === undefined) return;
    e.preventDefault();
    e.stopPropagation();
    const r = Number(cell.dataset.r);
    const c = Number(cell.dataset.c);
    const kind = pendingCheck;
    pendingCheck = null;
    board.cellsEl.classList.remove("checking");
    if (kind === "square") {
      if (scored && !score.useCheckSquare()) return;
      state.setCell(r, c, truthAt(r, c), true);
      flashCell(r, c, "revealed", 700);
      banner.textContent = "";
    } else {
      if (scored) score.useCheckLine();
      state.batch(true, () => {
        for (let cc = 0; cc < puzzle.width; cc++) state.setCell(r, cc, truthAt(r, cc), false);
        for (let rr = 0; rr < puzzle.height; rr++) state.setCell(rr, c, truthAt(rr, c), false);
      });
      for (let cc = 0; cc < puzzle.width; cc++) flashCell(r, cc, "revealed", 700);
      for (let rr = 0; rr < puzzle.height; rr++) flashCell(rr, c, "revealed", 700);
      banner.textContent = "";
    }
    updateAssistMeter();
    refreshControls();
  }

  function truthAt(r: number, c: number) {
    return puzzle.solution[r][c] ? FILLED : EMPTY;
  }

  function checkBoard(): void {
    const wrong: Array<[number, number]> = [];
    for (let r = 0; r < puzzle.height; r++) {
      for (let c = 0; c < puzzle.width; c++) {
        if (state.marks[r][c] === FILLED && !puzzle.solution[r][c]) wrong.push([r, c]);
      }
    }
    if (scored) score.useCheckBoard();
    if (wrong.length === 0) {
      banner.textContent = "No mistakes so far. ✓";
    } else {
      state.batch(true, () => {
        for (const [r, c] of wrong) state.setCell(r, c, UNKNOWN, false);
      });
      for (const [r, c] of wrong) flashCell(r, c, "revealed", 900);
      banner.textContent = `Cleared ${wrong.length} mistaken ${wrong.length === 1 ? "cell" : "cells"}.`;
    }
    updateAssistMeter();
  }

  function flashCell(r: number, c: number, cls: string, ms: number): void {
    const cell = board.cellsEl.querySelector<HTMLElement>(`.cell[data-r="${r}"][data-c="${c}"]`);
    if (cell) {
      cell.classList.add(cls);
      window.setTimeout(() => cell.classList.remove(cls), ms);
    }
  }

  // ---- fill out (voids) ----
  function fillOut(): void {
    filledOut = true;
    if (scored) score.voidAttempt();
    cancelSave();
    state.pause();
    state.batch(true, () => {
      for (let r = 0; r < puzzle.height; r++) {
        for (let c = 0; c < puzzle.width; c++) {
          state.setCell(r, c, puzzle.solution[r][c] ? FILLED : EMPTY, false);
        }
      }
    });
  }

  function watchSolve(): void {
    if (scored) score.voidAttempt();
    navigate(`/explain/${encodeURIComponent(puzzle.id)}`);
  }

  function restart(): void {
    filledOut = false;
    solved = false;
    score.reset();
    state.batch(true, () => {
      for (let r = 0; r < puzzle.height; r++) {
        for (let c = 0; c < puzzle.width; c++) state.setCell(r, c, UNKNOWN, false);
      }
    });
    cancelSave();
    if (fromLibrary) clearProgress(puzzle.id);
    banner.textContent = "";
    winOverlay.classList.add("hidden");
    board.element.classList.remove("solved");
    controls.classList.remove("hidden");
    postSolveBar.classList.add("hidden");
    state.start();
    refreshControls();
  }

  // ---- win ----
  let lastScore: { value: number; isNew: boolean } | null = null;

  function handleWin(): void {
    solved = true;
    state.pause();
    cancelSave();
    pendingCheck = null;
    board.cellsEl.classList.remove("checking");
    playWinReveal(board);
    const elapsed = state.elapsedMs();
    lastScore = null;

    if (filledOut) {
      winHeading.textContent = "Filled out";
      winEmoji.textContent = "🧩";
      winScoreEl.textContent = "";
      winTime.textContent = "No score — you used Fill out.";
    } else {
      winHeading.textContent = "Solved!";
      winEmoji.textContent = "🎉";
      if (fromLibrary) markCompleted(puzzle.id);
      if (scored) {
        const sc = puzzleScore({ difficulty: puzzle.difficulty, area, bestTimeMs: elapsed, assists: score.tally_() });
        const rec = recordPuzzleScore(puzzle.id, sc);
        lastScore = { value: sc, isNew: rec.isNew && sc > 0 };
        const time = recordBestTime(puzzle.id, elapsed);
        score.finish();
        winScoreEl.textContent = score.voided()
          ? "Score: 0 (assisted)"
          : `Score: ${sc}/100${lastScore.isNew ? " · best yet!" : ""}`;
        winTime.textContent = time.isNew ? `🏅 New best time — ${formatTime(elapsed)}` : `Time ${formatTime(elapsed)} · Best ${formatTime(time.best)}`;
      } else {
        winScoreEl.textContent = "";
        winTime.textContent = `Time: ${formatTime(elapsed)}`;
      }
    }

    winOverlay.setAttribute("aria-label", filledOut ? "Puzzle filled out" : "Puzzle solved");
    winClose.setAttribute("aria-label", filledOut ? "Close" : "Close and admire the picture");
    buildActions(winActions, "popup");
    window.setTimeout(() => {
      winOverlay.classList.remove("hidden");
      (winOverlay.querySelector(".win-actions .btn") as HTMLElement | null)?.focus();
    }, 650);
  }

  /** Build the action buttons for either the popup or the post-solve bar. */
  function buildActions(into: HTMLElement, where: "popup" | "bar"): void {
    into.replaceChildren();
    const shareBtn = el("button", { class: "btn", text: "🔗 Share", on: { click: () => doShare(shareBtn) } });
    if (isTest) {
      into.append(
        el("button", { class: "btn primary", text: "‹ Back to editor", on: { click: () => navigate(testReturn!) } }),
        where === "popup"
          ? el("button", { class: "btn ghost", text: "Admire", on: { click: closeWinOverlay } })
          : el("button", { class: "btn ghost", text: "↺ Try again", on: { click: restart } }),
      );
      return;
    }
    if (!filledOut) into.append(shareBtn);
    if (fromLibrary) {
      into.append(el("button", { class: "btn primary", text: "Next puzzle →", on: { click: goNext } }));
    } else if (isCustomSaved) {
      into.append(
        el("button", { class: "btn primary", text: "✏️ Edit", on: { click: () => navigate(`/editor/${encodeURIComponent(puzzle.id)}`) } }),
      );
    }
    if (where === "bar") into.append(el("button", { class: "btn", text: "↺ Play again", on: { click: restart } }));
    into.append(el("button", { class: "btn ghost", text: "Menu", on: { click: () => navigate("/") } }));
  }

  function closeWinOverlay(): void {
    winOverlay.classList.add("hidden");
    // Swap the solving tools for a clean post-solve bar so Next is one tap away.
    controls.classList.add("hidden");
    buildActions(postSolveBar, "bar");
    postSolveBar.classList.remove("hidden");
    banner.replaceChildren();
    if (!filledOut && scored && lastScore) {
      banner.textContent = `🎉 Solved · Score ${lastScore.value}/100`;
    }
    (postSolveBar.querySelector(".btn") as HTMLElement | null)?.focus();
  }

  async function doShare(btn: HTMLElement): Promise<void> {
    const url = puzzleLink(puzzle, fromLibrary);
    const scoreBit = !filledOut && scored && lastScore ? ` (scored ${lastScore.value}/100)` : "";
    const text = `I solved “${puzzle.title}” on Pixelogic in ${formatTime(state.elapsedMs())}${scoreBit}! ▦`;
    const outcome = await shareResult(text, url);
    if (outcome === "copied") {
      const old = btn.textContent;
      btn.textContent = "✓ Link copied!";
      window.setTimeout(() => (btn.textContent = old), 1800);
    } else if (outcome === "failed") {
      banner.textContent = "Couldn't open share — copy the link from the address bar.";
    }
  }

  function goNext(): void {
    const idx = LIBRARY.findIndex((p) => p.id === puzzle.id);
    const next = LIBRARY[(idx + 1) % LIBRARY.length];
    navigate(`/play/${encodeURIComponent(next.id)}`);
  }

  // ---- win-dialog keyboard a11y ----
  function onWinKey(e: KeyboardEvent): void {
    if (winOverlay.classList.contains("hidden")) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeWinOverlay();
      return;
    }
    if (e.key !== "Tab") return;
    const f = Array.from(winCard.querySelectorAll<HTMLElement>('button, [tabindex]:not([tabindex="-1"])')).filter(
      (n) => !n.hasAttribute("disabled") && n.offsetParent !== null,
    );
    if (f.length === 0) {
      e.preventDefault();
      return;
    }
    const first = f[0];
    const last = f[f.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (!winCard.contains(active)) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }
  document.addEventListener("keydown", onWinKey);
  board.cellsEl.addEventListener("pointerdown", onCheckClick, true); // capture before paint

  // ---- start ----
  applySettings();
  state.start();
  refreshControls();
  const tick = window.setInterval(() => {
    if (!solved) timerEl.textContent = formatTime(state.elapsedMs());
  }, 500);

  return () => {
    window.clearInterval(tick);
    document.removeEventListener("keydown", onWinKey);
    board.cellsEl.removeEventListener("pointerdown", onCheckClick, true);
    state.pause();
    flushSave();
    detachInput();
    board.destroy();
  };
}
