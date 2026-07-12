carny.screens["bear-hunt"] = (function () {
	// Bear Hunt — a carnival shooting gallery. Bears amble across the field on
	// wavy paths; aim (pointer / arrow keys) and fire (click / tap / space) to
	// bag them before the 45s round ends. Smaller and faster bears score more,
	// and consecutive hits build a combo multiplier. Best score is persisted.
	// This file is over 5 KB, so the perf build content-hashes it; the shell's
	// loader resolves the hashed name via asset-manifest.json (see game.js).
	var game = carny.game,
		HI = "gameland.hi.bear-hunt",
		ROUND = 45, TAU = 6.2831853,
		firstRun = true, el, cv, c,
		W = 1024, H = 748,
		raf = 0, last = 0, ac = null, s;

	// Create/resume the AudioContext — call this only from a real input handler
	// so Chrome's autoplay policy is satisfied (no "not allowed to start" warning).
	function unlockAudio() {
		if (!ac) {
			try { ac = new (window.AudioContext || window.webkitAudioContext)(); }
			catch (e) { ac = null; }
		}
		if (ac && ac.state === "suspended") { try { ac.resume(); } catch (e) {} }
	}
	// Play a tone. Never creates the context: SFX fired off the game loop (the
	// round-end jingle) stay silent until a gesture has unlocked audio, instead
	// of spawning an AudioContext outside a user gesture.
	function beep(f, d, type, v, when) {
		var a = ac;
		if (!a) { return; }
		try {
			var t = a.currentTime + (when || 0), o = a.createOscillator(), g = a.createGain();
			o.type = type; o.frequency.value = f;
			g.gain.setValueAtTime(v, t);
			g.gain.exponentialRampToValueAtTime(0.0001, t + d);
			o.connect(g); g.connect(a.destination);
			o.start(t); o.stop(t + d);
		} catch (e) { /* audio is best-effort */ }
	}
	function sfxShot() { beep(720, 0.07, "square", 0.1); }
	function sfxHit(gold) {
		beep(gold ? 880 : 200, 0.16, gold ? "square" : "sawtooth", 0.16);
		beep(gold ? 1320 : 110, 0.18, "sine", 0.12, 0.05);
	}
	function sfxMiss() { beep(130, 0.09, "triangle", 0.07); }
	function sfxEnd() {
		[523, 659, 784, 1047].forEach(function (f, i) { beep(f, 0.18, "triangle", 0.14, i * 0.12); });
	}

	function loadHi() {
		try { return parseInt(localStorage.getItem(HI), 10) || 0; } catch (e) { return 0; }
	}
	function mult() { return Math.min(1 + (s.combo / 4 | 0), 5); }

	function reset() {
		s = {
			over: false, record: false, score: 0, combo: 0, best: loadHi(), time: ROUND,
			bears: [], floats: [], spawn: 0.5, flash: 0, ax: W / 2, ay: H * 0.55
		};
	}

	function spawn() {
		var d = (ROUND - s.time) / ROUND,
			dir = Math.random() < 0.5 ? 1 : -1,
			r = Math.max(20, 50 - Math.random() * 24 - d * 8);
		s.bears.push({
			x: dir > 0 ? -r : W + r,
			by: 130 + Math.random() * Math.max(80, H - 340), y: 0, r: r,
			vx: (95 + Math.random() * 70 + d * 130) * dir,
			amp: 18 + Math.random() * 42, fr: 0.9 + Math.random() * 1.6,
			ph: Math.random() * TAU, t: 0, gold: Math.random() < 0.08, alive: true, pop: 0
		});
	}

	function update(dt) {
		for (var j = s.floats.length - 1; j >= 0; j--) {
			var f = s.floats[j];
			f.life -= dt; f.y -= 42 * dt;
			if (f.life <= 0) { s.floats.splice(j, 1); }
		}
		if (s.over) { return; }

		s.flash = Math.max(0, s.flash - dt);
		s.time -= dt;
		if (s.time <= 0) {
			s.time = 0; s.over = true;
			s.record = s.score > s.best;
			if (s.record) { s.best = s.score; try { localStorage.setItem(HI, s.score); } catch (e) {} }
			sfxEnd();
			return;
		}

		s.spawn -= dt;
		if (s.spawn <= 0) {
			spawn();
			s.spawn = Math.max(0.32, 1.05 - (ROUND - s.time) / ROUND * 0.65) * (0.7 + Math.random() * 0.6);
		}
		for (var i = s.bears.length - 1; i >= 0; i--) {
			var b = s.bears[i];
			if (!b.alive) { b.pop -= dt; if (b.pop <= 0) { s.bears.splice(i, 1); } continue; }
			b.t += dt; b.x += b.vx * dt;
			b.y = b.by + Math.sin(b.t * b.fr + b.ph) * b.amp;
			if (b.x - b.r > W + 50 || b.x + b.r < -50) { s.bears.splice(i, 1); }
		}
	}

	function fire(fx, fy) {
		if (s.over) { reset(); return; }
		s.flash = 0.08; sfxShot();
		var hit = null, best = 1e9;
		for (var i = 0; i < s.bears.length; i++) {
			var b = s.bears[i];
			if (!b.alive) { continue; }
			var dd = Math.hypot(b.x - fx, b.y - fy);
			if (dd < b.r * 1.2 && dd < best) { hit = b; best = dd; }
		}
		if (!hit) { s.combo = 0; sfxMiss(); return; }
		hit.alive = false; hit.pop = 0.32; s.combo++;
		var pts = Math.round(40 * (34 / hit.r)) * (hit.gold ? 5 : 1) * mult();
		s.score += pts; sfxHit(hit.gold);
		s.floats.push({ x: hit.x, y: hit.y, txt: "+" + pts, life: 0.8, gold: hit.gold });
	}

	// ---- drawing ----
	function dot(x, y, r) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
	function rrect(x, y, w, h, r) {
		c.beginPath();
		if (c.roundRect) { c.roundRect(x, y, w, h, r); return; }
		c.moveTo(x + r, y);
		c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
		c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
	}

	function bg() {
		var g = c.createLinearGradient(0, 0, 0, H);
		g.addColorStop(0, "#bfe3f2"); g.addColorStop(0.55, "#dcefd9"); g.addColorStop(1, "#a7cf86");
		c.fillStyle = g; c.fillRect(0, 0, W, H);
		c.fillStyle = "#9ecb88"; c.beginPath();
		c.ellipse(W * 0.28, H * 0.92, W * 0.42, H * 0.28, 0, 0, TAU); c.fill();
		c.fillStyle = "#8bbd76"; c.beginPath();
		c.ellipse(W * 0.78, H * 0.95, W * 0.5, H * 0.3, 0, 0, TAU); c.fill();
		c.fillStyle = "#79a95e"; c.fillRect(0, H * 0.88, W, H * 0.12);
	}

	function bear(b) {
		var r = b.r, fur = b.gold ? "#e6b13a" : "#6b4a2b", face = b.gold ? "#f6d98a" : "#8a6a44";
		c.save(); c.translate(b.x, b.y);
		if (!b.alive) { var k = Math.max(0, b.pop / 0.32); c.globalAlpha = k; c.scale(1 + (1 - k) * 0.9, 1 + (1 - k) * 0.9); }
		c.scale(b.vx < 0 ? -1 : 1, 1);
		c.fillStyle = fur; dot(-r * 0.55, -r * 0.68, r * 0.32); dot(r * 0.55, -r * 0.68, r * 0.32);
		c.fillStyle = face; dot(-r * 0.55, -r * 0.68, r * 0.15); dot(r * 0.55, -r * 0.68, r * 0.15);
		c.fillStyle = fur; c.beginPath(); c.ellipse(0, r * 0.6, r * 0.82, r * 0.68, 0, 0, TAU); c.fill(); dot(0, 0, r);
		c.fillStyle = face; c.beginPath(); c.ellipse(0, r * 0.32, r * 0.48, r * 0.38, 0, 0, TAU); c.fill();
		c.fillStyle = "#221812"; dot(0, r * 0.14, r * 0.13); dot(-r * 0.36, -r * 0.12, r * 0.11); dot(r * 0.36, -r * 0.12, r * 0.11);
		c.fillStyle = "#fff"; dot(-r * 0.32, -r * 0.16, r * 0.04); dot(r * 0.4, -r * 0.16, r * 0.04);
		c.restore();
	}

	function render() {
		bg();
		for (var i = 0; i < s.bears.length; i++) { bear(s.bears[i]); }
		c.textAlign = "center"; c.textBaseline = "middle"; c.font = "bold 30px Roboto, sans-serif";
		for (i = 0; i < s.floats.length; i++) {
			var f = s.floats[i];
			c.globalAlpha = Math.max(0, f.life / 0.8);
			c.fillStyle = f.gold ? "#e0a51e" : "#c0392b"; c.fillText(f.txt, f.x, f.y);
		}
		c.globalAlpha = 1;
		if (s.flash > 0) { c.fillStyle = "rgba(255,255,255," + (s.flash / 0.08 * 0.22) + ")"; c.fillRect(0, 0, W, H); }
		// crosshair
		c.strokeStyle = "rgba(25,25,25,0.85)"; c.lineWidth = 3; c.beginPath();
		c.arc(s.ax, s.ay, 22, 0, TAU);
		c.moveTo(s.ax - 34, s.ay); c.lineTo(s.ax - 12, s.ay); c.moveTo(s.ax + 12, s.ay); c.lineTo(s.ax + 34, s.ay);
		c.moveTo(s.ax, s.ay - 34); c.lineTo(s.ax, s.ay - 12); c.moveTo(s.ax, s.ay + 12); c.lineTo(s.ax, s.ay + 34);
		c.stroke(); c.fillStyle = "rgba(200,40,30,0.9)"; dot(s.ax, s.ay, 3);
		hud();
		if (s.over) { over(); }
	}

	function hud() {
		var fs = Math.max(20, Math.min(34, W / 22));
		c.textBaseline = "top"; c.fillStyle = "#2c2113"; c.font = "bold " + fs + "px Roboto, sans-serif";
		c.textAlign = "left"; c.fillText("SCORE " + s.score, 20, 18);
		c.textAlign = "right"; c.fillText("BEST " + s.best, W - 20, 18);
		if (s.combo >= 2) {
			c.textAlign = "left"; c.font = "bold " + Math.round(fs * 0.78) + "px Roboto, sans-serif";
			c.fillStyle = "#b5471f"; c.fillText("COMBO " + s.combo + (mult() > 1 ? "  " + mult() + "×" : ""), 20, 18 + fs + 6);
		}
		var bw = Math.min(360, W * 0.42), bx = (W - bw) / 2, by = 22, bh = 20, fr = Math.max(0, s.time / ROUND);
		c.fillStyle = "rgba(0,0,0,0.15)"; rrect(bx, by, bw, bh, 10); c.fill();
		c.fillStyle = fr < 0.25 ? "#c0392b" : "#3a7d3a"; rrect(bx, by, bw * fr, bh, 10); c.fill();
		c.fillStyle = "#fff"; c.textAlign = "center"; c.textBaseline = "middle"; c.font = "bold 16px Roboto, sans-serif";
		c.fillText(Math.ceil(s.time) + "s", W / 2, by + bh / 2 + 1);
	}

	function over() {
		var cx = W / 2, isBest = s.record;
		c.fillStyle = "rgba(20,15,8,0.72)"; c.fillRect(0, 0, W, H);
		c.textAlign = "center"; c.textBaseline = "middle";
		c.fillStyle = "#ffe9b0"; c.font = "bold 76px Roboto, sans-serif"; c.fillText("TIME!", cx, H * 0.33);
		c.fillStyle = "#fff"; c.font = "bold 46px Roboto, sans-serif"; c.fillText("Score  " + s.score, cx, H * 0.46);
		c.fillStyle = isBest ? "#ffd23a" : "#d8c9a6"; c.font = "bold 32px Roboto, sans-serif";
		c.fillText((isBest ? "★ NEW BEST  " : "Best  ") + s.best, cx, H * 0.55);
		c.fillStyle = "#cfe8ff"; c.font = "26px Roboto, sans-serif"; c.fillText("Tap or press Space to play again", cx, H * 0.68);
	}

	// ---- loop + input ----
	function active() { return !!(el && el.classList.contains("active")); }
	function frame(ts) {
		if (!active()) { raf = 0; return; }         // stop the loop when hidden
		var dt = last ? Math.min((ts - last) / 1000, 0.05) : 0;
		last = ts; update(dt); render();
		raf = requestAnimationFrame(frame);
	}
	function begin() {
		size(); reset(); last = 0;
		if (raf) { cancelAnimationFrame(raf); }      // never leave two loops running
		raf = requestAnimationFrame(frame);
	}
	function pt(e) {
		var r = cv.getBoundingClientRect();
		return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
	}
	function onKey(e) {
		if (!active() || !s) { return; }
		var step = 42;
		if (e.key === "ArrowLeft") { s.ax -= step; }
		else if (e.key === "ArrowRight") { s.ax += step; }
		else if (e.key === "ArrowUp") { s.ay -= step; }
		else if (e.key === "ArrowDown") { s.ay += step; }
		else if (e.key === " " || e.key === "Spacebar") { unlockAudio(); fire(s.ax, s.ay); e.preventDefault(); return; }
		else { return; }
		s.ax = Math.max(0, Math.min(W, s.ax)); s.ay = Math.max(0, Math.min(H, s.ay));
		e.preventDefault();
	}
	function size() {
		W = window.innerWidth || 1024; H = window.innerHeight || 748;
		if (cv) { cv.width = W; cv.height = H; }
	}
	function setup() {
		el = document.getElementById("bear-hunt");
		cv = document.createElement("canvas");
		cv.setAttribute("aria-label", "Bear Hunt shooting gallery game");
		cv.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:100vh;display:block;z-index:15;touch-action:none;cursor:crosshair;background:#bfe3f2";
		el.appendChild(cv); c = cv.getContext("2d"); size();

		var back = document.createElement("button");
		back.type = "button"; back.textContent = "← BACK";
		back.style.cssText = "position:fixed;left:14px;bottom:14px;z-index:20;font:bold 20px Roboto,sans-serif;color:#fff;background:#5a3a1c;border:0;border-radius:8px;padding:10px 20px;cursor:pointer";
		back.addEventListener("click", function () { game.showScreen("main-menu"); });
		el.appendChild(back);

		cv.addEventListener("pointermove", function (e) { if (s) { var p = pt(e); s.ax = p.x; s.ay = p.y; } });
		cv.addEventListener("pointerdown", function (e) {
			if (!s) { return; }
			e.preventDefault(); unlockAudio(); var p = pt(e); s.ax = p.x; s.ay = p.y; fire(p.x, p.y);
		});
		document.addEventListener("keydown", onKey);
		window.addEventListener("resize", size);
	}

	function run() {
		if (firstRun) { setup(); firstRun = false; }
		begin();
	}

	return { run: run };
}());
