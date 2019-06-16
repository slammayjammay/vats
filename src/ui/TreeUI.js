const ansiEscapes = require('ansi-escapes');
const stringWidth = require('string-width');
const cliTruncate = require('cli-truncate');
const chalk = require('chalk');
const TerminalJumper = require('../../../terminal-jumper');
const BaseUI = require('./BaseUI');
const ArrayView = require('./subviews/ArrayView');
const TextView = require('./subviews/TextView');
const InfoView = require('./subviews/InfoView');
const Tree = require('../models/Tree');
const colorScheme = require('../color-scheme');

class TreeUI extends BaseUI {
	constructor(tree) {
		super();

		if (!(tree instanceof Tree)) {
			throw new Error(`Must provide a valid instance of Tree (received: "${tree}").`);
		}

		this.tree = this.currentNode = tree;

		// helps avoid unnecessary line nume logic. tuple containing first and last line numbers
		this._lineNumCache = [null, null];

		// TODO: setup other IVs
	}

	init(vats, options) {
		super.init(...arguments);

		this.setColorSchemeDefault();
		this.createUI();
		this.addCustomKeymaps();

		this.vats.on('command', (...args) => this.onCommand(...args));
		this.vats.on('command-mode:enter', (...args) => this.onCommandModeEnter(...args));
		this.vats.on('command-not-found', (...args) => this.onCommandNotFound(...args));
		this.vats.on('keybinding', (...args) => this.onKeybinding(...args));
		this.vats.on('cd', (...args) => this.onCD(...args));
		this.vats.on('highlight', (...args) => this.onHighlight(...args));

		this.cd(this.currentNode);
		this.render();
	}

	createUI() {
		this.jumper = new TerminalJumper({
			debug: this.vats.options.debug
		});

		// TODO: ick
		this.jumper.removeDivision('default-division');

		// setup columns
		const columnWidths = this.getColumnWidths();

		for (const [id, options] of Object.entries(this.getJumperDivisions(columnWidths))) {
			options.id = id;
			this.jumper.addDivision(options);
		}

		this.columns = (new Array(columnWidths.length)).fill(null).map((_, idx) => {
			return new ArrayView(this.jumper.getDivision(`column-${idx}`));
		});

		this.childArrayView = this.columns[this.columns.length - 1];
		this.childAltView = new TextView(this.childArrayView.div);

		this.activeColumnIdx = this.getActiveColumnIdx();
		this.activeView = this.columns[this.activeColumnIdx];

		this.setupArrayViewDisplays();

		// setup header
		this.headerView = new TextView(this.jumper.getDivision('header'));

		// setup info
		this.infoView = new InfoView(this.jumper.getDivision('info'));

		// setup line numbers
		this.linesView = this.createLinesView();
		this.showLineNumbers(true);
	}

	setColorSchemeDefault() {
		this.vats.colorScheme.defineScheme('default', new Map([
			['colorHeader', chalk.bold.green],
			['colorItem2', chalk.white],
			['colorItem2Active', chalk.bgWhite.bold.hex('#000000')],
			['colorInfoHeader', chalk.bgWhite.bold.hex('#000000')],
			['colorInfoWarn', chalk.bgRed.white.bold],
			['colorLineNumbers', chalk.yellow]
		]));

		this.vats.colorScheme.use('default');
	}

	getActiveColumnIdx() {
		return Math.max(0, this.columns.length - 2);
	}

	getColumnWidths() {
		return ['15%', '40% - 1', '45% - 1'];
	}

	getJumperDivisions(columnWidths) {
		const options = {
			header: { top: 0, left: 0, width: '100%', height: 1, overflowX: 'scroll' },
			info: { bottom: 0, left: 0, width: '100%', renderOrder: 2 }
		};

		for (const [idx, columnWidth] of columnWidths.entries()) {
			options[`column-${idx}`] = {
				left: idx === 0 ? 0 : `{column-${idx - 1}} + 1`,
				bottom: 0,
				width: columnWidth,
				height: '100% - 1',
				overflowX: 'scroll'
			};
		}

		return options;
	}

	createLinesView() {
		const linesDiv = this.createLinesDiv(this.activeColumnIdx);
		const view = new ArrayView(linesDiv);
		view.disable(); // TODO: something less hacky here

		// padding
		view.displayFnMap.set('getItemString', (item, idx, divWidth) => {
			const availableWidth = divWidth - 2; // padding around div
			const lineNum = item.toString();
			const isCursorRow = idx === this.getCursorRow() - this.activeView.getScrollPosY();
			const strWidth = ~~(Math.log10(lineNum, 10)) + 1;
			const padding = (new Array(availableWidth - strWidth + 1)).join(' ');
			const str = isCursorRow ? `${lineNum}${padding}` : `${padding}${lineNum}`;
			return ` ${str} `;
		});

		// color
		view.displayFnMap.set('colorItemString', (string, item, idx) => {
			return colorScheme.colorLineNumbers(string);
		});

		return view;
	}

