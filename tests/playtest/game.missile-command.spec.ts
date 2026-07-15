import { test, expect, type Page } from "@playwright/test";

// Missile Command (screen id `missile-command`) — smoke/playtest. Boots the shell, opens the game
// from the menu, exercises the canvas render + rAF loop + tap-to-detonate input at a phone and a
// desktop viewport, and asserts the run is clean: canvas present and sized, a non-blank frame, no
// console error, no unhandled throw, no missing screen-script 404.
//
// Scoring is not hands-off here — the player must blast falling warheads — so the test aims like a
// human: it reads the canvas, finds the warm-coloured warhead (red trail + peach head) and taps it.
// Taps are paced slower than a blast's 0.82 s lifetime, so no stale blast is on screen at scan time
// and the only warm pixels are genuine warheads; an interceptor is fired ONLY when one is seen, so
// no shot is wasted on empty sky. A blast that lands on a warhead kills it, banking the deterministic
// score the persistence check hangs on. bump() writes localStorage on a new best, so the first kill
// persists immediately. Best is captured only after returning to the menu (which halts the loop,
// freezing further saves) so the "survives reload" assertion is exact. The keyboard aim+fire path
// is exercised too.

const HI_KEY = "gameland.hi.missile-command";

function isScreenScript(url: string): boolean {
  return /\/scripts\/screen\.[^/]+\.js(\?|$)/.test(url);
}

async function openGame(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("#splash-screen")).toHaveClass(/active/);
  await page.locator("#splash-screen").click();
  await expect(page.locator("#main-menu")).toHaveClass(/active/);
  await page.locator('#main-menu button[name="missile-command"]').click();
  await expect(page.locator("#missile-command")).toHaveClass(/active/);
}

function readHi(page: Page): Promise<number> {
  return page.evaluate((k) => Number(localStorage.getItem(k) || 0), HI_KEY);
}

// Lowest warm/red pixel (warhead trail/head) in the play band, in canvas px, or null.
function findWarhead(page: Page): Promise<{ x: number; y: number } | null> {
  return page.evaluate(() => {
    const cv = document.querySelector("#missile-command canvas") as HTMLCanvasElement | null;
    if (!cv) return null;
    const ctx = cv.getContext("2d");
    if (!ctx) return null;
    const W = cv.width, H = cv.height;
    const img = ctx.getImageData(0, 0, W, H).data;
    let bx = -1, by = -1;
    for (let y = Math.floor(H * 0.13); y < Math.floor(H * 0.81); y += 2) {
      for (let x = 4; x < W - 4; x += 2) {
        const i = (y * W + x) * 4, r = img[i], g = img[i + 1], b = img[i + 2];
        if (r > 150 && r - b > 40 && r - g > 8) { if (y > by) { by = y; bx = x; } }
      }
    }
    return bx < 0 ? null : { x: bx, y: by };
  });
}

for (const vp of [
  { name: "mobile 375x812", width: 375, height: 812 },
  { name: "desktop 1280x800", width: 1280, height: 800 },
]) {
  test(`missile command boots, plays and persists a score at ${vp.name}`, async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const script404s: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
    page.on("pageerror", (e) => pageErrors.push(String(e)));
    page.on("response", (r) => { if (r.status() >= 400 && isScreenScript(r.url())) script404s.push(`${r.status()} ${r.url()}`); });

    await page.setViewportSize({ width: vp.width, height: vp.height });
    await openGame(page);

    // Canvas is created lazily by run(); it must exist and fill the viewport.
    const canvas = page.locator("#missile-command canvas");
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box, "canvas has a layout box").not.toBeNull();
    expect(box!.width).toBeGreaterThan(vp.width - 2);
    expect(box!.height).toBeGreaterThan(vp.height - 2);

    // First tap starts the run and unlocks audio; then aim at warheads until one is intercepted.
    await canvas.click({ position: { x: box!.width / 2, y: box!.height * 0.3 } });
    let hi = 0;
    for (let i = 0; i < 26 && hi < 1; i++) {
      const t = await findWarhead(page);
      if (t) {
        await canvas.click({ position: { x: Math.min(box!.width - 2, t.x), y: Math.min(box!.height - 2, t.y) } });
        await page.waitForTimeout(850); // let this blast fully fade before the next scan
      } else {
        await page.waitForTimeout(200); // empty sky — re-scan soon, don't waste an interceptor
      }
      hi = await readHi(page);
    }
    expect(hi, "a warhead was intercepted and the score persisted").toBeGreaterThan(0);

    // Exercise the keyboard aim + fire path (no throw / no error is the assertion).
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Space");

    // Canvas must be actively rendering (non-blank frame).
    const nonBlank = await page.evaluate(() => {
      const cv = document.querySelector("#missile-command canvas") as HTMLCanvasElement | null;
      if (!cv) return false;
      const ctx = cv.getContext("2d");
      if (!ctx) return false;
      const { data } = ctx.getImageData(0, 0, Math.min(cv.width, 64), Math.min(cv.height, 64));
      for (let i = 0; i < data.length; i += 4) { if (data[i] || data[i + 1] || data[i + 2]) return true; }
      return false;
    });
    expect(nonBlank, "canvas is drawing pixels").toBe(true);

    // BACK returns to the menu without error. This also halts the rAF loop, so scoring stops
    // and localStorage stops being written — the best read next is stable.
    await page.locator("#missile-command button").click();
    await expect(page.locator("#main-menu")).toHaveClass(/active/);
    const banked = await readHi(page);
    expect(banked, "best persisted while playing").toBeGreaterThan(0);

    // The persisted best survives a full reload (durable, not just in-memory). We do NOT reopen
    // the game — reading storage alone avoids restarting the run and racing a fresh score.
    await page.reload();
    await expect(page.locator("#splash-screen")).toHaveClass(/active/);
    expect(await readHi(page), "high score persists across reload").toBe(banked);

    expect(script404s, "no missing screen-script 404").toEqual([]);
    expect(consoleErrors, "no console error during play").toEqual([]);
    expect(pageErrors, "no unhandled throw during play").toEqual([]);
  });
}
