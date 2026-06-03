import type { Puzzle, Difficulty } from "../../engine/types";
import { LIBRARY, DIFFICULTY_ORDER } from "../../engine/puzzles";
import { el, mount } from "../dom";
import { difficultyMeta, sizeLabel } from "../format";
import { loadSave, deleteUserPuzzle } from "../persistence";
import { navigate } from "../router";

const DIFF_HEADING: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  expert: "Expert",
};

export function renderMenu(host: HTMLElement): void {
  const save = loadSave();
  const completed = new Set(save.completed);

  function puzzleCard(p: Puzzle, opts: { deletable?: boolean } = {}): HTMLElement {
    const meta = difficultyMeta(p.difficulty);
    const done = completed.has(p.id);
    const card = el(
      "button",
      {
        class: `puzzle-card ${done ? "done" : ""}`,
        attrs: { type: "button", "aria-label": `Play ${p.title}` },
        on: { click: () => navigate(`/play/${encodeURIComponent(p.id)}`) },
      },
      [
        el("div", { class: "card-icon", text: done ? "✓" : "▦" }),
        el("div", { class: "card-body" }, [
          el("span", { class: "card-title", text: p.title }),
          el("span", { class: "card-meta", text: sizeLabel(p.width, p.height) }),
        ]),
        el("span", { class: `chip ${meta.className}`, text: meta.label }),
      ],
    );
    if (opts.deletable) {
      const del = el("span", {
        class: "card-delete",
        text: "🗑",
        attrs: { role: "button", "aria-label": `Delete ${p.title}`, title: "Delete" },
        on: {
          click: (e) => {
            e.stopPropagation();
            deleteUserPuzzle(p.id);
            renderMenu(host);
          },
        },
      });
      card.append(del);
    }
    return card;
  }

  function section(title: string, puzzles: Puzzle[], deletable = false): HTMLElement | null {
    if (puzzles.length === 0) return null;
    return el("section", { class: "menu-section" }, [
      el("h2", { class: "section-title", text: title }),
      el(
        "div",
        { class: "card-grid" },
        puzzles.map((p) => puzzleCard(p, { deletable })),
      ),
    ]);
  }

  const sections: (HTMLElement | null)[] = DIFFICULTY_ORDER.map((d) =>
    section(
      DIFF_HEADING[d],
      LIBRARY.filter((p) => p.difficulty === d),
    ),
  );

  if (save.userPuzzles.length > 0) {
    sections.push(section("My Puzzles", save.userPuzzles, true));
  }

  const progressLine =
    completed.size > 0
      ? `${completed.size} of ${LIBRARY.length} solved`
      : "Pick a puzzle and deduce the hidden picture from the number clues.";

  const view = el("div", { class: "view menu" }, [
    el("header", { class: "menu-header" }, [
      el("div", { class: "brand" }, [
        el("span", { class: "logo", text: "▦" }),
        el("h1", { text: "Pixelogic" }),
      ]),
      el("p", { class: "tagline", text: progressLine }),
      el("div", { class: "menu-actions" }, [
        el("button", {
          class: "btn primary",
          text: "✏️ Create your own",
          on: { click: () => navigate("/editor") },
        }),
      ]),
    ]),
    ...sections.filter((s): s is HTMLElement => s !== null),
    el("footer", { class: "menu-footer" }, [
      el("p", {
        html: 'Every puzzle is <strong>provably solvable by logic alone</strong> — no guessing required.',
      }),
    ]),
  ]);

  mount(host, view);
}
