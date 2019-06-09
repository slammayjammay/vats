const chalk = require('chalk');

class ColorScheme {
	constructor() {
		this.map = new Map();

		this.defineScheme('default', new Map([
			['colorItem1', chalk.bold.blue],
			['colorItem1Active', chalk.bgBlue.bold.hex('#000000')]
		]));

		this.use('default');
	}

	defineScheme(scheme, values) {
		if (!this.map.has(scheme)) {
			this.map.set(scheme, new Map());
		}

		this.map.set(scheme, new Map([...this.map.get(scheme), ...values]));
	}

	use(scheme = 'default') {
		if (!this.map.has(scheme)) {
			throw new Error(`Color scheme "${scheme}" not found.`);
		}

		for (const [fnName, fn] of this.map.get(scheme).entries()) {
			this[fnName] = fn;
		}
	}
}

module.exports = new ColorScheme();
