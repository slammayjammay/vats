const SHIFTABLE_KEYS = [
	'escape', 'return', 'tab', 'backspace', 'up', 'down', 'left', 'right'
];

const NODE_KEY_CONVERSION = {
	up: 'UP_ARROW',
	down: 'DOWN_ARROW',
	left: 'LEFT_ARROW',
	right: 'RIGHT_ARROW',
	return: 'enter'
};

/**
 * See `keymap.js` for list of all keymaps.
 */
class InputHandler {
	/**
	 * When creating a keymap, prepending "shift+" only makes sense when these
	 * special keys are pressed. When normal keys are pressed, just add that
	 * character instead. For example, "N" is valid whereas "shift+n" is not.
	 */
	static get SHIFTABLE_KEYS() {
		return SHIFTABLE_KEYS;
	}

	/**
	 * Node's char/key to represent a keypress is annoying. Instead, convert
	 * char/key to one string.
	 *
	 * Keys are the strings present in `key.name`, values are what will be used in
	 * the final keypress string. If `char` is empty but `key.name` is present
	 * (e.g. "escape"), and `key.name` is not present in this object, then
	 * `key.name` will be used in the keypress string.
	 *
	 * See #formatCharKey
	 */
	static get NODE_KEY_CONVERSION() {
		return NODE_KEY_CONVERSION;
	}

	constructor() {
		this.readOneChar = this.readOneChar.bind(this);

		this._input = '';

		this.readFunctions = new Map();
		this.keymap = new Map();

		this._inputTree = null;
		this._inputNode = null;

		this._isReading = false;

		this.readFunctions.set('readOneChar', this.readOneChar);
	}

	/**
	 * Merges the given map with the existing one.
	 * @param {map} map - The keymap to marge.
	 */
	mergeKeymap(map) {
		this.keymap = new Map([...this.keymap, ...map]);
		this._inputNode = this._inputTree = this._constructInputTree(this.keymap);
	}

	get() { return this.keymap.get(...arguments); }

	has() { return this.keymap.has(...arguments); }

	set() {
		const ret = this.keymap.set(...arguments);
		this._inputNode = this._inputTree = this._constructInputTree(this.keymap);
		return ret;
	}

	delete() {
		if (this.keymap.delete(...arguments)) {
			this._inputNode = this._inputTree = this._constructInputTree(this.keymap);
			return true;
		}

		return false;
	}

	clear() {
		this.keymap.clear(...arguments);
		this._inputNode = this._inputTree = this._constructInputTree(this.keymap);
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
	 * @return {object|boolean} - If a keybinding is found, returns a keybinding
	 * object. If no keybinding is found, or if additional chars are needed to
	 * complete a keybinding, returns null.
	 */
	handleKey(char, key) {
		const keypressString = this.formatCharKey(char, key);

		if (this._isReading) {
			return this.read(keypressString);
		}

		this._input += keypressString;

		// an input string that consists of only numbers,
		if (
			/\d/.test(keypressString) &&
			/^\d*$/.test(this._input) &&
			!/^0$/.test(this._input) // except when 0 is pressed
		) {
			return null;
		}

		// following along a string of chars, part of a snippet
		if (this._inputNode[keypressString]) {
			this._inputNode = this._inputNode[keypressString];
			this._input += ' ';
			return null;
		}

		const { keyString } = this.parseInput(this._input);
		const val = this.keymap.get(keyString);

		if (!val) {
			// if nothing is found, start over
			this._resetInput();
		} else if (val.read) {
			// a keybinding is found but additional characters need to be read
			this._isReading = true;
			this._readFunction = this.readFunctions.get(val.read);
			if (!this._readFunction) {
				throw new Error(`Read function "${val.read}" not found.`);
			}
		} else {
			// return the keybinding and reset
			const keybindingObject = this.getKeybindingObject(this._input);
			this._resetInput();
			return keybindingObject;
		}

		return null;
	}

	read(keypressString) {
		const charsRead = this._readFunction(keypressString);
		if (typeof charsRead !== 'string') {
			return false;
		}

		const keybindingObject = this.getKeybindingObject(this._input, charsRead);
		this._resetInput();
		this._isReading = false;
		this._readFunction = null;
		return keybindingObject;
	}

	/**
	 * A read function. This one will only read one character, used e.g. for the
	 * "f" keybinding ("find"). Custom read functions can be defined and set
	 * inside the readFunctions.
	 *
	 * @param {string} keypressString - The string representing the character
	 * entered.
	 * @return {boolean|string} - Return false to indicate that more characters
	 * should be read. Return a string representing the characters read.
	 */
	readOneChar(keypressString) {
		return keypressString;
	}

	formatCharKey(char, key) {
		let keyString;

		if (key.ctrl || key.meta) {
			keyString = key.name;
		} else if (char === key.sequence) {
			keyString = char;
		} else {
			keyString = key.name;
		}

		if (this.constructor.NODE_KEY_CONVERSION[key.name]) {
			keyString = this.constructor.NODE_KEY_CONVERSION[key.name];
		}

		// order matters!
		if (key.ctrl) keyString = `ctrl+${keyString}`;
		if (key.option) keyString = `option+${keyString}`;
		if (key.meta && keyString !== 'escape') keyString = `meta+${keyString}`;

		// should not add shift when normal characters are pressed (e.g. "N").
		// also, node sometimes does not set `key.shift` as true -- e.g. on
		// shift+enter, `key.shift` is false. That is node's problem -- enter
		// is still a "shiftable" key in this context.
		if (key.shift && this.constructor.SHIFTABLE_KEYS.includes(key.name)) {
			keyString = `shift+${keyString}`;
		}

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

		let action;
		let rest = {};

		if (typeof val === 'string') {
			action = val;
		} else {
			const { action: keyAction, read, ...more } = val;
			action = keyAction;
			rest = more;
		}

		return { keyString, action, count, charsRead, ...rest };
	}

	parseInput(input) {
		if (input === '0') {
			return { keyString: '0', count: 1 };
		}

		const count = (() => {
			const match = /^(\d*)/.exec(input);
			return match && match[1] ? parseInt(match[1]) : 1;
		})();

		const keyString = input.replace(/^\d*/, '');

		return { keyString, count };
	}

	destroy() {
		this.readFunctions.clear();
		this.keymap.clear();
		this._input = null;
		this.readFunctions = this.keymap = null;
		this._inputTree = this._inputNode = this._isReading = null;
	}
}

module.exports = InputHandler;
