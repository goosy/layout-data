// Descriptions, imports and loading (doc/spec-description.md §4, §5;
// doc/spec-layout.md §3, §4.1).
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { describe } from "node:test";
import { pathToFileURL } from "node:url";
import { parse as parse_yaml } from "yaml";
import { fresh_scope, json_desc, register } from "./share.js";
import { create_scope, desc_file, yaml } from "./target.js";

const dir = mkdtempSync(join(tmpdir(), "layout-descriptions-"));
let seq = 0;

/** Writes a description file and returns its path. */
function write(text, name = `description_${++seq}.yaml`) {
	const file = join(dir, name);
	writeFileSync(file, text);
	return file;
}

/** The errors of a call that must throw an Error with errors. */
function errors_of(call) {
	try {
		call();
	} catch (error) {
		assert.ok(Array.isArray(error.errors), String(error));
		return error.errors;
	}
	assert.fail("the call did not throw");
}

const ITEMS = [{ name: "a", type: "UInt", offset: 0, init_value: 0 }];

/**
 * A description listing the names, each an item table of one UInt `a` of
 * another initial value: layouts of one structure under two names do not
 * load into one scope.
 */
const listing = (names) => ({
	layouts: names,
	item_tables: Object.fromEntries(names.map((name, index) => [name, [{ name: "a", type: "UInt", offset: 0, init_value: index }]])),
});

/** A layout of one UInt tag `a` of an initial value, under a name. */
const unit = (name, init_value = 0, extra = "") => yaml`
layouts: [${name}]
item_tables:
  ${name}:
    - { name: a, type: UInt, offset: 0, init_value: ${init_value} }
${extra}`;

const COMMON = `
item_tables:
  status_bits:
    - { name: run, type: Bool, offset: 8, init_value: true }
    - { name: fault, type: Bool, offset: 0 }
`;

const pump_text = (name, common) => `
imports:
  - ${common}
layouts: [${name}]
item_tables:
  ${name}:
    - { name: id, type: UInt, offset: 0, init_value: 3 }
    - { name: status, type: Word, offset: 16, coupling: status_bits }
`;

describe("layout names", () => {
	test("a layout name must be an identifier of JavaScript, in any script", () => {
		const { layouts } = register(json_desc(listing(["Ms_Name_1", "$ms_dollar", "泵_Ms"])));
		assert.deepEqual(Object.keys(layouts), ["Ms_Name_1", "$ms_dollar", "泵_Ms"]);
		const errors = errors_of(() => json_desc(listing(["ms-dash", "ms.dot", "1ms", "", "Ms_Bad_Fine"])));
		assert.deepEqual(errors, [
			"layout \"ms-dash\": the name is not an identifier",
			"layout \"ms.dot\": the name is not an identifier",
			"layout \"1ms\": the name is not an identifier",
			"layout \"\": the name is not an identifier",
		]);
	});

	test("a name listed twice, and a layouts key that is not a list of names, are errors", () => {
		assert.deepEqual(errors_of(() => json_desc({ layouts: ["Ms_Again", "Ms_Again"], item_tables: { Ms_Again: ITEMS } })), [
			"layout Ms_Again is listed twice",
		]);
		assert.deepEqual(errors_of(() => yaml`layouts: { Ms_Map: [] }`), ["the root key `layouts` must be a list of layout names"]);
	});

	test("a description may list no layout", () => {
		for (const description of [yaml`{}`, yaml(COMMON), yaml`layouts: []`]) {
			assert.deepEqual(Object.keys(description.layouts), []);
			assert.deepEqual(register(description).layouts, {});
		}
	});
});

