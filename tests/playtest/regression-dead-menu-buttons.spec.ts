import { test, expect, type Page } from "@playwright/test";

// Regression: the main menu used to expose 8 enabled buttons but only two of
// them (BEAR HUNT, HIGH SCORES) map to an implemented screen script
// (scripts/screen.<name>.js). Clicking any of the other six forwarded its
// name to carny.game.showScreen(), which lazy-loaded scripts/screen.<name>.js
// -> HTTP 404 -> a bare `console.error("game: failed to show screen ...")` with
// zero user-facing feedback (the button just looked broken).
//
// Fix: the unimplemented buttons are marked `disabled`, so a disabled button
// dispatches no click event -> no dead navigation, no 404, no console error,
// while still giving correct "not available yet" affordance.
//
// This spec fails against the pre-fix tree (the placeholders are enabled, so
// `toBeDisabled()` fails and, once clicked, they 404) and passes after it.

// Menu targets that ship an implemented screen script and must stay live.
const IMPLEMENTED_TARGETS = ["bear-hunt", "game2", "game3", "game4", "high-scores"];

function isScreenScript(url: string): boolean {
  return /\/scripts\/screen\.[^/]+\.js(\?|$)/.test(url);
}

async function reachMainMenu(page: Page): Promise<void> {
  await page.goto("/");
  // Boot shows the splash screen; a click anywhere on it advances to the menu.
  await expect(page.locator("#splash-screen")).toHaveClass(/active/);
  await page.locator("#splash-screen").click();
  await expect(page.locator("#main-menu")).toHaveClass(/active/);
}

test("no main-menu button triggers a missing-screen 404 or console error", async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const screenScript404s: string[] = [];

  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("response", (r) => {
    if (r.status() >= 400 && isScreenScript(r.url())) {
      screenScript404s.push(`${r.status()} ${r.url()}`);
    }
  });
  page.on("requestfailed", (r) => {
    if (isScreenScript(r.url())) screenScript404s.push(`FAILED ${r.url()}`);
  });

  await reachMainMenu(page);

  const buttons = page.locator("#main-menu button");
  const count = await buttons.count();
  expect(count).toBeGreaterThan(0);

  for (let i = 0; i < count; i++) {
    const button = buttons.nth(i);
    const name = await button.getAttribute("name");
    expect(name, "every menu button carries a screen name").toBeTruthy();

    if (IMPLEMENTED_TARGETS.includes(name as string)) {
      // A live target must navigate to its screen with no error, then we
      // return to the menu deterministically for the next button.
      await expect(button).toBeEnabled();
      await button.click();
      await expect(page.locator(`#${name}`)).toHaveClass(/active/);
      await page.evaluate(() => (window as any).carny.game.showScreen("main-menu"));
      await expect(page.locator("#main-menu")).toHaveClass(/active/);
    } else {
      // An unimplemented placeholder must be disabled so it cannot fire a
      // dead navigation that 404s its missing screen script.
      await expect(
        button,
        `"${name}" has no screen script and must be disabled`,
      ).toBeDisabled();
    }
  }

  expect(screenScript404s, "no menu action should 404 a missing screen script").toEqual([]);
  expect(consoleErrors, "no menu action should log a console error").toEqual([]);
  expect(pageErrors, "no menu action should throw").toEqual([]);
});
