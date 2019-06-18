const BaseSubview = require('./BaseSubview');
const colorScheme = require('../../color-scheme');

class ArrayView extends BaseSubview {
	constructor(div, array = []) {
		super(div);
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

	getScrollPosY() {
		return this.div.scrollPosY();
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
	 * @return {string}
	 */
	colorItemString(string, item, idx) {
		if (typeof this.displayFnMap.get('colorItemString') === 'function') {
			return this.displayFnMap.get('colorItemString')(...arguments);
		} else if (typeof colorScheme.getColorFunction('colorItem') === 'function') {
			return colorScheme.getColorFunction('colorItem')(string);
		} else {
			return string;
		}
	}

	/**
	 * Returns a colored string for an active item.
	 * @param {string} string - The string to color.
	 * @param {*} [item] - The item that the string represents.
	 * @param {number} [idx] - The index of the item that the string represents.
	 * @return {string}
	 */
	colorItemStringActive(string, item, idx) {
		if (typeof this.displayFnMap.get('colorItemStringActive') === 'function') {
			return this.displayFnMap.get('colorItemStringActive')(...arguments);
		} else if (typeof colorScheme.getColorFunction('colorItemActive') === 'function') {
			return colorScheme.getColorFunction('colorItemActive')(string);
		} else {
			return string;
		}
	}

	setupAllBlocks(force) {
		// sync TerminalJumper blocks for this division with the array structure.
		// if an item already has a block associated with it, skip. otherwise set
		// the block's content to the item's calculated string.

		for (const [idx, item] of this.array.entries()) {
			const existingBlock = this._getBlock(idx);

			// TODO: this stuff should probably live inside terminal jumper
			// if (!force && this._diff[idx] === item && existingBlock) {
			// 	continue; // TODO: hang on, why is this necessary?
			// }

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

	/**
	 * @param {number|array<number>} indices - The index or array of indices of
	 * blocks to update.
	 */
	updateBlocks(indices) {
		if (Number.isInteger(indices)) {
			// TODO: #updateBlock
			this.setBlockContentForIdx(indices);
		} else if (!indices) {
			for (const [idx] of this.array.entries()) {
				this.setBlockContentForIdx(idx);
			}
		} else {
			for (const idx of indices) {
				this.setBlockContentForIdx(indices);
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
		const start = this.div.scrollPosY();
		const visibleHeight = Math.min(this.div.height() - 1, this.array.length - 1);
		return [start, start + visibleHeight];
	}
}

module.exports = ArrayView;
