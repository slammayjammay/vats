const SHIFTABLE_KEYS = new Set([
	'escape', 'return', 'tab', 'backspace', 'up', 'down', 'left', 'right'
]);

const NODE_KEY_CONVERSION = {
	return: 'enter'
};

/**
 * See `keybinding.js` for list of all keybindings.
 */
class InputHandler {
	/**
	 * When creating a keybinding, prepending "shift+" only makes sense when
	 * these special keys are pressed. When normal keys are pressed, just add
	 * that character instead. For example, "N" is valid whereas "shift+n" is
	 * not.
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
		this._charsEntered = [];
		this._input = '';

		this.map = new Map();

		this._inputTree = null;
		this._inputNode = null;

		this.isReading = false;
		this._currentKeyString = null;
		this._currentKeyVal = null;
		this._readResults = {};
	}

	/**
	 * Merges the given map with the existing one.
	 * @param {map} map - The keybinding map to marge.
	 */
	mergeKeybinding(map) {
		this.map = new Map([...this.map, ...map]);
		this._inputNode = this._inputTree = this._constructInputTree(this.map);
	}

	get() { return this.map.get(...arguments); }

	has() { return this.map.has(...arguments); }

	set() {
		const ret = this.map.set(...arguments);
		this._inputNode = this._inputTree = this._constructInputTree(this.map);
		return ret;
	}

	delete() {
		if (this.map.delete(...arguments)) {
			this._inputNode = this._inputTree = this._constructInputTree(this.map);
			return true;
		}

		return false;
	}

	clear() {
		this.map.clear(...arguments);
		this._inputNode = this._inputTree = this._constructInputTree(this.map);
	}

	_constructInputTree(map) {
		const tree = {};

		for (const [key, val] of map.entries()) {
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

	_reset() {
		this._charsEntered = [];
		this._input = '';
		this._inputNode = this._inputTree;
		this.isReading = false;
		this._currentKeyString = this._currentKeyVal = null;
		this._readResults = {};
	}

	/**
	 * TODO: able to interpret a string of inputted chars correctly
	 */
	parseInput(input) {
	}

	handleCharKey(char, key) {
		const formatted = this.formatCharKey(char, key);
		return this.handleFormatted(formatted, char, key);
	}

	/**
	 * @return {object|boolean} - If a keybinding is found, returns a keybinding
	 * object. If no keybinding is found, or if additional chars are needed to
	 * complete a keybinding, returns null.
	 */
	handleFormatted(formatted, char, key) {
		if (this.isReading) {
			return this.read(formatted, char, key);
		}

		this._charsEntered.push(formatted);

		if (this._inputNode[formatted]) {
			this._inputNode = this._inputNode[formatted];
			this._input += formatted + ' ';
			return null;
		}

		const isNumber = /^\d$/.test(formatted);

		if (!isNumber) {
			this._input += formatted;
		}

		// found a keybinding
		if (this.map.has(this._input)) {
			this._currentKeyString = this._input;
			this._currentKeyVal = this.map.get(this._input);

			// need to read more chars?
			if (this._currentKeyVal.read) {
				this.isReading = true;
				return null;
			}

			return this._getKeybindingObjectAndReset();
		}

		if (!isNumber) {
			this._reset();
		}

		return null;
	}

	read(formatted, char, key) {
		this._charsEntered.push(formatted);

		// until the read function returns an array of formatted keys, keep reading
		const returnValue = this._currentKeyVal.read(formatted, char, key);
		if (!Array.isArray(returnValue)) {
			return null;
		}

		// when done reading, store the read keys
		this._readResults[this._currentKeyVal.action] = returnValue;

		if (!this._currentKeyVal.resume) {
			return this._getKeybindingObjectAndReset();
		}

		this.isReading = false;
		this._input = '';
		this._currentKeyString = this._currentKeyVal = null;
		this._inputNode = this._inputTree;
	}

	formatCharKey(char, key) {
		let formatted;

		if (key.ctrl || key.meta) {
			formatted = key.name;
		} else if (char === key.sequence) {
			formatted = char;
		} else {
			formatted = key.name;
		}

		if (this.constructor.NODE_KEY_CONVERSION[key.name]) {
			formatted = this.constructor.NODE_KEY_CONVERSION[key.name];
		}

		// order matters!
		if (key.ctrl) formatted = `ctrl+${formatted}`;
		if (key.option) formatted = `option+${formatted}`;
		if (key.meta && formatted !== 'escape') formatted = `meta+${formatted}`;

		// should not add shift when normal characters are pressed (e.g. "N").
		// also, node sometimes does not set `key.shift` as true -- e.g. on
		// shift+enter, `key.shift` is false. That is node's problem -- enter
		// is still a "shiftable" key in this context.
		if (key.shift && this.constructor.SHIFTABLE_KEYS.has(key.name)) {
			formatted = `shift+${formatted}`;
		}

		return formatted;
	}

	getCountForInput(input) {
		const match = /^(\d*)/.exec(input);
		return match && match[1] ? parseInt(match[1]) : 1;
	}

	/**
	 * Relies on internal state set by previously entered characters.
	 *
	 * @return {Object} obj
	 * @prop {array} obj.charsEntered - all formatted keys for this keybinding.
	 * @prop {string} obj.action - the keybinding action.
	 * @prop {number} obj.count - how many times the keybinding should occur.
	 * @prop {object} obj.readResults - object with keybinding names as keys and
	 * a string of read chars as values.
	 * @prop {*} ...rest - any other properties defined on the keybinding.
	 */
	_getKeybindingObject() {
		const charsEntered = this._charsEntered;
		const count = this.getCountForInput(charsEntered);
		const readResults = this._readResults;

		let action;
		let rest;

		if (typeof this._currentKeyVal === 'string') {
			action = this._currentKeyVal;
			rest = {};
		} else {
			const { action: keyAction, read, resume, ...more } = this._currentKeyVal;
			action = keyAction;
			rest = more;
		}

		return { charsEntered, action, count, readResults, ...rest };
	}

	_getKeybindingObjectAndReset() {
		const keybindingObject = this._getKeybindingObject();
		this._reset();
		return keybindingObject;
	}

	destroy() {
		this.map.clear();
		this.map = null;
		this._charsEntered = this._input = null;
		this._inputTree = this._inputNode = this.isReading = null;
		this._currentKeyString = this._currentKeyVal = this._readResults = {};
	}
}

module.exports = InputHandler;
