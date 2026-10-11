import { EventEmitter } from "node:events";

/** @import { Layout_Entry } from "./typedefs.js" */

/**
 * The interface of one tag of a TData (doc/spec-data-api.md §3). It holds no
 * value: reading `value` decodes it from the buffer of the TData, writing it
 * is the same as `tdata[name] = value`. `change` events (old_value, new_value)
 * are emitted by the Observer of the TData.
 */
export class TTag extends EventEmitter {
	/** @type {import("./TData.js").TData} */
	#tdata;
	/** @type {Layout_Entry} */
	#entry;

	/**
	 * @param {import("./TData.js").TData} tdata - The TData the tag belongs to.
	 * @param {Layout_Entry} entry - The layout entry of the tag.
	 */
	constructor(tdata, entry) {
		super();
		this.#tdata = tdata;
		this.#entry = entry;
		this.setMaxListeners(20);
	}

	/** @returns {string} */
	get name() { return this.#entry.name; }
	/** @returns {string} Lower case type name. */
	get type() { return this.#entry.type; }
	/** @returns {number} Size in bytes. */
	get length() { return this.#entry.size; }
	/** @returns {Layout_Entry} */
	get entry() { return this.#entry; }
	/** @returns {number | boolean} */
	get value() { return this.#tdata[this.#entry.name]; }
	/** @param {number | boolean} value */
	set value(value) { this.#tdata[this.#entry.name] = value; }
}
