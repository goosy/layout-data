import assert from "node:assert/strict";
import test from "node:test";
import { Ldata, TARGET, create_scope, get_scope, render_types } from "./target.js";

test(`the tests run against ${TARGET}`, async () => {
	const source = await import("../../src/index.js");
	const source_dev = await import("../../src/dev.js");
	const run_against_src = TARGET === "src";
	assert.equal(Ldata === source.Ldata, run_against_src);
	assert.equal(render_types === source_dev.render_types, run_against_src);
	if (!run_against_src) {
		assert.equal(Ldata, (await import("layout-data")).Ldata);
		assert.equal(render_types, (await import("layout-data/dev")).render_types);
	}
});

test("the entry exposes the public interface", () => {
	assert.equal(typeof Ldata, "function");
	assert.equal(typeof create_scope, "function");
	assert.equal(typeof get_scope, "function");
});

test("Layout and Layout_Scope are types only, and nothing global registers or gets a layout", async () => {
	const { index: api } = await import("./target.js");
	for (const name of ["Layout", "Layout_Scope", "io_index_table", "register_layout", "load", "get_layout", "render_types"]) {
		assert.equal(name in api, false, name);
	}
});
