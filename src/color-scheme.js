const chalk = require('chalk');

class ColorScheme {
	constructor() {
		this.map = new Map();
		this.current = null;

		this.defineScheme('default', new Map([
			['colorItem', chalk.white],
			['colorItemActive', chalk.bgWhite.bold.hex('#000000')]
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

		if (this.current) {
			for (const [fnName, fn] of this.map.get(this.current).entries()) {
				this[fnName] = null;
			}
		}

		for (const [fnName, fn] of this.map.get(scheme).entries()) {
			this[fnName] = fn;
		}

		this.current = scheme;
	}

	/**
	 * @param {string} fnName - The name of the coloring function.
	 * @param {string} [scheme] - The scheme under which the function is scoped.
	 * If not given, will use from the currently used scheme.
	 */
	getColorFunction(fnName, scheme) {
		if (!scheme) {
			return this[fnName];
		}

		if (!this.map.has(scheme)) {
			throw new Error(`Color scheme "${scheme}" not found.`);
		}

		return this.map.get(scheme).get(fnName);
	}

	destroy() {
		if (this.current) {
			for (const [fnName, fn] of this.map.get(this.current).entries()) {
				this[fnName] = null;
			}
		}

		this.current = null;
		this.map.clear();
		this.map = null;
	}
}

module.exports = new ColorScheme();
