const chalk = require('chalk');

class ColorScheme {
	constructor() {
		this.colorHeader = this.colorHeader.bind(this);
		this.colorBranch = this.colorBranch.bind(this);
		this.colorLeaf = this.colorLeaf.bind(this);
		this.highlightBranch = this.highlightBranch.bind(this);
		this.highlightLeaf = this.highlightLeaf.bind(this);
		this.colorInfoHeader = this.colorInfoHeader.bind(this);
		this.colorInfoWarn = this.colorInfoWarn.bind(this);
		this.colorLineNumbers = this.colorLineNumbers.bind(this);

		this._setColorSchemeDefault();
	}

	colorHeader(string) { return this.colorHeaderFn(string); }
	colorBranch(string) { return this.colorBranchFn(string); }
	colorLeaf(string) { return this.colorLeafFn(string); }
	highlightBranch(string) { return this.highlightBranchFn(string); }
	highlightLeaf(string) { return this.highlightLeafFn(string); }
	colorInfoHeader(string) { return this.colorInfoHeaderFn(string); }
	colorInfoWarn(string) { return this.colorInfoWarnFn(string); }
	colorLineNumbers(string) { return this.colorLineNumbersFn(string); }

	setColorScheme(scheme = 'default') {
		if (scheme === 'default') {
			this._setColorSchemeDefault();
		} else if (scheme === 'jungle') {
			this._setColorSchemeJungle();
		} else if (scheme === 'snow') {
			this._setColorSchemeSnow();
		}
	}

	_setColorSchemeDefault() {
		this.colorHeaderFn = chalk.bold.green;
		this.colorBranchFn = chalk.bold.blue;
		this.colorLeafFn = chalk.white;
		this.highlightBranchFn = chalk.bgBlue.bold.hex('#000000');
		this.highlightLeafFn = chalk.bgWhite.bold.hex('#000000');
		this.colorInfoHeaderFn = chalk.bgWhite.bold.hex('#000000');
		this.colorInfoWarnFn = chalk.bgRed.white.bold;
		this.colorLineNumbersFn = chalk.yellow;
	}

	_setColorSchemeJungle() {
		this.colorHeaderFn = chalk.bold.blue;
		this.colorBranchFn = chalk.bold.green;
		this.colorLeafFn = chalk.white;
		this.highlightBranchFn = chalk.bgGreen.bold.hex('#000000');
		this.highlightLeafFn = chalk.bgWhite.bold.hex('#000000');
		this.colorInfoHeaderFn = chalk.bgWhite.bold.hex('#000000');
		this.colorInfoWarnFn = chalk.bgRed.white.bold;
		this.colorLineNumbersFn = chalk.yellow;
	}

	_setColorSchemeSnow() {
		this.colorHeaderFn = chalk.white;
		this.colorBranchFn = chalk.bold.white;
		this.colorLeafFn = chalk.white;
		this.highlightBranchFn = chalk.bgWhite.bold.hex('#000000');
		this.highlightLeafFn = chalk.bgWhite.hex('#000000');
		this.colorInfoHeaderFn = chalk.bgWhite.bold.hex('#000000');
		this.colorInfoWarnFn = chalk.bgRed.white.bold;
		this.colorLineNumbersFn = chalk.yellow;
	}
}

module.exports = new ColorScheme();
