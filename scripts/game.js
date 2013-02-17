carny.game = (function () {
	var dom = carny.dom,
		$ = dom.$;

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
		showScreen : showScreen
	};
}());