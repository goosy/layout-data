import { EventEmitter } from "node:events";

/** @import { Endian, Tag_Listener, Tag_Type } from "./typedefs.js" */
/** @import { Layout_Entry } from "./internal_types.js" */

/**
 * The interface of one tag of a TData (doc/spec-data-api.md §3). It holds no
 * value: reading `value` decodes it from the buffer of the TData, writing it
 * is the same as `tdata[name] = value`, and `load` / `store` are `load_tag` /
 * `store_tag` of the TData for the name of the tag. `change` events
 * (old_value, new_value) are emitted by the Observer of the TData.
 */
export class TTag extends EventEmitter {
	/** @type {import("./TData.js").TData} */
	#tdata;
	/** @type {Layout_Entry} */
	#entry;

	/**
	 * @param {import("./TData.js").TData} tdata - The TData the tag belongs to.
	 * @param {Layout_Entry} entry - The compiled entry of the tag.
	 */
	constructor(tdata, entry) {
		super();
		this.#tdata = tdata;
		this.#entry = entry;
		this.setMaxListeners(20);
	}

	/**
	 * Subscribes a listener; `change` is typed (old_value, new_value), any
	 * listener for another event name (doc/spec-data-api.md §3).
	 *
	 * @template {string | symbol} E
	 * @param {E} event
	 * @param {Tag_Listener<E>} listener
	 * @returns {this}
	 */
	on(event, listener) { return super.on(event, listener); }

	/**
	 * Subscribes a listener for one emission, typed like `on`.
	 *
	 * @template {string | symbol} E
	 * @param {E} event
	 * @param {Tag_Listener<E>} listener
	 * @returns {this}
	 */
	once(event, listener) { return super.once(event, listener); }

	/**
	 * Removes a listener, typed like `on`.
	 *
	 * @template {string | symbol} E
	 * @param {E} event
	 * @param {Tag_Listener<E>} listener
	 * @returns {this}
	 */
	off(event, listener) { return super.off(event, listener); }

	/** @returns {string} */
	get name() { return this.#entry.name; }
	/** @returns {Tag_Type} Lower case type name. */
	get type() { return this.#entry.type; }
	/** @returns {number} Size in bytes; a Bool has the byte it lies in. */
	get size() { return this.#entry.size; }
	/** @returns {number | boolean} */
	get value() { return this.#tdata[this.#entry.name]; }
	/** @param {number | boolean} value */
	set value(value) { this.#tdata[this.#entry.name] = value; }

	/**
	 * Same as `tdata.load_tag(name, io_buffer, endian)` (doc/spec-data-api.md §2.9).
	 *
	 * @param {Uint8Array} io_buffer
	 * @param {Endian} endian
	 */
	load(io_buffer, endian) { this.#tdata.load_tag(this.#entry.name, io_buffer, endian); }

	/**
	 * Same as `tdata.store_tag(name, io_buffer, endian)` (doc/spec-data-api.md §2.9).
	 *
	 * @param {Uint8Array} io_buffer
	 * @param {Endian} endian
	 */
	store(io_buffer, endian) { this.#tdata.store_tag(this.#entry.name, io_buffer, endian); }
}
