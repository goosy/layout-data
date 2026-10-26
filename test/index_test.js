import assert from "node:assert/strict";
import test from "node:test";
import { Ldata, create_scope, get_scope } from "../src/index.js";

test("the entry exposes the public interface", () => {
	assert.equal(typeof Ldata, "function");
	assert.equal(typeof create_scope, "function");
	assert.equal(typeof get_scope, "function");
});

test("Layout and Layout_Scope are types only, and nothing global registers or gets a layout", async () => {
	const api = await import("../src/index.js");
	for (const name of ["Layout", "Layout_Scope", "io_index_table", "register_layout", "get_layout", "render_types"]) {
		assert.equal(name in api, false, name);
	}
});
