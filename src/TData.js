import { Buffer } from "node:buffer";
import { EventEmitter } from "node:events";
import { TTag } from "./TTag.js";
import { Observer } from "./observer.js";
import { find_layout, layout_of } from "./registry.js";

/** @import { Access_Tracer, Layout, Layout_Entry, TData_Options } from "./typedefs.js" */

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

/** The layout of the probe: a data block with no tag. */
const EMPTY_LAYOUT = Object.freeze({
	name: "EMPTY", length: 0, size: 0, items: Object.freeze([]),
	entries: new Map(), tags_at_byte: [],
});
let probe = null;

/**
 * Builds the class of a layout: a subclass of TData whose prototype holds
 * the accessor of every tag, shared by all instances of the layout.
 *
 * @param {Layout} layout
 * @returns {typeof TData}
 */
function build_class(layout) {
	const Layout_Data = class extends TData { };
	Object.defineProperty(Layout_Data, "name", { value: `TData_${layout.name}` });
	for (const entry of layout.entries.values()) {
		const { name, codec, byte, mask } = entry;
		if (TData.is_reserved_name(name)) {
			throw new Error(`${layout.name}.${name}: tag name collides with a TData member`);
		}
		Object.defineProperty(Layout_Data.prototype, name, {
			get() {
				if (access_tracer) access_tracer(this, name, "read");
				return codec.get(this.buffer, byte, mask);
			},
			set(value) {
				if (access_tracer) access_tracer(this, name, "write");
				codec.set(this.buffer, byte, mask, value);
				this.after_write(entry);
			},
			enumerable: true,
			configurable: false,
		});
	}
	Layout_Data.layout = layout;
	return Layout_Data;
}

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

/**
 * The class of a layout, built on the first use of its name: the name tells
 * the layouts apart, as the registry holds one layout per name.
 *
 * @param {Layout} layout - A registered layout.
 * @returns {typeof TData}
 */
function class_of(layout) {
	let Layout_Data = classes.get(layout.name);
	if (!Layout_Data) {
		Layout_Data = build_class(layout);
		classes.set(layout.name, Layout_Data);
	}
	return Layout_Data;
}

export class TData extends EventEmitter {
	/**
	 * @type {Buffer}
	 * @readonly
	 * @description Internal buffer
	 * all data items, including combined words, are stored in Big-Endian format.
	 * Device endianness is converted only at the IO boundary (the IO binding).
	 */
	#buffer;
	/**
	 * get the internal buffer
	 *
	 * @return {Buffer} - the internal buffer.
	 */
	get buffer() { return this.#buffer; }
	get size() {
		return this.#buffer.length;
	}

	/**
	 * @type {string}
	 */
	name;

	/** @type {Layout} */
	#layout;
	/**
	 * The compiled layout of this data block (doc/design.md §3), read-only.
	 * The tag accessors are defined once on the prototype of the class built for the layout.
	 *
	 * @returns {Layout}
	 */
	get layout() { return this.#layout; }

	/** @type {Observer} */
	#observer;
	/** @type {"immediate" | "deferred"} (doc/spec-data-api.md §4) */
	#detection;
	/**
	 * @type {Map<string, TTag>}
	 * @description The tag handles created so far, by tag name.
	 */
	#handles = new Map();
	/**
	 * Retrieves the handle of a tag, creating it on first use.
	 * @param {string} tagname - The name of the tag to retrieve.
	 * @returns {TTag|undefined} The TTag handle, undefined for an unknown name.
	 */
	get(tagname) {
		let tag = this.#handles.get(tagname);
		if (tag) return tag;
		const entry = this.layout.entries.get(tagname);
		if (!entry) return undefined;
		tag = new TTag(this, entry);
		this.#handles.set(tagname, tag);
		return tag;
	}

	/**
	 * Detects every change since the last detection and emits its events
	 * (doc/spec-data-api.md §2.6). Needed after writing the buffer directly,
	 * and in the deferred mode whenever the user chooses.
	 */
	detect() {
		this.#observer.diff();
	}

	/**
	 * Writes a 16-bit register (big-endian) at a byte offset
	 * (doc/spec-data-api.md §2.5).
	 *
	 * @param {number} offset - Byte offset.
	 * @param {number} value
	 */
	write_register(offset, value) {
		this.#buffer.writeUInt16BE(value, offset);
		this.#written();
	}

	/**
	 * Writes the bits selected by mask of the byte at offset.
	 *
	 * @param {number} offset - Byte offset.
	 * @param {number} mask
	 * @param {boolean} value
	 */
	write_bit(offset, mask, value) {
		const buffer = this.#buffer;
		buffer[offset] = value ? buffer[offset] | mask : buffer[offset] & ~mask;
		this.#written();
	}

	/**
	 * Writes the bytes of source from a byte offset.
	 *
	 * @param {number} offset - Byte offset.
	 * @param {Buffer} source
	 */
	write_bytes(offset, source) {
		source.copy(this.#buffer, offset);
		this.#written();
	}

	/**
	 * After a write: detects the change at once in the immediate mode, then
	 * emits `write` in both modes (doc/spec-data-api.md §4.2).
	 */
	#written() {
		if (this.#detection === "immediate") this.#observer.diff();
		this.emit("write", this);
	}

	/**
	 * Called by a tag setter after the value is written into the buffer:
	 * detects the change at once in the immediate mode, then notifies the
	 * user in both modes (doc/spec-data-api.md §4.2).
	 *
	 * @param {Layout_Entry} _entry - The layout entry of the tag.
	 */
	after_write(_entry) {
		this.#written();
	}

	/**
	 * Whether a tag name would shadow a member of a data block: its accessor
	 * would hide the member.
	 *
	 * @param {string} name
	 * @returns {boolean}
	 */
	static is_reserved_name(name) {
		probe ??= new (class extends TData { static layout = EMPTY_LAYOUT; })(EMPTY_LAYOUT, "probe");
		return name in probe;
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
	 * @param {TData_Options} [options]
	 * @throws {Error} For an unknown layout name, or a layout that is not the registered one.
	 */
	constructor(layout, name, options = {}) {
		super();
		if (new.target === TData) {
			const registered = resolve_layout(layout);
			return new (class_of(registered))(registered, name, options);
		}
		const { detection = "immediate" } = options;
		if (detection !== "immediate" && detection !== "deferred") {
			throw new Error(`${name}: unknown detection mode ${detection}`);
		}
		this.#detection = detection;
		this.name = name;
		this.#layout = new.target.layout;
		this.setMaxListeners(100);
		const size = this.layout.size;
		this.#buffer = Buffer.alloc(size, 0);
		// init values in layout order: the bits of a combined word after the word
		for (const { codec, byte, mask, init_value } of this.layout.entries.values()) {
			codec.set(this.#buffer, byte, mask, init_value);
		}
		this.#observer = new Observer(this.#buffer, this.layout, (entry, old_value, new_value) => {
			// the data block event first, as when it relayed the tag events
			this.emit("change", entry.name, old_value, new_value);
			this.#handles.get(entry.name)?.emit("change", old_value, new_value);
		});
	}
}
