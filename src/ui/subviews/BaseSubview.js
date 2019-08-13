class BaseSubview {
	constructor(div) {
		if (!div) {
			throw new Error(`Need a TerminalJumper Division.`);
		}

		this.div = div;
		this.isEnabled = true;
	}

	disable() {
		this.div.jumper.removeDivision(this.div);
		this.isEnabled = false;
	}

	enable() {
		this.div.jumper.addDivision(this.div);
		this.isEnabled = true;
	}

	getScrollPosY() {
		return this.div.scrollPosY();
	}

	setScrollPosY(scrollPosY) {
		this.div.scrollY(scrollPosY);
	}

	destroy() {
		this.div = this.isEnabled = null;
	}
}

module.exports = BaseSubview;
