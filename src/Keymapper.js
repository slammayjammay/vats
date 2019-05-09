/**
 * See `keymap.json` for list of all keymaps.
 *
 * Meta keys must be listed in the correct order to create a key binding. Order
 * is "ctrl+option+meta+shift".
 */
class Keymapper {
	constructor() {
		this.readOneChar = this.readOneChar.bind(this);

		this._input = '';
		this._numReads = 0;

		this.readFunctionMap = new Map();
		this.keymap = new Map(Object.entries(require('./keymap.json')));

		this._inputTree = this._constructInputTree(this.keymap);
		this._inputNode = this._inputTree;

		this._isReading = false;

		this.readFunctionMap.set('readOneChar', this.readOneChar);
	}

	_constructInputTree(keymap) {
		const tree = {};

		for (const [key, val] of keymap.entries()) {
			if (key.includes(' ')) {
				const chars = key.split(' ');
				chars.pop();

				let currentNode = tree;

				for (const char of chars) {
					currentNode[char] = currentNode[char] || {};
					currentNode = currentNode[char];
				}
			}
		}

		return tree;
	}

	_resetInput() {
		this._input = '';
		this._inputNode = this._inputTree;
	}

	isReading() {
		return this._isReading;
	}

	/**
	 * @return {Object|boolean} - If a keybinding is found, returns a keybinding
	 * object. If no keybinding is found, or if additional chars are needed to
	 * complete a keybinding, returns false;
	 */
	handleKey({ char, key }) {
		const keypressString = this.getKeypressString({ char, key });

		if (this._isReading) {
			return this.read(keypressString);
		}

		this._input += keypressString;

		// an input string that consists of only numbers
		if (/\d/.test(keypressString) && /^\d*$/.test(this._input)) {
			return false;
		}

		// following along a string of chars, part of a snippet
		if (this._inputNode[keypressString]) {
			this._inputNode = this._inputNode[keypressString];
			this._input += ' ';
			return false;
		}

		const { keyString } = this.parseInput(this._input);
		const val = this.keymap.get(keyString);

		if (!val) {
			// if nothing is found, start over
			this._resetInput();
		} else if (val.read) {
			// a keybinding is found but additional characters need to be read
			this._isReading = true;
			this._readFunction = this.readFunctionMap.get(val.read);
			if (!this._readFunction) {
				throw new Error(`Read function "${val.read}" not found.`);
			}
		} else {
			// return the keybinding and reset
			const keybindingObject = this.getKeybindingObject(this._input);
			this._resetInput();
			return keybindingObject;
		}

		return false;
	}

	read(keypressString) {
		const charsRead = this._readFunction(keypressString);
		if (typeof charsRead !== 'string') {
			return false;
		}

		const keybindingObject = this.getKeybindingObject(this._input, charsRead);
		this._resetInput();
		return keybindingObject;
	}

	/**
	 * A read function. This one will only read one character, used for the "f"
	 * keybinding ("find").
	 *
	 * Custom read functions can be defined and set inside the readFunctionMap.
	 *
	 * @return {boolean|string} - If truthy, indicates that reading additional
	 * characters should end. If falsey, indcates that reading additional
	 * characters should continue.
	 */
	readOneChar(keypressString) {
		this._numReads += 1;

		if (this._numReads >= 1) {
			this._numReads = 0;
			return keypressString;
		}

		return false;
	}

	/**
	 * Node's char/key to represent a keypress is annoying.
	 * Convert to a less annoying representation of a keypress.
	 */
	getKeypressString({ char, key }) {
		let keyString = char ? char : '';

		if (key.name === 'up') keyString = 'UP_ARROW';
		if (key.name === 'down') keyString = 'DOWN_ARROW';
		if (key.name === 'left') keyString = 'LEFT_ARROW';
		if (key.name === 'right') keyString = 'RIGHT_ARROW';

		// order matters!
		if (key.ctrl) keyString = `ctrl+${keyString}`;
		if (key.option) keyString = `option+${keyString}`;
		if (key.meta) keyString = `meta+${keyString}`;
		// if (key.shift) keyString = `shift+${keyString}`;

		return keyString;
	}

	/**
	 * @param {string} input
	 * @param {string} [charsRead]
	 * @return {Object|boolean} - If a keybinding is found, returns a keybinding
	 * object. If no keybinding is found, or if additional chars are needed to
	 * complete a keybinding, returns false;
	 */
	getKeybindingObject(input, charsRead = '') {
		const { keyString, count } = this.parseInput(input);
		const val = this.keymap.get(keyString);
		const keyAction = typeof val === 'string' ? val : val.send;
		return { keyString, keyAction, count, charsRead };
	}

	parseInput(input) {
		const count = (() => {
			const match = /^(\d*)/.exec(input);
			return match && match[1] ? parseInt(match[1]) : 1;
		})();

		const keyString = input.replace(/^\d*/, '');

		return { keyString, count };
	}
}

module.exports = Keymapper;
