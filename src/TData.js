import { Buffer } from "node:buffer";
import { EventEmitter } from "node:events";
import { TTag } from "./TTag.js";
import { check_endian, io_range, load_entry, store_entry } from "./endian.js";
import { Observer } from "./observer.js";
import { compiled_of, find_layout, layout_of } from "./registry.js";
import { is_reserved_name } from "./reserved.js";

/** @import { Access_Tracer, Data_Listener, Endian, Layout } from "./typedefs.js" */
/** @import { Compiled_Layout } from "./internal_types.js" */

/**
 * Called on every tag access while set (doc/design.md §4).
 *
 * @type {Access_Tracer | null}
 */
let access_tracer = null;

/**
 * Sets a function called on every tag access through the accessors, as
 * tracer(tdata, name, "read" | "write"), or clears it with null. For tests
 * that check declared dependencies; the data layer knows nothing else of it.
 *
 * @param {Access_Tracer | null} tracer
 */
export function set_access_tracer(tracer) {
	access_tracer = tracer;
}

/** The classes built so far, by layout name (doc/design.md §4). */
const classes = new Map();

/**
 * The registered layout a TData argument stands for.
 *
 * @param {Layout | string} layout - A layout name, or the registered layout of its name.
 * @returns {Layout}
 * @throws {Error} For an unknown name, or a layout that is not the registered one.
 */
function resolve_layout(layout) {
	if (typeof layout === "string") return layout_of(layout);
	if (find_layout(layout?.name) !== layout) throw new Error(`${layout?.name} is not a registered layout`);
	return layout;
}

export class TData extends EventEmitter {
	/**
	 * @type {Buffer}
	 * @description Internal buffer, private (doc/spec-data-api.md §2.2).
	 * All data items, including combined words, are stored in Big-Endian format.
	 * Device endianness is converted only at the IO boundary (the IO layer).
	 */
	#buffer;
	/** @returns {number} Size of the data block in bytes. */
	get size() {
		return this.#buffer.length;
	}

	/**
	 * @type {string}
	 */
	name;

