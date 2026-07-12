# GameLand — Playtest Ledger

Cross-game self-play bug-hunt. Each run seeds fresh input ranges, plays the
screen state-machine headless, mines for real defects, and fixes the root cause
with a regression test.

## 2026-07-12 — run seed base `2026071203`

Playwright harness bootstrapped (`@playwright/test`, `playwright.config.ts` that
runs `npm run build` then serves the real `dist/` artifact via a dependency-free
static server on port 5052). Repo previously had ZERO tests.

**Defect found & fixed (1):**

1. **Dead main-menu buttons — 404 + console error, no user feedback (logic/UX).**
   The main menu exposed 8 enabled buttons, but only `bear-hunt` and
   `high-scores` map to an implemented screen script (`scripts/screen.<id>.js`).
   The other six (`game2`, `game3`, `game4`, `snake`, `help-screen`,
   `settings-screen`) forwarded their `name` to `carny.game.showScreen()`
   (`scripts/screen.main-menu.js:6-12`), which lazy-loads
   `scripts/screen.<id>.js` (`scripts/game.js:27-47`). That script doesn't
   exist, so every click fired an HTTP **404** and a bare
   `console.error("game: failed to show screen '<id>'", …)`
   (`scripts/game.js:58-60`) while the player stayed on the menu with **zero
   visible feedback** — the button just looked broken.
   *Root-cause fix:* the six unimplemented buttons are marked `disabled`
   (`disabled title="Coming soon"`) in `index.html`. A disabled button
   dispatches no click event, so there is no dead navigation, no 404, and no
   console error, while giving correct "not available yet" affordance. The
   `console.error` path is left intact — it correctly reports genuine failures
   of real screen scripts.
   *Regression test:* `regression-dead-menu-buttons.spec.ts` — reaches the menu,
   asserts every unimplemented button is `disabled` and every live button
   (`bear-hunt`, `high-scores`) navigates to its screen with no console error /
   no missing-screen 404 / no page error. Proven **FAIL pre-fix** (placeholders
   enabled → `toBeDisabled` fails, and clicking them 404s), **PASS post-fix**.

**Gate:** `npm run build` ✓ · `npx playwright test` → 1 passed ✓ · asset-guard
PASS (23 assets) ✓ · `size-limit` JS 6.5 KB/10 KB, CSS 622 B/5 KB ✓ ·
Lighthouse CI (`lighthouserc.json`, tier `game`) all assertions passed —
LCP/CLS/TBT within 2500 ms / 0.1 / 400 ms ✓ · `html-validate` (shared perf-config
config) clean ✓. CSS untouched, so the stylelint step is unchanged from the
green `main` baseline.

**Play coverage this run (recon, seed `2026071203`):** build + boot hygiene; all
8 menu transitions + BACK navigation + out-of-order/direct `showScreen`;
bear-hunt full 45 s round (spawn/fire/combo/score/best-persist/game-over/restart)
+ 260-step seeded fuzz; canvas-level NaN/Infinity probe (none found); 12× spam-
click race on BEAR HUNT (single canvas, no dual loops); desktop 1280×800 +
mobile 375×812 resize. No console errors or unhandled rejections post-fix.

**Known follow-ups (not this run):**
- Mobile horizontal overflow: `#game` is a fixed `width:1024px` board and the
  viewport meta (`index.html:5`) omits `width=device-width`, so menu/splash
  screens overflow at 375 px wide (the bear-hunt canvas itself is correctly
  `100vw/100vh`). Deferred — a viewport/layout change worth doing deliberately
  with a fresh CLS check, not folded into this fix.
- `install-screen` is a no-exit terminal state (only reachable on non-installed
  iOS Safari); intended as the "Add to Home Screen" gate, low severity.
