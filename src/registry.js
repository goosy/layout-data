// The registry of the scopes and of their compiled layouts (doc/design.md §3):
// the scopes by scope name, and the layouts of each scope by layout name and
// by fingerprint. The layout tables are found by the scope object itself,
// never by its name, so no scope reaches the layouts of another one. Written
// by create_scope (scope.js) and the registration (layout.js), read by the
// scopes.

/** @import { Layout, Layout_Scope } from "./typedefs.js" */

/**
 * The layouts of one scope.
 *
 * @typedef {object} Layout_Table
 * @property {Map<string, Layout>} by_name - The layouts by layout name.
 * @property {Map<string, Layout>} by_fingerprint - The layouts by fingerprint (layout.js).
 */

/**
 * The scopes by scope name, for get_scope and the uniqueness of the names.
 *
 * @type {Map<string, Layout_Scope>}
 */
const scopes = new Map();

/**
 * The layout table of every scope, by scope object.
 *
 * @type {Map<Layout_Scope, Layout_Table>}
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
	layout_tables.set(scope, { by_name: new Map(), by_fingerprint: new Map() });
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
 * The layout table of a scope.
 *
 * @param {Layout_Scope} scope - A registered scope.
 * @returns {Layout_Table}
 */
export function layouts_of(scope) {
	return /** @type {Layout_Table} */ (layout_tables.get(scope));
}

/**
 * Adds a layout to the table of its scope.
 *
 * @param {Layout} layout - A layout bound to a registered scope.
 * @param {string} fingerprint - The fingerprint of the layout.
 */
export function register(layout, fingerprint) {
	const table = layouts_of(layout.scope);
	table.by_name.set(layout.name, layout);
	table.by_fingerprint.set(fingerprint, layout);
}
