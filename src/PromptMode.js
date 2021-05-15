import { createInterface } from 'readline';

const RUN_OPTION_DEFAULTS = {
	prompt: '',
	prepopulate: '',
	cancelWhenEmpty: false
};

class CommandMode {
	constructor() {
		this._onKeypress = this._onKeypress.bind(this);

		this._isRunning = false;
		this._resolve = null;
		this._options = null;

		this.rl = null;
		this._stdinListeners = null;
	}

	isRunning() {
		return this._isRunning;
	}

	enable() {
		this.rl = createInterface({ input: process.stdin, output: process.stdout });

		this._stdinListeners = process.stdin.listeners('keypress');
		for (const listener of this._stdinListeners) {
			process.stdin.removeListener('keypress', listener);
		}

		process.stdin.on('keypress', this._onKeypress);
		this.rl.prompt();
	}

	disable() {
		process.stdin.removeListener('keypress', this._onKeypress);

		for (const listener of this._stdinListeners) {
			process.stdin.addListener('keypress', listener);
		}
		this._stdinListeners = null;

		this.rl.close();
	}

	run(options = {}) {
		// skip if already running
		if (this._isRunning) {
			return;
		}
		this._isRunning = true;

		this._options = { ...RUN_OPTION_DEFAULTS, ...options };

		this.enable();

		this.rl.setPrompt(this._options.prompt);
		this.rl.line = this._options.prepopulate;
		this.rl.cursor = this.rl.line.length;
		this.rl._refreshLine();

		return new Promise(resolve => this._resolve = resolve);
	}

	getLine() {
		return this.rl.line;
	}

	getPrompt() {
		return this.rl._prompt;
	}

	quit() {
		if (!this._isRunning) {
			return;
		}
		this._isRunning = false;

		this.disable();
	}

	_onKeypress(char, key) {
		const isBackspaceOnEmpty = (key.name === 'backspace' && this.rl.line.length === 0);
		const escaped = key.name === 'escape' || (key.ctrl && key.name === 'c');

		if (escaped || (this._options.cancelWhenEmpty && isBackspaceOnEmpty)) {
			this.quit();
			this.resolve('');
		} else if (key.name === 'return') {
			this.quit();
			this.resolve(this.rl.line);
		} else {
			this._stdinListeners.forEach(listener => listener(...arguments));
		}
	}

	resolve(val) {
		if (!this._resolve) {
			return;
		}

		const resolve = this._resolve;
		this._resolve = this._options = null;
		resolve(val);
	}

	destroy() {
		process.stdin.removeListener('keypress', this._onKeypress);
		this.rl && this.rl.close();
		this.rl = null;
		this._isRunning = this._stdinListeners = this._resolve = this._options = null;
	}
}

export default CommandMode;
