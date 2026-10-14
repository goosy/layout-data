import { readFileSync } from "node:fs";
import { parseDocument } from "yaml";
import { CODECS } from "./codecs.js";
import { register, registered_of } from "./registry.js";
import { build_structure, validate_structure, TYPE_BITS } from "./structure.js";

/** @import { Compiled_Layouts, Data_Struct, Layout } from "./typedefs.js" */

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
 * (doc/design.md §3) and registers it under its name, the one source of the
 * layouts a TData is created from. Registering a structure whose canonical
 * text equals the registered one of that name gives the registered Layout, so
 * the same layout described twice is compiled once; another structure under a
 * used name throws. Throws on an unknown type or a duplicated tag name; the
 * other layout rules are checked by validate_structure.
 *
 * @param {Data_Struct} data_struct
 * @returns {Layout}
 * @throws {Error} When the name is used by another layout.
 */
export function register_layout(data_struct) {
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
		// defensive checks of what a TData relies on; validate_structure reports them all
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
			item,
		};
		entries.set(name, entry);
		// entries keep the item order: a combined word comes before its bits
		for (let i = byte; i < byte + codec.size && i < size; i++) tags_at_byte[i].push(entry);
	}

	const layout = Object.freeze({
		name: data_struct.name,
		length: data_struct.length,
		items: data_struct.items,
		size,
		entries,
		tags_at_byte,
	});
	return layout;
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
 * Reads the layout description file (doc/design.md §3) and compiles
 * every layout in it. The root key `layouts` maps layout names to item
 * lists; every other root key is a fragment referenced by name.
 *
 * Every layout is registered under its name (register_layout): a file with the
 * same layouts as one compiled before gives the same Layout objects, whatever
 * its path, and a layout under a name used by another layout throws.
 *
 * @param {string} yaml_path - Path of the YAML layout file.
 * @returns {Compiled_Layouts}
 * @throws {Error} With `errors`, every violation found, when the file is not valid.
 */
export function compile_layout(yaml_path) {
	const doc = parseDocument(readFileSync(yaml_path, "utf8"), { version: "1.2" });
	if (doc.errors.length > 0) throw layout_error(yaml_path, doc.errors.map((e) => e.message));
	return compile_layout_data(doc.toJS(), yaml_path);
}

function layout_error(origin, errors) {
	const error = new Error(`invalid layout file ${origin}:\n${errors.join("\n")}`);
	error.errors = errors;
	return error;
}

/**
 * Compiles a layout description that is already parsed: the same structure as
 * the layout file (compile_layout), for a user whose own file carries the
 * layouts among other data. The layouts are registered as by compile_layout.
 *
 * @param {Record<string, any>} root - The parsed description: `layouts` and the fragments.
 * @param {string} [origin] - Names the source in errors.
 * @returns {Compiled_Layouts}
 * @throws {Error} With `errors`, every violation found, when the description is not valid.
 */
export function compile_layout_data(root, origin = "layout description") {
	const fail = (errors) => {
		throw layout_error(origin, errors);
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
		const items = resolve_items(list, fragment_defs, [], `layout ${name}`, errors);
		structs[name] = build_structure({ name }, items);
	}
	if (errors.length === 0) {
		for (const struct of Object.values(structs)) errors.push(...validate_structure(struct));
	}
	if (errors.length === 0) {
		// all or none: a conflict is found before any of the layouts is registered
		for (const [name, struct] of Object.entries(structs)) {
			const known = registered_of(name);
			if (known && known.key !== key_of(struct)) errors.push(`layout ${name}: another layout is already named ${name}`);
		}
	}
	if (errors.length > 0) fail(errors);

	const layouts = {};
	for (const [name, struct] of Object.entries(structs)) layouts[name] = register_layout(struct);
	return { layouts, fragments };
}
