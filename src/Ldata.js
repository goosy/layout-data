import { Buffer } from "node:buffer";
import { EventEmitter } from "node:events";
import { Ltag } from "./Ltag.js";
import { emit_all } from "./dispatch.js";
import { check_endian, io_range, load_entry, store_entry } from "./endian.js";
import { Observer } from "./observer.js";
import { is_reserved_name } from "./reserved.js";

/** @import { Class_Access_Listener, Data_Listener, Endian, Layout } from "./typedefs.js" */
/** @import { Compiled_Layout, Layout_Entry } from "./internal_types.js" */

/**
 * The key of the constructor of Ldata, private to this module: an ldata is
 * created only by new_ldata, for the create_ldata of its layout
 * (doc/spec-data-api.md §2.1).
 */
const CREATE_KEY = Symbol("create ldata");

/** Set by a static block of Ldata: builds the class of a layout. */
let build_class;

/**
 * The class-level access listeners (doc/spec-data-api.md §2.8). They are kept
 * here and not on the data blocks, so that nothing done to a data block
 * removes them.
 *
 * @type {Set<Class_Access_Listener>}
 */
const class_access_listeners = new Set();

/** Set while an access listener runs: the accesses made meanwhile emit nothing. */
let in_access = false;

export class Ldata extends EventEmitter {
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

	/** @type {string} */
	#name;
	/** @returns {string} The name given at creation, used in logs and error messages. */
	get name() {
		return this.#name;
	}

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
	 * The open transaction, null outside one (doc/spec-data-api.md §4.2): whether
	 * it wrote, and the tags it read and wrote, gathered for `access`.
	 *
	 * @type {{ written: boolean, read: Set<Ltag>, write: Set<Ltag> } | null}
	 */
	#transaction = null;
	/**
	 * @type {Map<string, Ltag>}
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
	 * @returns {Ltag|undefined} The Ltag handle, undefined for an unknown name.
	 */
	get(tagname) {
		let tag = this.#handles.get(tagname);
		if (tag) return tag;
		const entry = this.#compiled.entries.get(tagname);
		if (!entry) return undefined;
		tag = new Ltag(this, entry);
		this.#handles.set(tagname, tag);
		return tag;
	}

