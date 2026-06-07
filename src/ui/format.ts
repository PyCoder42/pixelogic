import type { Difficulty } from "../engine/types";

/** Format elapsed milliseconds as M:SS (or H:MM:SS past an hour). */
export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const ss = String(seconds).padStart(2, "0");
  if (hours > 0) {
    const mm = String(minutes).padStart(2, "0");
    return `${hours}:${mm}:${ss}`;
  }
  return `${minutes}:${ss}`;
}

export interface DifficultyMeta {
  label: string;
  className: string;
}

export function difficultyMeta(d: Difficulty): DifficultyMeta {
  switch (d) {
    case "easy":
      return { label: "Easy", className: "diff-easy" };
    case "medium":
      return { label: "Medium", className: "diff-medium" };
    case "hard":
      return { label: "Hard", className: "diff-hard" };
    case "expert":
      return { label: "Extra Hard", className: "diff-expert" };
    case "max":
      return { label: "MAX", className: "diff-max" };
  }
}

/** A short human label for a puzzle's grid size, e.g. "10 × 10". */
export function sizeLabel(width: number, height: number): string {
  return `${width} × ${height}`;
}
