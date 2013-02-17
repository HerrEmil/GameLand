carny.game = (function () {
	var dom = carny.dom,
		$ = dom.$;

	// Hide the active screen (if any) and show the screen
	// with the specified ID
	function showScreen(screenId) {
		var activeScreen = $("#game .screen.active")[0],
			screen = $("#" + screenId)[0];

		if (activeScreen) {
			dom.removeClass(screen, "active");
		}

		dom.addClass(screen, "active");
	}
	//  Expose public methods
	return {
		showScreen : showScreen
	};
}());