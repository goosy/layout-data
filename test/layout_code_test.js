import assert from "node:assert/strict";
import test, { describe } from "node:test";
import * as api from "../src/index.js";
import { fresh_scope } from "./share.js";

const ITEMS = () => [
	{ name: "id", type: "UInt", offset: 0, init_value: 7 },
	{
		name: "status", type: "Word", offset: 16, comment: "state word",
		coupling: [
			{ name: "run", type: "Bool", offset: 8, init_value: true },
			{ name: "fault", type: "Bool", offset: 0 },
		],
	},
	{ name: "pressure", type: "Real", offset: 32, init_value: 1.5 },
];

/** Registers one layout in a scope of its own. */
const register = (name, items, scope = fresh_scope()) => ({ scope, ...scope.register_layout({ layouts: { [name]: items } }) });

describe("6.5 layouts given in code", () => {
	test("registered by name, the layout is used by its name", () => {
		const { scope, layouts } = register("Lc_Basic", ITEMS());
		assert.equal(layouts.Lc_Basic, scope.get_layout("Lc_Basic"));
		assert.deepEqual([layouts.Lc_Basic.length, layouts.Lc_Basic.size], [64, 8]);
		const data = scope.get_layout("Lc_Basic").create_ldata("d");
		assert.equal(data.id, 7);
		assert.equal(data.status, 0x0001);
		assert.equal(data.pressure, 1.5);
	});

	test("the omitted lengths are filled in from the type", () => {
		const { layouts } = register("Lc_Lengths", ITEMS());
		assert.deepEqual(layouts.Lc_Lengths.items.map((item) => item.length), [16, 16, 1, 1, 32]);
	});

	test("the items given are not changed, so the same list can be given again", () => {
		const items = ITEMS();
		const before = structuredClone(items);
		const { layouts } = register("Lc_Pure", items);
		assert.deepEqual(items, before);
		assert.deepEqual(register("Lc_Pure", items).layouts.Lc_Pure.items, layouts.Lc_Pure.items);
	});

	test("a violation throws an Error with all the violations in errors, and registers nothing", () => {
		const items = [
			{ name: "a", type: "UInt", offset: 0, init_value: 0 },
			{ name: "a", type: "UInt", offset: 16, init_value: 0 },
			{ name: "get", type: "UInt", offset: 32, init_value: 0 },
		];
		const scope = fresh_scope();
		assert.throws(() => register("Lc_Bad", items, scope), (error) => {
			assert.ok(error instanceof Error);
			assert.ok(error.errors.length >= 2, JSON.stringify(error.errors));
			assert.ok(error.errors.some((text) => text.includes("duplicated name")));
			assert.ok(error.errors.some((text) => text.includes("reserved name")));
			return true;
		});
		assert.throws(() => scope.get_layout("Lc_Bad"), /unknown layout Test_\d+\.Lc_Bad/);
	});

	test("all or none: a bad layout keeps the good ones of the same description unregistered", () => {
		const scope = fresh_scope();
		assert.throws(() => scope.register_layout({
			layouts: {
				Lc_Good: [{ name: "a", type: "UInt", offset: 0, init_value: 0 }],
				Lc_Broken: [{ name: "a", type: "Byte", offset: 0, init_value: 0 }],
			},
		}), (error) => Array.isArray(error.errors));
		assert.throws(() => scope.get_layout("Lc_Good"), /unknown layout Test_\d+\.Lc_Good/);
	});

	test("the validation is not skipped: overlapping tags and a partial register are refused", () => {
		assert.throws(() => register("Lc_Overlap", [
			{ name: "a", type: "DWord", offset: 0, init_value: 0 },
			{ name: "b", type: "UInt", offset: 16, init_value: 0 },
		]), /overlaps a/);
		assert.throws(() => register("Lc_Partial", [{ name: "a", type: "Byte", offset: 0, init_value: 0 }]), /whole number of registers/);
	});

	test("a missing or wrong list of items is an error, not a crash", () => {
		assert.throws(() => register("Lc_None", undefined), (error) => Array.isArray(error.errors));
		assert.throws(() => register("Lc_String", "text"), (error) => Array.isArray(error.errors));
	});

	test("fragments may be named in the description given in code", () => {
		const { layouts, fragments } = fresh_scope().register_layout({
			common: [{ name: "x", type: "UInt", offset: 0, init_value: 1 }, { name: "y", type: "UInt", offset: 16, init_value: 2 }],
			layouts: { Lc_Fragment: [{ type: "Word", offset: 32, includes: "common", name_prefix: "p_" }] },
		});
		assert.deepEqual(layouts.Lc_Fragment.items.map((item) => [item.name, item.offset]), [["p_x", 32], ["p_y", 48]]);
		assert.equal(fragments.common.length, 2);
	});

	test("the package exports create_scope and get_scope; the steps behind registration are not exported", () => {
		assert.equal(api.create_scope.length, 1);
		assert.equal(api.get_scope.length, 1);
		for (const name of ["register_layout", "get_layout", "compile_layout", "compile_layout_data", "register_layout_file", "register_layout_data", "register_descriptions", "build_structure", "validate_structure", "register_structure"]) {
			assert.equal(name in api, false, name);
		}
	});
});
