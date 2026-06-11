import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.SMOKE_URL ?? "http://localhost:4173/pixelogic/";
const SHOTS = process.env.SMOKE_SHOTS ?? "/tmp/pixelogic-shots";
mkdirSync(SHOTS, { recursive: true });

const failures = [];
const consoleErrors = [];
function check(name, cond) {
  console.log(`  ${cond ? "✓" : "✗"} ${name}`);
  if (!cond) failures.push(name);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SEEN = JSON.stringify({
  version: 1, progress: {}, completed: [], bestTimes: {}, bestScores: {}, assists: {},
  userPuzzles: [], settings: { mistakeCheck: false, showTimer: true, clueStyle: "grey", autoCross: false },
  tutorialSeen: true, progressReset: false,
});
const PLUS = [[0, 2], [1, 2], [2, 0], [2, 1], [2, 2], [2, 3], [2, 4], [3, 2], [4, 2]];

const browser = await chromium.launch();
function wire(page) {
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
}

try {
  // =============== First-run tutorial: redirect + robustness ===============
  console.log("Tutorial:");
  {
    const ctx = await browser.newContext({ viewport: { width: 1120, height: 900 } });
    const page = await ctx.newPage();
    wire(page);
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".view.tutorial", { timeout: 6000 });
    check("first visit redirects to the tutorial route", /#\/tutorial$/.test(page.url()));
    await page.screenshot({ path: `${SHOTS}/01-tutorial.png`, fullPage: true });
    // Robustness: solve the PICTURE without doing the scripted cross → must complete.
    await page.click(".tut-bubble .btn:has-text('Next')"); // info → fill step
    await sleep(150);
    for (let c = 0; c < 5; c++) await page.click(`.cell[data-r="2"][data-c="${c}"]`); // fill row
    await sleep(500); // auto-advances to the cross step (cross mode)
    await page.click(".segmented .seg:has-text('Fill')"); // switch back to fill — ignore the cross
    for (const [r, c] of [[0, 2], [1, 2], [3, 2], [4, 2]]) await page.click(`.cell[data-r="${r}"][data-c="${c}"]`);
    await sleep(400);
    const finalBtn = page.locator(".tut-bubble .btn");
    await finalBtn.waitFor({ state: "visible", timeout: 4000 });
    check("solving the picture completes the tutorial (no undo/redo trap)", (await finalBtn.textContent())?.includes("Start"));
    await finalBtn.click();
    await page.waitForSelector(".view.menu", { timeout: 4000 });
    check("finishing the tutorial lands on the menu", true);
    await ctx.close();
  }

  const ctx = await browser.newContext({ viewport: { width: 1240, height: 1000 } });
  await ctx.addInitScript((s) => { if (!localStorage.getItem("pixelogic.save.v1")) localStorage.setItem("pixelogic.save.v1", s); }, SEEN);
  const page = await ctx.newPage();
  wire(page);

  // =============== Menu / Pixelogic Score ===============
  console.log("Menu:");
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".view.menu");
  check("Pixelogic Score header present (0 to start)", (await page.textContent(".pixelogic-score .score-value"))?.trim() === "0");
  check("Share-score button present", (await page.locator(".score-share").count()) === 1);
  check("How-to-play button removed from actions", (await page.locator(".menu-actions .btn:has-text('How to play')").count()) === 0);
  check("Surprise me present", (await page.locator(".menu-actions .btn:has-text('Surprise')").count()) === 1);
  const headings = await page.locator(".section-title").allTextContents();
  check("Extra Hard + Max sections exist", headings.some((h) => /Extra Hard/.test(h)) && headings.some((h) => /Max/.test(h)));
  check("library cards show a score pill", (await page.locator(".puzzle-card .score-pill").count()) > 0);
  check("some card shows a symmetry chip", (await page.locator(".puzzle-card .chip-symmetric").count()) > 0);
  await page.screenshot({ path: `${SHOTS}/02-menu.png`, fullPage: true });

  // settings scopes
  await page.click(".menu-tools .icon-btn[aria-label='Settings']");
  await page.waitForSelector(".settings-modal");
  check("home settings has danger-zone reset", (await page.locator(".danger-zone .btn.danger").count()) >= 1);
  await page.screenshot({ path: `${SHOTS}/03-settings.png` });
  await page.click(".settings-modal .modal-close");

  // Surprise me opens a puzzle
  await page.click(".menu-actions .btn:has-text('Surprise')");
  await page.waitForSelector(".view.play .board-cells", { timeout: 4000 });
  check("Surprise me opens a playable puzzle", true);

  // =============== Play: assists + scoring ===============
  console.log("Play:");
  await page.goto(`${BASE}#/play/plus`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".board-cells");
  check("mode toggle renamed to Paint", (await page.locator(".seg:has-text('Paint')").count()) === 1);
  check("Fill out button present", (await page.locator(".btn:has-text('Fill out')").count()) === 1);
  check("Check Square/Line/Board buttons present", (await page.locator(".btn:has-text('Square')").count()) === 1 && (await page.locator(".btn:has-text('Line')").count()) === 1 && (await page.locator(".btn:has-text('Board')").count()) === 1);
  check("old 'Check mistakes' button removed", (await page.locator(".btn:has-text('Check mistakes')").count()) === 0);
  check("assist meter present", (await page.locator(".assist-meter").count()) === 1);
  check("rules + settings + prev/next tools in header", (await page.locator(".play-tools .icon-btn").count()) === 4);

  // Hint costs 20
  await page.click(".btn:has-text('Hint')");
  await sleep(150);
  check("hint records a -20 penalty", /[-−]20/.test(await page.textContent(".assist-meter")));

  // Check square: arm then tap a cell
  await page.click(".btn:has-text('Square')");
  await sleep(80);
  await page.click('.cell[data-r="0"][data-c="0"]'); // reveal (cross) this empty cell
  await sleep(120);
  check("check-square reveals + adds penalty", /[-−]25/.test(await page.textContent(".assist-meter"))); // 20 + 5

  // Solve → score popup
  for (const [r, c] of PLUS) await page.click(`.cell[data-r="${r}"][data-c="${c}"]`);
  await page.waitForSelector(".win-overlay:not(.hidden)", { timeout: 4000 });
  const winScore = (await page.textContent(".win-score"))?.trim() ?? "";
  check("win popup shows a per-puzzle score", /Score:\s*\d+\/100/.test(winScore));
  check("score reflects the assist penalties (<100)", /Score:\s*(\d+)\/100/.test(winScore) && Number(winScore.match(/Score:\s*(\d+)/)[1]) < 100);
  await page.screenshot({ path: `${SHOTS}/04-win-score.png` });

  // Close → post-solve bar with Next
  await page.click(".win-card .modal-close");
  await sleep(150);
  check("post-solve bar appears with Next", (await page.locator(".post-solve:not(.hidden) .btn:has-text('Next')").count()) === 1);
  check("solving tools hidden after closing popup", await page.locator(".controls:not(.post-solve)").first().evaluate((e) => e.classList.contains("hidden")));
  await page.screenshot({ path: `${SHOTS}/05-post-solve.png`, fullPage: true });

  // Pixelogic Score rose
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".view.menu");
  check("Pixelogic Score increased after a scored solve", (await page.textContent(".pixelogic-score .score-value"))?.trim() !== "0");
  check("solved card now shows a numeric score pill", (await page.locator(".puzzle-card .score-pill b").count()) >= 1);

  // Fill out voids the score
  await page.goto(`${BASE}#/play/gem`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".board-cells");
  await page.click(".btn:has-text('Fill out')");
  await page.waitForSelector(".win-overlay:not(.hidden)", { timeout: 4000 });
  check("Fill out yields no score ('Filled out')", (await page.textContent(".win-card h2"))?.trim() === "Filled out");

  // Symmetry footer + zero-line grayness
  await page.goto(`${BASE}#/play/heart`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".board-cells");
  check("symmetric puzzle shows the cyan bottom strip", (await page.locator(".symmetry-strip").count()) === 1);
  check("symmetric puzzle shows header chip", (await page.locator(".play-sub .chip-symmetric").count()) === 1);
  check("empty 0-clue row is greyed", await page.locator(".row-clue[data-r='9']").evaluate((e) => e.classList.contains("done")));
  await page.click('.cell[data-r="9"][data-c="0"]');
  await sleep(80);
  check("0-clue row with a fill is NOT greyed", (await page.locator(".row-clue[data-r='9']").evaluate((e) => e.classList.contains("done"))) === false);

  // =============== Tiers ===============
  console.log("Tiers:");
  await page.goto(`${BASE}#/play/enigma`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".board-cells");
  check("enigma is Extra Hard", (await page.locator(".play-sub .chip:has-text('Extra Hard')").count()) === 1);
  await page.goto(`${BASE}#/play/obsidian`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".board-cells");
  check("obsidian is a 14x14 MAX puzzle", (await page.locator(".cell").count()) === 196 && (await page.locator(".play-sub .chip:has-text('MAX')").count()) === 1);

  // =============== Watch solve: slower + readable ===============
  console.log("Explainer:");
  await page.goto(`${BASE}#/explain/plus`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".explainer .board-cells");
  check("speed control present", (await page.locator(".speed-control .seg").count()) === 3);
  await page.click(".btn:has-text('Step')");
  const cap = await page.textContent(".explain-caption");
  check("caption explains the logic in words", /forced|fills|filled|cross|clue/.test(cap));

  // =============== Editor + mass delete ===============
  console.log("Editor:");
  await page.goto(`${BASE}#/editor`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".board-cells.drawable");
  await page.selectOption(".size-select", "5");
  await sleep(120);
  await page.click('.cell[data-r="0"][data-c="0"]');
  await page.click('.cell[data-r="1"][data-c="1"]');
  await sleep(400);
  check("editor reports non-unique + guidance", (await page.textContent(".verdict"))?.includes("Not unique") && (await page.locator(".verdict-guidance:not(.hidden)").count()) >= 1);
  await page.click(".btn:has-text('Clear')");
  await sleep(120);
  for (const [r, c] of PLUS) await page.click(`.cell[data-r="${r}"][data-c="${c}"]`);
  await page.fill(".title-input", "Mine");
  await page.waitForFunction(() => { const b = [...document.querySelectorAll(".btn")].find((x) => x.textContent.includes("Save")); return b && !b.disabled; }, null, { timeout: 4000 });
  await page.click(".btn:has-text('Save')");
  await page.waitForSelector(".view.menu", { timeout: 4000 });
  check("save returns home with the custom puzzle", (await page.locator(".my-puzzles .puzzle-card:has-text('Mine')").count()) === 1);
  // Manage / mass delete
  await page.click(".my-puzzles .section-head .btn:has-text('Manage')");
  await sleep(120);
  check("Manage mode reveals checkboxes", await page.locator(".my-puzzles.managing").count() === 1 && await page.locator(".my-puzzles .card-select").first().isVisible());
  await page.locator(".my-puzzles .card-select").first().check();
  await page.click(".manage-bar .btn:has-text('Delete selected')");
  await sleep(200);
  check("Delete selected removes the puzzle", (await page.locator(".my-puzzles").count()) === 0);

  // =============== v3: header order, badges, About, settings, autoCross, prev/next ===============
  console.log("v3:");
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".view.menu");
  // #2: score block sits AFTER the tagline and BEFORE the action buttons
  check("score block is below the tagline", await page.evaluate(() => {
    const tag = document.querySelector(".tagline");
    const score = document.querySelector(".score-block");
    return !!tag && !!score && !!(tag.compareDocumentPosition(score) & Node.DOCUMENT_POSITION_FOLLOWING);
  }));
  check("action buttons are below the score block", await page.evaluate(() => {
    const score = document.querySelector(".score-block");
    const actions = document.querySelector(".menu-actions");
    return !!score && !!actions && !!(score.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING);
  }));
  // #7/#9: re-tuned tiers — Diamond is Medium now, Static is MAX
  check("Diamond card is Medium", (await page.locator(".puzzle-card:has-text('Diamond') .chip:has-text('Medium')").count()) === 1);
  check("Static card is MAX", (await page.locator(".puzzle-card:has-text('Static') .chip:has-text('MAX')").count()) === 1);
  // #6: symmetric chip carries the direction detail
  check("symmetric chips name the mirror direction", (await page.locator(".chip-symmetric").first().textContent())?.includes("·"));
  check("patterned + named chips exist", (await page.locator(".chip-patterned").count()) > 0 && (await page.locator(".chip-named").count()) > 0);
  // #3: clicking a badge chip opens its filter page
  await page.locator(".puzzle-card .chip-symmetric").first().click();
  await page.waitForSelector(".view.badge-list", { timeout: 4000 });
  check("badge chip opens the badge page", /#\/badge\/symmetric$/.test(page.url()));
  check("badge page has back button + title", (await page.locator(".back-btn").count()) === 1 && (await page.textContent("h1"))?.includes("Symmetric"));
  check("badge page hides empty tiers", (await page.locator(".badge-list .menu-section .chip:has-text('MAX')").count()) === 0);
  check("badge page shows matching cards", (await page.locator(".badge-list .puzzle-card").count()) > 5);
  await page.goto(`${BASE}#/badge/patterned`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".view.badge-list");
  check("patterned badge page renders", (await page.textContent("h1"))?.includes("Patterned"));
  // #5/#9: About page
  await page.goto(`${BASE}#/about`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".view.about", { timeout: 4000 });
  check("About page renders sections", (await page.locator(".about-section").count()) >= 5);
  const aboutText = await page.textContent(".view.about");
  check("About explains difficulty + AI + score", /what-if/i.test(aboutText) && /AI/.test(aboutText) && /1,?600/.test(aboutText));
  // #8: prev/next from within a puzzle
  await page.goto(`${BASE}#/play/smiley`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".board-cells");
  const beforeTitle = await page.textContent(".play-title h1");
  await page.click(".play-tools .icon-btn[aria-label='Next puzzle']");
  await page.waitForFunction((t) => document.querySelector(".play-title h1")?.textContent !== t, beforeTitle, { timeout: 4000 });
  check("next-puzzle arrow moves to another puzzle unsolved", true);
  await page.click(".play-tools .icon-btn[aria-label='Previous puzzle']");
  await page.waitForFunction((t) => document.querySelector(".play-title h1")?.textContent === t, beforeTitle, { timeout: 4000 });
  check("prev-puzzle arrow returns", true);
  // #1: settings — clue-style select + auto-cross toggle; autoCross behavior
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".view.menu");
  await page.click(".menu-tools .icon-btn[aria-label='Settings']");
  await page.waitForSelector(".settings-modal");
  check("settings has the completed-clues select", (await page.locator(".settings-modal .setting-select").count()) === 1);
  check("settings has the auto-cross toggle", (await page.locator(".settings-modal .switch").count()) === 3);
  check("old dim-clues toggle is gone", !(await page.textContent(".settings-modal"))?.includes("Dim solved"));
  // turn auto-cross ON via its switch (3rd row), pick strike style, then verify in play
  await page.locator(".settings-modal .switch").nth(2).click();
  await page.selectOption(".settings-modal .setting-select", "strike");
  await page.click(".settings-modal .modal-close");
  await page.goto(`${BASE}#/play/plus`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".board-cells");
  await page.click('.cell[data-r="0"][data-c="2"]'); // row 0 clue [1] now met
  await sleep(250);
  check("autoCross crosses the rest of a met line", (await page.locator('.cell[data-r="0"][data-c="0"].cross').count()) === 1);
  check("clue style attribute reflects the setting", (await page.locator('.board[data-clue-style="strike"]').count()) === 1);

  // =============== Mobile ===============
  console.log("Mobile:");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".view.menu");
  check("mobile shows the Pixelogic Score", (await page.locator(".pixelogic-score").count()) === 1);
  await page.screenshot({ path: `${SHOTS}/06-mobile.png`, fullPage: true });
  await page.goto(`${BASE}#/play/obsidian`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".board-cells");
  const box = await page.locator(".board").boundingBox();
  check("mobile MAX board fits viewport width", !!box && box.width <= 390);
  await page.screenshot({ path: `${SHOTS}/07-mobile-play.png`, fullPage: true });

  // =============== Social meta ===============
  check("OG image meta present", (await page.locator('meta[property="og:image"]').count()) === 1);

  await ctx.close();
} catch (err) {
  failures.push(`EXCEPTION: ${err.message}`);
  console.log("EXCEPTION:", err.message.split("\n")[0]);
} finally {
  await browser.close();
}

console.log("\nConsole errors:", consoleErrors.length);
for (const e of consoleErrors) console.log("  !", e);
const real = consoleErrors.filter((e) => !/fonts\.g(oogleapis|static)/.test(e));
if (failures.length === 0 && real.length === 0) {
  console.log("\nSMOKE OK");
  process.exit(0);
}
console.log(`\nSMOKE FAIL — ${failures.length} checks, ${real.length} console errors`);
for (const f of failures) console.log("  -", f);
process.exit(1);
