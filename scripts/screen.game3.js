carny.screens["game3"] = (function () {
	// Cave Flyer — a hold-to-thrust jetpack game (screen id "game3"). Hold to
	// fire the thruster and rise against gravity; release to fall. Thread the pod
	// through the gaps in the cave walls — a single touch of a wall, the ceiling
	// or the floor ends the run. Walls speed up and gaps narrow as the score
	// climbs. Same lazy-load + firstRun convention as the other screens; over
	// 5 KB so the perf build content-hashes it.
	var game = carny.game,
		HI = "gameland.hi.game3",
		TAU = 6.2831853,
		firstRun = true, el, cv, c,
		W = 1024, H = 748,
		raf = 0, last = 0, ac = null, s, shake = 0;

	// Parallax cave dust — x/y stored as fractions so it fills any viewport.
	var STARS = (function () {
		var a = [], i;
		for (i = 0; i < 44; i++) {
			a.push({ x: Math.random(), y: Math.random(), z: 0.15 + Math.random() * 0.55, r: 1 + Math.random() * 2 });
		}
		return a;
	}());

	// ---- audio (gesture-gated, same pattern as bear-hunt/game2) ----
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
	function sfxThrust() { beep(110, 0.05, "sawtooth", 0.05); }
	function sfxPass() { beep(660, 0.06, "square", 0.06); beep(990, 0.05, "sine", 0.04, 0.03); }
	function sfxCrash() { beep(180, 0.26, "sawtooth", 0.16); beep(70, 0.42, "triangle", 0.14, 0.05); }

	function loadHi() { try { return parseInt(localStorage.getItem(HI), 10) || 0; } catch (e) { return 0; } }

	// Board metrics scale with the viewport so the game is responsive.
	function metrics() {
		s.r = Math.max(10, Math.min(18, W * 0.018));
		s.ww = Math.max(46, Math.min(92, W * 0.09));
		s.px = W * 0.28;
	}

	// Difficulty curve, all driven by the current score.
	function gapH() { return Math.max(H * 0.27, H * 0.44 - s.score * H * 0.006); }
	function speed() { return Math.min(W * 0.9, W * 0.42 + s.score * W * 0.011); }
	function spacing() { return Math.max(W * 0.44, W * 0.62 - s.score * W * 0.004); }

	function spawn() {
		var gh = gapH(), m = H * 0.08 + gh / 2, yc;
		// The first wall's gap is centred on the pod for a gentle on-ramp.
		yc = s.n === 0 ? H / 2 : m + Math.random() * (H - 2 * m);
		s.n++;
		s.walls.push({ x: W + s.ww, gt: yc - gh / 2, gb: yc + gh / 2, scored: false });
	}

	function reset() {
		s = {
			over: false, started: false, record: false, score: 0, best: loadHi(),
			py: H / 2, vy: 0, thrust: false, walls: [], dist: 0, n: 0
		};
		metrics();
		s.py = H / 2;
	}

	function crash() {
		if (s.over) { return; }
		s.over = true; shake = 16; s.thrust = false; sfxCrash();
		s.record = s.score > s.best;
		if (s.record) { s.best = s.score; try { localStorage.setItem(HI, s.score); } catch (e) {} }
	}

	function circRect(cx, cy, r, rx, ry, rw, rh) {
		var nx = Math.max(rx, Math.min(cx, rx + rw)),
			ny = Math.max(ry, Math.min(cy, ry + rh)),
			dx = cx - nx, dy = cy - ny;
		return dx * dx + dy * dy <= r * r;
	}
	function collide() {
		if (s.py - s.r < 0 || s.py + s.r > H) { crash(); return; }
		for (var i = 0; i < s.walls.length; i++) {
			var w = s.walls[i];
			if (w.x + s.ww < s.px - s.r || w.x > s.px + s.r) { continue; }  // outside the pod's x-band
			if (circRect(s.px, s.py, s.r, w.x, 0, s.ww, w.gt) ||
					circRect(s.px, s.py, s.r, w.x, w.gb, s.ww, H - w.gb)) { crash(); return; }
		}
	}

	function update(dt) {
		if (shake > 0) { shake = Math.max(0, shake - dt * 30); }
		if (s.over || !s.started) { return; }
		var G = H * 2.2, A = H * 4.6;
		s.vy += (s.thrust ? G - A : G) * dt;                 // holding => net upward accel
		s.vy = Math.max(-H * 0.7, Math.min(H * 0.85, s.vy));
		s.py += s.vy * dt;
		var sp = speed();
		s.dist += sp * dt;
		for (var i = 0; i < s.walls.length; i++) {
			var w = s.walls[i];
			w.x -= sp * dt;
			if (!w.scored && w.x + s.ww < s.px) { w.scored = true; s.score++; sfxPass(); }
		}
		while (s.walls.length && s.walls[0].x + s.ww < -10) { s.walls.shift(); }
		if (!s.walls.length || (W - s.walls[s.walls.length - 1].x) >= spacing()) { spawn(); }
		collide();
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
		g.addColorStop(0, "#0d1b2a"); g.addColorStop(0.55, "#132b3a"); g.addColorStop(1, "#0a141d");
		c.fillStyle = g; c.fillRect(0, 0, W, H);
		c.fillStyle = "rgba(120,190,225,0.14)";
		var d = s ? s.dist : 0;
		for (var i = 0; i < STARS.length; i++) {
			var st = STARS[i], x = ((st.x * W - d * st.z) % W + W) % W;
			c.fillRect(x, st.y * H, st.r, st.r);
		}
	}
	function drawPod() {
		var x = s.px, y = s.py, r = s.r;
		if (s.thrust && s.started && !s.over) {                // exhaust flame
			c.fillStyle = "rgba(255,170,55,0.9)";
			c.beginPath();
			c.moveTo(x - r * 0.7, y + r * 0.35);
			c.lineTo(x - r * (1.7 + Math.random()), y);
			c.lineTo(x - r * 0.7, y - r * 0.35);
			c.closePath(); c.fill();
		}
		c.fillStyle = "#ffd23a";
		c.beginPath();
		if (c.ellipse) { c.ellipse(x, y, r * 1.2, r, 0, 0, TAU); } else { c.arc(x, y, r, 0, TAU); }
		c.fill();
		c.fillStyle = "#0d1b2a";
		c.beginPath(); c.arc(x + r * 0.35, y - r * 0.12, r * 0.34, 0, TAU); c.fill();  // cockpit
	}
	function render() {
		bg();
		for (var i = 0; i < s.walls.length; i++) {
			var w = s.walls[i];
			c.fillStyle = "#2f6d4f";
			rrect(w.x, -10, s.ww, w.gt + 10, 9); c.fill();
			rrect(w.x, w.gb, s.ww, H - w.gb + 10, 9); c.fill();
			c.fillStyle = "rgba(130,235,180,0.4)";
			c.fillRect(w.x, w.gt - 6, s.ww, 6);
			c.fillRect(w.x, w.gb, s.ww, 6);
		}
		drawPod();
		hud();
		if (!s.started && !s.over) { prompt(); }
		if (s.over) { over(); }
	}
	function hud() {
		var fs = Math.max(20, Math.min(34, W / 22));
		c.textBaseline = "top"; c.font = "bold " + fs + "px Roboto, sans-serif";
		c.fillStyle = "#eaf6ff"; c.textAlign = "left"; c.fillText("SCORE " + s.score, 20, 14);
		c.textAlign = "right"; c.fillStyle = "#9fd6c4"; c.fillText("BEST " + s.best, W - 20, 14);
	}
	function prompt() {
		c.textAlign = "center"; c.textBaseline = "middle";
		c.fillStyle = "#dff6ec"; c.font = "600 " + Math.min(34, W / 20) + "px Roboto, sans-serif";
		c.fillText("Hold to fly", s.px, H * 0.3);
		c.fillStyle = "#9fd6c4"; c.font = "500 " + Math.min(22, W / 30) + "px Roboto, sans-serif";
		c.fillText("Thread the gaps — one hit ends the run", W / 2, H * 0.3 + 46);
	}
	function over() {
		var cx = W / 2;
		c.fillStyle = "rgba(6,14,22,0.78)"; c.fillRect(0, 0, W, H);
		c.textAlign = "center"; c.textBaseline = "middle";
		c.fillStyle = "#ff9f9f"; c.font = "bold 72px Roboto, sans-serif"; c.fillText("CRASHED", cx, H * 0.34);
		c.fillStyle = "#fff"; c.font = "bold 44px Roboto, sans-serif"; c.fillText("Score  " + s.score, cx, H * 0.47);
		c.fillStyle = s.record ? "#ffd23a" : "#bfe6d8"; c.font = "bold 30px Roboto, sans-serif";
		c.fillText((s.record ? "★ NEW BEST  " : "Best  ") + s.best, cx, H * 0.56);
		c.fillStyle = "#dff6ec"; c.font = "26px Roboto, sans-serif"; c.fillText("Tap or press Space to fly again", cx, H * 0.69);
	}

	function active() { return !!(el && el.classList.contains("active")); }
	function frame(ts) {
		if (!active()) { raf = 0; return; }                  // stop the loop when hidden
		var dt = last ? Math.min((ts - last) / 1000, 0.033) : 0;
		last = ts; update(dt);
		c.save();
		if (shake > 0) { c.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); }
		render();
		c.restore();
		raf = requestAnimationFrame(frame);
	}
	function begin() {
		size(); reset(); last = 0; shake = 0;
		if (raf) { cancelAnimationFrame(raf); }
		raf = requestAnimationFrame(frame);
	}

	function thrustOn() {
		unlockAudio();
		if (s.over) { reset(); return; }                     // first tap after a crash just restarts
		if (!s.started) { s.started = true; }
		s.thrust = true; sfxThrust();
	}
	function thrustOff() { if (s) { s.thrust = false; } }

	function isFlyKey(k) { return k === " " || k === "Spacebar" || k === "ArrowUp" || k === "w" || k === "W"; }
	function onKey(e) {
		if (!active() || !s) { return; }
		if (isFlyKey(e.key)) { if (!e.repeat) { thrustOn(); } e.preventDefault(); }
	}
	function onKeyUp(e) { if (isFlyKey(e.key)) { thrustOff(); } }

	function size() {
		W = window.innerWidth || 1024; H = window.innerHeight || 748;
		if (cv) { cv.width = W; cv.height = H; }
		if (s) { metrics(); }
	}
	function setup() {
		el = document.getElementById("game3");
		cv = document.createElement("canvas");
		cv.setAttribute("aria-label", "Cave Flyer jetpack game");
		cv.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:100vh;display:block;z-index:15;touch-action:none;cursor:pointer;background:#0d1b2a";
		el.appendChild(cv); c = cv.getContext("2d"); size();

		var back = document.createElement("button");
		back.type = "button"; back.textContent = "← BACK";
		back.style.cssText = "position:fixed;left:14px;bottom:14px;z-index:20;font:bold 20px Roboto,sans-serif;color:#fff;background:#204a3a;border:0;border-radius:8px;padding:10px 20px;cursor:pointer";
		back.addEventListener("click", function () { game.showScreen("main-menu"); });
		el.appendChild(back);

		cv.addEventListener("pointerdown", function (e) { e.preventDefault(); thrustOn(); });
		cv.addEventListener("pointerup", thrustOff);
		cv.addEventListener("pointercancel", thrustOff);
		cv.addEventListener("pointerleave", thrustOff);
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
