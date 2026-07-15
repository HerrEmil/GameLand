import { test, expect, type Page } from "@playwright/test";

// Regression — Road Cross taller mid-run resize must not freeze the game.
//
// Bug (pre-fix): `size()` (the window `resize` handler) called `metrics()`, which
// recomputes the grid ROW count `R` from the new viewport height, but never
// rebuilt `s.rows` (sized to the OLD `R` back in `reset()`/`buildRows()`). Growing
// the viewport taller bumped `R` up while `s.rows` stayed short, so the next
// `update()`/`render()` frame indexed `s.rows[r]` past the array end and threw
// `TypeError: Cannot read properties of undefined (reading 'road')`. The throw
// escaped the rAF callback `frame`, so `requestAnimationFrame` was never
// re-scheduled → the game froze. A SHORTER resize never crashed (rows stayed
// longer than R), so this pins the taller direction specifically.
//
// Fix: pick the grid dimensions (C/R) once per run; a resize only rescales the
// pixel cell size, so `s.rows` can never fall out of sync with `R`.
//
// Proven to FAIL before the fix (pageerror at screen.road-cross.js:169) and PASS
// after. A shorter-resize control asserts the fix didn't regress the safe path.

async function openRoadCross(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("#splash-screen")).toHaveClass(/active/);
  await page.locator("#splash-screen").click();
  await expect(page.locator("#main-menu")).toHaveClass(/active/);
  await page.locator('#main-menu button[name="road-cross"]').click();
  await expect(page.locator("#road-cross")).toHaveClass(/active/);
  await expect(page.locator("#road-cross canvas")).toBeVisible();
}

// Hash of a wide mid-canvas band — traffic lanes live here and advance every
// frame, so the hash changes over time IFF the rAF loop is still alive. A frozen
// (crashed) loop leaves the last frame on screen, so the hash stays identical.
function midBandHash(page: Page): Promise<number> {
  return page.evaluate(() => {
    const cv = document.querySelector("#road-cross canvas") as HTMLCanvasElement | null;
    if (!cv) return -1;
    const ctx = cv.getContext("2d");
    if (!ctx) return -1;
    const y = Math.floor(cv.height * 0.35);
    const { data } = ctx.getImageData(0, y, cv.width, 40);
    let h = 2166136261;
    for (let i = 0; i < data.length; i += 16) { h = (h ^ data[i]) * 16777619; }
    return h >>> 0;
  });
}

test("road cross survives a taller mid-run resize without freezing", async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });

  // Start SHORT so the run picks a small R (round(640/70)=9).
  await page.setViewportSize({ width: 375, height: 640 });
  await openRoadCross(page);

  // Start the run so update()'s lane loop (the pre-fix throw site) is live.
  const canvas = page.locator("#road-cross canvas");
  await canvas.click();                 // start + first hop, unlock audio
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);       // let several frames run at the short size
  expect(pageErrors, "clean before the resize").toEqual([]);

  // Resize TALLER so R climbs to its cap (round(1400/70)=20 → clamp 15). Pre-fix
  // this leaves s.rows length 9 while R=15 → s.rows[9..14] undefined → throw.
  await page.setViewportSize({ width: 900, height: 1400 });
  await page.waitForTimeout(150);
  const h1 = await midBandHash(page);
  await page.waitForTimeout(350);       // give the loop time to advance traffic
  const h2 = await midBandHash(page);

  // A subsequent hop must still be handled after the resize.
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(150);

  expect(pageErrors, "no unhandled throw on a taller mid-run resize").toEqual([]);
  expect(consoleErrors, "no console error on a taller mid-run resize").toEqual([]);
  expect(h1, "canvas still rendering after resize").toBeGreaterThan(0);
  expect(h2 !== h1, "rAF loop still alive (traffic advancing) after resize").toBe(true);
});

test("road cross survives a shorter mid-run resize (control)", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  // Start TALL (R at the cap), then shrink — the historically-safe direction.
  await page.setViewportSize({ width: 900, height: 1400 });
  await openRoadCross(page);
  const canvas = page.locator("#road-cross canvas");
  await canvas.click();
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(200);

  await page.setViewportSize({ width: 375, height: 640 });
  await page.waitForTimeout(400);
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(150);

  expect(pageErrors, "no unhandled throw on a shorter mid-run resize").toEqual([]);
});
