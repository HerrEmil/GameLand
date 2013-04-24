carny.game = (function () {
	var dom = carny.dom,
		$ = dom.$;

	// hide the active screen (if any) and show the screen
	// with the specified id
	function showScreen(screenId) {
		var activeScreen = $("#game .screen.active")[0],
			screen = $("#" + screenId)[0];
		if (activeScreen) {
			dom.removeClass(activeScreen, "active");
		}
		// Run the screen module
		carny.screens[screenId].run();

		dom.addClass(screen, "active");
	}
	// Called once at start
	function setup() {
		//Disable native touch move behavior to prevent overscroll

		dom.bind(document, "touchmove", function (event) {
			event.preventDefault();
		});
		// Hide the address bar on Android devices
		if (/Android/.test(navigator.userAgent)) {
			$("html")[0].style.height = "200%";
			setTimeout(function () {
				window.scrollTo(0, 1);
			}, 0);
		}
	}
	// expose public methods
	return {
		setup : setup,
		showScreen : showScreen
	};
}());