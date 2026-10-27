// Shared helpers of the tests of the internals, which run against src only.
// The helpers of the public interface are those of test/api/share.js.
import { register_structure } from "../src/layout.js";
import { create_scope } from "../src/scope.js";
import { build_structure } from "../src/structure.js";

export { fresh_scope, register, register_items } from "./api/share.js";

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