	createLinesDiv(activeColumnIdx) {
		const linesWidth = '5';

		return this.jumper.addDivision({
			id: 'lines',
			top: 'header',
			left: `column-${activeColumnIdx - 1}`,
			width: linesWidth,
			overflowX: 'scroll',
			renderOrder: 1
		});
	}

	/**
	 * @param {boolean} bool - whether to show line numbers.
	 * @return {boolean} - whether the line numbers were toggled.
	 */
	showLineNumbers(bool) {
		const activeOptions = this.columns[this.activeColumnIdx].div.options;
		const childOptions = this.columns[this.columns.length - 1].div.options;
		const linesOptions = this.linesView.div.options;

		let hasChanged = false;

		if (bool && !this.linesView.isEnabled) {
			this.linesView.enable();
			activeOptions.left = 'lines';
			childOptions.width = `${childOptions.width} - ${linesOptions.width}`;
			hasChanged = true;
		} else if (!bool && this.linesView.isEnabled) {
			this.linesView.disable();
			const columnWidths = this.getColumnWidths();
			childOptions.width = columnWidths[columnWidths.length - 1];
			const leftId = this.columns[this.activeColumnIdx - 1].div.options.id;
			activeOptions.left = `{${leftId}} + 1`;
			hasChanged = true;
		}

		return hasChanged;
	}

	syncLineNumbersWithActiveColumn() {
		if (!this.linesView.isEnabled) {
			return;
		}

		const [start, end] = this.activeView.getViVisibleIndexBounds();
		const numBlocks = end - start;
		const cursorRow = this.getCursorRow();

		const calculateLineNumber = (idx) => {
			const lineNum = Math.abs(idx - cursorRow + start);
			return lineNum === 0 ? idx + start : lineNum;
		};

		// check to see if we can skip updating line numbers at all
		const canSkip = (() => {
			const firstNum = calculateLineNumber(0);
			const lastNum = calculateLineNumber(numBlocks) - start;

			if (
				firstNum === this._lineNumCache[0] &&
				lastNum === this._lineNumCache[1]
			) {
				return true;
			}

			return false;
		})();

		if (canSkip) {
			this.linesView.array[cursorRow - start] = cursorRow;
			this.linesView.updateBlocks(cursorRow - start);
			return;
		}

		const lineNumbers = (new Array(numBlocks + 1)).fill(null).map((_, idx) => {
			return calculateLineNumber(idx);
		});

		this.linesView.setArray(lineNumbers);
		this.linesView.setupAllBlocks(true); // TODO: maybe there's a better way than this

		this._lineNumCache[0] = lineNumbers[0];
		this._lineNumCache[1] = lineNumbers[numBlocks] - start;
	}

	addCustomKeymaps() {
		const { keymapper } = this.vats;
		keymapper.keymap.set('shift+UP_ARROW', 'scroll-child-view-up');
		keymapper.keymap.set('shift+DOWN_ARROW', 'scroll-child-view-down');
		keymapper.keymap.set('shift+LEFT_ARROW', 'scroll-child-view-left');
		keymapper.keymap.set('shift+RIGHT_ARROW', 'scroll-child-view-right');

		keymapper.keymap.set('shift+ctrl+UP_ARROW', 'scroll-child-view-up-fast');
		keymapper.keymap.set('shift+ctrl+DOWN_ARROW', 'scroll-child-view-down-fast');
		keymapper.keymap.set('shift+ctrl+LEFT_ARROW', 'scroll-child-view-left-fast');
		keymapper.keymap.set('shift+ctrl+RIGHT_ARROW', 'scroll-child-view-right-fast');
	}

	setupArrayViewDisplays() {
		for (const view of this.columns) {
			view.displayFnMap.set('getItemString', (node, idx, divWidth) => {
				const isInsideCurrent = node.parent === this.currentNode;
				const left = node.toListItemString(idx, divWidth);
				const right = `${isInsideCurrent && node.getChildren().length || ''}`;
				return this.formatListItemString(left, right, divWidth);
			});

			view.displayFnMap.set('colorItemString', (string, node, idx) => {
				const fn = node.hasChildren() ? 'colorItem1' : 'colorItem2';
				return this.vats.colorScheme[fn](string);
			});

			view.displayFnMap.set('colorItemStringActive', (string, node, idx) => {
				const fn = node.hasChildren() ? 'colorItem1Active' : 'colorItem2Active';
				return this.vats.colorScheme[fn](string);
			});
		}
	}

