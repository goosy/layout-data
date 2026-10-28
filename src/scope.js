// Scopes (doc/spec-layout.md §2): every scope manages its own layouts, which
// any number of calls of register_layout register in it.
import { register_descriptions } from "./layout.js";
import { add_scope, find_scope, layouts_of } from "./registry.js";
import { IDENTIFIER } from "./structure.js";

/** @import { Description, Layout, Registration } from "./typedefs.js" */

/** The key of the constructor of Layout_Scope, private to this module. */
const CREATE_KEY = Symbol("create scope");

/**
 * A scope managing a group of layouts (doc/spec-layout.md §2): the layouts
 * registered in it are named apart from those of other scopes. Made by
 * create_scope and frozen; the package exports the type and not the class.
 */
export class Layout_Scope {
	/** @type {string} */
	#name;

	/**
	 * Not called by the user: create_scope makes the scopes.
	 *
	 * @private
	 * @param {symbol} key - The key private to this module.
	 * @param {string} name - A scope name, checked by create_scope.
	 */
	constructor(key, name) {
		if (key !== CREATE_KEY) throw new TypeError("a scope is made by create_scope(name)");
		this.#name = name;
		add_scope(this);
		// any module may get a scope by its name: nothing of it can be replaced
		Object.freeze(this);
	}

	/** @returns {string} The scope name, as given at creation. */
	get name() {
		return this.#name;
	}

	/**
	 * Registers the layouts of the descriptions in this scope, then creates the
	 * ldata of their blocks (doc/spec-layout.md §3). A layout of the same
	 * fingerprint and name as one of the scope is reused. Nothing changes when
	 * any of it is not valid.
	 *
	 * @param {Description | Description[]} descriptions - A Description or a list of them, made by yaml or desc_file.
	 * @returns {Registration}
	 * @throws {Error} With `errors`, every violation found: a layout conflicting with one of the scope, a block naming an unknown layout or a used ldata name.
	 */
	register_layout(descriptions) {
		return register_descriptions(descriptions, this);
	}

	/**
	 * The registered layout of a name in this scope.
	 *
	 * @param {string} name - A layout name, without the scope name.
	 * @returns {Layout}
	 * @throws {Error} When no layout of that name is registered in this scope.
	 */
	get_layout(name) {
		const layout = layouts_of(this).by_name.get(name);
		if (!layout) throw new Error(`unknown layout ${this.#name}.${name}`);
		return layout;
	}
}

/**
 * Checks a scope name as create_scope does, creating no scope.
 *
 * @param {unknown} name
 * @throws {TypeError} When name is not a string.
 * @throws {Error} When name is not an identifier.
 */
export function check_scope_name(name) {
	if (typeof name !== "string") throw new TypeError("the name of a scope must be a string");
	if (!IDENTIFIER.test(name)) throw new Error(`scope ${JSON.stringify(name)}: the name is not an identifier`);
}

/**
 * Creates a scope (doc/spec-layout.md §2).
 *
 * @param {string} name - The scope name: an identifier, unique in the process.
 * @returns {Layout_Scope}
 * @throws {TypeError} When name is not a string.
 * @throws {Error} When name is not an identifier, or is the name of another scope.
 */
export function create_scope(name) {
	check_scope_name(name);
	return new Layout_Scope(CREATE_KEY, name);
}

/**
 * The scope of a name (doc/spec-layout.md §2), undefined when no scope of
 * that name has been created.
 *
 * @param {string} name
 * @returns {Layout_Scope | undefined}
 */
export function get_scope(name) {
	return find_scope(name);
}
