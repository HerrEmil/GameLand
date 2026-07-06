// Runs last of the deferred scripts, after all modules have registered.
(function () {
	var standalone = window.navigator.standalone !== false;
	carny.game.setup();
	carny.game.showScreen(standalone ? "splash-screen" : "install-screen");
}());
