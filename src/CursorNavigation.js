class CursorNavigation {
	constructor() {
		this._lastSearchString = this._foundSearches = null;
		this._searchDir = 1;

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

			['search-next', 'searchNext'],
			['search-previous', 'searchPrevious']
		]);
	}

	/**
	 * @param {string} keyAction
	 * @param {number} pageHeight
	 * @param {array<number>} visibleIndexBounds
	 * @param {number} cursorRow
	 * @return {object} obj - contains a new index and new scroll position (or a
	 * new visible start index).
	 * @prop {number} obj.cursorRow
	 * @prop {number} obj.scrollPosY
	 */
	handleKeybinding(keyAction, ...args) {
		const action = keyAction.replace('vi:', '');
		const foundMethod = this.map.get(action);
		if (!foundMethod) {
			throw new Error(`Binding "${action}" not found.`);
		}

		const method = typeof foundMethod === 'function' ? foundMethod : this[foundMethod];
		return method(...args);
	}

	cursorUp(count, pageHeight, visibleIndexBounds, cursorRow) {
		cursorRow = Math.max(0, cursorRow - count);
		const scrollPosY = Math.min(visibleIndexBounds[0], cursorRow);
		return { cursorRow, scrollPosY };
	}

	cursorDown(count, pageHeight, visibleIndexBounds, cursorRow) {
		cursorRow = Math.min(pageHeight, cursorRow + count);
		const scrollPosY = visibleIndexBounds[0];
		return { cursorRow, scrollPosY };
	}

	cursorLeft() {}
	cursorRight() {}

	cursorToPageTop() {
		return { cursorRow: 0, scrollPosY: 0 }
	}

	cursorToPageBottom(count, pageHeight, [start, end], cursorRow) {
		cursorRow = pageHeight;
		const scrollPosY = Math.max(end, pageHeight - (end - start));
		return { cursorRow, scrollPosY };
	}

	cursorToScreenTop(count, pageHeight, visibleIndexBounds, cursorRow) {
		return { cursorRow: visibleIndexBounds[0] };
	}

	cursorToScreenMiddle(count, pageHeight, [start, end], cursorRow) {
		return { cursorRow: ~~(start + (end - start) * 0.5) };
	}

	cursorToScreenBottom(count, pageHeight, visibleIndexBounds, cursorRow) {
		return { cursorRow: visibleIndexBounds[1] };
	}

	// ['scroll-full-page-down', 'scrollFullPage-down'];
	// ['scroll-full-page-up', 'scrollFullPage-up'];
	// ['scroll-half-page-down', 'scrollHalfPage-down'];
	// ['scroll-half-page-up', 'scrollHalfPage-up'];

	topAlignPageAroundCursor(count, pageHeight, visibleIndexBounds, cursorRow) {
		return { cursorRow: 0, scrollPosY: cursorRow };
	}

	centerAlignPageAroundCursor(count, pageHeight, [start, end], cursorRow) {
		const diff = cursorRow - ~~(start + (end - start) * 0.5);
		return { cursorRow, scrollPosY: start + diff };
	}

	bottomAlignPageAroundCursor(count, pageHeight, [start, end], cursorRow) {
		return {
			cursorRow: pageHeight - (end - start),
			scrollPosY: Math.max(0, cursorRow - (end - start))
		};
	}

	destroy() {
		this._lastSearchString = this._foundSearches = this._searchDir = null;
	}

	// ['search-next', 'searchNext'];
	// ['search-previous', 'searchPrevious'];

	// search(string, currentIdx, count, vats) {
	// 	if (count / Math.abs(count) !== this._searchDir) {
	// 		this._searchDir *= -1;
	// 	}

	// 	return this._search(string, currentIdx, count, vats);
	// }

	// _search(string, currentIdx, count, vats) {
	// 	if (this._foundSearches && string === this._lastSearchString) {
	// 		return this._getNextSearchFromIdx(currentIdx, count);
	// 	}

	// 	string = string.toLowerCase();
	// 	this._lastSearchString = string;

	// 	const childNodes = vats.currentNode.getChildren().map((node, idx) => {
	// 		return { node, idx };
	// 	});

	// 	this._foundSearches = childNodes.reduce((filtered, { node, idx }) => {
	// 		if (node.search(string)) {
	// 			filtered.push(idx);
	// 		}
	// 		return filtered;
	// 	}, []);

	// 	return this._getNextSearchFromIdx(currentIdx, count);
	// }

	// clearSearchCache() {
	// 	this._foundSearches = null;
	// }

	// _getNextSearchFromIdx(currentIdx, count = 1) {
	// 	if (count === 0 || !this._foundSearches) {
	// 		return null;
	// 	}

	// 	let startIdx = this._foundSearches.length - 1;

	// 	for (let idx = 0; idx < this._foundSearches.length; idx++) {
	// 		const foundIdx = this._foundSearches[idx];

	// 		if (foundIdx > currentIdx) {
	// 			startIdx = idx;

	// 			if (count > 0) {
	// 				count -= 1;
	// 			} else if (count < 0 && this._foundSearches[startIdx - 1] === currentIdx) {
	// 				count -= 1;
	// 			}

	// 			break;
	// 		}
	// 	}

	// 	startIdx += count;

	// 	if (startIdx < 0) {
	// 		startIdx = this._foundSearches.length + startIdx;
	// 	}
	// 	startIdx %= this._foundSearches.length;

	// 	return this._foundSearches[startIdx];
	// }
}

module.exports = CursorNavigation;