describe("item tables", () => {
	test("only the item tables reached from layouts are read; other root keys belong to the caller", () => {
		const description = json_desc({
			layouts: ["Ms_Reached"],
			item_tables: { Ms_Reached: [{ includes: "part", offset: 0 }], part: ITEMS, unused: [{ type: "Nope" }] },
			version: 3,
			settings: { a: 1 },
		});
		assert.deepEqual(description.layouts.Ms_Reached.items.map((item) => item.name), ["a"]);
	});

	test("an item table can be a layout and be referenced as well", () => {
		const { layouts } = register(json_desc({
			layouts: ["Ms_Unit", "Ms_Pair"],
			item_tables: {
				Ms_Unit: ITEMS,
				Ms_Pair: [{ includes: "Ms_Unit", offset: 0 }, { includes: "Ms_Unit", offset: 16, name_prefix: "b_" }],
			},
		}));
		assert.deepEqual(layouts.Ms_Pair.items.map((item) => [item.name, item.offset]), [["a", 0], ["b_a", 16]]);
		assert.equal(layouts.Ms_Unit.size, 2);
	});

	test("a listed name without an item table, and an item table that is not a list, are errors", () => {
		assert.deepEqual(errors_of(() => yaml`layouts: [Ms_Missing]`), ["layout Ms_Missing: unknown item table Ms_Missing"]);
		assert.deepEqual(errors_of(() => json_desc({ layouts: ["Ms_Map"], item_tables: { Ms_Map: { a: 1 } } })), ["item table Ms_Map: expected a list of items"]);
	});

	test("an item table is only found under item_tables, not among the other root keys", () => {
		assert.deepEqual(errors_of(() => json_desc({ layouts: ["Ms_Root"], Ms_Root: ITEMS })), ["layout Ms_Root: unknown item table Ms_Root"]);
		assert.deepEqual(errors_of(() => json_desc({ layouts: ["Ms_Ref"], item_tables: { Ms_Ref: [{ includes: "config", offset: 0 }] }, config: ITEMS })), [
			"item table Ms_Ref: unknown item table config",
		]);
	});

	test("item_tables must be a mapping, and the root a mapping", () => {
		for (const item_tables of [[], null, 3, "Ms_Text"]) {
			assert.deepEqual(errors_of(() => json_desc({ item_tables })), [
				"the root key `item_tables` must map item table names to item lists",
			]);
		}
		for (const text of ["42", "[]", "null", ""]) {
			assert.deepEqual(errors_of(() => yaml(text)), ["the root must be a mapping"], text);
		}
	});
});

