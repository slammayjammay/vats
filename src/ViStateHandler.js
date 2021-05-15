/**
 * Handles calculations relating to VI state.
 */
class ViStateHandler {
	constructor() {
		// maps vi keybindings to functions that return target states
		this.map = new Map([
			['cursor-up', (state, count) => ({ cursorY: state.cursorY - count })],
			['cursor-left', (state, count) => ({ cursorX: state.cursorX - count })],
			['cursor-right', (state, count) => ({ cursorX: state.cursorX + count })],
			['cursor-down', (state, count) => ({ cursorY: state.cursorY + count })],

			['cursor-to-document-left', (state) => ({ cursorX: 0 })],
			['cursor-to-document-left', (state) => ({ cursorX: 0 })],
			['cursor-to-document-right', (state) => ({ cursorX: state.documentWidth })],
			['cursor-to-document-top', (state) => ({ cursorY: 0 })],
			['cursor-to-document-bottom', (state) => ({ cursorY: state.documentHeight, scrollY: state.documentHeight - state.windowHeight })],

			['cursor-to-window-top', (state) => ({ cursorY: state.scrollY })],
			['cursor-to-window-middle', (state) => ({ cursorY: state.scrollY + ~~(Math.min(state.documentHeight, state.windowHeight) / 2) })],
			['cursor-to-window-bottom', (state) => ({ cursorY: state.scrollY + state.windowHeight })],

			// TODO: scrolling needs to be more complex than this
			['scroll-full-window-down', (state) => ({ cursorY: state.cursorY + state.windowHeight })],
			['scroll-full-window-up', (state) => ({ cursorY: state.cursorY - state.windowHeight })],
			['scroll-half-window-down', (state) => ({ cursorY: state.cursorY + ~~(state.windowHeight / 2) })],
			['scroll-half-window-up', (state) => ({ cursorY: state.cursorY - ~~(state.windowHeight / 2) })],

			['scroll-cursor-to-window-top', (state) => this.scrollCursorToWindowTop(state)],
			['scroll-cursor-to-window-middle', (state) => this.scrollCursorToWindowMiddle(state)],
			['scroll-cursor-to-window-bottom', (state) => this.scrollCursorToWindowBottom(state)]
		]);
	}

	has() { return this.map.has(...arguments); }
	get() { return this.map.get(...arguments); }
	set() { return this.map.set(...arguments); }
	clear() { return this.map.clear(...arguments); }
	delete() { return this.map.delete(...arguments); }

	/**
	 * Returns a boolean whether a target state can be calculated. By default, a
	 * calculation can be done if the only input is an existing state, a key
	 * action, and a count; i.e. all functions defined in `this.map` at startup.
	 * For actions like 'search-next', additional consumer-side input is needed
	 * to determine the target state, and so are not calculable by default.
	 *
	 * @param {string} action - a keybinding action.
	 * @param {number} count - how many times the action should occur.
	 * @param {object} readResults - any characters read.
	 * @return {boolean} whether the target state can be calculated.
	 */
	// canCalculateTargetState(action, count) {
	// 	return this.map.has(action);
	// }

	/**
	 * See notes for `#canCalculateTargetState`. By default any input other than
	 * `state`, `action`, and `count` is irrelevant when calculating target
	 * state, however in the case `this.map` is expanded on by the consumer it
	 * may be helpful to pass along all keybinding object properties.
	 *
	 * @param {object} state - the existing state.
	 * @param {string} action - a keybinding action.
	 * @param {number} count - how many times the action should occur.
	 * @return {object} the target state.
	 */
	calculateTargetState(state, action, count = 1) {
		const fn = this.map.get(action);

		if (!fn) {
			throw new Error(`Cannot calculate state for action "${action}".`);
		}

		return fn(state, count);
	}

	applyAction(state, action, count = 1) {
		const target = this.calculateTargetState(state, action, count);
		return this.setState(state, target);
	}

	/**
	 * @param {Object} state - The object to modify.
	 * @param {Object} target - An object containing the new state values.
	 * @return {Boolean} Whether any changes were made.
	 */
	setState(state, target) {
		const newEntries = Object.entries(target);
		if (newEntries.length === 0) {
			return false;
		}

		const old = {};
		newEntries.forEach(([key, val]) => {
			old[key] = state[key];
			state[key] = val;
		});

		this.clampState(state);

		for (const key of Object.keys(old)) {
			if (state[key] !== old[key]) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Ensure no weird negative values or cursor being outside window, etc.
	 */
	clampState(state, target = {}) {
		const adjustCursorX = target.scrollX !== undefined && target.cursorX === undefined;
		const adjustCursorY = target.scrollY !== undefined && target.cursorY === undefined;

		const previousCursorX = state.cursorX;
		const previousCursorY = state.cursorY;

		// clamp cursor position
		state.cursorX = Math.min(Math.max(0, state.cursorX), state.documentWidth);
		state.cursorY = Math.min(Math.max(0, state.cursorY), state.documentHeight);

		// clamp scroll position
		state.scrollX = Math.min(Math.max(0, state.scrollX), state.documentWidth);
		state.scrollY = Math.min(Math.max(0, state.scrollY), state.documentHeight);

		// need to make sure that cursor remains inside the window. this can either
		// be done by changing the cursor position or scrolling the window,
		// depending on what the action is inside `target`. if `target` sets either
		// the scroll or cursor positions, but not both, then the position not set
		// might need to be adjusted so that the cursor remains inside the window.
		// if `target` sets both values, there are two choices available: 1) assume
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

	correctScrollY({ cursorY, scrollY, windowHeight, documentHeight }, previousCursorY) {
		if (this.isCursorYInsideWindow({ cursorY, scrollY, windowHeight })) {
			return scrollY;
		}

		const shouldCenter = (
			previousCursorY !== undefined &&
			Math.abs(cursorY - previousCursorY) > windowHeight / 2
		);

		if (shouldCenter) {
			return this.scrollCursorToWindowMiddle({ cursorY, windowHeight, documentHeight }).scrollY;
		}

		return cursorY - (cursorY < scrollY ? 0 : windowHeight);
	}

	centerAlignScreenAroundCursorX({ cursorX, windowWidth }) {
		return { scrollX: Math.max(0, cursorX - ~~(windowWidth / 2)) };
	}

	scrollCursorToWindowTop({ cursorY }) {
		return { scrollY: cursorY };
	}

	scrollCursorToWindowMiddle({ cursorY, windowHeight, documentHeight }) {
		return { scrollY: Math.max(0, Math.min(documentHeight - windowHeight, cursorY - ~~(windowHeight / 2))) };
	}

	scrollCursorToWindowBottom({ cursorY, windowHeight }) {
		return { scrollY: cursorY - windowHeight };
	}

	destroy() {
		this.map.clear();
		this.map = null;
	}
}

export default ViStateHandler;
