import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.SMOKE_URL ?? "http://localhost:4173/pixelogic/";
const SHOTS = process.env.SMOKE_SHOTS ?? "/tmp/pixelogic-shots";
mkdirSync(SHOTS, { recursive: true });

const failures = [];
const consoleErrors = [];
function check(name, cond) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    console.log(`  ✗ ${name}`);
    failures.push(name);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1120, height: 900 } });

page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

try {
  // ---------- Menu ----------
  console.log("Menu:");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector(".menu");
  const brand = await page.textContent(".brand h1");
  check("brand reads Pixelogic", brand?.trim() === "Pixelogic");
  const cardCount = await page.locator(".puzzle-card").count();
  check("library cards render (>=20)", cardCount >= 20);
  const sectionCount = await page.locator(".menu-section").count();
  check("difficulty sections render (>=3)", sectionCount >= 3);
  await page.screenshot({ path: `${SHOTS}/01-menu.png`, fullPage: true });

  // ---------- Play ----------
  console.log("Play:");
  await page.goto(`${BASE}#/play/plus`, { waitUntil: "networkidle" });
  await page.waitForSelector(".board-cells");
  const cells = await page.locator(".cell").count();
  check("play board has 25 cells", cells === 25);
  check("row clues render", (await page.locator(".row-clue").count()) === 5);
  check("col clues render", (await page.locator(".col-clue").count()) === 5);

  // fill a correct cell (Plus has filled cells across row 2)
  await page.click('.cell[data-r="2"][data-c="0"]');
  check(
    "click fills a cell",
    await page.locator('.cell[data-r="2"][data-c="0"]').evaluate((e) => e.classList.contains("filled")),
  );

  // switch to cross mode and cross a cell
  await page.click(".seg:has-text('Cross')");
  await page.click('.cell[data-r="0"][data-c="0"]');
  check(
    "cross mode marks an X",
    await page.locator('.cell[data-r="0"][data-c="0"]').evaluate((e) => e.classList.contains("cross")),
  );

  // hint
  await page.click(".btn:has-text('Hint')");
  await sleep(150);
  const banner = await page.textContent(".banner");
  check("hint shows a reason", !!banner && banner.includes("must be"));
  check("hint highlights a cell", (await page.locator(".cell.hinted").count()) >= 1);
  await page.screenshot({ path: `${SHOTS}/02-play.png`, fullPage: true });

  // solve it for real -> "Solved!" win
  await page.click(".seg:has-text('Fill')");
  const plusCells = [
    [0, 2], [1, 2], [2, 1], [2, 2], [2, 3], [2, 4], [3, 2], [4, 2],
  ]; // (2,0) is already filled from earlier
  for (const [r, c] of plusCells) await page.click(`.cell[data-r="${r}"][data-c="${c}"]`);
  await page.waitForSelector(".win-overlay:not(.hidden)", { timeout: 4000 });
  check("solving triggers Solved! overlay", (await page.textContent(".win-card h2"))?.trim() === "Solved!");
  await page.screenshot({ path: `${SHOTS}/03-win.png` });

  // reveal path on a fresh puzzle shows "Revealed" (it must not count as a solve)
  await page.goto(`${BASE}#/play/smiley`, { waitUntil: "networkidle" });
  await page.waitForSelector(".board-cells");
  await page.click(".btn:has-text('Reveal')");
  await page.waitForSelector(".win-overlay:not(.hidden)", { timeout: 4000 });
  check("reveal shows Revealed (not Solved!)", (await page.textContent(".win-card h2"))?.trim() === "Revealed");

  // ---------- Editor ----------
  console.log("Editor:");
  await page.goto(`${BASE}#/editor`, { waitUntil: "networkidle" });
  await page.waitForSelector(".board-cells.drawable");
  await page.selectOption(".size-select", "5");
  await page.waitForTimeout(100);
  // draw a Plus (unique, line-solvable)
  const plus = [
    [0, 2], [1, 2], [2, 0], [2, 1], [2, 2], [2, 3], [2, 4], [3, 2], [4, 2],
  ];
  for (const [r, c] of plus) await page.click(`.cell[data-r="${r}"][data-c="${c}"]`);
  await page.waitForTimeout(400);
  const verdict = await page.textContent(".verdict");
  check("editor reports a unique verdict", !!verdict && verdict.includes("Unique"));
  const saveDisabled = await page.locator(".btn:has-text('Save')").isDisabled();
  check("save enabled for a unique puzzle", saveDisabled === false);
  await page.screenshot({ path: `${SHOTS}/04-editor.png`, fullPage: true });

  // ---------- Explainer ----------
  console.log("Explainer:");
  await page.goto(`${BASE}#/explain/plus`, { waitUntil: "networkidle" });
  await page.waitForSelector(".explainer .board-cells");
  await page.click(".btn:has-text('Step')");
  await page.click(".btn:has-text('Step')");
  const progress = await page.textContent(".explain-progress");
  check("explainer advances steps", !!progress && !progress.startsWith("0 "));
  await page.screenshot({ path: `${SHOTS}/05-explainer.png`, fullPage: true });

  // ---------- 15x15 desktop ----------
  console.log("Dense board:");
  await page.goto(`${BASE}#/play/tree`, { waitUntil: "networkidle" });
  await page.waitForSelector(".board-cells");
  check("15x15 board has 225 cells", (await page.locator(".cell").count()) === 225);
  await page.screenshot({ path: `${SHOTS}/08-play15.png`, fullPage: true });

  // ---------- Mobile ----------
  console.log("Mobile:");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector(".menu");
  await page.screenshot({ path: `${SHOTS}/06-mobile-menu.png`, fullPage: true });
  await page.goto(`${BASE}#/play/heart`, { waitUntil: "networkidle" });
  await page.waitForSelector(".board-cells");
  const mobileBoardBox = await page.locator(".board").boundingBox();
  check("mobile board fits viewport width", !!mobileBoardBox && mobileBoardBox.width <= 390);
  await page.screenshot({ path: `${SHOTS}/07-mobile-play.png`, fullPage: true });
} catch (err) {
  failures.push(`EXCEPTION: ${err.message}`);
} finally {
  await browser.close();
}

console.log("\nConsole errors:", consoleErrors.length);
for (const e of consoleErrors) console.log("  !", e);

const realConsoleErrors = consoleErrors.filter((e) => !/fonts\.g(oogleapis|static)/.test(e));
if (failures.length === 0 && realConsoleErrors.length === 0) {
  console.log("\nSMOKE OK");
  process.exit(0);
} else {
  console.log(`\nSMOKE FAIL — ${failures.length} checks, ${realConsoleErrors.length} console errors`);
  process.exit(1);
}
