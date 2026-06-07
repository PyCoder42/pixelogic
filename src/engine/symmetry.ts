// Symmetry detection. A symmetric picture leaks information (one half implies the
// other), so the game caps symmetric puzzles at "hard" and flags them with a chip.

export interface Symmetry {
  /** Mirror across the vertical centre axis (left ↔ right). */
  horizontal: boolean;
  /** Mirror across the horizontal centre axis (top ↔ bottom). */
  vertical: boolean;
  /** 180° rotation maps the picture onto itself. */
  rotational: boolean;
}

export function detectSymmetry(grid: boolean[][]): Symmetry {
  const h = grid.length;
  const w = h > 0 ? grid[0].length : 0;
  let horizontal = true;
  let vertical = true;
  let rotational = true;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (grid[r][c] !== grid[r][w - 1 - c]) horizontal = false;
      if (grid[r][c] !== grid[h - 1 - r][c]) vertical = false;
      if (grid[r][c] !== grid[h - 1 - r][w - 1 - c]) rotational = false;
    }
  }
  return { horizontal, vertical, rotational };
}

/** True if the picture has any mirror or 180° rotational symmetry. */
export function isSymmetric(grid: boolean[][]): boolean {
  const s = detectSymmetry(grid);
  return s.horizontal || s.vertical || s.rotational;
}