describe("imports", () => {
	const common = write(COMMON, "common.yaml");

	test("a relative path is relative to the importing file, and the imported item tables are used", () => {
		mkdirSync(join(dir, "sub"), { recursive: true });
		const file = write(pump_text("Ms_Pump", "../common.yaml"), join("sub", "pump.yaml"));
		const { layouts } = register(desc_file(file));
		assert.equal(layouts.Ms_Pump.create_ldata("p").status, 0x0001);
	});

	test("YAML text imports by absolute path or file: URL, never by a relative path", () => {
		assert.equal(register(yaml(pump_text("Ms_Abs", common))).layouts.Ms_Abs.size, 4);
		assert.equal(register(yaml(pump_text("Ms_Url", pathToFileURL(common).href))).layouts.Ms_Url.size, 4);
		assert.deepEqual(errors_of(() => yaml(pump_text("Ms_Rel", "common.yaml"))), [
			"import common.yaml: YAML text has no file, so a relative path cannot be resolved; give an absolute path or a file: URL",
		]);
	});

	test("the layouts and blocks of an imported description are ignored", () => {
		const imported = write(`
layouts: [Ms_Imported]
item_tables:
  Ms_Imported:
    - { name: a, type: UInt, offset: 0 }
blocks:
  - { name: never, layout: Ms_Imported }
`);
		const description = yaml`
imports: [${imported}]
layouts: [Ms_Importer]
item_tables:
  Ms_Importer:
    - { includes: Ms_Imported, offset: 16 }
`;
		assert.deepEqual(Object.keys(description.layouts), ["Ms_Importer"]);
		assert.deepEqual(description.blocks, []);
	});

	test("imports are transitive, and a file imported twice counts once", () => {
		const base = write("item_tables:\n  base:\n    - { name: b, type: UInt, offset: 0 }\n");
		const left = write(`imports: [${base}]\nitem_tables:\n  left:\n    - { includes: base, offset: 0, name_prefix: l_ }\n`);
		const right = write(`imports: [${base}]\nitem_tables:\n  right:\n    - { includes: base, offset: 0, name_prefix: r_ }\n`);
		const description = yaml`
imports: [${left}, ${right}]
layouts: [Ms_Diamond]
item_tables:
  Ms_Diamond:
    - { includes: left, offset: 0 }
    - { includes: right, offset: 16 }
    - { includes: base, offset: 32, name_prefix: b_ }
`;
		assert.deepEqual(description.layouts.Ms_Diamond.items.map((item) => item.name), ["l_b", "r_b", "b_b"]);
	});

	test("circular imports are an error", () => {
		const first = join(dir, "cycle_a.yaml");
		const second = join(dir, "cycle_b.yaml");
		writeFileSync(first, "imports: [cycle_b.yaml]\n");
		writeFileSync(second, "imports: [cycle_a.yaml]\n");
		assert.deepEqual(errors_of(() => desc_file(first)), [`${second}: circular import ${first} -> ${second} -> ${first}`]);
	});

	test("an item table reached and defined both locally and imported, or in two imports, is an error naming both", () => {
		const local = write(`${pump_text("Ms_Dup", common)}  status_bits:\n    - { name: x, type: Bool, offset: 0 }\n`);
		assert.deepEqual(errors_of(() => desc_file(local)), [`item table status_bits is defined in ${local} and ${common}`]);
		const twin = write(COMMON);
		assert.deepEqual(errors_of(() => yaml`
imports: [${common}, ${twin}]
layouts: [Ms_Twin]
item_tables:
  Ms_Twin:
    - { name: w, type: Word, offset: 0, coupling: status_bits }
`), [`item table status_bits is defined in ${common} and ${twin}`]);
		// not reached, not compared
		assert.equal(yaml`
imports: [${common}, ${twin}]
layouts: [Ms_Free]
item_tables:
  Ms_Free:
    - { name: a, type: UInt, offset: 0 }
`.layouts.Ms_Free.size, 2);
	});

	test("an import that cannot be read or parsed, and imports that are not a list of paths, are errors", () => {
		const missing = join(dir, "missing.yaml");
		const read_errors = errors_of(() => yaml`imports: [${missing}]`);
		assert.equal(read_errors.length, 1);
		assert.ok(read_errors[0].startsWith(`${missing}: `) && read_errors[0].includes("ENOENT"), read_errors[0]);
		const bad = write("item_tables: [unclosed\n");
		assert.ok(errors_of(() => yaml`imports: [${bad}]`).every((error) => error.startsWith(`${bad}: `)));
		assert.deepEqual(errors_of(() => yaml`imports: common.yaml`), ["the root key `imports` must be a list of paths"]);
	});

	test("a JSON file is a description too", () => {
		const file = write(JSON.stringify({ imports: [common], ...listing(["Ms_Json"]) }), "pump.json");
		assert.equal(register(desc_file(file)).layouts.Ms_Json.size, 2);
	});
});

