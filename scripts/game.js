window.carny = { screens: {} };

carny.game = (function () {
	// Screen scripts are loaded on first use so each game (potentially a large
	// chunk) is only fetched when the player navigates to it. The script for
	// screen id X lives at scripts/screen.X.js and registers carny.screens[X].
	// The perf build content-hashes any asset over 5 KB, so scripts larger than
	// that are renamed to scripts/screen.X.<hash>.js in dist. asset-manifest.json
	// maps the plain path to the hashed one; we consult it (once, cached) so a
	// large game chunk resolves to its real filename instead of 404-ing. When no
	// manifest is present (unbuilt dev tree, small unhashed scripts) we fall back
	// to the plain path.
	var loading = {},
		manifest;

	function loadManifest() {
		if (!manifest) {
			manifest = fetch("asset-manifest.json").then(function (r) {
				return r.ok ? r.json() : {};
			}).catch(function () {
				return {};
			});
		}
		return manifest;
	}

	function loadScreen(screenId) {
		if (carny.screens[screenId]) {
			return Promise.resolve();
		}
		if (!loading[screenId]) {
			loading[screenId] = loadManifest().then(function (map) {
				return new Promise(function (resolve, reject) {
					var path = "scripts/screen." + screenId + ".js",
						s = document.createElement("script");
					s.src = map[path] || path;
					s.onload = resolve;
					s.onerror = function (err) {
						delete loading[screenId];
						reject(err);
					};
					document.head.appendChild(s);
				});
			});
		}
		return loading[screenId];
	}

	function showScreen(screenId) {
		loadScreen(screenId).then(function () {
			var activeScreen = document.querySelector("#game .screen.active"),
				screen = document.getElementById(screenId);
			if (activeScreen) {
				activeScreen.classList.remove("active");
			}
			carny.screens[screenId].run();
			screen.classList.add("active");
		}).catch(function (err) {
			console.error("game: failed to show screen '" + screenId + "'", err);
		});
	}

	function setup() {
		document.addEventListener("touchmove", function (event) {
			event.preventDefault();
		}, false);
		if (/Android/.test(navigator.userAgent)) {
			document.documentElement.style.height = "200%";
			setTimeout(function () {
				window.scrollTo(0, 1);
			}, 0);
		}
	}

	return {
		setup: setup,
		loadScreen: loadScreen,
		showScreen: showScreen
	};
}());

// Boot. This script is deferred, so the screen elements exist by now.
(function () {
	var standalone = window.navigator.standalone !== false;
	carny.game.setup();
	carny.game.showScreen(standalone ? "splash-screen" : "install-screen");
	if (standalone) {
		// Warm the main-menu script while the player sits on the splash screen.
		carny.game.loadScreen("main-menu").catch(function () {});
	}
}());
