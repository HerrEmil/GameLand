import { test, expect, type Page } from "@playwright/test";

// Snake (screen id `snake`) — smoke/playtest. Boots the shell, opens the game
// from the menu, and exercises the canvas render + rAF loop + directional input
// at a phone and a desktop viewport. The opening fruit is placed three cells
// dead ahead of the snake (same row), so a single ArrowRight starts the run and
// the snake slides through it before crashing into the right wall — a fully
// deterministic score of at least 1 with no aiming. The run must be clean:
// canvas present and sized, non-blank frame, no console error, no unhandled
// throw, no missing screen-script 404. The scored length must persist to
// localStorage across a reload — the game's observable score contract.

const HI_KEY = "gameland.hi.snake";

function isScreenScript(url: string): boolean {
  return /\/scripts\/screen\.[^/]+\.js(\?|$)/.test(url);
}

async function openSnake(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("#splash-screen")).toHaveClass(/active/);
  await page.locator("#splash-screen").click();
  await expect(page.locator("#main-menu")).toHaveClass(/active/);
  await page.locator('#main-menu button[name="snake"]').click();
  await expect(page.locator("#snake")).toHaveClass(/active/);
}

function readHi(page: Page): Promise<number> {
  return page.evaluate((k) => Number(localStorage.getItem(k) || 0), HI_KEY);
}

// Each viewport drives the input path that matters on its platform: a real
// right-swipe (pointer drag) on mobile, and the keyboard on desktop — so the
// touch and keyboard handlers are each genuinely exercised, not just one.
async function startRun(page: Page, touch: boolean): Promise<void> {
  if (touch) {
    const box = await page.locator("#snake canvas").boundingBox();
    const cx = box!.x + box!.width / 2, cy = box!.y + box!.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 80, cy, { steps: 4 });   // swipe right -> steer + start
    await page.mouse.up();
  } else {
    await page.keyboard.press("ArrowRight");             // keydown -> steer + start
  }
}

for (const vp of [
  { name: "mobile 375x812", width: 375, height: 812, touch: true },
  { name: "desktop 1280x800", width: 1280, height: 800, touch: false },
]) {
  test(`snake boots, plays and persists a score at ${vp.name}`, async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const script404s: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
    page.on("pageerror", (e) => pageErrors.push(String(e)));
    page.on("response", (r) => { if (r.status() >= 400 && isScreenScript(r.url())) script404s.push(`${r.status()} ${r.url()}`); });

    await page.setViewportSize({ width: vp.width, height: vp.height });
    await openSnake(page);

    // Canvas is created lazily by run(); it must exist and fill the viewport.
    const canvas = page.locator("#snake canvas");
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box, "canvas has a layout box").not.toBeNull();
    expect(box!.width).toBeGreaterThan(vp.width - 2);
    expect(box!.height).toBeGreaterThan(vp.height - 2);

    // Steering right starts the run moving right; the snake then slides on its
    // own, eats the dead-ahead fruit (score -> 1) and finally hits the right
    // wall, which writes the best length to localStorage. Poll until it lands
    // (generous budget so a low-fps CI runner still finishes the crossing).
    await startRun(page, vp.touch);
    let hi = 0;
    for (let i = 0; i < 120 && hi === 0; i++) {
      await page.waitForTimeout(100);
      hi = await readHi(page);
    }
    expect(hi, "a finished run scored and persisted a positive length").toBeGreaterThan(0);

    // Canvas must be actively rendering (non-blank frame).
    const nonBlank = await page.evaluate(() => {
      const cv = document.querySelector("#snake canvas") as HTMLCanvasElement | null;
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
    await openSnake(page);
    expect(await readHi(page), "high score persists across reload").toBe(hi);

    // BACK returns to the menu without error.
    await page.locator("#snake button").click();
    await expect(page.locator("#main-menu")).toHaveClass(/active/);

    expect(script404s, "no missing screen-script 404").toEqual([]);
    expect(consoleErrors, "no console error during play").toEqual([]);
    expect(pageErrors, "no unhandled throw during play").toEqual([]);
  });
}
