const stringWidth = require('string-width');
const BaseSubview = require('./BaseSubview');
const colorScheme = require('../../color-scheme');

class InfoView extends BaseSubview {
	setInfo(string = '', options = {}) {
		if (options.warn) {
			string = colorScheme.colorInfoWarn(string);
		}

		if (options.header !== undefined) {
			this.setInfoHeader(options.header);
		}

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

		const div = this.div.jumper.getDivision('info');
		string += (new Array(div.contentWidth() - stringWidth(string))).join(' ');

		block.content(colorScheme.colorInfoHeader(string));
	}
}

module.exports = InfoView;
