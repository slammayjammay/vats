const ansiEscapes = require('ansi-escapes');
const stringWidth = require('string-width');
const cliTruncate = require('cli-truncate');
const chalk = require('chalk');
const TerminalJumper = require('../../../terminal-jumper');
const BaseUI = require('./BaseUI');
const ViewSwitcher = require('./ViewSwitcher');
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

		// helps avoid unnecessary line num logic. tuple containing first and last line numbers
		this._lineNumCache = [null, null];

		this.jumper = null;

		// array of each column view
		this.columns = [];

		// half-ass attempt to make the "active view" changeable
		this.activeColumnIdx = null;

		// more view refs
		this.headerView = this.infoView = this.linesView = null;
	}

	init(vats, options) {
		super.init(...arguments);

		this.setupColorScheme();
		this.createUI();
		this.addCustomKeymaps();

		this.vats.on('command', (...args) => this.onCommand(...args));
		this.vats.on('command-not-found', (...args) => this.onCommandNotFound(...args));
		this.vats.on('keypress', (...args) => this.onKeypress(...args));
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
			const div = this.jumper.getDivision(`column-${idx}`);
			const switcher = new ViewSwitcher(div);

			switcher.set('array', new ArrayView(div));
			switcher.setActive('array');

			return switcher;
		});

		this.activeColumnIdx = this.getActiveColumnIdx();

		this.activeColumn = this.columns[this.activeColumnIdx];
		this.childColumn = this.columns[this.columns.length - 1];

		this.childColumn.set('text', new TextView(this.childColumn.div));

		this.setupArrayViewDisplays();

		// setup header
		this.headerView = new TextView(this.jumper.getDivision('header'));

		// setup info
		this.infoView = new InfoView(this.jumper.getDivision('info'));

		// setup line numbers
		this.linesView = this.createLinesView();
		this.showLineNumbers(true);
	}

	setupColorScheme() {
		colorScheme.defineScheme('tree', new Map([
			['colorHeader', chalk.bold.green],
			['colorBranch', chalk.bold.blue],
			['colorBranchActive', chalk.bgBlue.bold.hex('#000000')],
			['colorLeaf', colorScheme.getColorFunction('colorItem', 'default')],
			['colorLeafActive', colorScheme.getColorFunction('colorItemActive', 'default')],
			['colorInfoHeader', chalk.bgWhite.bold.hex('#000000')],
			['colorInfoWarn', chalk.bgRed.white.bold],
			['colorLineNumbers', chalk.yellow]
		]));

		colorScheme.use('tree');
	}

	// TODO: this don't work
	getActiveColumnIdx() {
		return Math.max(0, this.columns.length - 2);
	}

	getColumnWidths() {
		// "-1" because each column is separated a bit
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
		const activeArrayView = this.activeColumn.get('array');
		const linesDiv = this.createLinesDiv(this.activeColumnIdx);
		const view = new ArrayView(linesDiv);
		view.disable(); // TODO: something less hacky here

		// padding
		view.displayFnMap.set('getItemString', (item, idx, divWidth) => {
			const availableWidth = divWidth - 2; // padding around div
			const lineNum = String(item);
			const isCursorRow = idx === this.getCursorRow() - activeArrayView.getScrollPosY();
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
		return this.jumper.addDivision({
			id: 'lines',
			top: 'header',
			left: `column-${activeColumnIdx - 1}`,
			width: '5',
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
		const childOptions = this.childColumn.div.options;
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
			activeOptions.left = this.activeColumnIdx - 1 < 0 ?
				'0' :
				`{${this.columns[this.activeColumnIdx - 1].div.options.id}} + 1`;

			hasChanged = true;
		}

		return hasChanged;
	}

	syncLineNumbersWithActiveColumn() {
		if (this.activeColumn.active !== this.activeColumn.get('array')) {
			this.linesView.setArray([]);
			this.linesView.syncBlocks();
			this._lineNumCache = [];
			return;
		}

		const [start, end] = this.activeColumn.active.getViVisibleIndexBounds();
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
		this.linesView.syncBlocks(); // TODO: maybe there's a better way than this

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
		for (const column of this.columns) {
			const view = column.views.get('array');

			view.displayFnMap.set('getItemString', (node, idx, divWidth) => {
				const isInsideCurrent = node.parent === this.currentNode;
				const left = node.toListItemString(idx, divWidth);
				const right = isInsideCurrent && node.hasChildren() ? `${node.getChildren().length}` : '';
				return this.formatListItemString(left, right, divWidth);
			});

			view.displayFnMap.set('colorItemString', (string, node, idx) => {
				const fn = node.hasChildren() ? 'colorBranch' : 'colorLeaf';
				return colorScheme[fn](string);
			});

			view.displayFnMap.set('colorItemStringActive', (string, node, idx) => {
				const fn = node.hasChildren() ? 'colorBranchActive' : 'colorLeafActive';
				return colorScheme[fn](string);
			});
		}
	}

	formatListItemString(left, right, divWidth, paddingLeft = 1, paddingRight = 1) {
		left = left.split('\n')[0];
		right = right.split('\n')[0];

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

	render(force) {
		force && this.jumper.setDirty();
		process.stdout.write(this.renderString());
	}

	renderString() {
		let string = this.jumper.renderString();

		if (this.activeColumn.active === this.activeColumn.get('array')) {
			const { div } = this.activeColumn.active;
			const cursorRow = this.activeColumn.get('array').activeIdx - div.scrollPosY();
			string += div.jumpToString(null, 0, cursorRow);
		}
		string += ansiEscapes.cursorHide;

		return string;
	}

	setHeader(headerString) {
		this.headerView.setText(colorScheme.colorHeader(headerString));
		this.headerView.update();
	}

	/**
	 * options.warn
	 * options.header
	 */
	info(string, options = {}) {
		string = new String(string);

		if (string.split('\n').length >= this.jumper.getAvailableHeight()) {
			this.vats.pager(string);
			return;
		}

		const oldHeight = this.infoView.div.height();

		this.infoView.setInfo(string, options);

		if (this.infoView.div.height() < oldHeight) {
			for (const column of this.columns) {
				this.jumper.setNeedsRender(column.active.div);
			}
		}
	}

	warn(string) {
		// TODO: options argument
		this.info(string, { warn: true });
	}

	clearInfo() {
		const needsRender = this.infoView.clearInfo();

		if (needsRender) {
			for (const column of this.columns) {
				this.jumper.setNeedsRender(column.active.div);
			}
		}

		return needsRender;
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
		const hasChildren = node.hasChildren();

		if (!hasChildren) {
			return false;
		}

		this.currentNode.scrollPosY = this.activeColumn.get('array').div.scrollPosY();
		this.currentNode = node;

		let [i, curNode] = [this.columns.length - 1, node];
		i -= 1; // ignore child column -- will be setup on highlight
		while (i >= 0) {
			this._setupColumn(this.columns[i], curNode);
			curNode = curNode ? curNode.parent : null;
			i--;
		}

		this.vats.emitEvent('cd', { item: this.currentNode });

		const activeItem = this.currentNode.getActiveChild();
		activeItem && this.vats.emitEvent('highlight', { item: activeItem });

		return true;
	}

	_setupColumn(column, node) {
		if (!node) {
			// if no node given, show column as empty
			column.active.div.reset();
		} else if (node.getChildren().length === 0) {
			// if no children, show column as empty
			if (!column.has('text')) {
				column.set('text', new TextView(column.active.div))
			}

			column.setActive('text');

			const text = (() => {
				if (column === this.childColumn) {
					return node.toContentString(node.parent.activeIdx, column.active.div.width());
				} else {
					return colorScheme.colorInfoWarn('empty');
				}
			})();

			column.active.setText(text);
			column.active.update();

			if (node === this.currentNode) {
				this._setupColumn(this.childColumn);
			}
		} else {
			// show children
			column.setActive('array');
			column.active.setArray(node.getChildren());
			column.active.setActiveIdx(node.activeIdx);
			column.active.syncBlocks();
			column.active.setScrollPosY(node.scrollPosY);
		}

		if (this.linesView.isEnabled) {
			this.syncLineNumbersWithActiveColumn();
		}
	}

	getVisibleChildren(node) {
		const column = this.getColumnForNode(node);
		if (!column || column.active !== column.get('array')) {
			return [];
		}

		const scrollY = column.active.div.scrollPosY();
		const height = column.active.div.height();

		return node.getChildren().slice(scrollY, scrollY + height);
	}

	/**
	 * If no children indices are given, update everything.
	 */
	update(node, childIndices) {
		const column = this.getColumnForNode(node);
		if (!column) {
			return;
		}

		if (column.active === column.get('array') && childIndices !== undefined) {
			column.active.updateBlocks(childIndices);
		} else {
			const childrenLength = node.getChildren().length || 1;
			node.activeIdx = Math.min(node.activeIdx, childrenLength - 1);
			this._setupColumn(column, node);
		}
	}

	/**
	 * Return {View|null}
	 */
	getColumnForNode(node) {
		let view = null;
		let i, curNode;

		const activeChild = this.currentNode.getActiveChild();

		if (activeChild) {
			[i, curNode] = [this.columns.length - 1, activeChild];
		} else {
			[i, curNode] = [this.activeColumnIdx, this.currentNode];
		}

		while (i >= 0) {
			if (curNode === node) {
				view = this.columns[i];
				break;
			}

			if (!curNode.parent) {
				return null; // node is not associated with a view
			}

			curNode = curNode.parent;
			i--;
		}

		return view;
	}

	onCommandNotFound({ command }) {
		this.info(`Command not found: ${command}`, { warn: true });
		this.schedule('render', () => this.render());
	}

	onCommand({ argv, fyis }) {
		const command = argv._[0];

		if (/^\s*\d+\s*$/.test(command)) {
			const pageHeight = this.getViPageHeight();
			const newCursorRow = Math.min(pageHeight, parseInt(command));
			const newScrollPosY = this.vats.viCursorNavigation.getScrollPosition(
				newCursorRow,
				pageHeight,
				this.getViVisibleIndexBounds(),
				this.getCursorRow()
			);

			const needsRender = this.setViCursor(newCursorRow, newScrollPosY);
			needsRender && this.schedule('render', () => this.render());
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
				this.schedule('render', () => this.render());
			}
		} else {
			fyis.set('command-not-found', true);
		}
	}

	onKeypress({ char, key }) {
		// clear info if entering command mode through keypress (as opposed to
		// prompt). this is a yucky way to do this
		if (char === ':') {
			this.clearInfo() && this.render();
		}
	}

	onKeybinding({ keyString, keyAction, count, charsRead, preventDefault }) {
		const blacklist = ['vi:cursor-left', 'vi:cursor-right'];
		if (blacklist.includes(keyAction)) {
			preventDefault();
		}

		let needsRender = false;

		if (keyAction === 'vi:cursor-left') {
			const parentNode = (() => {
				let curNode = this.currentNode;

				for (let i = 0; i < count; i++) {
					if (!curNode.parent) {
						break;
					} else {
						curNode = curNode.parent;
					}
				}

				return curNode;
			})();

			if (parentNode) {
				needsRender = this.cd(parentNode);
			}
		} else if (['vi:cursor-right', 'enter'].includes(keyAction)) {
			const child = (() => {
				let curNode = this.currentNode;

				for (let i = 0; i < count; i++) {
					const activeChild = curNode.getActiveChild();
					if (activeChild) {
						curNode = activeChild;
					} else {
						break;
					}
				}

				return curNode;
			})();

			if (child) {
				const didCD = this.cd(child);
				needsRender = didCD;
				!didCD && this.vats.emitEvent('select', { item: child });
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

		if (infoNeedsRender || needsRender) {
			this.schedule('render', () => this.render());
		}
	}

	onCD({ item }) {
		this.updateHeader(item);
	}

	updateHeader(item) {
		let headerString = '';
		let currentNode = this.currentNode;

		while (currentNode) {
			headerString = `${currentNode.name()}/${headerString}`;
			currentNode = currentNode.parent;
		}

		this.setHeader(headerString);
	}

	onHighlight({ item }) {
		this._setupColumn(this.childColumn, item);
	}

	scrollChildView(x, y, isFast) {
		const magX = x * (isFast ? this.childColumn.active.div.width() * 0.5 : 1);
		const magY = y * (isFast ? this.childColumn.active.div.height() * 0.5 : 1);

		x !== 0 && this.childColumn.active.div.scrollRight(magX);
		y !== 0 && this.childColumn.active.div.scrollDown(magY);
	}

	handleViKeybinding() {
		if (this.activeColumn.active !== this.activeColumn.get('array')) {
			return;
		}

		return super.handleViKeybinding(...arguments);
	}

	getViPageHeight() {
		return this.activeColumn.get('array').getViPageHeight();
	}

	getViVisibleIndexBounds() {
		return this.activeColumn.get('array').getViVisibleIndexBounds();
	}

	getCursorRow() {
		return this.currentNode.activeIdx;
	}

	setCursorRow(idx) {
		if (this.activeColumn.get('array').setActiveBlock(idx)) {
			this.currentNode.activeIdx = this.activeColumn.get('array').activeIdx;
			return true;
		}

		return false;
	}

	getScrollPosY() {
		return this.activeColumn.get('array').div.scrollPosY();
	}

	setScrollPosY(scrollPosY) {
		const old = this.getScrollPosY();
		this.activeColumn.get('array').setScrollPosY(scrollPosY);

		return scrollPosY !== old;
	}

	setViCursor(cursorRow, scrollPos) {
		const oldCursorRow = this.getCursorRow();

		const needsRender = super.setViCursor(...arguments);

		if (oldCursorRow !== this.getCursorRow()) {
			const activeChild = this.currentNode.getActiveChild();
			activeChild && this.vats.emitEvent('highlight', { item: activeChild });
		}

		return needsRender;
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

	// TODO: destroy
}

module.exports = TreeUI;
