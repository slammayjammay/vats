class ViewSwitcher {
	constructor(div) {
		this.div = div;
		this.views = new Map();

		this.active = null;
	}

	has() { return this.views.has(...arguments); }
	get() { return this.views.get(...arguments); }
	set() { return this.views.set(...arguments); }

	setActive(view) {
		if (typeof view === 'string') {
			view = this.get(view);
		}

		if (this.active && this.active !== view) {
			this.active.div.reset();
		}

		this.active = view;
	}
}

module.exports = ViewSwitcher;
