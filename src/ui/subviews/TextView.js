class PreviewView {
	constructor(div, text = '') {
		if (!div) {
			throw new Error(`Need a TerminalJumper Division.`);
		}

		this.div = div;
		this.text = text;

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
}

module.exports = PreviewView;
