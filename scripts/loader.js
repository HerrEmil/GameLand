// Using the namespace carny, just because it's shorter than gameland
var carny = {
	screens : {}
};

// Wait until main document is loaded
window.addEventListener("load", function () {
	// Start dynamic loading
	Modernizr.load([
		{
			// These files are always loaded
			load : [
				"scripts/sizzle.js",
				"scripts/dom.js",
				"scripts/game.js",
				"scripts/screen.splash.js",
				"scripts/screen.main-menu.js"
			],
			//  Called when all files have finished loading and executing
			complete : function () {
				// console.log("All files loaded!");
				carny.game.showScreen("splash-screen");
			}
		}
	]);
}, false);