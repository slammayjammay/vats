const BaseSubview = require('./BaseSubview');

class TextView extends BaseSubview {
	constructor(div) {
		super(div);

		this.text = '';
		this._blockId = 'text-view-block';
	}

	setText(text = '') {
		this.text = text;
	}

	update() {
		const div = this.div;

		if (div.hasBlock(this._blockId)) {
			div.getBlock(this._blockId).content(this.text);
		} else {
			div.addBlock(this.text, this._blockId);
		}
	}

	destroy() {
		super.destroy(...arguments);
		this.text = this._blockId = null;
	}
}

module.exports = TextView;
