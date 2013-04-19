// Using the namespace carny, just because it's shorter than gameland
var carny = {
	screens : {}
};

// Wait until main document is loaded
window.addEventListener("load", function () {
	// Test if the game is running on an iOS app but not as a web app
	Modernizr.addTest("standalone", function () {
		return (window.navigator.standalone !== false);
	});
	// loading stage 1
	Modernizr.load([
		{
			// These files are always loaded
			load : [
				"scripts/sizzle.js",
				"scripts/dom.js",
				"scripts/game.js"
			]
		},
		{
			test : Modernizr.standalone,
			yep : "scripts/screen.splash.js",
			nope : "scripts/screen.splash-install.js",
			complete : function () {
				jewel.game.setup();
				if (Modernizr.standalone) {
					carny.game.showScreen("splash-screen");
				} else {
					carny.game.showScreen("install-screen");
				}
			}
		}
	]);
	// loading stage 2
	if (Modernizr.standalone) {
		Modernizr.load([
			{
				load : ["scripts/screen.main-menu.js"]
			}
		]);
	}
}, false);