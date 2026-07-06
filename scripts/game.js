carny.game = (function () {
	// Screen scripts are loaded on first use so each game (potentially a large
	// chunk) is only fetched when the player navigates to it. Add a screenId ->
	// src entry here when you add a screen.
	var sources = {
		"splash-screen": "scripts/screen.splash.js",
		"install-screen": "scripts/screen.splash-install.js",
		"main-menu": "scripts/screen.main-menu.js"
	};

	function loadScreen(screenId) {
		if (carny.screens[screenId]) {
			return Promise.resolve();
		}
		var src = sources[screenId];
		if (!src) {
			return Promise.reject(new Error("Unknown screen: " + screenId));
		}
		return new Promise(function (resolve, reject) {
			var s = document.createElement("script");
			s.src = src;
			s.onload = resolve;
			s.onerror = reject;
			document.head.appendChild(s);
		});
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
		showScreen: showScreen
	};
}());
