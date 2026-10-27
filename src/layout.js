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
 * A compiled layout (doc/spec-layout.md §4), read-only and deeply
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
		if (!["number", "boolean", "undefined"].includes(typeof init_value)) fail(`init_value ${init_value} is not a number or boolean`);
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
	// the entries and the lookup table stay out of reach (doc/spec-layout.md §4)
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
	};
	if (item.init_value !== undefined) tag.init_value = item.init_value;
	if (item.comment !== undefined) tag.comment = item.comment;
	tag.coupling = Object.freeze([...(item.coupling ?? [])]);
	return Object.freeze(tag);
}

/**
 * Resolves the references of a list of items: `coupling` and `includes`
 * given as an item table name are replaced by a copy of that item table,
 * found by `resolve_table`. Omitted lengths are filled in from the type.
 */
function resolve_items(list, resolve_table, where, errors) {
	if (!Array.isArray(list)) {
		errors.push(`${where}: expected a list of items`);
		return [];
	}
	const resolve_ref = (ref, field) => {
		if (Array.isArray(ref)) return resolve_items(ref, resolve_table, where, errors);
		if (typeof ref !== "string") {
			errors.push(`${where}: ${field} must be an item table name or a list of items`);
			return [];
		}
		return structuredClone(resolve_table(ref, where));
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
 * Reads the layout descriptions (doc/design.md §3) and merges them: the
 * `layouts` lists into one list, the `item_tables` mappings kept with their
 * origins; then registers them with register_merged. Each description is the
 * path of a YAML description file or a description object; a list of
 * descriptions is merged, so a layout may name an item table of any
 * description whatever the order. Internal: the register_layout of a scope calls it.
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
	const merged = { layouts: [], item_tables: [] };
	// the origin of each listed layout name, to name both in a duplicate
	const listed_in = new Map();
	const add = (origin, root) => {
		if (root === null || typeof root !== "object" || Array.isArray(root)) {
			errors.push(`${origin}: the root must be a mapping`);
			return;
		}
		const item_tables = root.item_tables ?? {};
		if (root.item_tables === null || typeof item_tables !== "object" || Array.isArray(item_tables)) {
			errors.push(`${origin}: the root key \`item_tables\` must map item table names to item lists`);
		} else {
			merged.item_tables.push({ origin, item_tables });
		}
		const layouts = root.layouts;
		if (layouts === undefined) return;
		if (!Array.isArray(layouts) || !layouts.every((name) => typeof name === "string")) {
			errors.push(`${origin}: the root key \`layouts\` must be a list of layout names`);
			return;
		}
		for (const name of layouts) {
			if (listed_in.has(name)) {
				const first = listed_in.get(name);
				errors.push(first === origin
					? `layout ${name} is listed twice in ${origin}`
					: `layout ${name} is listed in ${first} and ${origin}`);
				continue;
			}
			listed_in.set(name, origin);
			merged.layouts.push(name);
		}
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
	if (errors.length === 0 && merged.layouts.length === 0) errors.push("no layout is listed in the descriptions");
	if (errors.length > 0) throw layout_error(scope, errors);
	return register_merged(merged, scope);
}

function layout_error(scope, errors) {
	const error = new Error(`invalid layout descriptions of scope ${scope.name}:\n${errors.join("\n")}`);
	error.errors = errors;
	return error;
}

/**
 * Registers the layouts of the merged descriptions (doc/spec-description.md
 * §4): traverses the item tables of `item_tables` from the names of
 * `layouts`, following the item table names of `includes` and `coupling`,
 * and validates and registers the layouts. Only the item tables reached are
 * read; each is resolved once and cached. Internal.
 *
 * @param {{ layouts: string[], item_tables: Array<{ origin: string, item_tables: Record<string, any> }> }} merged
 * @param {Layout_Scope} scope - A scope with no layouts yet, so a layout of the descriptions conflicts with none.
 * @returns {Registered_Layouts}
 * @throws {Error} With `errors`, every violation found, when the descriptions are not valid.
 */
function register_merged(merged, scope) {
	const errors = [];
	/** @type {Record<string, any[]>} the item tables reached, references resolved */
	const tables = {};
	// the item table names on the current chain of references, to find a cycle
	const chain = [];

	const resolve_table = (name, where) => {
		if (Object.hasOwn(tables, name)) return tables[name];
		if (chain.includes(name)) {
			errors.push(`${where}: circular item table reference ${[...chain, name].join(" -> ")}`);
			return [];
		}
		const owners = merged.item_tables.filter(({ item_tables }) => Object.hasOwn(item_tables, name));
		if (owners.length === 0) {
			errors.push(`${where}: unknown item table ${name}`);
			return [];
		}
		if (owners.length > 1) {
			errors.push(`item table ${name} is defined in ${owners.map(({ origin }) => origin).join(" and ")}`);
		}
		chain.push(name);
		const items = resolve_items(owners[0].item_tables[name], resolve_table, `item table ${name}`, errors);
		chain.pop();
		tables[name] = items;
		return items;
	};

	for (const name of merged.layouts) {
		if (!IDENTIFIER.test(name)) errors.push(`layout ${JSON.stringify(name)}: the name is not an identifier`);
		resolve_table(name, `layout ${name}`);
	}
	if (errors.length > 0) throw layout_error(scope, errors);

	const structs = merged.layouts.map((name) => build_structure({ name }, structuredClone(tables[name])));
	for (const struct of structs) errors.push(...validate_structure(struct));
	if (errors.length > 0) throw layout_error(scope, errors);

	const layouts = {};
	for (const struct of structs) layouts[struct.name] = register_structure(struct, scope);
	return { layouts, tables };
}
