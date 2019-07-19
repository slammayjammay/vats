class Tree {
	constructor(data = {}) {
		this.data = data;
		this.parent = null;
		this.children = [];
		this.activeIdx = 0;
		this.scrollPosY = 0;
	}

	addChild(node, idx = this.children.length) {
		node.parent = this;
		this.children.splice(idx, 0, node);
	}

	removeChild(nodeOrIdx) {
		const idx = (nodeOrIdx instanceof Tree) ? this.children.indexOf(nodeOrIdx) : nodeOrIdx;
		if (idx < 0) {
			return;
		}

		this.children[idx].parent = null;
		this.children.splice(idx, 1);
	}

	replaceChild(nodeOrIdx, newNode) {
		const idx = (nodeOrIdx instanceof Tree) ? this.children.indexOf(nodeOrIdx) : nodeOrIdx;
		if (idx < 0) {
			return;
		}

		this.children[idx].parent = null;
		this.children[idx] = newNode;
		newNode.parent = this;
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

	getActiveChild() {
		return this.getChildren()[this.activeIdx];
	}

	update() {
		const newIdx = this._constrainIdx(this.activeIdx);
		const didUpdate = newIdx !== this.activeIdx;

		this.activeIdx = newIdx;

		return didUpdate;
	}

	/**
	 * @param {Tree|number}
	 */
	setActiveChild(nodeOrIdx) {
		const idx = nodeOrIdx instanceof Tree ? this.getChildren().indexOf(nodeOrIdx) : nodeOrIdx;
		const newIdx = this._constrainIdx(idx);

		if (newIdx === this.activeIdx) {
			return false;
		} else {
			this.activeIdx = newIdx;
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
		return this.data.name || 'Default Tree';
	}

	/**
	 * Returns a string that will appear in this node's parent's children list.
	 *
	 * @param {idx} [idx] - the index of this node's position in its parent's
	 * children.
	 * @param {number} [divWidth] - the available width of the div.
	 * @return {string}
	 */
	toListItemString(idx, divWidth) {
		return this.name();
	}

	/**
	 * Only applicable if this node has no children. In that case, this string
	 * will be displayed in the rightmost column, instead of the list of children.
	 *
	 * @param {idx} [idx] - the index of this node's position in its parent's
	 * children.
	 * @param {number} [divWidth] - the available width of the div.
	 * @return {string}
	 */
	toString(idx, divWidth) {
		return `Showing content for node "${this.data.name}"`;
	}

	/**
	 * @param {object} context
	 * @prop {string} context.id - the id of the column the node is in.
	 * @prop {number} context.width - the available width of the column.
	 * @return {string|Array<string>}
	 */
	// toListItemString(context) {
	// 	const tuple = [this.name(), null];

	// 	if (context.id === 'current' && this.hasChildren()) {
	// 		tuple[1] = '' + this.getChildren().length;
	// 	}

	// 	return tuple;
	// }

	/**
	 * @param {string} string - the search string.
	 * @return {boolean} - whether the search was successful.
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

		this.data = this.parent = this.children = null;
		this.activeIdx = null;
	}
}

module.exports = Tree;
