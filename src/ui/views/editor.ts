import type { Puzzle } from "../../engine/types";
import { cluesForGrid } from "../../engine/clues";
import { analyzeGrid } from "../../engine/generator";
import { createBoard, type Board } from "../render";
import { el, mount } from "../dom";
import { difficultyMeta } from "../format";
import { saveUserPuzzle } from "../persistence";
import { encodePuzzle } from "../shareCodec";
import { navigate } from "../router";

type Cleanup = () => void;

const SIZES = [5, 8, 10, 12, 15];

export function renderEditor(host: HTMLElement, initial?: { solution: boolean[][]; title: string }): Cleanup {
  let width = initial?.solution[0]?.length ?? 10;
  let height = initial?.solution.length ?? 10;
  let solution: boolean[][] =
    initial?.solution.map((row) => row.slice()) ??
    Array.from({ length: height }, () => Array<boolean>(width).fill(false));
  let board: Board | null = null;
  let dragging = false;
  let paintVal = true;

  const boardWrap = el("div", { class: "board-wrap editor-board" });
  const verdict = el("div", { class: "verdict", attrs: { "aria-live": "polite" } });
  const titleInput = el("input", {
    class: "title-input",
    attrs: { type: "text", placeholder: "Name your puzzle", maxlength: "40", value: initial?.title ?? "" },
  }) as HTMLInputElement;

  const sizeSelect = el("select", { class: "size-select", attrs: { "aria-label": "Grid size" } }) as HTMLSelectElement;
  for (const s of SIZES) {
    const opt = el("option", { text: `${s} × ${s}`, attrs: { value: String(s) } });
    if (s === width) opt.setAttribute("selected", "");
    sizeSelect.append(opt);
  }
  sizeSelect.addEventListener("change", () => {
    const s = Number(sizeSelect.value);
    width = height = s;
    solution = Array.from({ length: height }, () => Array<boolean>(width).fill(false));
    rebuild();
  });

  const saveBtn = el("button", { class: "btn primary", text: "💾 Save", on: { click: save } });
  const playBtn = el("button", { class: "btn", text: "▶ Play", on: { click: play } });
  const linkBtn = el("button", { class: "btn", text: "🔗 Copy link", on: { click: copyLink } });
  const clearBtn = el("button", { class: "btn ghost", text: "Clear", on: { click: clearGrid } });

  const view = el("div", { class: "view editor" }, [
    el("header", { class: "play-header" }, [
      el("button", { class: "btn ghost back-btn", text: "‹ Menu", on: { click: () => navigate("/") } }),
      el("div", { class: "play-title" }, [el("h1", { text: "Create a puzzle" })]),
      el("div", { class: "editor-size" }, [sizeSelect]),
    ]),
    el("p", { class: "editor-hint", text: "Tap or drag to draw. The clues and a uniqueness check update as you go." }),
    boardWrap,
    verdict,
    el("div", { class: "editor-form" }, [titleInput]),
    el("div", { class: "controls" }, [
      el("div", { class: "control-group" }, [saveBtn, playBtn, linkBtn]),
      el("div", { class: "control-group" }, [clearBtn]),
    ]),
    el("div", { class: "banner", attrs: { id: "editor-toast" } }),
  ]);
  mount(host, view);

  // ---- drawing ----
  function cellFromPoint(x: number, y: number): [number, number] | null {
    if (!board) return null;
    const target = document.elementFromPoint(x, y) as HTMLElement | null;
    if (!target || !board.cellsEl.contains(target)) return null;
    const cell = target.closest<HTMLElement>(".cell");
    if (!cell || cell.dataset.r === undefined) return null;
    return [Number(cell.dataset.r), Number(cell.dataset.c)];
  }

  function paint(r: number, c: number, value: boolean): void {
    if (solution[r][c] === value) return;
    solution[r][c] = value;
    const cell = board?.cellsEl.querySelector<HTMLElement>(`.cell[data-r="${r}"][data-c="${c}"]`);
    cell?.classList.toggle("filled", value);
  }

  function onPointerDown(e: PointerEvent): void {
    const hit = cellFromPoint(e.clientX, e.clientY);
    if (!hit) return;
    e.preventDefault();
    const [r, c] = hit;
    paintVal = !solution[r][c];
    dragging = true;
    paint(r, c, paintVal);
  }
  function onPointerMove(e: PointerEvent): void {
    if (!dragging) return;
    const hit = cellFromPoint(e.clientX, e.clientY);
    if (hit) paint(hit[0], hit[1], paintVal);
  }
  function onPointerUp(): void {
    if (!dragging) return;
    dragging = false;
    rebuild(); // refresh clues + run analysis
  }

  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);

  function rebuild(): void {
    board?.destroy();
    const { rowClues, colClues } = cluesForGrid(solution);
    board = createBoard({
      width,
      height,
      rowClues,
      colClues,
      getCell: (r, c) => (solution[r][c] ? "filled" : "empty"),
      interactive: false,
    });
    board.cellsEl.classList.add("drawable");
    board.cellsEl.addEventListener("pointerdown", onPointerDown);
    board.cellsEl.addEventListener("contextmenu", (e) => e.preventDefault());
    mount(boardWrap, board.element);
    analyze();
  }

  function filledCount(): number {
    return solution.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
  }

  function analyze(): void {
    if (filledCount() === 0) {
      verdict.className = "verdict empty";
      verdict.textContent = "Draw something to get started.";
      saveBtn.toggleAttribute("disabled", true);
      return;
    }
    verdict.className = "verdict checking";
    verdict.textContent = "Checking…";
    saveBtn.toggleAttribute("disabled", true);
    // Defer so the freshly-drawn board paints before the (bounded) solve runs.
    window.setTimeout(() => {
      const a = analyzeGrid(solution);
      if (a.unique) {
        verdict.className = "verdict unique";
        verdict.textContent = `✓ Unique — solvable by logic (${difficultyMeta(a.difficulty).label}).`;
        saveBtn.toggleAttribute("disabled", false);
      } else {
        verdict.className = "verdict ambiguous";
        verdict.textContent = `⚠ Not unique — the clues match ${a.solutionCount}+ different pictures. Tweak it for a fair puzzle.`;
        saveBtn.toggleAttribute("disabled", true);
      }
    }, 0);
  }

  function toast(msg: string): void {
    const t = view.querySelector<HTMLElement>("#editor-toast");
    if (t) t.textContent = msg;
  }

  function buildPuzzle(id: string): Puzzle {
    const { rowClues, colClues } = cluesForGrid(solution);
    const { difficulty } = analyzeGrid(solution);
    return {
      id,
      title: titleInput.value.trim() || "My Puzzle",
      width,
      height,
      solution: solution.map((row) => row.slice()),
      rowClues,
      colClues,
      difficulty,
    };
  }

  function save(): void {
    const puzzle = buildPuzzle(`u-${Date.now().toString(36)}`);
    saveUserPuzzle(puzzle);
    toast(`Saved “${puzzle.title}” to My Puzzles.`);
  }

  function play(): void {
    const token = encodePuzzle(solution, titleInput.value.trim() || "My Puzzle");
    navigate(`/p/${token}`);
  }

  async function copyLink(): Promise<void> {
    const token = encodePuzzle(solution, titleInput.value.trim() || "My Puzzle");
    const url = `${location.origin}${location.pathname}#/p/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied to clipboard!");
    } catch {
      toast(url);
    }
  }

  function clearGrid(): void {
    solution = Array.from({ length: height }, () => Array<boolean>(width).fill(false));
    rebuild();
  }

  rebuild();

  return () => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    board?.destroy();
  };
}
