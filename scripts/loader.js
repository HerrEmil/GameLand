// Bootstrap entry: namespace + sequential script loader.
// Runs without external feature-detection or selector libs.
window.carny = window.carny || { screens: {} };

(function () {
	function loadScript(src) {
		return new Promise(function (resolve, reject) {
			var s = document.createElement("script");
			s.src = src;
			s.async = false;
			s.onload = resolve;
			s.onerror = reject;
			document.head.appendChild(s);
		});
	}

	function isStandalone() {
		return window.navigator.standalone !== false;
	}

	window.addEventListener("load", function () {
		Promise.all([
			loadScript("scripts/dom.js"),
			loadScript("scripts/game.js")
		]).then(function () {
			var splashSrc = isStandalone()
				? "scripts/screen.splash.js"
				: "scripts/screen.splash-install.js";
			return loadScript(splashSrc);
		}).then(function () {
			carny.game.setup();
			carny.game.showScreen(isStandalone() ? "splash-screen" : "install-screen");
			if (isStandalone()) {
				return loadScript("scripts/screen.main-menu.js");
			}
		}).catch(function (err) {
			console.error("loader: failed to load script", err);
		});
	}, false);
}());
