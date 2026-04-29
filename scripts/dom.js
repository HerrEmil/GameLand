carny.dom = (function () {
	function $(selector) {
		return document.querySelectorAll(selector);
	}

	function hasClass(el, clsName) {
		return el.classList.contains(clsName);
	}

	function addClass(el, clsName) {
		el.classList.add(clsName);
	}

	function removeClass(el, clsName) {
		el.classList.remove(clsName);
	}

	function bind(element, event, handler) {
		if (typeof element === "string") {
			element = document.querySelector(element);
		}
		if (element) {
			element.addEventListener(event, handler, false);
		}
	}

	return {
		$: $,
		hasClass: hasClass,
		addClass: addClass,
		removeClass: removeClass,
		bind: bind
	};
}());
