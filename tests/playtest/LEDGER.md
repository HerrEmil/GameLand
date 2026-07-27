# GameLand — Playtest Ledger

Cross-game self-play bug-hunt. Each run seeds fresh input ranges, plays the
screen state-machine headless, mines for real defects, and fixes the root cause
with a regression test.

## 2026-07-17 — FIX: game2 uninitialized-ball NaN phantom-clear (run seeds `177201`–`177274`)

Five-game playtest sweep (one subagent per game, deep multi-seed fuzz at mobile
375×812 + desktop 1280×800). Selection rule — fewest regression specs + oldest
ledger entry among games with a confirmed defect — picked **GameLand** this run:
tied-fewest regression specs (2) and the oldest last real code-fix (2026-07-15),
and it carried the standing HIGH-severity game2 defect flagged in the recon entry
below.

### FIXED (HIGH) — game2 (Block Breaker): uninitialized ball goes NaN, silently phantom-clears the level, banks a corrupt best

**Root cause.** `s.bx`/`s.by` were only ever assigned in `update()`'s not-launched
branch (`scripts/screen.game2.js:144`). `reset()` (`:69`) and `stick()` (`:67`)
never seeded them, so between a board reset and the first `update()` frame the ball
coords are `undefined`. If `launch()` lands in that window — double-tapping the
"play again" prompt on the game-over screen, or tapping the instant the screen
re-opens — `update()` takes the `moveBall()` branch and does `s.bx += s.vx*dt` on
`undefined` → **NaN forever**. A NaN ball then satisfies `brickHit()`'s inverted
reject guard (`NaN > r*r` is `false`, `:113`), so it kills exactly one brick per
frame, drains `s.alive` to 0 with no paddle contact, fires `nextLevel()` (`:119`),
and banks the unearned points to `gameland.hi.game2` at the next real game over
(`:92`). Reproduced this run both deterministically (69 consecutive `arc(NaN,NaN)`
draws = board size) and organically under plain spam-click fuzz (60 NaN draws,
sub-seed `177202`) — **zero console errors either way**, a fully silent corruption.

**Fix.** Name the rest position once — `function rest() { s.bx = s.px; s.by = s.py
- s.r - 1; }` — and call it from both `update()`'s not-launched branch (its only
previous home) and `stick()`, the chokepoint called by `reset()`, `nextLevel()`,
and `loseLife()`, always after `layout()` has set `px`/`py`/`r`. The ball now has
finite coords the moment the board resets, so an early `launch()` can no longer
read `undefined`, and the rest geometry has a single owner instead of two copies
to hand-sync. `reset()`'s state literal also declares `bx`/`by`/`vx`/`vy` up front,
matching the declare-then-recompute pattern every sibling uses (game3, game4,
road-cross, dash-run, star-blaster, astro-drift): a future missed seed then
degrades to a stale position the next frame corrects, rather than to permanent
NaN. Block Breaker 3.46 → 3.6 KB brotli, budget 4.5 KB.

**Regression test.** `regression-game2-uninitialized-ball.spec.ts` (mobile +
desktop). Gates `requestAnimationFrame` so the launching `pointerdown` lands
strictly before the first post-reset frame (the only window the bug needs), and a
`CanvasRenderingContext2D.arc` sentinel flags any non-finite ball draw. Proven
**RED pre-fix** (`anyNonFinite: true`, both viewports) → **GREEN post-fix**; also
asserts the ball still renders, in bounds, and actually moves after launch.
Known coverage gap: only the `reset()` seeding path is exercised — a regression
in `nextLevel()`/`loseLife()` seeding would not be caught here.

### Gate (all green)

`npm run build` clean · `npx playwright test` **25/25** · `npm run size` all
budgets green · Lighthouse (3 runs, dist): **LCP 1656ms** (≤2500) · **CLS 0.0000**
(≤0.1) · **TBT 0ms** (≤400); perf 1.00 / a11y 0.83 / bp 0.89 / seo 1.00.

### Cross-game sweep (this run's findings in the OTHER four repos — not fixed here)

