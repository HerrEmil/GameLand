import { test, expect, type Page } from "@playwright/test";

// 2048 (screen id `tile-2048`) — smoke/playtest. Boots the shell, opens the game
// from the menu, and exercises the canvas render + rAF loop + slide/merge input at
// a phone and a desktop viewport, asserting a clean run: canvas present and sized,
// a non-blank frame, no console error, no unhandled throw, no missing screen-script
// 404. The board seeds two 2-tiles side by side, so a single ArrowLeft always merges
// them into a 4 and banks the score — the deterministic first point the persistence
// check hangs on. Best is captured after returning to the menu (which halts the loop)
// so the "survives reload" assertion is exact. Both keyboard and pointer (swipe)
// input paths are exercised.

const HI_KEY = "gameland.hi.tile-2048";

function isScreenScript(url: string): boolean {
  return /\/scripts\/screen\.[^/]+\.js(\?|$)/.test(url);
}

async function openGame(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("#splash-screen")).toHaveClass(/active/);
  await page.locator("#splash-screen").click();
  await expect(page.locator("#main-menu")).toHaveClass(/active/);
  await page.locator('#main-menu button[name="tile-2048"]').click();
  await expect(page.locator("#tile-2048")).toHaveClass(/active/);
}

function readHi(page: Page): Promise<number> {
  return page.evaluate((k) => Number(localStorage.getItem(k) || 0), HI_KEY);
}

for (const vp of [
  { name: "mobile 375x812", width: 375, height: 812 },
  { name: "desktop 1280x800", width: 1280, height: 800 },
]) {
  test(`2048 boots, merges and persists a score at ${vp.name}`, async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const script404s: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
    page.on("pageerror", (e) => pageErrors.push(String(e)));
    page.on("response", (r) => { if (r.status() >= 400 && isScreenScript(r.url())) script404s.push(`${r.status()} ${r.url()}`); });

    await page.setViewportSize({ width: vp.width, height: vp.height });
    await openGame(page);

    // Canvas is created lazily by run(); it must exist and fill the viewport.
    const canvas = page.locator("#tile-2048 canvas");
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box, "canvas has a layout box").not.toBeNull();
    expect(box!.width).toBeGreaterThan(vp.width - 2);
    expect(box!.height).toBeGreaterThan(vp.height - 2);

    // The two seeded 2-tiles share a row, so ArrowLeft always fuses them into a 4
    // and banks the score. bump() persists a new best immediately, so the first
    // merge writes localStorage.
    await canvas.click();                                   // unlock audio
    let hi = 0;
    for (let i = 0; i < 20 && hi < 1; i++) {
      await page.keyboard.press("ArrowLeft");
      await page.waitForTimeout(140);
      hi = await readHi(page);
    }
    expect(hi, "a merge scored and persisted").toBeGreaterThan(0);

    // Exercise more of the keyboard path and a pointer swipe (no throw / no error).
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowDown");
    const cx = box!.x + box!.width / 2, cy = box!.y + box!.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - Math.min(120, box!.width * 0.3), cy, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(160);

    // Canvas must be actively rendering (non-blank frame).
    const nonBlank = await page.evaluate(() => {
      const cv = document.querySelector("#tile-2048 canvas") as HTMLCanvasElement | null;
      if (!cv) return false;
      const ctx = cv.getContext("2d");
      if (!ctx) return false;
      const { data } = ctx.getImageData(0, 0, Math.min(cv.width, 64), Math.min(cv.height, 64));
      for (let i = 0; i < data.length; i += 4) { if (data[i] || data[i + 1] || data[i + 2]) return true; }
      return false;
    });
    expect(nonBlank, "canvas is drawing pixels").toBe(true);

    // BACK returns to the menu and halts the rAF loop, so the best read next is stable.
    await page.locator("#tile-2048 button").click();
    await expect(page.locator("#main-menu")).toHaveClass(/active/);
    const banked = await readHi(page);
    expect(banked, "best persisted while playing").toBeGreaterThan(0);

    // The persisted best survives a full reload (durable, not just in-memory).
    await page.reload();
    await expect(page.locator("#splash-screen")).toHaveClass(/active/);
    expect(await readHi(page), "high score persists across reload").toBe(banked);

    expect(script404s, "no missing screen-script 404").toEqual([]);
    expect(consoleErrors, "no console error during play").toEqual([]);
    expect(pageErrors, "no unhandled throw during play").toEqual([]);
  });
}
