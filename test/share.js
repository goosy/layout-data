// Shared helpers for the tests.
import { register_layout } from "../src/layout.js";
import { build_structure } from "../src/structure.js";
import { TData } from "../src/TData.js";

/**
 * Builds a data structure from a fresh copy of items,
 * because build_structure mutates the items it receives.
 */
export function make_struct(items, name = "TEST") {
	return build_structure({ name }, structuredClone(items));
}

let layout_count = 0;

/** A data block of `size` bytes with one tag named "tag". */
export function one_tag(type, init_value, offset = 0, size = 4) {
	// a layout name is used once: every call gets a layout of its own
	const layout = register_layout({
		name: `ONE_TAG_${layout_count++}`,
		length: size * 8,
		items: [{ name: "tag", type, offset, init_value }],
	});
	return new TData(layout, "t");
}