Recorded so they aren't lost; each is filed/observed in its own repo's ledger:
- **2014-7DFPS** — NEW MAJOR: paused Space keydowns pump `velocity.y` unbounded
  (auto-repeat re-arms `canJump` every frame while paused, `PointerLockControls.js`
  `onKeyDown` case 32 lacks the `scope.enabled` gate the mousedown/contextmenu
  fixes already have); resume flings the player into the void.
- **GGJ2015** — HIGH, still open: touch-drag reads `e.screenX` (undefined on
  `TouchEvent`) → `positionRatio` NaN → game unwinnable on all touch devices
  (`src/scripts/makeSceneMovable.js:16,27-28`). Highest user impact overall, but
  GGJ2015 is the best-covered game (5 specs) so the selection rule deferred it.
- **Sandpiper** — NEW MEDIUM: engine-tier load failures (engine JS / wasm /
  dmloader) strand the player on a silent "Starting…" splash; the prior failure-UX
  fix only covered `archive/*` (`index.html` load_engine has no `onerror`).
- **LegendaryJourney** — clean in committed code (dirty tree with orphaned feature
  work left untouched); no fix candidate.

## 2026-07-17 — recon only, no fix (run seeds `77030100`–`77033000`)

Fan-out recon across the five games. GameLand was **not** this run's fix target —
the selection rule picks fewest-specs + oldest-ledger-entry and GameLand is the
**best-covered** repo at 12 specs, so Sandpiper took the fix. This entry exists so
the findings below survive the run. Seeds used: `77030100` (mobile 375×812 all-game
fuzz base, per-game seed = base + gameIndex×7), `77030200` (desktop 1280×800 fuzz
base, same derivation), `77031000` / `77032000` / `77033000` (bear-hunt / game3 /
astro-drift deep play). Range `77030000..77039999`, never used before.

### LEADING CANDIDATE for the next GameLand fix run — keyboard trap (MEDIUM, WCAG 2.1.2 Level A)

**The `← BACK` button cannot be activated from the keyboard in 10 of the 13 games.**
Confirmed headlessly, not inferred from reading.

**Root cause.** Every game registers a *document-level* `keydown` listener that calls
`e.preventDefault()` on its game keys **without checking whether the event target is an
interactive control**. When the screen's own `← BACK` button has focus, the browser's
default action for Enter/Space on a focused `<button>` is to synthesise a click —
`preventDefault()` cancels it. Space and/or Enter are game keys in every game, so BACK
silently does nothing.

Fully trapped (both Enter **and** Space swallowed) — 10 games:

| game | file:line |
| --- | --- |
| Tower Stack | `screen.game4.js:210,213` — `isDropKey` explicitly lists `"Enter"` |
| Snake | `screen.snake.js:245,249` |
| Road Cross | `screen.road-cross.js:270,272` |
| Dash Run | `screen.dash-run.js:289,293` |
| Sky Hopper | `screen.sky-hopper.js:113,114,117` |
| 2048 | `screen.tile-2048.js:146,151` |
| Star Blaster | `screen.star-blaster.js:117,120` |
| Tetra | `screen.tetra.js:182,185-187` |
| Missile Command | `screen.missile-command.js:108,112` |
| Astro Drift | `screen.astro-drift.js:300-302` |

Escapable via Enter (Space dead only) — these three simply never handle Enter, which is
the whole reason they survive: `screen.bear-hunt.js:230`, `screen.game2.js:220,222`,
`screen.game3.js:215,218`.

**Why it is a TRUE trap, not just a dead key.** `styles/main.css:34-45` makes inactive
`.screen`s `display:none`, so they are unfocusable — on a game screen the *entire* focus
ring is that game's own (dead) buttons. Observed focus-ring dumps:

```
game4        TRAPPED — focus ring: button[← BACK] in #game4 | body
astro-drift  TRAPPED — focus ring: button[← BACK] | ◄ | ► | ● | ▲ | body
```

None of them activate. Escape requires a **mouse or a page reload**.

**Repro.** Build, serve `dist/` on :5052, open it, click the splash. Focus the `TETRA`
menu button → Enter (Tetra opens). Tab → focus lands on `← BACK`. Enter → nothing.
Space → nothing (it hard-drops the piece instead). Tab → `body`. No other control exists.

