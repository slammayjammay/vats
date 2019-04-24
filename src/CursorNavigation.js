const CURSOR_MOVEMENT_REG = /(j|k|G|n|N|H|M|L)/;

class CursorNavigation {
	constructor() {
		this._lastSearchString = this._foundSearches = null;
		this._searchDir = 1;
	}

	isCursorNavigation(char, key, lastChar) {
		return (
			char && CURSOR_MOVEMENT_REG.test(char) ||
			(char === 'g' && lastChar === 'g') ||
			['up', 'down'].includes(key.name) ||
			key.ctrl && ['d', 'u', 'f', 'b'].includes(key.name)
		);
	}

	// TODO:
	// - "zt", "zz", "zb"
	// - correct scrolling by full or half page
	handle(char, key, count, vats) {
		const div = vats.jumper.getDivision('current');
		const currentIdx = vats.currentNode.highlightedIdx;
		const topIdx = div.scrollPosY();
		const bottomIdx = topIdx + div.height() - 1;
		const childrenLength = vats.currentNode.getChildren().length;

		let newIdx = null;

		if (char === 'j' || key.name === 'down') {
			newIdx = currentIdx + count;
		} else if (char === 'k' || key.name === 'up') {
			newIdx = currentIdx - count;
		} else if (char === 'g' && vats._lastChar === 'g') {
			newIdx = 0;
		} else if (char === 'G') {
			newIdx = childrenLength;
		} else if (char === 'H') {
			newIdx = topIdx;
		} else if (char === 'M') {
			newIdx = topIdx + ~~((bottomIdx - topIdx) * 0.5);
		} else if (char === 'L') {
			newIdx = bottomIdx;
		} else if (key.ctrl && ['d', 'u', 'f', 'b'].includes(key.name)) {
			const c = key.name;
			const height = (c === 'f' || c === 'b') ? div.height() : ~~(div.height() / 2);
			const dir = (c === 'f' || c === 'd') ? 1 : -1;
			newIdx = currentIdx + height * dir;
		} else if (this._lastSearchString && ['n', 'N'].includes(char)) {
			if (char === 'N') {
				count *= -1;
			}

			newIdx = this._search(
				this._lastSearchString,
				currentIdx,
				count * this._searchDir,
				vats
			);
		}

		if (newIdx === null) {
			return newIdx;
		}

		if (newIdx < 0) newIdx = 0;
		if (newIdx > childrenLength - 1) newIdx = childrenLength - 1;

		return newIdx;
	}

	search(string, currentIdx, count, vats) {
		if (count / Math.abs(count) !== this._searchDir) {
			this._searchDir *= -1;
		}

		return this._search(string, currentIdx, count, vats);
	}

	_search(string, currentIdx, count, vats) {
		if (this._foundSearches && string === this._lastSearchString) {
			return this._getNextSearchFromIdx(currentIdx, count);
		}

		string = string.toLowerCase();
		this._lastSearchString = string;

		const childNodes = vats.currentNode.getChildren().map((node, idx) => {
			return { node, idx };
		});

		this._foundSearches = childNodes.reduce((filtered, { node, idx }) => {
			if (node.search(string)) {
				filtered.push(idx);
			}
			return filtered;
		}, []);

		return this._getNextSearchFromIdx(currentIdx, count);
	}

	clearSearchCache() {
		this._foundSearches = null;
	}

	_getNextSearchFromIdx(currentIdx, count = 1) {
		if (count === 0 || !this._foundSearches) {
			return null;
		}

		let startIdx = this._foundSearches.length - 1;

		for (let idx = 0; idx < this._foundSearches.length; idx++) {
			const foundIdx = this._foundSearches[idx];

			if (foundIdx > currentIdx) {
				startIdx = idx;

				if (count > 0) {
					count -= 1;
				} else if (count < 0 && this._foundSearches[startIdx - 1] === currentIdx) {
					count -= 1;
				}

				break;
			}
		}

		startIdx += count;

		if (startIdx < 0) {
			startIdx = this._foundSearches.length + startIdx;
		}
		startIdx %= this._foundSearches.length;

		return this._foundSearches[startIdx];
	}

	destroy() {
		this._lastSearchString = this._foundSearches = this._searchDir = null;
	}
}

module.exports = CursorNavigation;
