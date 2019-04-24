const { spawnSync } = require('child_process');
const { EventEmitter } = require('events');
const { emitKeypressEvents } = require('readline');
const deepmerge = require('deepmerge');
const cliTruncate = require('cli-truncate');
const stringWidth = require('string-width');
const chalk = require('chalk');
const ansiEscapes = require('ansi-escapes');
const TerminalJumper = require('../../terminal-jumper');
const pager = require('node-pager');
const termSize = require('term-size');
const Event = require('./Event');
const CursorNavigation = require('./CursorNavigation');
const CommandMode = require('./CommandMode');
const colorScheme = require('./color-scheme');
const Node = require('./Node');

const DEFAULT_OPTIONS = {
	debug: false,
	showLineNumbers: true,
	useAlternateScreen: true,
	leaveTopRowAvailable: true, // not applicable when using alternate screen
	emitEventsOnNodes: [],
	colorScheme: 'default',
	childDivWrapping: {
		overflowX: 'scroll'
	}
};

const DIMENSIONS = {
	linesWidth: 3,
	parentWidth: '15%',
	currentWidth: '40%' ,
	childWidth: '45%'
};

class Vats extends EventEmitter {
	constructor(tree, options = {}) {
		if (!tree || !(tree instanceof Node)) {
			throw new Error('Must provide a valid instance of Node.');
		}

		super();

		this.options = this._parseOptions(options);
		this.tree = this.currentNode = tree;

		this._onKeypress = this._onKeypress.bind(this);

		this._count = '0';
		this._lastChar = '';
		this._lineNumCached = null;
		this._stdinListeners = null;

		this._colorScheme = colorScheme;
		this._cursorNavigation = new CursorNavigation();
		this._commandMode = new CommandMode();

		this.jumper = this._createJumper();

		this.showLineNumbers(this.options.showLineNumbers);
		this.setColorScheme(this.options.colorScheme);
		this.setChildDivWrapping(this.options.childDivWrapping);
	}

	_parseOptions(options) {
		options = deepmerge.all([{}, DEFAULT_OPTIONS, options]);

		if ([true, 'all'].includes(options.emitEventsOnNodes)) {
			options.emitEventsOnNodes = true;
		} else if (typeof options.emitEventsOnNodes === 'string') {
			options.emitEventsOnNodes = string.trim().split(/\s+/);
		} else if (!Array.isArray(options.emitEventsOnNodes)) {
			options.emitEventsOnNodes = false;
		}

		return options;
	}

	_createJumper() {
		const jumper = new TerminalJumper({
			leaveTopRowAvailable: (this.options.useAlternateScreen ? false : this.options.leaveTopRowAvailable),
			divisions: [
				{ id: 'header', top: 0, left: 0, width: '100%', height: 1, overflowX: 'scroll' },
				{ id: 'parent', bottom: 1, left: 0, width: DIMENSIONS.parentWidth, height: '100% - 2', overflowX: 'scroll' },
				{ id: 'current', bottom: 1, left: 'parent', width: DIMENSIONS.currentWidth, height: '100% - 2', overflowX: 'scroll' },
				{ id: 'child', bottom: 1, left: 'current', width: DIMENSIONS.childWidth, height: '100% - 2' },
				{ id: 'info', bottom: 0, left: 0, width: '100%', renderOrder: 2 }
			],
			debug: this.options.debug
		});

		jumper.addBlock('header.header');
		jumper.addBlock('info.info');

		return jumper;
	}

	/**
	 * @param {boolean} bool - whether to show line numbers.
	 * @return {boolean} - whether the line numbers were toggled.
	 */
	showLineNumbers(bool) {
		const hasDivision = this.jumper.hasDivision('lines');
		const currentOptions = this.jumper.getDivision('current').options;
		const childOptions = this.jumper.getDivision('child').options;

		let hasChanged = false;

		if (bool && !hasDivision) {
			// need to add lines division
			this.jumper.addDivision({ id: 'lines', top: 'header', left: 'parent', width: DIMENSIONS.linesWidth, overflowX: 'scroll', renderOrder: 1 });
			currentOptions.left = 'lines';
			childOptions.width = `${DIMENSIONS.childWidth} - ${DIMENSIONS.linesWidth}`;
			hasChanged = true;
		} else if (!bool && hasDivision) {
			// need to remove lines division
			this.jumper.removeDivision('lines');
			currentOptions.left = 'parent';
			childOptions.width = DIMENSIONS.childWidth;
			hasChanged = true;
		}

		if (hasChanged) {
			this._lineNumCached = null;
		}

		return hasChanged;
	}

