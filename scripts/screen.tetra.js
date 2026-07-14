carny.screens["tetra"] = (function () {
	// Tetra — the falling-block puzzle (screen id "tetra"). Rotate/slide the seven tetrominoes
	// down a 10×20 well; fill a row to clear it and score; speed steps up every ten lines.
	// Arrows/A·D slide, ↑·W·X rotate CW, Z CCW, ↓ soft-, Space hard-drop; touch: drag=slide,
	// tap=rotate, swipe-down=slam. 7-bag stream, ghost marker, best in localStorage.hi.tetra.
	var game = carny.game,
		HI = "gameland.hi.tetra",
		COLS = 10, ROWS = 20,
		COLORS = ["#4cd7e6", "#f5d33a", "#b46be0", "#5fd06a", "#ff5d6c", "#5a8dff", "#ff9f43"], // I O T S Z J L
		BASE = [
			[4, [1, 0], [1, 1], [1, 2], [1, 3]],
			[2, [0, 0], [0, 1], [1, 0], [1, 1]],
			[3, [0, 1], [1, 0], [1, 1], [1, 2]],
			[3, [0, 1], [0, 2], [1, 0], [1, 1]],
			[3, [0, 0], [0, 1], [1, 1], [1, 2]],
			[3, [0, 0], [1, 0], [1, 1], [1, 2]],
			[3, [0, 2], [1, 0], [1, 1], [1, 2]]
		],
		LINE = [0, 100, 300, 500, 800],
		SHAPES = [], SIZE = [], MINR = [],
		firstRun = true, el, cv, c,
		W = 1024, H = 748,
		raf = 0, last = 0, ac = null, s, flash = 0, anim = 0;

	(function () {
		for (var p = 0; p < BASE.length; p++) {
			var N = BASE[p][0], cells = BASE[p].slice(1), rots = [], top = N, i;
			for (i = 0; i < cells.length; i++) { if (cells[i][0] < top) { top = cells[i][0]; } }
			for (var r = 0; r < 4; r++) {
				rots.push(cells.map(function (rc) { return [rc[0], rc[1]]; }));
				cells = cells.map(function (rc) { return [rc[1], N - 1 - rc[0]]; });
			}
			SHAPES.push(rots); SIZE.push(N); MINR.push(top);
		}
	}());

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
	function sfxMove() { beep(240, 0.03, "square", 0.02, 0, 260); }
	function sfxRotate() { beep(520, 0.05, "square", 0.03, 0, 660); }
	function sfxLock() { beep(180, 0.07, "triangle", 0.05, 0, 120); }
	function sfxDrop() { beep(150, 0.09, "sawtooth", 0.05, 0, 70); }
	function sfxClear(n) {
		beep(520, 0.12, "square", 0.05, 0, 780);
		beep(780, 0.16, "sine", 0.05, 0.09, n >= 4 ? 1560 : 1040);
	}
	function sfxLevel() { beep(660, 0.1, "square", 0.05, 0, 990); beep(990, 0.18, "sine", 0.05, 0.1, 1480); }
	function sfxHurt() { beep(150, 0.5, "sawtooth", 0.16, 0, 44); }

	function loadHi() { try { return parseInt(localStorage.getItem(HI), 10) || 0; } catch (e) { return 0; } }
	function saveHi(v) { try { localStorage.setItem(HI, v); } catch (e) {} }

	function refill() {
		var b = [0, 1, 2, 3, 4, 5, 6], i, j, t;
		for (i = b.length - 1; i > 0; i--) {
			j = (Math.random() * (i + 1)) | 0; t = b[i]; b[i] = b[j]; b[j] = t;
		}
		s.bag = b;
	}
	function draw() {
		if (!s.bag.length) { refill(); }
		return s.bag.pop();
	}

	function collides(p, rot, x, y) {
		var cells = SHAPES[p][rot], i, gr, gc;
		for (i = 0; i < cells.length; i++) {
			gc = x + cells[i][1]; gr = y + cells[i][0];
			if (gc < 0 || gc >= COLS || gr >= ROWS) { return true; }
			if (gr >= 0 && s.grid[gr][gc]) { return true; }
		}
		return false;
	}
	function end() { s.over = true; saveHi(s.best); s.savedBest = s.best; sfxHurt(); }
	function spawn() {
		var p = s.nextP;
		s.nextP = draw();
		s.p = p; s.rot = 0;
		s.x = ((COLS - SIZE[p]) / 2) | 0;
		s.y = -MINR[p];
		s.dropT = 0;
		if (collides(p, 0, s.x, s.y)) { end(); }
	}
	function gravityStep() { return Math.max(0.05, 0.8 * Math.pow(0.85, s.level)); }

	function lock() {
		var cells = SHAPES[s.p][s.rot], i, gr, gc, topped = false;
		for (i = 0; i < cells.length; i++) {
			gr = s.y + cells[i][0]; gc = s.x + cells[i][1];
			if (gr < 0) { topped = true; } else { s.grid[gr][gc] = s.p + 1; }
		}
		sfxLock();
		clearLines();
		if (topped) { end(); return; }
		spawn();
	}
	function clearLines() {
		var full = [], r, col, cleared;
		for (r = ROWS - 1; r >= 0; r--) {
			for (col = 0; col < COLS; col++) { if (!s.grid[r][col]) { break; } }
			if (col === COLS) { full.push(r); }
		}
		cleared = full.length;
		if (!cleared) { return; }
		for (r = 0; r < cleared; r++) { s.grid.splice(full[r] - r, 1); }
		for (r = 0; r < cleared; r++) { s.grid.unshift(new Array(COLS).fill(0)); }
		s.lines += cleared;
		bump(LINE[cleared] * (s.level + 1));
		flash = Math.min(0.5, 0.16 + cleared * 0.09);
		sfxClear(cleared);
		var nl = (s.lines / 10) | 0;
		if (nl > s.level) { s.level = nl; sfxLevel(); }
	}

	function bump(n) {
		s.score += n;
		if (s.score > s.best) {
			s.best = s.score;
			if (s.savedBest === 0 || s.best - s.savedBest >= 100) { saveHi(s.best); s.savedBest = s.best; }
		}
	}

	function move(dx) {
		if (s.over) { return; }
		if (!collides(s.p, s.rot, s.x + dx, s.y)) { s.x += dx; sfxMove(); }
	}
	function soft() {
		if (s.over) { return; }
		if (!collides(s.p, s.rot, s.x, s.y + 1)) { s.y++; s.dropT = 0; bump(1); }
		else { lock(); }
	}
	function rotate(dir) {
		if (s.over) { return; }
		var nr = (s.rot + (dir > 0 ? 1 : 3)) % 4, k, kicks = [0, -1, 1, -2, 2];
		for (k = 0; k < kicks.length; k++) {
			if (!collides(s.p, nr, s.x + kicks[k], s.y)) { s.x += kicks[k]; s.rot = nr; sfxRotate(); return; }
		}
	}
	function hardDrop() {
		if (s.over) { return; }
		var d = 0;
		while (!collides(s.p, s.rot, s.x, s.y + 1)) { s.y++; d++; }
		if (d) { bump(d * 2); }
		sfxDrop();
		lock();
	}
	function ghostY() {
		var y = s.y;
		while (!collides(s.p, s.rot, s.x, y + 1)) { y++; }
		return y;
	}

	function reset() {
		s = {
			grid: [], over: false, score: 0, best: loadHi(), savedBest: 0,
			level: 0, lines: 0, p: 0, rot: 0, x: 0, y: 0, dropT: 0,
			bag: [], nextP: 0, cell: 24, bx: 0, by: 0, bw: 0, bh: 0,
			pdown: false, ox: 0, oy: 0, ax: 0, tot: 0, downAt: 0, gest: false
		};
		s.savedBest = s.best;
		for (var r = 0; r < ROWS; r++) { s.grid.push(new Array(COLS).fill(0)); }
		s.nextP = draw();
		spawn();
	}

	function onKey(e) {
		if (!active() || !s) { return; }
		var k = e.key;
		if (s.over) {
			if (k === " " || k === "Enter") { ua(); reset(); e.preventDefault(); }
			return;
		}
		if (k === "ArrowLeft" || k === "a" || k === "A") { ua(); move(-1); e.preventDefault(); }
		else if (k === "ArrowRight" || k === "d" || k === "D") { ua(); move(1); e.preventDefault(); }
		else if (k === "ArrowDown" || k === "s" || k === "S") { ua(); soft(); e.preventDefault(); }
		else if (k === "ArrowUp" || k === "w" || k === "W" || k === "x" || k === "X") { if (!e.repeat) { ua(); rotate(1); } e.preventDefault(); }
		else if (k === "z" || k === "Z") { if (!e.repeat) { ua(); rotate(-1); } e.preventDefault(); }
		else if (k === " " || k === "Spacebar" || k === "Enter") { if (!e.repeat) { ua(); hardDrop(); } e.preventDefault(); }
	}
	function onDown(e) {
		e.preventDefault(); ua();
		if (!s) { return; }
		if (s.over) { reset(); return; }
		s.pdown = true; s.ox = e.clientX; s.oy = e.clientY; s.ax = e.clientX;
		s.tot = 0; s.downAt = anim; s.gest = false;
	}
	function onMove(e) {
		if (!s || !s.pdown || s.over) { return; }
		var step = Math.max(20, s.cell * 0.85),
			ndx = e.clientX - s.ox, ndy = e.clientY - s.oy,
			dx = e.clientX - s.ax;
		s.tot = Math.abs(ndx) + Math.abs(ndy);
		while (dx >= step) { move(1); s.ax += step; dx -= step; }
		while (dx <= -step) { move(-1); s.ax -= step; dx += step; }
		if (!s.gest && ndy > step * 2 && ndy > Math.abs(ndx)) { s.gest = true; hardDrop(); }
	}
	function onUp() {
		if (!s || !s.pdown) { return; }
		s.pdown = false;
		if (s.over) { return; }
		var step = Math.max(20, s.cell * 0.85);
		if (!s.gest && s.tot < step * 0.6 && anim - s.downAt < 0.28) { rotate(1); }
	}

	function update(dt) {
		anim += dt;
		if (flash > 0) { flash = Math.max(0, flash - dt); }
		if (s.over) { return; }
		s.dropT += dt;
		var g = gravityStep();
		while (s.dropT >= g) {
			s.dropT -= g;
			if (!collides(s.p, s.rot, s.x, s.y + 1)) { s.y++; } else { lock(); break; }
		}
	}

	function fnt(w, px) { return w + px + "px Roboto,sans-serif"; }
	function metrics() {
		var cell = Math.min((W * 0.9 / COLS) | 0, (H * 0.84 / ROWS) | 0);
		if (cell < 6) { cell = 6; }
		var bw = cell * COLS, bh = cell * ROWS,
			bx = ((W - bw) / 2) | 0,
			by = Math.max(4, Math.min((H * 0.13) | 0, H - bh - 4));
		s.cell = cell; s.bx = bx; s.by = by; s.bw = bw; s.bh = bh;
	}
	function bg() {
		var gr = c.createLinearGradient(0, 0, 0, H);
		gr.addColorStop(0, "#0b1024"); gr.addColorStop(1, "#161a2e");
		c.fillStyle = gr; c.fillRect(0, 0, W, H);
	}
	function block(x, y, cell, ci, a) {
		var lip = Math.max(2, cell * 0.16);
		c.globalAlpha = a || 1;
		c.fillStyle = COLORS[ci]; c.fillRect(x + 1, y + 1, cell - 2, cell - 2);
		c.fillStyle = "rgba(255,255,255,0.26)"; c.fillRect(x + 1, y + 1, cell - 2, lip);
		c.fillStyle = "rgba(0,0,0,0.24)"; c.fillRect(x + 1, y + cell - 1 - lip, cell - 2, lip);
		c.globalAlpha = 1;
	}
	function well() {
		var bx = s.bx, by = s.by, bw = s.bw, bh = s.bh, cell = s.cell, r, col;
		c.fillStyle = "#0a0d1c"; c.fillRect(bx - 3, by - 3, bw + 6, bh + 6);
		c.strokeStyle = "rgba(255,255,255,0.08)"; c.lineWidth = 1;
		for (r = 1; r < ROWS; r++) { c.beginPath(); c.moveTo(bx, by + r * cell); c.lineTo(bx + bw, by + r * cell); c.stroke(); }
		for (col = 1; col < COLS; col++) { c.beginPath(); c.moveTo(bx + col * cell, by); c.lineTo(bx + col * cell, by + bh); c.stroke(); }
		for (r = 0; r < ROWS; r++) {
			for (col = 0; col < COLS; col++) {
				if (s.grid[r][col]) { block(bx + col * cell, by + r * cell, cell, s.grid[r][col] - 1); }
			}
		}
	}
	function piece(rot, x, y, ci, a) {
		var cells = SHAPES[s.p][rot], i, gr;
		for (i = 0; i < cells.length; i++) {
			gr = y + cells[i][0];
			if (gr >= 0) { block(s.bx + (x + cells[i][1]) * s.cell, s.by + gr * s.cell, s.cell, ci, a); }
		}
	}
	function ghost() {
		var gy = ghostY(), cells = SHAPES[s.p][s.rot], i, gr;
		if (gy === s.y) { return; }
		c.strokeStyle = COLORS[s.p]; c.globalAlpha = 0.45; c.lineWidth = 2;
		for (i = 0; i < cells.length; i++) {
			gr = gy + cells[i][0];
			if (gr >= 0) { c.strokeRect(s.bx + (s.x + cells[i][1]) * s.cell + 2, s.by + gr * s.cell + 2, s.cell - 4, s.cell - 4); }
		}
		c.globalAlpha = 1;
	}
	function preview() {
		var pv = Math.max(14, s.cell * 0.72), cells = SHAPES[s.nextP][0],
			minr = 9, minc = 9, maxc = 0, i, r, cc;
		for (i = 0; i < cells.length; i++) {
			r = cells[i][0]; cc = cells[i][1];
			if (r < minr) { minr = r; } if (cc < minc) { minc = cc; } if (cc > maxc) { maxc = cc; }
		}
		var side = s.bx + s.bw + pv * 0.6 + 4 * pv < W - 6,
			boxX = side ? s.bx + s.bw + pv * 0.6 : (W - (maxc - minc + 1) * pv) / 2,
			boxY = side ? s.by : Math.max(2, s.by - 2 * pv - 6),
			ox = boxX - minc * pv, oy = boxY - minr * pv;
		c.textAlign = "left"; c.fillStyle = "#7f8bb5"; c.font = fnt("bold ", Math.max(11, pv * 0.5));
		c.fillText("NEXT", boxX, boxY - pv * 0.3);
		for (i = 0; i < cells.length; i++) { block(ox + cells[i][1] * pv, oy + cells[i][0] * pv, pv, s.nextP); }
	}
	function hud() {
		var fs = Math.max(15, Math.min(26, W / 30));
		c.textBaseline = "alphabetic";
		c.textAlign = "left"; c.font = fnt("bold ", fs);
		c.fillStyle = "#fff"; c.fillText(s.score, s.bx, s.by - 8);
		c.font = fnt("600 ", fs * 0.72); c.fillStyle = "#8fa0cf";
		c.fillText("BEST " + s.best, s.bx, s.by - 8 - fs * 1.05);
		c.textAlign = "right"; c.fillStyle = "#cfe0ff"; c.font = fnt("600 ", fs * 0.78);
		c.fillText("LVL " + s.level + "   LINES " + s.lines, s.bx + s.bw, s.by - 8);
	}
	function over() {
		var cx = W / 2, nb = s.score > 0 && s.score >= s.best;
		c.fillStyle = "rgba(6,8,20,0.82)"; c.fillRect(0, 0, W, H);
		c.textAlign = "center"; c.textBaseline = "middle";
		c.fillStyle = "#ff9f9f"; c.font = fnt("bold ", Math.min(58, W / 9)); c.fillText("GAME OVER", cx, H * 0.36);
		c.fillStyle = nb ? "#ffd23a" : "#fff"; c.font = fnt("bold ", Math.min(38, W / 13));
		c.fillText((nb ? "★ NEW BEST " : "Score ") + s.score, cx, H * 0.49);
		c.fillStyle = "#cfe0ff"; c.font = fnt("", Math.min(23, W / 22));
		c.fillText("Best " + s.best + "  ·  tap / space to replay", cx, H * 0.6);
	}
	function render() {
		metrics();
		bg();
		well();
		if (!s.over) { ghost(); piece(s.rot, s.x, s.y, s.p); }
		preview();
		hud();
		if (flash > 0) { c.fillStyle = "rgba(255,255,255," + (flash * 0.7) + ")"; c.fillRect(s.bx, s.by, s.bw, s.bh); }
		if (s.over) { over(); }
	}

	function active() { return !!(el && el.classList.contains("active")); }
	function frame(ts) {
		if (!active()) { raf = 0; return; }
		var dt = last ? Math.min((ts - last) / 1000, 0.05) : 0;
		last = ts; update(dt); render();
		raf = requestAnimationFrame(frame);
	}
	function begin() {
		size(); reset(); metrics(); last = 0; flash = 0;
		if (raf) { cancelAnimationFrame(raf); }
		raf = requestAnimationFrame(frame);
	}

	function size() {
		W = window.innerWidth || 1024; H = window.innerHeight || 748;
		if (cv) { cv.width = W; cv.height = H; }
		if (s) { metrics(); }
	}
	function setup() {
		el = document.getElementById("tetra");
		cv = document.createElement("canvas");
		cv.setAttribute("aria-label", "Tetra falling-block puzzle game");
		cv.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:100vh;display:block;z-index:15;touch-action:none;background:#0b1024";
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
		window.addEventListener("resize", size);
	}

	function run() {
		if (firstRun) { setup(); firstRun = false; }
		begin();
	}

	return { run: run };
}());