**Evidence method — this is what makes the finding trustworthy.** Instrumenting
`defaultPrevented` *after* the games' handlers ran gave a **perfect correlation**: `true`
in exactly the 23 DEAD cases, `false` in the 3 OK cases — pinning the mechanism rather
than just the symptom. Crucially the probe also ran **positive controls** on `#main-menu`
and `#high-scores` (no game keydown handler), where Enter and Space activate buttons
normally — proving the probe detects *working* activation instead of always reporting
failure.

**Two gotchas for whoever fixes this — the important part.**
- **(a) Size budgets.** Each fix is a one-line early-return when the target is a control
  (e.g. `if (e.target.closest("button")) { return; }`); no behaviour change during normal
  play, since the canvas is not focusable and `e.target` is `body`. But four games sit
  within ~0.05 KB of the 4.5 KB brotli cap (**Road Cross 4.47, Missile Command 4.47,
  Tetra 4.46, Sky Hopper 4.45**), so **13 inline copies of a ~45-char guard may bust a
  budget**. A shared helper in `game.js` (core/shell budget, counted once) is likely
  cheaper than 13 copies. Re-check `npm run size`.
- **(b) No central shortcut.** A central *capture-phase* listener **cannot
  "un-preventDefault"**. A genuinely shell-owned fix means the shell owns key dispatch —
  a bigger refactor than this defect warrants. Don't start down that road by accident.

**Regression test design (proven pre-fix result).** For each game: enter via keyboard,
Tab the focus ring, press Enter and Space at each stop, assert `#main-menu` regains
`.active`. **Fails today for the 10 trapped games, passes for the 3 Enter-escapable
ones.** Tighter form: focus `#<game> button` (BACK), press Enter, assert `#main-menu` is
active — fails today for 10 games.

### Still-open LOW — every *loaded* game rebuilds its canvas on every resize

Each `setup()` does `window.addEventListener("resize", size)` and never removes it
(`screen.astro-drift.js:368`, `screen.bear-hunt.js:258`, `screen.game3.js:246`, …), and
`size()` unconditionally does `cv.width = W; cv.height = H;`
(`screen.astro-drift.js:334-337`, `screen.bear-hunt.js:235-238`,
`screen.game3.js:222-226`) — reallocating and clearing a full-viewport backing store with
no `active()` guard. Measured by hooking the `HTMLCanvasElement.prototype.width` setter,
sitting on the **menu** with no game on screen: 0 games visited → **0** reallocations per
resize event; 1 game → **1**; all 13 → **13** (60 events → 780 reallocations). At
1280×800 that is ~53 MB of backing-store churn per resize event, and resize fires
continuously while dragging a window edge.

**Honest caveat — do not let this read stronger than it is.** The JS cost is
**negligible**: 60 synthetic resize events cost 1.4 ms total (**0.023 ms/event**). No
jank, no dropped frames and no memory growth were observed. This is a **latent
inefficiency confirmed by instrumentation, NOT an observed user-facing failure.**

**Real gotcha if anyone fixes it.** The guard must go on the **listener**, not inside
`size()`: `game.js:56-57` calls `run()` **before** `classList.add("active")`, so
`begin()` → `size()` runs while `active()` is still **false**. A naive
`if (!active()) { return; }` inside `size()` would skip the initial sizing and leave a
300×150 canvas. Correct shape:

```js
window.addEventListener("resize", function () { if (active()) { size(); } });
```

Regression test: hook the canvas `width` setter, visit all 13 games, return to the menu,
dispatch one resize, assert ≤1 reallocation. Fails today (13), passes after.

### Coverage gap — three games have no dedicated spec

