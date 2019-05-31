/**
 * Responsible for calculating new cursor positions based on common VI
 * keybindings.
 *
 * Can also calculate the correct scroll position for a given cursor row.
 */
class ViCursorNavigation {
	constructor() {
		this.map = new Map([
			['cursor-up', 'cursorUp'],
			['cursor-left', 'cursorLeft'],
			['cursor-right', 'cursorRight'],
			['cursor-down', 'cursorDown'],

			['cursor-to-page-top', 'cursorToPageTop'],
			['cursor-to-page-bottom', 'cursorToPageBottom'],
			['cursor-to-screen-top', 'cursorToScreenTop'],

			['cursor-to-screen-middle', 'cursorToScreenMiddle'],
			['cursor-to-screen-bottom', 'cursorToScreenBottom'],

			['scroll-full-page-down', 'scrollFullPageDown'],
			['scroll-full-page-up', 'scrollFullPageUp'],
			['scroll-half-page-down', 'scrollHalfPageDown'],
			['scroll-half-page-up', 'scrollHalfPageUp'],

			['top-align-page-around-cursor', 'topAlignPageAroundCursor'],
			['center-align-page-around-cursor', 'centerAlignPageAroundCursor'],
			['bottom-align-page-around-cursor', 'bottomAlignPageAroundCursor'],

			['find', 'find']
		]);
	}

	/**
	 * @param {string} keyAction
	 * @param {number} pageHeight
	 * @param {array<number>} visibleIndexBounds
	 * @param {number} cursorRow
	 * @return {array<number>} A tuple, containing 1) the new row and 2) the new
	 * scroll position.
	 */
	handleKeybinding(keyAction, count, pageHeight, visibleIndexBounds, cursorRow) {
		const action = keyAction.replace('vi:', '');
		const foundMethod = this.map.get(action);
		if (!foundMethod) {
			throw new Error(`Binding "${action}" not found.`);
		}

		const method = typeof foundMethod === 'function' ? foundMethod : this[foundMethod];

		const newRow = method(count, pageHeight, visibleIndexBounds, cursorRow);
		const newScrollPos = this.getScrollPosition(
			newRow, pageHeight, visibleIndexBounds, cursorRow
		);

		return [newRow, newScrollPos];
	}

	cursorUp(count, pageHeight, visibleIndexBounds, cursorRow) {
		return Math.max(0, cursorRow - count);
	}

	cursorDown(count, pageHeight, visibleIndexBounds, cursorRow) {
		return Math.min(pageHeight, cursorRow + count);
	}

	cursorLeft() {}
	cursorRight() {}

	cursorToPageTop() {
		return 0;
	}

	cursorToPageBottom(count, pageHeight, [start, end], cursorRow) {
		return pageHeight;
	}

	cursorToScreenTop(count, pageHeight, visibleIndexBounds, cursorRow) {
		return visibleIndexBounds[0];
	}

	cursorToScreenMiddle(count, pageHeight, [start, end], cursorRow) {
		return ~~(start + (end - start) * 0.5);
	}

	cursorToScreenBottom(count, pageHeight, visibleIndexBounds, cursorRow) {
		return visibleIndexBounds[1];
	}

	scrollFullPageDown(count, pageHeight, [start, end], cursorRow) {
		const visibleHeight = end - start;
		return Math.min(cursorRow + visibleHeight, pageHeight);
	}

	scrollFullPageUp(count, pageHeight, [start, end], cursorRow) {
		const visibleHeight = end - start;
		return Math.max(0, cursorRow - visibleHeight);
	}

	scrollHalfPageDown(count, pageHeight, [start, end], cursorRow) {
		const visibleHeight = end - start;
		return Math.min(cursorRow + ~~(visibleHeight * 0.5), pageHeight);
	}

	scrollHalfPageUp(count, pageHeight, [start, end], cursorRow) {
		const visibleHeight = end - start;
		return Math.max(0, cursorRow - ~~(visibleHeight * 0.5));
	}

	topAlignPageAroundCursor(count, pageHeight, visibleIndexBounds, cursorRow) {
		return 0;
	}

	centerAlignPageAroundCursor(count, pageHeight, [start, end], cursorRow) {
		return cursorRow;
	}

	bottomAlignPageAroundCursor(count, pageHeight, [start, end], cursorRow) {
		return pageHeight - (end - start);
	}

	find(count, pageHeight, visibleIndexBounds, cursorRow) {
		// not sure what to do here...
	}

	/**
	 * Calculates the target scroll position of the page given a cursor row.
	 * By default the scroll position will adjust so that the cursor is centered
	 * in the middle of the visible window, but if the previous row close enough
	 * to the new row then the cursor will either be at the top or the bottom of
	 * the screen.
	 *
	 * @param {number} row - The cursor row.
	 * @param {number} pageHeight - The height of the page.
	 * @param {array<number>} visibleIndexBounds - The start and end indices of
	 * the visible page.
	 * @param {number} [previousRow] - The previous row location of the cursor.
	 * @return {number} the scroll position. -1 indicates that the scroll position
	 * has not changed.
	 */
	getScrollPosition(row, pageHeight, [start, end], previousRow) {
		if (row >= start && row <= end) {
			return -1;
		}

		const windowHeight = end - start;
		let scrollPos = row < start ? row : row - windowHeight;

		const shouldCenter = (
			typeof previousRow === 'number' &&
			Math.abs(row - previousRow) > windowHeight / 2
		);

		if (shouldCenter) {
			scrollPos += ~~(windowHeight / 2) * (row < start ? -1 : 1);
		}

		return Math.max(0, scrollPos);
	}

	destroy() {
		this.map.clear();
		this.map = null;
	}
}

module.exports = ViCursorNavigation;
