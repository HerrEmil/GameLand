carny.screens["game4"] = (function () {
	// Tower Stack — a one-button precision stacker (screen id "game4"). A slab
	// slides back and forth above the tower; tap / press to drop it. Whatever
	// overhangs the block below is sliced off and tumbles away, so a sloppy drop
	// shrinks the next slab and a clean one keeps it wide. A pixel-perfect stack
	// regrows a sliver and rings a rising chime. Miss the tower entirely and it
	// falls. Slabs slide faster the higher you climb. Same lazy-load + firstRun
	// convention as the other screens; over 5 KB so the perf build hashes it.
	var game = carny.game,
		HI = "gameland.hi.game4",
		firstRun = true, el, cv, c,
		W = 1024, H = 748,
		raf = 0, last = 0, ac = null, s, camY = 0,
		PERF = 5, REGROW = 7;               // perfect-drop tolerance / width regained

	// ---- audio (gesture-gated, same pattern as the sibling games) ----
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
	function sfxPlace() { beep(240, 0.09, "square", 0.06); }
	function sfxPerfect(combo) { var b = 520 + Math.min(combo, 8) * 90; beep(b, 0.08, "triangle", 0.08); beep(b * 1.5, 0.09, "sine", 0.05, 0.04); }
	function sfxDrop() { beep(300, 0.12, "sine", 0.05); }
	function sfxCrash() { beep(150, 0.3, "sawtooth", 0.16); beep(64, 0.44, "triangle", 0.13, 0.05); }

	function loadHi() { try { return parseInt(localStorage.getItem(HI), 10) || 0; } catch (e) { return 0; } }

	// Board metrics scale with the viewport so it plays the same on phone or desktop.
	var bh, margin, baseW;
	function metrics() {
		bh = Math.max(24, Math.min(46, H * 0.05));
		margin = Math.max(12, Math.min(60, W * 0.06));
		baseW = Math.max(140, Math.min(420, W * 0.42));
	}

	// Slide speed climbs with tower height — the whole difficulty curve.
	function speed(level) { return Math.min(W * 1.15, W * 0.34 + level * W * 0.028); }

	// World y (0 = top) of the top edge of a slab at stack index i (0 = base).
	// The base sits near the bottom; the tower grows upward into negative-ish y
	// and the camera scrolls once the live slab climbs past ~28% of the screen.
	function worldY(i) { return H - bh - (i + 1) * bh; }
	function screenY(i) { return worldY(i) + camY; }

	function reset() {
		metrics();
		s = {
			over: false, started: false, record: false, score: 0, combo: 0,
			best: loadHi(), flash: 0, shards: [],
			blocks: [{ x: (W - baseW) / 2, w: baseW }],
			mv: null, mvSpeed: 0
		};
		camY = 0;
		newSlab();
	}

	function newSlab() {
		var top = s.blocks[s.blocks.length - 1];
		s.mv = { x: margin, w: top.w, dir: 1 };
		s.mvSpeed = speed(s.blocks.length);
	}

	function hue(i) { return (198 + i * 15) % 360; }

	function addShard(x, w, from) {
		s.shards.push({ x: x, y: screenY(s.blocks.length), w: w, h: bh,
			vx: (from < 0 ? -1 : 1) * (W * 0.12 + Math.random() * W * 0.1),
			vy: -H * 0.12, rot: 0, vr: (from < 0 ? -1 : 1) * 5, a: 1, c: hue(s.blocks.length - 1) });
	}

	function crash() {
		if (s.over) { return; }
		s.over = true; s.mv = null; s.combo = 0; sfxCrash();
		s.record = s.score > s.best;
		if (s.record) { s.best = s.score; try { localStorage.setItem(HI, s.score); } catch (e) {} }
	}

	function drop() {
		var top = s.blocks[s.blocks.length - 1], mv = s.mv,
			l = Math.max(mv.x, top.x), r = Math.min(mv.x + mv.w, top.x + top.w), ov = r - l;
		if (ov <= 0) { sfxDrop(); crash(); return; }
		var nx = l, nw = ov;
		if (Math.abs(mv.x - top.x) <= PERF) {           // pixel-perfect: snap + regrow a sliver
			nw = Math.min(top.w + REGROW, baseW);
			nx = Math.max(margin, Math.min(top.x - (nw - top.w) / 2, W - margin - nw));
			s.combo++; s.flash = 0.6; sfxPerfect(s.combo);
		} else {                                        // trim: the overhang tumbles off
			var cut = mv.w - nw;
			addShard(mv.x < top.x ? mv.x : r, cut, mv.x < top.x ? -1 : 1);
			s.combo = 0; sfxPlace();
		}
		s.blocks.push({ x: nx, w: nw });
		s.score++;
		newSlab();
	}

	function update(dt) {
		if (s.flash > 0) { s.flash = Math.max(0, s.flash - dt); }
		// Slide the live slab and bounce it off the play-area edges.
		if (s.started && !s.over && s.mv) {
			var mv = s.mv;
			mv.x += mv.dir * s.mvSpeed * dt;
			if (mv.x < margin) { mv.x = margin; mv.dir = 1; }
			var hi = W - margin - mv.w;
			if (mv.x > hi) { mv.x = hi; mv.dir = -1; }
		}
		// Ease the camera so the live slab holds near 28% down once we climb.
		var target = Math.max(0, H * 0.28 - worldY(s.blocks.length));
		camY += (target - camY) * Math.min(1, dt * 9);
		// Falling debris.
		for (var i = s.shards.length - 1; i >= 0; i--) {
			var sh = s.shards[i];
			sh.vy += H * 2.4 * dt; sh.x += sh.vx * dt; sh.y += sh.vy * dt;
			sh.rot += sh.vr * dt; sh.a -= dt * 0.8;
			if (sh.a <= 0 || sh.y > H + 80) { s.shards.splice(i, 1); }
		}
	}

	function bg() {
		var g = c.createLinearGradient(0, 0, 0, H);
		g.addColorStop(0, "#141d3a"); g.addColorStop(0.55, "#1d2b52"); g.addColorStop(1, "#0e1428");
		c.fillStyle = g; c.fillRect(0, 0, W, H);
	}
	function slab(x, y, w, h, hu, live) {
		c.fillStyle = "hsl(" + hu + ",64%," + (live ? 62 : 55) + "%)";
		c.fillRect(x, y, w, h);
		c.fillStyle = "rgba(255,255,255,0.18)"; c.fillRect(x, y, w, Math.min(4, h * 0.18));
		c.fillStyle = "rgba(0,0,0,0.22)"; c.fillRect(x, y + h - Math.min(4, h * 0.18), w, Math.min(4, h * 0.18));
	}
	function render() {
		bg();
		for (var i = 0; i < s.blocks.length; i++) {
			var y = screenY(i);
			if (y > H + bh || y < -bh) { continue; }
			slab(s.blocks[i].x, y, s.blocks[i].w, bh, hue(i), false);
		}
		if (s.mv && !s.over) {
			slab(s.mv.x, screenY(s.blocks.length), s.mv.w, bh, hue(s.blocks.length), true);
		}
		for (var j = 0; j < s.shards.length; j++) {
			var sh = s.shards[j];
			c.save(); c.globalAlpha = Math.max(0, sh.a);
			c.translate(sh.x + sh.w / 2, sh.y + sh.h / 2); c.rotate(sh.rot);
			c.fillStyle = "hsl(" + sh.c + ",64%,55%)"; c.fillRect(-sh.w / 2, -sh.h / 2, sh.w, sh.h);
			c.restore();
		}
		hud();
		if (!s.started && !s.over) { prompt(); }
		if (s.over) { over(); }
	}
	function hud() {
		var fs = Math.max(20, Math.min(34, W / 22));
		c.textBaseline = "top"; c.font = "bold " + fs + "px Roboto, sans-serif"; c.textAlign = "left";
		c.fillStyle = "#eaf0ff"; c.fillText("HEIGHT " + s.score, 20, 14);
		c.textAlign = "right"; c.fillStyle = "#a9b8ff"; c.fillText("BEST " + s.best, W - 20, 14);
		if (s.combo > 1 && s.flash > 0) {
			c.textAlign = "center"; c.globalAlpha = Math.min(1, s.flash * 2);
			c.fillStyle = "#ffe066"; c.font = "bold " + Math.min(30, W / 24) + "px Roboto, sans-serif";
			c.fillText("PERFECT ×" + s.combo, W / 2, 20); c.globalAlpha = 1;
		}
	}
	function prompt() {
		c.textAlign = "center"; c.textBaseline = "middle";
		c.fillStyle = "#eaf0ff"; c.font = "600 " + Math.min(36, W / 19) + "px Roboto, sans-serif";
		c.fillText("Tap to start", W / 2, H * 0.34);
		c.fillStyle = "#a9b8ff"; c.font = "500 " + Math.min(22, W / 30) + "px Roboto, sans-serif";
		c.fillText("Tap to drop each slab — stack it high", W / 2, H * 0.34 + 46);
	}
	function over() {
		var cx = W / 2;
		c.fillStyle = "rgba(8,12,28,0.8)"; c.fillRect(0, 0, W, H);
		c.textAlign = "center"; c.textBaseline = "middle";
		c.fillStyle = "#ff9fb0"; c.font = "bold 72px Roboto, sans-serif"; c.fillText("TOPPLED", cx, H * 0.34);
		c.fillStyle = "#fff"; c.font = "bold 44px Roboto, sans-serif"; c.fillText("Height  " + s.score, cx, H * 0.47);
		c.fillStyle = s.record ? "#ffe066" : "#c2ccff"; c.font = "bold 30px Roboto, sans-serif";
		c.fillText((s.record ? "★ NEW BEST  " : "Best  ") + s.best, cx, H * 0.56);
		c.fillStyle = "#eaf0ff"; c.font = "26px Roboto, sans-serif"; c.fillText("Tap or press Space to rebuild", cx, H * 0.69);
	}

	function active() { return !!(el && el.classList.contains("active")); }
	function frame(ts) {
		if (!active()) { raf = 0; return; }                  // stop the loop when hidden
		var dt = last ? Math.min((ts - last) / 1000, 0.033) : 0;
		last = ts; update(dt); render();
		raf = requestAnimationFrame(frame);
	}
	function begin() {
		size(); reset(); last = 0;
		if (raf) { cancelAnimationFrame(raf); }
		raf = requestAnimationFrame(frame);
	}

	function action() {
		unlockAudio();
		if (!s) { return; }
		if (s.over) { reset(); return; }                     // first tap after a fall rebuilds
		if (!s.started) { s.started = true; return; }        // then the slab starts sliding
		drop();
	}

	function isDropKey(k) { return k === " " || k === "Spacebar" || k === "ArrowUp" || k === "w" || k === "W" || k === "Enter"; }
	function onKey(e) {
		if (!active() || !s) { return; }
		if (isDropKey(e.key)) { if (!e.repeat) { action(); } e.preventDefault(); }
	}

	function size() {
		W = window.innerWidth || 1024; H = window.innerHeight || 748;
		if (cv) { cv.width = W; cv.height = H; }
		if (s) { metrics(); }
	}
	function setup() {
		el = document.getElementById("game4");
		cv = document.createElement("canvas");
		cv.setAttribute("aria-label", "Tower Stack stacking game");
		cv.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:100vh;display:block;z-index:15;touch-action:none;cursor:pointer;background:#141d3a";
		el.appendChild(cv); c = cv.getContext("2d"); size();

		var back = document.createElement("button");
		back.type = "button"; back.textContent = "← BACK";
		back.style.cssText = "position:fixed;left:14px;bottom:14px;z-index:20;font:bold 20px Roboto,sans-serif;color:#fff;background:#2a356b;border:0;border-radius:8px;padding:10px 20px;cursor:pointer";
		back.addEventListener("click", function () { game.showScreen("main-menu"); });
		el.appendChild(back);

		cv.addEventListener("pointerdown", function (e) { e.preventDefault(); action(); });
		document.addEventListener("keydown", onKey);
		window.addEventListener("resize", size);
	}

	function run() {
		if (firstRun) { setup(); firstRun = false; }
		begin();
	}

	return { run: run };
}());
