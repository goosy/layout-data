// Shared helpers for the tests.
import { build_structure } from "../src/structure.js";
import { TData } from "../src/TData.js";

/**
 * Builds a data structure from a fresh copy of items,
 * because build_structure mutates the items it receives.
 */
export function make_struct(items, name = "TEST") {
	return build_structure({ name }, structuredClone(items));
}

/** A data block of `size` bytes with one tag named "tag". */
export function one_tag(type, init_value, offset = 0, size = 4) {
	return new TData({
		name: "T",
		length: size * 8,
		items: [{ name: "tag", type, offset, init_value }],
	}, "t");
}