	// TODO: return whether a change was made
	setColorScheme(scheme) {
		this._colorScheme.setColorScheme(scheme);
	}

	// TODO: return whether a change was made
	setChildDivWrapping({ overflowX = 'wrap', wrapOnWord = false }) {
		const div = this.jumper.getDivision('child');
		div.options.overflowX = overflowX;
		div.options.wrapOnWord = wrapOnWord;
		this.update('child');
	}

	run() {
		if (this.options.useAlternateScreen) {
			spawnSync('tput smcup', [], { shell: true, stdio: 'inherit' });
		}

		process.stdout.write(ansiEscapes.cursorHide);
		process.stdin.resume();
		process.stdin.setRawMode(true);
		emitKeypressEvents(process.stdin);
		process.stdin.addListener('keypress', this._onKeypress);

		this.currentNode.setHighlighted(0);
		this.cd(this.currentNode);

		this._emit('start', this.currentNode);
		this.render();
	}

	/**
	 * "cd" into the given node and setup up all columns. Only updates the current
	 * state, does not actually render it.
	 *
	 * TODO: can some of this logic be consolidated into `#update?`
	 * TODO: should cd events be cancellable?
	 */
	cd(node) {
		if (node.getChildren().length === 0) {
			return;
		}

		this.currentNode.scrollPosY = this.jumper.getDivision('current').scrollPosY();
		this.currentNode = node;

		this._lineNumCached = null;
		this._cursorNavigation.clearSearchCache();

		this._setupDiv('parent');
		if (this.currentNode.parent) {
			this.currentNode.parent.setHighlighted(this.currentNode);
			this.jumper.getDivision('parent').scrollY(this.currentNode.parent.scrollPosY);
		}

		this._setupDiv('current');
		this.jumper.getDivision('current').scrollY(this.currentNode.scrollPosY);

		if (this.currentNode.getHighlightedChild()) {
			this._setupDiv('child');
			const childNode = this.currentNode.getHighlightedChild();
			this.jumper.getDivision('child').scrollY(childNode.scrollPosY);
		}

		this._emit('cd', this.currentNode);

		if (this.currentNode.getHighlightedChild()) {
			this._emit('highlight', node.getHighlightedChild());
		}
	}

	setCurrentNode(node) {
		this.currentNode = node;
		this.update('all');
	}

	update(idOrNode) {
		const divisionIds = this._getAffectedDivisionsFor(idOrNode);

		for (const id of divisionIds) {
			if (['parent', 'current', 'child'].includes(id)) {
				this._setupDiv(id);
			} else {
				this.jumper.setDirty(id);
			}
		}

		this.currentNode.parent && this.currentNode.parent.update();
		this.currentNode.update();
		const child = this.currentNode.getHighlightedChild();
		child && child.update();

		this._setupDiv('child');

		this._colorNodeCurrentChild('current', this.currentNode);

		this._cursorNavigation.clearSearchCache();
	}

	/**
	 * @param {number} idx - The index out of node.getChildren().
	 */
	updateChild(node, idx) {
		if (Array.isArray(idx)) {
			idx.forEach(i => this.updateChild(i));
			return;
		}

		let column;

		if (node === this.currentNode.parent) column = 'parent';
		if (node === this.currentNode) column = 'current';
		if (node === this.currentNode.getHighlightedChild()) column = 'child';

		this._setChildBlockContent(column, node, idx);
	}

	render(idOrNode) {
		const divisionIds = this._getAffectedDivisionsFor(idOrNode);

		for (const divisionId of divisionIds) {
			this.jumper.setNeedsRender(divisionId);
		}

		process.stdout.write(this._render() + ansiEscapes.cursorHide);
	}

	setHeader(string) {
		const block = this.jumper.getBlock('header.header');
		block.content(colorScheme.colorHeader(string));
	}

	async printToPager(string) {
		if (this.options.useAlternateScreen) {
			spawnSync('tput rmcup', [], { shell: true, stdio: 'inherit' });
		}

		pager(string).then(() => {
			process.stdout.write(ansiEscapes.cursorHide);

			if (this.options.useAlternateScreen) {
				spawnSync('tput smcup', [], { shell: true, stdio: 'inherit' });
			}

			this.render('all');
		});
	}

