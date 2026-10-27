import "./share.js"; // must be first: sets LOG_LEVEL
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { describe } from "node:test";
import { COMPILED } from "../src/internal.js";
import { fresh_scope, register } from "./share.js";

const dir = mkdtempSync(join(tmpdir(), "tlms-layout-"));
let file_seq = 0;

/** Writes a YAML layout file. */
function write(yaml) {
	const file = join(dir, `layout_${++file_seq}.yaml`);
	writeFileSync(file, yaml);
	return file;
}

/** Writes a YAML layout file and registers it in a scope of its own. */
function compile(yaml, scope = fresh_scope()) {
	return scope.register_layout(write(yaml));
}

function errors_of(yaml, scope = fresh_scope()) {
	try {
		compile(yaml, scope);
	} catch (e) {
		return e.errors;
	}
	assert.fail("the layout was accepted");
}

const Sample = `
layouts: [T]

item_tables:
  T:
    - { name: id, type: UInt, offset: 0, init_value: 7 }
    - name: status
      type: Word
      offset: 16
      is_combined: true
      coupling: flags
    - name: inline
      type: Word
      offset: 32
      init_value: 1
      coupling:
        - { name: i0, type: Bool, offset: 8 }
        - { name: i8, type: Bool, offset: 0 }
    - { includes: pair, offset: 48 }
    - { includes: pair, offset: 112, name_prefix: p_ }

  flags:
    - { name: f0, type: Bool, offset: 8, init_value: true }
    - { name: f8, type: Bool, offset: 0, init_value: false, comment: high byte bit }

  pair:
    - { name: a, type: Int, offset: 0, init_value: -2 }
    - { name: b, type: Real, offset: 16, init_value: 1.5 }
`;

describe("YAML layout file", () => {
	test("item tables are referenced by name from coupling and includes", () => {
		const { layouts, tables } = compile(Sample);
		const { T } = layouts;
		const offset_of = (name) => T.items.find((it) => it.name === name).offset;
		assert.equal(offset_of("f0"), 24);
		assert.equal(offset_of("f8"), 16);
		assert.equal(offset_of("i0"), 40);
		assert.equal(offset_of("a"), 48);
		assert.equal(offset_of("b"), 64);
		assert.equal(offset_of("p_a"), 112);
		assert.deepEqual(T.items.find((it) => it.name === "status").coupling, ["f0", "f8"]);
		assert.equal(T.length, 160);
		assert.deepEqual(tables.pair.map((it) => it.name), ["a", "b"]);
	});

	test("an omitted length follows the type, comments are kept", () => {
		const { T } = compile(Sample).layouts;
		const item = (name) => T.items.find((it) => it.name === name);
		assert.equal(item("id").length, 16);
		assert.equal(item("f8").length, 1);
		assert.equal(item("b").length, 32);
		assert.equal(item("f8").comment, "high byte bit");
	});

	test("the compiled layout constructs data blocks", () => {
		const { T } = compile(Sample).layouts;
		const data = T.create_ldata("t");
		assert.equal(data.layout, T);
		assert.equal(data.id, 7);
		// status is composed from its bits, the bits of inline from the word
		assert.equal(data.status, 0x0001);
		assert.equal(data.i0, true);
		assert.equal(data.i8, false);
		assert.equal(data.p_b, 1.5);
		data.f8 = true;
		assert.equal(data.status, 0x0101);
	});

	test("tags_at_byte lists the tags of each byte, a word before its bits", () => {
		const { T } = compile(Sample).layouts;
		const names = (byte) => T[COMPILED].tags_at_byte[byte].map((entry) => entry.name);
		assert.deepEqual(names(0), ["id"]);
		assert.deepEqual(names(2), ["status", "f8"]);
		assert.deepEqual(names(3), ["status", "f0"]);
		assert.deepEqual(names(8), ["b"]);
		assert.deepEqual(names(11), ["b"]);
	});

	test("an unknown item table is reported", () => {
		const errors = errors_of("layouts: [T]\nitem_tables:\n  T:\n    - { includes: nope, offset: 0 }\n");
		assert.deepEqual(errors, ["item table T: unknown item table nope"]);
	});

	test("a circular item table reference is reported", () => {
		const errors = errors_of(`
layouts: [T]
item_tables:
  T:
    - { includes: first, offset: 0 }
  first:
    - { includes: second, offset: 0 }
  second:
    - { includes: first, offset: 0 }
`);
		assert.deepEqual(errors, ["item table second: circular item table reference T -> first -> second -> first"]);
	});

	test("layout rule violations are reported all at once", () => {
		const errors = errors_of(`
layouts: [T]
item_tables:
  T:
    - { name: a, type: Int, offset: 8, init_value: 0 }
    - { name: b, type: UInt, offset: 16, length: 8, init_value: 0 }
`);
		assert.ok(errors.includes("T.a: byte offset 1 is not even"), errors.join("\n"));
		assert.ok(errors.includes("T.b: length 8 does not match type UInt"), errors.join("\n"));
	});

	test("a file without the layouts key defines no layout", () => {
		assert.deepEqual(errors_of("x: []\n"), ["no layout is listed in the descriptions"]);
	});

	test("the layouts key must be a list of layout names", () => {
		const errors = errors_of("layouts:\n  T:\n    - { name: a, type: UInt, offset: 0 }\n");
		assert.equal(errors.length, 1);
		assert.match(errors[0], /the root key `layouts` must be a list of layout names/);
	});

	test("a missing file and a YAML syntax error are reported in errors", () => {
		assert.throws(() => register(join(dir, "missing.yaml")), (error) => {
			assert.match(error.errors[0], /ENOENT/);
			return true;
		});
		const errors = errors_of("layouts: [unclosed\n");
		assert.ok(errors.length >= 1 && errors[0].includes("layout_"), errors.join("\n"));
	});
});

describe("parsed layout description", () => {
	test("a description object registers the same structure as a file", () => {
		const { layouts, tables } = register({
			layouts: ["PARSED"],
			item_tables: {
				PARSED: [{ name: "a", type: "UInt", offset: 0, init_value: 3 }, { includes: "tail", offset: 16 }],
				tail: [{ name: "b", type: "UInt", offset: 0, init_value: 4 }],
			},
		});
		assert.equal(layouts.PARSED.create_ldata("t").b, 4);
		assert.equal(tables.tail.length, 1);
	});

	test("errors name the scope", () => {
		const file = write("layouts: [Bad]\nitem_tables:\n  Bad:\n    - { name: a, type: Byte, offset: 0, init_value: 0 }\n");
		const scope = fresh_scope();
		assert.throws(() => scope.register_layout(file), new RegExp(`invalid layout descriptions of scope ${scope.name}:`));
		assert.throws(() => scope.register_layout({ x: [] }), new RegExp(`invalid layout descriptions of scope ${scope.name}:`));
	});
});

describe("layout registry", () => {
	test("an invalid file registers nothing and does not use up the call of the scope", () => {
		const scope = fresh_scope();
		assert.throws(() => compile("x: []\n", scope));
		assert.throws(() => compile("x: []\n", scope));
		const { layouts } = compile("layouts: [Reg_Later]\nitem_tables:\n  Reg_Later:\n    - { name: a, type: UInt, offset: 0, init_value: 1 }\n", scope);
		assert.equal(scope.get_layout("Reg_Later"), layouts.Reg_Later);
		assert.equal(scope.get_layout("Reg_Later").create_ldata("t").a, 1);
	});
});
