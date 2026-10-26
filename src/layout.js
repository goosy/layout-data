import { readFileSync } from "node:fs";
import { parseDocument } from "yaml";
import { CODECS } from "./codecs.js";
import { io_index_table } from "./endian.js";
import { build_ldata_class, new_ldata } from "./Ldata.js";
import { register, registered_of } from "./registry.js";
import { build_structure, validate_structure, IDENTIFIER, TYPE_BITS } from "./structure.js";

/** @import { Endian, Layout_Description, Layout_Tag, Registered_Layouts } from "./typedefs.js" */
/** @import { Compiled_Layout, Data_Struct } from "./internal_types.js" */
/** @import { Ldata } from "./Ldata.js" */

/** The key of the constructor of Layout, private to this module. */
const CREATE_KEY = Symbol("create layout");

/** Set by a static block of Layout: reads the compiled data of a layout. */
let read_compiled;

/**
 * A compiled layout (doc/spec-data-api.md §6.6), read-only and deeply
 * frozen: `name`; `length` in bits; `size` in bytes; `items`, the tags in
 * layout order (a combined word before its bits). Only a registration makes
 * one; the package exports the type and not the class.
 */
export class Layout {
	/**
	 * The layout name.
	 *
	 * @readonly
	 * @type {string}
	 */
	name;
	/**
	 * Total length in bits.
	 *
	 * @readonly
	 * @type {number}
	 */
	length;
	/**
	 * Total size in bytes.
	 *
	 * @readonly
	 * @type {number}
	 */
	size;
	/**
	 * The tags in layout order, a combined word before its bits.
	 *
	 * @readonly
	 * @type {readonly Layout_Tag[]}
	 */
	items;
	/** @type {Compiled_Layout} */
	#compiled;
	/** @type {typeof Ldata} */
	#ldata_class;

	/**
	 * Not called by the user: register_structure makes the layouts.
	 *
	 * @private
	 * @param {symbol} key - The key private to this module.
	 * @param {Data_Struct} data_struct
	 * @param {Compiled_Layout} compiled
	 */
	constructor(key, data_struct, compiled) {
		if (key !== CREATE_KEY) throw new TypeError("a layout is made by register_layout");
		this.name = data_struct.name;
		this.length = data_struct.length;
		this.size = data_struct.length >> 3;
		this.items = Object.freeze(data_struct.items.map(public_tag));
		this.#compiled = compiled;
		this.#ldata_class = build_ldata_class(this, compiled);
		Object.freeze(this);
	}

