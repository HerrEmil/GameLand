carny.screens["game2"] = (function () {
	// Block Breaker — paddle-and-ball brick game (screen id "game2"). Clear the
	// bricks to advance; the ball speeds up each level. Same lazy-load + firstRun
	// convention as the other screens; over 5 KB so the perf build hashes it.
	var game = carny.game,
		HI = "gameland.hi.game2",
		TAU = 6.2831853, MAXA = 1.05,          // steepest paddle bounce angle
		COLORS = ["#ff5d5d", "#ff9f45", "#ffd23f", "#4bd06a", "#3fa9ff"],
		firstRun = true, el, cv, c,
		W = 1024, H = 748, HUD = 52,
		raf = 0, last = 0, ac = null, s;

	// ---- audio (gesture-gated, same pattern as bear-hunt) ----
	function unlockAudio() {
		if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; } }
		if (ac && ac.state === "suspended") { try { ac.resume(); } catch (e) {} }
	}
	function beep(f, d, type, v, when) {
		var a = ac; if (!a) { return; }
		try {
			var t = a.currentTime + (when || 0), o = a.createOscillator(), g = a.createGain();
			o.type = type; o.frequency.value = f;
			g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
			o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + d);
		} catch (e) {}
	}
	function sfxBounce(f) { beep(f, 0.06, "square", 0.07); }
	function sfxBrick(row) { beep(500 + (4 - row) * 80, 0.07, "square", 0.09); beep(760, 0.05, "sine", 0.05, 0.02); }
	function sfxLife() { beep(200, 0.18, "sawtooth", 0.12); beep(90, 0.28, "triangle", 0.1, 0.06); }
	function sfxLevel() { [523, 784, 1047].forEach(function (f, i) { beep(f, 0.16, "triangle", 0.12, i * 0.1); }); }

	function loadHi() { try { return parseInt(localStorage.getItem(HI), 10) || 0; } catch (e) { return 0; } }
	function clampX(x) { return Math.max(s.pw / 2, Math.min(W - s.pw / 2, x)); }

	// Geometry derived from the viewport so the board is responsive.
	function layout() {
		s.mx = Math.max(10, W * 0.03);
		s.gap = 6;
		s.bw = (W - 2 * s.mx - (s.cols - 1) * s.gap) / s.cols;
		s.bh = Math.max(16, Math.min(30, H * 0.026));
		s.top = HUD + 22;
		s.pw = Math.max(78, Math.min(210, W * 0.17));
		s.ph = Math.max(12, Math.min(18, H * 0.02));
		s.py = H - s.ph - 40;
		s.r = Math.max(7, Math.min(11, W * 0.012));
		s.px = clampX(s.px);
		for (var i = 0; i < s.bricks.length; i++) {
			var b = s.bricks[i];
			b.x = s.mx + b.col * (s.bw + s.gap);
			b.y = s.top + b.row * (s.bh + s.gap);
		}
	}

	function buildBricks() {
		s.bricks = []; s.alive = 0;
		for (var row = 0; row < s.rows; row++) {
			for (var col = 0; col < s.cols; col++) {
				s.bricks.push({ row: row, col: col, alive: true, pts: (s.rows - row) * 10, color: COLORS[row % COLORS.length] });
				s.alive++;
			}
		}
		layout();
	}

	function launchSpeed() { return Math.min(H * 1.05, H * 0.6 + (s.level - 1) * H * 0.05); }

	// The ball's rest position on the paddle. Seeded by stick() as well as tracked
	// per-frame by update(), so the ball has finite coords the moment the board
	// resets — a launch() landing before the first update() frame used to read
	// undefined bx/by and NaN-poison the whole board.
	function rest() { s.bx = s.px; s.by = s.py - s.r - 1; }

	function stick() { s.launched = false; s.vx = 0; s.vy = 0; rest(); }

	function reset() {
		s = {
			over: false, record: false, score: 0, best: loadHi(), lives: 3, level: 1,
			bricks: [], left: false, right: false,
			cols: Math.max(6, Math.min(14, Math.round(W / 86))), rows: 5,
			px: W / 2, launched: false, bx: 0, by: 0, vx: 0, vy: 0
		};
		buildBricks(); stick();
	}

	function nextLevel() { s.level++; buildBricks(); stick(); sfxLevel(); }

	function launch() {
		if (s.launched || s.over) { return; }
		s.launched = true;
		var sp = launchSpeed(), a = Math.random() * 0.5 - 0.25;
		s.vx = sp * Math.sin(a); s.vy = -sp * Math.cos(a);
	}

	function loseLife() {
		s.lives--; sfxLife();
		if (s.lives <= 0) {
			s.over = true; s.record = s.score > s.best;
			if (s.record) { s.best = s.score; try { localStorage.setItem(HI, s.score); } catch (e) {} }
		} else { stick(); }
	}

	function paddleHit() {
		var half = s.pw / 2;
		if (s.vy > 0 && s.by + s.r >= s.py && s.by - s.r <= s.py + s.ph &&
				s.bx >= s.px - half - s.r && s.bx <= s.px + half + s.r) {
			var rel = Math.max(-1, Math.min(1, (s.bx - s.px) / half)),
				sp = Math.hypot(s.vx, s.vy) || launchSpeed();
			s.by = s.py - s.r; s.vx = sp * Math.sin(rel * MAXA); s.vy = -sp * Math.cos(rel * MAXA);
			sfxBounce(210);
		}
	}
	function brickHit() {
		for (var i = 0; i < s.bricks.length; i++) {
			var b = s.bricks[i];
			if (!b.alive) { continue; }
			var nx = Math.max(b.x, Math.min(s.bx, b.x + s.bw)),
				ny = Math.max(b.y, Math.min(s.by, b.y + s.bh)),
				dx = s.bx - nx, dy = s.by - ny;
			if (dx * dx + dy * dy > s.r * s.r) { continue; }
			b.alive = false; s.alive--; s.score += b.pts;
			sfxBrick(b.row);
			// Bounce off the nearest face (shallower overlap axis); one brick per step.
			if (Math.abs(dx) > Math.abs(dy)) { s.vx = (dx > 0 ? 1 : -1) * Math.abs(s.vx || 1); }
			else { s.vy = (dy >= 0 ? 1 : -1) * Math.abs(s.vy || 1); }
			if (s.alive <= 0) { nextLevel(); }
			return;
		}
	}
	function moveBall(dt) {
		// Sub-step so a fast ball can't tunnel through a brick or wall.
		var dxT = s.vx * dt, dyT = s.vy * dt,
			steps = Math.max(1, Math.ceil(Math.hypot(dxT, dyT) / s.r));
		for (var k = 0; k < steps; k++) {
			if (!s.launched || s.over) { return; }
			s.bx += dxT / steps; s.by += dyT / steps;
			if (s.bx - s.r < 0) { s.bx = s.r; s.vx = Math.abs(s.vx); sfxBounce(320); }
			else if (s.bx + s.r > W) { s.bx = W - s.r; s.vx = -Math.abs(s.vx); sfxBounce(320); }
			if (s.by - s.r < HUD) { s.by = HUD + s.r; s.vy = Math.abs(s.vy); sfxBounce(320); }
			paddleHit();
			brickHit();
			if (!s.launched || s.over) { return; }
			if (s.by - s.r > H) { loseLife(); return; }
		}
	}

	function update(dt) {
		if (s.over) { return; }
		var dir = (s.right ? 1 : 0) - (s.left ? 1 : 0);
		if (dir) { s.px = clampX(s.px + dir * W * 1.4 * dt); }
		if (!s.launched) { rest(); return; }
		moveBall(dt);
	}

	function rrect(x, y, w, h, r) {
		c.beginPath();
		if (c.roundRect) { c.roundRect(x, y, w, h, r); return; }
		c.moveTo(x + r, y);
		c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
		c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
	}
	function bg() {
		var g = c.createLinearGradient(0, 0, 0, H);
		g.addColorStop(0, "#1b2450"); g.addColorStop(0.6, "#141a38"); g.addColorStop(1, "#0c1024");
		c.fillStyle = g; c.fillRect(0, 0, W, H);
	}
	function render() {
		bg();
		for (var i = 0; i < s.bricks.length; i++) {
			var b = s.bricks[i];
			if (!b.alive) { continue; }
			c.fillStyle = b.color; rrect(b.x, b.y, s.bw, s.bh, 5); c.fill();
		}
		c.fillStyle = "#eef3ff"; rrect(s.px - s.pw / 2, s.py, s.pw, s.ph, s.ph / 2); c.fill();
		c.fillStyle = "#fff"; c.beginPath(); c.arc(s.bx, s.by, s.r, 0, TAU); c.fill();
		hud();
		if (!s.launched && !s.over) { prompt(); }
		if (s.over) { over(); }
	}
	function hud() {
		var fs = Math.max(20, Math.min(32, W / 24));
		c.textBaseline = "top"; c.font = "bold " + fs + "px Roboto, sans-serif";
		c.fillStyle = "#dfe6ff"; c.textAlign = "left"; c.fillText("SCORE " + s.score, 20, 14);
		c.textAlign = "center"; c.fillStyle = "#9fb0e6"; c.fillText("LVL " + s.level, W / 2, 14);
		c.textAlign = "right"; c.fillStyle = "#9fb0e6"; c.fillText("BEST " + s.best, W - 20, 14);
		for (var i = 0; i < s.lives; i++) {         // lives, as balls
			c.fillStyle = "#ff6b6b"; c.beginPath(); c.arc(W - 20 - i * 20, 14 + fs + 14, 7, 0, TAU); c.fill();
		}
	}
	function prompt() {
		c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "#cfe0ff";
		c.font = "600 " + Math.min(30, W / 22) + "px Roboto, sans-serif";
		c.fillText("Tap or press Space to launch", W / 2, s.py - 60);
	}
	function over() {
		var cx = W / 2;
		c.fillStyle = "rgba(8,10,26,0.78)"; c.fillRect(0, 0, W, H);
		c.textAlign = "center"; c.textBaseline = "middle";
		c.fillStyle = "#ff8f8f"; c.font = "bold 72px Roboto, sans-serif"; c.fillText("GAME OVER", cx, H * 0.34);
		c.fillStyle = "#fff"; c.font = "bold 44px Roboto, sans-serif"; c.fillText("Score  " + s.score, cx, H * 0.47);
		c.fillStyle = s.record ? "#ffd23a" : "#c9d4f2"; c.font = "bold 30px Roboto, sans-serif";
		c.fillText((s.record ? "★ NEW BEST  " : "Best  ") + s.best, cx, H * 0.56);
		c.fillStyle = "#cfe0ff"; c.font = "26px Roboto, sans-serif"; c.fillText("Tap or press Space to play again", cx, H * 0.69);
	}

	function active() { return !!(el && el.classList.contains("active")); }
	function frame(ts) {
		if (!active()) { raf = 0; return; }            // stop the loop when hidden
		var dt = last ? Math.min((ts - last) / 1000, 0.033) : 0;
		last = ts; update(dt); render();
		raf = requestAnimationFrame(frame);
	}
	function begin() {
		size(); reset(); last = 0;
		if (raf) { cancelAnimationFrame(raf); }
		raf = requestAnimationFrame(frame);
	}
	function primary() {
		unlockAudio();
		if (s.over) { reset(); return; }
		launch();
	}
	function onKey(e) {
		if (!active() || !s) { return; }
		if (e.key === "ArrowLeft") { s.left = true; }
		else if (e.key === "ArrowRight") { s.right = true; }
		else if (e.key === " " || e.key === "Spacebar" || e.key === "ArrowUp") { primary(); }
		else { return; }
		e.preventDefault();
	}
	function onKeyUp(e) {
		if (e.key === "ArrowLeft") { s.left = false; }
		else if (e.key === "ArrowRight") { s.right = false; }
	}
	function size() {
		W = window.innerWidth || 1024; H = window.innerHeight || 748;
		if (cv) { cv.width = W; cv.height = H; }
		if (s) { layout(); }
	}
	function setup() {
		el = document.getElementById("game2");
		cv = document.createElement("canvas");
		cv.setAttribute("aria-label", "Block Breaker paddle game");
		cv.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:100vh;display:block;z-index:15;touch-action:none;cursor:pointer;background:#141a38";
		el.appendChild(cv); c = cv.getContext("2d"); size();

		var back = document.createElement("button");
		back.type = "button"; back.textContent = "← BACK";
		back.style.cssText = "position:fixed;left:14px;bottom:14px;z-index:20;font:bold 20px Roboto,sans-serif;color:#fff;background:#2b3566;border:0;border-radius:8px;padding:10px 20px;cursor:pointer";
		back.addEventListener("click", function () { game.showScreen("main-menu"); });
		el.appendChild(back);

		cv.addEventListener("pointermove", function (e) {
			if (s) { s.px = clampX(e.clientX); }        // canvas fills viewport 1:1
		});
		cv.addEventListener("pointerdown", function (e) {
			if (!s) { return; }
			e.preventDefault(); s.px = clampX(e.clientX); primary();
		});
		document.addEventListener("keydown", onKey);
		document.addEventListener("keyup", onKeyUp);
		window.addEventListener("resize", size);
	}

	function run() {
		if (firstRun) { setup(); firstRun = false; }
		begin();
	}

	return { run: run };
}());
