// The registry of the compiled layouts, by layout name (doc/design.md §3).
// A name identifies one layout: it is the only source of the layouts a TData
// is created from. Written by register_layout (layout.js), read by TData.

/** @import { Layout } from "./typedefs.js" */
/** @import { Compiled_Layout } from "./internal_types.js" */

/**
 * @typedef {object} Registered
 * @property {string} key - The canonical text of the structure, to tell the same layout from another one.
 * @property {Layout} layout
 */

/** @type {Map<string, Registered>} */
const registered = new Map();

/**
 * The compiled data of the layouts (doc/design.md §3), kept here so that the
 * public Layout holds none of it.
 *
 * @type {WeakMap<Layout, Compiled_Layout>}
 */
const compiled = new WeakMap();

/**
 * @param {Layout} layout
 * @param {Compiled_Layout} data
 */
export function set_compiled(layout, data) {
	compiled.set(layout, data);
}

/**
 * The compiled data of a layout made by this package.
 *
 * @param {Layout} layout
 * @returns {Compiled_Layout}
 * @throws {Error} For an object that is not a compiled layout.
 */
export function compiled_of(layout) {
	const data = compiled.get(layout);
	if (!data) throw new Error(`${layout?.name} is not a registered layout`);
	return data;
}

/**
 * @param {string} name
 * @returns {Registered | undefined}
 */
export function registered_of(name) {
	return registered.get(name);
}

/**
 * @param {string} name
 * @param {Registered} entry
 */
export function register(name, entry) {
	registered.set(name, entry);
}

/**
 * The registered layout of a name, undefined when there is none.
 *
 * @param {string} name
 * @returns {Layout | undefined}
 */
export function find_layout(name) {
	return registered.get(name)?.layout;
}

/**
 * The registered layout of a name (doc/spec-data-api.md §6.5).
 *
 * @param {string} name
 * @returns {Layout}
 * @throws {Error} When no layout of that name is registered.
 */
export function layout_of(name) {
	const layout = find_layout(name);
	if (!layout) throw new Error(`unknown layout ${name}`);
	return layout;
}
