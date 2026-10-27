import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { describe } from "node:test";
import { pathToFileURL } from "node:url";
import { register } from "./share.js";
import { yaml, yaml_file } from "./target.js";

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

describe("1.1 yaml", () => {
	test("parses YAML text into a description object, as a tag or called with the text", () => {
		const tagged = yaml`
layouts: [Ym_Tag]
item_tables:
  Ym_Tag:
    - { name: a, type: UInt, offset: 0, init_value: 1 }
`;
		assert.deepEqual(tagged, { layouts: ["Ym_Tag"], item_tables: { Ym_Tag: [{ name: "a", type: "UInt", offset: 0, init_value: 1 }] } });
		assert.deepEqual(yaml(PUMP), { layouts: ["Ym_Pump"], item_tables: { Ym_Pump: [{ name: "id", type: "UInt", offset: 0, init_value: 5 }] } });
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
		assert.deepEqual(description.layouts, ["Ym_Raw"]);
		assert.equal(description.item_tables.Ym_Raw[0].init_value, 7);
		// the escape \t reached the YAML parser, which made it a tab
		assert.equal(description.item_tables.Ym_Raw[0].comment, "tab\tdone");
	});

	test("a parse error throws at the call with errors; another argument throws TypeError", () => {
		const { message, errors } = errors_of(() => yaml("layouts: [unclosed\n"));
		assert.ok(message.startsWith("invalid YAML text:\n"), message);
		assert.ok(errors.length >= 1);
		assert.throws(() => yaml(42), TypeError);
		assert.throws(() => yaml(), TypeError);
	});

	test("the structure is checked by registration, not by yaml", () => {
		assert.equal(yaml("42"), 42);
		assert.throws(() => register(yaml("42")), (error) => error.errors[0] === "layout description: the root must be a mapping");
	});
});

describe("1.1 yaml_file", () => {
	const file = join(dir, "pump.yaml");
	writeFileSync(file, PUMP);

	test("reads a description file, as a tag, with a path or with a file: URL", () => {
		const expected = yaml(PUMP);
		assert.deepEqual(yaml_file(file), expected);
		assert.deepEqual(yaml_file`${file}`, expected);
		assert.deepEqual(yaml_file(pathToFileURL(file)), expected);
	});

	test("as a tag, the path is raw: a backslash is kept", () => {
		const { message } = errors_of(() => yaml_file`no\such\dir\file.yaml`);
		assert.ok(message.startsWith("invalid description file no\\such\\dir\\file.yaml:\n"), message);
	});

	test("an unreadable file or a parse error throws at the call, naming the file", () => {
		const missing = join(dir, "missing.yaml");
		const absent = errors_of(() => yaml_file(missing));
		assert.equal(absent.message.split("\n")[0], `invalid description file ${missing}:`);
		assert.match(absent.errors[0], /ENOENT/);
		const bad = join(dir, "bad.yaml");
		writeFileSync(bad, "layouts: [unclosed\n");
		const parse = errors_of(() => yaml_file(bad));
		assert.ok(parse.errors.length >= 1 && parse.errors.every((error) => error.startsWith(`${bad}: `)), parse.errors.join("\n"));
	});

	test("an argument that is not a path or a file: URL throws TypeError", () => {
		assert.throws(() => yaml_file(42), TypeError);
		assert.throws(() => yaml_file(new URL("https://example.com/pump.yaml")), TypeError);
	});

	test("the file is remembered by the object returned, not by its copies, and not as a key", () => {
		const description = yaml_file(file);
		assert.deepEqual(Object.keys(description), ["layouts", "item_tables"]);
		assert.deepEqual(JSON.parse(JSON.stringify(description)), yaml(PUMP));
		const other = join(dir, "pump_again.yaml");
		writeFileSync(other, PUMP);
		const twice = (first) => {
			try {
				register([first, yaml_file(other)]);
			} catch (error) {
				return error.errors;
			}
			assert.fail("the descriptions were accepted");
		};
		assert.deepEqual(twice(description), [`layout Ym_Pump is listed in ${file} and ${other}`]);
		assert.deepEqual(twice({ ...description }), [`layout Ym_Pump is listed in layout description #1 and ${other}`]);
	});
});
