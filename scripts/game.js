carny.game = (function () {
	var dom = carny.dom;

	function showScreen(screenId) {
		var activeScreen = document.querySelector("#game .screen.active"),
			screen = document.getElementById(screenId);
		if (activeScreen) {
			dom.removeClass(activeScreen, "active");
		}
		carny.screens[screenId].run();
		dom.addClass(screen, "active");
	}

	function setup() {
		dom.bind(document, "touchmove", function (event) {
			event.preventDefault();
		});
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
