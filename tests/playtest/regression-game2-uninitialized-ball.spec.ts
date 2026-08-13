import { test, expect, type Page } from "@playwright/test";

// Regression: game2 (Block Breaker) — uninitialized ball NaN-poisons the board.
//
// reset()/stick() never seeded `s.bx`/`s.by`, so a launch landing between
// reset() and the first update() frame did `s.bx += s.vx * dt` on `undefined`,
// NaN-poisoned the ball, and silently phantom-cleared the level (full
// root-cause narrative: the 2026-07-17 FIX entry in tests/playtest/LEDGER.md).
// Fixed by having stick() seed the ball via the shared rest() helper that
// update()'s not-launched branch also uses.
//
// Reproducing it needs the launch to land strictly before the first post-reset
// frame. showScreen calls run()/begin()/reset() synchronously before adding
// `.active`, so once `#game2` is active reset() has run and — with rAF gated by
// INIT below — no frame has.

const INIT = `
(function () {
  // The ball is the only thing drawn with ctx.arc from a white fill; record
  // every arc so a NaN/Infinity ball position is caught wherever it renders.
  var proto = CanvasRenderingContext2D.prototype, origArc = proto.arc;
  var calls = window.__arcCalls = [];
  proto.arc = function (x, y, r) {
    calls.push({ y: y, fill: String(this.fillStyle), finite: isFinite(x) && isFinite(y) && isFinite(r) });
    return origArc.apply(this, arguments);
  };

  // Every rAF loop in this app lives inside a game screen, so queueing frames
  // from page load costs nothing and lets us act between reset() and frame 1.
  var queue = [];
  window.requestAnimationFrame = function (cb) { return queue.push(cb); };
  window.__stepFrame = function (ts) {
    var cbs = queue; queue = [];
    for (var i = 0; i < cbs.length; i++) { cbs[i](ts); }
  };
})();
`;

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
  test(`game2 launching before the first post-reset frame never NaN-poisons the ball at ${vp.name}`, async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
    page.on("pageerror", (e) => pageErrors.push(String(e)));

    await page.addInitScript(INIT);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await openGame2(page);

    // Launch inside the pre-first-frame window, then step frames by hand at a
    // realistic 16 ms cadence and collect the ball draws.
    const result = await page.evaluate(() => {
      const w = window as unknown as {
        __stepFrame(ts: number): void;
        __arcCalls: Array<{ y: number; fill: string; finite: boolean }>;
      };
      const cv = document.querySelector<HTMLCanvasElement>("#game2 canvas")!;
      cv.dispatchEvent(new PointerEvent("pointerdown", {
        clientX: Math.floor(window.innerWidth / 2),
        clientY: Math.floor(window.innerHeight / 2),
        bubbles: true, cancelable: true,
      }));
      for (let i = 0; i < 10; i++) { w.__stepFrame(1000 + i * 16); }
      const white = w.__arcCalls.filter((a) => a.fill.toLowerCase() === "#ffffff");
      return {
        anyNonFinite: w.__arcCalls.some((a) => !a.finite),
        ballYs: white.map((a) => a.y),
      };
    });

    // Core invariant: the ball is never rendered at a non-finite position.
    expect(result.anyNonFinite, "ball rendered at a NaN/Infinity position").toBe(false);
    // The fix seeds the ball rather than removing it: it is still drawn, and it
    // genuinely launched (the position changes frame to frame instead of the
    // board self-clearing under a frozen NaN ball).
    expect(new Set(result.ballYs).size, "ball (the #ffffff arc) never drawn, or never moved after launch").toBeGreaterThan(1);

    expect(pageErrors, pageErrors.join("\n")).toEqual([]);
    expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
  });
}
