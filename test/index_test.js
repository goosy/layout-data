import assert from "node:assert/strict";
import test from "node:test";
import { Ldata, register_layout } from "../src/index.js";

test("the entry exposes the public interface", () => {
	assert.equal(typeof Ldata, "function");
	assert.equal(typeof register_layout, "function");
});
