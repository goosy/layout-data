import { readFileSync } from "node:fs";
import { parseDocument } from "yaml";
import { CODECS } from "./codecs.js";
import { io_index_table } from "./endian.js";
import { COMPILED, LDATA_FACTORY } from "./internal.js";
import { Ldata } from "./Ldata.js";
import { layouts_of, register } from "./registry.js";
import { build_structure, validate_structure, IDENTIFIER, TYPE_BITS } from "./structure.js";

/** @import { Endian, Layout_Description, Layout_Scope, Layout_Tag, Registered_Layouts } from "./typedefs.js" */
/** @import { Compiled_Layout, Data_Struct } from "./internal_types.js" */

/** The key of the constructor of Layout, private to this module. */
const CREATE_KEY = Symbol("create layout");

/**
 * A compiled layout (doc/spec-layout.md §7), read-only and deeply
 * frozen: `name`; `scope`, the scope it is registered in; `length` in bits;
 * `size` in bytes; `items`, the tags in layout order (a combined word before
 * its bits). Only a registration makes one; the package exports the type and
 * not the class.
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
	/** @type {Layout_Scope} */
	#scope;
	/** @type {Compiled_Layout} */
	#compiled;
	/** @type {(name: string) => Ldata} */
	#create_ldata;

	/**
	 * Not called by the user: register_structure makes the layouts.
	 *
	 * @private
	 * @param {symbol} key - The key private to this module.
	 * @param {Data_Struct} data_struct
	 * @param {Compiled_Layout} compiled
	 * @param {Layout_Scope} scope - The scope the layout is registered in.
	 */
	constructor(key, data_struct, compiled, scope) {
		if (key !== CREATE_KEY) throw new TypeError("a layout is made by the register_layout of a scope");
		this.name = data_struct.name;
		this.length = data_struct.length;
		this.size = data_struct.length >> 3;
		this.items = Object.freeze(data_struct.items.map(public_tag));
		this.#scope = scope;
		this.#compiled = compiled;
		this.#create_ldata = Ldata[LDATA_FACTORY](this, compiled);
		Object.freeze(this);
	}

	/** @returns {Layout_Scope} The scope the layout is registered in. */
	get scope() {
		return this.#scope;
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
		return this.#create_ldata(name);
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

	/**
	 * The compiled data of the layout. Internal: for the tests; the key is not
	 * exported by the package (internal.js).
	 *
	 * @returns {Compiled_Layout}
	 */
	get [COMPILED]() {
		return this.#compiled;
	}
}

/**
 * Compiles an expanded structure (the result of build_structure) into a Layout
 * (doc/design.md §3) and registers it under its name in a scope, where the
 * get_layout of the scope finds it. Throws on a name used in the scope, an
 * unknown type or a duplicated tag name; the other layout rules are checked by
 * validate_structure. Internal.
 *
 * @param {Data_Struct} data_struct
 * @param {Layout_Scope} scope
 * @returns {Layout}
 * @throws {Error} When the name is used by another layout of the scope.
 */
export function register_structure(data_struct, scope) {
	const { name } = data_struct;
	if (typeof name !== "string" || name === "") throw new Error("a layout needs a name");
	if (layouts_of(scope).has(name)) throw new Error(`another layout is already named ${scope.name}.${name}`);
	const layout = compile_structure(data_struct, scope);
	register(layout);
	return layout;
}

function compile_structure(data_struct, scope) {
	const size = data_struct.length >> 3;
	const entries = new Map();
	const tags_at_byte = Array.from({ length: size }, () => []);
	for (const item of data_struct.items) {
		const { name, offset, init_value } = item;
		const type = item.type.toLowerCase();
		const codec = CODECS[type];
		const fail = (message) => {
			throw new Error(`${scope.name}.${data_struct.name}.${name}: ${message}`);
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
	// the entries and the lookup table stay out of reach (doc/spec-layout.md §7)
	return new Layout(CREATE_KEY, data_struct, { entries, tags_at_byte }, scope);
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
 * fragment referenced by name. Internal: the register_layout of a scope
 * calls it.
 *
 * @param {string | Layout_Description | Array<string | Layout_Description>} descriptions
 * @param {Layout_Scope} scope - A scope with no layouts yet.
 * @returns {Registered_Layouts}
 * @throws {Error} With `errors`, every violation found, when the descriptions are not valid.
 */
export function register_descriptions(descriptions, scope) {
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
	if (errors.length > 0) throw layout_error(`layout descriptions of scope ${scope.name}`, errors);
	return register_layout_data({ layouts: layout_defs, ...fragment_defs }, scope, origins.join(", "));
}

function layout_error(subject, errors) {
	const error = new Error(`invalid ${subject}:\n${errors.join("\n")}`);
	error.errors = errors;
	return error;
}

/**
 * Registers the layouts of one description that is parsed and complete: the
 * root key `layouts` and the fragments the layouts name. Internal.
 *
 * @param {Record<string, any>} root - The parsed description: `layouts` and the fragments.
 * @param {Layout_Scope} scope - A scope with no layouts yet, so a layout of the description conflicts with none.
 * @param {string} [origin] - Names the descriptions in errors.
 * @returns {Registered_Layouts}
 * @throws {Error} With `errors`, every violation found, when the description is not valid.
 */
export function register_layout_data(root, scope, origin = "the given object") {
	const fail = (errors) => {
		throw layout_error(`layout description of scope ${scope.name} from ${origin}`, errors);
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
	if (errors.length > 0) fail(errors);

	const layouts = {};
	for (const [name, struct] of Object.entries(structs)) layouts[name] = register_structure(struct, scope);
	return { layouts, fragments };
}