describe("loading", () => {
	test("a scope loads any number of times", () => {
		const scope = fresh_scope();
		const first = scope.load(unit("Ms_First")).layouts.Ms_First;
		const second = scope.load(unit("Ms_Second", 1)).layouts.Ms_Second;
		assert.equal(scope.get_layout("Ms_First"), first);
		assert.equal(scope.get_layout("Ms_Second"), second);
	});

	test("a layout of the same name and structure is reused, in later calls and in the same call", () => {
		const scope = fresh_scope();
		const description = unit("Ms_Reused", 0, "comment: this root key is the caller's");
		const { layouts } = scope.load(description);
		assert.equal(scope.load(unit("Ms_Reused")).layouts.Ms_Reused, layouts.Ms_Reused);
		const both = scope.load([unit("Ms_Pair", 7), unit("Ms_Pair", 7)]);
		assert.equal(both.layouts.Ms_Pair, scope.get_layout("Ms_Pair"));
		// the comments are not part of the structure
		const commented = yaml`
layouts: [Ms_Pair]
item_tables:
  Ms_Pair:
    - { name: a, type: uint, offset: 0, init_value: 7, comment: another type case and a comment }
`;
		assert.equal(scope.load(commented).layouts.Ms_Pair, both.layouts.Ms_Pair);
	});

	test("the same structure under another name, or the same name with another structure, is an error", () => {
		const scope = fresh_scope();
		scope.load(unit("Ms_Kept"));
		const name = scope.name;
		assert.deepEqual(errors_of(() => scope.load(unit("Ms_Alias"))), [
			`description: layout ${name}.Ms_Alias has the structure of layout ${name}.Ms_Kept`,
		]);
		assert.deepEqual(errors_of(() => scope.load([unit("Ms_Other", 1), unit("Ms_Kept", 2)])), [
			`description #2: another layout of a different structure is already named ${name}.Ms_Kept`,
		]);
		assert.deepEqual(errors_of(() => scope.load([unit("Ms_Twice", 3), unit("Ms_Twice", 4)])), [
			`description #2: another layout of a different structure is already named ${name}.Ms_Twice`,
		]);
		assert.throws(() => scope.get_layout("Ms_Other"), /unknown layout/);
		assert.throws(() => scope.get_layout("Ms_Twice"), /unknown layout/);
	});

	test("a Description loaded into two scopes gives two layouts", () => {
		const description = unit("Ms_Shared", 5);
		const one = register(description).layouts.Ms_Shared;
		const two = register(description).layouts.Ms_Shared;
		assert.notEqual(one, two);
		assert.notEqual(one.scope, two.scope);
		assert.deepEqual([one.create_ldata("x").a, two.create_ldata("x").a], [5, 5]);
		assert.notEqual(description.layouts.Ms_Shared, one);
	});

	test("errors name the scope; a failed call changes nothing", () => {
		const scope = fresh_scope();
		scope.load(unit("Ms_Old"));
		assert.throws(() => scope.load([unit("Ms_New", 1), unit("Ms_Old", 9)]), new RegExp(`^Error: invalid descriptions of scope ${scope.name}:`));
		assert.throws(() => scope.get_layout("Ms_New"), /unknown layout/);
		assert.equal(scope.load(unit("Ms_New", 1)).layouts.Ms_New, scope.get_layout("Ms_New"));
	});

	test("only Descriptions are loaded: strings, objects, nested and empty lists are errors", () => {
		assert.deepEqual(errors_of(() => fresh_scope().load(["pump.yaml", listing(["Ms_Obj"]), [unit("Ms_Nested")], 42, null, unit("Ms_Valid", 7)])), [
			"description #1: not a Description; read a description file with desc_file, YAML text with yaml",
			"description #2: not a Description; read a description file with desc_file, YAML text with yaml",
			"description #3: a list of descriptions must not contain a list",
			"description #4: not a Description; read a description file with desc_file, YAML text with yaml",
			"description #5: not a Description; read a description file with desc_file, YAML text with yaml",
		]);
		assert.deepEqual(errors_of(() => fresh_scope().load([])), ["no description is given"]);
	});

	test("a Description is deeply frozen and not changed by loading", () => {
		const description = unit("Ms_Frozen", 0, "blocks:\n  - { name: f, layout: Ms_Frozen, extra: { x: [1] } }\n");
		assert.ok(Object.isFrozen(description));
		assert.ok(Object.isFrozen(description.layouts));
		assert.ok(Object.isFrozen(description.layouts.Ms_Frozen));
		assert.ok(Object.isFrozen(description.blocks[0].extra.x));
		assert.ok(Object.isFrozen(description.item_tables.Ms_Frozen[0]));
		fresh_scope().load(description);
		assert.deepEqual(Object.keys(description.layouts), ["Ms_Frozen"]);
	});

	test("the other root keys of the description read are kept as they are, those of its imports are not", () => {
		const common = write("item_tables:\n  part:\n    - { name: p, type: UInt, offset: 0 }\nsettings: { imported: true }\n");
		const description = yaml`
imports: [${common}]
layouts: [Ms_Kept_Keys]
item_tables:
  Ms_Kept_Keys:
    - { includes: part, offset: 0 }
settings: { port: 502, hosts: [a, b] }
version: 3
`;
		assert.deepEqual(Object.keys(description), ["imports", "layouts", "item_tables", "settings", "version", "blocks"]);
		assert.deepEqual(description.imports, [common]);
		assert.deepEqual(description.item_tables, { Ms_Kept_Keys: [{ includes: "part", offset: 0 }] });
		assert.deepEqual(description.settings, { port: 502, hosts: ["a", "b"] });
		assert.equal(description.version, 3);
		assert.ok(Object.isFrozen(description.settings.hosts));
		assert.equal(register(description).layouts.Ms_Kept_Keys.items[0].name, "p");
	});

	test("the other root keys read by desc_file equal a parse of the same text, before and after loading", () => {
		const common = write("item_tables:\n  part:\n    - { name: p, type: UInt, offset: 0, init_value: 1 }\n");
		const text = `
imports: [${common}]
layouts: [Ms_Same_Keys]
item_tables:
  Ms_Same_Keys:
    - { includes: part, offset: 0, name_prefix: a_ }
    - name: w
      type: Word
      offset: 16
      coupling:
        - { name: b0, type: Bool, offset: 8, init_value: true }
  unused: [{ type: Nope }]
settings: { port: 502, hosts: [a, b], nested: { list: [1, { deep: x }] } }
version: 3
blocks:
  - { name: kept_1, layout: Ms_Same_Keys, unit_id: 1 }
`;
		const other_keys = (root) => Object.fromEntries(Object.entries(root).filter(([key]) => key !== "layouts" && key !== "blocks"));
		const expected = other_keys(parse_yaml(text, { version: "1.2" }));
		const description = desc_file(write(text));
		assert.deepEqual(other_keys(description), expected);
		fresh_scope().load(description);
		assert.deepEqual(other_keys(description), expected);
		assert.deepEqual(description.blocks, [{ name: "kept_1", layout: "Ms_Same_Keys", unit_id: 1 }]);
	});

	test("a layout of a Description is not bound to a scope and creates no ldata", () => {
		const desc = unit("Ms_Unbound").layouts.Ms_Unbound;
		assert.equal(desc.scope, undefined);
		assert.deepEqual([desc.name, desc.length, desc.size], ["Ms_Unbound", 16, 2]);
		assert.equal(desc.io_index_table("LE").length, 2);
		assert.throws(() => desc.create_ldata("x"), /^Error: layout Ms_Unbound is not bound to a scope$/);
	});
});