	info(string, options) {
		if (string.split('\n').length >= this.jumper.getAvailableHeight()) {
			this.printToPager(string);
		} else {
			this.setInfo(string, options);
			this.render();
		}
	}

	warn(string) {
		this.info(string, { warn: true });
	}

	setInfo(string = '', options = {}) {
		const hasBlock = this.jumper.hasBlock('info.info');

		if (options.warn) {
			string = colorScheme.colorInfoWarn(string);
		}

		if (options.header !== undefined) {
			this.setInfoHeader(options.header);
		}

		const div = this.jumper.getDivision('info');
		const oldDivHeight = div.height();

		const block = this.jumper[hasBlock ? 'getBlock' : 'addBlock']('info.info', '');
		string === '' ? block.remove() : block.content(string);

		if (div.height() !== oldDivHeight) {
			for (const divisionId of this._getAffectedDivisionsFor('all')) {
				this.jumper.setNeedsRender(divisionId);
			}
		}
	}

	setInfoHeader(string) {
		const hasBlock = this.jumper.hasBlock('info.header');

		if (!string) {
			hasBlock && this.jumper.removeBlock('info.header');
			return;
		}

		const block = this.jumper[hasBlock ? 'getBlock' : 'addBlock']('info.header', '', 0);

		const div = this.jumper.getDivision('info');
		string += (new Array(div.contentWidth() - stringWidth(string))).join(' ');

		block.content(colorScheme.colorInfoHeader(string));
	}

	/**
	 * Important: "visible" means any children that are inside the "current"
	 * column. This does not change even if the "info" container overlaps
	 * "current" column.
	 */
	getVisibleChildrenFor(node) {
		if (node === 'parent') node = this.currentNode.parent;
		if (node === 'current') node = this.currentNode;
		if (node === 'chidl') node = this.currentNode.getHighlightedChild();

		return node.getVisibleChildren(...this.getVisibleChildIndicesFor(node));
	}

	getVisibleChildIndicesFor(node) {
		let column = node;

		if (node === this.currentNode.parent) column = 'parent';
		if (node === this.currentNode) column = 'current';
		if (node === this.currentNode.getHighlightedChild()) column = 'child';

		if (!['parent', 'current', 'child'].includes(column)) {
			throw new Error(`Could not find column associated with "${node}".`);
		}

		const div = this.jumper.getDivision(column);
		return [div.scrollPosY(), div.scrollPosY() + div.height()];
	}

	_getAffectedDivisionsFor(idOrNode) {
		if (!idOrNode) {
			return [];
		} else if (idOrNode === 'all') {
			const all = ['header', 'parent', 'current', 'child', 'info'];
			return this.jumper.hasDivision('lines') ? ['lines', ...all] : all;
		} else if (typeof idOrNode === 'string') {
			return idOrNode.trim().split(/\s/);
		} else if (idOrNode instanceof Node) {
			return [this._getDivisionIdFromNode(idOrNode)];
		} else if (Array.isArray(idOrNode)) {
			return idOrNode
				.map(item => this._getAffectedDivisionsFor(item)[0])
				.filter(item => !!item);
		}
	}

	_getDivisionIdFromNode(node) {
		if (node === this.currentNode.parent) {
			return 'parent';
		} else if (node === this.currentNode) {
			return 'current';
		} else if (node === this.currentNode.getHighlightedChild()) {
			return 'child';
		}

		return null;
	}

	_getNodeFromDivisionId(divisionId) {
		if (divisionId === 'parent') {
			return this.currentNode.parent;
		} else if (divisionId === 'current') {
			return this.currentNode;
		} else if (divisionId === 'child') {
			return this.currentNode.getHighlightedChild();
		}

		return null;
	}

	_getContextForDivision(division) {
		if (typeof division === 'string') {
			division = this.jumper.getDivision(division);
		}

		return {
			id: division.options.id,
			width: division.contentWidth() - 1
		};
	}