	formatListItemString(left, right, divWidth) {
		left = left.split('\n')[0];
		right = right.split('\n')[0];

		const paddingLeft = 1;
		const paddingRight = 1;

		const availableWidth = divWidth - paddingLeft - paddingRight;
		const rightWidth = stringWidth(right);
		const leftTruncated = cliTruncate(left, availableWidth - rightWidth);
		const leftWidth = stringWidth(leftTruncated);

		let string = '';
		string += new Array(paddingLeft + 1).join(' ');
		string += leftTruncated;
		string += new Array(availableWidth - leftWidth - rightWidth + 1).join(' ');
		string += right;
		string += new Array(paddingRight + 1).join(' ');

		return string;
	}

	onPagerExit() {
		this.jumper.setDirty();
		super.onPagerExit(...arguments);
	}

	render() {
		process.stdout.write(this.renderString());
	}

	renderString() {
		let string = this.jumper.renderString();
		const cursorRow = this.activeView.activeIdx - this.activeView.div.scrollPosY();
		string += this.activeView.div.jumpToString(null, 0, cursorRow);
		string += ansiEscapes.cursorHide;

		return string;
	}

	setHeader(headerString) {
		this.headerView.setText(this.vats.colorScheme.colorHeader(headerString));
		this.headerView.update();
	}

	info(string, options = {}) {
		if (string.split('\n').length >= this.jumper.getAvailableHeight()) {
			this.vats.printToPager(string);
			return;
		}

		const oldHeight = this.infoView.div.height();

		this.infoView.setInfo(string, options);

		if (this.infoView.div.height() < oldHeight) {
			for (const view of this.columns) {
				this.jumper.setNeedsRender(view.div);
			}
		}

		options.render && this.render();
	}

	warn(string) {
		this.info(string, { warn: true });
	}

	clearInfo(options = {}) {
		const infoChanged = this.infoView.clearInfo();

		if (infoChanged) {
			for (const view of this.columns) {
				this.jumper.setNeedsRender(view.div);
			}
		}

		options.render && this.render();

		return infoChanged;
	}

	/**
	 * "cd" into the given node and setup up all columns. Only updates the state,
	 * does not actually render it.
	 *
	 * @return {boolean} whether cd was successful.
	 *
	 * TODO: should cd events be cancellable?
	 */
	cd(node) {
		if (!node || node.getChildren().length === 0) {
			return false;
		}

		this.currentNode.scrollPosY = this.activeView.div.scrollPosY();
		this.currentNode = node;

		let [i, curNode] = [this.columns.length - 1, node];
		i -= 1; // ignore child view -- will be setup on highlight
		while (i >= 0) {
			const view = this.columns[i];
			this._setupArrayView(view, curNode);
			curNode = curNode ? curNode.parent : null;
			i--;
		}

		this.vats.emitEvent('cd', { item: this.currentNode });
		this.vats.emitEvent('highlight', { item: this.currentNode.getHighlightedChild() });

		return true;
	}

	_setupArrayView(view, node) {
		view.setArray(node ? node.getChildren() : []);
		view.setActiveIdx(node ? node.activeIdx : 0);
		view.setupAllBlocks(true);
		view.setScrollPosY(node ? node.scrollPosY : 0);
	}

	_setupChildView(childNode) {
		const hasChildren = childNode.hasChildren();
		const isArrayView = this.currentChildView === this.childArrayView;
		const needsSwap = hasChildren !== isArrayView;

		this.currentChildView = hasChildren ? this.childArrayView : this.childAltView;

		if (needsSwap) {
			this.currentChildView.div.reset();
			this.columns[this.columns.length - 1] = this.currentChildView;
		}

		if (hasChildren) {
			this._setupArrayView(this.currentChildView, childNode);
		} else {
			this._setupChildAltView(this.currentChildView, childNode);
		}
	}

	_setupChildAltView(view, node) {
		const idx = node.parent && node.parent.activeIdx;
		view.setText(node.toString(idx, view.div.width()));
		view.update();
	}

	/**
	 * If no children indices are given, update everything.
	 */
	update(node, childIndices) {
		let view;

		const startNode = this.currentNode.getHighlightedChild();
		let [i, curNode] = [this.columns.length - 1, startNode];

		while (i >= 0) {
			if (curNode === node) {
				view = this.columns[i];
				break;
			}

			if (!curNode.parent) {
				return; // node is not associated with a view
			}

			curNode = curNode.parent;
			i--;
		}

		if (node === startNode) {
			this._setupChildView(node);
		} else {
			this._setupArrayView(view, node);
		}
	}

	onCommandModeEnter() {
		this.clearInfo({ render: true });
	}

	onCommandNotFound({ command }) {
		this.info(`Command not found: ${command}`, { warn: true, render: true });
	}

