import type { Puzzle } from "../engine/types";
import { cluesForGrid } from "../engine/clues";
import { analyzeGrid } from "../engine/generator";
import { getPuzzle, LIBRARY } from "../engine/puzzles";
import { loadSave } from "./persistence";
import { decodePuzzle } from "./shareCodec";
import { renderMenu } from "./views/menu";
import { renderPlay } from "./views/play";
import { renderEditor } from "./views/editor";
import { renderExplainer } from "./views/explainer";

type Cleanup = () => void;

let host: HTMLElement;
let currentCleanup: Cleanup | null = null;

/** Navigate to an app path like "/play/heart". */
export function navigate(path: string): void {
  const target = `#${path}`;
  if (location.hash === target) render();
  else location.hash = target;
}

function findPuzzle(id: string): { puzzle: Puzzle; fromLibrary: boolean } | null {
  const lib = getPuzzle(id);
  if (lib) return { puzzle: lib, fromLibrary: true };
  const user = loadSave().userPuzzles.find((p) => p.id === id);
  if (user) return { puzzle: user, fromLibrary: false };
  return null;
}

function puzzleFromToken(token: string): Puzzle | null {
  try {
    const { solution, title } = decodePuzzle(token);
    const { rowClues, colClues } = cluesForGrid(solution);
    const { difficulty } = analyzeGrid(solution);
    return {
      id: "shared",
      title,
      width: solution[0].length,
      height: solution.length,
      solution,
      rowClues,
      colClues,
      difficulty,
    };
  } catch {
    return null;
  }
}

function render(): void {
  currentCleanup?.();
  currentCleanup = null;
  host.scrollTo?.({ top: 0 });
  window.scrollTo(0, 0);

  const raw = location.hash.replace(/^#/, "") || "/";
  const segments = raw.split("/").filter(Boolean);
  const [route, arg] = segments;

  if (!route) {
    renderMenu(host);
    return;
  }
  if (route === "editor") {
    currentCleanup = renderEditor(host);
    return;
  }
  if (route === "play" && arg) {
    const found = findPuzzle(decodeURIComponent(arg));
    if (found) {
      currentCleanup = renderPlay(host, found.puzzle, found.fromLibrary);
      return;
    }
  }
  if (route === "explain" && arg) {
    const found = findPuzzle(decodeURIComponent(arg));
    if (found) {
      currentCleanup = renderExplainer(host, found.puzzle);
      return;
    }
  }
  if (route === "p" && arg) {
    const puzzle = puzzleFromToken(arg);
    if (puzzle) {
      currentCleanup = renderPlay(host, puzzle, false);
      return;
    }
  }

  // Unknown / not found → menu.
  renderMenu(host);
}

export function startRouter(appHost: HTMLElement): void {
  host = appHost;
  window.addEventListener("hashchange", render);
  render();
}

export { LIBRARY };
