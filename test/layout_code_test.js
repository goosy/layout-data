import assert from "node:assert/strict";
import test, { describe } from "node:test";
import * as api from "../src/index.js";
import { TData, get_layout } from "../src/index.js";
import { register_layout_data } from "../src/layout.js";

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

const register = (name, items) => register_layout_data({ layouts: { [name]: items } });

describe("6.5 layouts given in code (register_layout_data)", () => {
	test("registered by name, the layout is used by its name", () => {
		const { layouts } = register("LC_BASIC", ITEMS());
		assert.equal(layouts.LC_BASIC, get_layout("LC_BASIC"));
		assert.deepEqual([layouts.LC_BASIC.length, layouts.LC_BASIC.size], [64, 8]);
		const data = new TData("LC_BASIC", "d");
		assert.equal(data.id, 7);
		assert.equal(data.status, 0x0001);
		assert.equal(data.pressure, 1.5);
	});

	test("the omitted lengths are filled in from the type", () => {
		const { layouts } = register("LC_LENGTHS", ITEMS());
		assert.deepEqual(layouts.LC_LENGTHS.items.map((item) => item.length), [16, 16, 1, 1, 32]);
	});

	test("the items given are not changed, so the same list can be given again", () => {
		const items = ITEMS();
		const before = structuredClone(items);
		const { layouts } = register("LC_PURE", items);
		assert.deepEqual(items, before);
		assert.equal(register("LC_PURE", items).layouts.LC_PURE, layouts.LC_PURE);
	});

	test("the same layout under the same name is the registered one, another one is refused", () => {
		const layout = register("LC_SAME", ITEMS()).layouts.LC_SAME;
		assert.equal(register("LC_SAME", ITEMS()).layouts.LC_SAME, layout);
		const changed = ITEMS();
		changed[0].init_value = 8;
		assert.throws(() => register("LC_SAME", changed), /another layout is already named LC_SAME/);
		assert.equal(get_layout("LC_SAME"), layout);
	});

	test("a violation throws an Error with all the violations in errors, and registers nothing", () => {
		const items = [
			{ name: "a", type: "UInt", offset: 0, init_value: 0 },
			{ name: "a", type: "UInt", offset: 16, init_value: 0 },
			{ name: "get", type: "UInt", offset: 32, init_value: 0 },
		];
		assert.throws(() => register("LC_BAD", items), (error) => {
			assert.ok(error instanceof Error);
			assert.ok(error.errors.length >= 2, JSON.stringify(error.errors));
			assert.ok(error.errors.some((text) => text.includes("duplicated name")));
			assert.ok(error.errors.some((text) => text.includes("reserved name")));
			return true;
		});
		assert.throws(() => get_layout("LC_BAD"), /unknown layout LC_BAD/);
	});

	test("all or none: a bad layout keeps the good ones of the same description unregistered", () => {
		assert.throws(() => register_layout_data({
			layouts: {
				LC_GOOD: [{ name: "a", type: "UInt", offset: 0, init_value: 0 }],
				LC_BROKEN: [{ name: "a", type: "Byte", offset: 0, init_value: 0 }],
			},
		}), (error) => Array.isArray(error.errors));
		assert.throws(() => get_layout("LC_GOOD"), /unknown layout LC_GOOD/);
	});

	test("the validation is not skipped: overlapping tags and a partial register are refused", () => {
		assert.throws(() => register("LC_OVERLAP", [
			{ name: "a", type: "DWord", offset: 0, init_value: 0 },
			{ name: "b", type: "UInt", offset: 16, init_value: 0 },
		]), /overlaps a/);
		assert.throws(() => register("LC_PARTIAL", [{ name: "a", type: "Byte", offset: 0, init_value: 0 }]), /whole number of registers/);
	});

	test("a missing or wrong list of items is an error, not a crash", () => {
		assert.throws(() => register("LC_NONE", undefined), (error) => Array.isArray(error.errors));
		assert.throws(() => register("LC_STRING", "text"), (error) => Array.isArray(error.errors));
	});

	test("fragments may be named in the description given in code", () => {
		const { layouts, fragments } = register_layout_data({
			common: [{ name: "x", type: "UInt", offset: 0, init_value: 1 }, { name: "y", type: "UInt", offset: 16, init_value: 2 }],
			layouts: { LC_FRAGMENT: [{ type: "Word", offset: 32, includes: "common", name_prefix: "p_" }] },
		});
		assert.deepEqual(layouts.LC_FRAGMENT.items.map((item) => [item.name, item.offset]), [["p_x", 32], ["p_y", 48]]);
		assert.equal(fragments.common.length, 2);
	});

	test("the package exports register_layout; the steps behind it are not exported", () => {
		assert.equal(typeof api.register_layout, "function");
		assert.equal(api.register_layout.length, 1);
		for (const name of ["compile_layout", "compile_layout_data", "register_layout_file", "register_layout_data", "register_sources", "build_structure", "validate_structure", "register_structure"]) {
			assert.equal(name in api, false, name);
		}
	});
});
