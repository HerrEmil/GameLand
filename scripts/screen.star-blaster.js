carny.screens["star-blaster"] = (function () {
	// Star Blaster — a formation shooter (screen id "star-blaster"). Your bottom ship AUTO-FIRES
	// upward; you STEER (arrows / A·D / drag) to aim and dodge a block of invaders that marches,
	// steps down and quickens while dropping bombs. Kills are the score, and the wave marches over
	// the muzzle so hands-off fire banks the playtest's early points. Standard screen convention.
	var game = carny.game,
		HI = "gameland.hi.star-blaster",
		TAU = 6.2831853,
		COLS = 8, ROWS = 4, TOTAL = COLS * ROWS,
		ROW = ["#ff5d73", "#ffb454", "#7ee081", "#59b0ff"],
		firstRun = true, el, cv, c,
		W = 1024, H = 748,
		raf = 0, last = 0, ac = null, s, shake = 0, anim = 0;

	// ---- audio ----
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
	function sfxShoot() { beep(880, 0.07, "square", 0.028, 0, 1300); }
	function sfxHit() { beep(340, 0.13, "sawtooth", 0.06, 0, 90); }
	function sfxBomb() { beep(220, 0.11, "triangle", 0.045, 0, 60); }
	function sfxHurt() { beep(150, 0.42, "sawtooth", 0.16, 0, 48); }
	function sfxWave() { beep(660, 0.1, "square", 0.05, 0, 1320); beep(1320, 0.16, "sine", 0.045, 0.1); }

	function loadHi() { try { return parseInt(localStorage.getItem(HI), 10) || 0; } catch (e) { return 0; } }
	function saveHi(v) { try { localStorage.setItem(HI, v); } catch (e) {} }

	// ---- geometry (viewport-relative, recomputed each use) ----
	function margin() { return W * 0.06; }
	function stepX() { return (W - 2 * margin()) / COLS; }
	function stepY() { return Math.min(H * 0.088, stepX() * 0.92); }
	function eR() { return Math.min(stepX(), stepY()) * 0.34; }
	function shipHW() { return Math.max(17, Math.min(36, W * 0.045)); }
	function shipY() { return H - H * 0.11; }
	function idx(col, row) { return row * COLS + col; }
	function enemyX(col) { return margin() + s.ox + (col + 0.5) * stepX(); }
	function enemyY(row) { return s.fy + (row + 0.5) * stepY(); }

	function marchSpeed() {
		var frac = 1 - s.aliveCount / TOTAL;
		return Math.min((0.14 + frac * 0.5 + (s.wave - 1) * 0.06) * W, W * 0.9);
	}

	function newWave(first) {
		s.alive = [];
		for (var i = 0; i < TOTAL; i++) { s.alive.push(1); }
		s.aliveCount = TOTAL;
		s.ox = 0; s.dirX = 1;
		s.fy = Math.min(H * 0.34, H * 0.12 + (s.wave - 1) * stepY() * 0.6);
		s.bombT = first ? 1.1 : 0.8;
	}

	function reset() {
		s = { over: false, started: false, score: 0, best: loadHi(), savedBest: 0,
			wave: 1, lives: 3, sx: W / 2, vx: 0, dir: 0, ptr: null, inv: 0,
			bullets: [], bombs: [], fireT: 0,
			alive: [], aliveCount: 0, ox: 0, dirX: 1, fy: 0, bombT: 0 };
		s.savedBest = s.best;
		newWave(true);
	}

	function persist() {
		if (s.best > s.savedBest && (s.savedBest === 0 || s.best - s.savedBest >= 20)) {
			saveHi(s.best); s.savedBest = s.best;
		}
	}
	function bump(n) {
		s.score += n;
		if (s.score > s.best) { s.best = s.score; persist(); }
	}
	function start() { if (!s.started) { s.started = true; s.fireT = 0.15; } }

	function loseLife(overrun) {
		if (s.over || (s.inv > 0 && !overrun)) { return; }
		s.lives--; s.inv = 1.4; shake = 18; sfxHurt();
		if (overrun) { s.lives = 0; }
		if (s.lives <= 0) { s.over = true; saveHi(s.best); s.savedBest = s.best; }
	}
	function clearWave() {
		bump(50 + s.wave * 10);
		s.wave++; s.bullets = []; s.bombs = [];
		sfxWave();
		newWave(false);
	}

	function dropBomb() {
		for (var t = 0; t < 5; t++) {
			var col = (Math.random() * COLS) | 0, row;
			for (row = ROWS - 1; row >= 0; row--) {
				if (s.alive[idx(col, row)]) {
					s.bombs.push({ x: enemyX(col), y: enemyY(row) + eR(), vy: H * (0.42 + s.wave * 0.05) });
					sfxBomb(); return;
				}
			}
		}
	}

	// ---- input ----
	function dirOf(k) {
		return k === "ArrowLeft" || k === "a" || k === "A" ? -1
			: k === "ArrowRight" || k === "d" || k === "D" ? 1 : 0;
	}
	function onKey(e) {
		if (!active() || !s) { return; }
		var k = e.key, dv = dirOf(k);
		if (dv) { s.dir = dv; ua(); start(); e.preventDefault(); return; }
		if (k === " " || k === "Spacebar" || k === "Enter" || k === "ArrowUp" || k === "w" || k === "W") {
			if (!e.repeat) { ua(); if (s.over) { reset(); } else { start(); } }
			e.preventDefault();
		}
	}
	function onKeyUp(e) {
		if (s) { var dv = dirOf(e.key); if (dv && dv === s.dir) { s.dir = 0; } }
	}
	function onDown(e) {
		e.preventDefault(); ua();
		if (!s) { return; }
		if (s.over) { reset(); return; }
		start(); s.ptr = e.clientX;
	}
	function onMove(e) { if (s && s.ptr !== null) { s.ptr = e.clientX; } }
	function onUp() { if (s) { s.ptr = null; } }

	function update(dt) {
		anim += dt;
		if (shake > 0) { shake = Math.max(0, shake - dt * 60); }
		if (s.inv > 0) { s.inv = Math.max(0, s.inv - dt); }
		if (s.over || !s.started) { return; }

		var hw = shipHW(), spd = W * 0.9,
			target = s.dir !== 0 ? s.dir * spd
				: s.ptr !== null ? Math.max(-spd, Math.min(spd, (s.ptr - s.sx) * 8)) : 0;
		s.vx += (target - s.vx) * Math.min(1, dt * 16);
		s.sx += s.vx * dt;
		if (s.sx < hw + margin()) { s.sx = hw + margin(); s.vx = 0; }
		else if (s.sx > W - hw - margin()) { s.sx = W - hw - margin(); s.vx = 0; }

		s.fireT -= dt;
		if (s.fireT <= 0) {
			s.bullets.push({ x: s.sx, y: shipY() - hw * 0.8, vy: -H * 1.35 });
			s.fireT = 0.26; sfxShoot();
		}

		var minC = COLS, maxC = -1, lowY = -1, col, row;
		for (col = 0; col < COLS; col++) {
			for (row = 0; row < ROWS; row++) {
				if (s.alive[idx(col, row)]) {
					if (col < minC) { minC = col; }
					if (col > maxC) { maxC = col; }
					var ey = enemyY(row);
					if (ey > lowY) { lowY = ey; }
				}
			}
		}
		if (maxC >= 0) {
			s.ox += s.dirX * marchSpeed() * dt;
			var left = margin() + s.ox + (minC + 0.5) * stepX() - eR(),
				right = margin() + s.ox + (maxC + 0.5) * stepX() + eR();
			if (right > W - margin()) { s.ox -= right - (W - margin()); s.dirX = -1; s.fy += stepY() * 0.4; }
			else if (left < margin()) { s.ox += margin() - left; s.dirX = 1; s.fy += stepY() * 0.4; }
			if (lowY + eR() >= shipY() - hw * 0.7) { loseLife(true); }
		}

		s.bombT -= dt;
		if (s.bombT <= 0) {
			dropBomb();
			var frac = 1 - s.aliveCount / TOTAL;
			s.bombT = Math.max(0.34, 1.15 - s.wave * 0.12 - frac * 0.45) * (0.6 + Math.random() * 0.8);
		}

		var htol = eR() * 1.25, r = eR();
		for (var bi = s.bullets.length - 1; bi >= 0; bi--) {
			var b = s.bullets[bi], yBot = b.y, yTop = b.y + b.vy * dt;
			b.y = yTop;
			if (yTop < -12) { s.bullets.splice(bi, 1); continue; }
			var cc = Math.round((b.x - (margin() + s.ox)) / stepX() - 0.5);
			if (cc < 0 || cc >= COLS || Math.abs(b.x - enemyX(cc)) > htol) { continue; }
			for (var rr = 0; rr < ROWS; rr++) {
				if (!s.alive[idx(cc, rr)]) { continue; }
				var ry = enemyY(rr);
				if (ry >= yTop - r && ry <= yBot + r) {
					s.alive[idx(cc, rr)] = 0; s.aliveCount--;
					shake = Math.max(shake, 5); sfxHit();
					bump(10 + (ROWS - 1 - rr) * 5);
					s.bullets.splice(bi, 1);
					break;
				}
			}
		}
		if (s.aliveCount <= 0) { clearWave(); return; }

		for (var di = s.bombs.length - 1; di >= 0; di--) {
			var d = s.bombs[di];
			d.y += d.vy * dt;
			if (d.y > H + 12) { s.bombs.splice(di, 1); continue; }
			if (s.inv <= 0 && Math.abs(d.x - s.sx) < hw * 0.8 && Math.abs(d.y - shipY()) < hw * 0.7) {
				s.bombs.splice(di, 1); loseLife(false);
			}
		}
	}

	// ---- rendering ----
	function fnt(w, px) { return w + px + "px Roboto,sans-serif"; }
	function bg() {
		var g = c.createLinearGradient(0, 0, 0, H);
		g.addColorStop(0, "#0a0e1f"); g.addColorStop(1, "#161033");
		c.fillStyle = g; c.fillRect(0, 0, W, H);
		c.fillStyle = "#cfe0ff";
		for (var i = 0; i < 40; i++) { c.fillRect((i * 79 % 101) / 101 * W, (i * 149 % 103) / 103 * H, 2, 2); }
	}
	function invader(x, y, r, col) {
		c.fillStyle = col;
		c.beginPath(); c.ellipse(x, y, r, r * 0.82, 0, 0, TAU); c.fill();
		c.fillStyle = "#0b0f1a";
		c.beginPath();
		c.arc(x - r * 0.4, y - r * 0.05, r * 0.2, 0, TAU);
		c.arc(x + r * 0.4, y - r * 0.05, r * 0.2, 0, TAU); c.fill();
	}
	function swarm() {
		var r = eR(), col, row;
		for (col = 0; col < COLS; col++) {
			for (row = 0; row < ROWS; row++) {
				if (s.alive[idx(col, row)]) { invader(enemyX(col), enemyY(row), r, ROW[row]); }
			}
		}
	}
	function ship() {
		var hw = shipHW(), x = s.sx, y = shipY();
		if (s.inv > 0 && ((anim * 12) | 0) % 2) { return; }
		var fl = (0.5 + Math.abs(Math.sin(anim * 30)) * 0.5) * hw;
		c.fillStyle = "#5a9bff";
		c.beginPath(); c.moveTo(x - hw * 0.3, y + hw * 0.5); c.lineTo(x, y + hw * 0.5 + fl); c.lineTo(x + hw * 0.3, y + hw * 0.5); c.closePath(); c.fill();
		c.fillStyle = "#e6eeff";
		c.beginPath(); c.moveTo(x, y - hw * 0.85); c.lineTo(x + hw, y + hw * 0.5); c.lineTo(x - hw, y + hw * 0.5); c.closePath(); c.fill();
		c.fillStyle = "#0b0f1a"; c.fillRect(x - hw * 0.16, y - hw * 0.1, hw * 0.32, hw * 0.5);
	}
	function shots() {
		var len = Math.min(20, H * 0.032), i;
		c.lineCap = "round"; c.strokeStyle = "#a9f4ff"; c.lineWidth = Math.max(3, W * 0.008);
		for (i = 0; i < s.bullets.length; i++) {
			var b = s.bullets[i];
			c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(b.x, b.y + len); c.stroke();
		}
		c.fillStyle = "#ff5d73";
		for (i = 0; i < s.bombs.length; i++) {
			var d = s.bombs[i];
			c.beginPath(); c.arc(d.x, d.y, Math.max(3, W * 0.009), 0, TAU); c.fill();
		}
	}
	function hud() {
		var fs = Math.max(16, Math.min(28, W / 28));
		c.textBaseline = "top"; c.font = fnt("bold ", fs);
		c.textAlign = "left"; c.fillStyle = "#fff"; c.fillText(s.score, 16, 12);
		c.textAlign = "right"; c.fillStyle = "#bcd3ff"; c.fillText("BEST " + s.best, W - 16, 12);
		c.font = fnt("600 ", fs * 0.82);
		c.textAlign = "center"; c.fillStyle = "#9fb0d0"; c.fillText("WAVE " + s.wave, W / 2, 14);
		c.textAlign = "left"; c.fillStyle = "#8fd3ff"; c.fillText("SHIPS " + s.lives, 16, 15 + fs);
	}
	function prompt() {
		c.textAlign = "center"; c.textBaseline = "middle";
		c.fillStyle = "#e8ffff"; c.font = fnt("700 ", Math.min(40, W / 17));
		c.fillText("Star Blaster", W / 2, H * 0.6);
		c.fillStyle = "#9fb0d0"; c.font = fnt("500 ", Math.min(19, W / 32));
		c.fillText("Tap / press to launch · ←/→ or drag to steer", W / 2, H * 0.6 + 42);
	}
	function over() {
		var cx = W / 2, nb = s.score > 0 && s.score >= s.best;
		c.fillStyle = "rgba(6,8,20,0.8)"; c.fillRect(0, 0, W, H);
		c.textAlign = "center"; c.textBaseline = "middle";
		c.fillStyle = "#ff9f9f"; c.font = fnt("bold ", Math.min(60, W / 9)); c.fillText("GAME OVER", cx, H * 0.36);
		c.fillStyle = nb ? "#ffd23a" : "#fff"; c.font = fnt("bold ", Math.min(40, W / 13));
		c.fillText((nb ? "★ NEW BEST " : "Score ") + s.score, cx, H * 0.49);
		c.fillStyle = "#cfe0ff"; c.font = fnt("", Math.min(24, W / 22));
		c.fillText("Best " + s.best + "  ·  tap / space to replay", cx, H * 0.6);
	}
	function render() {
		bg();
		swarm();
		shots();
		ship();
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
		if (shake > 0) { var m = shake / 16 * 6; c.translate((Math.random() * 2 - 1) * m, (Math.random() * 2 - 1) * m); }
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
		el = document.getElementById("star-blaster");
		cv = document.createElement("canvas");
		cv.setAttribute("aria-label", "Star Blaster space shooter game");
		cv.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:100vh;display:block;z-index:15;touch-action:none;background:#0a0e1f";
		el.appendChild(cv); c = cv.getContext("2d");
		size();

		var back = document.createElement("button");
		back.type = "button"; back.textContent = "← BACK";
		back.style.cssText = "position:fixed;left:14px;bottom:14px;z-index:20;font:bold 20px Roboto,sans-serif;color:#fff;background:#2b3b6b;border:0;border-radius:8px;padding:10px 20px;cursor:pointer";
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