	/**
	 * TODO: performance when lots of children are present (looking at you node_modules)
	 */
	_setupDiv(divisionId) {
		if (!['parent', 'current', 'child'].includes(divisionId)) {
			throw new Error(`divisionId must be either "parent", "current", or "child" (received "${divisionId}").`);
		}

		const division = this.jumper.getDivision(divisionId);
		const node = this._getNodeFromDivisionId(divisionId);

		let numBlocks;
		if (node && node.hasChildren()) {
			numBlocks = node.getChildren().length; // one block for each displayAsItem
		} else if (node) {
			numBlocks = 1; // one block for entire displayAsContent
		} else {
			numBlocks = 0; // remove all blocks
		}

		// allocate correct number of text blocks -- add blocks if needed, reuse if
		// possible, remove extraneous. will be populated with content later
		for (let i = 0; i < numBlocks; i++) {
			!this._getBlock(divisionId, i) && division.addBlock();
		}
		while (this._getBlock(divisionId, numBlocks)) {
			this._getBlock(divisionId, numBlocks).remove();
		}

		if (divisionId === 'current') {
			this._syncLineNumbersWithCurrent();
		}

		if (!node) {
			return;
		}

		if (node.hasChildren()) {
			for (const [idx, child] of node.getChildren().entries()) {
				this._setChildBlockContent(divisionId, node, idx);
			}
		} else {
			this._getBlock(divisionId, 0).content(node.displayAsContent());
		}

		this._colorNodeCurrentChild(divisionId, node);
	}

	_setChildBlockContent(column, parent, childIdx) {
		const child = parent.getChildren()[childIdx];
		const context = this._getContextForDivision(column);
		const val = child.displayAsItem(context);

		let string;
		if (typeof val === 'string') {
			string = this._truncate(val, '', context.width);
		} else if (Array.isArray(val)) {
			const left = typeof val[0] === 'string' ? val[0] : '';
			const right = typeof val[1] === 'string' ? val[1] : '';
			string = this._truncate(left, right, context.width);
		} else {
			throw new Error(`Invalid return value for node#displayAsItem (must be string or a tuple array).`);
		}

		const block = this._getBlock(column, childIdx);
		const isHighlighted = child === parent.getHighlightedChild();
		const colored = child[isHighlighted ? 'colorHighlighted' : 'colorDefault']()(string);
		block.content(colored);
	}

	_syncLineNumbersWithCurrent() {
		if (!this.jumper.hasDivision('lines')) {
			return;
		}

		const div = this.jumper.getDivision('lines');
		const divWidth = div.width();
		const curScrollPos = this.jumper.getDivision('current').scrollPosY();
		const rowIdx = this.currentNode.highlightedIdx - curScrollPos;

		const getLineNumString = (lineNum, isPaddingOnLeft) => {
			const width = ~~(Math.log10(lineNum, 10)) + 1;
			const padding = (new Array(divWidth - width + 1)).join(' ');
			const str = isPaddingOnLeft ? `${padding}${lineNum}` : `${lineNum}${padding}`;
			return colorScheme.colorLineNumbers(str);
		};

		if (rowIdx === this._lineNumCached) {
			const curBlock = this._getBlock('lines', rowIdx);
			if (rowIdx + curScrollPos !== parseInt(curBlock.escapedText)) {
				curBlock.content(getLineNumString(rowIdx + curScrollPos, false));
			}
			return;
		}

		const { length } = this.getVisibleChildrenFor('current');

		for (let i = 0; i < length; i++) {
			let str;

			if (i === rowIdx) {
				str = getLineNumString(i + curScrollPos, false);
			} else {
				str = getLineNumString(Math.abs(i - rowIdx), true);
			}

			const block = this._getBlock('lines', i);
			block ?  block.content(str) : div.addBlock(str);
		}

		while (this._getBlock('lines', length)) {
			this._getBlock('lines', length).remove();
		}

		this._lineNumCached = rowIdx;
	}

	_truncate(left, right, divWidth) {
		left = left.split('\n')[0];
		right = right.split('\n')[0];

		const paddingLeft = 1;
		const paddingRight = 1;

		const availableWidth = divWidth - paddingLeft - paddingRight;
		const rightWidth = stringWidth(right);
		const leftTruncated = cliTruncate(left, availableWidth - rightWidth - 1);
		const leftWidth = stringWidth(leftTruncated);

		let string = '';
		string += new Array(paddingLeft + 1).join(' ');
		string += leftTruncated;
		string += new Array(availableWidth - leftWidth - rightWidth + 1).join(' ');
		string += right;
		string += new Array(paddingRight + 1).join(' ');

		return string;
	}

