carny.screens["snake"] = (function () {
	// Snake — the grid classic with a modern coat (screen id "snake"). A
	// responsive square-cell board fills the viewport; the snake slides between
	// cells with interpolated motion and speeds up as it grows. First fruit sits
	// dead ahead so the opening bite needs no aiming. Arrows/WASD + swipe steer;
	// best length persists to localStorage["gameland.hi.snake"].
	var game = carny.game,
		HI = "gameland.hi.snake",
		firstRun = true, el, cv, c,
		W = 1024, H = 748,
		raf = 0, last = 0, ac = null, s,
		PAD = 12, START = 3,
		BASE = 0.135, MIN = 0.062, RAMP = 0.0035,   // step seconds: start, floor, per-fruit speed-up
		cell = 20, cols = 20, rows = 20, gw = 0, gh = 0, ox = 0, oy = 0;

	// ---- audio (gesture-gated) ----
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
	function sfxEat(len) { var b = 300 + Math.min(len, 40) * 12; beep(b, 0.08, "square", 0.06); beep(b * 1.5, 0.07, "sine", 0.04, 0.03); }
	function sfxTurn() { beep(190, 0.03, "sine", 0.02); }
	function sfxCrash() { beep(150, 0.3, "sawtooth", 0.16); beep(70, 0.4, "triangle", 0.12, 0.05); }
	function sfxBest() { beep(660, 0.1, "triangle", 0.07); beep(990, 0.12, "sine", 0.05, 0.08); }

	function loadHi() { try { return parseInt(localStorage.getItem(HI), 10) || 0; } catch (e) { return 0; } }

	function layout() {   // square-cell board sized to the viewport, centred
		cell = Math.max(14, Math.round(Math.min(W, H) / 26));
		cols = Math.max(6, Math.floor((W - 2 * PAD) / cell));
		rows = Math.max(6, Math.floor((H - 2 * PAD) / cell));
		gw = cols * cell; gh = rows * cell;
		ox = Math.round((W - gw) / 2); oy = Math.round((H - gh) / 2);
	}

	function eq(a, b) { return a.x === b.x && a.y === b.y; }
	function copyBody() { return s.body.map(function (p) { return { x: p.x, y: p.y }; }); }

	function placeFood() {
		// rejection-sample an empty cell
		for (var tries = 0; tries < 500; tries++) {
			var f = { x: (Math.random() * cols) | 0, y: (Math.random() * rows) | 0 }, hit = false;
			for (var i = 0; i < s.body.length; i++) { if (eq(s.body[i], f)) { hit = true; break; } }
			if (!hit) { s.food = f; return; }
		}
		s.food = { x: 0, y: 0 };
	}

	function reset() {
		var hx = cols >> 1, hy = rows >> 1, body = [], i;
		for (i = 0; i < START; i++) { body.push({ x: hx - i, y: hy }); }   // head first, tail left
		s = {
			over: false, started: false, record: false, score: 0,
			best: loadHi(), dir: { x: 1, y: 0 }, turns: [],
			body: body, prev: null, food: null,
			acc: 0, t: 0, interval: BASE, flash: 0, parts: [], anim: 0
		};
		s.prev = copyBody();
		// first fruit dead ahead — opening bite is a gimme
		s.food = { x: Math.min(cols - 1, hx + 3), y: hy };
	}

	function stepTime() { return Math.max(MIN, BASE - (s.body.length - START) * RAMP); }

	// Queue up to two turns (each validated vs the last queued dir): refuses a
	// 180° AND the two-quick-taps reversal a single buffer would collapse into.
	function turn(dx, dy) {
		if (!s || s.over) { return; }
		if (!s.started) { s.started = true; sfxTurn(); }   // any steer also starts
		var ref = s.turns.length ? s.turns[s.turns.length - 1] : s.dir;
		if ((dx === -ref.x && dy === -ref.y) || (dx === ref.x && dy === ref.y)) { return; }
		if (s.turns.length < 2) { s.turns.push({ x: dx, y: dy }); }
	}

	function burst(cx, cy) {
		for (var i = 0; i < 12; i++) {
			var a = Math.random() * Math.PI * 2, sp = cell * (2 + Math.random() * 4);
			s.parts.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, a: 1 });
		}
	}

	function gameOver() {
		s.over = true; sfxCrash();
		s.record = s.score > s.best;
		if (s.record) { s.best = s.score; try { localStorage.setItem(HI, s.score); } catch (e) {} sfxBest(); }
	}

	function step() {
		if (s.turns.length) { s.dir = s.turns.shift(); }
		var head = s.body[0], nh = { x: head.x + s.dir.x, y: head.y + s.dir.y }, i;
		if (nh.x < 0 || nh.y < 0 || nh.x >= cols || nh.y >= rows) { gameOver(); return; }
		// bite: the tail vacates this step, so skip it unless we grow
		var eating = eq(nh, s.food), lim = eating ? s.body.length : s.body.length - 1;
		for (i = 0; i < lim; i++) { if (eq(s.body[i], nh)) { gameOver(); return; } }
		s.prev = copyBody();
		s.body.unshift(nh);
		if (eating) {
			s.score++; s.flash = 0.5;
			var fc = cellCenter(s.food.x, s.food.y);
			burst(fc.x, fc.y); sfxEat(s.body.length); placeFood();
		} else {
			s.body.pop();
		}
		s.interval = stepTime();
	}

	function update(dt) {
		s.anim += dt;
		if (s.flash > 0) { s.flash = Math.max(0, s.flash - dt); }
		for (var i = s.parts.length - 1; i >= 0; i--) {
			var p = s.parts[i];
			p.vy += cell * 14 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.a -= dt * 1.6;
			if (p.a <= 0) { s.parts.splice(i, 1); }
		}
		if (!s.started || s.over) { return; }   // idle: prev==body; dead: hold final frame
		s.acc += dt;
		var guard = 0;
		while (s.acc >= s.interval && !s.over && guard++ < 8) { s.acc -= s.interval; step(); }
		s.t = s.over ? 1 : Math.min(1, s.acc / s.interval);
	}

	// ---- render ----
	function cellCenter(gx, gy) { return { x: ox + gx * cell + cell / 2, y: oy + gy * cell + cell / 2 }; }
	function lerp(a, b, t) { return a + (b - a) * t; }
	function segTL(i) {   // interpolated top-left pixel of body segment i
		var from = s.prev[i] || s.body[i], to = s.body[i];
		return { x: ox + lerp(from.x, to.x, s.t) * cell, y: oy + lerp(from.y, to.y, s.t) * cell };
	}

	function bg() {
		var g = c.createLinearGradient(0, 0, 0, H), x, y;
		g.addColorStop(0, "#0c1220"); g.addColorStop(1, "#070b14");
		c.fillStyle = g; c.fillRect(0, 0, W, H);
		c.fillStyle = "#0f1830"; c.fillRect(ox, oy, gw, gh);
		c.strokeStyle = "rgba(120,150,220,0.09)"; c.lineWidth = 1; c.beginPath();
		for (x = 1; x < cols; x++) { c.moveTo(ox + x * cell + 0.5, oy); c.lineTo(ox + x * cell + 0.5, oy + gh); }
		for (y = 1; y < rows; y++) { c.moveTo(ox, oy + y * cell + 0.5); c.lineTo(ox + gw, oy + y * cell + 0.5); }
		c.stroke();
		c.strokeStyle = "rgba(120,160,240,0.45)"; c.lineWidth = 2; c.strokeRect(ox + 1, oy + 1, gw - 2, gh - 2);
	}

	function roundRect(x, y, w, h, r) {
		c.beginPath();
		c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
		c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
	}

	function drawFood() {
		var fc = cellCenter(s.food.x, s.food.y), pulse = 1 + Math.sin(s.anim * 6) * 0.12, r = cell * 0.34 * pulse;
		c.save();
		c.shadowColor = "rgba(255,90,80,0.9)"; c.shadowBlur = cell * 0.7; c.fillStyle = "#ff5a50";
		c.beginPath(); c.arc(fc.x, fc.y, r, 0, Math.PI * 2); c.fill();
		c.restore();
		c.fillStyle = "rgba(255,255,255,0.6)";
		c.beginPath(); c.arc(fc.x - r * 0.3, fc.y - r * 0.3, r * 0.28, 0, Math.PI * 2); c.fill();
	}

	function drawSnake() {
		var n = s.body.length, inset = cell * 0.12, sz = cell - inset * 2, r = sz * 0.4, i, p, f;
		for (i = n - 1; i >= 0; i--) {   // tail first so the head draws on top
			p = segTL(i); f = 1 - i / (n + 2);
			c.fillStyle = "hsl(" + (140 - f * 22) + ",70%," + (34 + f * 26) + "%)";
			roundRect(p.x + inset, p.y + inset, sz, sz, r); c.fill();
		}
		// eyes: forward + sideways of travel
		var hp = segTL(0), hx = hp.x + cell / 2, hy = hp.y + cell / 2,
			dx = s.dir.x, dy = s.dir.y, px = -dy, py = dx, e = cell * 0.15, off = cell * 0.2;
		c.fillStyle = "#04120a";
		c.beginPath(); c.arc(hx + dx * off + px * off, hy + dy * off + py * off, e, 0, Math.PI * 2); c.fill();
		c.beginPath(); c.arc(hx + dx * off - px * off, hy + dy * off - py * off, e, 0, Math.PI * 2); c.fill();
	}

	function drawParts() {
		for (var i = 0; i < s.parts.length; i++) {
			var p = s.parts[i];
			c.globalAlpha = Math.max(0, p.a); c.fillStyle = "#ff7a6a"; c.fillRect(p.x - 2, p.y - 2, 4, 4);
		}
		c.globalAlpha = 1;
	}

	function hud() {
		var fs = Math.max(20, Math.min(34, W / 22));
		c.textBaseline = "top"; c.font = "bold " + fs + "px Roboto, sans-serif"; c.textAlign = "left";
		c.fillStyle = "#d8f5e0"; c.fillText("LENGTH " + s.score, 20, 14);
		c.textAlign = "right"; c.fillStyle = "#9ad6b4"; c.fillText("BEST " + s.best, W - 20, 14);
	}

	function prompt() {
		c.textAlign = "center"; c.textBaseline = "middle";
		c.fillStyle = "#eafff2"; c.font = "600 " + Math.min(34, W / 19) + "px Roboto, sans-serif";
		c.fillText("Swipe or arrows to start", W / 2, oy + gh * 0.42);
		c.fillStyle = "#8fd6ad"; c.font = "500 " + Math.min(22, W / 30) + "px Roboto, sans-serif";
		c.fillText("Eat the fruit — don't bite yourself", W / 2, oy + gh * 0.42 + 44);
	}

	function over() {
		c.fillStyle = "rgba(6,10,20,0.82)"; c.fillRect(0, 0, W, H);
		var cx = W / 2;
		c.textAlign = "center"; c.textBaseline = "middle";
		c.fillStyle = "#ff9fb0"; c.font = "bold " + Math.min(72, W / 6) + "px Roboto, sans-serif"; c.fillText("GAME OVER", cx, H * 0.34);
		c.fillStyle = "#fff"; c.font = "bold " + Math.min(44, W / 9) + "px Roboto, sans-serif"; c.fillText("Length  " + s.score, cx, H * 0.47);
		c.fillStyle = s.record ? "#ffe066" : "#bfeccd"; c.font = "bold " + Math.min(30, W / 13) + "px Roboto, sans-serif";
		c.fillText((s.record ? "★ NEW BEST  " : "Best  ") + s.best, cx, H * 0.56);
		c.fillStyle = "#eafff2"; c.font = Math.min(26, W / 16) + "px Roboto, sans-serif"; c.fillText("Tap or press Space to play again", cx, H * 0.69);
	}

	function render() {
		bg(); drawFood(); drawSnake(); drawParts(); hud();
		if (!s.started && !s.over) { prompt(); }
		if (s.over) { over(); }
	}

	function active() { return !!(el && el.classList.contains("active")); }
	function frame(ts) {
		if (!active()) { raf = 0; return; }                   // stop the loop when hidden
		var dt = last ? Math.min((ts - last) / 1000, 0.033) : 0;
		last = ts; update(dt); render();
		raf = requestAnimationFrame(frame);
	}
	function begin() {
		size(); reset(); last = 0;
		if (raf) { cancelAnimationFrame(raf); }
		raf = requestAnimationFrame(frame);
	}

	function restartIfOver() { if (s && s.over) { reset(); return true; } return false; }

	// ---- input ----
	var KEYS = {
		ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1],
		ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0]
	};
	function onKey(e) {
		if (!active() || !s) { return; }
		var k = e.key, v = KEYS[k.length === 1 ? k.toLowerCase() : k];
		if (v) { unlockAudio(); if (!restartIfOver()) { turn(v[0], v[1]); } e.preventDefault(); return; }
		if (k === " " || k === "Spacebar" || k === "Enter") {
			unlockAudio();
			if (!restartIfOver() && !s.started) { turn(1, 0); }
			e.preventDefault();
		}
	}

	var tsx = 0, tsy = 0, swiping = false;
	function onDown(e) {
		if (!s) { return; }
		unlockAudio();
		if (restartIfOver()) { return; }
		swiping = true; tsx = e.clientX; tsy = e.clientY;
	}
	function onUp(e) {
		if (!s || !swiping) { return; }
		swiping = false;
		var dx = e.clientX - tsx, dy = e.clientY - tsy, ax = Math.abs(dx), ay = Math.abs(dy);
		if (ax < 12 && ay < 12) { if (!s.started) { turn(1, 0); } return; }   // a plain tap just starts it
		if (ax > ay) { turn(dx > 0 ? 1 : -1, 0); } else { turn(0, dy > 0 ? 1 : -1); }
	}

	function size() {
		W = window.innerWidth || 1024; H = window.innerHeight || 748;
		if (cv) { cv.width = W; cv.height = H; }
		var pc = cols, pr = rows;
		layout();
		if (s && !s.over && (cols !== pc || rows !== pr)) { reset(); }   // grid changed -> rebuild
	}
	function setup() {
		el = document.getElementById("snake");
		cv = document.createElement("canvas");
		cv.setAttribute("aria-label", "Snake game");
		cv.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:100vh;display:block;z-index:15;touch-action:none;cursor:pointer;background:#070b14";
		el.appendChild(cv); c = cv.getContext("2d"); size();

		var back = document.createElement("button");
		back.type = "button"; back.textContent = "← BACK";
		back.style.cssText = "position:fixed;left:14px;bottom:14px;z-index:20;font:bold 20px Roboto,sans-serif;color:#fff;background:#16351f;border:0;border-radius:8px;padding:10px 20px;cursor:pointer";
		back.addEventListener("click", function () { game.showScreen("main-menu"); });
		el.appendChild(back);

		cv.addEventListener("pointerdown", function (e) { e.preventDefault(); onDown(e); });
		cv.addEventListener("pointerup", function (e) { e.preventDefault(); onUp(e); });
		document.addEventListener("keydown", onKey);
		window.addEventListener("resize", size);
	}

	function run() {
		if (firstRun) { setup(); firstRun = false; }
		begin();
	}

	return { run: run };
}());
