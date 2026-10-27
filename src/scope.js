// Scopes of layout names (doc/spec-layout.md §2): every scope holds its own
// layouts and item tables and registers them once.
import { register_descriptions } from "./layout.js";
import { add_scope, find_scope, layouts_of } from "./registry.js";
import { IDENTIFIER } from "./structure.js";

/** @import { Layout, Layout_Description, Registered_Layouts } from "./typedefs.js" */

/** The key of the constructor of Layout_Scope, private to this module. */
const CREATE_KEY = Symbol("create scope");

/**
 * A scope of layout names (doc/spec-layout.md §2): the layouts and item
 * tables registered in it are named apart from those of other scopes. Made
 * by create_scope and frozen; the package exports the type and not the class.
 */
export class Layout_Scope {
	/** @type {string} */
	#name;
	/** Set once a call of register_layout has registered the layouts. */
	#registered_once = false;

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
	 * Registers the layouts of the descriptions in this scope, once per scope
	 * (doc/spec-layout.md §3). Nothing is registered when a description is not
	 * valid, and such a call does not use up the single call.
	 *
	 * @param {string | Layout_Description | Array<string | Layout_Description>} descriptions - The path of a YAML description file, a description object, or a list of them.
	 * @returns {Registered_Layouts}
	 * @throws {Error} With `errors`, every violation found, when the descriptions are not valid.
	 * @throws {Error} When the layouts were registered by an earlier call.
	 */
	register_layout(descriptions) {
		if (this.#registered_once) throw new Error(`register_layout can be called only once in scope ${this.#name}`);
		const result = register_descriptions(descriptions, this);
		this.#registered_once = true;
		return result;
	}

	/**
	 * The registered layout of a name in this scope.
	 *
	 * @param {string} name - A layout name, without the scope name.
	 * @returns {Layout}
	 * @throws {Error} When no layout of that name is registered in this scope.
	 */
	get_layout(name) {
		const layout = layouts_of(this).get(name);
		if (!layout) throw new Error(`unknown layout ${this.#name}.${name}`);
		return layout;
	}
}

/**
 * Creates a scope of layout names (doc/spec-layout.md §2).
 *
 * @param {string} name - The scope name: an identifier, unique in the process.
 * @returns {Layout_Scope}
 * @throws {TypeError} When name is not a string.
 * @throws {Error} When name is not an identifier, or is the name of another scope.
 */
export function create_scope(name) {
	if (typeof name !== "string") throw new TypeError("the name of a scope must be a string");
	if (!IDENTIFIER.test(name)) throw new Error(`scope ${JSON.stringify(name)}: the name is not an identifier`);
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
