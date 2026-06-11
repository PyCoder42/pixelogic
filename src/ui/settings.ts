import { el } from "./dom";
import { openModal } from "./modal";
import { getSettings, setSettings, resetProgress, type Settings, type ClueStyle } from "./persistence";

type SettingKey = keyof Settings;

function toggleRow(
  label: string,
  desc: string,
  key: SettingKey,
  current: boolean,
  onToggle: (value: boolean) => void,
): HTMLElement {
  let value = current;
  const sw = el("button", {
    class: `switch ${value ? "on" : ""}`,
    attrs: { type: "button", role: "switch", "aria-checked": String(value), "aria-label": label },
  });
  const knob = el("span", { class: "switch-knob" });
  sw.append(knob);
  sw.addEventListener("click", () => {
    value = !value;
    sw.classList.toggle("on", value);
    sw.setAttribute("aria-checked", String(value));
    setSettings({ [key]: value } as Partial<Settings>);
    onToggle(value);
  });
  return el("div", { class: "setting-row" }, [
    el("div", { class: "setting-text" }, [
      el("span", { class: "setting-label", text: label }),
      el("span", { class: "setting-desc", text: desc }),
    ]),
    sw,
  ]);
}

/** A labelled <select> settings row. */
function selectRow(
  label: string,
  desc: string,
  options: Array<{ value: string; label: string }>,
  current: string,
  onPick: (value: string) => void,
): HTMLElement {
  const select = el("select", { class: "setting-select", attrs: { "aria-label": label } }) as HTMLSelectElement;
  for (const o of options) {
    const opt = el("option", { text: o.label, attrs: { value: o.value } });
    if (o.value === current) opt.setAttribute("selected", "");
    select.append(opt);
  }
  select.addEventListener("change", () => onPick(select.value));
  return el("div", { class: "setting-row" }, [
    el("div", { class: "setting-text" }, [
      el("span", { class: "setting-label", text: label }),
      el("span", { class: "setting-desc", text: desc }),
    ]),
    select,
  ]);
}

export type SettingsScope = "home" | "game";

/** Open the settings modal. `onChange` fires when any setting changes or progress is reset. */
export function openSettings(scope: SettingsScope, onChange?: () => void): void {
  const settings = getSettings();
  const rows: HTMLElement[] = [
    toggleRow("Auto-check mistakes", "Highlight filled cells that don't belong.", "mistakeCheck", settings.mistakeCheck, () => onChange?.()),
    toggleRow("Show timer", "Display the puzzle timer while you play.", "showTimer", settings.showTimer, () => onChange?.()),
    toggleRow(
      "Auto-cross finished lines",
      "When a line's clue is met, cross out its leftover cells for you.",
      "autoCross",
      settings.autoCross,
      () => onChange?.(),
    ),
    selectRow(
      "Completed clues",
      "How a clue looks once its line is finished.",
      [
        { value: "grey", label: "Grey out" },
        { value: "strike", label: "Strike through" },
        { value: "hide", label: "Hide them" },
        { value: "none", label: "Leave them" },
      ],
      settings.clueStyle,
      (value) => {
        setSettings({ clueStyle: value as ClueStyle });
        onChange?.();
      },
    ),
  ];

  const body = el("div", { class: "settings-body" }, rows);

  if (scope === "home") {
    const dangerActions = el("div", { class: "danger-actions" });
    const resetBtn = el("button", {
      class: "btn danger",
      text: "Reset progress",
      on: {
        click: () => {
          dangerActions.replaceChildren(
            el("span", { class: "confirm-text", text: "Erase all progress?" }),
            el("button", {
              class: "btn danger",
              text: "Yes, reset",
              on: {
                click: () => {
                  resetProgress();
                  onChange?.();
                  modal.close();
                },
              },
            }),
            el("button", {
              class: "btn ghost",
              text: "Cancel",
              on: { click: () => dangerActions.replaceChildren(resetBtn) },
            }),
          );
        },
      },
    });
    dangerActions.append(resetBtn);
    body.append(
      el("div", { class: "danger-zone" }, [
        el("h3", { text: "⚠ Danger Zone" }),
        el("p", { class: "danger-desc", text: "Clears solved puzzles and saved progress. Your custom puzzles are kept." }),
        dangerActions,
      ]),
    );
  }

  const modal = openModal({
    title: scope === "home" ? "Settings" : "Game settings",
    body,
    className: "settings-modal",
  });
}

/** Open the "How to play" rules modal. */
export function openRules(): void {
  const body = el("div", { class: "rules-body" });
  body.innerHTML = `
    <p>Each puzzle hides a picture. The numbers along every row and column tell you
    the lengths of the <strong>runs of filled cells</strong> in that line, in order.</p>
    <ul>
      <li><strong>Fill</strong> a cell you're sure belongs to the picture.</li>
      <li><strong>Cross</strong> (✕) a cell you're sure is empty — right-click, or switch to Cross mode.</li>
      <li>A clue like <code>3&nbsp;1</code> means a run of 3, then a gap, then a run of 1.</li>
      <li>A clue greys out once that line's filled cells match it (change the style in Settings).</li>
    </ul>
    <p>Every Pixelogic puzzle has exactly one solution and can be reached by logic alone —
    no guessing. Stuck? Use <strong>Hint</strong> for the next deduction, or
    <strong>Watch solve</strong> to see it worked out step by step.</p>
  `;
  openModal({ title: "How to play", body, className: "rules-modal" });
}
