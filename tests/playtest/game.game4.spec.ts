import { test, expect, type Page } from "@playwright/test";

// Tower Stack (screen id `game4`) — smoke/playtest. Boots the shell, opens the
// game from the menu, exercises the canvas render + rAF loop + one-button drop
// input at a phone and a desktop viewport, and asserts the run is clean: canvas
// present and sized, non-blank frame, no console error, no unhandled throw, no
// missing screen-script 404. It also drives a full run to a fall and checks the
// height is scored and persisted to localStorage across a reload — the game's
// observable score contract.

const HI_KEY = "gameland.hi.game4";

function isScreenScript(url: string): boolean {
  return /\/scripts\/screen\.[^/]+\.js(\?|$)/.test(url);
}

async function openGame4(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("#splash-screen")).toHaveClass(/active/);
  await page.locator("#splash-screen").click();
  await expect(page.locator("#main-menu")).toHaveClass(/active/);
  await page.locator('#main-menu button[name="game4"]').click();
  await expect(page.locator("#game4")).toHaveClass(/active/);
}

function readHi(page: Page): Promise<number> {
  return page.evaluate((k) => Number(localStorage.getItem(k) || 0), HI_KEY);
}

for (const vp of [
  { name: "mobile 375x812", width: 375, height: 812 },
  { name: "desktop 1280x800", width: 1280, height: 800 },
]) {
  test(`tower stack boots, plays and persists a score at ${vp.name}`, async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const script404s: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
    page.on("pageerror", (e) => pageErrors.push(String(e)));
    page.on("response", (r) => { if (r.status() >= 400 && isScreenScript(r.url())) script404s.push(`${r.status()} ${r.url()}`); });

    await page.setViewportSize({ width: vp.width, height: vp.height });
    await openGame4(page);

    // Canvas is created lazily by run(); it must exist and fill the viewport.
    const canvas = page.locator("#game4 canvas");
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box, "canvas has a layout box").not.toBeNull();
    expect(box!.width).toBeGreaterThan(vp.width - 2);
    expect(box!.height).toBeGreaterThan(vp.height - 2);

    // Tap to start the slide, then drop slabs on an off-phase cadence. Non-perfect
    // drops trim the slab, so it narrows and eventually misses -> the run ends and
    // the height is written to localStorage. Stop the instant a best is recorded.
    await canvas.click();                                   // start sliding + unlock audio
    let hi = 0;
    for (let i = 0; i < 40 && hi === 0; i++) {
      await canvas.click();
      await page.waitForTimeout(140);
      hi = await readHi(page);
    }
    expect(hi, "a finished run scored and persisted a positive height").toBeGreaterThan(0);

    // Canvas must be actively rendering (non-blank frame).
    const nonBlank = await page.evaluate(() => {
      const cv = document.querySelector("#game4 canvas") as HTMLCanvasElement | null;
      if (!cv) return false;
      const ctx = cv.getContext("2d");
      if (!ctx) return false;
      const { data } = ctx.getImageData(0, 0, Math.min(cv.width, 64), Math.min(cv.height, 64));
      for (let i = 0; i < data.length; i += 4) { if (data[i] || data[i + 1] || data[i + 2]) return true; }
      return false;
    });
    expect(nonBlank, "canvas is drawing pixels").toBe(true);

    // The persisted best survives a full reload (durable, not just in-memory).
    await page.reload();
    await openGame4(page);
    expect(await readHi(page), "high score persists across reload").toBe(hi);

    // BACK returns to the menu without error.
    await page.locator("#game4 button").click();
    await expect(page.locator("#main-menu")).toHaveClass(/active/);

    expect(script404s, "no missing screen-script 404").toEqual([]);
    expect(consoleErrors, "no console error during play").toEqual([]);
    expect(pageErrors, "no unhandled throw during play").toEqual([]);
  });
}
