class BaseView {
	constructor() {
		this.vats = null;
	}

	init(vats, options) {
		this.vats = vats;
		this.options = options;
	}

	render() {}

	handleViKeybinding({ keyString, keyAction, count, charsRead }) {
		const pageHeight = this.getViPageHeight();
		const visibleIndexBounds = this.getViVisibleIndexBounds();
		const currentCursorRow = this.getCursorRow();

		if (
			!Number.isInteger(pageHeight) ||
			!Number.isInteger(currentCursorRow) ||
			!Array.isArray(visibleIndexBounds)
		) {
			return;
		}

		const { cursorRow, scrollPosY } = this.vats.cursorNavigation.handleKeybinding(
			keyAction, count, pageHeight, visibleIndexBounds, currentCursorRow
		);

		let needsRender = false;

		if (Number.isInteger(cursorRow)) {
			needsRender = needsRender || this.setCursorRow(cursorRow);
		}
		if (Number.isInteger(scrollPosY)) {
			needsRender = needsRender || this.setScrollPosY(scrollPosY);
		}

		needsRender && this.render();
	}

	/**
	 * @return {number} - total height of page content.
	 */
	getViPageHeight() {}

	/**
	 * @return {array} - tuple containing start and end indices of visible page
	 * content.
	 */
	getViVisibleIndexBounds() {}

	getCursorRow() {}

	setCursorRow(index) {}

	setScrollPosY(scrollPosY) {}

	search(string, dir) {
		const searchableItems = this.getSearchableItems(string);
		if (!searchableItems) {
			return;
		}
	}

	getSearchableItems(string) {
		return [];
	}

	quit() {}

	destroy() {
		this.vats = null;
		this.options = null;
	}
}

module.exports = BaseView;