	_getBlock(div, childIdx) {
		if (typeof div === 'string') {
			div = this.jumper.getDivision(div);
		}

		return div.blockHash[div.blockIds[childIdx]];
	}

	_colorNodeCurrentChild(divisionId, node) {
		if (!node.getHighlightedChild()) {
			return;
		}

		const division = this.jumper.getDivision(divisionId);
		const block = this._getBlock(divisionId, node.highlightedIdx);

		if (!block) {
			return;
		}

		const colored = node.getHighlightedChild().colorHighlighted()(block.escapedText);

		block.content(colored);
	}

	_colorNodePreviousChild(divisionId, node) {
		if (!node.getPreviousHighlightedChild()) {
			return;
		}

		const division = this.jumper.getDivision(divisionId);
		const block = this._getBlock(divisionId, node.previousHighlightedIdx);

		const colored = node.getPreviousHighlightedChild().colorDefault()(block.escapedText);

		block.content(colored);
	}

	_onKeypress(char, key) {
		this._emit('keypress', this.currentNode, { char, key });
	}

	_highlightNthChild(idx) {
		if (!this.currentNode.setHighlighted(idx)) {
			return;
		}

		const div = this.jumper.getDivision('current');
		const divHeight = div.contentHeight();

		this._colorNodePreviousChild('current', this.currentNode);
		this._colorNodeCurrentChild('current', this.currentNode);

		this._setupDiv('child');

		if (this.currentNode.getHighlightedChild()) {
			this._emit('highlight', this.currentNode.getHighlightedChild());
		}

		const windowStart = div.scrollPosY();
		const windowEnd = div.scrollPosY() + divHeight;

		if (this.currentNode.highlightedIdx + 1 > windowEnd) {
			div.scrollDown(this.currentNode.highlightedIdx + 1 - windowEnd);
		} else if (this.currentNode.highlightedIdx < windowStart) {
			div.scrollUp(windowStart - this.currentNode.highlightedIdx);
		}

		if (div.scrollPosY() !== windowStart) {
			const visibleIndices = this.getVisibleChildIndicesFor('current');
			this._emit('scroll', this.currentNode);
		}
	}

