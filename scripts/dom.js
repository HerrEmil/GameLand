carny.dom = (function () {
	function bind(element, event, handler) {
		if (typeof element === "string") {
			element = document.querySelector(element);
		}
		element.addEventListener(event, handler, false);
	}

	return {
		bind: bind
	};
}());