describe("blocks", () => {
	test("loading creates the ldata of the blocks, managed by their layouts", () => {
		const scope = fresh_scope();
		const description = unit("Ms_Block", 4, `
blocks:
  - { name: b_1, layout: Ms_Block, unit_id: 1 }
  - { name: b_2, layout: Ms_Block, unit_id: 2 }
`);
		assert.deepEqual(description.blocks, [
			{ name: "b_1", layout: "Ms_Block", unit_id: 1 },
			{ name: "b_2", layout: "Ms_Block", unit_id: 2 },
		]);
		const { layouts, ldata } = scope.load(description);
		assert.deepEqual(Object.keys(ldata), ["b_1", "b_2"]);
		assert.equal(ldata.b_1.layout, layouts.Ms_Block);
		assert.equal(ldata.b_1.a, 4);
		assert.equal(layouts.Ms_Block.get_ldata("b_2"), ldata.b_2);
	});

	test("the blocks are created in the scope loading the description, so one description loads into several scopes", () => {
		const description = unit("Ms_Group", 6, "blocks:\n  - { name: g, layout: Ms_Group }\n");
		const one = fresh_scope();
		const two = fresh_scope();
		const first = one.load(description).ldata.g;
		const second = two.load(description).ldata.g;
		assert.notEqual(first, second);
		assert.equal(one.get_layout("Ms_Group").get_ldata("g"), first);
		assert.equal(two.get_layout("Ms_Group").get_ldata("g"), second);
	});

	test("blocks of an application on a layout of a library: import its item tables, list the layout, load into its scope", () => {
		const lib_file = write("layouts: [Ms_Lib_Layout]\nitem_tables:\n  Ms_Lib_Layout:\n    - { name: a, type: UInt, offset: 0, init_value: 1 }\n");
		const lib = fresh_scope();
		lib.load(desc_file(lib_file));
		const app = yaml`
imports: [${lib_file}]
layouts: [Ms_Lib_Layout]
blocks:
  - { name: lent, layout: Ms_Lib_Layout }
`;
		const { layouts, ldata } = lib.load(app);
		assert.equal(layouts.Ms_Lib_Layout, lib.get_layout("Ms_Lib_Layout"));
		assert.equal(lib.get_layout("Ms_Lib_Layout").get_ldata("lent"), ldata.lent);
		assert.equal(ldata.lent.a, 1);
	});

	test("a used ldata name and a block name repeated in the call are errors; nothing is created", () => {
		const scope = fresh_scope();
		scope.load(unit("Ms_Used", 0, "blocks:\n  - { name: taken, layout: Ms_Used }\n"));
		const first = unit("Ms_Used", 0, "blocks:\n  - { name: taken, layout: Ms_Used }\n  - { name: twice, layout: Ms_Used }\n");
		const second = unit("Ms_Fresh", 1, "blocks:\n  - { name: twice, layout: Ms_Fresh }\n");
		assert.deepEqual(errors_of(() => scope.load([first, second])), [
			`description #1: block taken: ldata ${scope.name}.Ms_Used.taken already exists`,
			"block twice is listed in description #1 and description #2",
		]);
		assert.throws(() => scope.get_layout("Ms_Fresh"), /unknown layout/);
		assert.throws(() => scope.get_layout("Ms_Used").get_ldata("twice"), new RegExp(`unknown ldata ${scope.name}.Ms_Used.twice`));
		// a block of a layout in conflict adds no error of its own
		assert.deepEqual(errors_of(() => scope.load(unit("Ms_Used", 5, "blocks:\n  - { name: other, layout: Ms_Used }\n"))), [
			`description: another layout of a different structure is already named ${scope.name}.Ms_Used`,
		]);
	});

	test("loading the same blocks again into the scope is an error", () => {
		const scope = create_scope("Sc_Block_Again");
		const description = unit("Ms_Again", 0, "blocks:\n  - { name: again, layout: Ms_Again }\n");
		scope.load(description);
		assert.deepEqual(errors_of(() => scope.load(description)), [
			"description: block again: ldata Sc_Block_Again.Ms_Again.again already exists",
		]);
	});

	test("blocks are checked when reading, all the errors together", () => {
		const file = write(`
layouts: [Pump]
item_tables:
  Pump:
    - { name: a, type: UInt, offset: 0 }
blocks:
  - { name: ok, layout: Pump }
  - just a string
  - { layout: Pump }
  - { name: ok, layout: Pump }
  - { name: other, layout: Valve }
  - { name: scoped, layout: app.Pump }
  - { name: not_text, layout: [app, Pump] }
`);
		assert.deepEqual(errors_of(() => desc_file(file)), [
			`${file}: block #2 is not a mapping`,
			`${file}: block #3: \`name\` must be a string`,
			`${file}: block ok is listed twice`,
			`${file}: block other: unknown layout Valve`,
			`${file}: block scoped: unknown layout app.Pump`,
			`${file}: block not_text: \`layout\` must be a layout name`,
		]);
		assert.deepEqual(errors_of(() => yaml`blocks: { name: x }`), ["the root key `blocks` must be a list of blocks"]);
		// only an absent blocks is made [], an empty value is not
		assert.deepEqual(errors_of(() => yaml`blocks:`), ["the root key `blocks` must be a list of blocks"]);
		assert.deepEqual(yaml`layouts: []`.blocks, []);
	});

	test("a block references a layout of its own description only, not one of an imported description", () => {
		const imported = write("layouts: [Ms_Lent]\nitem_tables:\n  Ms_Lent:\n    - { name: a, type: UInt, offset: 0 }\n");
		assert.deepEqual(errors_of(() => yaml`
imports: [${imported}]
blocks:
  - { name: x, layout: Ms_Lent }
`), ["block x: unknown layout Ms_Lent"]);
	});
});

