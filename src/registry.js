// The registry of the compiled layouts, by layout name (doc/design.md §3).
// A name identifies one layout: it is the only source of the layouts a TData
// is created from. Written by register_layout (layout.js), read by TData.

/** @import { Layout } from "./typedefs.js" */

/**
 * @typedef {object} Registered
 * @property {string} key - The canonical text of the structure, to tell the same layout from another one.
 * @property {Layout} layout
 */

/** @type {Map<string, Registered>} */
const registered = new Map();

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
