class Searcher {
	constructor() {
		/**
		 * A cache object -- keys are query strings, values are an object with two
		 * properties: `items` and `foundIndices`.
		 */
		this._cache = {};
	}

	clearCache(query) {
		if (!query) {
			this._cache = {};
		} else {
			this._cache[query] = {};
		}
	}

	/**
	 * Public method to search an array of items, with optional starting point
	 * and optional "count" to find nth search item.
	 *
	 * @param {array<*>} items - The array of items to search.
	 * @param {string} query - The query string to test against.
	 * @param {object} [opts] - optional additional parameters.
	 * @param {function} opts.testFn - The callback use to match items with the
	 * query string.
	 * @param {number} opts.startIdx - The starting idx from where searches
	 * are found.
	 * @param {number} opts.count - The nth search item to find.
	 * @param {boolean} opts.cache - Whether to use the cached search results
	 * of the last search, if the query and items have not changed.
	 */

	/**
	 * @typedef {function} opts.testFn
	 * @param {*} item - The item to test.
	 * @param {string} query - The search string to test against.
	 * @param {number} idx - The index of the item in the given array.
	 * @return {number} - The index of the matched item.
	 */
	search(items, query, opts = {}) {
		opts = Object.assign({
			testFn: (item, query, idx) => item.includes(query),
			startItemIdx: 0,
			count: 1,
			cache: false
		}, opts);

		// search or reuse cached results if possible
		let foundIndices;
		if (opts.cache && this._cache[query] && this._cache[query].items === items) {
			foundIndices = this._cache[query].foundIndices;
		} else {
			foundIndices = items.reduce((found, item, idx) => {
				opts.testFn(item, query, idx) && found.push(idx);
				return found;
			}, []);

			if (opts.cache) {
				this._cache[query] = { items, foundIndices };
			}
		}

		if (foundIndices.length === 0) {
			return -1;
		}

		const startIdx = this._getStartIndex(items, foundIndices, opts.startItemIdx, opts.count);
		return this._getNextSearchItemFromIdx(foundIndices, startIdx, opts.count);
	}

	/**
	 * @param {array<*>} items - The array of items searched.
	 * @param {array<number>} foundIndices - The indices of items that matched
	 * the search query.
	 * @param {number} startItemIdx - The index in the original search array to
	 * start the search.
	 * @param {number} dir - The direction of searching, positive for forward and
	 * negative for backward.
	 * @return {number} - The index in the `foundIndices` array to start at.
	 */
	_getStartIndex(items, foundIndices, startItemIdx, dir) {
		let startIdx = dir > 0 ? foundIndices.length - 1 : 0;

		for (let i = 0, l = foundIndices.length; i < l; i++) {
			const itemIdx = foundIndices[i];

			if (itemIdx >= startItemIdx) {
				startIdx = (dir > 0 && itemIdx > startItemIdx) ? i - 1 : i;
				break;
			}
		}

		return startIdx;
	}

	/**
	 * @param {array<number>} foundIndices - The array of item indices.
	 * @param {number} startIdx - The index to start at. This index refers to the
	 * index in the first parameter array, not the index in the list of search
	 * items.
	 * @param {number} count - The nth search item to find.
	 */
	_getNextSearchItemFromIdx(foundIndices, startIdx, count) {
		let newIdx = (startIdx + count) % foundIndices.length;

		if (newIdx < 0) {
			newIdx += foundIndices.length;
		}

		return foundIndices[newIdx];
	}

	destroy() {
		this._cache = null;
	}
}

module.exports = Searcher;
