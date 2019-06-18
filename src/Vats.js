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
	childDivWrapping: {
		overflowX: 'scroll'
	}
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
			spawnSync('tput smcup', [], { shell: true, stdio: 'inherit' });
		}

		process.stdin.resume();
		process.stdin.setRawMode(true);
		emitKeypressEvents(process.stdin);
		process.stdin.addListener('keypress', this._onKeypress);

		this.ui.init(this, this.options);
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
			this.printToPager('showing VATS help screen');
		} else if (['exit', 'q', 'quit'].includes(command)) {
			this.quit();
		} else if (['redraw', 'render'].includes(command)) {
			this.update('all');
			this.render();
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

	// TODO: rename #logToPager
	printToPager(string) {
		this.emitEvent('pager:enter');

		if (this.options.useAlternateScreen) {
			spawnSync('tput rmcup', [], { shell: true, stdio: 'inherit' });
		}

		pager(string).then(() => {
			if (this.options.useAlternateScreen) {
				spawnSync('tput smcup', [], { shell: true, stdio: 'inherit' });
			}

			this.emitEvent('pager:exit');
		});
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
		if (this.options.useAlternateScreen) {
			spawnSync('tput rmcup', [], { shell: true, stdio: 'inherit' });
		}

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
		this.destroy();
		process.exit();
	}

	_catchError(e) {
		this.printToPager(e.stack);
	}

	// update(idOrNode) {
	// 	const divisionIds = this._getAffectedDivisionsFor(idOrNode);

	// 	for (const id of divisionIds) {
	// 		if (['parent', 'current', 'child'].includes(id)) {
	// 			this._setupDiv(id);
	// 		} else {
	// 			this.jumper.setDirty(id);
	// 		}
	// 	}

	// 	this.currentNode.parent && this.currentNode.parent.update();
	// 	this.currentNode.update();
	// 	const child = this.currentNode.getHighlightedChild();
	// 	child && child.update();

	// 	this._setupDiv('child');

	// 	this._colorNodeCurrentChild('current', this.currentNode);

	// 	this.viCursorNavigation.clearSearchCache();
	// }

	// render(idOrNode) {
	// 	const divisionIds = this._getAffectedDivisionsFor(idOrNode);

	// 	for (const divisionId of divisionIds) {
	// 		this.jumper.setNeedsRender(divisionId);
	// 	}

	// 	process.stdout.write(this._render() + ansiEscapes.cursorHide);
	// }

	/**
	 * Important: "visible" means any children that are inside the "current"
	 * column. This does not change even if the "info" container overlaps
	 * "current" column.
	 */
	// getVisibleChildrenFor(node) {
	// 	if (node === 'parent') node = this.currentNode.parent;
	// 	if (node === 'current') node = this.currentNode;
	// 	if (node === 'chidl') node = this.currentNode.getHighlightedChild();

	// 	return node.getVisibleChildren(...this.getVisibleChildIndicesFor(node));
	// }

	// getVisibleChildIndicesFor(node) {
	// 	let column = node;

	// 	if (node === this.currentNode.parent) column = 'parent';
	// 	if (node === this.currentNode) column = 'current';
	// 	if (node === this.currentNode.getHighlightedChild()) column = 'child';

	// 	if (!['parent', 'current', 'child'].includes(column)) {
	// 		throw new Error(`Could not find column associated with "${node}".`);
	// 	}

	// 	const div = this.jumper.getDivision(column);
	// 	return [div.scrollPosY(), div.scrollPosY() + div.height()];
	// }

	// _getAffectedDivisionsFor(idOrNode) {
	// 	if (!idOrNode) {
	// 		return [];
	// 	} else if (idOrNode === 'all') {
	// 		const all = ['header', 'parent', 'current', 'child', 'info'];
	// 		return this.jumper.hasDivision('lines') ? ['lines', ...all] : all;
	// 	} else if (typeof idOrNode === 'string') {
	// 		return idOrNode.trim().split(/\s/);
	// 	} else if (idOrNode instanceof Node) {
	// 		return [this._getDivisionIdFromNode(idOrNode)];
	// 	} else if (Array.isArray(idOrNode)) {
	// 		return idOrNode
	// 			.map(item => this._getAffectedDivisionsFor(item)[0])
	// 			.filter(item => !!item);
	// 	}
	// }

	// _getDivisionIdFromNode(node) {
	// 	if (node === this.currentNode.parent) {
	// 		return 'parent';
	// 	} else if (node === this.currentNode) {
	// 		return 'current';
	// 	} else if (node === this.currentNode.getHighlightedChild()) {
	// 		return 'child';
	// 	}

	// 	return null;
	// }

	// _getNodeFromDivisionId(divisionId) {
	// 	if (divisionId === 'parent') {
	// 		return this.currentNode.parent;
	// 	} else if (divisionId === 'current') {
	// 		return this.currentNode;
	// 	} else if (divisionId === 'child') {
	// 		return this.currentNode.getHighlightedChild();
	// 	}

	// 	return null;
	// }

}

module.exports = Vats;
