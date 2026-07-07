carny.screens["splash-screen"] = (function () {
	var game = carny.game,
		firstRun = true;

	function setup() {
		document.querySelector("#splash-screen").addEventListener("click", function () {
			game.showScreen("main-menu");
		}, false);
	}

	function run() {
		if (firstRun) {
			setup();
			firstRun = false;
		}
	}

	return {
		run : run
	};
}());