const { spawnSync } = require('child_process');
const { EventEmitter } = require('events');
const { emitKeypressEvents } = require('readline');
const deepmerge = require('deepmerge');
const ansiEscapes = require('ansi-escapes');
const pager = require('node-pager');
const termSize = require('term-size');
const Event = require('./Event');
const Keymapper = require('./Keymapper');
const ViCursorNavigation = require('./ViCursorNavigation');
const Searcher = require('./Searcher');
const CommandMode = require('./CommandMode');
const BaseUI = require('./ui/BaseUI');
const TreeUI = require('./ui/TreeUI');
const colorScheme = require('./color-scheme');

const DEFAULT_OPTIONS = {
	debug: false,
	useAlternateScreen: true,
	leaveTopRowAvailable: true, // not applicable when using alternate screen
	colorScheme: 'default',
	cdWhenEmpty: false
};

class Vats extends EventEmitter {
	constructor(ui, structure, options = {}) {
		super();

		this.options = this._parseOptions(options);

		const defaultUIs = ['tree'];

		if (ui instanceof BaseUI) {
			this.ui = ui;
		} else if (ui === 'tree') {
			this.ui = new TreeUI(structure);
		} else if (typeof ui === 'string' && !defaultUIs.includes(ui)) {
			throw new Error(`Not a default ui: "${ui}".`);
		}

		this._onKeypress = this._onKeypress.bind(this);

		this._stdinListeners = null;
		this._lastSearchQuery = null;
		this._lastSearchDir = 1;

		this.colorScheme = colorScheme;
		this.keymapper = new Keymapper();
		this.commandMode = new CommandMode();
		this.viCursorNavigation = new ViCursorNavigation();
		this.searcher = new Searcher();

		this.setColorScheme(this.options.colorScheme);
		this.keymapper.addKeymap(new Map(Object.entries(require('./keymap.json'))));
	}

	_parseOptions(options) {
		return deepmerge.all([{}, DEFAULT_OPTIONS, options]);
	}

	_onKeypress(char, key) {
		this.emitEvent('keypress', { char, key });
	}

	// TODO: return whether a change was made
	setColorScheme(scheme) {
		this.colorScheme.use(scheme);
	}

	init() {
		if (this.options.useAlternateScreen) {
			this.enterAlternateScreen();
		}

		process.stdin.resume();
		process.stdin.setRawMode(true);
		emitKeypressEvents(process.stdin);
		process.stdin.addListener('keypress', this._onKeypress);

		this.ui.init(this, this.options);
	}

	render() {
		this.ui.render(...arguments);
	}

	/**
	 * All events will be emitted via this method.
	 *
	 * Some events are cancellable by calling Event#preventDefault(). Unless the
	 * event is prevented, default behavior will be called for that event via its
	 * own #_defaultBehaviorForEVENT() method.
	 *
	 * List of events emitted:
	 * - "start" -- when the program begins.
	 * - "keypress" -- when the user enters a key.
	 * - "cd" -- when the currentNode changes.
	 * - "highlight" -- when a new node is highlighted with the cursor.
	 * - "select" -- when a new node is selected with the cursor.
	 * - "command" -- when a command or input is entered via CommandMode.
	 * - "scroll" -- when the 'current' division scrolls.
	 *
	 * All events are emitted before the next render occurs. Hmm...
	 * TODO: emit with context data
	 */
	emitEvent(eventName, data = {}) {
		const event = new Event(eventName, Object.assign({ vats: this }, data));

		this.emit(eventName, event);

		if (!event.isDefaultPrevented()) {
			this._defaultBehaviorForEvent(event);
		}
	}

	/**
	 * Only applies to certain events that could conceivably cause unwanted
	 * behavior by default. Each relevant event has its own method to handle
	 * default behavior.
	 */
	_defaultBehaviorForEvent(event) {
		if (event.type === 'command') {
			this._defaultBehaviorForCommand(event);
		} else if (event.type === 'keypress') {
			this._defaultBehaviorForKeypress(event);
		} else if (event.type === 'keybinding') {
			this._defaultBehaviorForKeybinding(event);
		}
	}

