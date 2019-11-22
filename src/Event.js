class Event {
	constructor(type, data = {}) {
		this.type = type;
		Object.assign(this, data);

		this.preventDefault = this.preventDefault.bind(this);

		this._defaultPrevented = false;
	}

	isDefaultPrevented() {
		return this._defaultPrevented;
	}

	preventDefault() {
		this._defaultPrevented = true;
	}
}

module.exports = Event;
