// Puzzle badges: self-descriptive traits that hint at how a puzzle will feel to
// solve. Badges that make a puzzle easier reduce how much it contributes to the
// overall Pixelogic Score (per-puzzle 0–100 scores stay normalized); a badge
// with a multiplier above 1 would make a puzzle count for more.

import type { Puzzle } from "./types";
import { detectSymmetry } from "./symmetry";

export type BadgeKey = "symmetric" | "named" | "patterned";

export interface Badge {
  key: BadgeKey;
  /** Chip text, e.g. "◈ Symmetric · H+V". */
  label: string;
  /** Weight applied to this puzzle's share of the Pixelogic Score. <1 = easier. */
  multiplier: number;
  /** One-line explanation shown on the badge's filter page. */
  blurb: string;
}

export const BADGE_INFO: Record<BadgeKey, { name: string; icon: string; multiplier: number; blurb: string }> = {
  symmetric: {
    name: "Symmetric",
    icon: "◈",
    multiplier: 0.85,
    blurb: "The picture mirrors itself, so every deduction on one side gives you the other side for free.",
  },
  named: {
    name: "Name hint",
    icon: "🏷",
    multiplier: 0.9,
    blurb: "The title tells you what you're drawing, so you can often guess where the picture is headed.",
  },
  patterned: {
    name: "Patterned",
    icon: "▤",
    multiplier: 0.8,
    blurb: "Every row and column is one solid run — once the shape starts, you mostly continue the pattern.",
  },
};

/** True when every row AND every column contains at most one run of filled
 *  cells — the shape is a single "convex-ish" block you can continue. */
export function detectPatterned(grid: boolean[][]): boolean {
  const runs = (line: boolean[]): number => {
    let n = 0;
    let inRun = false;
    for (const v of line) {
      if (v && !inRun) {
        n++;
        inRun = true;
      } else if (!v) {
        inRun = false;
      }
    }
    return n;
  };
  if (grid.length === 0) return false;
  if (grid.some((row) => runs(row) > 1)) return false;
  for (let c = 0; c < grid[0].length; c++) {
    if (runs(grid.map((r) => r[c])) > 1) return false;
  }
  return true;
}

/** Human detail for the symmetric badge: which way the picture mirrors. */
export function symmetryDetail(grid: boolean[][]): string | null {
  const s = detectSymmetry(grid);
  if (s.horizontal && s.vertical) return "H+V";
  if (s.horizontal) return "H";
  if (s.vertical) return "V";
  if (s.rotational) return "180°";
  return null;
}

/** All badges that apply to a puzzle (auto-detected + the curated name flag). */
export function puzzleBadges(puzzle: Pick<Puzzle, "solution" | "named">): Badge[] {
  const badges: Badge[] = [];
  const sym = symmetryDetail(puzzle.solution);
  if (sym) {
    const info = BADGE_INFO.symmetric;
    badges.push({
      key: "symmetric",
      label: `${info.icon} ${info.name} · ${sym}`,
      multiplier: info.multiplier,
      blurb: info.blurb,
    });
  }
  if (puzzle.named) {
    const info = BADGE_INFO.named;
    badges.push({ key: "named", label: `${info.icon} ${info.name}`, multiplier: info.multiplier, blurb: info.blurb });
  }
  if (detectPatterned(puzzle.solution)) {
    const info = BADGE_INFO.patterned;
    badges.push({ key: "patterned", label: `${info.icon} ${info.name}`, multiplier: info.multiplier, blurb: info.blurb });
  }
  return badges;
}

/** Combined Pixelogic-Score weight multiplier for a puzzle's badges. */
export function badgeWeightMultiplier(badges: Badge[]): number {
  return badges.reduce((m, b) => m * b.multiplier, 1);
}
