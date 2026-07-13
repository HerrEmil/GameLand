import { test, expect, type Page } from "@playwright/test";

// Road Cross (screen id `road-cross`) — smoke/playtest. Boots the shell, opens
// the game from the menu, exercises the canvas render + rAF loop + hop input at
// a phone and a desktop viewport, and asserts the run is clean: canvas present
// and sized, a non-blank frame, no console error, no unhandled throw, no missing
// screen-script 404. It drives forward hops (every lane opens with a gap centred
// on the frog column, so the first hop always lands safe and scores) and checks
// the furthest-progress score is written to localStorage and survives a reload —
// the game's observable score contract. Both keyboard and pointer input are
// exercised.

const HI_KEY = "gameland.hi.road-cross";

function isScreenScript(url: string): boolean {
  return /\/scripts\/screen\.[^/]+\.js(\?|$)/.test(url);
}

async function openGame(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("#splash-screen")).toHaveClass(/active/);
  await page.locator("#splash-screen").click();
  await expect(page.locator("#main-menu")).toHaveClass(/active/);
  await page.locator('#main-menu button[name="road-cross"]').click();
  await expect(page.locator("#road-cross")).toHaveClass(/active/);
}

function readHi(page: Page): Promise<number> {
  return page.evaluate((k) => Number(localStorage.getItem(k) || 0), HI_KEY);
}

for (const vp of [
  { name: "mobile 375x812", width: 375, height: 812 },
  { name: "desktop 1280x800", width: 1280, height: 800 },
]) {
  test(`road cross boots, plays and persists a score at ${vp.name}`, async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const script404s: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
    page.on("pageerror", (e) => pageErrors.push(String(e)));
    page.on("response", (r) => { if (r.status() >= 400 && isScreenScript(r.url())) script404s.push(`${r.status()} ${r.url()}`); });

    await page.setViewportSize({ width: vp.width, height: vp.height });
    await openGame(page);

    // Canvas is created lazily by run(); it must exist and fill the viewport.
    const canvas = page.locator("#road-cross canvas");
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box, "canvas has a layout box").not.toBeNull();
    expect(box!.width).toBeGreaterThan(vp.width - 2);
    expect(box!.height).toBeGreaterThan(vp.height - 2);

    // Tap to start + hop forward, then keep hopping up. The safe-centred opening
    // guarantees the first hop scores; further hops cross lanes and re-cross for
    // more. Also fire a couple of keyboard hops to cover that control path.
    await canvas.click();                                   // start + first forward hop, unlock audio
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowRight");
    let hi = 0;
    for (let i = 0; i < 40 && hi < 1; i++) {
      await canvas.click();
      await page.waitForTimeout(130);
      hi = await readHi(page);
    }
    expect(hi, "a forward hop scored and persisted progress").toBeGreaterThan(0);

    // Canvas must be actively rendering (non-blank frame).
    const nonBlank = await page.evaluate(() => {
      const cv = document.querySelector("#road-cross canvas") as HTMLCanvasElement | null;
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
    await openGame(page);
    expect(await readHi(page), "high score persists across reload").toBe(hi);

    // BACK returns to the menu without error.
    await page.locator("#road-cross button").click();
    await expect(page.locator("#main-menu")).toHaveClass(/active/);

    expect(script404s, "no missing screen-script 404").toEqual([]);
    expect(consoleErrors, "no console error during play").toEqual([]);
    expect(pageErrors, "no unhandled throw during play").toEqual([]);
  });
}
