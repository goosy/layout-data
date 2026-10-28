// Compilation of descriptions into layouts, the Layout class, and the
// loading of descriptions into scopes (doc/design.md §3).
import { CODECS } from "./codecs.js";
import { io_index_table } from "./endian.js";
import { COMPILED, DESCRIPTION, LDATA_FACTORY, ORIGIN } from "./internal.js";
import { Ldata } from "./Ldata.js";
import { layouts_of, register } from "./registry.js";
import { build_structure, validate_structure, IDENTIFIER, TYPE_BITS } from "./structure.js";

/** @import { Block_Desc, Description, Endian, Layout_Desc, Layout_Scope, Layout_Tag, Registration } from "./typedefs.js" */
/** @import { Compiled_Layout, Data_Struct } from "./internal_types.js" */
/** @import { Layout_Table } from "./registry.js" */

/** The key of the constructor of Layout, private to this module. */
const CREATE_KEY = Symbol("create layout");

/**
 * A compiled layout (doc/spec-layout.md §4), read-only and deeply
 * frozen: `name`; `scope`, the scope it is registered in; `length` in bits;
 * `size` in bytes; `items`, the tags in layout order (a combined word before
 * its bits). It manages the ldata it creates by name. yaml and desc_file
 * compile layouts not bound to a scope, and loading binds them; the
 * package exports the type and not the class.
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
	/** @type {Layout_Scope | undefined} */
	#scope;
	/** @type {Compiled_Layout} */
	#compiled;
	/** @type {((name: string) => Ldata) | null} */
	#create_ldata;
	/**
	 * The ldata created by the layout, by name.
	 *
	 * @type {Map<string, Ldata>}
	 */
	#ldata = new Map();

	/**
	 * Not called by the user: compile_structure and bind_layout make the layouts.
	 *
	 * @private
	 * @param {symbol} key - The key private to this module.
	 * @param {string} name
	 * @param {number} length - Total length in bits.
	 * @param {readonly Layout_Tag[]} items - The frozen public tags.
	 * @param {Compiled_Layout} compiled
	 * @param {Layout_Scope | undefined} scope - The scope the layout is bound to, undefined for a layout of a Description.
	 */
	constructor(key, name, length, items, compiled, scope) {
		if (key !== CREATE_KEY) throw new TypeError("a layout is made by yaml or desc_file and bound by the load of a scope");
		this.name = name;
		this.length = length;
		this.size = length >> 3;
		this.items = items;
		this.#scope = scope;
		this.#compiled = compiled;
		// only a bound layout has a class of ldata, named by its scope
		this.#create_ldata = scope ? Ldata[LDATA_FACTORY](this, compiled) : null;
		Object.freeze(this);
	}

	/** @returns {Layout_Scope} The scope the layout is registered in. */
	get scope() {
		return /** @type {Layout_Scope} */ (this.#scope);
	}

	/**
	 * Creates a data block of this layout (doc/spec-data-api.md §2.1), the
	 * only way to create one, and keeps it under its name (doc/spec-layout.md
	 * §4.1). Every tag holds its initial value and no event is emitted.
	 *
	 * @param {string} name - The name of the ldata, unused in this layout, a string that cannot be changed afterwards.
	 * @returns {Ldata}
	 * @throws {TypeError} When name is not a string.
	 * @throws {Error} When the layout has an ldata of that name, or is not bound to a scope.
	 */
	create_ldata(name) {
		if (!this.#create_ldata) throw new Error(`layout ${this.name} is not bound to a scope`);
		if (typeof name === "string" && this.#ldata.has(name)) throw new Error(`ldata ${this.#full_name()}.${name} already exists`);
		const ldata = this.#create_ldata(name);
		this.#ldata.set(name, ldata);
		return ldata;
	}

	/**
	 * The ldata of a name created by this layout (doc/spec-layout.md §4.1).
	 *
	 * @param {string} name - The name of the ldata.
	 * @returns {Ldata}
	 * @throws {Error} When the layout has no ldata of that name.
	 */
	get_ldata(name) {
		const ldata = this.#ldata.get(name);
		if (!ldata) throw new Error(`unknown ldata ${this.#full_name()}.${name}`);
		return ldata;
	}

	/**
	 * Unbinds a name from its ldata (doc/spec-layout.md §4.1): get_ldata no
	 * longer finds it, the name can be used again, and the layout no longer
	 * holds the ldata. The ldata itself is unaffected.
	 *
	 * @param {string} name - The name of the ldata.
	 * @returns {boolean} True when a binding was removed, false when the name was not bound.
	 */
	delete_ldata(name) {
		return this.#ldata.delete(name);
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
	 * The compiled data of the layout. Internal: for bind_layout and the
	 * tests; the key is not exported by the package (internal.js).
	 *
	 * @returns {Compiled_Layout}
	 */
	get [COMPILED]() {
		return this.#compiled;
	}

	/** The layout as `<scope>.<layout>`, or its name alone when it is not bound. */
	#full_name() {
		return this.#scope ? `${this.#scope.name}.${this.name}` : this.name;
	}
}

/**
 * Compiles an expanded structure (the result of build_structure) into a Layout
 * (doc/design.md §3). Throws on an unknown type or a duplicated tag name; the
 * other layout rules are checked by validate_structure.
 *
 * @param {Data_Struct} data_struct
 * @param {Layout_Scope} [scope] - The scope to bind the layout to; a layout of a Description has none.
 * @returns {Layout}
 */
function compile_structure(data_struct, scope) {
	const size = data_struct.length >> 3;
	const layout_name = scope ? `${scope.name}.${data_struct.name}` : data_struct.name;
	const entries = new Map();
	const tags_at_byte = Array.from({ length: size }, () => []);
	for (const item of data_struct.items) {
		const { name, offset, init_value } = item;
		const type = item.type.toLowerCase();
		const codec = CODECS[type];
		const fail = (message) => {
			throw new Error(`${layout_name}.${name}: ${message}`);
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
	const items = Object.freeze(data_struct.items.map(public_tag));
	return new Layout(CREATE_KEY, data_struct.name, data_struct.length, items, { entries, tags_at_byte }, scope);
}

/**
 * A new layout bound to a scope, sharing the frozen items and the compiled
 * data of a layout of a Description.
 *
 * @param {Layout_Desc} desc - A layout of a Description, of this copy of the package.
 * @param {Layout_Scope} scope
 * @returns {Layout}
 */
function bind_layout(desc, scope) {
	return new Layout(CREATE_KEY, desc.name, desc.length, desc.items, desc[COMPILED], scope);
}

/**
 * Compiles an expanded structure and registers it in a scope, with neither
 * validation nor fingerprint comparison. Internal: for the test helper
 * one_tag, which pads a data block freely.
 *
 * @param {Data_Struct} data_struct
 * @param {Layout_Scope} scope
 * @returns {Layout}
 * @throws {Error} When the name is used by another layout of the scope.
 */
export function register_structure(data_struct, scope) {
	const { name } = data_struct;
	if (layouts_of(scope).by_name.has(name)) throw new Error(`another layout is already named ${scope.name}.${name}`);
	const layout = compile_structure(data_struct, scope);
	register(layout, fingerprint(layout.items));
	return layout;
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
 * The fingerprint of a layout (doc/spec-layout.md §3): the canonical text of
 * the name, lower case type, offset and initial value of its tags, in layout
 * order. The bits of combined words follow from the offsets and the lengths
 * from the types. It reads the public items only, so it works on a layout of
 * another copy of this module too.
 *
 * @param {readonly Layout_Tag[]} items
 * @returns {string}
 */
export function fingerprint(items) {
	return JSON.stringify(items.map((tag) => [tag.name, tag.type.toLowerCase(), tag.offset, tag.init_value ?? null]));
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
 * One description of the name space of a description: its origin, the path
 * of its file when it has one, and its parsed root, a mapping.
 *
 * @typedef {{ origin: string, path?: string, root: Record<string, any> }} Source
 */

/**
 * The intermediate value of the processing of a description: the root
 * parsed from the description read, `layouts` and `blocks` replaced by the
 * results of the compilation, the other root keys as they are. Every step
 * passes it on as `{ ...desc_process, <the keys replaced> }`.
 *
 * @typedef {{ layouts: Record<string, Layout>, blocks: Block_Desc[] } & Record<string, unknown>} Desc_Process
 */

/**
 * Compiles a description (doc/spec-description.md §1, doc/design.md §3): the
 * layouts listed by the description read, traversed from its `layouts` over
 * the item tables of all its sources, validated and compiled into layouts not
 * bound to a scope, and its checked `blocks`. Internal: yaml.js calls it.
 *
 * @param {Source[]} sources - The description read first, then those it imports.
 * @param {string[]} errors - Every violation found is pushed here.
 * @returns {Desc_Process} The root of the description read, `layouts` and `blocks` compiled.
 */
export function compile_description(sources, errors) {
	const [entry] = sources;
	const prefix = entry.path === undefined ? "" : `${entry.origin}: `;
	/** @type {Array<{ origin: string, item_tables: Record<string, any> }>} */
	const item_tables = [];
	for (const { origin, root } of sources) {
		const tables = root.item_tables ?? {};
		if (root.item_tables === null || typeof tables !== "object" || Array.isArray(tables)) {
			errors.push(`${origin === entry.origin ? prefix : `${origin}: `}the root key \`item_tables\` must map item table names to item lists`);
		} else {
			item_tables.push({ origin, item_tables: tables });
		}
	}
	const names = layout_names(entry.root.layouts, prefix, errors);
	const layouts = compile_layouts(names, item_tables, errors);
	// an absent `blocks` is the only root key made up, before it is checked
	const blocks = entry.root.blocks === undefined ? [] : entry.root.blocks;
	check_blocks(blocks, names, prefix, errors);
	return { ...entry.root, layouts, blocks };
}

/** The layout names listed by the root key `layouts`, the invalid ones reported. */
function layout_names(listed, prefix, errors) {
	if (listed === undefined) return [];
	if (!Array.isArray(listed) || !listed.every((name) => typeof name === "string")) {
		errors.push(`${prefix}the root key \`layouts\` must be a list of layout names`);
		return [];
	}
	const names = [];
	for (const name of listed) {
		if (names.includes(name)) {
			errors.push(`${prefix}layout ${name} is listed twice`);
			continue;
		}
		if (!IDENTIFIER.test(name)) errors.push(`layout ${JSON.stringify(name)}: the name is not an identifier`);
		names.push(name);
	}
	return names;
}

/**
 * Traverses the item tables from the layout names (doc/spec-description.md
 * §4), following the item table names of `includes` and `coupling`, and
 * validates and compiles the layouts. Only the item tables reached are read;
 * each is resolved once and cached.
 *
 * @param {string[]} names - The layout names.
 * @param {Array<{ origin: string, item_tables: Record<string, any> }>} item_tables - The item tables of every source.
 * @param {string[]} errors
 * @returns {Record<string, Layout>} The unbound layouts by name; empty when an error was found.
 */
function compile_layouts(names, item_tables, errors) {
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
		const owners = item_tables.filter((source) => Object.hasOwn(source.item_tables, name));
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

	for (const name of names) resolve_table(name, `layout ${name}`);
	if (errors.length > 0) return {};

	const structs = names.map((name) => build_structure({ name }, structuredClone(tables[name])));
	for (const struct of structs) errors.push(...validate_structure(struct));
	if (errors.length > 0) return {};
	return Object.fromEntries(structs.map((struct) => [struct.name, compile_structure(struct)]));
}

/**
 * Checks the root key `blocks` (doc/spec-description.md §5.3), changing and
 * copying nothing: the `layout` of a block is a layout name listed by the
 * description.
 *
 * @param {unknown} listed - The value of the root key `blocks`, `[]` when it is absent.
 * @param {string[]} layout_names - The layout names listed by the description.
 * @param {string} prefix - The origin of the description, before every error.
 * @param {string[]} errors
 */
function check_blocks(listed, layout_names, prefix, errors) {
	if (!Array.isArray(listed)) {
		errors.push(`${prefix}the root key \`blocks\` must be a list of blocks`);
		return;
	}
	const names = new Set();
	listed.forEach((block, index) => {
		if (block === null || typeof block !== "object" || Array.isArray(block)) {
			errors.push(`${prefix}block #${index + 1} is not a mapping`);
			return;
		}
		const { name, layout } = block;
		if (typeof name !== "string") {
			errors.push(`${prefix}block #${index + 1}: \`name\` must be a string`);
			return;
		}
		if (names.has(name)) errors.push(`${prefix}block ${name} is listed twice`);
		names.add(name);
		if (typeof layout !== "string") {
			errors.push(`${prefix}block ${name}: \`layout\` must be a layout name`);
		} else if (!layout_names.includes(layout)) {
			errors.push(`${prefix}block ${name}: unknown layout ${layout}`);
		}
	});
}

/** Freezes a value and everything it holds. */
function deep_freeze(value) {
	if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
		Object.freeze(value);
		for (const item of Object.values(value)) deep_freeze(item);
	}
	return value;
}

/**
 * Builds a Description from what compile_description found without errors:
 * its root keys as they are, deeply frozen, marked with DESCRIPTION, and with
 * ORIGIN when it was read from a file. The parsed root belongs to this reading
 * only, so freezing it affects no caller. Internal: yaml.js calls it.
 *
 * @param {Desc_Process} desc_process
 * @param {string} [path] - The path of the description file.
 * @returns {Description}
 */
export function make_description(desc_process, path) {
	const { layouts, blocks } = desc_process;
	const description = { ...desc_process, layouts: Object.freeze(layouts), blocks: deep_freeze(blocks) };
	Object.defineProperty(description, DESCRIPTION, { value: true });
	if (path !== undefined) Object.defineProperty(description, ORIGIN, { value: path });
	return deep_freeze(description);
}

/**
 * Checks the argument of the load of a scope or render_types: a Description or a
 * list of them. Every Description is returned with its origin, the path of its
 * file or its position in the list.
 *
 * @param {unknown} descriptions
 * @param {string[]} errors
 * @returns {Array<{ origin: string, description: Description }>}
 */
export function check_descriptions(descriptions, errors) {
	const list = Array.isArray(descriptions) ? descriptions : [descriptions];
	if (list.length === 0) errors.push("no description is given");
	const checked = [];
	list.forEach((description, index) => {
		const origin = description?.[ORIGIN]
			?? (Array.isArray(descriptions) ? `description #${index + 1}` : "description");
		if (Array.isArray(description)) {
			errors.push(`${origin}: a list of descriptions must not contain a list`);
		} else if (description?.[DESCRIPTION] !== true) {
			errors.push(`${origin}: not a Description; read a description file with desc_file, YAML text with yaml`);
		} else {
			checked.push({ origin, description });
		}
	});
	return checked;
}

/**
 * Decides the layout of a scope for every layout of the descriptions, by the
 * rules of loading (doc/spec-layout.md §3): a layout of the same
 * fingerprint and name is reused, of the same fingerprint and another name or
 * of the same name and another fingerprint it is an error, and otherwise a
 * new one is made. Changes nothing.
 *
 * @template L
 * @param {Array<{ origin: string, description: Description }>} checked
 * @param {Layout_Table} existing - The layouts of the scope.
 * @param {string} scope_name - The scope name, for errors.
 * @param {(desc: Layout_Desc) => L} make - Makes the layout of the scope from a layout of a Description.
 * @param {string[]} errors
 * @returns {{ layouts: Record<string, L | Layout>, added: Array<{ layout: L, fingerprint: string }> }} The layouts by name, and the new ones.
 */
export function plan_layouts(checked, existing, scope_name, make, errors) {
	const staged = { by_name: new Map(), by_fingerprint: new Map() };
	const layouts = {};
	const added = [];
	for (const { origin, description } of checked) {
		for (const desc of Object.values(description.layouts)) {
			const print = fingerprint(desc.items);
			const full_name = `${scope_name}.${desc.name}`;
			const same = staged.by_fingerprint.get(print) ?? existing.by_fingerprint.get(print);
			if (same) {
				if (same.name === desc.name) layouts[desc.name] = same;
				else errors.push(`${origin}: layout ${full_name} has the structure of layout ${scope_name}.${same.name}`);
				continue;
			}
			if (staged.by_name.has(desc.name) || existing.by_name.has(desc.name)) {
				errors.push(`${origin}: another layout of a different structure is already named ${full_name}`);
				continue;
			}
			const layout = make(desc);
			staged.by_name.set(desc.name, layout);
			staged.by_fingerprint.set(print, layout);
			layouts[desc.name] = layout;
			added.push({ layout, fingerprint: print });
		}
	}
	return { layouts, added };
}

/** Whether a layout has an ldata of a name. */
function has_ldata(layout, name) {
	try {
		layout.get_ldata(name);
		return true;
	} catch {
		return false;
	}
}

/**
 * Finds the layout of every block of the descriptions in the scope loading
 * them (doc/spec-layout.md §3): the layout its description's layout of that
 * name becomes. Changes nothing.
 *
 * @param {Array<{ origin: string, description: Description }>} checked
 * @param {Layout_Scope} scope - The scope loading.
 * @param {Record<string, Layout>} layouts - The layouts of this call in the scope, by name.
 * @param {string[]} errors
 * @returns {Array<{ layout: Layout, name: string }>}
 */
function plan_blocks(checked, scope, layouts, errors) {
	const planned = [];
	const origins = new Map();
	for (const { origin, description } of checked) {
		for (const block of description.blocks) {
			const { name } = block;
			if (origins.has(name)) {
				errors.push(`block ${name} is listed in ${origins.get(name)} and ${origin}`);
				continue;
			}
			origins.set(name, origin);
			// the layout is missing only when plan_layouts reported it
			const layout = layouts[block.layout];
			if (!layout) continue;
			if (has_ldata(layout, name)) {
				errors.push(`${origin}: block ${name}: ldata ${scope.name}.${block.layout}.${name} already exists`);
				continue;
			}
			planned.push({ layout, name });
		}
	}
	return planned;
}

/**
 * The error of loading descriptions into a scope, listing every violation.
 *
 * @param {string} scope_name
 * @param {string[]} errors
 * @returns {Error}
 */
export function load_error(scope_name, errors) {
	const error = new Error(`invalid descriptions of scope ${scope_name}:\n${errors.join("\n")}`);
	error.errors = errors;
	return error;
}

/**
 * Loads the descriptions into a scope: registers their layouts in it, then
 * creates the ldata of their blocks (doc/spec-layout.md §3), all or none.
 * Internal: the load of a scope calls it.
 *
 * @param {Description | Description[]} descriptions
 * @param {Layout_Scope} scope
 * @returns {Registration}
 * @throws {Error} With `errors`, every violation found; the scope is unchanged.
 */
export function load_descriptions(descriptions, scope) {
	const errors = [];
	const checked = check_descriptions(descriptions, errors);
	const { layouts, added } = plan_layouts(checked, layouts_of(scope), scope.name, (desc) => bind_layout(desc, scope), errors);
	const planned = plan_blocks(checked, scope, layouts, errors);
	if (errors.length > 0) throw load_error(scope.name, errors);
	for (const { layout, fingerprint: print } of added) register(layout, print);
	const ldata = {};
	for (const { layout, name } of planned) ldata[name] = layout.create_ldata(name);
	return { layouts, ldata };
}
