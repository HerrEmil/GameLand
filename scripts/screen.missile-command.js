carny.screens["missile-command"] = (function () {
	// Missile Command — point defence. TAP (or aim with arrows/WASD + Space) to lob an interceptor
	// whose blast destroys warheads it touches; kills + chain blasts score, waves speed up and split
	// mid-air from wave 4. Positions are NORMALISED (0..1) and scaled by the viewport each frame.
	var game = carny.game,
		HI = "gameland.hi.missile-command",
		TAU = 6.2831853,
		GY = 0.84,
		CITYX = [0.09, 0.21, 0.33, 0.67, 0.79, 0.91],
		AMMO = 20,
		DUR = 0.82,
		firstRun = true, el, cv, c,
		W = 1024, H = 748,
		raf = 0, last = 0, ac = null, s, shake = 0, anim = 0;

	function ua() {
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
	function sfxLaunch() { beep(300, 0.16, "square", 0.03, 0, 620); }
	function sfxKill() { beep(940, 0.09, "sine", 0.05, 0, 1500); }
	function sfxBoom() { beep(120, 0.3, "sawtooth", 0.05, 0, 40); }
	function sfxCity() { beep(90, 0.5, "sawtooth", 0.16, 0, 32); beep(180, 0.4, "triangle", 0.08, 0); }
	function sfxWave() { beep(523, 0.11, "square", 0.05, 0); beep(784, 0.16, "square", 0.05, 0.11); }
	function sfxDud() { beep(160, 0.06, "square", 0.03, 0); }

	function loadHi() { try { return parseInt(localStorage.getItem(HI), 10) || 0; } catch (e) { return 0; } }
	function saveHi(v) { try { localStorage.setItem(HI, v); } catch (e) {} }

	function minWH() { return Math.min(W, H); }
	function aliveCities() { var n = 0, i; for (i = 0; i < s.cities.length; i++) { if (s.cities[i]) { n++; } } return n; }

	function reset() {
		s = {
			over: false, started: false, score: 0, best: loadHi(),
			wave: 1, ammo: AMMO, cities: [1, 1, 1, 1, 1, 1],
			missiles: [], shots: [], booms: [],
			toSpawn: 0, spawnT: 1.2,
			cx: 0.5, cy: 0.42, keys: { l: 0, r: 0, u: 0, d: 0 }
		};
		startWave(1);
	}
	function startWave(w) {
		s.wave = w;
		s.ammo = AMMO;
		s.toSpawn = 7 + w * 2;
		s.spawnT = s.started ? 1.6 : 1.2;
	}

	function enemySpeed() { return Math.min(0.075 + s.wave * 0.011, 0.2); }

	function pickTarget() {
		var live = [], i;
		for (i = 0; i < 6; i++) { if (s.cities[i]) { live.push(i); } }
		if (!live.length) { return { ci: -1, tx: 0.5 }; }
		var ci = live[(Math.random() * live.length) | 0];
		return { ci: ci, tx: CITYX[ci] };
	}
	function mk(ox, oy, vy, split) {
		var t = pickTarget();
		s.missiles.push({
			ox: ox, oy: oy, x: ox, y: oy, ci: t.ci,
			vy: vy, vx: (t.tx - ox) / (GY - oy) * vy,
			split: split, splitY: 0.3 + Math.random() * 0.15
		});
	}

	function addBoom(x, y, max) { s.booms.push({ x: x, y: y, t: 0, max: max }); sfxBoom(); }

	function fire(nx, ny) {
		if (s.ammo <= 0) { sfxDud(); return; }
		nx = Math.max(0.02, Math.min(0.98, nx));
		ny = Math.max(0.04, Math.min(GY - 0.02, ny));
		s.ammo--;
		s.shots.push({ x: 0.5, y: GY - 0.02, tx: nx, ty: ny });
		sfxLaunch();
	}
	function start() { if (!s.started) { s.started = true; if (s.spawnT > 1) { s.spawnT = 0.6; } } }

	function loseCity(ci) {
		if (ci < 0 || !s.cities[ci]) { return; }
		s.cities[ci] = 0; shake = 20; sfxCity();
		if (aliveCities() === 0) { s.over = true; saveHi(s.best); }
	}
	function bump(n) {
		s.score += n;
		if (s.score > s.best) { s.best = s.score; saveHi(s.best); }
	}

	function keyDir(k) {
		k = k.length === 1 ? k.toLowerCase() : k;
		return k === "ArrowLeft" || k === "a" ? "l" : k === "ArrowRight" || k === "d" ? "r"
			: k === "ArrowUp" || k === "w" ? "u" : k === "ArrowDown" || k === "s" ? "d" : "";
	}
	function onKey(e) {
		if (!active() || !s) { return; }
		var d = keyDir(e.key), k = e.key;
		if (d) { s.keys[d] = 1; e.preventDefault(); }
		else if (k === " " || k === "Spacebar" || k === "Enter") {
			ua();
			if (!e.repeat) { if (s.over) { reset(); } else { start(); fire(s.cx, s.cy); } }
			e.preventDefault();
		}
	}
	function onKeyUp(e) {
		var d = s && keyDir(e.key);
		if (d) { s.keys[d] = 0; }
	}
	function ptr(e) { return { x: e.clientX / W, y: e.clientY / H }; }
	function onDown(e) {
		e.preventDefault(); ua();
		if (!s) { return; }
		if (s.over) { reset(); return; }
		var p = ptr(e);
		s.cx = p.x; s.cy = p.y;
		start(); fire(p.x, p.y);
	}
	function onMove(e) {
		if (!s || s.over) { return; }
		var p = ptr(e); s.cx = p.x; s.cy = p.y;
	}

	function update(dt) {
		anim += dt;
		if (shake > 0) { shake = Math.max(0, shake - dt * 60); }

		var cs = 0.9 * dt;
		if (s.keys.l) { s.cx -= cs; } if (s.keys.r) { s.cx += cs; }
		if (s.keys.u) { s.cy -= cs; } if (s.keys.d) { s.cy += cs; }
		s.cx = Math.max(0.02, Math.min(0.98, s.cx));
		s.cy = Math.max(0.04, Math.min(GY - 0.02, s.cy));

		if (s.over || !s.started) { return; }

		if (s.toSpawn > 0) {
			s.spawnT -= dt;
			if (s.spawnT <= 0) {
				mk(0.06 + Math.random() * 0.88, -0.03, enemySpeed(), s.wave >= 4 && Math.random() < 0.35);
				s.toSpawn--;
				s.spawnT = Math.max(0.32, 1.15 - s.wave * 0.07) * (0.6 + Math.random() * 0.9);
			}
		}

		var i, m;
		for (i = s.missiles.length - 1; i >= 0; i--) {
			m = s.missiles[i];
			m.x += m.vx * dt; m.y += m.vy * dt;
			if (m.split && m.y >= m.splitY) {
				m.split = false;
				var forks = 1 + ((Math.random() * 2) | 0), f;
				for (f = 0; f < forks; f++) { mk(m.x, m.y, m.vy, false); }
			}
			if (m.y >= GY) {
				loseCity(m.ci);
				addBoom(m.x, GY - 0.01, 0.05);
				s.missiles.splice(i, 1);
			}
		}

		var INT = 2.1 * dt;
		for (i = s.shots.length - 1; i >= 0; i--) {
			var sh = s.shots[i], dx = sh.tx - sh.x, dyy = sh.ty - sh.y,
				d = Math.sqrt(dx * dx + dyy * dyy);
			if (d <= INT || d === 0) {
				addBoom(sh.tx, sh.ty, 0.115);
				s.shots.splice(i, 1);
			} else {
				sh.x += dx / d * INT; sh.y += dyy / d * INT;
			}
		}

		var mw = minWH();
		for (i = s.booms.length - 1; i >= 0; i--) {
			var b = s.booms[i]; b.t += dt;
			if (b.t >= DUR) { s.booms.splice(i, 1); continue; }
			var r = boomR(b), rp = r * mw;
			if (rp <= 0) { continue; }
			for (var j = s.missiles.length - 1; j >= 0; j--) {
				var mm = s.missiles[j],
					ddx = (mm.x - b.x) * W, ddy = (mm.y - b.y) * H;
				if (ddx * ddx + ddy * ddy <= rp * rp) {
					s.missiles.splice(j, 1);
					bump(25);
					addBoom(mm.x, mm.y, 0.07);
					sfxKill();
				}
			}
		}

		if (!s.over && s.toSpawn === 0 && s.missiles.length === 0) {
			bump(aliveCities() * 100 + s.ammo * 5);
			startWave(s.wave + 1);
			sfxWave();
		}
	}
	function boomR(b) {
		var g = 0.2 * DUR, h = 0.5 * DUR;
		if (b.t < g) { return b.max * (b.t / g); }
		if (b.t < h) { return b.max; }
		return b.max * Math.max(0, 1 - (b.t - h) / (DUR - h));
	}

	function fnt(w, px) { return w + px + "px Roboto,sans-serif"; }
	function bg() {
		var g = c.createLinearGradient(0, 0, 0, H);
		g.addColorStop(0, "#05010f"); g.addColorStop(0.7, "#0d0722"); g.addColorStop(1, "#1a0f2e");
		c.fillStyle = g; c.fillRect(0, 0, W, H);
		c.fillStyle = "#c9d6ff";
		for (var i = 0; i < 44; i++) {
			c.fillRect((i * 79 % 101) / 101 * W, (i * 131 % 89) / 89 * (GY * H * 0.9), 2, 2);
		}
	}
	function ground() {
		var gy = GY * H;
		c.fillStyle = "#241a12"; c.fillRect(0, gy, W, H - gy);
		c.fillStyle = "#3a2a18"; c.fillRect(0, gy, W, Math.max(2, H * 0.006));
	}
	function city(x, gy, ok) {
		var u = minWH() * 0.02;
		if (ok) {
			c.fillStyle = "#67e0ff";
			for (var k = 0; k < 5; k++) {
				var hh = (1.2 + (k % 3) * 0.7) * u;
				c.fillRect(x - u * 2 + k * u * 0.95, gy - hh, u * 0.8, hh);
			}
			c.fillStyle = "rgba(103,224,255,0.2)"; c.fillRect(x - u * 2.2, gy - u * 2.6, u * 4.4, u * 2.6);
		} else {
			c.fillStyle = "#3d2f22";
			c.beginPath(); c.moveTo(x - u * 2, gy); c.lineTo(x - u * 0.7, gy - u * 0.7);
			c.lineTo(x + u * 0.6, gy - u * 0.3); c.lineTo(x + u * 2, gy); c.fill();
		}
	}
	function base(gy) {
		var u = minWH() * 0.03, x = W / 2;
		c.fillStyle = aliveCities() ? "#8fb0ff" : "#556";
		c.beginPath(); c.moveTo(x - u, gy); c.lineTo(x, gy - u * 1.1); c.lineTo(x + u, gy); c.fill();
		c.fillStyle = "#ffd23a";
		var pips = Math.min(s.ammo, 20), p;
		for (p = 0; p < pips; p++) {
			c.fillRect(x - u * 0.85 + (p % 10) * u * 0.18, gy - u * 0.7 - ((p / 10) | 0) * u * 0.28, u * 0.12, u * 0.2);
		}
	}
	function trail(ox, oy, x, y, col, w) {
		c.strokeStyle = col; c.lineWidth = w; c.lineCap = "round";
		c.beginPath(); c.moveTo(ox * W, oy * H); c.lineTo(x * W, y * H); c.stroke();
	}
	function warheads() {
		var i, m;
		for (i = 0; i < s.missiles.length; i++) {
			m = s.missiles[i];
			trail(m.ox, m.oy, m.x, m.y, "rgba(255,90,90,0.55)", Math.max(2, W * 0.0035));
			c.fillStyle = "#ffd0a0";
			c.beginPath(); c.arc(m.x * W, m.y * H, Math.max(2.5, W * 0.006), 0, TAU); c.fill();
		}
	}
	function shots() {
		var i, sh;
		for (i = 0; i < s.shots.length; i++) {
			sh = s.shots[i];
			trail(0.5, GY - 0.02, sh.x, sh.y, "rgba(120,230,255,0.5)", Math.max(2, W * 0.003));
			c.fillStyle = "#e8ffff";
			c.beginPath(); c.arc(sh.tx * W, sh.ty * H, Math.max(2, W * 0.004), 0, TAU); c.fill();
		}
	}
	function blasts() {
		var mw = minWH(), i, b, r, rp;
		c.globalCompositeOperation = "lighter";
		for (i = 0; i < s.booms.length; i++) {
			b = s.booms[i]; r = boomR(b); rp = r * mw;
			if (rp <= 0.5) { continue; }
			var cx = b.x * W, cy = b.y * H, hue = (anim * 200 + i * 60) % 360;
			var g = c.createRadialGradient(cx, cy, 0, cx, cy, rp);
			g.addColorStop(0, "rgba(255,255,255,0.95)");
			g.addColorStop(0.5, "hsla(" + hue + ",100%,60%,0.8)");
			g.addColorStop(1, "hsla(" + hue + ",100%,50%,0)");
			c.fillStyle = g; c.beginPath(); c.arc(cx, cy, rp, 0, TAU); c.fill();
		}
		c.globalCompositeOperation = "source-over";
	}
	function reticle() {
		if (s.over || !s.started) { return; }
		var x = s.cx * W, y = s.cy * H, u = minWH() * 0.032;
		c.strokeStyle = "rgba(255,255,255,0.7)"; c.lineWidth = 2;
		c.beginPath();
		c.moveTo(x - u, y); c.lineTo(x + u, y);
		c.moveTo(x, y - u); c.lineTo(x, y + u); c.stroke();
	}
	function hud() {
		var fs = Math.max(16, Math.min(28, W / 28));
		c.textBaseline = "top"; c.font = fnt("bold ", fs);
		c.textAlign = "left"; c.fillStyle = "#fff"; c.fillText(s.score, 16, 12);
		c.textAlign = "right"; c.fillStyle = "#bcd3ff"; c.fillText("BEST " + s.best, W - 16, 12);
		c.textAlign = "center"; c.font = fnt("600 ", fs * 0.82);
		c.fillStyle = "#9fb0d0"; c.fillText("WAVE " + s.wave, W / 2, 14);
		c.textAlign = "left"; c.fillStyle = s.ammo > 0 ? "#ffd23a" : "#ff7a7a";
		c.fillText("AMMO " + s.ammo, 16, 15 + fs);
		c.textAlign = "right"; c.fillStyle = "#67e0ff";
		c.fillText("CITIES " + aliveCities(), W - 16, 15 + fs);
	}
	function prompt() {
		c.textAlign = "center"; c.textBaseline = "middle";
		c.fillStyle = "#e8ffff"; c.font = fnt("700 ", Math.min(44, W / 15));
		c.fillText("Missile Command", W / 2, H * 0.34);
		c.fillStyle = "#9fb0d0"; c.font = fnt("500 ", Math.min(19, W / 32));
		c.fillText("Tap warheads · arrows + Space also fire", W / 2, H * 0.34 + 44);
	}
	function over() {
		var cx = W / 2, nb = s.score > 0 && s.score >= s.best;
		c.fillStyle = "rgba(4,2,14,0.82)"; c.fillRect(0, 0, W, H);
		c.textAlign = "center"; c.textBaseline = "middle";
		c.fillStyle = "#ff9f9f"; c.font = fnt("bold ", Math.min(60, W / 9)); c.fillText("GAME OVER", cx, H * 0.36);
		c.fillStyle = nb ? "#ffd23a" : "#fff"; c.font = fnt("bold ", Math.min(40, W / 13));
		c.fillText((nb ? "★ NEW BEST " : "Score ") + s.score, cx, H * 0.49);
		c.fillStyle = "#cfe0ff"; c.font = fnt("", Math.min(24, W / 22));
		c.fillText("Best " + s.best + "  ·  tap / space to replay", cx, H * 0.6);
	}
	function render() {
		bg();
		var gy = GY * H, i;
		ground();
		for (i = 0; i < 6; i++) { city(CITYX[i] * W, gy, s.cities[i]); }
		base(gy);
		warheads();
		shots();
		blasts();
		reticle();
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
		if (shake > 0) { var m = shake / 20 * 7; c.translate((Math.random() * 2 - 1) * m, (Math.random() * 2 - 1) * m); }
		render();
		c.restore();
		raf = requestAnimationFrame(frame);
	}
	function begin() {
		size(); reset(); last = 0; shake = 0;
		if (raf) { cancelAnimationFrame(raf); }
		raf = requestAnimationFrame(frame);
	}

	function size() {
		W = window.innerWidth || 1024; H = window.innerHeight || 748;
		if (cv) { cv.width = W; cv.height = H; }
	}
	function setup() {
		el = document.getElementById("missile-command");
		cv = document.createElement("canvas");
		cv.setAttribute("aria-label", "Missile Command point-defence game");
		cv.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:100vh;display:block;z-index:15;touch-action:none;background:#05010f";
		el.appendChild(cv); c = cv.getContext("2d");
		size();

		var back = document.createElement("button");
		back.type = "button"; back.textContent = "← BACK";
		back.style.cssText = "position:fixed;left:14px;bottom:14px;z-index:20;font:bold 20px Roboto,sans-serif;color:#fff;background:#2b1c4b;border:0;border-radius:8px;padding:10px 20px;cursor:pointer";
		back.addEventListener("click", function () { game.showScreen("main-menu"); });
		el.appendChild(back);

		cv.addEventListener("pointerdown", onDown);
		cv.addEventListener("pointermove", onMove);
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