describe("a layout manages its ldata", () => {
	test("an ldata name is unique within its layout, and get_ldata finds it", () => {
		const { scope, layouts } = register(unit("Ms_Names"));
		const layout = layouts.Ms_Names;
		const data = layout.create_ldata("n");
		assert.equal(layout.get_ldata("n"), data);
		assert.throws(() => layout.create_ldata("n"), new RegExp(`^Error: ldata ${scope.name}.Ms_Names.n already exists$`));
		assert.throws(() => layout.get_ldata("m"), new RegExp(`^Error: unknown ldata ${scope.name}.Ms_Names.m$`));
		assert.throws(() => layout.create_ldata(1), TypeError);
		// the same name in another layout is another ldata
		assert.notEqual(register(unit("Ms_Names")).layouts.Ms_Names.create_ldata("n"), data);
	});

	test("delete_ldata unbinds a name, which can be used again; the ldata itself is unaffected", () => {
		const { scope, layouts } = register(unit("Ms_Delete", 3));
		const layout = layouts.Ms_Delete;
		const data = layout.create_ldata("gone");
		const changes = [];
		data.on("change", (name, old_value, new_value) => changes.push([name, old_value, new_value]));
		assert.equal(layout.delete_ldata("gone"), true);
		assert.throws(() => layout.get_ldata("gone"), new RegExp(`^Error: unknown ldata ${scope.name}.Ms_Delete.gone$`));
		assert.equal(layout.delete_ldata("gone"), false);
		assert.equal(layout.delete_ldata("never"), false);
		data.a = 4;
		assert.deepEqual([data.a, data.layout, changes], [4, layout, [["a", 3, 4]]]);
		const again = layout.create_ldata("gone");
		assert.notEqual(again, data);
		assert.equal(layout.get_ldata("gone"), again);
	});

	test("the ldata of the blocks given back by delete_ldata let the same blocks load again", () => {
		const scope = create_scope("Sc_Rebuild");
		const description = unit("Ms_Rebuild", 0, "blocks:\n  - { name: r_1, layout: Ms_Rebuild }\n  - { name: r_2, layout: Ms_Rebuild }\n");
		const first = scope.load(description).ldata;
		for (const data of Object.values(first)) data.layout.delete_ldata(data.name);
		const second = scope.load(description).ldata;
		assert.deepEqual(Object.keys(second), ["r_1", "r_2"]);
		assert.notEqual(second.r_1, first.r_1);
		assert.equal(scope.get_layout("Ms_Rebuild").get_ldata("r_1"), second.r_1);
	});
});
