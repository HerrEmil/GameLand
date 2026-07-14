# GameLand — Playtest Ledger

Cross-game self-play bug-hunt. Each run seeds fresh input ranges, plays the
screen state-machine headless, mines for real defects, and fixes the root cause
with a regression test.

## 2026-07-14 — new game: Tetra (`tetra`)

All ten menu games through Star Blaster ship a screen script, so this run **adds
an eleventh**: a new `<li>` button (`name="tetra"`, label "TETRA"), a `#tetra`
screen div, and `scripts/screen.tetra.js` — a **falling-block puzzle** and the
shell's first *rotate-and-nest stacker*. 2048 slides and merges a fixed grid and
Tower Stack times a single drop, but nothing else rotates tetrominoes into a
well, so it sits clearly apart. The seven pieces are stored as one spawn shape
each and their four rotations are derived at load by rotating the cells CW inside
their bounding box `(r,c)->(c,N-1-r)`; a 7-bag keeps the stream fair. Gravity
lowers the active piece one row per tick (`0.8·0.85^level`, floored at 0.05 s);
filling a row clears it and banks `[100,300,500,800][n]·(level+1)`, soft drop +1,
hard drop +2 per cell, and level (hence speed) steps every ten lines. The piece
auto-spawns on `run()` so a single Space **hard-drops** the opening piece and
banks the drop distance at once — the deterministic first score the playtest
hangs on — and that first gain is written to `localStorage["gameland.hi.tetra"]`
immediately (later writes throttle to every 100). A translucent **ghost** marks
the landing column, a `NEXT` preview shows the upcoming piece (beside the well on
desktop, centred in the top strip on a phone where there is no room beside it),
and a full row clear flashes the board white. Bevelled blocks, per-frame
viewport-relative geometry (cell = `min(0.9W/10, 0.84H/20)`, recomputed each
frame so a resize just rescales the well — no stored per-viewport row state to go
stale), an rAF loop that halts when `#tetra` loses `.active`, a BACK button to
the menu, keyboard (←/→·A·D move, ↑·W·X rotate CW, Z rotate CCW, ↓ soft-drop,
Space·Enter hard-drop / restart) **and** touch (drag to slide columns, tap to
rotate, swipe down to slam, tap to restart) controls, WebAudio SFX
(move / rotate / lock / drop / value-pitched line-clear / level-up / game-over),
and simple wall-kick on rotate (try x-offsets 0,∓1,∓2). High-scores name map,
`.size-limit.json` (`Game: Tetra` budget) and the dead-button regression's
`IMPLEMENTED_TARGETS` all updated.

**Playtest (Playwright, mobile 375×812 + desktop 1280×800):** the canvas fills
the viewport, the well renders (dark gradient page, grid lines, bevelled 7-bag
pieces in distinct colours) with the active piece and its ghost drawn above the
stack, a single Space hard-drop banks and persists a score, and the move/rotate
keyboard paths run clean. An idle board naturally stacked into the centre columns
and **topped out** — the "GAME OVER / ★ NEW BEST N / tap · space to replay"
overlay rendered and the next key **restarted** into a fresh run with the best
preserved. Best survives BACK (which halts the loop) and a full reload. **Zero
console errors** at both viewports (the lone warning is the shell's own
`roboto-regular` font-preload notice, not the game). New spec
`game.tetra.spec.ts` guards the load/render/hard-drop/persist surface at both
viewports; the regression spec now also drives the enabled TETRA button.

**Gate:** `npm run build` ✓ · `asset-guard dist` PASS (33 assets, no stray
`.DS_Store`) ✓ · `size-limit` per-game budgets all green — **Tetra 4.46 KB /
4.5 KB** brotli (core 953 B, shell 1.8 KB, CSS 622 B) ✓ · `lint:css` ✓ · full
playtest suite **19 passed** ✓ · `@lhci/cli autorun` LCP/CLS/TBT assertions all
pass (the game script is lazy-loaded, so initial-page metrics are unchanged from
the baseline) ✓.

## 2026-07-14 — new game: 2048 (`tile-2048`)

