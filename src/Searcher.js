class Searcher {
	constructor() {
		/**
		 * keys are arrays of items. values is an object that holds query strings
		 * as keys and the found indices for that query as values.
		 */
		this.cache = new Map();
	}

	/**
	 * Removes cached search results. If `query` is given, removes the search
	 * results specific to the query. If `query` is not given, removes the entire
	 * items key from the map.
	 *
	 * @param {array} items
	 * @param {string} [query]
	 */
	clearCache(items, query) {
		if (!items) {
			return this.cache.clear();
		}

		if (!this.cache.has(items)) {
			return;
		} else if (!query) {
			this.cache.delete(items);
		} else {
			this.cache.get(items).query = null;
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
	 * @param {boolean} opts.useCache - Will use cached search values if they
	 * exist; if not will store them in cache after they are found.
	 * @return {number} - The index of the matched item.
	 */

	/**
	 * @typedef {function} opts.testFn
	 * @param {*} item - The item to test.
	 * @param {string} query - The search string to test against.
	 * @param {number} idx - The index of the item in the given array.
	 * @return {boolean} - Whether the search was successful.
	 */
	search(items, query, opts = {}) {
		opts = Object.assign({
			testFn: (item, query, idx) => item.includes(query),
			startItemIndex: 0,
			count: 1,
			useCache: false
		}, opts);

		// search or reuse cached results if possible
		let foundIndices = opts.useCache && this.cache.get(items) && this.cache.get(items)[query];

		if (!foundIndices) {
			foundIndices = items.reduce((found, item, idx) => {
				opts.testFn(item, query, idx) && found.push(idx);
				return found;
			}, []);

			if (opts.useCache) {
				if (!this.cache.get(items)) {
					this.cache.set(items, {});
				}

				this.cache.get(items)[query] = foundIndices;
			}
		}

		if (foundIndices.length === 0) {
			return -1;
		}

		const startIdx = this._getStartIndex(items, foundIndices, opts.startItemIndex, opts.count);
		return this._getNextSearchItemFromIdx(foundIndices, startIdx, opts.count);
	}

	/**
	 * @param {array<*>} items - The array of items searched.
	 * @param {array<number>} foundIndices - The indices of items that matched
	 * the search query.
	 * @param {number} startItemIndex - The index in the original search array to
	 * start the search.
	 * @param {number} dir - The direction of searching, positive for forward and
	 * negative for backward.
	 * @return {number} - The index in the `foundIndices` array to start at.
	 */
	_getStartIndex(items, foundIndices, startItemIndex, dir) {
		let startIdx = dir > 0 ? foundIndices.length - 1 : 0;

		for (let i = 0, l = foundIndices.length; i < l; i++) {
			const itemIdx = foundIndices[i];

			if (itemIdx >= startItemIndex) {
				startIdx = (dir > 0 && itemIdx > startItemIndex) ? i - 1 : i;
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
		this.cache.clear();
		this.cache = null;
	}
}

module.exports = Searcher;