	/**
	 * Runs fn synchronously and makes its accesses and writes one whole: no
	 * event is emitted during it; when fn returns, the gathered `access` is
	 * emitted, one detection runs and one `write` is emitted if fn wrote; when
	 * fn throws, the buffer is restored and only the gathered `access` of kind
	 * `read` is emitted (doc/spec-data-api.md §4.2). The return value of fn is
	 * not inspected: a Promise is neither awaited nor rejected.
	 *
	 * @template T
	 * @param {() => T} fn
	 * @returns {T} The return value of fn.
	 * @throws {Error} Inside a transaction; or whatever fn throws, after the rollback.
	 */
	transaction(fn) {
		if (this.#transaction) throw new Error(`${this.name}: a transaction is already open`);
		const saved = Buffer.from(this.#buffer);
		const state = { written: false, read: new Set(), write: new Set() };
		this.#transaction = state;
		let result;
		try {
			result = fn();
		} catch (error) {
			this.#transaction = null;
			saved.copy(this.#buffer);
			this.#observer.discard();
			this.#emit_access("read", this.#in_layout_order(state.read), []); // the writes were undone, the reads were not
			throw error;
		}
		this.#transaction = null;
		const errors = [];
		this.#emit_access("read", this.#in_layout_order(state.read), errors);
		this.#emit_access("write", this.#in_layout_order(state.write), errors);
		this.#observer.diff(errors);
		if (state.written) emit_all(this, "write", [this], errors);
		if (errors.length > 0) throw errors[0];
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
		const bytes = Buffer.from(this.#buffer.subarray(offset, offset + length));
		if (length > 0 && this.#has_access_listeners()) this.#accessed("read", this.#tags_in(offset, offset + length));
		return bytes;
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
	 * Reads the bits selected by mask of the byte at offset
	 * (doc/spec-data-api.md §2.5); `access` names only the Bools of those bits.
	 *
	 * @param {number} offset - Byte offset.
	 * @param {number} mask - An integer from 1 to 0xff.
	 * @returns {boolean} Whether any of the bits is set.
	 * @throws {RangeError} For an offset out of range, or a mask that is not an integer from 1 to 0xff.
	 */
	read_bit(offset, mask) {
		this.#check_bit(offset, mask);
		const value = (this.#buffer[offset] & mask) !== 0;
		if (this.#has_access_listeners()) this.#accessed("read", this.#tags_in(offset, offset + 1, mask));
		return value;
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
		this.#check_bit(offset, mask);
		const buffer = this.#buffer;
		buffer[offset] = value ? buffer[offset] | mask : buffer[offset] & ~mask;
		this.#written(offset, offset + 1, null, mask);
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
		this.#written(entry.byte, entry.byte + entry.size, entry);
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
		if (this.#has_access_listeners()) this.#accessed("read", [this.get(name)]);
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
	 * Checks the arguments of read_bit and write_bit.
	 *
	 * @param {number} offset
	 * @param {number} mask
	 * @throws {RangeError}
	 */
	#check_bit(offset, mask) {
		this.#check_range(offset, 1);
		if (!Number.isInteger(mask) || mask < 1 || mask > 0xff) {
			throw new RangeError(`${this.name}: mask ${mask} must be an integer from 1 to 0xff`);
		}
	}

	/**
	 * After a write of the byte range [start, end): registers the range, then
	 * detects the change at once and emits `write`; inside a transaction only
	 * remembers the write (doc/spec-data-api.md §4.2).
	 *
	 * @param {number} start
	 * @param {number} end - Exclusive.
	 * @param {Layout_Entry | null} [entry] - The tag written by name, null for a raw write.
	 * @param {number} [mask] - The bits written by write_bit.
	 */
	#written(start, end, entry = null, mask = 0xff) {
		this.#observer.touch(start, end);
		const errors = [];
		if (this.#has_access_listeners()) {
			const tags = entry ? [this.get(entry.name)] : this.#tags_in(start, end, mask);
			this.#emit_access("write", tags, errors);
		}
		if (this.#transaction) {
			this.#transaction.written = true;
			return;
		}
		this.#observer.diff(errors);
		emit_all(this, "write", [this], errors);
		if (errors.length > 0) throw errors[0];
	}

	/** Whether an access would reach a listener of the instance or of the class. */
	#has_access_listeners() {
		return class_access_listeners.size > 0 || this.listenerCount("access") > 0;
	}

	/**
	 * Emits `access` (doc/spec-data-api.md §2.8) and throws the first
	 * exception of the listeners, for a read.
	 *
	 * @param {"read" | "write"} kind
	 * @param {Ltag[]} tags
	 */
	#accessed(kind, tags) {
		const errors = [];
		this.#emit_access(kind, tags, errors);
		if (errors.length > 0) throw errors[0];
	}

	/**
	 * Calls the `access` listeners, pushing what they throw to `errors`; inside
	 * a transaction only gathers the tags (doc/spec-data-api.md §4.2).
	 *
	 * @param {"read" | "write"} kind
	 * @param {Ltag[]} tags
	 * @param {unknown[]} errors
	 */
	#emit_access(kind, tags, errors) {
		if (in_access || tags.length === 0) return;
		if (this.#transaction) {
			const gathered = this.#transaction[kind];
			for (const tag of tags) gathered.add(tag);
			return;
		}
		in_access = true;
		try {
			emit_all(this, "access", [kind, tags], errors);
			for (const listener of [...class_access_listeners]) {
				try {
					listener(this, kind, tags);
				} catch (error) {
					errors.push(error);
				}
			}
		} finally {
			in_access = false;
		}
	}

	/**
	 * The tags that have a byte in the range [start, end), in layout order and
	 * without repeats; the Bools whose bit is not in `mask` are left out.
	 *
	 * @param {number} start
	 * @param {number} end - Exclusive.
	 * @param {number} [mask] - The bits of the bytes that are accessed.
	 * @returns {Ltag[]}
	 */
	#tags_in(start, end, mask = 0xff) {
		const entries = new Set();
		const tags_at_byte = this.#compiled.tags_at_byte;
		for (let i = start; i < end; i++) {
			for (const entry of tags_at_byte[i]) {
				if (entry.type === "bool" && (entry.mask & mask) === 0) continue;
				entries.add(entry);
			}
		}
		return [...entries].sort((a, b) => a.index - b.index).map((entry) => this.get(entry.name));
	}

	/**
	 * The gathered tags of a transaction, in layout order.
	 *
	 * @param {Set<Ltag>} tags
	 * @returns {Ltag[]}
	 */
	#in_layout_order(tags) {
		const entries = this.#compiled.entries;
		return [...tags].sort((a, b) => entries.get(a.name).index - entries.get(b.name).index);
	}

	/**
	 * Builds the class of a layout: a subclass of Ldata whose prototype holds
	 * the accessor of every tag, shared by all instances of the layout. The
	 * accessors are defined here so that they reach the private buffer.
	 *
	 * @param {Layout} layout
	 * @param {Compiled_Layout} compiled - The compiled data of the layout.
	 * @returns {typeof Ldata}
	 */
	static #build_class(layout, compiled) {
		const Layout_Data = class extends Ldata {
			/**
			 * @param {symbol} key
			 * @param {string} name
			 */
			constructor(key, name) {
				super(key, name, layout, compiled);
			}
		};
		Object.defineProperty(Layout_Data, "name", { value: `Ldata_${layout.name}` });
		for (const entry of compiled.entries.values()) {
			const { name, codec, byte, mask, size } = entry;
			if (is_reserved_name(name)) {
				throw new Error(`${layout.name}.${name}: reserved tag name`);
			}
			Object.defineProperty(Layout_Data.prototype, name, {
				get() {
					const value = codec.get(this.#buffer, byte, mask);
					if (this.#has_access_listeners()) this.#accessed("read", [this.get(name)]);
					return value;
				},
				set(value) {
					const reason = codec.check(value);
					if (reason !== null) {
						const Refused_Error = typeof value === "number" ? RangeError : TypeError;
						throw new Refused_Error(`${this.name}.${name}: ${reason}`);
					}
					codec.set(this.#buffer, byte, mask, value);
					this.#written(byte, byte + size, entry);
				},
				enumerable: true,
				configurable: false,
			});
		}
		return Layout_Data;
	}

	static {
		build_class = (layout, compiled) => Ldata.#build_class(layout, compiled);
	}

	/**
	 * Subscribes a function called for the accesses to every data block, with
	 * (data, kind, tags); the same function twice is one subscription
	 * (doc/spec-data-api.md §2.8).
	 *
	 * @param {Class_Access_Listener} listener
	 * @throws {TypeError} When listener is not a function.
	 */
	static on_access(listener) {
		if (typeof listener !== "function") throw new TypeError("an access listener must be a function");
		class_access_listeners.add(listener);
	}

	/**
	 * Cancels a subscription of on_access; nothing happens for a function that
	 * is not subscribed.
	 *
	 * @param {Class_Access_Listener} listener
	 */
	static off_access(listener) {
		class_access_listeners.delete(listener);
	}

	/**
	 * Not called by the user: an ldata is created by its layout,
	 * `layout.create_ldata(name)` (doc/spec-data-api.md §2.1), which builds
	 * an instance of the class of the layout (a subclass of Ldata whose
	 * prototype holds the tag accessors).
	 *
	 * @private
	 * @param {symbol} key - The key private to this module.
	 * @param {string} name - The name of the ldata, a string that cannot be changed afterwards.
	 * @param {Layout} layout
	 * @param {Compiled_Layout} compiled
	 * @throws {TypeError} When called with new, or when name is not a string.
	 */
	constructor(key, name, layout, compiled) {
		if (key !== CREATE_KEY) throw new TypeError("an ldata is created by its layout: layout.create_ldata(name)");
		if (typeof name !== "string") throw new TypeError("the name of an ldata must be a string");
		super();
		this.#name = name;
		this.#layout = layout;
		this.#compiled = compiled;
		this.setMaxListeners(100);
		this.#buffer = Buffer.alloc(this.#layout.size, 0);
		// init values in layout order: the bits of a combined word after the word
		for (const { codec, byte, mask, init_value } of this.#compiled.entries.values()) {
			codec.set(this.#buffer, byte, mask, init_value);
		}
		this.#observer = new Observer(this.#buffer, this.#layout.name, this.#compiled, (entry, old_value, new_value, errors) => {
			// the data block event first, as when it relayed the tag events
			emit_all(this, "change", [entry.name, old_value, new_value], errors);
			emit_all(this.#handles.get(entry.name), "change", [old_value, new_value], errors);
		});
	}
}

/**
 * Builds the class of a layout (doc/design.md §4), for the layout to keep
 * privately. Internal: index.js does not export it.
 *
 * @param {Layout} layout
 * @param {Compiled_Layout} compiled
 * @returns {typeof Ldata}
 * @throws {Error} For a reserved tag name.
 */
export function build_ldata_class(layout, compiled) {
	return build_class(layout, compiled);
}

/**
 * Creates an ldata of the class of a layout. Internal: index.js does not export it.
 *
 * @param {typeof Ldata} Layout_Data - A class made by build_ldata_class.
 * @param {string} name
 * @returns {Ldata}
 * @throws {TypeError} When name is not a string.
 */
export function new_ldata(Layout_Data, name) {
	return new Layout_Data(CREATE_KEY, name);
}
