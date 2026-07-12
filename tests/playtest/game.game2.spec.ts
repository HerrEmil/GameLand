import { test, expect, type Page } from "@playwright/test";

// Block Breaker (screen id `game2`) — smoke/playtest. Boots the shell, opens the
// game from the menu, exercises the canvas render + rAF loop + keyboard/pointer
// input at both a phone and a desktop viewport, and asserts the run is clean:
// canvas present and sized, no console errors, no unhandled throw, no missing
// screen-script 404. Physics-dependent score math is verified by hand via the
// gate's live playtest; this guards the load/render/input surface against
// regressions.

function isScreenScript(url: string): boolean {
  return /\/scripts\/screen\.[^/]+\.js(\?|$)/.test(url);
}

async function openGame2(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("#splash-screen")).toHaveClass(/active/);
  await page.locator("#splash-screen").click();
  await expect(page.locator("#main-menu")).toHaveClass(/active/);
  await page.locator('#main-menu button[name="game2"]').click();
  await expect(page.locator("#game2")).toHaveClass(/active/);
}

for (const vp of [
  { name: "mobile 375x812", width: 375, height: 812 },
  { name: "desktop 1280x800", width: 1280, height: 800 },
]) {
  test(`block breaker boots and plays clean at ${vp.name}`, async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const script404s: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
    page.on("pageerror", (e) => pageErrors.push(String(e)));
    page.on("response", (r) => { if (r.status() >= 400 && isScreenScript(r.url())) script404s.push(`${r.status()} ${r.url()}`); });

    await page.setViewportSize({ width: vp.width, height: vp.height });
    await openGame2(page);

    // Canvas is created lazily by run(); it must exist and fill the viewport.
    const canvas = page.locator("#game2 canvas");
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box, "canvas has a layout box").not.toBeNull();
    expect(box!.width).toBeGreaterThan(vp.width - 2);
    expect(box!.height).toBeGreaterThan(vp.height - 2);

    // Launch the ball and drive the paddle for a couple of seconds.
    await page.locator("#game2 canvas").click();          // pointerdown → launch + audio unlock
    await page.keyboard.press("Space");                    // idempotent second launch is a no-op
    await page.keyboard.down("ArrowLeft");
    await page.waitForTimeout(1200);
    await page.keyboard.up("ArrowLeft");
    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(1200);
    await page.keyboard.up("ArrowRight");

    // Canvas must be actively rendering (non-blank frame).
    const nonBlank = await page.evaluate(() => {
      const cv = document.querySelector("#game2 canvas") as HTMLCanvasElement | null;
      if (!cv) return false;
      const ctx = cv.getContext("2d");
      if (!ctx) return false;
      const { data } = ctx.getImageData(0, 0, Math.min(cv.width, 64), Math.min(cv.height, 64));
      for (let i = 0; i < data.length; i += 4) { if (data[i] || data[i + 1] || data[i + 2]) return true; }
      return false;
    });
    expect(nonBlank, "canvas is drawing pixels").toBe(true);

    // BACK returns to the menu without error.
    await page.locator("#game2 button").click();
    await expect(page.locator("#main-menu")).toHaveClass(/active/);

    expect(script404s, "no missing screen-script 404").toEqual([]);
    expect(consoleErrors, "no console error during play").toEqual([]);
    expect(pageErrors, "no unhandled throw during play").toEqual([]);
  });
}
