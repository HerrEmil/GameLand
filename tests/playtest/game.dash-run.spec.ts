import { test, expect, type Page } from "@playwright/test";

// Dash Run (screen id `dash-run`) — smoke/playtest. Boots the shell, opens the
// game from the menu, exercises the canvas render + rAF loop + jump input at a
// phone and a desktop viewport, and asserts the run is clean: canvas present and
// sized, a non-blank frame, no console error, no unhandled throw, no missing
// screen-script 404. Distance is the score and the run opens with a long clear
// lead-in, so a first point accrues within a second with no skill required —
// the deterministic score the persistence check hangs on. Best is captured only
// after returning to the menu (which halts the loop, freezing further saves) so
// the "survives reload" assertion is exact rather than racing the score climb.
// Both keyboard and pointer input are exercised.

const HI_KEY = "gameland.hi.dash-run";

function isScreenScript(url: string): boolean {
  return /\/scripts\/screen\.[^/]+\.js(\?|$)/.test(url);
}

async function openGame(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("#splash-screen")).toHaveClass(/active/);
  await page.locator("#splash-screen").click();
  await expect(page.locator("#main-menu")).toHaveClass(/active/);
  await page.locator('#main-menu button[name="dash-run"]').click();
  await expect(page.locator("#dash-run")).toHaveClass(/active/);
}

function readHi(page: Page): Promise<number> {
  return page.evaluate((k) => Number(localStorage.getItem(k) || 0), HI_KEY);
}

for (const vp of [
  { name: "mobile 375x812", width: 375, height: 812 },
  { name: "desktop 1280x800", width: 1280, height: 800 },
]) {
  test(`dash run boots, plays and persists a score at ${vp.name}`, async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const script404s: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
    page.on("pageerror", (e) => pageErrors.push(String(e)));
    page.on("response", (r) => { if (r.status() >= 400 && isScreenScript(r.url())) script404s.push(`${r.status()} ${r.url()}`); });

    await page.setViewportSize({ width: vp.width, height: vp.height });
    await openGame(page);

    // Canvas is created lazily by run(); it must exist and fill the viewport.
    const canvas = page.locator("#dash-run canvas");
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box, "canvas has a layout box").not.toBeNull();
    expect(box!.width).toBeGreaterThan(vp.width - 2);
    expect(box!.height).toBeGreaterThan(vp.height - 2);

    // Tap starts the run (and unlocks audio); a keyboard press covers that control
    // path. The clear lead-in means distance scores before the first obstacle, so
    // just letting it run a beat is enough to bank a point.
    await canvas.click();                                   // start, unlock audio
    await page.keyboard.press("Space");                     // keyboard jump
    let hi = 0;
    for (let i = 0; i < 30 && hi < 1; i++) {
      await page.waitForTimeout(120);
      hi = await readHi(page);
    }
    expect(hi, "distance scored and persisted a point").toBeGreaterThan(0);

    // Canvas must be actively rendering (non-blank frame).
    const nonBlank = await page.evaluate(() => {
      const cv = document.querySelector("#dash-run canvas") as HTMLCanvasElement | null;
      if (!cv) return false;
      const ctx = cv.getContext("2d");
      if (!ctx) return false;
      const { data } = ctx.getImageData(0, 0, Math.min(cv.width, 64), Math.min(cv.height, 64));
      for (let i = 0; i < data.length; i += 4) { if (data[i] || data[i + 1] || data[i + 2]) return true; }
      return false;
    });
    expect(nonBlank, "canvas is drawing pixels").toBe(true);

    // BACK returns to the menu without error. This also halts the rAF loop, so the
    // score stops climbing and localStorage stops being written — the best read
    // next is stable.
    await page.locator("#dash-run button").click();
    await expect(page.locator("#main-menu")).toHaveClass(/active/);
    const banked = await readHi(page);
    expect(banked, "best persisted while playing").toBeGreaterThan(0);

    // The persisted best survives a full reload (durable, not just in-memory). We
    // do NOT reopen the game — reading storage alone avoids restarting the runner
    // and racing a fresh score against the assertion.
    await page.reload();
    await expect(page.locator("#splash-screen")).toHaveClass(/active/);
    expect(await readHi(page), "high score persists across reload").toBe(banked);

    expect(script404s, "no missing screen-script 404").toEqual([]);
    expect(consoleErrors, "no console error during play").toEqual([]);
    expect(pageErrors, "no unhandled throw during play").toEqual([]);
  });
}
