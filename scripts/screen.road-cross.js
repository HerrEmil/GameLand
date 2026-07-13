carny.screens["road-cross"] = (function () {
	// Road Cross — a Frogger-style lane crossing game (screen id "road-cross").
	// Hop the frog up through lanes of traffic to the far bank; each reached row
	// banks a point, a crossing awards a bonus and speeds the traffic up, a car
	// touch costs one of three lives. Discrete grid hops (no physics). Lanes are
	// in CELL units, projected through the current cell size each frame so resize
	// just rescales. At reset every lane is phased with a gap dead-centre on the
	// frog column, so the opening hop always lands safe (like Snake's free first
	// fruit) — a deterministic first point for the playtest. Same lazy-load +
	// firstRun convention; over 5 KB so the build content-hashes it.
	var game = carny.game,
		HI = "gameland.hi.road-cross",
		TAU = 6.2831853,
		HOP = 0.09,                                          // hop animation seconds
		LIVES = 3,
		CARS = ["#e14b4b", "#f0a52e", "#e8d23a", "#4bb1e1", "#c46be0", "#3ec98a"],
		firstRun = true, el, cv, c,
		W = 1024, H = 748, cw = 80, ch = 68, C = 12, R = 11, cc = 6,
		raf = 0, last = 0, ac = null, s, flash = 0;

	// ---- audio (gesture-gated, same pattern as game3) ----
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
	function sfxHop() { beep(520, 0.05, "square", 0.05); }
	function sfxCross() { beep(660, 0.08, "square", 0.06); beep(880, 0.08, "square", 0.05, 0.06); beep(1180, 0.1, "sine", 0.05, 0.12); }
	function sfxHit() { beep(150, 0.28, "sawtooth", 0.16); beep(60, 0.4, "triangle", 0.13, 0.05); }
	function sfxOver() { beep(300, 0.16, "square", 0.1); beep(200, 0.2, "square", 0.1, 0.14); beep(120, 0.3, "triangle", 0.1, 0.3); }

	function loadHi() { try { return parseInt(localStorage.getItem(HI), 10) || 0; } catch (e) { return 0; } }
	function saveHi(v) { try { localStorage.setItem(HI, v); } catch (e) {} }

	// Column/row counts that keep cells a comfortable size at any viewport.
	function metrics() {
		C = Math.max(9, Math.min(15, Math.round(W / 72)));
		R = Math.max(9, Math.min(15, Math.round(H / 70)));
		cw = W / C; ch = H / R; cc = Math.floor(C / 2);
	}

	function colX(col) { return (col + 0.5) * cw; }
	function rowY(row) { return H - (row + 0.5) * ch; }                 // row 0 at the bottom
	function rowFromY(y) { return Math.max(0, Math.min(R - 1, Math.floor((H - y) / ch))); }

	// A lane phased so a gap sits centred on the frog column at t=0.
	function makeLane(i) {
		var per = 3 + (i % 3) * 0.6,                          // cells between car centres
			car = 1.3 + (i % 2) * 0.5,                        // car length in cells
			spd = 1.5 + ((i * 7) % 5) * 0.42,                 // cells / second
			dir = i % 2 ? 1 : -1,
			phase = (((cc + 0.5) + per / 2) % per + per) % per;
		return { per: per, car: car, spd: spd, dir: dir, off: 0, phase: phase, col: CARS[i % CARS.length] };
	}

	// Build the row layout: bottom + top are safe banks; every third middle row
	// is a grass median rest strip; the rest are traffic lanes.
	function buildRows() {
		s.rows = [];
		for (var r = 0; r < R; r++) {
			if (r === 0 || r === R - 1 || r % 3 === 0) { s.rows.push({ road: false }); }
			else { s.rows.push({ road: true, lane: makeLane(r) }); }
		}
	}

	function reset() {
		s = {
			over: false, started: false, lives: LIVES, score: 0, best: loadHi(),
			cross: 0, curMax: 0, spd: 1, inv: 0,
			col: cc, row: 0, fx: 0, fy: 0, hop: 0, hf: null, rows: null
		};
		metrics(); buildRows();
		s.fx = colX(s.col); s.fy = rowY(s.row);
	}

	// Return to the start bank without ending the run (after a hit or a crossing).
	function respawn() {
		s.col = cc; s.row = 0; s.hop = 0; s.hf = null;
		s.fx = colX(s.col); s.fy = rowY(s.row); s.curMax = 0;
	}

	function bankScore() {
		var prog = s.cross * (R - 1) + s.curMax;
		if (prog > s.score) {
			s.score = prog;
			if (prog > s.best) { s.best = prog; saveHi(prog); }
		}
	}

	function gameOver() {
		if (s.over) { return; }
		s.over = true; sfxOver();
	}

	function hit() {
		if (s.inv > 0 || s.over) { return; }
		s.lives--; flash = 12; s.inv = 1.1; sfxHit();
		if (s.lives <= 0) { gameOver(); } else { respawn(); }
	}

	// Attempt a hop by a cell delta; ignored mid-hop so each press is one step.
	function tryHop(dc, dr) {
		if (s.hop > 0) { return; }
		var nc = Math.max(0, Math.min(C - 1, s.col + dc)),
			nr = Math.max(0, Math.min(R - 1, s.row + dr));
		if (nc === s.col && nr === s.row) { return; }
		s.hf = { x: s.fx, y: s.fy }; s.hop = HOP;
		s.col = nc; s.row = nr; sfxHop();
		if (nr > s.curMax) { s.curMax = nr; bankScore(); }
		if (nr === R - 1) {                                   // reached the far bank
			s.cross++; s.curMax = R - 1; bankScore(); flash = 10; sfxCross();
			s.spd = Math.min(2.6, 1 + s.cross * 0.12);        // traffic ramps up per crossing
			respawn();
		}
	}

	// A direction press acts as start / restart / hop as needed.
	function input(dc, dr) {
		unlockAudio();
		if (s.over) { reset(); return; }
		if (!s.started) { s.started = true; }
		tryHop(dc, dr);
	}

	// Car centres of a lane that fall within (or just off) view.
	function carXs(lane) {
		var per = lane.per * cw, base = (((lane.phase + lane.off) % lane.per + lane.per) % lane.per) * cw,
			cwd = lane.car * cw, xs = [], k, x;
		for (k = -1; base + k * per < W + cwd; k++) {
			x = base + k * per;
			if (x > -cwd) { xs.push(x); }
		}
		return xs;
	}

	function collide() {
		// The frog and every car in row r share the row band, so a hit reduces to
		// horizontal overlap between the frog and a car in the row it sits over.
		var r = rowFromY(s.fy), row = s.rows[r];
		if (!row || !row.road) { return; }
		var lane = row.lane, cwd = lane.car * cw, fx = s.fx, fh = cw * 0.3,
			xs = carXs(lane), i, cx;
		for (i = 0; i < xs.length; i++) {
			cx = xs[i];
			if (fx + fh > cx - cwd / 2 && fx - fh < cx + cwd / 2) { hit(); return; }
		}
	}

	function update(dt) {
		if (flash > 0) { flash = Math.max(0, flash - dt * 30); }
		if (s.inv > 0) { s.inv = Math.max(0, s.inv - dt); }
		if (s.hop > 0) {
			s.hop = Math.max(0, s.hop - dt);
			var t = 1 - s.hop / HOP, tx = colX(s.col), ty = rowY(s.row);
			s.fx = s.hf.x + (tx - s.hf.x) * t; s.fy = s.hf.y + (ty - s.hf.y) * t;
			if (s.hop === 0) { s.hf = null; s.fx = tx; s.fy = ty; }
		}
		if (s.over || !s.started) { return; }
		for (var r = 1; r < R - 1; r++) {
			var row = s.rows[r];
			if (row.road) { row.lane.off += row.lane.dir * row.lane.spd * s.spd * dt; }
		}
		collide();
	}

	// ---- rendering ----
	function rrect(x, y, w, h, r) {
		c.beginPath();
		if (c.roundRect) { c.roundRect(x, y, w, h, r); return; }
		c.moveTo(x + r, y);
		c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
		c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
	}
	function drawCar(x, y, w, h, dir, col) {
		c.fillStyle = col; rrect(x, y, w, h, Math.min(10, h * 0.3)); c.fill();
		c.fillStyle = "rgba(20,26,40,0.55)";                 // window band toward the front
		rrect(dir > 0 ? x + w * 0.5 : x + w * 0.16, y + h * 0.22, w * 0.34, h * 0.56, 4); c.fill();
	}
	function drawFrog() {
		if (s.inv > 0 && Math.floor(s.inv * 12) % 2) { return; }   // blink while invulnerable
		var x = s.fx, y = s.fy, rr = Math.min(cw, ch) * 0.32,
			sq = s.hop > 0 ? 1 + Math.sin((1 - s.hop / HOP) * Math.PI) * 0.18 : 1;
		c.fillStyle = "#5fd23a";
		c.beginPath();
		if (c.ellipse) { c.ellipse(x, y, rr, rr * sq, 0, 0, TAU); } else { c.arc(x, y, rr, 0, TAU); }
		c.fill();
		var ex = rr * 0.44, ey = -rr * 0.55;
		c.fillStyle = "#fff";
		c.beginPath(); c.arc(x - ex, y + ey, rr * 0.28, 0, TAU); c.arc(x + ex, y + ey, rr * 0.28, 0, TAU); c.fill();
		c.fillStyle = "#12240a";
		c.beginPath(); c.arc(x - ex, y + ey, rr * 0.13, 0, TAU); c.arc(x + ex, y + ey, rr * 0.13, 0, TAU); c.fill();
	}
	function render() {
		for (var r = 0; r < R; r++) {
			var y = H - (r + 1) * ch, row = s.rows[r];
			if (!row.road) {
				c.fillStyle = (r === R - 1) ? "#2f7d3a" : (r === 0 ? "#3a9a45" : "#357f3e");
				c.fillRect(0, y, W, ch);
			} else {
				c.fillStyle = "#31313b"; c.fillRect(0, y, W, ch);
				c.strokeStyle = "rgba(255,214,90,0.5)"; c.lineWidth = 2; c.setLineDash([cw * 0.4, cw * 0.4]);
				c.beginPath(); c.moveTo(0, y + ch / 2); c.lineTo(W, y + ch / 2); c.stroke(); c.setLineDash([]);
				var lane = row.lane, xs = carXs(lane), cwd = lane.car * cw, i;
				for (i = 0; i < xs.length; i++) { drawCar(xs[i] - cwd / 2, y + ch * 0.17, cwd, ch * 0.66, lane.dir, lane.col); }
			}
		}
		if (flash > 0) { c.fillStyle = "rgba(255,255,255," + (flash / 40) + ")"; c.fillRect(0, 0, W, H); }
		drawFrog();
		hud();
		if (!s.started && !s.over) { prompt(); }
		if (s.over) { over(); }
	}
	function hud() {
		var fs = Math.max(18, Math.min(30, W / 26));
		c.textBaseline = "top"; c.font = "bold " + fs + "px Roboto, sans-serif";
		c.fillStyle = "#fff"; c.textAlign = "left"; c.fillText("SCORE " + s.score, 16, 12);
		c.textAlign = "right"; c.fillStyle = "#bfe6a8"; c.fillText("BEST " + s.best, W - 16, 12);
		c.textAlign = "center"; c.fillStyle = "#ffd23a";
		c.fillText("♥ ".repeat(Math.max(0, s.lives)).trim(), W / 2, 12);
	}
	function prompt() {
		c.textAlign = "center"; c.textBaseline = "middle";
		c.fillStyle = "#ffffff"; c.font = "700 " + Math.min(34, W / 20) + "px Roboto, sans-serif";
		c.fillText("Cross the road!", W / 2, H * 0.42);
		c.fillStyle = "#dfeecf"; c.font = "500 " + Math.min(20, W / 30) + "px Roboto, sans-serif";
		c.fillText("Arrows / WASD / swipe · tap to hop", W / 2, H * 0.42 + 40);
	}
	function over() {
		var cx = W / 2, nb = s.score > 0 && s.score >= s.best;
		c.fillStyle = "rgba(10,20,10,0.78)"; c.fillRect(0, 0, W, H);
		c.textAlign = "center"; c.textBaseline = "middle";
		c.fillStyle = "#ff9f9f"; c.font = "bold 68px Roboto, sans-serif"; c.fillText("GAME OVER", cx, H * 0.34);
		c.fillStyle = "#fff"; c.font = "bold 42px Roboto, sans-serif"; c.fillText("Score  " + s.score, cx, H * 0.47);
		c.fillStyle = nb ? "#ffd23a" : "#bfe6a8"; c.font = "bold 28px Roboto, sans-serif";
		c.fillText((nb ? "★ NEW BEST  " : "Best  ") + s.best, cx, H * 0.56);
		c.fillStyle = "#dfeecf"; c.font = "24px Roboto, sans-serif"; c.fillText("Tap / Space to cross again", cx, H * 0.68);
	}

	function active() { return !!(el && el.classList.contains("active")); }
	function frame(ts) {
		if (!active()) { raf = 0; return; }                  // stop the loop when hidden
		var dt = last ? Math.min((ts - last) / 1000, 0.033) : 0;
		last = ts; update(dt); render();
		raf = requestAnimationFrame(frame);
	}
	function begin() {
		size(); reset(); last = 0; flash = 0;
		if (raf) { cancelAnimationFrame(raf); }
		raf = requestAnimationFrame(frame);
	}

	// ---- input ----
	function keyDir(k) {
		if (k === "ArrowUp" || k === "w" || k === "W") { return [0, 1]; }
		if (k === "ArrowDown" || k === "s" || k === "S") { return [0, -1]; }
		if (k === "ArrowLeft" || k === "a" || k === "A") { return [-1, 0]; }
		if (k === "ArrowRight" || k === "d" || k === "D") { return [1, 0]; }
		return null;
	}
	function onKey(e) {
		if (!active() || !s) { return; }
		var d = keyDir(e.key);
		if (d) { if (!e.repeat) { input(d[0], d[1]); } e.preventDefault(); return; }
		if (e.key === " " || e.key === "Spacebar" || e.key === "Enter") {
			if (s.over || !s.started) { input(0, 1); } e.preventDefault();
		}
	}
	var down = null;
	function onDown(e) { e.preventDefault(); down = { x: e.clientX, y: e.clientY }; unlockAudio(); }
	function onUp(e) {
		if (!s) { return; }
		e.preventDefault();
		if (!down) { input(0, 1); return; }
		var dx = e.clientX - down.x, dy = e.clientY - down.y, ax = Math.abs(dx), ay = Math.abs(dy);
		down = null;
		if (ax < 24 && ay < 24) { input(0, 1); return; }      // tap = hop up
		if (ax > ay) { input(dx > 0 ? 1 : -1, 0); } else { input(0, dy < 0 ? 1 : -1); }
	}

	function size() {
		W = window.innerWidth || 1024; H = window.innerHeight || 748;
		if (cv) { cv.width = W; cv.height = H; }
		if (s) { metrics(); if (!(s.hop > 0)) { s.fx = colX(s.col); s.fy = rowY(s.row); } }
	}
	function setup() {
		el = document.getElementById("road-cross");
		cv = document.createElement("canvas");
		cv.setAttribute("aria-label", "Road Cross lane-crossing game");
		cv.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:100vh;display:block;z-index:15;touch-action:none;cursor:pointer;background:#31313b";
		el.appendChild(cv); c = cv.getContext("2d"); size();

		var back = document.createElement("button");
		back.type = "button"; back.textContent = "← BACK";
		back.style.cssText = "position:fixed;left:14px;bottom:14px;z-index:20;font:bold 20px Roboto,sans-serif;color:#fff;background:#2b6b34;border:0;border-radius:8px;padding:10px 20px;cursor:pointer";
		back.addEventListener("click", function () { game.showScreen("main-menu"); });
		el.appendChild(back);

		cv.addEventListener("pointerdown", onDown);
		cv.addEventListener("pointerup", onUp);
		cv.addEventListener("pointercancel", function () { down = null; });
		document.addEventListener("keydown", onKey);
		window.addEventListener("resize", size);
	}

	function run() {
		if (firstRun) { setup(); firstRun = false; }
		begin();
	}

	return { run: run };
}());
