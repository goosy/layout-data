import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { describe } from "node:test";
import { pathToFileURL } from "node:url";
import { register } from "./share.js";
import { desc_file, yaml } from "./target.js";

const dir = mkdtempSync(join(tmpdir(), "yaml-"));

const PUMP = "layouts: [Ym_Pump]\nitem_tables:\n  Ym_Pump:\n    - { name: id, type: UInt, offset: 0, init_value: 5 }\n";

/** The errors of a call that must throw an Error with errors. */
function errors_of(call) {
	try {
		call();
	} catch (error) {
		assert.ok(Array.isArray(error.errors), String(error));
		return { message: error.message, errors: error.errors };
	}
	assert.fail("the call did not throw");
}

/** The layouts of a Description as plain data: name and items. */
const shape = (description) => Object.values(description.layouts).map((layout) => [layout.name, layout.items]);

describe("1.1 yaml", () => {
	test("compiles YAML text into a Description, as a tag or called with the text", () => {
		const tagged = yaml`
layouts: [Ym_Tag]
item_tables:
  Ym_Tag:
    - { name: a, type: UInt, offset: 0, init_value: 1 }
`;
		assert.deepEqual(Object.keys(tagged.layouts), ["Ym_Tag"]);
		assert.deepEqual(tagged.layouts.Ym_Tag.items.map((item) => [item.name, item.init_value]), [["a", 1]]);
		assert.deepEqual(tagged.blocks, []);
		assert.deepEqual(shape(yaml(PUMP)), shape(yaml`${PUMP}`));
		assert.equal(register(yaml(PUMP)).layouts.Ym_Pump.create_ldata("p").id, 5);
	});

	test("as a tag, the text is raw and the values are put into it as strings", () => {
		const name = "Ym_Raw";
		const value = 7;
		const description = yaml`
layouts: [${name}]
item_tables:
  ${name}:
    - { name: a, type: UInt, offset: 0, init_value: ${value}, comment: "tab\tdone" }
`;
		const [item] = description.layouts.Ym_Raw.items;
		assert.equal(item.init_value, 7);
		// the escape \t reached the YAML parser, which made it a tab
		assert.equal(item.comment, "tab\tdone");
	});

	test("a parse error throws at the call with errors; another argument throws TypeError", () => {
		const { message, errors } = errors_of(() => yaml("layouts: [unclosed\n"));
		assert.ok(message.startsWith("invalid YAML text:\n"), message);
		assert.ok(errors.length >= 1);
		assert.throws(() => yaml(42), TypeError);
		assert.throws(() => yaml(), TypeError);
	});

	test("the structure is checked when reading, all the errors together", () => {
		assert.deepEqual(errors_of(() => yaml("42")).errors, ["the root must be a mapping"]);
		const { message, errors } = errors_of(() => yaml`
layouts: [Ym_Bad, Ym_Worse]
item_tables:
  Ym_Bad:
    - { name: a, type: Byte, offset: 0 }
  Ym_Worse:
    - { name: get, type: UInt, offset: 0 }
`);
		assert.ok(message.startsWith("invalid YAML text:\n"), message);
		assert.deepEqual(errors, [
			"Ym_Bad: length 8 bits is not a whole number of registers",
			"Ym_Worse.get: name is a reserved name",
		]);
	});
});

describe("1.1 desc_file", () => {
	const file = join(dir, "pump.yaml");
	writeFileSync(file, PUMP);

	test("reads a description file, as a tag, with a path or with a file: URL", () => {
		const expected = shape(yaml(PUMP));
		assert.deepEqual(shape(desc_file(file)), expected);
		assert.deepEqual(shape(desc_file`${file}`), expected);
		assert.deepEqual(shape(desc_file(pathToFileURL(file))), expected);
	});

	test("as a tag, the path is raw: a backslash is kept", () => {
		const { message } = errors_of(() => desc_file`no\such\dir\file.yaml`);
		assert.ok(message.startsWith("invalid description file no\\such\\dir\\file.yaml:\n"), message);
	});

	test("an unreadable file, a parse error or an invalid description throws at the call, naming the file", () => {
		const missing = join(dir, "missing.yaml");
		const absent = errors_of(() => desc_file(missing));
		assert.equal(absent.message.split("\n")[0], `invalid description file ${missing}:`);
		assert.match(absent.errors[0], /ENOENT/);
		const bad = join(dir, "bad.yaml");
		writeFileSync(bad, "layouts: [unclosed\n");
		const parse = errors_of(() => desc_file(bad));
		assert.ok(parse.errors.length >= 1 && parse.errors.every((error) => error.startsWith(`${bad}: `)), parse.errors.join("\n"));
		const scalar = join(dir, "scalar.yaml");
		writeFileSync(scalar, "42\n");
		assert.deepEqual(errors_of(() => desc_file(scalar)).errors, [`${scalar}: the root must be a mapping`]);
	});

	test("an argument that is not a path or a file: URL throws TypeError", () => {
		assert.throws(() => desc_file(42), TypeError);
		assert.throws(() => desc_file(new URL("https://example.com/pump.yaml")), TypeError);
	});

	test("the file is remembered by the Description, not as a key, and named by the errors of registration", () => {
		const description = desc_file(file);
		assert.deepEqual(Object.keys(description), ["layouts", "item_tables", "blocks"]);
		const other = join(dir, "pump_other.yaml");
		writeFileSync(other, PUMP.replace("init_value: 5", "init_value: 6"));
		assert.throws(() => register([description, desc_file(other)]), (error) => {
			assert.deepEqual(error.errors, [`${other}: another layout of a different structure is already named ${error.message.match(/scope (\w+)/)[1]}.Ym_Pump`]);
			return true;
		});
	});
});
