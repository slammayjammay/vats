const { EventEmitter } = require('events');
const { emitKeypressEvents } = require('readline');
const minimist = require('minimist');
const { parseArgsStringToArgv } = require('string-argv');
const ansiEscapes = require('ansi-escapes');
const Event = require('./Event');
const InputHandler = require('./InputHandler');
const ViStateHandler = require('./ViStateHandler');
const Searcher = require('./Searcher');
const PromptMode = require('./PromptMode');

const DEFAULT_OPTIONS = {
	// should CommandMode be on bottom left of screen like vim?
	commandModeOnBottom: true,

	// @type function, optional
	getViState: null,

	// @type function, optional
	getSearchableItems: null,

	// @type function, optional
	getSearchOptions: null
};

/**
 * TODO: registers
 */
class Vats extends EventEmitter {
	constructor(options = {}) {
		super();

		this.options = { ...DEFAULT_OPTIONS, ...options };

		this._onKeypress = this._onKeypress.bind(this);
		this._onSigTerm = this._onSigTerm.bind(this);
		this._onSigInt = this._onSigInt.bind(this);
		this._onSigCont = this._onSigCont.bind(this);

		this.isKeypressEnabled = null;
		this._lastSearchQuery = null;
		this._lastSearchDir = 1;

		this.inputHandler = new InputHandler();
		this.promptMode = new PromptMode();
		this.viStateHandler = new ViStateHandler();
		this.searcher = new Searcher();

		this.inputHandler.mergeKeybinding(require('./keybindings'));

		emitKeypressEvents(process.stdin);
		process.stdin.resume();
		this.addKeypressListeners();
		this.setRawMode(true);

		process.on('SIGTERM', this._onSigTerm);
		process.on('SIGINT', this._onSigInt);
		process.on('SIGCONT', this._onSigCont);
	}

	_onKeypress(char, key) {
		const formatted = this.inputHandler.formatCharKey(char, key);
		this.emitEvent('keypress', { char, key, formatted });
	}

	setRawMode() {
		// will cause keypress events not to fire
		return process.stdin.setRawMode(...arguments);
	}

	removeKeypressListeners() {
		// removes SIGINT listening!
		process.stdin.removeListener('keypress', this._onKeypress);
		this.isKeypressEnabled = false;
	}

	addKeypressListeners() {
		process.stdin.addListener('keypress', this._onKeypress);
		this.isKeypressEnabled = true;
	}

	async prompt(promptModeOptions) {
		const wasKeypressEnabled = this.isKeypressEnabled;

		wasKeypressEnabled && this.removeKeypressListeners();
		const input = await this.promptMode.run(promptModeOptions);
		wasKeypressEnabled && this.addKeypressListeners();

		return input;
	}

	async enterCommandMode(promptModeOptions) {
		promptModeOptions = {
			cancelWhenEmpty: true,
			onBottom: true,
			...promptModeOptions
		};

		promptModeOptions.onBottom && process.stdout.write(
			ansiEscapes.cursorSavePosition +
			ansiEscapes.cursorTo(0, process.stdout.rows)
		);

		const input = await this.prompt(promptModeOptions);

		promptModeOptions.onBottom && process.stdout.write(
			ansiEscapes.cursorLeft +
			ansiEscapes.eraseLine +
			ansiEscapes.cursorRestorePosition
		);

		return {
			input,
			argv: this.parseArguments(input)
		};
	}

	parseArguments(string) {
		return minimist(parseArgsStringToArgv(string));
	}

	/**
	 * All events should be emitted via this method.
	 *
	 * Some events are cancellable by calling Event#preventDefault(). Unless the
	 * event is prevented, default behavior will be called for that event via its
	 * own #_defaultBehaviorForEVENT() method.
	 */
	emitEvent(eventName, data = {}) {
		const event = new Event(eventName, data);

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
		if (event.name === 'command') {
			this._defaultBehaviorForCommand(event);
		} else if (event.name === 'keypress') {
			this._defaultBehaviorForKeypress(event);
		} else if (event.name === 'keybinding') {
			this._defaultBehaviorForKeybinding(event);
		}
	}

	_defaultBehaviorForCommand({ argv, commandString }) {
		const command = argv._[0];

		if (typeof command !== 'string') {
			return;
		}

		const match = /^search|search-next|search-previous/.exec(command);
		if (this.options.getSearchableItems && match) {
			const count = /search-next/.test(command) ? 1 : -1;
			const query = argv._.slice(1).join(' ');

			this._search(query, count, true);
		}
	}

