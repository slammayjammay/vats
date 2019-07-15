const stringWidth = require('string-width');
const BaseSubview = require('./BaseSubview');
const colorScheme = require('../../color-scheme');

class InfoView extends BaseSubview {
	setInfo(string = '', options = {}) {
		if (options.warn) {
			string = colorScheme.colorInfoWarn(string);
		}

		this.setInfoHeader(options.header);

		const hasBlock = this.div.jumper.hasBlock('info.info');
		const block = this.div.jumper[hasBlock ? 'getBlock' : 'addBlock']('info.info', '');

		string ? block.content(string) : block.remove();
	}

	setInfoHeader(string) {
		const hasBlock = this.div.jumper.hasBlock('info.header');

		if (!string) {
			hasBlock && this.div.jumper.removeBlock('info.header');
			return;
		}

		const block = this.div.jumper[hasBlock ? 'getBlock' : 'addBlock']('info.header', '', 0);
		const divWidth = this.div.jumper.getDivision('info').contentWidth();

		const lines = string.split('\n').map(line => {
			line += (new Array(divWidth - stringWidth(line))).join(' ');
			return line;
		});

		block.content(colorScheme.colorInfoHeader(lines.join('\n')));
	}

	clearInfo() {
		let hasChanged = false;

		for (const id of ['header', 'info']) {
			const hasBlock = this.div.hasBlock(id);
			hasChanged = hasChanged || hasBlock;
			hasBlock && this.div.removeBlock(id);
		}

		return hasChanged;
	}
}

module.exports = InfoView;
