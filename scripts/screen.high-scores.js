carny.screens["high-scores"] = (function () {
	// Renders every persisted best score (localStorage "gameland.hi.<game>")
	// as a ranked list. Re-reads storage on each run() so a fresh best from a
	// game just played shows immediately.
	var game = carny.game,
		PREFIX = "gameland.hi.",
		NAMES = {
			"bear-hunt": "Bear Hunt",
			"snake": "Snake",
			"game2": "Block Breaker",
			"game3": "Cave Flyer",
			"game4": "Tower Stack",
			"road-cross": "Road Cross",
			"dash-run": "Dash Run",
			"sky-hopper": "Sky Hopper",
			"tile-2048": "2048",
			"star-blaster": "Star Blaster",
			"tetra": "Tetra",
			"missile-command": "Missile Command",
			"astro-drift": "Astro Drift"
		},
		firstRun = true,
		el, list, empty;

	function esc(s) {
		return String(s).replace(/[&<>]/g, function (c) {
			return c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;";
		});
	}

	function label(id) {
		return NAMES[id] || id.replace(/-/g, " ").replace(/\b\w/g, function (c) {
			return c.toUpperCase();
		});
	}

	function readScores() {
		var rows = [];
		try {
			for (var i = 0; i < localStorage.length; i++) {
				var k = localStorage.key(i);
				if (k && k.indexOf(PREFIX) === 0) {
					rows.push({
						name: label(k.slice(PREFIX.length)),
						score: parseInt(localStorage.getItem(k), 10) || 0
					});
				}
			}
		} catch (e) { /* storage may be unavailable */ }
		rows.sort(function (a, b) { return b.score - a.score; });
		return rows;
	}

	function setup() {
		el = document.getElementById("high-scores");

		var style = document.createElement("style");
		style.textContent =
			"#high-scores{color:#3a2c15;text-align:center;font-family:Roboto,sans-serif}" +
			"#high-scores h1{font-size:56px;margin:48px 0 8px;letter-spacing:2px}" +
			"#high-scores .hs-list{list-style:none;padding:0;max-width:520px;margin:24px auto}" +
			"#high-scores .hs-list li{display:flex;justify-content:space-between;" +
			"align-items:baseline;font-size:30px;padding:12px 24px;border-bottom:2px solid rgba(90,58,28,.18)}" +
			"#high-scores .hs-rank{color:#a07b3c;font-weight:bold;width:48px;text-align:left}" +
			"#high-scores .hs-name{flex:1;text-align:left}" +
			"#high-scores .hs-score{font-weight:bold;font-variant-numeric:tabular-nums}" +
			"#high-scores .hs-empty{font-size:26px;margin-top:64px;color:#7a6a4a}" +
			"#high-scores .hs-back{position:absolute;left:14px;bottom:14px;font:bold 20px Roboto,sans-serif;" +
			"color:#fff;background:#5a3a1c;border:0;border-radius:8px;padding:10px 20px;cursor:pointer}";
		el.appendChild(style);

		var h1 = document.createElement("h1");
		h1.textContent = "HIGH SCORES";
		el.appendChild(h1);

		empty = document.createElement("p");
		empty.className = "hs-empty";
		empty.textContent = "No scores yet — go play a game!";
		el.appendChild(empty);

		list = document.createElement("ul");
		list.className = "hs-list";
		el.appendChild(list);

		var back = document.createElement("button");
		back.type = "button";
		back.className = "hs-back";
		back.textContent = "← BACK";
		back.addEventListener("click", function () { game.showScreen("main-menu"); });
		el.appendChild(back);
	}

	function render() {
		var rows = readScores();
		empty.style.display = rows.length ? "none" : "block";
		list.style.display = rows.length ? "block" : "none";
		var html = "";
		for (var i = 0; i < rows.length; i++) {
			html += "<li><span class=\"hs-rank\">" + (i + 1) + "</span>" +
				"<span class=\"hs-name\">" + esc(rows[i].name) + "</span>" +
				"<span class=\"hs-score\">" + rows[i].score + "</span></li>";
		}
		list.innerHTML = html;
	}

	function run() {
		if (firstRun) {
			setup();
			firstRun = false;
		}
		render();
	}

	return {
		run: run
	};
}());