**`bear-hunt`, `game3` (Cave Flyer) and `astro-drift` ship no `game.*.spec.ts`.** All 13
are navigate-only smoke-driven via `regression-dead-menu-buttons.spec.ts`
`IMPLEMENTED_TARGETS:18`, but those three have no dedicated playtest spec. This run
biased its budget onto them and **all three came back functionally clean** at both
viewports (zero console/page errors): bear-hunt played a full 45 s round → TIME! →
restart → loop alive, best persisted (mobile 1703, desktop 1268) and survived reload;
game3's bang-bang hover threaded the opening gap → crash → restart → loop alive, best
persisted (mobile 3, desktop 5) and survived reload; astro-drift lost all 3 lives →
GAME OVER / ★ NEW BEST overlay, best persisted (mobile 240, desktop 260) and survived
reload. So they are **exercised but still unguarded** — a future run can write their
specs against known-good behaviour.

### Clean / verified this run

Baseline `npx playwright test` on `main` → **23 passed** (findings are attributable to the
code, not a red baseline). All 13 games: enter + BACK at 375×812 and 1280×800 with a
90-step seeded keyboard+pointer fuzz each → zero console errors, zero pageerrors, zero
404s, render loop alive after fuzz. **NaN/Infinity probe:** hooked 22
`CanvasRenderingContext2D` methods to trap any non-finite numeric argument across fuzz +
resize + deep play at both viewports — **zero** non-finite values reached any draw call
(corrupt score/position/velocity flows into a draw arg, so this covers state broadly).
**Mid-run resize sweep**, all 13 games (900×500 → 900×900 taller → 900×380 shorter →
375×812 → 1280×800): no pageerror, no NaN, loop alive (≥1 draw/500 ms) everywhere — the
**Road Cross taller-resize freeze class did NOT reappear anywhere**. **Spam re-entry:**
12× back-to-back `showScreen(g)` + 6× menu↔game round-trips per game → exactly 1 canvas
per screen, rAF tick ratio ≥0.85 vs. menu baseline for all 13, and **zero draw calls
after leaving a screen** (no leaked or dual rAF loops). High-scores name map
(`screen.high-scores.js:7-21`) covers all 13 games — nothing falls back to the
auto-titleiser. **CLS** on boot + menu→high-scores→back = **0.000**.

### Flakes chased down and reclassified — do NOT re-report these as defects

- **astro-drift "stall" at 375×812** (score froze at 160 / SHIPS 1 for 30 s): **not a
  defect.** Rock speed scales with `U = min(W, H)` (`screen.astro-drift.js:335`), so on a
  phone viewport rocks legitimately drift ~2× slower than desktop and sitting still
  survives for a long time. Flying actively reached game-over and persisted (240).
- **"canvas not repainting after resize" in 9 games:** probe artifact — the paint check
  sampled a *static* top-left region. Replaced with a draw-call counter → all 13 clean.
- **astro-drift BACK "not actionable" during fuzz:** probe artifact — astro-drift is the
  **only** game with BACK at **top**-left (`screen.astro-drift.js:352`) rather than
  bottom-left, so random fuzz clicks hit it and navigated away.
- The prior run's one-off **game4 BACK actionability blip did NOT reproduce** — game4's
  BACK clicked cleanly on every pass.

**Known-deferred:** the mobile horizontal overflow (`#game` fixed `width:1024px`, viewport
meta at `index.html:5` omits `width=device-width`) and the `install-screen` terminal state
were both re-confirmed this run — **not worse than logged**, still deferred.

**Gate:** recon only — **no source file was touched**, no spec added, no commit. `npm run
build` ✓ · baseline `npx playwright test` → **23 passed** ✓ · probe specs written under
`tests/playtest/tmp-*.spec.ts` were **deleted**; tree left clean apart from this ledger
entry, with no `dist/` or `.lighthouseci/` churn.

## 2026-07-15 — fix: Road Cross taller-resize freeze (run seed `2026071530`)

Fan-out recon this run played all five games headless with fresh disjoint seeds
(2014-7DFPS `2026071510`, GGJ2015 `2026071520`, GameLand `2026071530`,
LegendaryJourney `2026071540`, Sandpiper `2026071550`). GameLand was picked to
fix: it carried the only hard **crash** among the five (the others surfaced only
latent/semantics-changing items — an uncaught `requestPointerLock()` rejection in
2014-7DFPS, the long-deferred GGJ2015 bubble-leak/layer-desync, all clean on
Sandpiper/LJ).