	_defaultBehaviorForCommand({ argv, commandString, commandPrompt, fyis }) {
		const command = argv._[0];

		if (['h', 'help'].includes(command)) {
			this.pager('showing VATS help screen');
		} else if (['exit', 'q', 'quit'].includes(command)) {
			this.quit();
		} else if (['redraw', 'render'].includes(command)) {
			this.render(true);
		} else if (command === 'search') {
			const count = commandPrompt === '?' ? -1 : 1;
			const query = argv._.slice(1).join(' ');

			this.search(query, count);

			this._lastSearchQuery = query;
			this._lastSearchDir = count > 0 ? 1 : -1;
		} else if (fyis.get('command-not-found')) {
			const cmd = typeof fyis.get('command-not-found') === 'string' ?
				fyis.get('command-not-found') : command;
			this.emitEvent('command-not-found', { command: cmd });
		}
	}

	_defaultBehaviorForKeypress({ char, key }) {
		// ctrl+c
		if (key.sequence === '\u0003') {
			return this.quit();
		}

		const keymapData = this.keymapper.handleKey({ char, key });

		if (this.keymapper.isReading()) {
			return;
		}

		if (keymapData) {
			this.emitEvent('keybinding', keymapData);
		} else if ([':', '/', '?'].includes(char)) {
			this.enterCommandMode({ prompt: char }).then(commandData => {
				if (!commandData) {
					return;
				}

				if (['/', '?'].includes(commandData.commandPrompt)) {
					commandData.argv._.unshift('search');
				}

				this.emitEvent('command', commandData);
			}).catch(e => this._catchError(e));
		}
	}

	_defaultBehaviorForKeybinding({ keyString, keyAction, count, charsRead }) {
		if (keyAction.includes('vi:')) {
			this.ui.handleViKeybinding(...arguments);
		} else if (keyAction === 'search-next' && this._lastSearchQuery) {
			this.search(this._lastSearchQuery, count * this._lastSearchDir);
		} else if (keyAction === 'search-previous' && this._lastSearchQuery) {
			this.search(this._lastSearchQuery, -count * this._lastSearchDir);
		}
	}

	async pager(string) {
		this.emitEvent('pager:enter');

		if (this.options.useAlternateScreen) {
			this.exitAlternateScreen();
		}

		await pager(string);

		if (this.options.useAlternateScreen) {
			this.enterAlternateScreen();
		}

		this.emitEvent('pager:exit');
	}

	enterAlternateScreen() {
		spawnSync('tput smcup', { shell: true, stdio: 'inherit' });
	}

	exitAlternateScreen() {
		spawnSync('tput rmcup', { shell: true, stdio: 'inherit' });
	}

	async prompt(prompt) {
		const output = await this.enterCommandMode({ prompt });
		return output ? output.commandString : '';
	}

	/**
	 * Removes all keypress listeners on stdin. Once command mode is finished, add
	 * them back in.
	 * @param {Object} commandModeOptions - Options to run CommandMode with. See
	 * CommandMode#run.
	 */
	async enterCommandMode(commandModeOptions) {
		this.emitEvent('command-mode:enter');

		this._stdinListeners = process.stdin.listeners('keypress');
		for (const listener of this._stdinListeners) {
			process.stdin.removeListener('keypress', listener);
		}

		process.stdout.write(
			ansiEscapes.cursorSavePosition +
			ansiEscapes.cursorShow +
			ansiEscapes.cursorTo(0, termSize().rows)
		);

		const output = await this.commandMode.run(commandModeOptions);

		process.stdin.resume();
		process.stdin.setRawMode(true);

		for (const listener of this._stdinListeners) {
			process.stdin.addListener('keypress', listener);
		}

		process.stdout.write(
			ansiEscapes.cursorLeft +
			ansiEscapes.eraseLine +
			ansiEscapes.cursorHide +
			ansiEscapes.cursorRestorePosition
		);

		this.emitEvent('command-mode:exit');

		return Promise.resolve(output);
	}

	search(query, count = 1) {
		if (count === 0) {
			return;
		}

		this.ui.search(query, count);
	}

	destroy() {
		this.ui.destroy();
		this.commandMode.destroy();
		this.viCursorNavigation.destroy();

		this.options = this._count = this._lastChar = null;
		this._stdinListeners = null;

		process.stdin.removeListener('keypress', this._onKeypress);
	}

	exit() {
		this.quit();
	}

	quit() {
		this.ui.quit();

		if (this.options.useAlternateScreen) {
			this.exitAlternateScreen();
		}

		this.destroy();
		process.exit();
	}

	_catchError(e) {
		this.pager(e.stack);
	}
}

module.exports = Vats;
