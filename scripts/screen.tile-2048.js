carny.screens["tile-2048"] = (function () {
	// 2048 — a slide-and-merge number puzzle (screen id "tile-2048"). Swipe or
	// arrow the 4×4 board; two tiles of equal value that collide fuse into their
	// sum and bank that sum as score. After any move that changed the board a new
	// tile spawns (a 2, or a 4 one time in ten). The board seeds two 2-tiles side
	// by side, so the very first horizontal swipe always merges — the deterministic
	// early score the playtest hangs on. Reaching 2048 rings a chime and flashes
	// gold, but play continues; the run ends only when the board is full with no
	// adjacent equals left. This is the shell's first turn-based PUZZLE — the eight
	// other games are all real-time arcade — so it sits clearly apart. Same
	// lazy-load + firstRun convention; over 5 KB so the perf build hashes it.
	var game = carny.game,
		HI = "gameland.hi.tile-2048",
		N = 4, DUR = 0.11, POP = 0.18,
		// tile fills indexed by log2(value): [_,2,4,8,16,32,64,128,256,512,1k,2k,+]
		COL = ["#cdc1b4", "#eee4da", "#ede0c8", "#f2b179", "#f59563", "#f67c5f",
			"#f65e3b", "#edcf72", "#edcc61", "#edc850", "#edc53f", "#edc22e", "#3c3a32"],
		firstRun = true, el, cv, c,
		W = 1024, H = 748, raf = 0, last = 0, ac = null, s,
		bx = 0, by = 0, side = 0, pad = 0, cell = 0;

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
	function sfxSlide() { beep(150, 0.05, "sine", 0.04, 0, 110); }
	function sfxMerge(v) { var e = Math.round(Math.log2(v)); beep(200 + e * 44, 0.09, "triangle", 0.06, 0, 320 + e * 60); }
	function sfxWin() { beep(660, 0.1, "square", 0.05); beep(880, 0.1, "square", 0.05, 0.09); beep(1320, 0.16, "sine", 0.05, 0.18); }
	function sfxOver() { beep(300, 0.5, "sawtooth", 0.09, 0, 70); }

	function loadHi() { try { return parseInt(localStorage.getItem(HI), 10) || 0; } catch (e) { return 0; } }
	function saveHi(v) { try { localStorage.setItem(HI, v); } catch (e) {} }

	// ---- board model ----
	function empty() { return [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]; }
	function addRandom() {
		var free = [], r, c2;
		for (r = 0; r < N; r++) { for (c2 = 0; c2 < N; c2++) { if (!s.grid[r][c2]) { free.push([r, c2]); } } }
		if (!free.length) { return null; }
		var p = free[(Math.random() * free.length) | 0], v = Math.random() < 0.9 ? 2 : 4;
		s.grid[p[0]][p[1]] = v;
		return { r: p[0], c: p[1], v: v };
	}
	function reset() {
		s = { grid: empty(), score: 0, best: loadHi(), anim: null, pops: {},
			over: false, won: false, winT: 0, ptr: null };
		// Two 2-tiles side by side in a random row: the opening horizontal swipe
		// always merges (deterministic first score, like the other games' free
		// first point), and it mirrors 2048's own two-tile opening.
		var r = (Math.random() * N) | 0, c0 = (Math.random() * (N - 1)) | 0;
		s.grid[r][c0] = 2; s.grid[r][c0 + 1] = 2;
	}

	// One line of the board in the order it collapses toward the move direction
	// (index 0 is the destination-most cell). dir: 0 left, 1 right, 2 up, 3 down.
	function lineCells(dir, i) {
		var arr = [], j, r, c2;
		for (j = 0; j < N; j++) {
			if (dir === 0) { r = i; c2 = j; }
			else if (dir === 1) { r = i; c2 = N - 1 - j; }
			else if (dir === 2) { r = j; c2 = i; }
			else { r = N - 1 - j; c2 = i; }
			arr.push({ r: r, c: c2, v: s.grid[r][c2] });
		}
		return arr;
	}
	function doMove(dir) {
		if (s.over || s.anim) { return; }
		var ng = empty(), slides = [], gained = 0, merges = [], mmax = 0, i, k, t, occ, dst, mv;
		for (i = 0; i < N; i++) {
			var cells = lineCells(dir, i);
			occ = [];
			for (k = 0; k < N; k++) { if (cells[k].v) { occ.push(cells[k]); } }
			t = 0; k = 0;
			while (k < occ.length) {
				dst = cells[t];
				if (k + 1 < occ.length && occ[k].v === occ[k + 1].v) {
					mv = occ[k].v * 2;
					slides.push({ v: occ[k].v, r0: occ[k].r, c0: occ[k].c, r1: dst.r, c1: dst.c });
					slides.push({ v: occ[k + 1].v, r0: occ[k + 1].r, c0: occ[k + 1].c, r1: dst.r, c1: dst.c });
					ng[dst.r][dst.c] = mv; gained += mv; merges.push(dst.r + "," + dst.c);
					if (mv > mmax) { mmax = mv; }
					k += 2;
				} else {
					slides.push({ v: occ[k].v, r0: occ[k].r, c0: occ[k].c, r1: dst.r, c1: dst.c });
					ng[dst.r][dst.c] = occ[k].v; k++;
				}
				t++;
			}
		}
		var changed = false;
		for (i = 0; i < N; i++) { for (k = 0; k < N; k++) { if (ng[i][k] !== s.grid[i][k]) { changed = true; } } }
		if (!changed) { return; }
		sfxSlide();
		s.anim = { slides: slides, t: 0, ng: ng, gained: gained, merges: merges, mmax: mmax };
	}
	function bump() {
		if (s.score > s.best) { s.best = s.score; saveHi(s.best); }
	}
	function isOver() {
		var r, c2;
		for (r = 0; r < N; r++) { for (c2 = 0; c2 < N; c2++) { if (!s.grid[r][c2]) { return false; } } }
		for (r = 0; r < N; r++) {
			for (c2 = 0; c2 < N; c2++) {
				if (c2 < N - 1 && s.grid[r][c2] === s.grid[r][c2 + 1]) { return false; }
				if (r < N - 1 && s.grid[r][c2] === s.grid[r + 1][c2]) { return false; }
			}
		}
		return true;
	}
	function commit() {
		var a = s.anim, i, won = false;
		s.anim = null; s.grid = a.ng;
		if (a.gained) { s.score += a.gained; bump(); sfxMerge(a.mmax); }
		for (i = 0; i < a.merges.length; i++) { s.pops[a.merges[i]] = { t: 1, k: 0 }; }
		var sp = addRandom();
		if (sp) { s.pops[sp.r + "," + sp.c] = { t: 1, k: 1 }; }
		if (!s.won) {
			for (i = 0; i < N; i++) { if (s.grid[i].indexOf(2048) >= 0) { won = true; } }
			if (won) { s.won = true; s.winT = 1; sfxWin(); }
		}
		if (isOver()) { s.over = true; sfxOver(); saveHi(s.best); }
	}

	// ---- input ----
	function onKey(e) {
		if (!active() || !s) { return; }
		var k = e.key, dir = -1;
		if (k === "ArrowLeft" || k === "a" || k === "A") { dir = 0; }
		else if (k === "ArrowRight" || k === "d" || k === "D") { dir = 1; }
		else if (k === "ArrowUp" || k === "w" || k === "W") { dir = 2; }
		else if (k === "ArrowDown" || k === "s" || k === "S") { dir = 3; }
		var restart = k === " " || k === "Spacebar" || k === "Enter";
		if (dir < 0 && !restart) { return; }
		e.preventDefault(); unlockAudio();
		if (s.over) { if (dir >= 0 || restart) { reset(); } return; }
		if (dir >= 0) { doMove(dir); }
	}
	function onDown(e) {
		e.preventDefault(); unlockAudio();
		if (s) { s.ptr = { x: e.clientX, y: e.clientY }; }
	}
	function onUp(e) {
		if (!s || !s.ptr) { return; }
		var dx = e.clientX - s.ptr.x, dy = e.clientY - s.ptr.y;
		s.ptr = null;
		if (s.over) { reset(); return; }
		var ax = Math.abs(dx), ay = Math.abs(dy), thr = Math.min(W, H) * 0.05;
		if (Math.max(ax, ay) < thr) { return; }
		doMove(ax > ay ? (dx < 0 ? 0 : 1) : (dy < 0 ? 2 : 3));
	}

	// ---- update ----
	function update(dt) {
		var keys = Object.keys(s.pops), i, p;
		for (i = 0; i < keys.length; i++) {
			p = s.pops[keys[i]]; p.t -= dt / POP;
			if (p.t <= 0) { delete s.pops[keys[i]]; }
		}
		if (s.winT > 0) { s.winT = Math.max(0, s.winT - dt); }
		if (s.anim) { s.anim.t += dt / DUR; if (s.anim.t >= 1) { commit(); } }
	}

	// ---- rendering ----
	function layout() {
		W = window.innerWidth || 1024; H = window.innerHeight || 748;
		var m = Math.min(W, H) * 0.04, top = Math.min(H * 0.22, 150);
		side = Math.max(120, Math.min(W - m * 2, H - top - m));
		bx = (W - side) / 2; by = top;
		pad = side * 0.028; cell = (side - pad * (N + 1)) / N;
	}
	function cellX(c2) { return bx + pad + c2 * (cell + pad); }
	function cellY(r) { return by + pad + r * (cell + pad); }
	function rrect(x, y, w, h, r) {
		c.beginPath();
		if (c.roundRect) { c.roundRect(x, y, w, h, r); return; }
		c.moveTo(x + r, y);
		c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
		c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
	}
	function tile(x, y, v, sc) {
		var str = "" + v, r = cell * 0.09;
		c.save(); c.translate(x + cell / 2, y + cell / 2);
		if (sc !== 1) { c.scale(sc, sc); }
		c.fillStyle = COL[Math.min(Math.round(Math.log2(v)), 12)];
		rrect(-cell / 2, -cell / 2, cell, cell, r); c.fill();
		c.fillStyle = v <= 4 ? "#776e65" : "#f9f6f2";
		c.font = "700 " + cell * (str.length >= 4 ? 0.3 : str.length === 3 ? 0.38 : 0.46) + "px Roboto, sans-serif";
		c.textAlign = "center"; c.textBaseline = "middle";
		c.fillText(str, 0, cell * 0.03);
		c.restore();
	}
	function stat(x, y, w, h, lab, val) {
		c.fillStyle = "#bbada0"; rrect(x, y, w, h, h * 0.16); c.fill();
		c.textAlign = "center";
		c.fillStyle = "#eee4da"; c.font = "700 " + h * 0.26 + "px Roboto, sans-serif"; c.textBaseline = "top";
		c.fillText(lab, x + w / 2, y + h * 0.16);
		c.fillStyle = "#fff"; c.font = "700 " + h * 0.42 + "px Roboto, sans-serif"; c.textBaseline = "alphabetic";
		c.fillText("" + val, x + w / 2, y + h * 0.86);
	}
	function hud() {
		var ph = Math.min(by * 0.7, 66), pw = Math.max(78, side * 0.25), py = (by - ph) / 2, gap = pw * 0.08;
		c.fillStyle = s.won ? "#edc22e" : "#776e65"; c.textAlign = "left"; c.textBaseline = "middle";
		c.font = "700 " + Math.min(by * 0.5, side * 0.16) + "px Roboto, sans-serif";
		c.fillText("2048", bx, by / 2);
		stat(bx + side - pw, py, pw, ph, "SCORE", s.score);
		stat(bx + side - pw * 2 - gap, py, pw, ph, "BEST", s.best);
	}
	function overlay() {
		c.fillStyle = "rgba(250,248,239,0.76)"; rrect(bx, by, side, side, side * 0.02); c.fill();
		c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "#776e65";
		c.font = "700 " + side * 0.11 + "px Roboto, sans-serif"; c.fillText("Game Over", bx + side / 2, by + side * 0.4);
		c.font = "700 " + side * 0.055 + "px Roboto, sans-serif"; c.fillText("Score " + s.score, bx + side / 2, by + side * 0.52);
		c.font = "500 " + side * 0.044 + "px Roboto, sans-serif"; c.fillStyle = "#8f7a66";
		c.fillText("Tap / Space for a new game", bx + side / 2, by + side * 0.62);
	}
	function render() {
		layout();
		c.fillStyle = "#faf8ef"; c.fillRect(0, 0, W, H);
		hud();
		c.fillStyle = "#bbada0"; rrect(bx, by, side, side, side * 0.02); c.fill();
		var r, c2, x, y, v, key, p, sc, i;
		for (r = 0; r < N; r++) {
			for (c2 = 0; c2 < N; c2++) {
				c.fillStyle = "rgba(238,228,218,0.35)";
				rrect(cellX(c2), cellY(r), cell, cell, cell * 0.09); c.fill();
			}
		}
		if (s.anim) {
			var tt = s.anim.t, e = tt * tt * (3 - 2 * tt);
			for (i = 0; i < s.anim.slides.length; i++) {
				var sl = s.anim.slides[i];
				tile(cellX(sl.c0) + (cellX(sl.c1) - cellX(sl.c0)) * e,
					cellY(sl.r0) + (cellY(sl.r1) - cellY(sl.r0)) * e, sl.v, 1);
			}
		} else {
			for (r = 0; r < N; r++) {
				for (c2 = 0; c2 < N; c2++) {
					v = s.grid[r][c2]; if (!v) { continue; }
					key = r + "," + c2; p = s.pops[key]; sc = 1;
					if (p) { sc = p.k ? 1 - 0.6 * p.t : 1 + 0.16 * p.t; }
					tile(cellX(c2), cellY(r), v, sc);
				}
			}
		}
		if (s.winT > 0) {
			c.fillStyle = "rgba(237,194,46," + (s.winT * 0.45) + ")"; rrect(bx, by, side, side, side * 0.02); c.fill();
			c.fillStyle = "#fff"; c.textAlign = "center"; c.textBaseline = "middle";
			c.font = "700 " + side * 0.12 + "px Roboto, sans-serif";
			c.fillText("2048!", bx + side / 2, by + side / 2);
		}
		if (s.score === 0 && !s.anim) {
			c.fillStyle = "#8f7a66"; c.textAlign = "center"; c.textBaseline = "middle";
			c.font = "500 " + Math.min(side * 0.05, 26) + "px Roboto, sans-serif";
			c.fillText("Swipe or use the arrow keys", W / 2, by + side + (H - by - side) * 0.28);
		}
		if (s.over) { overlay(); }
	}

	function active() { return !!(el && el.classList.contains("active")); }
	function frame(ts) {
		if (!active()) { raf = 0; return; }
		var dt = last ? Math.min((ts - last) / 1000, 0.033) : 0;
		last = ts; update(dt); render();
		raf = requestAnimationFrame(frame);
	}
	function begin() {
		layout(); reset(); last = 0;
		if (raf) { cancelAnimationFrame(raf); }
		raf = requestAnimationFrame(frame);
	}
	function size() { layout(); if (cv) { cv.width = W; cv.height = H; } }
	function setup() {
		el = document.getElementById("tile-2048");
		cv = document.createElement("canvas");
		cv.setAttribute("aria-label", "2048 slide and merge puzzle");
		cv.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:100vh;display:block;z-index:15;touch-action:none;cursor:pointer;background:#faf8ef";
		el.appendChild(cv); c = cv.getContext("2d");
		size();

		var back = document.createElement("button");
		back.type = "button"; back.textContent = "← BACK";
		back.style.cssText = "position:fixed;left:14px;bottom:14px;z-index:20;font:bold 20px Roboto,sans-serif;color:#fff;background:#8f7a66;border:0;border-radius:8px;padding:10px 20px;cursor:pointer";
		back.addEventListener("click", function () { game.showScreen("main-menu"); });
		el.appendChild(back);

		cv.addEventListener("pointerdown", onDown);
		cv.addEventListener("pointerup", onUp);
		cv.addEventListener("pointercancel", function () { if (s) { s.ptr = null; } });
		document.addEventListener("keydown", onKey);
		window.addEventListener("resize", size);
	}

	function run() {
		if (firstRun) { setup(); firstRun = false; }
		begin();
	}

	return { run: run };
}());