	_defaultBehaviorForKeypress({ char, key }) {
		// ctrl+c -- SIGINT
		if (key.sequence === '\u0003') {
			process.kill(process.pid, 'SIGINT');
			return;
		}

		// ctrl+z -- SIGSTOP
		if (key.sequence === '\u001a') {
			this._beforeSigStop();
			process.kill(process.pid, 'SIGSTOP');
			return;
		}

		const keybindingObject = this.inputHandler.handleCharKey(char, key);

		if (keybindingObject && !this.inputHandler.isReading) {
			this.emitEvent('keybinding', keybindingObject);
		}
	}

	_defaultBehaviorForKeybinding({ keyString, action, count, readResults, ...rest }) {
		const match = /^search-(next|previous)$/.exec(action);
		if (match && this._lastSearchQuery) {
			const dir = match[1] === 'next' ? 1 : -1;
			this._search(this._lastSearchQuery, count * dir * this._lastSearchDir);
			return;
		}

		if (
			this.options.getViState &&
			this.viStateHandler.canCalculateTargetState(action, count, readResults)
		) {
			const state = this.options.getViState();
			const stateChanged = this.applyActionToState(state, action, count, readResults);
			stateChanged && this.emitEvent('state-change', { state });
			return;
		}

		if (action === 'enter-command-mode') {
			this.emitEvent('command-mode:enter');

			this.enterCommandMode({
				prompt: keyString,
				onBottom: this.options.commandModeOnBottom
			}).then(data => {
				this.emitEvent('command-mode:exit');
				rest.commandAlias && data.argv._.unshift(rest.commandAlias);
				this.emitEvent('command', data);
			}).catch(console.log);
		}
	}

	setState(state, target) {
		return this.viStateHandler.setState(...arguments);
	}

	applyActionToState(state, action, count, readResults) {
		return this.viStateHandler.applyActionToState(...arguments);
	}

	/**
	 * Maps the pressed key(s) to the given action, and optionally specifies how
	 * to modify viState.
	 *
	 * Example:
	 * setKeybinding('j', 'cursor-down', (state, count) => ({ cursorY: state.cursorY + count }));
	 * // - fire a keybinding event when "j" is pressed
	 * // - keybinding action is "cursor-down"
	 * // - when this keybinding is fired, modify viState to values returned by
	 * //   the callback
	 *
	 * @param {string} keyString - The character string to match key(s) against.
	 * @param {string} action - The keybinding action to fire.
	 * @param {function} [getTargetStateFn] - The function to determine the
	 * desired target state. Only applicable if `options.getViState` is given.
	 */
	setKeybinding(keyString, action, getTargetStateFn) {
		this.inputHandler.set(keyString, action);

		if (typeof getTargetStateFn === 'function') {
			this.viStateHandler.set(action, getTargetStateFn);
		}
	}

	/**
	 * Public use only.
	 */
	search(query, items, options) {
		if (!items && this.getSearchableItems) {
			items = this.getSearchableItems();
		}
		if (!options && this.getSearchOptions) {
			options = this.getSearchOptions();
		}

		return this.searcher.search(items, query, options);
	}

	/**
	 * Internal use only. Will always emit 'search' event.
	 */
	_search(query, count = 1, changeDirection) {
		const items = this.options.getSearchableItems();

		if (!items) {
			throw new Error(`No searchable items given (received: "${items}").`);
		}

		const options = this.options.getSearchOptions && this.options.getSearchOptions(items);
		const index = this.searcher.search(items, query, { count, ...options });

		this.emitEvent('search', { index });

		this._lastSearchQuery = query;

		if (changeDirection) {
			this._lastSearchDir = count > 0 ? 1 : -1;
		}
	}

	exit() {
		this.quit();
	}

	quit() {
		process.stdin.setRawMode(false);
		process.stdin.pause();

		this.emitEvent('close');

		this.destroy();
	}

	_onSigTerm() {
		this.emitEvent('SIGTERM');
		this._onSignalTermOrInt();
	}

	_onSigInt() {
		this.emitEvent('SIGINT');
		this._onSignalTermOrInt();
	}

	_onSignalTermOrInt() {
		this.quit();
	}

	_onSigCont() {
		process.stdin.setRawMode(true);
		this.emitEvent('SIGCONT');
	}

	_beforeSigStop() {
		process.stdin.setRawMode(false);
		this.emitEvent('before-sig-stop');
	}

	destroy() {
		const destroyables = ['inputHandler', 'promptMode', 'viStateHandler', 'searcher'];
		for (const instanceKey of destroyables) {
			if (this[instanceKey]) {
				this[instanceKey].destroy();
				this[instanceKey] = null;
			}
		}

		this.options = this._count = null;

		process.stdin.removeListener('keypress', this._onKeypress);

		this.removeAllListeners();
	}
}

module.exports = Vats;