	/**
	 * Creates a data block of this layout (doc/spec-data-api.md §2.1), the
	 * only way to create one. Every tag holds its initial value and no event
	 * is emitted.
	 *
	 * @param {string} name - The name of the ldata, a string that cannot be changed afterwards.
	 * @returns {Ldata}
	 * @throws {TypeError} When name is not a string.
	 */
	create_ldata(name) {
		return new_ldata(this.#ldata_class, name);
	}

	/**
	 * The index in a device-ordered IO buffer of every byte of a data block
	 * of this layout: the byte `i` of the block is the byte `table[i]` of the
	 * IO buffer (doc/spec-data-api.md §2.9).
	 *
	 * @param {Endian} endian - Device byte order: BE, LE, BEBS or LEBS.
	 * @returns {Int32Array}
	 * @throws {RangeError} For another byte order.
	 */
	io_index_table(endian) {
		return io_index_table(this.size, this.#compiled, endian);
	}

	static {
		read_compiled = (layout) => (#compiled in layout ? layout.#compiled : undefined);
	}
}

/**
 * The compiled data of a layout made by this package. Internal: for the tests.
 *
 * @param {Layout} layout
 * @returns {Compiled_Layout}
 * @throws {Error} For an object that is not a compiled layout.
 */
export function compiled_of(layout) {
	const data = layout !== null && typeof layout === "object" ? read_compiled(layout) : undefined;
	if (!data) throw new Error(`${layout?.name} is not a registered layout`);
	return data;
}

/**
 * The canonical text of a value: object keys sorted, `comment` left out (it
 * does not change how a layout works) and the type names in lower case.
 */
function canonical(value, key) {
	if (Array.isArray(value)) return `[${value.map((v) => canonical(v)).join(",")}]`;
	if (value !== null && typeof value === "object") {
		const fields = Object.keys(value).filter((k) => k !== "comment" && value[k] !== undefined).sort();
		return `{${fields.map((k) => `${JSON.stringify(k)}:${canonical(value[k], k)}`).join(",")}}`;
	}
	if (key === "type" && typeof value === "string") return JSON.stringify(value.toLowerCase());
	return JSON.stringify(value) ?? "null";
}

/**
 * Compiles an expanded structure (the result of build_structure) into a Layout
 * (doc/design.md §3) and registers it under its name, where get_layout finds
 * it. Registering a structure whose canonical text equals the registered one
 * of that name gives the registered Layout, so the same layout described
 * twice is compiled once; another structure under a used name throws. Throws on an unknown type or a duplicated tag name; the
 * other layout rules are checked by validate_structure. Internal.
 *
 * @param {Data_Struct} data_struct
 * @returns {Layout}
 * @throws {Error} When the name is used by another layout.
 */
export function register_structure(data_struct) {
	const { name } = data_struct;
	if (typeof name !== "string" || name === "") throw new Error("a layout needs a name");
	const key = key_of(data_struct);
	const known = registered_of(name);
	if (known) {
		if (known.key !== key) throw new Error(`another layout is already named ${name}`);
		return known.layout;
	}
	const layout = compile_structure(data_struct);
	register(name, { key, layout });
	return layout;
}

function key_of(data_struct) {
	return canonical({ name: data_struct.name, length: data_struct.length, items: data_struct.items });
}

function compile_structure(data_struct) {
	const size = data_struct.length >> 3;
	const entries = new Map();
	const tags_at_byte = Array.from({ length: size }, () => []);
	for (const item of data_struct.items) {
		const { name, offset, init_value } = item;
		const type = item.type.toLowerCase();
		const codec = CODECS[type];
		const fail = (message) => {
			throw new Error(`${data_struct.name}.${name}: ${message}`);
		};
		if (!codec) fail(`unknown tag type ${item.type}`);
		if (entries.has(name)) fail("duplicated tag name");
		// defensive checks of what an Ldata relies on; validate_structure reports them all
		if (type !== "bool" && offset % 8 !== 0) fail(`bit offset ${offset % 8} on a ${item.type}`);
		if (codec.size > 1 && (offset >> 3) % 2 !== 0) fail(`${item.type} at the odd byte ${offset >> 3}`);
		if (!["number", "boolean"].includes(typeof init_value)) fail(`init_value ${init_value} is not a number or boolean`);
		const byte = offset >> 3;
		const entry = {
			name, type, init_value, byte,
			index: entries.size,
			size: codec.size,
			mask: type === "bool" ? 1 << (offset % 8) : 0xff,
			codec,
		};
		entries.set(name, entry);
		// entries keep the item order: a combined word comes before its bits
		for (let i = byte; i < byte + codec.size && i < size; i++) tags_at_byte[i].push(entry);
	}

	// the public layout holds the name, the sizes and frozen copies of the items;
	// the entries and the lookup table stay out of reach (doc/spec-data-api.md §6.6)
	return new Layout(CREATE_KEY, data_struct, { entries, tags_at_byte });
}

/**
 * The frozen description of a tag of the public layout: the documented fields
 * only, the length filled in from the type when the item has none.
 */
function public_tag(item) {
	const tag = {
		name: item.name,
		type: item.type,
		offset: item.offset,
		length: item.length ?? TYPE_BITS[item.type.toLowerCase()],
		init_value: item.init_value,
	};
	if (item.comment !== undefined) tag.comment = item.comment;
	tag.coupling = Object.freeze([...(item.coupling ?? [])]);
	return Object.freeze(tag);
}

/**
 * Resolves the fragment references of a list of items: `coupling` and
 * `includes` given as a fragment name are replaced by a copy of that
 * fragment, recursively. Omitted lengths are filled in from the type.
 */
function resolve_items(list, fragments, stack, where, errors) {
	if (!Array.isArray(list)) {
		errors.push(`${where}: expected a list of items`);
		return [];
	}
	const resolve_ref = (ref, field) => {
		if (Array.isArray(ref)) return resolve_items(ref, fragments, stack, where, errors);
		if (typeof ref !== "string") {
			errors.push(`${where}: ${field} must be a fragment name or a list of items`);
			return [];
		}
		if (stack.includes(ref)) {
			errors.push(`${where}: circular fragment reference ${[...stack, ref].join(" -> ")}`);
			return [];
		}
		if (!Object.hasOwn(fragments, ref)) {
			errors.push(`${where}: unknown fragment ${ref}`);
			return [];
		}
		return resolve_items(fragments[ref], fragments, [...stack, ref], `fragment ${ref}`, errors);
	};
	return list.map((_item) => {
		const item = { ..._item };
		if (item.coupling !== undefined) item.coupling = resolve_ref(item.coupling, "coupling");
		if (item.includes !== undefined) item.includes = resolve_ref(item.includes, "includes");
		const bits = TYPE_BITS[item.type?.toLowerCase()];
		if (item.length === undefined && bits !== undefined) item.length = bits;
		return item;
	});
}

/**
 * Reads the layout descriptions (doc/design.md §3), merges their layouts and
 * fragments into one description and registers it with register_layout_data.
 * Each description is the path of a YAML description file or a description
 * object; a list of descriptions is merged, so a layout may name a fragment
 * of any description whatever the order. The root key `layouts` of a
 * description maps layout names to item lists; every other root key is a
 * fragment referenced by name.
 *
 * @param {string | Layout_Description | Array<string | Layout_Description>} descriptions
 * @returns {Registered_Layouts}
 * @throws {Error} With `errors`, every violation found, when the descriptions are not valid.
 */
export function register_descriptions(descriptions) {
	const errors = [];
	const list = Array.isArray(descriptions) ? descriptions : [descriptions];
	if (list.length === 0) errors.push("no description is given");
	const origins = [];
	const layout_defs = {};
	const fragment_defs = {};
	// the origin of each layout and fragment, to name both in a duplicate
	const owners = { layout: new Map(), fragment: new Map() };
	const add = (origin, root) => {
		origins.push(origin);
		if (root === null || typeof root !== "object" || Array.isArray(root)) {
			errors.push(`${origin}: the root must be a mapping`);
			return;
		}
		const { layouts, ...fragments } = root;
		if (layouts !== undefined && (layouts === null || typeof layouts !== "object" || Array.isArray(layouts))) {
			errors.push(`${origin}: the root key \`layouts\` must map layout names to item lists`);
			return;
		}
		const merge = (kind, defs, into) => {
			for (const [name, value] of Object.entries(defs)) {
				if (owners[kind].has(name)) {
					errors.push(`${kind} ${name} is defined in ${owners[kind].get(name)} and ${origin}`);
					continue;
				}
				owners[kind].set(name, origin);
				into[name] = value;
			}
		};
		merge("layout", layouts ?? {}, layout_defs);
		merge("fragment", fragments, fragment_defs);
	};
	list.forEach((description, index) => {
		const label = Array.isArray(descriptions) ? `layout description #${index + 1}` : "layout description";
		if (Array.isArray(description)) {
			errors.push(`${label}: a list of descriptions must not contain a list`);
		} else if (typeof description === "string") {
			let text;
			try {
				text = readFileSync(description, "utf8");
			} catch (error) {
				errors.push(error.message);
				return;
			}
			const doc = parseDocument(text, { version: "1.2" });
			if (doc.errors.length > 0) errors.push(...doc.errors.map((e) => `${description}: ${e.message}`));
			else add(description, doc.toJS());
		} else {
			add(label, description);
		}
	});
	if (errors.length === 0 && Object.keys(layout_defs).length === 0) errors.push("no layout is defined in the descriptions");
	if (errors.length > 0) throw layout_error("layout descriptions", errors);
	return register_layout_data({ layouts: layout_defs, ...fragment_defs }, origins.join(", "));
}

/** Set once a call of register_layout has registered the layouts. */
let registered_once = false;

/**
 * Registers the layouts of the descriptions, once per process: a layout is
 * described, registered under its name, got by that name (get_layout), and
 * creates its data blocks (doc/spec-data-api.md §6.4). Nothing is registered
 * when a description is not valid, and such a call does not use up the single
 * call.
 *
 * @param {string | Layout_Description | Array<string | Layout_Description>} descriptions - The path of a YAML description file, a description object, or a list of them.
 * @returns {Registered_Layouts}
 * @throws {Error} With `errors`, every violation found, when the descriptions are not valid.
 * @throws {Error} When the layouts were registered by an earlier call.
 */
export function register_layout(descriptions) {
	if (registered_once) throw new Error("register_layout can be called only once");
	const result = register_descriptions(descriptions);
	registered_once = true;
	return result;
}

function layout_error(subject, errors) {
	const error = new Error(`invalid ${subject}:\n${errors.join("\n")}`);
	error.errors = errors;
	return error;
}

/**
 * The conflicts of structures with the layouts registered under their names.
 *
 * @param {Record<string, Data_Struct>} structs - By layout name.
 * @returns {string[]}
 */
function find_conflicts(structs) {
	const conflicts = [];
	for (const [name, struct] of Object.entries(structs)) {
		const known = registered_of(name);
		if (known && known.key !== key_of(struct)) conflicts.push(`layout ${name}: another layout is already named ${name}`);
	}
	return conflicts;
}

/**
 * Registers the layouts of one description that is parsed and complete: the
 * root key `layouts` and the fragments the layouts name. Internal.
 *
 * @param {Record<string, any>} root - The parsed description: `layouts` and the fragments.
 * @param {string} [origin] - Names the descriptions in errors.
 * @returns {Registered_Layouts}
 * @throws {Error} With `errors`, every violation found, when the description is not valid.
 */
export function register_layout_data(root, origin = "the given object") {
	const fail = (errors) => {
		throw layout_error(`layout description from ${origin}`, errors);
	};
	if (root === null || typeof root !== "object" || Array.isArray(root)) fail(["the root must be a mapping"]);
	const { layouts: layout_defs, ...fragment_defs } = root;
	if (layout_defs === null || typeof layout_defs !== "object" || Array.isArray(layout_defs)) {
		fail(["the root key `layouts` must map layout names to item lists"]);
	}

	const errors = [];
	const fragments = {};
	for (const [name, list] of Object.entries(fragment_defs)) {
		fragments[name] = resolve_items(list, fragment_defs, [name], `fragment ${name}`, errors);
	}
	const structs = {};
	for (const [name, list] of Object.entries(layout_defs)) {
		if (!IDENTIFIER.test(name)) errors.push(`layout ${JSON.stringify(name)}: the name is not an identifier`);
		const items = resolve_items(list, fragment_defs, [], `layout ${name}`, errors);
		structs[name] = build_structure({ name }, items);
	}
	if (errors.length === 0) {
		for (const struct of Object.values(structs)) errors.push(...validate_structure(struct));
	}
	if (errors.length === 0) {
		// all or none: a conflict is found before any of the layouts is registered
		errors.push(...find_conflicts(structs));
	}
	if (errors.length > 0) fail(errors);

	const layouts = {};
	for (const [name, struct] of Object.entries(structs)) layouts[name] = register_structure(struct);
	return { layouts, fragments };
}
