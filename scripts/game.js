window.carny = { screens: {} };

carny.game = (function () {
	// Screen scripts are loaded on first use so each game (potentially a large
	// chunk) is only fetched when the player navigates to it. The script for
	// screen id X lives at scripts/screen.X.js and registers carny.screens[X].
	var loading = {};

	function loadScreen(screenId) {
		if (carny.screens[screenId]) {
			return Promise.resolve();
		}
		if (!loading[screenId]) {
			loading[screenId] = new Promise(function (resolve, reject) {
				var s = document.createElement("script");
				s.src = "scripts/screen." + screenId + ".js";
				s.onload = resolve;
				s.onerror = function (err) {
					delete loading[screenId];
					reject(err);
				};
				document.head.appendChild(s);
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
