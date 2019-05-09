const colorScheme = require('../../color-scheme');

class ArrayView {
	constructor(div, array = []) {
		if (!div) {
			throw new Error(`Need a TerminalJumper Division.`);
		}

		this.div = div;
		this.array = array;

		this._diff = [];
		this.activeIdx = this.prevActiveIdx = null;

		this.displayFnMap = new Map();
	}

	_getBlock(idx) {
		return this.div.blockHash[this.div.blockIds[idx]];
	}

	setArray(array) {
		this.array = array;
	}

	setScrollPosY(scrollPosY) {
		this.div.scrollY(scrollPosY);
	}

	/**
	 * Returns a string representing the given item.
	 * @param {*} item - The item in the array.
	 * @param {number} [item] - The item's index in the array.
	 * @param {number} [divWidth] - The width of this div in columns.
	 */
	getItemString(item, idx, divWidth) {
		const fn = this.displayFnMap.get('getItemString');
		return typeof fn === 'function' ? fn(...arguments) : item.toString();
	}

	/**
	 * Returns a colored string for an item.
	 * @param {string} string - The string to color.
	 * @param {*} [item] - The item that the string represents.
	 * @param {number} [idx] - The index of the item that the string represents.
	 * @param {number} [divWidth] - The width of this div in columns.
	 * @return {string}
	 */
	colorItemString(string, item, idx) {
		const fn = this.displayFnMap.get('colorItemString');
		return typeof fn === 'function' ? fn(...arguments) : colorScheme.colorItem1(string);
	}

	/**
	 * Returns a colored string for an active item.
	 * @param {string} string - The string to color.
	 * @param {*} [item] - The item that the string represents.
	 * @param {number} [idx] - The index of the item that the string represents.
	 * @param {number} [divWidth] - The width of this div in columns.
	 * @return {string}
	 */
	colorItemStringActive(string, item, idx) {
		const fn = this.displayFnMap.get('colorItemStringActive');
		return typeof fn === 'function' ? fn(...arguments) : colorScheme.colorItem1Active(string);
	}

	updateBlocks() {
		// sync TerminalJumper blocks for this division with the array structure.
		// if an item already has a block associated with it, skip. otherwise set
		// the block's content to the item's calculated string.
		//
		// TODO: this stuff should inside terminal jumper
		for (const [idx, item] of this.array.entries()) {
			const existingBlock = this._getBlock(idx);

			if (this._diff[idx] === item && !!existingBlock) {
				continue;
			}

			this._diff[idx] = item;

			if (!existingBlock) {
				this.div.addBlock();
			}

			this.setBlockContentForIdx(idx);
		}

		// if the array got smaller, there are extra blocks that need destroying.
		// if the array got larger, blocks were already added -- nothing needs to
		// be done.
		if (this.array.length < this._diff.length) {
			this._diff.splice(this.array.length, this._diff.length - this.array.length);

			while (this._getBlock(this.array.length)) {
				this._getBlock(this.array.length).remove();
			}
		}
	}

	setBlockContentForIdx(idx) {
		const item = this.array[idx];
		const block = this._getBlock(idx);
		const divWidth = this.div.width();
		const string = this.getItemString(item, idx, divWidth);
		const colorFn = idx === this.activeIdx ? 'colorItemStringActive' : 'colorItemString';

		block.content(this[colorFn](string, item, idx));
	}

	setActiveIdx(idx) {
		if (this.activeIdx === idx) {
			return false;
		}

		this.prevActiveIdx = this.activeIdx;
		this.activeIdx = idx;

		return true;
	}

	/**
	 * Highlights the block at the given index, and un-highlights the last active
	 * block.
	 */
	setActiveBlock(idx) {
		if (this.setActiveIdx(idx)) {
			this.setBlockContentForIdx(this.prevActiveIdx);
			this.setBlockContentForIdx(this.activeIdx);
			return true;
		}

		return false;
	}

	getViPageHeight() {
		return this.array.length - 1;
	}

	getViVisibleIndexBounds() {
		return [this.div.scrollPosY(), this.array.length - 1 - this.div.scrollPosY()];
	}
}

module.exports = ArrayView;
