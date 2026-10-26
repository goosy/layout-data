import assert from "node:assert/strict";
import test from "node:test";
import { Ldata, register_layout } from "../src/index.js";

test("the entry exposes the public interface", () => {
	assert.equal(typeof Ldata, "function");
	assert.equal(typeof register_layout, "function");
});

test("Layout is a type only, and io_index_table is a method of the layout", async () => {
	const api = await import("../src/index.js");
	assert.equal("Layout" in api, false);
	assert.equal("io_index_table" in api, false);
});
