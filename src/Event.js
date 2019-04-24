class Event {
	constructor(type, data = {}) {
		this.type = type;
		Object.assign(this, data);

		this.preventDefault = this.preventDefault.bind(this);
		this.getFyi = this.getFyi.bind(this);
		this.fyi = this.fyi.bind(this);

		this._defaultPrevented = false;
		this._fyis = {};
	}

	isDefaultPrevented() {
		return this._defaultPrevented;
	}

	preventDefault() {
		this._defaultPrevented = true;
	}

	getFyi(val) {
		return this._fyis[val];
	}

	fyi(key, val) {
		this._fyis[key] = val;
	}
}

module.exports = Event;
