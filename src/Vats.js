const { EventEmitter } = require('events');
const { emitKeypressEvents } = require('readline');
const minimist = require('minimist');
const { parseArgsStringToArgv } = require('string-argv');
const ansiEscapes = require('ansi-escapes');
const { Keybinder } = require('../../composable-keybindings');
const NodeListener = require('../../composable-keybindings/src/utils/NodeListener');
const Event = require('./Event');
const ViStateHandler = require('./ViStateHandler');
const Searcher = require('./Searcher');
const PromptMode = require('./PromptMode');
const keybindings = require('./keybindings');

const DEFAULT_OPTIONS = {
	// should CommandMode be on bottom left of screen like vim?
	commandModeOnBottom: true,

	// @type function, optional
	getViState: null,

	// @type function, optional
	getSearchableItems: null,

	// @type function, optional
	// TODO: meh
	getSearchOptions: null
};

class Vats extends EventEmitter {
	constructor(options = {}) {
		super();

		this.options = { ...DEFAULT_OPTIONS, ...options };

		this._onKeypress = this._onKeypress.bind(this);
		this._onKeybinding = this._onKeybinding.bind(this);
		this._onSigStop = this._onSigStop.bind(this);
		this._onSigTerm = this._onSigTerm.bind(this);
		this._onSigInt = this._onSigInt.bind(this);
		this._onSigCont = this._onSigCont.bind(this);

		this.isKeypressEnabled = null;
		this._lastSearchQuery = null;
		this._lastSearchDir = 1;
		this._isPrompting = false;

		this.keybinder = new Keybinder(keybindings, this._onKeybinding);
		this.promptMode = new PromptMode();
		this.viStateHandler = new ViStateHandler();
		this.searcher = new Searcher();

		this.nodeListener = new NodeListener(this._onKeypress, {
			autoFormat: true,
			onSigStop: this._onSigStop
		});

		process.on('SIGTERM', this._onSigTerm);
		process.on('SIGINT', this._onSigInt);
		process.on('SIGCONT', this._onSigCont);
	}

	async prompt(promptModeOptions = {}) {
		this._isPrompting = true;
		!promptModeOptions.enableKeypressEvents && this.nodeListener.end();
		const input = await this.promptMode.run(promptModeOptions);
		this.nodeListener.start();
		this._isPrompting = false;
		return input;
	}

	async enterCommandMode(promptModeOptions = {}) {
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

		return { input, argv: this.parseArguments(input) };
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
		!event.isDefaultPrevented() && this._defaultBehaviorForEvent(event);
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

		const match = /^search|search-next|search-previous/.test(command);
		if (this.options.getSearchableItems && match) {
			const query = argv._.slice(1).join(' ');
			const count = /search-next/.test(command) ? 1 : -1;

			this._search(query, count, true);
		}
	}

	_onKeypress(char, key) {
		this.emitEvent('keypress', { char, key });
	}

	_defaultBehaviorForKeypress({ char, key }) {
		if (this._isPrompting) {
			return;
		}
		this.keybinder.handleKey(key.formatted);
	}

	_onKeybinding(type, kb, status) {
		type === 'keybinding' && this.emitEvent('keybinding', { kb });
	}

	_defaultBehaviorForKeybinding({ kb }) {
		if (/^search-(next|previous)$/.test(kb.action.name) && this._lastSearchQuery) {
			this._onKeybindingSearch(kb);
		} else if (this.options.getViState && this.viStateHandler.map.has(kb.action.name)) {
			this._onKeybindingChangeState(kb);
		} else if (kb.action.name === 'enter-command-mode') {
			this._onKeybindingCommandMode(kb);
		}
	}

	_onKeybindingSearch(kb) {
		const match = /^search-(next|previous)$/.exec(kb.action.name);
		const dir = match[1] === 'next' ? 1 : -1;
		this._search(this._lastSearchQuery, kb.count * dir * this._lastSearchDir);
	}

	_onKeybindingChangeState(kb) {
		const state = this.options.getViState();
		const previousState = { ...state };
		const stateChanged = this.viStateHandler.applyAction(state, kb.action.name, kb.count);
		stateChanged && this.emitEvent('state-change', { state, previousState });
	}

	_onKeybindingCommandMode(kb) {
		this.emitEvent('command-mode:enter');

		const prompt = kb.keys[kb.keys.length - 1];
		const onBottom = this.options.commandModeOnBottom;

		this.enterCommandMode({ prompt, onBottom }).then(data => {
			this.emitEvent('command-mode:exit');
			kb.action.command && data.argv._.unshift(kb.action.command);
			this.emitEvent('command', data);
		}).catch(console.log);
	}

	setState(state, target) {
		return this.viStateHandler.setState(...arguments);
	}

	/**
	 * TODO: this is out of date.
	 *
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
		this.keybinder.map.set(keyString, action);

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
		this.emitEvent('close');
		this.nodeListener && this.nodeListener.end();
		this.destroy();
	}

	_onSigTerm() {
		this.emitEvent('sigterm');
		this._onSignalTermOrInt();
	}

	_onSigInt() {
		this.emitEvent('sigint');
		this._onSignalTermOrInt();
	}

	_onSignalTermOrInt() {
		this.quit();
	}

	_onSigCont() {
		this.emitEvent('sigcont');
	}

	_onSigStop() {
		this.emitEvent('sigstop');
	}

	destroy() {
		const destroyables = ['keybinder', 'nodeListener', 'promptMode', 'viStateHandler', 'searcher'];
		for (const instanceKey of destroyables) {
			this[instanceKey] && this[instanceKey].destroy();
			this[instanceKey] = null;
		}

		this.options = this._count = null;

		this.removeAllListeners();
	}
}

module.exports = Vats;