**Defect (confirmed, MEDIUM — game freeze).** Road Cross froze on a **taller
mid-run resize**. `size()` (the window `resize` handler) called `metrics()`, which
recomputes the row count `R` from the new viewport height, but never rebuilt
`s.rows` — that array was sized to the run's *original* `R` in `reset()`/`buildRows()`.
Growing the viewport bumped `R` up while `s.rows` stayed short, so the next frame's
`update()` lane loop (`screen.road-cross.js:167`) and `render()` row loop (`:202`)
indexed `s.rows[r]` past the array end → `TypeError: Cannot read properties of
undefined (reading 'road')`. The throw escaped the rAF callback `frame`, so
`requestAnimationFrame` was never re-scheduled → the loop died and the game froze.
Only a *taller* resize (one that increases `R`) crashed; a shorter one left
`s.rows` longer than `R`, so indices stayed in-bounds.

**Fix (minimal, one line).** The header note already promises "Lanes are in CELL
units … so resize just rescales" — so the grid dimensions (`C`/`R`) should be fixed
for the run and a resize should only rescale the cell size. `reset()` still calls
`metrics()` to fix the run's grid; `size()` now recomputes **only** `cw`/`ch`
(`cw = W / C; ch = H / R;`) instead of re-running `metrics()`. `s.rows` can no
longer fall out of sync with `R`. Kept size-neutral (Road Cross was at 4.49 KB of
its 4.5 KB brotli budget) by trimming header prose; final 4.47 KB.

**Regression test:** `regression-roadcross-resize.spec.ts` — opens Road Cross at a
short viewport (R=9), starts the run, resizes **taller** (R→cap 15), and asserts no
`pageerror` and that the rAF loop is still live (a mid-canvas traffic band keeps
changing). Proven **FAIL pre-fix** (`TypeError … reading 'road'` at
`screen.road-cross.js:169`) and **PASS post-fix**, plus a shorter-resize control
that stays clean.

**Also restored main to green:** the `astro-drift` game (shipped in `c2b1305`)
was missing from `regression-dead-menu-buttons.spec.ts`'s `IMPLEMENTED_TARGETS`,
so that spec wrongly expected its (correctly enabled, working) menu button to be
disabled → the suite was red on `main` before this run. Added `"astro-drift"` to
the allowlist; the spec now actively drives its screen (navigate → no 404 → no
console error).

**Gate:** `npm run build` ✓ · `npx playwright test` → **23 passed** · `npm run
size` all budgets green (Road Cross 4.47 KB) · `npm run lint:css` clean · LHCI
`autorun` all assertions pass (LCP/CLS/TBT within 2500 ms / 0.1 / 400 ms on
`index.html`). No html-validate config in this repo (HTML untouched).

**Known follow-ups (not this run):**
- The prior mobile-overflow follow-up (`#game` fixed `width:1024px`, viewport meta
  omits `width=device-width`) still stands.
- 2014-7DFPS: route `document.body.requestPointerLock()`'s rejected promise into
  the existing `pointerlockerror` recovery (uncaught rejection under Chrome's
  re-lock cooldown) — a real fix for a 2014-7DFPS run.
- GGJ2015: the deferred bubble DOM-leak / locked-bubble stacking and the
  `currentLayer` singleton desync both reproduced again this run and remain open.

## 2026-07-15 — new game: Missile Command (`missile-command`)