All nine menu games through Sky Hopper ship a screen script, so this run **adds a
ninth**: a new `<li>` button (`name="tile-2048"`, label "2048"), a `#tile-2048`
screen div, and `scripts/screen.tile-2048.js` — a **slide-and-merge number
puzzle** and the shell's **first turn-based game** (the other eight are all
real-time arcade), so it sits clearly apart. Swipe or arrow the 4×4 board; two
tiles of equal value that collide fuse into their sum and bank that sum as score.
After any move that changed the board a new tile spawns (a 2, or a 4 one time in
ten). The board seeds two 2-tiles side by side, so the opening horizontal swipe
always merges — the deterministic early score the playtest hangs on (mirrors the
other games' free first point, and 2048's own two-tile opening). Reaching 2048
rings a chime and flashes gold but play continues; the run ends only when the
board is full with no adjacent equals left (`isOver()` scans for an empty cell or
any orthogonal equal pair). Slide tweening (smoothstep over 0.11 s), merge-bump
and spawn grow-in pops, viewport-relative geometry (board = min(W−2m, H−top−m),
recomputed each frame so a resize just rescales), an rAF loop that halts when
`#tile-2048` loses `.active`, a BACK button to the menu, keyboard
(arrows/WASD, Space·Enter to restart) **and** touch (swipe to move, tap to
restart) controls, WebAudio SFX (slide / value-pitched merge / win / game-over),
and a best persisted to `localStorage["gameland.hi.tile-2048"]` (saved the instant
a new best is set). High-scores name map, `.size-limit.json` (`Game: 2048` budget)
and the dead-button regression's `IMPLEMENTED_TARGETS` all updated.

**Playtest (Playwright, mobile 375×812 + desktop 1280×800):** canvas renders
(cream page, tan board, empty cells, value-coloured tiles, HUD pills, hint), the
opening ArrowLeft merges and banks a score, higher tiles build through varied
merges (verified to 8 / 16 / 32 and beyond), the best persists across BACK and a
full reload, and a 73-move random drive reached a natural **game over** — the
overlay ("Game Over" / "Score N" / "Tap / Space for a new game") rendered over the
tinted full board and the next key **restarted** into a fresh run with the best
(1112) preserved. The High Scores screen lists "2048" ranked #1. **Zero console
errors** at both viewports (the lone `willReadFrequently` warning came from the
harness's own canvas readback probe, not the game — the game never calls
`getImageData`). New spec `game.tile-2048.spec.ts` guards the
load/render/merge/persist surface at both viewports; the regression spec now also
drives the enabled 2048 button.

**Gate:** `npm run build` ✓ · `asset-guard dist` PASS (31 assets, no stray
`.DS_Store`) ✓ · `size-limit` per-game budgets all green — **2048 4.37 KB /
4.5 KB** brotli (core 953 B, shell 1.76 KB, CSS 622 B) ✓ · `lint:css` ✓ · full
playtest suite **15 passed** ✓ · `@lhci/cli autorun` LCP/CLS/TBT assertions all
pass (game script is lazy-loaded, so initial-page metrics are unchanged from the
baseline) ✓.

## 2026-07-14 — new game: Sky Hopper (`sky-hopper`)

Every menu game through Dash Run ships a screen script, so this run **adds an
eighth**: a new `<li>` button (`name="sky-hopper"`, label "SKY HOPPER"), a
`#sky-hopper` screen div, and `scripts/screen.sky-hopper.js` — a doodle-jump-style
**vertical climber**, the shell's first physics-driven platformer. The hopper
auto-bounces off one-way platforms under gravity; the player only STEERS left/right
(arrows / A·D or a held-drag pointer that eases toward the touch x, with screen
wrap). Height climbed is the score. A centred starter ladder guarantees a hands-off
climb from the opening bounce — the deterministic early score the playtest hangs on
(the first launch uses the *spring* velocity so the very first bounce clears the
camera line and the score ticks immediately). Above the ladder, platforms narrow
and space out and turn to **moving / one-shot crumbling / spring** variants as the
sky gradient darkens toward space — the difficulty curve. Physics are viewport-
relative (apex 0.29H clears every gap 0.16–0.235H with margin) and the landing test
is a swept, crossing-based check (`prevFeet ≤ platTop ≤ feet`) so no fall speed can
tunnel a platform. An rAF loop that halts when `#sky-hopper` loses `.active`, a BACK
button to the menu, WebAudio SFX (hop / spring / break / milestone / death), and a
best persisted to `localStorage["gameland.hi.sky-hopper"]`. High-scores name map,
`.size-limit.json` (`Game: Sky Hopper` budget) and the dead-button regression's
`IMPLEMENTED_TARGETS` all updated.

