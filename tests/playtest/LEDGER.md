# GameLand — Playtest Ledger

Cross-game self-play bug-hunt. Each run seeds fresh input ranges, plays the
screen state-machine headless, mines for real defects, and fixes the root cause
with a regression test.

## 2026-07-13 — new game: Snake (`snake`)

Shipped the last missing menu game. `bear-hunt`, `game2`, `game3` and `game4`
all had screen scripts; `snake` was the remaining `disabled` placeholder — now
it's a real game and the menu is fully wired. `scripts/screen.snake.js` is the
grid classic with a modern coat: a responsive square-cell board centred in the
full-viewport canvas, an rAF loop that halts when `#snake` loses `.active`,
**interpolated** slither (segments lerp between grid cells for smooth motion),
a difficulty ramp (step time falls from 135 ms toward a 62 ms floor as the
snake grows), keyboard (arrows/WASD, Space to replay) **and** touch (swipe to
steer, tap to start/replay) controls, direction-queue that refuses a 180° into
the neck, tail-aware self-collision, pulsing fruit with a particle burst on
eat, WebAudio SFX, and a best length persisted to
`localStorage["gameland.hi.snake"]`. The opening fruit is placed three cells
dead ahead so the first bite needs no aiming (and the playtest scores
deterministically). Menu button enabled + relabelled "SNAKE", the `#snake`
placeholder div emptied, `.size-limit.json` given a `Game: Snake` budget, and
the dead-button regression's `IMPLEMENTED_TARGETS` updated (high-scores already
mapped `snake` → "Snake").

**Playtest (Playwright, mobile 375×812 + desktop 1280×800):** canvas renders
(board/snake/fruit), a run drives right through the opening fruit into the wall,
length accrues and the best persists to storage across a full reload, BACK
returns to the menu — **zero console errors** at both viewports. New spec
`game.snake.spec.ts` guards the load/render/input/persist surface; the
regression spec now also drives the enabled SNAKE button.

**Gate:** `npm run build` ✓ · `asset-guard dist` PASS (27 assets, no stray
`.DS_Store`) ✓ · `size-limit` per-game budgets all green — **Snake 4.37 KB /
4.5 KB** brotli (core 953 B, shell 1.72 KB, CSS 622 B) ✓ · `lint:css` ✓ ·
`playwright test` → **7 passed** ✓ · Lighthouse (`lighthouserc.json`) 3 runs,
all assertions passed — LCP/CLS/TBT within 2500 ms / 0.1 / 400 ms ✓. The game
script is lazy-loaded, so initial-page metrics are unchanged from the baseline.

## 2026-07-12 — new game: Block Breaker (`game2`)

Shipped the first missing menu game. `bear-hunt` had a screen script; the next
menu button (`game2`) did not, so it 404'd — now it's a real game.
`scripts/screen.game2.js` is a paddle-and-ball brick breaker: responsive
full-viewport canvas, rAF loop that halts when `#game2` loses `.active`,
pointer **and** keyboard (arrows move, Space launches/restarts) controls,
sub-stepped ball physics (no tunnelling), WebAudio SFX, 5 rows × responsive
columns, three lives, level-up speed ramp, and a best score persisted to
`localStorage["gameland.hi.game2"]`. Menu button enabled + relabelled "BLOCK
BREAKER", `<div id="game2">` added, high-scores name map + the dead-button
regression's `IMPLEMENTED_TARGETS` updated.

**Playtest (Playwright, mobile 375×812 + desktop 1280×800):** canvas renders
(bricks/paddle/ball), a full 3-life game drives to game-over, score accrues and
the best (50) persists to storage and shows on the High Scores screen as "Block
Breaker", BACK returns to the menu — **zero console errors** at both viewports.
New spec `game.game2.spec.ts` guards the load/render/input surface.

**Gate:** `npm run build` ✓ · `asset-guard dist` PASS (24 assets, no stray
`.DS_Store`) ✓ · `size-limit` JS **9.97 KB / 10 KB** brotli, CSS 622 B ✓ ·
`lint:css` ✓ · `playwright test` → 3 passed ✓ · Lighthouse (tier `game`)
LCP 1657 ms / CLS 0.000 / TBT 0 ms, perf 100 ✓. The game script is lazy-loaded,
so initial-page metrics are unchanged from the bear-hunt baseline.

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
