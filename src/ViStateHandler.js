const VI_STATE_PROPS = [
  'documentWidth',
  'documentHeight',
  'windowWidth',
  'windowHeight',
  'scrollX',
  'scrollY',
  'cursorX',
  'cursorY'
];

/**
 * Handles calculations relating to VI state. States are plain objects that
 * contain keys present inside `VI_STATE_PROPS`. Some keys can be ommitted for
 * the sake of simple calculations.
 */
class ViStateHandler {
	constructor() {
		// maps vi keybindings to functions that return objects specifying new
		// state values
		this.map = new Map([
			['cursor-up', (state, count) => ({ cursorY: state.cursorY - count })],
			['cursor-left', (state, count) => ({ cursorX: state.cursorX - count })],
			['cursor-right', (state, count) => ({ cursorX: state.cursorX + count })],
			['cursor-down', (state, count) => ({ cursorY: state.cursorY + count })],

			['cursor-to-document-left', (state, count) => ({ cursorX: 0 })],
			['cursor-to-document-left', (state, count) => ({ cursorX: 0 })],
			['cursor-to-document-right', (state, count) => ({ cursorX: state.documentWidth })],
			['cursor-to-document-top', (state, count) => ({ cursorY: 0 })],
			['cursor-to-document-bottom', (state, count) => ({ cursorY: state.documentHeight })],

			['cursor-to-window-top', (state, count) => ({ cursorY: state.scrollY })],
			['cursor-to-window-middle', (state, count) => ({ cursorY: state.scrollY + ~~(state.windowHeight / 2) })],
			['cursor-to-window-bottom', (state, count) => ({ cursorY: state.scrollY + state.windowHeight })],

			// TODO: scrolling needs to be more complex than this
			['scroll-full-window-down', (state, count) => ({ cursorY: state.cursorY + state.windowHeight })],
			['scroll-full-window-up', (state, count) => ({ cursorY: state.cursorY - state.windowHeight })],
			['scroll-half-window-down', (state, count) => ({ cursorY: state.cursorY + ~~(state.windowHeight / 2) })],
			['scroll-half-window-up', (state, count) => ({ cursorY: state.cursorY - ~~(state.windowHeight / 2) })],

			['top-align-window-around-cursor', (state, count) => this.topAlignScreenAroundCursorY(state)],
			['center-align-window-around-cursor', (state, count) => this.centerAlignScreenAroundCursorY(state)],
			['bottom-align-window-around-cursor', (state, count) => this.bottomAlignScreenAroundCursorY(state)]
		]);
	}

	getDiffForKeybinding(keybinding, state, count) {
		const fn = this.map.get(keybinding);

		if (typeof fn !== 'function') {
			throw new Error(`Unknown keybinding "${keybinding}".`);
		}

		return fn(state, count);
	}

	/**
	 * @param {Object} state - The object to modify.
	 * @param {Object} diff - An object containing the new state values.
	 * @return {Boolean} Whether any changes were made.
	 */
	changeState(state, diff) {
		const newEntries = Object.entries(diff);

		if (newEntries.length === 0) {
			return state;
		}

		const adjustCursorX = diff.scrollX !== undefined && diff.cursorX === undefined;
		const adjustCursorY = diff.scrollY !== undefined && diff.cursorY === undefined;

		const old = {};
		const previousCursorX = state.cursorX;
		const previousCursorY = state.cursorY;

		newEntries.forEach(([key, val]) => {
			old[key] = state[key];
			state[key] = val;
		});

		// clamp cursor position
		state.cursorX = Math.min(Math.max(0, state.cursorX), state.documentWidth);
		state.cursorY = Math.min(Math.max(0, state.cursorY), state.documentHeight);

		// clamp scroll position
		state.scrollX = Math.min(Math.max(0, state.scrollX), state.documentWidth);
		state.scrollY = Math.min(Math.max(0, state.scrollY), state.documentHeight);

		// need to make sure that cursor remains inside the window. this can either
		// be done by changing the cursor position or scrolling the window,
		// depending on what the action is inside `diff`. if `diff` sets either the
		// scroll or cursor positions, but not both, then the position not set
		// might need to be adjusted so that the cursor remains inside the window.
		// if `diff` sets both values, there are two choices available: 1) assume
		// both values do not need to be adjusted or 2) adjust the cursor position.

		if (adjustCursorX) {
			state.cursorX = this.correctCursorX(state);
		} else {
			state.scrollX = this.correctScrollX(state, previousCursorX);
		}

		if (adjustCursorY) {
			state.cursorY = this.correctCursorY(state);
		} else {
			state.scrollY = this.correctScrollY(state, previousCursorY);
		}

		for (const key of Object.keys(old)) {
			if (state[key] !== old[key]) {
				return true;
			}
		}

		return false;
	}

	isCursorXInsideWindow({ cursorX, scrollX, windowWidth }) {
		return scrollX <= cursorX && cursorX <= scrollX + windowWidth;
	}

	isCursorYInsideWindow({ cursorY, scrollY, windowHeight }) {
		return scrollY <= cursorY && cursorY <= scrollY + windowHeight;
	}

	correctCursorX({ cursorX, scrollX, windowWidth }) {
		return Math.max(0, Math.min(cursorX, scrollX + windowWidth));
	}

	correctCursorY({ cursorY, scrollY, windowHeight }) {
		return Math.max(0, Math.min(cursorY, scrollY + windowHeight));
	}

	correctScrollX({ cursorX, scrollX, windowWidth }, previousCursorX) {
		if (this.isCursorXInsideWindow({ cursorX, scrollX, windowWidth })) {
			return scrollX;
		}

		const shouldCenter = (
			previousCursorX !== undefined &&
			Math.abs(cursorX - previousCursorX) > windowWidth / 2
		);

		if (shouldCenter) {
			return this.centerAlignScreenAroundCursorX({ cursorX, windowWidth }).scrollX;
		}

		return cursorX - (cursorX < scrollX ? 0 : windowWidth);
	}

	correctScrollY({ cursorY, scrollY, windowHeight }, previousCursorY) {
		if (this.isCursorYInsideWindow({ cursorY, scrollY, windowHeight })) {
			return scrollY;
		}

		const shouldCenter = (
			previousCursorY !== undefined &&
			Math.abs(cursorY - previousCursorY) > windowHeight / 2
		);

		if (shouldCenter) {
			return this.centerAlignScreenAroundCursorY({ cursorY, windowHeight }).scrollY;
		}

		return cursorY - (cursorY < scrollY ? 0 : windowHeight);
	}

	centerAlignScreenAroundCursorX({ cursorX, windowWidth }) {
		return { scrollX: Math.max(0, cursorX - ~~(windowWidth / 2)) };
	}

	topAlignScreenAroundCursorY({ cursorY }) {
		return { scrollY: cursorY };
	}

	centerAlignScreenAroundCursorY({ cursorY, windowHeight }) {
		return { scrollY: Math.max(0, cursorY - ~~(windowHeight / 2)) };
	}

	bottomAlignScreenAroundCursorY({ cursorY, windowHeight }) {
		return { scrollY: cursorY - windowHeight };
	}

	destroy() {
		this.map.clear();
		this.map = null;
	}
}

module.exports = ViStateHandler;