	renderCursorAtIdx(idx) {
		this._highlightNthChild(idx);
		this.setInfo('', { header: '' });
		this._syncLineNumbersWithCurrent();
		this.render();
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
	_emit(eventType, node, data) {
		data = Object.assign({ vats: this, node }, data);

		const event = new Event(eventType, data);

		this.emit(eventType, event);

		const { emitEventsOnNodes } = this.options;

		if (
			!event.isDefaultPrevented() &&
			(emitEventsOnNodes === true || emitEventsOnNodes.includes(eventType))
		) {
			node && node.emit(eventType, event);
		}

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
		if (event.type === 'select') {
			this._defaultBehaviorForSelect(event);
		} else if (event.type === 'command') {
			this._defaultBehaviorForCommand(event);
		} else if (event.type === 'keypress') {
			this._defaultBehaviorForKeypress(event);
		}
	}

	/**
	 * Default behavior is to "cd" into a node when it's selected, if it has
	 * children.
	 */
	_defaultBehaviorForSelect({ node }) {
		if (node.hasChildren()) {
			this.setInfo('', { header: '' });
			this.cd(node);
			this.render();
		}
	}

	_defaultBehaviorForCommand({ argv, commandString, commandPrompt, getFyi }) {
		const command = argv._[0];

		if (/^\s*\d+\s*$/.test(command)) {
			this.renderCursorAtIdx(parseInt(command) || 0);
		} else if (['h', 'help'].includes(command)) {
			this.printToPager('showing VATS help screen');
		} else if (['exit', 'q', 'quit'].includes(command)) {
			this.quit();
		} else if (['redraw', 'render'].includes(command)) {
			this.update('all');
			this.render();
		} else if (command === 'set') {
			let bool;

			if (['linenumbers', 'line-numbers'].includes(argv._[1])) {
				bool = true;
			} else if (['nolinenumbers', 'no-line-numbers'].includes(argv._[1])) {
				bool = false;
			} else if (['linenumbers!', 'line-numbers!'].includes(argv._[1])) {
				bool = !this.jumper.hasDivision('lines');
			}

			if (this.showLineNumbers(bool)) {
				this._syncLineNumbersWithCurrent();
				this.render();
			}
		} else if (command === 'search') {
			const dir = (commandPrompt === '?') ? -1 : 1;
			const remainder = argv._.slice(1).join(' ');
			const newIdx = this.search(remainder, dir);

			if (typeof newIdx === 'number') {
				this.renderCursorAtIdx(newIdx);
			} else {
				this.info(`Pattern not found: ${remainder}`, { warn: true });
			}
		} else if (getFyi('command-not-found')) {
			const cmd = typeof getFyi('command-not-found') === 'string' ?
				getFyi('command-not-found') : command;
			this.info(`Command not found: ${cmd}`, { warn: true });
		}
	}

	_defaultBehaviorForKeypress({ char, key }) {
		if (key.sequence === '\u0003') {
			return this.quit();
		}

		const count = parseInt(this._count) || 1;

		if (key.shift && ['up', 'down', 'left', 'right'].includes(key.name)) {
			const div = this.jumper.getDivision('child');
			const isScrollHorizontal = ['left', 'right'].includes(key.name);
			const scrollFn = `scroll${key.name[0].toUpperCase()}${key.name.slice(1)}`;
			const amount = (!key.ctrl) ?
				1 :
				div[isScrollHorizontal ? 'width' : 'height']() / 2;

			div[scrollFn](amount);
			this.setInfo('', { header: '' });
			this.render('child');
		} else if (this._cursorNavigation.isCursorNavigation(char, key, this._lastChar)) {
			const newIdx = this._cursorNavigation.handle(char, key, count, this);

			if (typeof newIdx === 'number') {
				this.renderCursorAtIdx(newIdx);
			}
		} else if ((char === 'h' || key.name === 'left') && this.currentNode.parent) {
			this.setInfo('', { header: '' });
			this.cd(this.currentNode.parent);
			this.render();
		} else if (char === 'l' || ['right', 'return'].includes(key.name)) {
			const highlighted = this.currentNode.getHighlightedChild();
			highlighted && this._emit('select', highlighted);
		} else if ([':', '/', '?'].includes(char)) {
			this.enterCommandMode({ prompt: char }).then(commandData => {
				if (!commandData) return;

				if (['/', '?'].includes(commandData.commandPrompt)) {
					commandData.argv._.unshift('search');
				}

				this._emit('command', this.currentNode, commandData);
			}).catch(e => this._catchError(e));
		}

		this._lastChar = char;
		this._count = /\d/.test(char) ? (this._count + char) : '0';
	}

	_render() {
		const scrollPos = this.jumper.getDivision('current').scrollPosY();
		const idx = this.currentNode.highlightedIdx - scrollPos;

		let string = '';
		string += this.jumper.renderString();
		string += this.jumper.jumpToString('current', -1, idx);

		return string;
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
		this.info('', { header: '' });

		this._stdinListeners = process.stdin.listeners('keypress');
		for (const listener of this._stdinListeners) {
			process.stdin.removeListener('keypress', listener);
		}

		process.stdout.write(
			ansiEscapes.cursorSavePosition +
			ansiEscapes.cursorShow +
			ansiEscapes.cursorTo(0, termSize().rows)
		);

		const output = await this._commandMode.run(commandModeOptions);

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

		return Promise.resolve(output);
	}

	search(string, dir = 1) {
		const blocks = this.currentNode.getChildren().map((_, idx) => {
			return this._getBlock('current', idx);
		});

		const { highlightedIdx } = this.currentNode;

		return this._cursorNavigation.search(string, highlightedIdx, dir, this);
	}

	destroy() {
		this.jumper.erase();
		process.stdin.write(ansiEscapes.cursorShow);

		if (this.options.useAlternateScreen) {
			spawnSync('tput rmcup', [], { shell: true, stdio: 'inherit' });
		}

		this.jumper.destroy();
		this._commandMode.destroy();
		this._cursorNavigation.destroy();
		this.tree.destroy(); // maybe this is stupid

		this.options = this._count = this._lastChar = null;
		this._stdinListeners = null;

		process.stdin.removeListener('keypress', this._onKeypress);
	}

	exit() {
		this.quit();
	}

	quit() {
		this.destroy();
		process.exit();
	}

	_catchError(e) {
		this.printToPager(e.stack);
	}
}

module.exports = Vats;
