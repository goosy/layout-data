import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { describe } from "node:test";
import { fresh_scope, register } from "./share.js";

const dir = mkdtempSync(join(tmpdir(), "tlms-descriptions-"));
let seq = 0;

function write(text) {
	const file = join(dir, `description_${++seq}.yaml`);
	writeFileSync(file, text);
	return file;
}

function errors_of(descriptions, scope = fresh_scope()) {
	try {
		scope.register_layout(descriptions);
	} catch (error) {
		return error.errors;
	}
	assert.fail("the descriptions were accepted");
}

const COMMON = `
item_tables:
  status_bits:
    - { name: run, type: Bool, offset: 8, init_value: true }
    - { name: fault, type: Bool, offset: 0 }
`;

const layout_text = (name) => `
layouts: [${name}]
item_tables:
  ${name}:
    - { name: id, type: UInt, offset: 0, init_value: 3 }
    - { name: status, type: Word, offset: 16, coupling: status_bits }
`;

const ITEMS = [{ name: "a", type: "UInt", offset: 0, init_value: 0 }];

/** A description object listing the names, each an item table of the items. */
const listing = (names, items = ITEMS) => ({ layouts: names, item_tables: Object.fromEntries(names.map((name) => [name, items])) });

describe("6.3 layout names", () => {
	test("a layout name must be an identifier of JavaScript, in any script", () => {
		const { layouts } = register(listing(["Ms_Name_1", "$ms_dollar", "\u6cf5_Ms"]));
		assert.deepEqual(Object.keys(layouts), ["Ms_Name_1", "$ms_dollar", "\u6cf5_Ms"]);
		const scope = fresh_scope();
		const errors = errors_of(listing(["ms-dash", "ms.dot", "1ms", "", "Ms_Bad_Fine"]), scope);
		assert.deepEqual(errors, [
			"layout \"ms-dash\": the name is not an identifier",
			"layout \"ms.dot\": the name is not an identifier",
			"layout \"1ms\": the name is not an identifier",
			"layout \"\": the name is not an identifier",
		]);
		assert.throws(() => scope.get_layout("Ms_Bad_Fine"), /unknown layout/);
	});
});

