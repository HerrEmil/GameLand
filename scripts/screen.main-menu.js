carny.screens["main-menu"] = (function () {
	var game = carny.game,
		firstRun = true;

	function setup() {
		document.querySelector("#main-menu").addEventListener("click", function (e) {
			// Click button to display screen with same name as button
			if (e.target.nodeName.toLowerCase() === "button") {
				var action = e.target.getAttribute("name");
				game.showScreen(action);
			}
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