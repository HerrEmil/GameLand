carny.screens["sky-hopper"] = (function () {
	// Sky Hopper — an endless vertical climber (screen id "sky-hopper"). The hopper
	// auto-bounces off one-way platforms under gravity; you only STEER left/right
	// (arrows / A·D or drag). Height climbed is the score, and a centred starter
	// ladder banks points hands-off from the opening bounce — the deterministic early
	// score the playtest hangs on. Higher up, platforms narrow, space out and turn to
	// moving / crumbling / spring types as the sky darkens. Viewport-derived geometry;
	// same lazy-load + firstRun convention (over 5 KB so the perf build hashes it).
	var game = carny.game,
		HI = "gameland.hi.sky-hopper",
		TAU = 6.2831853,
		firstRun = true, el, cv, c,
		W = 1024, H = 748,
		raf = 0, last = 0, ac = null, s, shake = 0, flash = 0;

	// ---- audio (gesture-gated) ----
	function unlockAudio() {
		if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; } }
		if (ac && ac.state === "suspended") { try { ac.resume(); } catch (e) {} }
	}
	function beep(f, d, type, v, when, f2) {
		var a = ac; if (!a) { return; }
		try {
			var t = a.currentTime + (when || 0), o = a.createOscillator(), g = a.createGain();
			o.type = type; o.frequency.setValueAtTime(f, t);
			if (f2) { o.frequency.exponentialRampToValueAtTime(f2, t + d); }
			g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
			o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + d);
		} catch (e) {}
	}
	function sfxHop() { beep(520, 0.1, "square", 0.045, 0, 780); }
	function sfxSpring() { beep(300, 0.22, "square", 0.06, 0, 1000); }
	function sfxBreak() { beep(190, 0.16, "sawtooth", 0.06, 0, 70); }
	function sfxPoint() { beep(880, 0.05, "square", 0.045); beep(1320, 0.07, "sine", 0.035, 0.05); }
	function sfxHit() { beep(220, 0.4, "sawtooth", 0.16, 0, 55); }

	function loadHi() { try { return parseInt(localStorage.getItem(HI), 10) || 0; } catch (e) { return 0; } }
	function saveHi(v) { try { localStorage.setItem(HI, v); } catch (e) {} }

	// ---- physics + sizing (all viewport-relative) ----
	function grav() { return 2.3 * H; }
	function hopV() { return -1.15 * H; }                       // apex ~0.29H
	function springV() { return -1.72 * H; }                    // apex ~0.64H
	function maxVx() { return 0.72 * W; }
	function camLine() { return H * 0.45; }
	function hopR() { return Math.max(15, H * 0.03); }
	function platH() { return Math.max(9, H * 0.02); }
	function platW() { return Math.max(56, W * (0.24 - Math.min(0.09, s.climb / (H * 60)))); }
	function gap() { return H * (0.16 + Math.min(0.075, s.climb / (H * 30))); }  // widens w/ altitude

	function addPlat(y, force) {
		var w = platW(), t = "s", vx = 0, sp = 0, cl = s.climb, r = Math.random();
		if (!force) {
			if (cl > H * 3 && r < Math.min(0.28, 0.08 + cl / (H * 45))) {
				t = "m"; vx = (Math.random() < 0.5 ? -1 : 1) * (0.11 + Math.random() * 0.13) * W;
			} else if (cl > H * 6 && r < Math.min(0.42, 0.18 + cl / (H * 34))) {
				t = "b";
			} else if (Math.random() < Math.max(0.03, 0.13 - cl / (H * 55))) {
				sp = 1;
			}
		}
		s.plats.push({ x: w / 2 + Math.random() * (W - w), y: y, w: w, t: t, vx: vx, sp: sp, dead: 0 });
		s.top = y;
	}

	function gen() {                                            // extend above, cull below
		while (s.top > -platH()) { addPlat(s.top - gap()); }
		for (var i = s.plats.length - 1; i >= 0; i--) {
			if (s.plats[i].y > H + hopR() * 2) { s.plats.splice(i, 1); }
		}
	}

	function reset() {
		s = { over: false, started: false, climb: 0, score: 0, best: loadHi(), savedBest: 0,
			x: W / 2, y: 0, vx: 0, vy: 0, dir: 0, ptr: null, plats: [], top: 0, milestone: 0, squash: 0 };
		s.savedBest = s.best;
		// Start low, launch with a SPRING kick so the first bounce clears camLine (score
		// ticks at once); the centred ladder then climbs itself hands-off (playtest).
		var y0 = H * 0.86, r = hopR(), i;
		s.plats.push({ x: W / 2, y: y0, w: platW(), t: "s", vx: 0, sp: 0, dead: 0 });
		s.x = W / 2; s.y = y0 - r; s.vy = springV(); s.top = y0;
		for (i = 0; i < 12; i++) {
			addPlat(y0 - gap() * (i + 1), true);
			s.plats[s.plats.length - 1].x = W / 2 + (Math.random() - 0.5) * platW();
		}
	}

	function persist() {
		if (s.best > s.savedBest && (s.savedBest === 0 || s.best - s.savedBest >= 5)) {
			saveHi(s.best); s.savedBest = s.best;
		}
	}
	function bump() {
		if (s.score > s.best) { s.best = s.score; persist(); }
	}
	function die() {
		if (s.over) { return; }
		s.over = true; shake = 14; flash = 1; sfxHit();
		saveHi(s.best); s.savedBest = s.best;
	}
	function bounce(p) {
		s.y = p.y - hopR(); s.vy = p.sp ? springV() : hopV(); s.squash = 1;
		if (p.sp) { sfxSpring(); }
		else if (p.t === "b") { p.dead = 1; p.vy = 260; sfxBreak(); }
		else { sfxHop(); }
	}
	function start() { if (!s.started) { s.started = true; } }

	// ---- input ----
	function onKey(e) {
		if (!active() || !s) { return; }
		var k = e.key;
		if (k === "ArrowLeft" || k === "a" || k === "A") { s.dir = -1; unlockAudio(); start(); e.preventDefault(); return; }
		if (k === "ArrowRight" || k === "d" || k === "D") { s.dir = 1; unlockAudio(); start(); e.preventDefault(); return; }
		if (k === " " || k === "Spacebar" || k === "Enter" || k === "ArrowUp" || k === "w" || k === "W") {
			if (!e.repeat) { unlockAudio(); if (s.over) { reset(); } else { start(); } }
			e.preventDefault();
		}
	}
	function onKeyUp(e) {
		var k = e.key;
		if (!s) { return; }
		if ((k === "ArrowLeft" || k === "a" || k === "A") && s.dir < 0) { s.dir = 0; }
		if ((k === "ArrowRight" || k === "d" || k === "D") && s.dir > 0) { s.dir = 0; }
	}
	function onDown(e) {
		e.preventDefault(); unlockAudio();
		if (!s) { return; }
		if (s.over) { reset(); return; }
		start(); s.ptr = e.clientX;
	}
	function onMove(e) { if (s && s.ptr !== null) { s.ptr = e.clientX; } }
	function onUp() { if (s) { s.ptr = null; } }

	function update(dt) {
		if (shake > 0) { shake = Math.max(0, shake - dt * 60); }
		if (flash > 0) { flash = Math.max(0, flash - dt * 3); }
		if (s.squash > 0) { s.squash = Math.max(0, s.squash - dt * 6); }
		if (s.over || !s.started) { return; }

		// horizontal: keys push; a held pointer eases toward touch x; screen wraps
		var want = s.dir !== 0 ? s.dir * maxVx()
			: s.ptr !== null ? Math.max(-maxVx(), Math.min(maxVx(), (s.ptr - s.x) * 6)) : 0;
		s.vx += (want - s.vx) * Math.min(1, dt * 14);
		s.x += s.vx * dt;
		if (s.x < 0) { s.x += W; } else if (s.x >= W) { s.x -= W; }

		// vertical: gravity, then a swept crossing test lands one-way platforms
		var feet0 = s.y + hopR();
		s.vy += grav() * dt;
		s.y += s.vy * dt;
		var feet1 = s.y + hopR();
		if (s.vy > 0) {
			for (var i = 0; i < s.plats.length; i++) {
				var p = s.plats[i];
				if (p.dead || feet0 > p.y || feet1 < p.y) { continue; }
				var half = p.w / 2 + hopR() * 0.35, dx = Math.abs(s.x - p.x);
				if (Math.min(dx, W - dx) <= half) { bounce(p); break; }
			}
		}

		for (var j = 0; j < s.plats.length; j++) {             // move platforms; crumblers fall
			var q = s.plats[j];
			if (q.dead) { q.y += q.vy * dt; }
			else if (q.t === "m") {
				q.x += q.vx * dt;
				if (q.x < q.w / 2) { q.x = q.w / 2; q.vx = -q.vx; }
				else if (q.x > W - q.w / 2) { q.x = W - q.w / 2; q.vx = -q.vx; }
			}
		}
		if (s.y < camLine()) {                                  // follow the peak: scroll the world down
			var d = camLine() - s.y; s.y = camLine(); s.climb += d; s.top += d;
			for (var m = 0; m < s.plats.length; m++) { s.plats[m].y += d; }
		}
		gen();

		var sc = Math.floor(s.climb / H * 100);
		if (sc !== s.score) {
			s.score = sc; bump();
			if (Math.floor(s.score / 100) > s.milestone) { s.milestone = Math.floor(s.score / 100); sfxPoint(); }
		}
		if (s.y - hopR() > H) { die(); }
	}

	// ---- rendering ----
	function rrect(x, y, w, h, r) {
		c.beginPath();
		if (c.roundRect) { c.roundRect(x, y, w, h, r); return; }
		c.moveTo(x + r, y);
		c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
		c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
	}
	function mix(a, b, t) {
		return "rgb(" + ((a[0] + (b[0] - a[0]) * t) | 0) + "," + ((a[1] + (b[1] - a[1]) * t) | 0) + "," + ((a[2] + (b[2] - a[2]) * t) | 0) + ")";
	}
	function sky(t) {
		var g = c.createLinearGradient(0, 0, 0, H);
		g.addColorStop(0, mix([88, 176, 224], [8, 10, 30], t));
		g.addColorStop(1, mix([191, 230, 242], [30, 34, 74], t));
		c.fillStyle = g; c.fillRect(0, 0, W, H);
	}
	function platform(p) {
		var ph = platH(), x = p.x - p.w / 2, col, top;
		if (p.t === "m") { col = "#3f8fd6"; top = "#8fc4f0"; }
		else if (p.t === "b") { col = "#b98a4e"; top = "#e0bd85"; }
		else { col = "#3e9e5a"; top = "#7fd39a"; }
		if (p.dead) { c.globalAlpha = Math.max(0, 1 - (p.y - camLine()) / (H * 0.4)); }
		c.fillStyle = col; rrect(x, p.y, p.w, ph, Math.min(ph, 8)); c.fill();
		c.fillStyle = top; rrect(x + 3, p.y + 2, p.w - 6, Math.max(2, ph * 0.32), 3); c.fill();
		if (p.sp) {
			c.strokeStyle = "#d8d8e0"; c.lineWidth = Math.max(2, ph * 0.28); c.lineCap = "round";
			var sx = p.x, sy = p.y, sh = ph * 1.5;
			c.beginPath(); c.moveTo(sx - 8, sy); c.lineTo(sx - 3, sy - sh);
			c.lineTo(sx + 3, sy); c.lineTo(sx + 8, sy - sh); c.stroke();
		}
		c.globalAlpha = 1;
	}
	function hopper() {
		var r = hopR(), sq = s.squash, sx = 1 + sq * 0.35, sy = 1 - sq * 0.35,
			lean = Math.max(-0.4, Math.min(0.4, s.vx / maxVx() * 0.4));
		c.save(); c.translate(s.x, s.y); c.rotate(lean);
		if (s.vy < 0 && s.started && !s.over) {                 // thruster flame
			var fl = Math.min(2.2, -s.vy / H * 1.6) * r;
			c.fillStyle = "rgba(255,170,40,0.9)";
			c.beginPath(); c.moveTo(-r * 0.4, r * 0.5); c.lineTo(0, r * 0.5 + fl); c.lineTo(r * 0.4, r * 0.5); c.closePath(); c.fill();
		}
		c.scale(sx, sy);
		c.fillStyle = "#ffcf3f";
		c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
		c.fillStyle = "#20303a";
		c.beginPath(); c.arc(-r * 0.32, -r * 0.15, r * 0.16, 0, TAU); c.arc(r * 0.32, -r * 0.15, r * 0.16, 0, TAU); c.fill();
		c.restore();
	}
	function hud() {
		var fs = Math.max(18, Math.min(30, W / 26));
		c.textBaseline = "top"; c.font = "bold " + fs + "px Roboto, sans-serif";
		c.textAlign = "left"; c.fillStyle = "#fff"; c.fillText(s.score + " m", 16, 12);
		c.textAlign = "right"; c.fillStyle = "#dfe8ff"; c.fillText("BEST " + s.best, W - 16, 12);
	}
	function prompt() {
		c.textAlign = "center"; c.textBaseline = "middle";
		c.fillStyle = "#20303a"; c.font = "700 " + Math.min(38, W / 18) + "px Roboto, sans-serif";
		c.fillText("Sky Hopper", W / 2, H * 0.3);
		c.fillStyle = "#33475a"; c.font = "500 " + Math.min(19, W / 32) + "px Roboto, sans-serif";
		c.fillText("←/→ or drag to steer · it bounces for you", W / 2, H * 0.3 + 40);
		c.fillText("Tap / press to start", W / 2, H * 0.3 + 70);
	}
	function over() {
		var cx = W / 2, nb = s.score > 0 && s.score >= s.best;
		c.fillStyle = "rgba(10,12,22,0.78)"; c.fillRect(0, 0, W, H);
		c.textAlign = "center"; c.textBaseline = "middle";
		c.fillStyle = "#ff9f9f"; c.font = "bold 62px Roboto, sans-serif"; c.fillText("GAME OVER", cx, H * 0.34);
		c.fillStyle = "#fff"; c.font = "bold 42px Roboto, sans-serif"; c.fillText("Height  " + s.score, cx, H * 0.47);
		c.fillStyle = nb ? "#ffd23a" : "#cfe0ff"; c.font = "bold 28px Roboto, sans-serif";
		c.fillText((nb ? "★ NEW BEST  " : "Best  ") + s.best, cx, H * 0.56);
		c.fillStyle = "#dfe6f2"; c.font = "24px Roboto, sans-serif"; c.fillText("Tap / Space to climb again", cx, H * 0.68);
	}
	function render() {
		var t = Math.min(1, s.climb / (H * 26));
		sky(t);
		for (var i = 0; i < s.plats.length; i++) { platform(s.plats[i]); }
		hopper();
		if (flash > 0) { c.fillStyle = "rgba(255,70,55," + (flash * 0.5) + ")"; c.fillRect(0, 0, W, H); }
		hud();
		if (!s.started && !s.over) { prompt(); }
		if (s.over) { over(); }
	}

	function active() { return !!(el && el.classList.contains("active")); }
	function frame(ts) {
		if (!active()) { raf = 0; return; }
		var dt = last ? Math.min((ts - last) / 1000, 0.033) : 0;
		last = ts; update(dt);
		c.save();
		if (shake > 0) { var m = shake / 14 * 6; c.translate((Math.random() * 2 - 1) * m, (Math.random() * 2 - 1) * m); }
		render();
		c.restore();
		raf = requestAnimationFrame(frame);
	}
	function begin() {
		size(); reset(); last = 0; shake = 0; flash = 0;
		if (raf) { cancelAnimationFrame(raf); }
		raf = requestAnimationFrame(frame);
	}

	function size() {
		W = window.innerWidth || 1024; H = window.innerHeight || 748;
		if (cv) { cv.width = W; cv.height = H; }
	}
	function setup() {
		el = document.getElementById("sky-hopper");
		cv = document.createElement("canvas");
		cv.setAttribute("aria-label", "Sky Hopper vertical climber game");
		cv.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:100vh;display:block;z-index:15;touch-action:none;cursor:pointer;background:#7cbedd";
		el.appendChild(cv); c = cv.getContext("2d");
		size();

		var back = document.createElement("button");
		back.type = "button"; back.textContent = "← BACK";
		back.style.cssText = "position:fixed;left:14px;bottom:14px;z-index:20;font:bold 20px Roboto,sans-serif;color:#fff;background:#2b4b6b;border:0;border-radius:8px;padding:10px 20px;cursor:pointer";
		back.addEventListener("click", function () { game.showScreen("main-menu"); });
		el.appendChild(back);

		cv.addEventListener("pointerdown", onDown);
		cv.addEventListener("pointermove", onMove);
		cv.addEventListener("pointerup", onUp);
		cv.addEventListener("pointercancel", onUp);
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