describe("6.4 several descriptions", () => {
	test("a layout names an item table of another file, whatever the order of the files", () => {
		const common = write(COMMON);
		const pump = write(layout_text("Ms_Pump"));
		const valve = write(layout_text("Ms_Valve"));
		const { scope, layouts, tables } = register([pump, valve, common]);
		assert.deepEqual(Object.keys(layouts), ["Ms_Pump", "Ms_Valve"]);
		assert.equal(tables.status_bits.length, 2);
		assert.equal(scope.get_layout("Ms_Pump").create_ldata("p").status, 0x0001);
		const other = register([write(COMMON.replace("status_bits", "bits")), write(layout_text("Ms_Late").replace("status_bits", "bits"))]);
		assert.equal(other.layouts.Ms_Late.create_ldata("t").status, 0x0001);
	});

	test("description files and description objects can be mixed", () => {
		const common = write(COMMON);
		const { scope, layouts } = register([
			common,
			{ layouts: ["Ms_Mixed"], item_tables: { Ms_Mixed: [{ name: "w", type: "Word", offset: 0, coupling: "status_bits" }] } },
		]);
		assert.equal(layouts.Ms_Mixed, scope.get_layout("Ms_Mixed"));
		assert.equal(scope.get_layout("Ms_Mixed").create_ldata("t").w, 0x0001);
	});

	test("one description can be given as itself, not in a list", () => {
		const { layouts } = register(listing(["Ms_Single"]));
		assert.equal(layouts.Ms_Single.size, 2);
	});

	test("the layouts key is optional in a description, but some description must list a layout", () => {
		assert.deepEqual(errors_of([write(COMMON)]), ["no layout is listed in the descriptions"]);
		assert.deepEqual(errors_of([{}]), ["no layout is listed in the descriptions"]);
		assert.deepEqual(errors_of([{ item_tables: { Ms_Unlisted: ITEMS } }]), ["no layout is listed in the descriptions"]);
		assert.deepEqual(errors_of([{ layouts: [] }]), ["no layout is listed in the descriptions"]);
	});

	test("the layouts lists of the descriptions are merged, a name listed twice is an error", () => {
		const { layouts } = register([listing(["Ms_First"]), { layouts: ["Ms_Second"], item_tables: { Ms_Second: ITEMS } }]);
		assert.deepEqual(Object.keys(layouts), ["Ms_First", "Ms_Second"]);
		assert.deepEqual(errors_of([listing(["Ms_Twice"]), { layouts: ["Ms_Twice"] }]), [
			"layout Ms_Twice is listed in layout description #1 and layout description #2",
		]);
		assert.deepEqual(errors_of({ layouts: ["Ms_Again", "Ms_Again"], item_tables: { Ms_Again: ITEMS } }), [
			"layout Ms_Again is listed twice in layout description",
		]);
	});

	test("an item table reached in two descriptions is an error naming both", () => {
		const first = write(layout_text("Ms_Dup") + COMMON.replace("item_tables:\n", ""));
		const second = write(COMMON.replace("run", "go"));
		const scope = fresh_scope();
		const errors = errors_of([first, second], scope);
		assert.deepEqual(errors, [`item table status_bits is defined in ${first} and ${second}`]);
		assert.throws(() => scope.get_layout("Ms_Dup"), /unknown layout Test_\d+\.Ms_Dup/);
	});

	test("objects are named by their position in the list", () => {
		const errors = errors_of([listing(["Ms_O"]), { item_tables: { Ms_O: ITEMS } }]);
		assert.deepEqual(errors, ["item table Ms_O is defined in layout description #1 and layout description #2"]);
	});

	test("only the item tables reached from layouts are read, compared and returned", () => {
		const { tables } = register([
			{
				layouts: ["Ms_Reached"],
				item_tables: { Ms_Reached: [{ includes: "part", offset: 0 }], part: ITEMS, unused: [{ type: "Nope" }] },
				version: 3,
			},
			{ item_tables: { unused: "anything" }, version: "anything", settings: { a: 1 } },
		]);
		assert.deepEqual(Object.keys(tables).sort(), ["Ms_Reached", "part"]);
	});

	test("an item table can be a layout and be referenced as well", () => {
		const { layouts } = register({
			layouts: ["Ms_Unit", "Ms_Pair"],
			item_tables: {
				Ms_Unit: ITEMS,
				Ms_Pair: [{ includes: "Ms_Unit", offset: 0 }, { includes: "Ms_Unit", offset: 16, name_prefix: "b_" }],
			},
		});
		assert.deepEqual(layouts.Ms_Pair.items.map((item) => [item.name, item.offset]), [["a", 0], ["b_a", 16]]);
		assert.equal(layouts.Ms_Unit.size, 2);
	});

	test("a listed name without an item table, and an item table that is not a list, are errors", () => {
		assert.deepEqual(errors_of({ layouts: ["Ms_Missing"] }), ["layout Ms_Missing: unknown item table Ms_Missing"]);
		assert.deepEqual(errors_of({ layouts: ["Ms_Map"], item_tables: { Ms_Map: { a: 1 } } }), ["item table Ms_Map: expected a list of items"]);
	});

	test("an item table is only found under item_tables, not among the other root keys", () => {
		assert.deepEqual(errors_of({ layouts: ["Ms_Root"], Ms_Root: ITEMS }), ["layout Ms_Root: unknown item table Ms_Root"]);
		assert.deepEqual(errors_of({ layouts: ["Ms_Ref"], item_tables: { Ms_Ref: [{ includes: "config", offset: 0 }] }, config: ITEMS }), [
			"item table Ms_Ref: unknown item table config",
		]);
	});

	test("item_tables must be a mapping", () => {
		for (const item_tables of [[], null, 3, "Ms_Text"]) {
			assert.deepEqual(errors_of([listing(["Ms_Ok"]), { item_tables }]), [
				"layout description #2: the root key `item_tables` must map item table names to item lists",
			]);
		}
	});

	test("every problem of every description is reported, and nothing is registered", () => {
		const scope = fresh_scope();
		const errors = errors_of([
			join(dir, "absent.yaml"),
			{ layouts: { Ms_Map: ITEMS } },
			42,
			[["nested"]],
			null,
			listing(["Ms_Not_Registered"]),
		], scope);
		assert.equal(errors.length, 5, errors.join("\n"));
		assert.throws(() => scope.get_layout("Ms_Not_Registered"), /unknown layout/);
	});

	test("an empty list is an error", () => {
		assert.deepEqual(errors_of([]), ["no description is given"]);
	});

	test("the descriptions are not changed", () => {
		const description = {
			layouts: ["Ms_Pure"],
			item_tables: { Ms_Pure: [{ name: "w", type: "Word", offset: 0, coupling: "bits" }], bits: [{ name: "b", type: "Bool", offset: 0 }] },
		};
		const before = structuredClone(description);
		register([description]);
		assert.deepEqual(description, before);
	});
});
