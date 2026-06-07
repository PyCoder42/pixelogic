import type { Puzzle, Difficulty } from "../../engine/types";
import { LIBRARY, DIFFICULTY_ORDER } from "../../engine/puzzles";
import { el, mount } from "../dom";
import { difficultyMeta, sizeLabel, formatTime } from "../format";
import { loadSave, deleteUserPuzzle, getBestTime } from "../persistence";
import { openSettings } from "../settings";
import { navigate } from "../router";

const DIFF_HEADING: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  expert: "Extra Hard",
  max: "Max",
};

/** A small icon affordance inside a puzzle card (mouse + keyboard activatable). */
function actionIcon(
  glyph: string,
  ariaLabel: string,
  title: string,
  className: string,
  onActivate: () => void,
): HTMLElement {
  const activate = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
    onActivate();
  };
  return el("span", {
    class: className,
    text: glyph,
    attrs: { role: "button", tabindex: "0", "aria-label": ariaLabel, title },
    on: {
      click: activate,
      keydown: (e) => {
        const ev = e as KeyboardEvent;
        if (ev.key === "Enter" || ev.key === " ") activate(e);
      },
    },
  });
}

export function renderMenu(host: HTMLElement): void {
  const save = loadSave();
  const completed = new Set(save.completed);

  function puzzleCard(p: Puzzle, opts: { editable?: boolean } = {}): HTMLElement {
    const meta = difficultyMeta(p.difficulty);
    const done = completed.has(p.id);
    const best = getBestTime(p.id);
    const card = el(
      "button",
      {
        class: `puzzle-card ${done ? "done" : ""}`,
        attrs: { type: "button", "aria-label": `Play ${p.title}` },
        on: { click: () => navigate(`/play/${encodeURIComponent(p.id)}`) },
      },
      [
        el("div", { class: "card-top" }, [
          el("div", { class: "card-icon", text: done ? "✓" : "▦" }),
          el("span", { class: `chip ${meta.className}`, text: meta.label }),
        ]),
        el("span", { class: "card-title", text: p.title }),
        el("span", { class: "card-meta" }, [
          el("span", { text: sizeLabel(p.width, p.height) }),
          done && best !== undefined
            ? el("span", { class: "best-time", text: `🏅 ${formatTime(best)}` })
            : null,
        ]),
      ],
    );
    if (opts.editable) {
      const delBtn = actionIcon("🗑", `Delete ${p.title}`, "Delete", "card-action danger", () => {
        if (card.classList.contains("confirm-delete")) {
          deleteUserPuzzle(p.id);
          renderMenu(host);
        } else {
          card.classList.add("confirm-delete");
          // Announce the armed state to assistive tech (the visual hint alone isn't read out).
          delBtn.setAttribute("aria-label", `Confirm delete ${p.title}`);
          window.setTimeout(() => {
            card.classList.remove("confirm-delete");
            delBtn.setAttribute("aria-label", `Delete ${p.title}`);
          }, 2600);
        }
      });
      const actions = el("div", { class: "card-actions" }, [
        actionIcon("✏️", `Edit ${p.title}`, "Edit", "card-action", () => {
          navigate(`/editor/${encodeURIComponent(p.id)}`);
        }),
        delBtn,
      ]);
      card.append(actions, el("span", { class: "delete-hint", text: "Tap 🗑 again to delete" }));
    }
    return card;
  }

  function section(title: string, puzzles: Puzzle[], editable = false): HTMLElement | null {
    if (puzzles.length === 0) return null;
    return el("section", { class: "menu-section" }, [
      el("h2", { class: "section-title", text: title }),
      el("div", { class: "card-grid" }, puzzles.map((p) => puzzleCard(p, { editable }))),
    ]);
  }

  const sections: (HTMLElement | null)[] = DIFFICULTY_ORDER.map((d) =>
    section(DIFF_HEADING[d], LIBRARY.filter((p) => p.difficulty === d)),
  );

  // ---- custom puzzles, grouped into difficulty categories ----
  if (save.userPuzzles.length > 0) {
    const groups = DIFFICULTY_ORDER.map((d) => ({
      d,
      list: save.userPuzzles.filter((p) => p.difficulty === d),
    })).filter((g) => g.list.length > 0);

    const subsections = groups.map((g) =>
      el("div", { class: "menu-subsection" }, [
        el("h3", { class: "subsection-title" }, [
          el("span", { class: `chip ${difficultyMeta(g.d).className}`, text: DIFF_HEADING[g.d] }),
          el("span", { class: "subsection-count", text: `${g.list.length}` }),
        ]),
        el("div", { class: "card-grid" }, g.list.map((p) => puzzleCard(p, { editable: true }))),
      ]),
    );

    sections.push(
      el("section", { class: "menu-section my-puzzles" }, [
        el("h2", { class: "section-title", text: "My Puzzles" }),
        ...subsections,
      ]),
    );
  }

  const progressLine =
    completed.size > 0
      ? `${completed.size} of ${LIBRARY.length} solved`
      : "Pick a puzzle and deduce the hidden picture from the number clues.";

  const view = el("div", { class: "view menu" }, [
    el("div", { class: "menu-tools" }, [
      el("button", {
        class: "icon-btn",
        text: "🎓",
        attrs: { type: "button", "aria-label": "How to play tutorial", title: "How to play" },
        on: { click: () => navigate("/tutorial") },
      }),
      el("button", {
        class: "icon-btn",
        text: "⚙",
        attrs: { type: "button", "aria-label": "Settings", title: "Settings" },
        on: { click: () => openSettings("home", () => renderMenu(host)) },
      }),
    ]),
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
        el("button", {
          class: "btn",
          text: "🎲 Surprise me",
          on: {
            click: () => {
              const unsolved = LIBRARY.filter((p) => !completed.has(p.id));
              const pool = unsolved.length ? unsolved : LIBRARY;
              const pick = pool[Math.floor(Math.random() * pool.length)];
              navigate(`/play/${encodeURIComponent(pick.id)}`);
            },
          },
        }),
        el("button", {
          class: "btn",
          text: "🎓 How to play",
          on: { click: () => navigate("/tutorial") },
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
