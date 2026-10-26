// The registry of the scopes and of their compiled layouts (doc/design.md §3):
// the scopes by scope name, and the layouts of each scope by layout name.
// The layout tables are found by the scope object itself, never by its name,
// so no scope reaches the layouts of another one. Written by create_scope
// (scope.js) and register_structure (layout.js), read by the scopes.

/** @import { Layout, Layout_Scope } from "./typedefs.js" */

/**
 * The scopes by scope name, for get_scope and the uniqueness of the names.
 *
 * @type {Map<string, Layout_Scope>}
 */
const scopes = new Map();

/**
 * The layouts of every scope by layout name, by scope object.
 *
 * @type {Map<Layout_Scope, Map<string, Layout>>}
 */
const layout_tables = new Map();

/**
 * Registers a scope with no layouts; a scope name is used once in the process.
 *
 * @param {Layout_Scope} scope
 * @throws {Error} When a scope of that name exists.
 */
export function add_scope(scope) {
	if (scopes.has(scope.name)) throw new Error(`a scope is already named ${scope.name}`);
	scopes.set(scope.name, scope);
	layout_tables.set(scope, new Map());
}

/**
 * The scope of a name, undefined when there is none.
 *
 * @param {string} name
 * @returns {Layout_Scope | undefined}
 */
export function find_scope(name) {
	return scopes.get(name);
}

/**
 * The layouts of a scope by layout name.
 *
 * @param {Layout_Scope} scope - A registered scope.
 * @returns {Map<string, Layout>}
 */
export function layouts_of(scope) {
	return /** @type {Map<string, Layout>} */ (layout_tables.get(scope));
}

/**
 * @param {Layout} layout - A layout of a registered scope.
 */
export function register(layout) {
	layouts_of(layout.scope).set(layout.name, layout);
}