	onCommand({ argv, fyis }) {
		const command = argv._[0];

		fyis.set('command-not-found', false);

		if (/^\s*\d+\s*$/.test(command)) {
			const pageHeight = this.getViPageHeight();
			const newCursorRow = Math.min(pageHeight, parseInt(command));
			const newScrollPosY = this.vats.viCursorNavigation.getScrollPosition(
				newCursorRow,
				pageHeight,
				this.getViVisibleIndexBounds(),
				this.getCursorRow()
			);

			const needsRender = this.setCursorRowAndScrollPosition(newCursorRow, newScrollPosY);
			needsRender && this.render();
		} else if (command === 'set') {
			let bool = null;

			if (['linenumbers', 'line-numbers'].includes(argv._[1])) {
				bool = true;
			} else if (['nolinenumbers', 'no-line-numbers'].includes(argv._[1])) {
				bool = false;
			} else if (['linenumbers!', 'line-numbers!'].includes(argv._[1])) {
				bool = !this.linesView.isEnabled;
			}

			if (bool !== null && this.showLineNumbers(bool)) {
				// dynamically added divisions are not handled correctly by
				// TerminalJumper
				this.jumper.setDirty();
				this.syncLineNumbersWithActiveColumn();
				this.render();
			}
		} else {
			fyis.set('command-not-found', true);
		}
	}

	onKeybinding({ keyString, keyAction, count, charsRead, preventDefault }) {
		const blacklist = ['vi:cursor-left', 'vi:cursor-right'];
		if (blacklist.includes(keyAction)) {
			preventDefault();
		}

		// TODO: cd does not take into account "count"

		let needsRender = false;

		if (keyAction === 'vi:cursor-left') {
			needsRender = this.cd(this.currentNode.parent);
		} else if (['vi:cursor-right', 'enter'].includes(keyAction)) {
			const child = this.currentNode.getHighlightedChild();

			if (child.hasChildren()) {
				needsRender = this.cd(child);
			} else {
				this.vats.emitEvent('select', { item: child });
			}
		} else if (keyAction.includes('scroll-child-view')) {
			const dir = /scroll-child-view-(\w+)/.exec(keyAction)[1];
			let x, y;

			if (dir === 'up') [x, y] = [0, -1];
			if (dir === 'down') [x, y] = [0, 1];
			if (dir === 'left') [x, y] = [-1, 0];
			if (dir === 'right') [x, y] = [1, 0];

			this.scrollChildView(x, y, keyAction.includes('fast'));
			needsRender = true;
		}

		const infoNeedsRender = this.clearInfo();
		(infoNeedsRender || needsRender) && this.render();
	}

	onCD({ item }) {
		let headerString = '';
		let currentNode = this.currentNode;

		while (currentNode) {
			headerString = `${currentNode.name()}/${headerString}`;
			currentNode = currentNode.parent;
		}

		this.setHeader(headerString);
	}

	onHighlight({ item }) {
		this._setupChildView(item);
		this.syncLineNumbersWithActiveColumn();
	}

	scrollChildView(x, y, isFast) {
		const magX = x * (isFast ? this.currentChildView.div.width() * 0.5 : 1);
		const magY = y * (isFast ? this.currentChildView.div.height() * 0.5 : 1);

		x !== 0 && this.currentChildView.div.scrollRight(magX);
		y !== 0 && this.currentChildView.div.scrollDown(magY);
	}

	getViPageHeight() {
		return this.activeView.getViPageHeight();
	}

	getViVisibleIndexBounds() {
		return this.activeView.getViVisibleIndexBounds();
	}

	getCursorRow() {
		return this.currentNode.activeIdx;
	}

	// TODO: this is not dry...
	setCursorRowAndScrollPosition(cursorRow, scrollPosY) {
		let cursorRowChanged, scrollPosChanged;

		if (Number.isInteger(cursorRow)) {
			cursorRowChanged = this.setCursorRow(cursorRow);
		}
		if (scrollPosY !== -1 && Number.isInteger(scrollPosY)) {
			scrollPosChanged = this.setScrollPosY(scrollPosY);
		}

		if (cursorRowChanged) {
			this.vats.emitEvent('highlight', { item: this.currentNode.getHighlightedChild() });
		}

		return cursorRowChanged || scrollPosChanged;
	}

	setCursorRow(idx) {
		if (this.activeView.setActiveBlock(idx)) {
			this.currentNode.activeIdx = this.activeView.activeIdx;
			return true;
		}

		return false;
	}

	setScrollPosY(scrollPosY) {
		const old = this.activeView.div.scrollPosY();
		this.activeView.setScrollPosY(scrollPosY);

		return scrollPosY !== old;
	}

	getSearchableItems(query) {
		return this.currentNode.getChildren();
	}

	testSearchItem(item, query, idx) {
		return item.toListItemString().includes(query.toLowerCase());
	}

	quit() {
		super.quit(...arguments);
		process.stdout.write(this.jumper.eraseString() + ansiEscapes.cursorShow);
	}
}

module.exports = TreeUI;