All eleven menu games through Tetra ship a screen script, so this run **adds a
twelfth**: a new `<li>` button (`name="missile-command"`, label "MISSILE
COMMAND"), a `#missile-command` screen div, and `scripts/screen.missile-command.js`
— a **point-defence** game and the shell's first *tap-to-target* mechanic. Star
Blaster is a shooter you *steer*; Road Cross / Dash Run dodge lanes; nothing else
lets you **aim a detonation at an arbitrary point**, so it sits clearly apart.
Warheads rain from the top toward six cities along the ground; you TAP (or steer a
crosshair with arrows/WASD and fire with Space) to lob an interceptor from the
central base that flies to the point and **detonates**, and the expanding blast
destroys every warhead inside it — direct kills score `25` and each kill spawns a
small **chain blast**, so a well-placed shot cascades through a cluster. A wave
grants a fresh clip of `20` interceptors (running dry is the real risk), warheads
speed up and grow denser each wave (`0.075 + 0.011·wave` normalised/s, `7 + 2·wave`
of them) and from **wave 4** a warhead can **split mid-air** into 1–2 MIRVs;
clearing a wave banks `100·cities + 5·ammo` and losing the last city ends the run.
A key robustness choice: **all positions are stored normalised (0..1) and scaled
by the live viewport every frame**, so a resize just re-projects rather than
corrupting baked coordinates (the Road Cross resize-bug class can't occur here).
Blasts grow/hold/shrink over `0.82 s` and collide in pixel space against a circle
matching the drawn radius; a new best is written to
`localStorage["gameland.hi.missile-command"]` immediately on the first kill.
Night-sky gradient with stars, cyan skylines that crumble to rubble when hit, red
warhead trails with peach heads, cyan interceptor trails, additive (`lighter`)
radial-gradient explosions, a screen-shake on city loss, HUD (score / best / wave
/ ammo / cities), a start prompt and a "GAME OVER / ★ NEW BEST / tap · space to
replay" overlay. High-scores name map, `.size-limit.json` (`Game: Missile Command`
budget) and the dead-button regression's `IMPLEMENTED_TARGETS` all updated. A
review pass also caught and fixed a real defect: the wave-clear bonus/advance was
guarded only at the top of `update`, so the **death frame** (last missile destroys
the last city, emptying the wave) could still award the ammo bonus, refill ammo and
play the wave jingle after game-over — now gated on `!s.over`.

**Playtest (Playwright, mobile 375×812 + desktop 1280×800):** the canvas fills the
viewport and renders a non-blank frame; the test aims like a human — it reads the
canvas, finds the warm-coloured warhead (red trail / peach head) and taps it, with
taps **paced slower than a blast's 0.82 s life** so no stale blast pollutes the
scan, firing only when a warhead is seen. A single well-aimed interceptor banks and
persists a score at both viewports (1–2 shots per run in practice); the keyboard
aim+fire path runs clean. Best survives BACK (which halts the rAF loop) and a full
reload. **Zero console errors** at both viewports. New spec
`game.missile-command.spec.ts` guards the load/render/intercept/persist surface;
the regression spec now also drives the enabled MISSILE COMMAND button.

**Gate:** `npm run build` ✓ · `asset-guard dist` PASS (34 assets, no stray
`.DS_Store`) ✓ · `size-limit` per-game budgets all green — **Missile Command
4.47 KB / 4.5 KB** brotli ✓ · `lint:css` ✓ · full playtest suite **21 passed** ✓ ·
`@lhci/cli autorun` LCP/CLS/TBT assertions all pass (the game script is
lazy-loaded, so initial-page metrics are unchanged from the baseline) ✓.

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

---

## 2026-07-17 (run 2) — RECON ONLY (no code fix) — game2 NaN phantom-clear

**Not this run's fix target.** 2014-7DFPS won selection (fewest regression specs:
2 vs this repo's 12) and was fixed/gated/pushed instead. This run touched **only
this ledger** — no source, no spec; all probes were throwaway specs inside the
repo tree, deleted afterwards. Baseline `npx playwright test` **23 passed** before
and after, so every finding below is attributable to code, not a red baseline.

**Seeds this run:** `77173001` (deep-play RNG), `77173107`/`77173211` (desktop
1280x800 fuzz), `77173319`/`77173427` (mobile 375x812 fuzz), `77173535`
(showScreen storm), `77173643` (resize storm), `77173751` (load-race/persistence).
Per-game fuzz sub-seeds = seed + gameIndex*13 (max `77173250`). Range
77173000-77173999; prior runs used `2026071203` etc.

**Play depth:** all **13** games driven through a real round (start → play →
game-over → restart → BACK), plus 260 fuzz steps/game at both viewports.
Exception: tile-2048 got 532 clean moves but its over-state was not observed —
any post-over key resets instantly, so a between-moves detector can miss it.
**Driver limitation, no defect implied.**

**Spec coverage gap (unchanged):** `bear-hunt`, `game3`, `astro-drift` still have
no dedicated spec (10 of 13 do). Note `game2` *has* a spec, but it does not touch
the restart window below — coverage existing is not coverage of the bug.

---

### DEFECT (MEDIUM, confirmed) — game2 (Block Breaker): a NaN ball silently phantom-clears a whole level and corrupts the saved high score. **LEADING CANDIDATE FOR THE NEXT FIX RUN.**

**Root cause — `s.bx`/`s.by` have no initializer on any reset path.**
* `reset()` (`scripts/screen.game2.js:69-77`) builds a fresh `s` with `px` and
  `launched` but **never sets `bx`/`by`**.
* `stick()` (`:67`) sets `launched=false, vx=0, vy=0` — **also not `bx`/`by`**.
* `launch()` (`:81-86`) sets `launched=true, vx, vy` — **also not `bx`/`by`**.
* The **only** initializer is `update()`'s `!launched` branch (`:144`):
  `if (!s.launched) { s.bx = s.px; s.by = s.py - s.r - 1; return; }`.

So if `launch()` runs in the window between `reset()` and that fresh state's first
rAF tick, it flips `launched` **before** `:144` ever runs — the initializer is
skipped forever, and `moveBall()` (`:129`) does `undefined += vx*dt/steps` →
**`bx`/`by` = NaN with velocities still finite**.

**Why it clears the board.** `brickHit()`'s rejection test is
`if (dx*dx + dy*dy > s.r*s.r) { continue; }` (`:113`). With NaN, that comparison
is **false** — so the guard never fires and the loop kills **the first alive brick
every frame**. Closure dump one frame in: `score:50, alive:69, vx:-26.4,
vy:-479.5, px:1175`, everything else finite. NaN draws stop at exactly 69-70
frames = the 70-brick board (14x5): the level **silently self-clears** (~2100
unearned points at 1280x800, plus a level-up), then `nextLevel()` → `stick()` →
and `:144` finally restores a finite ball into level 2. **Zero pageerrors, zero
console errors** — the ball is simply invisible (`arc(NaN,NaN,11)` from `render`
`:168`) and the score is silently wrong. It persists to `gameland.hi.game2` at
the next real game over (`:92`).

**Repro (both on the unmodified build, deterministic).**
* (a) **double-tap restart on the game-over screen** — two pointerdowns inside one
  ~16ms frame: the first `primary()` → `reset()`, the second → `launch()` →
  0 → 70 NaN draws. Real-player reachable by mashing Space/click/tap on game-over.
* (b) a single pointerdown injected between a re-entry `showScreen("game2")` reset
  and the next frame.

**Fix shape.** Initialize `bx`/`by` in `stick()` — it is called by **both**
`reset()` and the life-loss path, so it is the one chokepoint that covers every
way the ball is re-stuck. One line.

**Budget note — the agent's constraint claim was WRONG, do not act on it.** It
reported "~0.5KB headroom, 9.97/10KB shared pool". That pool no longer exists:
`.size-limit.json` moved to **per-game sub-budgets**, and Block Breaker is
measured on its own at **3.46 kB of a 4.5 kB brotli limit** (verified this run via
`npm run size`) — **over 1 kB of headroom**. A one-line fix is nowhere near the
budget.

**Regression test design.** Drive `showScreen("game2")`, then dispatch
`pointerdown` **before** yielding a frame (or two pointerdowns within one frame on
the game-over screen); assert `Number.isFinite` on the ball across the next ~80
frames, and assert `alive` does **not** collapse to 0 without paddle contact.
Assert on the closure state, not pixels — the ball is invisible either way, so a
pixel probe cannot distinguish the bug from a clean launch.

---

### DEFECT (MEDIUM-LOW, confirmed) — `showScreen`: last-*resolved* wins, not last-*requested*

`scripts/game.js:49-61` has no request sequencing. Measured with a synthetic 500ms
load latency: click TETRA (first-visit load delayed), click SNAKE 80ms later →
snake activates and plays, then tetra's late load **resolves and silently steals
the screen** (final active = `tetra`). Snake's loop halts cleanly — no dual loop,
no errors — but the player watches their chosen game get yanked. **First visit per
game only** (the loader caches afterwards), which is why the 25-call out-of-order
storm below did *not* catch it: warmed screens resolve instantly.
*Fix shape:* a monotonic request token in `showScreen`; drop stale resolutions.

### DEFECT (LOW-MEDIUM, confirmed) — game4 (Tower Stack): mid-run shrink hides the tower and forces a crash

Blocks/slab store **absolute pixel x** (`scripts/screen.game4.js:59,101`); `size()`
(`:216-220`) recomputes metrics but **never rescales existing geometry**, and the
slab clamp `hi = W - margin - mv.w` (`:113-114`) goes **negative** when
`mv.w > W - 2*margin`. 1280 → 375 mid-run: the tower (x ~430-850) is entirely
off-canvas and the pinned slab can leave the **whole playfield invisible**
(vivid-pixel count 17125 → 0; another iteration 27237 → 4676 = slab only). The
next drop then has zero possible overlap → game over, **3/3 deterministic**.

No throw — this is **not** the Road-Cross freeze class (that fix stayed green
everywhere). Road-cross (cell units) and missile-command (normalized 0..1) already
solve this class; **game4 predates it** and is the last holdout.

### DEFECT (LOW, confirmed) — snake: a grid-changing resize silently discards the run

`scripts/screen.snake.js:273` — deliberate code. 1280 → 1240 at t~1.2s into a live
run (cols 40 → 39) → full `reset()` to the idle prompt. Control run persisted its
length within 6s; the resized run wrote nothing in 7s (snake persists only at
gameOver). Loop alive, no errors — **pure silent progress loss**, and inconsistent
with road-cross/tetra/2048, which all survive resize.

### DEFECT (LOW) — throttled best-score writes never flush on BACK/quit

Only death flushes. **CONFIRMED** for two:
* `dash-run` (`scripts/screen.dash-run.js:79-89`, >=5-pt throttle): writes measured
  at 5/10/15 on a 481ms-per-5pts cadence; BACK ~300ms after "15" → storage frozen
  at 15, **~3 best-points dropped**.
* `tetra` (`scripts/screen.tetra.js:127-133`, >=100 after the first write): drop1
  persisted 36, drop2 banked >=28 more, no write on drop2/BACK/after — stored best
  stays **36**.

**INFERENCE (same code shape, NOT probed):** `screen.sky-hopper.js:88-92` (>=5) and
`screen.star-blaster.js:73-77` (>=20). Do not file these as confirmed without
measuring them. Nothing flushes on tab close either (no `pagehide` hook).
*Fix shape:* flush in each BACK handler, or one shared `pagehide` listener.

### Verified CLEAN this run

- **Asset hygiene:** boot + all 13 games + high-scores = 26 unique request paths,
  all **200**, every path string-matching the dist listing **exact-case** (35
  files) — no APFS-masked casing bug headed for S3.
- **NaN/Infinity net** (21 ctx methods, canvas width/height setters, localStorage
  values) armed in **every** test: zero non-finite anywhere **except** game2 above;
  all `gameland.hi.*` writes integers.
- **Fuzz** (4 seeds x 260 steps x 13 games, both viewports): single active screen,
  live rAF loop, zero console/page errors, zero 404s per game. game2 was the only
  hit (sub-seed `77173146`).
- **Races:** 25-call out-of-order `showScreen` storm (8ms spacing, warmed screens)
  settles on the **last-requested** screen, zero leaked loops (per-screen draw
  counters frozen for all inactive screens; 0 draws on menu); 8x re-entry spam →
  exactly 1 canvas.
- **Resize storm** x12 (375x812 <-> 1280x800) during play on game4/road-cross/
  astro-drift/tetra/sky-hopper: loops alive, NaN-clean, error-free. **CLS = 0.000**
  across boot/nav.
- Restart-after-over works in all 13; best-score persistence survives reload where
  exercised.

**Not re-reported** (already filed above in this ledger): keyboard trap (BACK
unreachable in 10/13), mobile 1024px overflow + viewport meta, install-screen
terminal state. Re-observed and still accurate: per-loaded-game resize canvas
realloc (latent inefficiency).
