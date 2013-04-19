carny.game = (function () {
	var dom = carny.dom,
		$ = dom.$;

	function setup() {
		// disable native touchmove behavior to prevent overscroll
		dom.bind(document, "touchmove", function(event) {
			event.preventDefault();
		});

		// hide the address bar on Android devices
		if (/Android/.test(navigator.userAgent)) {
			$("html")[0].style.height = "200%";
			setTimeout(function() {
				window.scrollTo(0,1);
			}, 0);
		}
	}
	// Hide the active screen (if any) and show the screen
	// with the specified ID
	function showScreen(screenId) {
		var activeScreen = $("#game .screen.active")[0],
			screen = $("#" + screenId)[0];

		// Hide old screen html
		if (activeScreen) {
			dom.removeClass(activeScreen, "active");
		}

		// Run the screen module
		carny.screens[screenId].run();

		//  Display the screen html
		dom.addClass(screen, "active");
	}
	//  Expose public methods
	return {
		showScreen : showScreen,
		setup : setup
	};
}());