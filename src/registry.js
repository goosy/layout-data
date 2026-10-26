// The registry of the compiled layouts, by layout name (doc/design.md §3).
// A name identifies one layout for the life of the process. Written by
// register_structure (layout.js), read by get_layout.

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
 * The registered layout of a name (doc/spec-data-api.md §6.4).
 *
 * @param {string} name
 * @returns {Layout}
 * @throws {Error} When no layout of that name is registered.
 */
export function get_layout(name) {
	const layout = registered.get(name)?.layout;
	if (!layout) throw new Error(`unknown layout ${name}`);
	return layout;
}
