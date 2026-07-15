carny.screens["astro-drift"] = (function () {
	// Astro Drift — free-flight rock blasting (screen id "astro-drift"). Thrust with
	// momentum in a screen-wrapping void; shots split rocks. Keys/buttons/tap fly and
	// fire. Best score -> localStorage["gameland.hi.astro-drift"].
	var game = carny.game,
		HI = "gameland.hi.astro-drift",
		firstRun = true, el, cv, c,
		W = 1024, H = 748, U = 300,
		raf = 0, last = 0, ac = null, s, stars = [],
		keys = { rl: false, rr: false, th: false, fire: false },
		ROT = 3.6, ACC = 0.95, DRAG = 0.5, MAXV = 0.62,
		FIRE_CD = 0.22, BLIFE = 0.72, MAXB = 6,
		RK = [0.042, 0.072, 0.118], VAL = [100, 50, 20], INVULN = 2, EXTRA = 4000;

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
	function sfxFire() { beep(720, 0.08, "square", 0.04); beep(360, 0.09, "sine", 0.03, 0.01); }
	function sfxThrust() { beep(110, 0.08, "sawtooth", 0.025); }
	function sfxBoom(k) { var b = 260 - k * 60; beep(b, 0.22 + k * 0.05, "sawtooth", 0.09); beep(b * 0.6, 0.3, "triangle", 0.07, 0.02); }
	function sfxHit() { beep(200, 0.35, "sawtooth", 0.16); beep(90, 0.45, "triangle", 0.12, 0.06); }
	function sfxCheer() { beep(660, 0.09, "square", 0.05); beep(880, 0.09, "square", 0.05, 0.08); beep(1170, 0.12, "sine", 0.05, 0.16); }

	function loadHi() { try { return parseInt(localStorage.getItem(HI), 10) || 0; } catch (e) { return 0; } }
	function shipR() { return U * 0.03; }
	function rockR(r) { return RK[r.k] * U; }
	function rnd(a, b) { return a + Math.random() * (b - a); }

	function makeRock(x, y, k, speed) {
		var a = Math.random() * Math.PI * 2, n = 9 + (Math.random() * 4 | 0), verts = [], i;
		for (i = 0; i < n; i++) { verts.push(rnd(0.78, 1.14)); }
		return { x: x, y: y, k: k, verts: verts, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, rot: Math.random() * 6.28, spin: rnd(-1.1, 1.1) };
	}

	function spawnWave() {
		var n = Math.min(9, 3 + s.wave), spd = U * (0.06 + s.wave * 0.011), i, t, x, y;
		for (i = 0; i < n; i++) {
			// spawn clear of the centred ship; capped retries so a near-square
			// viewport (whole screen inside the exclusion disc) can never hang
			x = Math.random() * W; y = Math.random() * H;
			for (t = 0; t < 30 && Math.hypot(x - W / 2, y - H / 2) < U * 0.5; t++) {
				x = Math.random() * W; y = Math.random() * H;
			}
			s.rocks.push(makeRock(x, y, 2, spd * rnd(0.7, 1.25)));
		}
		s.waveT = 0;
		if (s.wave > 1) { sfxCheer(); }
	}

	function reset() {
		s = {
			ship: { x: W / 2, y: H / 2, vx: 0, vy: 0, ang: -Math.PI / 2 },
			rocks: [], bul: [], parts: [],
			score: 0, best: loadHi(), lives: 3, wave: 1,
			started: false, over: false, record: false,
			cd: 0, invuln: 0, nextExtra: EXTRA, waveT: 0, anim: 0
		};
		keys.rl = keys.rr = keys.th = keys.fire = false;
		spawnWave();
	}

	function start() { if (s && !s.started) { s.started = true; s.invuln = INVULN; } }

	function shoot() {
		if (!s.started || s.over || s.cd > 0 || s.bul.length >= MAXB) { return; }
		var a = s.ship.ang, r = shipR(), bs = U * 0.95;
		s.bul.push({ x: s.ship.x + Math.cos(a) * r * 1.2, y: s.ship.y + Math.sin(a) * r * 1.2, vx: Math.cos(a) * bs + s.ship.vx * 0.4, vy: Math.sin(a) * bs + s.ship.vy * 0.4, life: BLIFE });
		s.cd = FIRE_CD; sfxFire();
	}

	function burst(x, y, col, n, sp) {
		for (var i = 0; i < n; i++) {
			var a = Math.random() * Math.PI * 2, v = sp * rnd(0.3, 1);
			s.parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, a: 1, col: col });
		}
	}

	function addScore(v) {
		s.score += v;
		if (s.score >= s.nextExtra) { s.lives++; s.nextExtra += EXTRA; sfxCheer(); }
	}

	function splitRock(idx) {
		var r = s.rocks[idx], k = r.k;
		addScore(VAL[k]);
		burst(r.x, r.y, "#cfd6e6", 10 + k * 4, rockR(r) * 8);
		sfxBoom(k);
		s.rocks.splice(idx, 1);
		if (k > 0) {
			var spd = Math.hypot(r.vx, r.vy) * 1.35 + U * 0.03, j;
			for (j = 0; j < 2; j++) { s.rocks.push(makeRock(r.x, r.y, k - 1, spd)); }
		}
	}

	function loseLife() {
		s.lives--; s.invuln = INVULN;
		burst(s.ship.x, s.ship.y, "#7fe9ff", 22, shipR() * 12);
		s.ship.x = W / 2; s.ship.y = H / 2; s.ship.vx = s.ship.vy = 0; s.ship.ang = -Math.PI / 2;
		sfxHit();
		if (s.lives <= 0) {
			s.over = true;
			s.record = s.score > s.best;
			if (s.record) { s.best = s.score; try { localStorage.setItem(HI, s.score); } catch (e) {} sfxCheer(); }
		}
	}

	function wrap(o) { o.x = ((o.x % W) + W) % W; o.y = ((o.y % H) + H) % H; }

	function update(dt) {
		s.anim += dt;
		if (s.cd > 0) { s.cd = Math.max(0, s.cd - dt); }
		if (s.invuln > 0) { s.invuln = Math.max(0, s.invuln - dt); }

		var sh = s.ship, i, j;
		if (s.started && !s.over) {
			if (keys.rl) { sh.ang -= ROT * dt; }
			if (keys.rr) { sh.ang += ROT * dt; }
			if (keys.th) { sh.vx += Math.cos(sh.ang) * ACC * U * dt; sh.vy += Math.sin(sh.ang) * ACC * U * dt; }
			if (keys.fire) { shoot(); }
			sh.vx -= sh.vx * DRAG * dt; sh.vy -= sh.vy * DRAG * dt;
			var sp = Math.hypot(sh.vx, sh.vy), mx = MAXV * U;
			if (sp > mx) { sh.vx = sh.vx / sp * mx; sh.vy = sh.vy / sp * mx; }
			sh.x += sh.vx * dt; sh.y += sh.vy * dt; wrap(sh);
		}

		for (i = 0; i < s.rocks.length; i++) {
			var r = s.rocks[i];
			r.x += r.vx * dt; r.y += r.vy * dt; r.rot += r.spin * dt; wrap(r);
		}

		for (i = s.bul.length - 1; i >= 0; i--) {
			var b = s.bul[i];
			b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; wrap(b);
			if (b.life <= 0) { s.bul.splice(i, 1); continue; }
			for (j = 0; j < s.rocks.length; j++) {
				if (Math.hypot(b.x - s.rocks[j].x, b.y - s.rocks[j].y) < rockR(s.rocks[j]) + U * 0.01) {
					s.bul.splice(i, 1); splitRock(j); break;
				}
			}
		}

		if (s.started && !s.over && s.invuln <= 0) {
			for (i = 0; i < s.rocks.length; i++) {
				if (Math.hypot(sh.x - s.rocks[i].x, sh.y - s.rocks[i].y) < rockR(s.rocks[i]) + shipR() * 0.85) {
					splitRock(i); loseLife(); break;
				}
			}
		}

		for (i = s.parts.length - 1; i >= 0; i--) {
			var p = s.parts[i];
			p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; p.a -= dt * 1.5;
			if (p.a <= 0) { s.parts.splice(i, 1); }
		}

		if (!s.over && s.rocks.length === 0) {
			if (s.waveT <= 0) { s.waveT = 1.4; }
			s.waveT -= dt;
			if (s.waveT <= 0) { s.wave++; spawnWave(); }
		}
	}

	function wrapDraw(x, y, r, draw) {
		var xs = [0], ys = [0], a, b;
		if (x < r) { xs.push(W); } else if (x > W - r) { xs.push(-W); }
		if (y < r) { ys.push(H); } else if (y > H - r) { ys.push(-H); }
		for (a = 0; a < xs.length; a++) {
			for (b = 0; b < ys.length; b++) { c.save(); c.translate(x + xs[a], y + ys[b]); draw(); c.restore(); }
		}
	}

	function bg() {
		c.fillStyle = "#05070f"; c.fillRect(0, 0, W, H);
		c.fillStyle = "#dfe7ff";
		for (var i = 0; i < stars.length; i++) {
			var st = stars[i];
			c.globalAlpha = st.a;
			c.fillRect(st.nx * W, st.ny * H, st.r, st.r);
		}
		c.globalAlpha = 1;
	}

	function drawRock(r) {
		var rr = rockR(r), n = r.verts.length;
		wrapDraw(r.x, r.y, rr, function () {
			var i, ang, rad;
			c.rotate(r.rot);
			c.beginPath();
			for (i = 0; i < n; i++) {
				ang = i / n * Math.PI * 2; rad = rr * r.verts[i];
				if (i) { c.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad); } else { c.moveTo(Math.cos(ang) * rad, Math.sin(ang) * rad); }
			}
			c.closePath();
			c.fillStyle = "rgba(120,134,168,0.16)"; c.fill();
			c.lineWidth = Math.max(1.5, U * 0.006); c.strokeStyle = "#aeb8d6"; c.stroke();
		});
	}

	function shipPath(r) {
		c.beginPath();
		c.moveTo(r * 1.3, 0); c.lineTo(-r * 0.9, r * 0.85); c.lineTo(-r * 0.4, 0); c.lineTo(-r * 0.9, -r * 0.85); c.closePath();
	}

	function drawShip() {
		var sh = s.ship, r = shipR();
		if (s.invuln > 0 && (s.anim * 12 | 0) % 2 === 0) { return; }
		wrapDraw(sh.x, sh.y, r * 1.4, function () {
			c.rotate(sh.ang);
			if (keys.th && s.started && !s.over && (s.anim * 30 | 0) % 2 === 0) {
				c.beginPath();
				c.moveTo(-r * 0.4, r * 0.42); c.lineTo(-r * (1.1 + Math.random() * 0.5), 0); c.lineTo(-r * 0.4, -r * 0.42);
				c.fillStyle = "#ff9a3c"; c.fill();
			}
			shipPath(r);
			c.fillStyle = "rgba(20,40,60,0.6)"; c.fill();
			c.lineWidth = Math.max(1.6, U * 0.007); c.strokeStyle = "#8ff0ff"; c.stroke();
		});
	}

	function drawBullets() {
		c.fillStyle = "#eaf6ff";
		var rad = Math.max(2, U * 0.011);
		for (var i = 0; i < s.bul.length; i++) {
			var b = s.bul[i];
			c.beginPath(); c.arc(b.x, b.y, rad, 0, 6.29); c.fill();
		}
	}

	function drawParts() {
		for (var i = 0; i < s.parts.length; i++) {
			var p = s.parts[i];
			c.globalAlpha = Math.max(0, p.a); c.fillStyle = p.col; c.fillRect(p.x - 2, p.y - 2, 4, 4);
		}
		c.globalAlpha = 1;
	}

	function hud() {
		var fs = Math.max(18, Math.min(30, W / 26));
		c.textBaseline = "top"; c.font = "bold " + fs + "px Roboto, sans-serif";
		c.textAlign = "left"; c.fillStyle = "#dfe9ff"; c.fillText("SCORE " + s.score, 16, 64);
		c.fillStyle = "#8ff0ff"; c.fillText("SHIPS " + s.lives, 16, 68 + fs);
		c.textAlign = "right"; c.fillStyle = "#9fb4e0"; c.fillText("BEST " + s.best + "   W" + s.wave, W - 16, 16);
	}

	function prompt() {
		c.textAlign = "center"; c.textBaseline = "middle";
		c.fillStyle = "#eaf3ff"; c.font = "600 " + Math.min(32, W / 20) + "px Roboto, sans-serif";
		c.fillText("Rotate ◄ ►   Thrust ▲   Fire ●", W / 2, H * 0.42);
		c.fillStyle = "#94b4e6"; c.font = "500 " + Math.min(22, W / 30) + "px Roboto, sans-serif";
		c.fillText("Blast the rocks", W / 2, H * 0.42 + 42);
	}

	function over() {
		c.fillStyle = "rgba(4,7,16,0.82)"; c.fillRect(0, 0, W, H);
		var cx = W / 2;
		c.textAlign = "center"; c.textBaseline = "middle";
		c.fillStyle = "#9fd8ff"; c.font = "bold " + Math.min(72, W / 6) + "px Roboto, sans-serif"; c.fillText("GAME OVER", cx, H * 0.34);
		c.fillStyle = "#fff"; c.font = "bold " + Math.min(44, W / 9) + "px Roboto, sans-serif"; c.fillText("Score  " + s.score, cx, H * 0.47);
		c.fillStyle = s.record ? "#ffe066" : "#bcd8f2"; c.font = "bold " + Math.min(30, W / 13) + "px Roboto, sans-serif";
		c.fillText((s.record ? "★ NEW BEST  " : "Best  ") + s.best, cx, H * 0.56);
		c.fillStyle = "#eaf3ff"; c.font = Math.min(26, W / 16) + "px Roboto, sans-serif"; c.fillText("Tap or press Space to play again", cx, H * 0.69);
	}

	function render() {
		bg();
		for (var i = 0; i < s.rocks.length; i++) { drawRock(s.rocks[i]); }
		drawBullets(); drawParts();
		if (!s.over) { drawShip(); }
		hud();
		if (!s.started && !s.over) { prompt(); }
		if (s.over) { over(); }
	}

	function active() { return !!(el && el.classList.contains("active")); }
	function frame(ts) {
		if (!active()) { raf = 0; return; }
		var dt = last ? Math.min((ts - last) / 1000, 0.033) : 0;
		last = ts; update(dt); render();
		raf = requestAnimationFrame(frame);
	}
	function begin() {
		size(); reset(); last = 0;
		if (raf) { cancelAnimationFrame(raf); }
		raf = requestAnimationFrame(frame);
	}

	var KMAP = { ArrowLeft: "rl", a: "rl", ArrowRight: "rr", d: "rr", ArrowUp: "th", w: "th", " ": "fire", Spacebar: "fire" };
	function onKeyDown(e) {
		if (!active() || !s) { return; }
		var k = e.key, w = KMAP[k.length === 1 ? k.toLowerCase() : k];
		if (!w && k !== "Enter") { return; }
		unlockAudio(); e.preventDefault();
		if (s.over) { if (w === "fire" || k === "Enter") { reset(); } return; }
		start();
		if (w) { if (w === "th" && !keys.th) { sfxThrust(); } keys[w] = true; }
	}
	function onKeyUp(e) {
		var k = e.key, w = KMAP[k.length === 1 ? k.toLowerCase() : k];
		if (w) { keys[w] = false; }
	}

	function hold(btn, w) {
		btn.addEventListener("pointerdown", function (e) {
			e.preventDefault(); unlockAudio();
			if (s && s.over) { reset(); return; }
			start();
			if (w === "th" && !keys.th) { sfxThrust(); }
			keys[w] = true;
		});
		function rel(e) { if (e) { e.preventDefault(); } keys[w] = false; }
		btn.addEventListener("pointerup", rel);
		btn.addEventListener("pointerleave", rel);
		btn.addEventListener("pointercancel", rel);
	}

	function padBtn(txt, style) {
		var b = document.createElement("button");
		b.type = "button"; b.textContent = txt;
		b.style.cssText = "position:fixed;z-index:20;width:74px;height:74px;border-radius:50%;border:2px solid rgba(140,220,255,0.5);background:rgba(20,40,70,0.4);color:#cfeaff;font:bold 30px Roboto,sans-serif;touch-action:none;cursor:pointer;user-select:none;" + style;
		el.appendChild(b);
		return b;
	}

	function size() {
		W = window.innerWidth || 1024; H = window.innerHeight || 748; U = Math.min(W, H);
		if (cv) { cv.width = W; cv.height = H; }
	}

	function setup() {
		el = document.getElementById("astro-drift");
		cv = document.createElement("canvas");
		cv.setAttribute("aria-label", "Astro Drift game");
		cv.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:100vh;display:block;z-index:15;touch-action:none;cursor:pointer;background:#04060e";
		el.appendChild(cv); c = cv.getContext("2d"); size();

		for (var i = 0; i < 80; i++) {
			stars.push({ nx: Math.random(), ny: Math.random(), r: Math.random() < 0.2 ? 2 : 1, a: rnd(0.3, 0.9) });
		}

		var back = document.createElement("button");
		back.type = "button"; back.textContent = "← BACK";
		back.style.cssText = "position:fixed;left:14px;top:14px;z-index:20;font:bold 20px Roboto,sans-serif;color:#fff;background:#14263f;border:0;border-radius:8px;padding:10px 20px;cursor:pointer";
		back.addEventListener("click", function () { game.showScreen("main-menu"); });
		el.appendChild(back);

		hold(padBtn("◄", "left:14px;bottom:16px"), "rl");
		hold(padBtn("►", "left:100px;bottom:16px"), "rr");
		hold(padBtn("●", "right:100px;bottom:16px"), "fire");
		hold(padBtn("▲", "right:14px;bottom:16px"), "th");

		cv.addEventListener("pointerdown", function (e) {
			e.preventDefault(); unlockAudio();
			if (s && s.over) { reset(); return; }
			start(); shoot();
		});
		document.addEventListener("keydown", onKeyDown);
		document.addEventListener("keyup", onKeyUp);
		window.addEventListener("resize", size);
	}

	function run() {
		if (firstRun) { setup(); firstRun = false; }
		begin();
	}

	return { run: run };
}());
