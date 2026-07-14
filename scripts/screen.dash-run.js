carny.screens["dash-run"] = (function () {
	// Dash Run — an endless side-scrolling runner (screen id "dash-run"). JUMP the
	// cacti, DUCK the birds; one touch ends the run and distance is the score. All
	// geometry derives from the viewport each frame so a resize just rescales, and
	// the long clear lead-in banks a first point before the first obstacle (a
	// deterministic early score for the playtest, like Road Cross / Snake). Same
	// lazy-load + firstRun convention; over 5 KB so the build content-hashes it.
	var game = carny.game,
		HI = "gameland.hi.dash-run",
		TAU = 6.2831853,
		firstRun = true, el, cv, c,
		W = 1024, H = 748,
		groundY = 613, standH = 112, duckH = 62, runW = 70, runX = 164,
		raf = 0, last = 0, ac = null, s, shake = 0, flash = 0;

	// ---- audio (gesture-gated, same pattern as road-cross) ----
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
	function sfxJump() { beep(320, 0.16, "square", 0.05, 0, 620); }
	function sfxPoint() { beep(880, 0.06, "square", 0.05); beep(1320, 0.08, "sine", 0.04, 0.05); }
	function sfxHit() { beep(200, 0.38, "sawtooth", 0.16, 0, 60); }

	function loadHi() { try { return parseInt(localStorage.getItem(HI), 10) || 0; } catch (e) { return 0; } }
	function saveHi(v) { try { localStorage.setItem(HI, v); } catch (e) {} }

	// Viewport-derived geometry. Runner sits at a fixed screen column; everything
	// else scales off the standing height so a phone and a desktop play the same.
	function geo() {
		groundY = Math.round(H * 0.82);
		standH = Math.max(52, Math.round(H * 0.15));
		duckH = Math.round(standH * 0.55);
		runW = Math.round(standH * 0.62);
		runX = Math.round(W * 0.16);
	}
	function gravity() { return 3.2 * H; }
	function jumpV() { return -1.33 * H; }                    // apex ~0.28H

	// Speed (px/s) ramps with distance; scaled by W so it feels equal on any size.
	function curSpeed() { return Math.min(0.72 * W, 0.34 * W + s.meters * 0.02 * W); }

	// Clearable spacing: never below ~1.7 jump-lengths, tightening with distance.
	function nextGap() {
		var air = 2 * Math.abs(jumpV()) / gravity(),          // jump airtime -> length
			jd = air * s.speed,
			mult = 2.6 - Math.min(1, s.meters / 22) * 0.9;    // 2.6 -> 1.7 with distance
		return jd * mult + runW * (1 + Math.random());
	}
	function spawnObstacle() {
		if (s.meters > 1.4 && Math.random() < Math.min(0.42, 0.1 + s.meters * 0.012)) {
			s.obs.push({ air: true, x: W + 8 });              // bird — must duck
		} else {
			s.obs.push({ air: false, x: W + 8, h: [0.55, 0.8, 1.05][(Math.random() * 3) | 0], w: 0.4 + Math.random() * 0.3 });
		}
	}

	function reset() {
		s = {
			over: false, started: false,
			meters: 0, score: 0, best: loadHi(), savedBest: 0,
			speed: 0, feetY: groundY, vy: 0, onGround: true, duck: false,
			run: 0, obs: [], since: 0, gap: 0, milestone: 0, parX: 0
		};
		geo(); s.feetY = groundY; s.savedBest = s.best;
		s.speed = curSpeed(); s.gap = W * 1.1;                // long clear lead-in
	}

	function bump() {
		if (s.score > s.best) {
			s.best = s.score;
			if (s.best - s.savedBest >= 5) { saveHi(s.best); s.savedBest = s.best; }
		}
	}
	function hit() {
		if (s.over) { return; }
		s.over = true; shake = 14; flash = 1; sfxHit();
		saveHi(s.best); s.savedBest = s.best;
	}
	function jump() {
		if (s.onGround && !s.over && s.started) {
			s.vy = jumpV(); s.onGround = false; sfxJump();
		}
	}
	function start() { if (!s.started) { s.started = true; } }

	// ---- collision ----
	function obsW(o) { return o.air ? standH * 0.95 : standH * o.w; }
	function obsRect(o) {
		if (o.air) {
			var bottom = groundY - duckH - Math.max(8, standH * 0.14), h = standH * 0.42;
			return { x: o.x, y: bottom - h, w: standH * 0.95, h: h };
		}
		var gh = standH * o.h;
		return { x: o.x, y: groundY - gh, w: standH * o.w, h: gh };
	}
	function runnerRect() {
		var h = (s.onGround && s.duck) ? duckH : standH, pad = runW * 0.14;
		return { x: runX - runW / 2 + pad, y: s.feetY - h, w: runW - pad * 2, h: h };
	}
	function collide() {
		var r = runnerRect(), i, b;
		for (i = 0; i < s.obs.length; i++) {
			b = obsRect(s.obs[i]);
			if (r.x < b.x + b.w && r.x + r.w > b.x && r.y < b.y + b.h && r.y + r.h > b.y) { return true; }
		}
		return false;
	}

	function update(dt) {
		if (shake > 0) { shake = Math.max(0, shake - dt * 60); }
		if (flash > 0) { flash = Math.max(0, flash - dt * 3); }
		if (s.over || !s.started) { return; }

		s.speed = curSpeed();
		var dpx = s.speed * dt;
		s.meters += (s.speed / W) * dt;
		s.parX += dpx;

		var sc = Math.floor(s.meters * 30);
		if (sc !== s.score) {
			s.score = sc; bump();
			if (Math.floor(s.score / 100) > s.milestone) { s.milestone = Math.floor(s.score / 100); sfxPoint(); }
		}

		s.vy += gravity() * dt;
		if (s.duck && !s.onGround) { s.vy += gravity() * 0.8 * dt; }   // press-down fast-fall
		s.feetY += s.vy * dt;
		if (s.feetY >= groundY) {
			s.feetY = groundY; s.vy = 0; s.onGround = true;
		} else {
			s.onGround = false;
		}
		s.run += dpx / (standH * 0.5);

		s.since += dpx;
		if (s.since >= s.gap) { s.since = 0; spawnObstacle(); s.gap = nextGap(); }
		for (var i = s.obs.length - 1; i >= 0; i--) {
			s.obs[i].x -= dpx;
			if (s.obs[i].x + obsW(s.obs[i]) < -4) { s.obs.splice(i, 1); }
		}
		if (collide()) { hit(); }
	}

	// ---- rendering ----
	function rrect(x, y, w, h, r) {
		c.beginPath();
		if (c.roundRect) { c.roundRect(x, y, w, h, r); return; }
		c.moveTo(x + r, y);
		c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
		c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
	}
	function ell(x, y, rx, ry) {
		c.beginPath();
		if (c.ellipse) { c.ellipse(x, y, rx, ry, 0, 0, TAU); } else { c.arc(x, y, (rx + ry) / 2, 0, TAU); }
	}
	function sky() {
		var g = c.createLinearGradient(0, 0, 0, groundY);
		g.addColorStop(0, "#5db0e0"); g.addColorStop(1, "#bfe6f2");
		c.fillStyle = g; c.fillRect(0, 0, W, groundY);
	}
	function layer(frac, amp, yb, col) {
		c.fillStyle = col; c.beginPath(); c.moveTo(0, groundY);
		var ph = s.parX * frac * 0.01, x, y;
		for (x = 0; x <= W; x += 22) {
			y = yb + Math.sin(x * 0.006 + ph) * amp + Math.sin(x * 0.013 + ph * 1.7) * amp * 0.4;
			c.lineTo(x, y);
		}
		c.lineTo(W, groundY); c.closePath(); c.fill();
	}
	function ground() {
		c.fillStyle = "#3a352d"; c.fillRect(0, groundY, W, H - groundY);
		c.fillStyle = "#514a3d"; c.fillRect(0, groundY, W, Math.max(3, H * 0.008));
		c.fillStyle = "rgba(255,255,255,0.08)";
		var dw = Math.max(24, W * 0.045), gp = dw * 1.6, off = s.parX % (dw + gp), x;
		for (x = -off; x < W; x += dw + gp) { c.fillRect(x, groundY + (H - groundY) * 0.5, dw, Math.max(3, H * 0.008)); }
	}
	function obstacles() {
		var i, o, b, cx, cy, wf;
		for (i = 0; i < s.obs.length; i++) {
			o = s.obs[i]; b = obsRect(o);
			if (o.air) {
				cx = b.x + b.w / 2; cy = b.y + b.h / 2; wf = Math.sin(s.run * 3) * 0.5;
				c.fillStyle = "#2b2b33"; ell(cx, cy, b.w * 0.3, b.h * 0.34); c.fill();
				c.strokeStyle = "#2b2b33"; c.lineWidth = Math.max(3, b.h * 0.16); c.lineCap = "round";
				c.beginPath();
				c.moveTo(cx - b.w * 0.44, cy - b.h * 0.08 + wf * b.h * 0.5);
				c.lineTo(cx, cy - b.h * 0.05);
				c.lineTo(cx + b.w * 0.44, cy - b.h * 0.08 + wf * b.h * 0.5);
				c.stroke();
			} else {
				c.fillStyle = "#3e8e5a"; rrect(b.x, b.y, b.w, b.h, Math.min(b.w * 0.42, 12)); c.fill();
			}
		}
	}
	function runner() {
		var duck = s.onGround && s.duck, h = duck ? duckH : standH,
			x = runX, feet = s.feetY, top = feet - h, bw = runW, hr = bw * 0.42, hy,
			sh = Math.max(0.35, 1 - (groundY - feet) / (H * 0.28));   // shadow shrinks with altitude
		c.fillStyle = "rgba(0,0,0," + (0.2 * sh) + ")";
		ell(x, groundY + (H - groundY) * 0.14, bw * 0.5 * sh, (H - groundY) * 0.13 * sh); c.fill();
		c.fillStyle = "#ffcf3f";
		rrect(x - bw / 2, top, bw, h * 0.72, Math.min(bw * 0.4, 12)); c.fill();
		hy = top - (duck ? -hr * 0.15 : hr * 0.15);
		c.beginPath(); c.arc(x + (duck ? bw * 0.14 : 0), hy, hr, 0, TAU); c.fill();
		c.fillStyle = "#20303a";
		c.beginPath(); c.arc(x + (duck ? bw * 0.34 : bw * 0.42), hy - hr * 0.12, hr * 0.16, 0, TAU); c.fill();
		c.strokeStyle = "#e0a52a"; c.lineWidth = Math.max(4, bw * 0.16); c.lineCap = "round";
		var sw = Math.sin(s.run);
		c.beginPath();
		if (s.onGround) {
			c.moveTo(x - bw * 0.18, top + h * 0.7); c.lineTo(x - bw * 0.18 + sw * bw * 0.3, feet);
			c.moveTo(x + bw * 0.18, top + h * 0.7); c.lineTo(x + bw * 0.18 - sw * bw * 0.3, feet);
		} else {
			c.moveTo(x - bw * 0.1, top + h * 0.7); c.lineTo(x - bw * 0.32, feet - h * 0.12);
			c.moveTo(x + bw * 0.2, top + h * 0.7); c.lineTo(x + bw * 0.42, feet - h * 0.22);
		}
		c.stroke();
	}
	function pad5(n) { n = "" + n; while (n.length < 5) { n = "0" + n; } return n; }
	function hud() {
		var fs = Math.max(18, Math.min(30, W / 26));
		c.textBaseline = "top"; c.font = "bold " + fs + "px Roboto, sans-serif";
		c.fillStyle = "#fff"; c.textAlign = "left"; c.fillText(pad5(s.score), 16, 12);
		c.textAlign = "right"; c.fillStyle = "#cfe0ff"; c.fillText("BEST " + pad5(s.best), W - 16, 12);
	}
	function promptText() {
		c.textAlign = "center"; c.textBaseline = "middle";
		c.fillStyle = "#fff"; c.font = "700 " + Math.min(34, W / 20) + "px Roboto, sans-serif";
		c.fillText("Dash Run", W / 2, H * 0.4);
		c.fillStyle = "#20303a"; c.font = "500 " + Math.min(19, W / 32) + "px Roboto, sans-serif";
		c.fillText("▲/Space jump · ▼ duck · tap jump, hold low to duck", W / 2, H * 0.4 + 40);
	}
	function over() {
		var cx = W / 2, nb = s.score > 0 && s.score >= s.best;
		c.fillStyle = "rgba(12,14,20,0.78)"; c.fillRect(0, 0, W, H);
		c.textAlign = "center"; c.textBaseline = "middle";
		c.fillStyle = "#ff9f9f"; c.font = "bold 66px Roboto, sans-serif"; c.fillText("GAME OVER", cx, H * 0.34);
		c.fillStyle = "#fff"; c.font = "bold 42px Roboto, sans-serif"; c.fillText("Score  " + s.score, cx, H * 0.47);
		c.fillStyle = nb ? "#ffd23a" : "#cfe0ff"; c.font = "bold 28px Roboto, sans-serif";
		c.fillText((nb ? "★ NEW BEST  " : "Best  ") + s.best, cx, H * 0.56);
		c.fillStyle = "#dfe6f2"; c.font = "24px Roboto, sans-serif"; c.fillText("Tap / Space to run again", cx, H * 0.68);
	}
	function render() {
		sky();
		layer(0.5, H * 0.06, groundY * 0.7, "rgba(92,122,162,0.6)");
		ground();
		obstacles();
		runner();
		if (flash > 0) { c.fillStyle = "rgba(255,70,55," + (flash * 0.5) + ")"; c.fillRect(0, 0, W, H); }
		hud();
		if (!s.started && !s.over) { promptText(); }
		if (s.over) { over(); }
	}

	function active() { return !!(el && el.classList.contains("active")); }
	function frame(ts) {
		if (!active()) { raf = 0; return; }                   // stop the loop when hidden
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

	// ---- input ----
	function onKey(e) {
		if (!active() || !s) { return; }
		var k = e.key;
		if (k === " " || k === "Spacebar" || k === "ArrowUp" || k === "w" || k === "W" || k === "Enter") {
			if (!e.repeat) { unlockAudio(); if (s.over) { reset(); } else { start(); jump(); } }
			e.preventDefault(); return;
		}
		if (k === "ArrowDown" || k === "s" || k === "S") {
			if (!s.over && s.started) { s.duck = true; }
			e.preventDefault();
		}
	}
	function onKeyUp(e) {
		var k = e.key;
		if (s && (k === "ArrowDown" || k === "s" || k === "S")) { s.duck = false; }
	}
	var duckPid = null;
	function onDown(e) {
		e.preventDefault(); unlockAudio();
		if (!s) { return; }
		if (s.over) { reset(); return; }
		start();
		if (e.clientY > H * 0.62) { s.duck = true; duckPid = e.pointerId; }
		else { jump(); }
	}
	function onUp(e) {
		if (!s) { return; }
		e.preventDefault();
		if (e.pointerId === duckPid) { s.duck = false; duckPid = null; }
	}
	function onCancel(e) { if (e && e.pointerId === duckPid) { s.duck = false; duckPid = null; } }

	function size() {
		W = window.innerWidth || 1024; H = window.innerHeight || 748;
		if (cv) { cv.width = W; cv.height = H; }
		geo();
		if (s && s.onGround) { s.feetY = groundY; }
	}
	function setup() {
		el = document.getElementById("dash-run");
		cv = document.createElement("canvas");
		cv.setAttribute("aria-label", "Dash Run endless runner game");
		cv.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:100vh;display:block;z-index:15;touch-action:none;cursor:pointer;background:#7cbedd";
		el.appendChild(cv); c = cv.getContext("2d"); size();

		var back = document.createElement("button");
		back.type = "button"; back.textContent = "← BACK";
		back.style.cssText = "position:fixed;left:14px;bottom:14px;z-index:20;font:bold 20px Roboto,sans-serif;color:#fff;background:#2b4b6b;border:0;border-radius:8px;padding:10px 20px;cursor:pointer";
		back.addEventListener("click", function () { game.showScreen("main-menu"); });
		el.appendChild(back);

		cv.addEventListener("pointerdown", onDown);
		cv.addEventListener("pointerup", onUp);
		cv.addEventListener("pointercancel", onCancel);
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
