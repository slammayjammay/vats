const { EventEmitter } = require('events');
const {
	colorBranch,
	colorLeaf,
	highlightBranch,
	highlightLeaf
} = require('./color-scheme');

class Node extends EventEmitter {
	constructor(data = {}) {
		super();

		this.data = data;
		this.parent = null;
		this.children = [];
		this.highlightedIdx = 0;
		this.previousHighlightedIdx = -1;
		this.scrollPosY = 0;
	}

	addChild(node, idx = this.children.length) {
		node.parent = this;
		this.children.splice(idx, 0, node);
	}

	removeChild(nodeOrIdx) {
		const idx = (nodeOrIdx instanceof Node) ? this.children.indexOf(nodeOrIdx) : nodeOrIdx;
		if (idx < 0) {
			return;
		}

		this.children[idx].parent = null;
		this.children.splice(idx, 1);
	}

	getChild(idx) {
		return this.getChildren()[idx];
	}

	hasChildren() {
		return this.getChildren().length > 0;
	}

	getChildren() {
		return this.children;
	}

	/**
	 * @param {number} startIdx - Tthe start index of the container.
	 * @param {number} endIdx - The end index of the container.
	 *
	 * This method is overrideable, but should only be overriden if child nodes
	 * take up more than one row of space.
	 *
	 * See Vats#getVisibleChildrenFor()
	 */
	getVisibleChildren(startIdx, endIdx) {
		return this.getChildren().slice(startIdx, endIdx);
	}

	getPreviousHighlightedChild() {
		return this.getChildren()[this.previousHighlightedIdx];
	}

	getHighlightedChild() {
		return this.getChildren()[this.highlightedIdx];
	}

	update() {
		const newIdx = this._constrainIdx(this.highlightedIdx);
		const didUpdate = newIdx !== this.highlightedIdx;

		this.highlightedIdx = newIdx;

		return didUpdate;
	}

	/**
	 * @param {Node|number}
	 */
	setHighlighted(nodeOrIdx) {
		const idx = nodeOrIdx instanceof Node ? this.getChildren().indexOf(nodeOrIdx) : nodeOrIdx;
		const newIdx = this._constrainIdx(idx);

		if (newIdx === this.highlightedIdx) {
			return false;
		} else {
			this.previousHighlightedIdx = this.highlightedIdx;
			this.highlightedIdx = newIdx;
			return true;
		}
	}

	_constrainIdx(idx) {
		if (idx < 0) {
			idx = 0;
		} else if (idx > this.getChildren().length - 1) {
			idx = this.getChildren().length - 1;
		}

		return idx;
	}

	name() {
		return this.data.name || 'Default Node';
	}

	/**
	 * @param {object} context
	 * @prop {string} context.id - the id of the column the node is in.
	 * @prop {number} context.width - the available width of the column.
	 * @return {string|Array<string>}
	 */
	displayAsItem(context) {
		const tuple = [this.name(), null];

		if (context.id === 'current' && this.hasChildren()) {
			tuple[1] = '' + this.getChildren().length;
		}

		return tuple;
	}

	/**
	 * @param {object} context
	 * @prop {string} context.id - the id of the column the node is in.
	 * @prop {number} context.width - the available width of the column.
	 * @return {string|Array<string>}
	 */
	displayAsContent(context) {
		return this.name() + ' node';
	}

	colorDefault() {
		return this.hasChildren() ? colorBranch : colorLeaf;
	}

	colorHighlighted() {
		return this.hasChildren() ? highlightBranch : highlightLeaf;
	}

	/**
	 * @param {string} string - the search string.
	 * @return {boolean} - whether the search was succesful.
	 */
	search(string) {
		const reg = new RegExp(string, 'i');
		return reg.test(this.name());
	}

	destroy(options = {}) {
		if (options.removeFromParent) {
			this.parent && this.parent.removeChild(this);
		}

		for (const child of this.children) {
			child.destroy();
		}

		this.removeAllListeners();

		this.data = this.parent = this.children = null;
		this.highlightedIdx = this.previousHighlightedIdx = null;
	}
}

module.exports = Node;