	/** @type {Layout} */
	#layout;
	/** @type {Compiled_Layout} */
	#compiled;
	/**
	 * The compiled layout of this data block (doc/design.md §3), read-only.
	 * The tag accessors are defined once on the prototype of the class built for the layout.
	 *
	 * @returns {Layout}
	 */
	get layout() { return this.#layout; }

	/** @type {Observer} */
	#observer;
	/**
	 * The open transaction, null outside one (doc/spec-data-api.md §4.2).
	 *
	 * @type {{ written: boolean } | null}
	 */
	#transaction = null;
	/**
	 * @type {Map<string, TTag>}
	 * @description The tag handles created so far, by tag name.
	 */
	#handles = new Map();
	/**
	 * Subscribes a listener; typed for `change` and `write`, any listener for
	 * another event name (doc/spec-data-api.md §2.7).
	 *
	 * @template {string | symbol} E
	 * @param {E} event
	 * @param {Data_Listener<E>} listener
	 * @returns {this}
	 */
	on(event, listener) { return super.on(event, listener); }

	/**
	 * Subscribes a listener for one emission, typed like `on`.
	 *
	 * @template {string | symbol} E
	 * @param {E} event
	 * @param {Data_Listener<E>} listener
	 * @returns {this}
	 */
	once(event, listener) { return super.once(event, listener); }

	/**
	 * Removes a listener, typed like `on`.
	 *
	 * @template {string | symbol} E
	 * @param {E} event
	 * @param {Data_Listener<E>} listener
	 * @returns {this}
	 */
	off(event, listener) { return super.off(event, listener); }

	/**
	 * Retrieves the handle of a tag, creating it on first use.
	 * @param {string} tagname - The name of the tag to retrieve.
	 * @returns {TTag|undefined} The TTag handle, undefined for an unknown name.
	 */
	get(tagname) {
		let tag = this.#handles.get(tagname);
		if (tag) return tag;
		const entry = this.#compiled.entries.get(tagname);
		if (!entry) return undefined;
		tag = new TTag(this, entry);
		this.#handles.set(tagname, tag);
		return tag;
	}

	/**
	 * Runs fn synchronously and makes its writes one whole: no event is emitted
	 * during it; when fn returns, one detection runs and one `write` is emitted
	 * if fn wrote; when fn throws, the buffer is restored and no event is
	 * emitted (doc/spec-data-api.md §4.2). The return value of fn is not
	 * inspected: a Promise is neither awaited nor rejected.
	 *
	 * @template T
	 * @param {() => T} fn
	 * @returns {T} The return value of fn.
	 * @throws {Error} Inside a transaction; or whatever fn throws, after the rollback.
	 */
	transaction(fn) {
		if (this.#transaction) throw new Error(`${this.name}: a transaction is already open`);
		const saved = Buffer.from(this.#buffer);
		const state = { written: false };
		this.#transaction = state;
		let result;
		try {
			result = fn();
		} catch (error) {
			this.#transaction = null;
			saved.copy(this.#buffer);
			this.#observer.discard();
			throw error;
		}
		this.#transaction = null;
		this.#observer.diff();
		if (state.written) this.emit("write", this);
		return result;
	}

	/**
	 * Reads a range of bytes (doc/spec-data-api.md §2.5).
	 *
	 * @param {number} [offset=0] - Byte offset.
	 * @param {number} [length] - Number of bytes, up to the end of the data block by default.
	 * @returns {Buffer} A copy: changing it does not affect the data block.
	 * @throws {RangeError} For an offset or length out of range.
	 */
	read_bytes(offset = 0, length = this.#buffer.length - offset) {
		this.#check_range(offset, length);
		return Buffer.from(this.#buffer.subarray(offset, offset + length));
	}

	/**
	 * Writes all the bytes of source from a byte offset (doc/spec-data-api.md §2.5).
	 * An empty source writes nothing and emits no `write`.
	 *
	 * @param {number} offset - Byte offset.
	 * @param {Uint8Array} source
	 * @throws {RangeError} For an offset out of range, or a run past the end of the data block.
	 * @throws {TypeError} When source is not a Uint8Array.
	 */
	write_bytes(offset, source) {
		if (!(source instanceof Uint8Array)) throw new TypeError(`${this.name}: source must be a Uint8Array`);
		this.#check_range(offset, source.length);
		if (source.length === 0) return; // nothing written: not a write
		this.#buffer.set(source, offset);
		this.#written(offset, offset + source.length);
	}

	/**
	 * Writes the bits selected by mask of the byte at offset; the other bits
	 * are unchanged (doc/spec-data-api.md §2.5).
	 *
	 * @param {number} offset - Byte offset.
	 * @param {number} mask - An integer from 1 to 0xff.
	 * @param {boolean} value - Taken by truthiness.
	 * @throws {RangeError} For an offset out of range, or a mask that is not an integer from 1 to 0xff.
	 */
	write_bit(offset, mask, value) {
		this.#check_range(offset, 1);
		if (!Number.isInteger(mask) || mask < 1 || mask > 0xff) {
			throw new RangeError(`${this.name}: mask ${mask} must be an integer from 1 to 0xff`);
		}
		const buffer = this.#buffer;
		buffer[offset] = value ? buffer[offset] | mask : buffer[offset] & ~mask;
		this.#written(offset, offset + 1);
	}

	/**
	 * Converts the bytes of a tag from a device-ordered IO buffer and writes
	 * them into the data block; a write like any other
	 * (doc/spec-data-api.md §2.9).
	 *
	 * @param {string} name - The tag name.
	 * @param {Uint8Array} io_buffer - Indexed like the byte offsets of the data block.
	 * @param {Endian} endian - Device byte order.
	 * @throws {Error} For an unknown tag name.
	 * @throws {RangeError} For another byte order, or a tag out of the IO buffer.
	 * @throws {TypeError} When io_buffer is not a Uint8Array.
	 */
	load_tag(name, io_buffer, endian) {
		const entry = this.#entry_for_io(name, io_buffer, endian);
		load_entry(entry, io_buffer, this.#buffer, endian);
		this.#written(entry.byte, entry.byte + entry.size);
	}

	/**
	 * Converts the bytes of a tag and writes them into a device-ordered IO
	 * buffer; the data block is unchanged and no event is emitted
	 * (doc/spec-data-api.md §2.9).
	 *
	 * @param {string} name - The tag name.
	 * @param {Uint8Array} io_buffer - Indexed like the byte offsets of the data block.
	 * @param {Endian} endian - Device byte order.
	 * @throws {Error} For an unknown tag name.
	 * @throws {RangeError} For another byte order, or a tag out of the IO buffer.
	 * @throws {TypeError} When io_buffer is not a Uint8Array.
	 */
	store_tag(name, io_buffer, endian) {
		const entry = this.#entry_for_io(name, io_buffer, endian);
		store_entry(entry, this.#buffer, io_buffer, endian);
	}

	/**
	 * The compiled entry of a tag, after checking the arguments of load_tag
	 * and store_tag before anything is changed.
	 *
	 * @param {string} name
	 * @param {Uint8Array} io_buffer
	 * @param {Endian} endian
	 * @returns {import("./internal_types.js").Layout_Entry}
	 */
	#entry_for_io(name, io_buffer, endian) {
		if (!(io_buffer instanceof Uint8Array)) throw new TypeError(`${this.name}: io_buffer must be a Uint8Array`);
		check_endian(endian);
		const entry = this.#compiled.entries.get(name);
		if (!entry) throw new Error(`${this.name}: unknown tag ${name}`);
		if (io_range(entry, endian).end > io_buffer.length) {
			throw new RangeError(`${this.name}.${name}: out of the io_buffer of ${io_buffer.length} bytes`);
		}
		return entry;
	}

	/**
	 * Checks a byte range before anything is read or written.
	 *
	 * @param {number} offset
	 * @param {number} length
	 * @throws {RangeError}
	 */
	#check_range(offset, length) {
		if (!Number.isInteger(offset) || offset < 0) {
			throw new RangeError(`${this.name}: offset ${offset} must be a non-negative integer`);
		}
		if (!Number.isInteger(length) || length < 0 || offset + length > this.#buffer.length) {
			throw new RangeError(`${this.name}: length ${length} at offset ${offset} exceeds the data block`);
		}
	}

	/**
	 * After a write of the byte range [start, end): registers the range, then
	 * detects the change at once and emits `write`; inside a transaction only
	 * remembers the write (doc/spec-data-api.md §4.2).
	 *
	 * @param {number} start
	 * @param {number} end - Exclusive.
	 */
	#written(start, end) {
		this.#observer.touch(start, end);
		if (this.#transaction) {
			this.#transaction.written = true;
			return;
		}
		this.#observer.diff();
		this.emit("write", this);
	}

	/**
	 * The class of a layout, built on the first use of its name: the name tells
	 * the layouts apart, as the registry holds one layout per name.
	 *
	 * @param {Layout} layout - A registered layout.
	 * @returns {typeof TData}
	 */
	static #class_of(layout) {
		let Layout_Data = classes.get(layout.name);
		if (!Layout_Data) {
			Layout_Data = TData.#build_class(layout);
			classes.set(layout.name, Layout_Data);
		}
		return Layout_Data;
	}

	/**
	 * Builds the class of a layout: a subclass of TData whose prototype holds
	 * the accessor of every tag, shared by all instances of the layout. The
	 * accessors are defined here so that they reach the private buffer.
	 *
	 * @param {Layout} layout
	 * @returns {typeof TData}
	 */
	static #build_class(layout) {
		const Layout_Data = class extends TData { };
		Object.defineProperty(Layout_Data, "name", { value: `TData_${layout.name}` });
		const compiled = compiled_of(layout);
		for (const entry of compiled.entries.values()) {
			const { name, codec, byte, mask, size } = entry;
			if (is_reserved_name(name)) {
				throw new Error(`${layout.name}.${name}: reserved tag name`);
			}
			Object.defineProperty(Layout_Data.prototype, name, {
				get() {
					if (access_tracer) access_tracer(this, name, "read");
					return codec.get(this.#buffer, byte, mask);
				},
				set(value) {
					if (access_tracer) access_tracer(this, name, "write");
					codec.set(this.#buffer, byte, mask, value);
					this.#written(byte, byte + size);
				},
				enumerable: true,
				configurable: false,
			});
		}
		Layout_Data.layout = layout;
		Layout_Data.compiled = compiled;
		return Layout_Data;
	}

	/**
	 * Creates a data block of a layout (doc/spec-data-api.md §2.1).
	 *
	 * `new TData(layout, name)` returns an instance of the class built for the
	 * layout name (a subclass of TData whose prototype holds the tag
	 * accessors), building the class on the first use of the name.
	 *
	 * @param {Layout | string} layout - A registered layout, or its name (layout_of).
	 * @param {string} name - The name of the TData instance.
	 * @throws {Error} For an unknown layout name, or a layout that is not the registered one.
	 */
	constructor(layout, name) {
		super();
		if (new.target === TData) {
			const registered = resolve_layout(layout);
			return new (TData.#class_of(registered))(registered, name);
		}
		this.name = name;
		this.#layout = new.target.layout;
		this.#compiled = new.target.compiled;
		this.setMaxListeners(100);
		this.#buffer = Buffer.alloc(this.#layout.size, 0);
		// init values in layout order: the bits of a combined word after the word
		for (const { codec, byte, mask, init_value } of this.#compiled.entries.values()) {
			codec.set(this.#buffer, byte, mask, init_value);
		}
		this.#observer = new Observer(this.#buffer, this.#layout.name, this.#compiled, (entry, old_value, new_value) => {
			// the data block event first, as when it relayed the tag events
			this.emit("change", entry.name, old_value, new_value);
			this.#handles.get(entry.name)?.emit("change", old_value, new_value);
		});
	}
}
