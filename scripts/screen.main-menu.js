carny.screens["main-menu"] = (function () {
	var dom = carny.dom,
		game = carny.game,
		firstRun = true;

	function setup() {
		dom.bind("#main-menu", "click", function (e) {
			// Click button to display screen with same name as button
			if (e.target.nodeName.toLowerCase() === "button") {
				var action = e.target.getAttribute("name");
				game.showScreen(action);
			}
		});
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