const ansiEscapes = require('ansi-escapes');
const stringWidth = require('string-width');
const cliTruncate = require('cli-truncate');
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

		// TODO: setup other IVs
	}

	init(vats, options) {
		super.init(...arguments);

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

	getActiveColumnIdx() {
		return this.getColumnWidths().length - 2;
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
			const isCursorRow = idx === this.getCursorRow();
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

	_syncLineNumbersWithActiveColumn() {
		if (!this.linesView.isEnabled) {
			return;
		}

		const numBlocks = this.activeView.div.blockIds.length;
		const cursorRow = this.getCursorRow();

		const lineNumbers = (new Array(numBlocks)).fill(null).map((_, idx) => {
			return Math.abs(idx - cursorRow);
		});

		this.linesView.setArray(lineNumbers);
		this.linesView.setupAllBlocks(true);
	}

	addCustomKeymaps() {
		const { keymapper } = this.vats;
		keymapper.keymap.set('shift+UP_ARROW', 'scroll-child-view-up');
		keymapper.keymap.set('shift+DOWN_ARROW', 'scroll-child-view-down');
		keymapper.keymap.set('ctrl+shift+UP_ARROW', 'scroll-child-view-up-fast');
		keymapper.keymap.set('ctrl+shift+DOWN_ARROW', 'scroll-child-view-down-fast');
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

		if (this.infoView.div.height() > oldHeight) {
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
		this.info('', Object.assign({}, options, { header: '' }));
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

		needsSwap && this.currentChildView.div.reset();
		this.currentChildView = hasChildren ? this.childArrayView : this.childAltView;

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

		if (curNode === startNode) {
			const isArrayView = this.currentChildView === this.childArrayView;
			this[isArrayView ? '_setupArrayView' : '_setupChildAltView'](view, node);
		} else {
			this._setupArrayView(view, node);
			// childIndices ? view.updateBlocks(childIndices) : this._setupArrayView(view, node);
		}
	}

	onCommandModeEnter() {
		this.clearInfo({ render: true });
	}

	onCommandNotFound({ command }) {
		this.info(`Command not found: ${command}`, { warn: true, render: true });
	}

	onCommand({ argv }) {
		const command = argv._[0];

		if (command === 'set') {
			let bool = null;

			if (['linenumbers', 'line-numbers'].includes(argv._[1])) {
				bool = true;
			} else if (['nolinenumbers', 'no-line-numbers'].includes(argv._[1])) {
				bool = false;
			} else if (['linenumbers!', 'line-numbers!'].includes(argv._[1])) {
				bool = !this.linesView.isEnabled;
			}

			if (bool !== null && this.showLineNumbers(bool)) {
				this._syncLineNumbersWithActiveColumn();
				this.render();
			}
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
			const dir = keyAction.includes('up') ? -1 : 1;
			const isFast = keyAction.includes('fast');
			this.scrollChildView(dir, isFast);
			needsRender = true;
		}

		this.clearInfo();
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
		this._syncLineNumbersWithActiveColumn();
		this.render();
	}

	scrollChildView(dir, isFast) {
		const mag = dir * (isFast ? this.currentChildView.div.height() * 0.5 : 1);
		this.currentChildView.div.scrollDown(dir * mag);
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

	setCursorRow(idx) {
		if (this.activeView.setActiveBlock(idx)) {
			this.currentNode.activeIdx = this.activeView.activeIdx;
			this.vats.emitEvent('highlight', { item: this.currentNode.getHighlightedChild() });
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
