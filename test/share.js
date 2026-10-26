// Shared helpers for the tests.
import { register_structure } from "../src/layout.js";
import { create_scope } from "../src/scope.js";
import { build_structure } from "../src/structure.js";

let scope_count = 0;

/** A scope of its own, so that a test can register: a scope registers once. */
export function fresh_scope() {
	return create_scope(`Test_${scope_count++}`);
}

/** Registers descriptions in a scope of their own; the result holds the scope too. */
export function register(descriptions) {
	const scope = fresh_scope();
	return { scope, ...scope.register_layout(descriptions) };
}

/** Registers the items of one layout by name, as a user does in code, and returns the layout. */
export function register_items(name, items) {
	return register({ layouts: { [name]: items } }).layouts[name];
}

/**
 * Builds a data structure from a fresh copy of items,
 * because build_structure mutates the items it receives.
 */
export function make_struct(items, name = "TEST") {
	return build_structure({ name }, structuredClone(items));
}

const one_tag_scope = create_scope("One_Tag");
let layout_count = 0;

/** A data block of `size` bytes with one tag named "tag" (registered without validation, to pad the block freely). */
export function one_tag(type, init_value, offset = 0, size = 4) {
	// a layout name is used once in a scope: every call gets a layout of its own
	const layout = register_structure({
		name: `ONE_TAG_${layout_count++}`,
		length: size * 8,
		items: [{ name: "tag", type, offset, init_value }],
	}, one_tag_scope);
	return layout.create_ldata("t");
}
