import { test, expect, type Page } from "@playwright/test";

// Regression: game2 (Block Breaker) — uninitialized ball NaN-poisons the board.
//
// `s.bx`/`s.by` were only ever assigned inside update()'s not-launched branch
// (`if (!s.launched) { s.bx = s.px; s.by = s.py - s.r - 1; return; }`). reset()
// and stick() never seeded them, so in the window between a reset() and the
// first update() frame they are `undefined`. If the player launches in that
// window — double-tapping the "play again" prompt on the game-over screen, or
// tapping the instant the screen re-opens — update() takes the moveBall()
// branch instead, does `s.bx += s.vx * dt` on `undefined`, and the ball goes
// NaN permanently. A NaN ball then satisfies brickHit()'s inverted reject guard
// (`NaN > r*r` is false), so it silently kills one brick per frame, phantom-
// clears the level via nextLevel(), and banks an unearned best score. Observed
// live: 60-69 consecutive `arc(NaN, NaN)` draws (exactly one per brick), zero
// console errors — a completely silent corruption.
//
// The bug requires the launch to land strictly before the first post-reset
// frame. We make that deterministic by gating requestAnimationFrame: after the
// screen is active (showScreen calls run()/begin()/reset() synchronously before
// adding `.active`, so reset() has run) but before any frame has executed, we
// dispatch the launching pointerdown, then step frames by hand. A
// CanvasRenderingContext2D.arc sentinel records every ball draw; a non-finite
// ball position is the defect. Fixed by seeding s.bx/s.by inside stick().

const INIT = `
(function () {
  // The ball is the only thing drawn with ctx.arc from a white fill; record
  // every arc so a NaN/Infinity ball position is caught wherever it renders.
  window.__arcCalls = [];
  var proto = CanvasRenderingContext2D.prototype, origArc = proto.arc;
  proto.arc = function (x, y, r) {
    window.__arcCalls.push({
      x: x, y: y, r: r, fill: String(this.fillStyle),
      finite: isFinite(x) && isFinite(y) && isFinite(r)
    });
    return origArc.apply(this, arguments);
  };
  window.__resetArcCalls = function () { window.__arcCalls = []; };

  // Manual rAF control so we can act between reset() and the first frame.
  var realRAF = window.requestAnimationFrame.bind(window), manual = false, queue = [];
  window.__setManualRAF = function (on) { manual = !!on; };
  window.requestAnimationFrame = function (cb) {
    if (manual) { queue.push(cb); return queue.length; }
    return realRAF(cb);
  };
  window.__stepFrame = function (ts) {
    var cbs = queue; queue = [];
    for (var i = 0; i < cbs.length; i++) { try { cbs[i](ts); } catch (e) {} }
    return cbs.length;
  };
})();
`;

async function openMenu(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("#splash-screen")).toHaveClass(/active/);
  await page.locator("#splash-screen").click();
  await expect(page.locator("#main-menu")).toHaveClass(/active/);
}

for (const vp of [
  { name: "mobile 375x812", width: 375, height: 812 },
  { name: "desktop 1280x800", width: 1280, height: 800 },
]) {
  test(`game2 launching before the first post-reset frame never NaN-poisons the ball at ${vp.name}`, async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
    page.on("pageerror", (e) => pageErrors.push(String(e)));

    await page.addInitScript(INIT);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await openMenu(page);

    // Gate rAF, then open Block Breaker. run()/begin()/reset() run synchronously
    // inside showScreen (before `.active` is added), so by the time #game2 is
    // active the board has been reset but no frame has executed — bx/by are
    // still uninitialized on the buggy build.
    await page.evaluate(() => (window as unknown as { __setManualRAF(on: boolean): void }).__setManualRAF(true));
    await page.locator('#main-menu button[name="game2"]').click();
    await expect(page.locator("#game2")).toHaveClass(/active/);
    await expect(page.locator("#game2 canvas")).toHaveCount(1);

    // Launch inside the pre-first-frame window: dispatch the pointerdown the
    // game listens for. Reset the arc log first so we only judge frames from
    // this launch onward.
    await page.evaluate(() => {
      const w = window as unknown as { __resetArcCalls(): void };
      const cv = document.querySelector<HTMLCanvasElement>("#game2 canvas")!;
      w.__resetArcCalls();
      cv.dispatchEvent(new PointerEvent("pointerdown", {
        clientX: Math.floor(window.innerWidth / 2),
        clientY: Math.floor(window.innerHeight / 2),
        bubbles: true, cancelable: true,
      }));
    });

    // Step several frames with realistic timestamps and collect the ball draws.
    const result = await page.evaluate(() => {
      const w = window as unknown as {
        __stepFrame(ts: number): number;
        __arcCalls: Array<{ x: number; y: number; r: number; fill: string; finite: boolean }>;
      };
      for (let i = 0; i < 10; i++) { w.__stepFrame(1000 + i * 16); }
      const white = w.__arcCalls.filter((a) => a.fill.toLowerCase() === "#ffffff");
      return {
        anyNonFinite: w.__arcCalls.some((a) => !a.finite),
        ballDraws: white.length,
        ballAllFinite: white.every((a) => a.finite),
        ballYs: white.map((a) => a.y),
        W: window.innerWidth,
        H: window.innerHeight,
      };
    });

    // Core invariant: the ball is never rendered at a non-finite position.
    expect(result.anyNonFinite, "ball rendered at a NaN/Infinity position").toBe(false);
    // The fix seeds the ball rather than removing it: it is still drawn...
    expect(result.ballDraws).toBeGreaterThan(0);
    expect(result.ballAllFinite).toBe(true);
    // ...in bounds, and it genuinely launched (the position changes frame to
    // frame instead of the board self-clearing under a frozen NaN ball).
    for (const y of result.ballYs) {
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(result.H);
    }
    expect(new Set(result.ballYs).size, "ball never moved after launch").toBeGreaterThan(1);

    expect(pageErrors, pageErrors.join("\n")).toEqual([]);
    expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
  });
}
