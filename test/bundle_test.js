import assert from "node:assert/strict";
import test from "node:test";
import { TData, compile_layout } from "../dist/tagged-data.js";

test("the bundle exposes the public interface", () => {
	assert.equal(typeof TData, "function");
	assert.equal(typeof compile_layout, "function");
});