**Bug caught & fixed pre-commit:** the peak-follow camera shifted every platform's
`y` by the scroll delta but left `s.top` (the generation cursor) stale, so once the
starter ladder scrolled away `gen()` would stop spawning and the climb would dead-end
near the ladder cap (~score 190). Fixed by advancing `s.top` with the same delta.

**Playtest (Playwright, mobile 375×812 + desktop 1280×800):** canvas renders
(platforms / hopper / darkening sky), the run climbs, score accrues and the best
persists across a full reload, BACK returns to the menu — **zero console errors** at
both viewports. New spec `game.sky-hopper.spec.ts` guards the load/render/steer/
persist surface; the regression spec now also drives the enabled SKY HOPPER button.
A deeper vision-driven auto-play (detect hopper + platforms from canvas pixels, steer
toward the nearest platform) climbed to **403 — well past the ~190 ladder cap** —
empirically confirming endless generation past the ladder (the fix above) and the
moving-platform regime; death→restart and the High Scores row ("Sky Hopper", ranked
#1 at 403) both verified.

**Gate:** `npm run build` ✓ · `asset-guard dist` PASS (30 assets, no stray
`.DS_Store`) ✓ · `size-limit` per-game budgets all green — **Sky Hopper 4.45 KB /
4.5 KB** brotli (55 B headroom; core 953 B, shell 1.76 KB, CSS 622 B) ✓ · `lint:css`
✓ · full playtest suite **13 passed** ✓ · `lhci autorun` LCP/CLS/TBT assertions all
pass ✓.

## 2026-07-13 — new game: Road Cross (`road-cross`)

All five original menu games now ship a screen script, so this run **adds a
sixth**: a new `<li>` button (`name="road-cross"`, label "ROAD CROSS"), a
`#road-cross` screen div, and `scripts/screen.road-cross.js` — a Frogger-style
lane-crossing game and the shell's first game built on **discrete grid hops**
(no continuous physics), so it sits clearly apart from the paddle/thrust/stack/
slither games. The frog hops up through lanes of moving traffic to the far bank:
each new furthest row banks a point, a full crossing awards the row bonus and
ramps the traffic speed, and a car touch costs one of three lives (brief
invulnerability + blink on respawn). Geometry is resolution-independent — lanes
are described in **cell units** and projected through the current cell size each
frame, so a resize just rescales and the accumulating per-lane offset survives
it. An rAF loop that halts when `#road-cross` loses `.active`, keyboard
(arrows/WASD to hop, Space/Enter to start·restart) **and** touch (swipe to steer,
tap to hop up) controls, WebAudio SFX (hop/cross/hit/over), a BACK button to the
menu, and a furthest-progress best persisted to
`localStorage["gameland.hi.road-cross"]`. Every lane is phased at reset so a gap
sits dead-centre on the frog column — the opening hop always lands safe (mirrors
Snake's free first fruit) and gives the playtest a deterministic first point.
High-scores name map, `.size-limit.json` (`Game: Road Cross` budget) and the
dead-button regression's `IMPLEMENTED_TARGETS` all updated.

**Playtest (Playwright, mobile 375×812 + desktop 1280×800):** canvas renders
(banks/medians/dashed lanes/cars/frog), a run hops forward, score accrues and the
best persists to storage across a full reload, BACK returns to the menu — **zero
console errors** at both viewports. New spec `game.road-cross.spec.ts` guards the
load/render/input/persist surface; the regression spec now also drives the
enabled ROAD CROSS button. A deeper manual drive confirmed lateral input,
lives/death→respawn, game-over→restart, and the High Scores row ("Road Cross").

**Gate:** `npm run build` ✓ · `asset-guard dist` PASS (28 assets, no stray
`.DS_Store`) ✓ · `size-limit` per-game budgets all green — **Road Cross 4.49 KB /
4.5 KB** brotli (core 953 B, shell 1.73 KB, CSS 622 B) ✓ · `lint:css` ✓ ·
`playwright test` → **9 passed** ✓ · Lighthouse (`lighthouserc.json`) 3 runs, all
assertions passed — LCP/CLS/TBT within 2500 ms / 0.1 / 400 ms ✓. The game script
is lazy-loaded, so initial-page metrics are unchanged from the baseline.

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
