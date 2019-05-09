const chalk = require('chalk');

// TODO: add/remove colorschemes
// TODO: dry using maps or something
class ColorScheme {
	constructor() {
		this.colorHeader = this.colorHeader.bind(this);
		this.colorItem1 = this.colorItem1.bind(this);
		this.colorItem2 = this.colorItem2.bind(this);
		this.colorItem1Active = this.colorItem1Active.bind(this);
		this.colorItem2Active = this.colorItem2Active.bind(this);
		this.colorInfoHeader = this.colorInfoHeader.bind(this);
		this.colorInfoWarn = this.colorInfoWarn.bind(this);
		this.colorLineNumbers = this.colorLineNumbers.bind(this);

		this._setColorSchemeDefault();
	}

	colorHeader(string) { return this.colorHeaderFn(string); }
	colorItem1(string) { return this.colorItem1Fn(string); }
	colorItem2(string) { return this.colorItem2Fn(string); }
	colorItem1Active(string) { return this.colorItem1ActiveFn(string); }
	colorItem2Active(string) { return this.colorItem2ActiveFn(string); }
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
		this.colorItem1Fn = chalk.bold.blue;
		this.colorItem2Fn = chalk.white;
		this.colorItem1ActiveFn = chalk.bgBlue.bold.hex('#000000');
		this.colorItem2ActiveFn = chalk.bgWhite.bold.hex('#000000');
		this.colorInfoHeaderFn = chalk.bgWhite.bold.hex('#000000');
		this.colorInfoWarnFn = chalk.bgRed.white.bold;
		this.colorLineNumbersFn = chalk.yellow;
	}

	_setColorSchemeJungle() {
		this.colorHeaderFn = chalk.bold.blue;
		this.colorItem1Fn = chalk.bold.green;
		this.colorItem2Fn = chalk.white;
		this.colorItem1ActiveFn = chalk.bgGreen.bold.hex('#000000');
		this.colorItem2ActiveFn = chalk.bgWhite.bold.hex('#000000');
		this.colorInfoHeaderFn = chalk.bgWhite.bold.hex('#000000');
		this.colorInfoWarnFn = chalk.bgRed.white.bold;
		this.colorLineNumbersFn = chalk.yellow;
	}

	_setColorSchemeSnow() {
		this.colorHeaderFn = chalk.white;
		this.colorItem1Fn = chalk.bold.white;
		this.colorItem2Fn = chalk.white;
		this.colorItem1ActiveFn = chalk.bgWhite.bold.hex('#000000');
		this.colorItem2ActiveFn = chalk.bgWhite.hex('#000000');
		this.colorInfoHeaderFn = chalk.bgWhite.bold.hex('#000000');
		this.colorInfoWarnFn = chalk.bgRed.white.bold;
		this.colorLineNumbersFn = chalk.yellow;
	}
}

module.exports = new ColorScheme();
