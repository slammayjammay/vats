class BaseView {
	constructor() {
		this.vats = null;
	}

	/**
	 * @param {Vats} vats - Vats instance.
	 * @param {object} options - the parsed vats options (also available as
	 * this.vats.options).
	 */
	init(vats, options) {
		this.vats = vats;
	}

	update() {}

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

		const [cursorRow, scrollPosY] = this.vats.viCursorNavigation.handleKeybinding(
			keyAction, count, pageHeight, visibleIndexBounds, currentCursorRow
		);

		const needsRender = this.setCursorRowAndScrollPosition(cursorRow, scrollPosY);
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

	setCursorRowAndScrollPosition(cursorRow, scrollPosY) {
		let cursorRowChanged, scrollPosChanged;

		if (Number.isInteger(cursorRow)) {
			cursorRowChanged = this.setCursorRow(cursorRow);
		}
		if (scrollPosY !== -1 && Number.isInteger(scrollPosY)) {
			scrollPosChanged = this.setScrollPosY(scrollPosY);
		}

		return cursorRowChanged || scrollPosChanged;
	}

	search(query, count) {
		const searchableItems = this.getSearchableItems(query);
		if (!searchableItems || searchableItems.length === 0) {
			return;
		}

		const startItemIdx = this.getSearchStartIndex();
		const testFn = (...args) => this.testSearchItem(...args);

		const foundIdx = this.vats.searcher.search(
			searchableItems, query, { testFn, startItemIdx, count, cache: true }
		);

		if (foundIdx === -1) {
			return;
		}

		const newScrollPosY = this.vats.viCursorNavigation.getScrollPosition(
			foundIdx,
			this.getViPageHeight(),
			this.getViVisibleIndexBounds(),
			this.getCursorRow()
		);

		const needsRender = this.setCursorRowAndScrollPosition(foundIdx, newScrollPosY);
		needsRender && this.render();
	}

	getSearchableItems(query) {
		return [];
	}

	getSearchStartIndex() {
		return this.getCursorRow();
	}

	testSearchItem(item, query, idx) {}

	quit() {}

	destroy() {
		this.vats = null;
		this.options = null;
	}
}

module.exports = BaseView;
