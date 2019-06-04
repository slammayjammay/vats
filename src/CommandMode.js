const { createInterface } = require('readline');
const minimist = require('minimist');
const stringArgv = require('string-argv');

const RUN_OPTION_DEFAULTS = {
	prompt: ':',
	command: ''
};

/**
 * TODO: history!
 */
class CommandMode {
	constructor() {
		this._onKeypress = this._onKeypress.bind(this);

		this.rl = null;
		this._resolve = null;
		this._isRunning = false;
		this._stdinListeners = null;
	}

	isRunning() {
		return this._isRunning;
	}

	run(options) {
		if (this._isRunning) {
			return;
		}
		this._isRunning = true;

		options = Object.assign({}, RUN_OPTION_DEFAULTS, options);

		this.rl = createInterface({
			input: process.stdin,
			output: process.stdout,
			prompt: options.prompt
		});

		this._stdinListeners = process.stdin.listeners('keypress');
		for (const listener of this._stdinListeners) {
			process.stdin.removeListener('keypress', listener);
		}

		process.stdin.on('keypress', this._onKeypress);

		this.rl.prompt();
		this.rl.line = options.command;
		this.rl.cursor = this.rl.line.length;
		this.rl._refreshLine();

		return new Promise(resolve => this._resolve = resolve);
	}

	_onKeypress(char, key) {
		const isBackspaceOnEmpty = (key.name === 'backspace' && this.rl.line.length === 0);

		// exit
		if (isBackspaceOnEmpty || key.name === 'escape') {
			this.quit();
			this.resolve(null);
			return;
		}

		// default keypress behavior
		if (key.name !== 'return') {
			this._stdinListeners.forEach(cb => cb(char, key));
			return;
		}

		const commandData = this._getCommandData(this.rl.line, this.rl._prompt);

		this.quit();
		this.resolve(commandData);
	}

	_getCommandData(line, prompt) {
		return {
			commandString: this.rl.line,
			commandPrompt: this.rl._prompt,
			argv: minimist(stringArgv(this.rl.line))
		};
	}

	quit() {
		if (!this._isRunning) {
			return;
		}
		this._isRunning = false;

		process.stdin.removeListener('keypress', this._onKeypress);
		this._stdinListeners = null;

		this.rl.close();
	}

	// TODO: is this even necessary
	resolve(val) {
		if (this._resolve) {
			const resolve = this._resolve;
			this._resolve = null;
			resolve(val);
		}
	}

	destroy() {
		process.stdin.removeListener('keypress', this._onKeypress);
		this.rl && this.rl.close();
		this._isRunning = this._stdinListeners = this._resolve = this.rl = null;
	}
}

module.exports = CommandMode;
