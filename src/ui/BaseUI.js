class BaseView {
	constructor() {
		this.vats = null;
		this.scheduler = new Map();
		this._isScheduling = false;
	}

	/**
	 * @param {Vats} vats - Vats instance.
	 * @param {object} options - the parsed vats options (also available as
	 * this.vats.options).
	 */
	init(vats, options) {
		this.vats = vats;

		this.vats.on('pager:exit', (...args) => this.onPagerExit(...args));
	}

	update() {}

	render() {}

	/**
	 * Stores callbacks that will be executed on setImmediate(). Optionally
	 * stored under a namespace id.
	 *
	 * @param {string} [id]
	 * @param {function} cb
	 */
	schedule(id, cb) {
		id = id || `schedule-${this.scheduler.size}`;

		// TODO: allow for order/sorting
		this.scheduler.set(id, cb);

		if (!this._isScheduling) {
			this._isScheduling = true;

			setImmediate(() => {
				this._isScheduling = false;
				this.performSchedule();
			});
		}
	}

	// method? if no callbacks are scheduled, fires immediately. otherwise
	// schedules it

	performSchedule() {
		for (const cb of this.scheduler.values()) {
			cb();
		}

		this.scheduler.clear();
	}

	onPagerExit() {
		if (this.vats.options.useAlternateScreen) {
			this.render();
		}
	}

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

		const needsRender = this.setViCursor(cursorRow, scrollPosY);

		if (typeof needsRender === 'boolean') {
			needsRender && this.schedule('render', () => this.render());
		} else if (cursorRowChanged || scrollPosChanged) {
			this.schedule('render', () => this.render())
		}
	}

	// TODO: render only visible children

	/**
	 * @return {number} - total height of page content.
	 */
	getViPageHeight() {}

	/**
	 * @return {array<number>} - tuple containing start and end indices of visible page
	 * content.
	 */
	getViVisibleIndexBounds() {}

	getCursorRow() {}

	setCursorRow(index) {}

	getScrollPosY() {}

	setScrollPosY(scrollPosY) {}

	setViCursor(cursorRow, scrollPos) {
		const oldCursorRow = this.getCursorRow();
		const oldScrollPos = this.getScrollPosY();

		const cursorChanged = cursorRow !== oldCursorRow && this.setCursorRow(cursorRow);
		const scrollChanged = scrollPos !== oldScrollPos && this.setScrollPosY(scrollPos);

		cursorChanged && this.onCursorRowChange(cursorRow);
		scrollChanged && this.onScrollPositionChange(scrollPos);

		return (cursorChanged || scrollChanged);
	}

	onCursorRowChange(cursorRow) {}

	onScrollPositionChange(scrollPos) {}

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

		const needsRender = this.setViCursor(foundIdx, newScrollPosY);
		needsRender && this.schedule('render', () => this.render());
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
