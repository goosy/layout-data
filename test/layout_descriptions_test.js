import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { describe } from "node:test";
import { register_descriptions } from "../src/layout.js";
import { Ldata } from "../src/Ldata.js";
import { get_layout } from "../src/registry.js";

const dir = mkdtempSync(join(tmpdir(), "tlms-descriptions-"));
let seq = 0;

function write(text) {
	const file = join(dir, `description_${++seq}.yaml`);
	writeFileSync(file, text);
	return file;
}

function errors_of(descriptions) {
	try {
		register_descriptions(descriptions);
	} catch (error) {
		return error.errors;
	}
	assert.fail("the descriptions were accepted");
}

const COMMON = `
status_bits:
  - { name: run, type: Bool, offset: 8, init_value: true }
  - { name: fault, type: Bool, offset: 0 }
`;

const layout_text = (name) => `
layouts:
  ${name}:
    - { name: id, type: UInt, offset: 0, init_value: 3 }
    - { name: status, type: Word, offset: 16, coupling: status_bits }
`;

describe("6.4 several descriptions", () => {
	test("a layout names a fragment of another file, whatever the order of the files", () => {
		const common = write(COMMON);
		const pump = write(layout_text("Ms_Pump"));
		const valve = write(layout_text("Ms_Valve"));
		const { layouts, fragments } = register_descriptions([pump, valve, common]);
		assert.deepEqual(Object.keys(layouts), ["Ms_Pump", "Ms_Valve"]);
		assert.equal(fragments.status_bits.length, 2);
		assert.equal(new Ldata("Ms_Pump", "p").status, 0x0001);
		const other = register_descriptions([write(COMMON.replace("status_bits", "bits")), write(layout_text("Ms_Late").replace("status_bits", "bits"))]);
		assert.equal(new Ldata(other.layouts.Ms_Late, "t").status, 0x0001);
	});

	test("description files and description objects can be mixed", () => {
		const common = write(COMMON);
		const { layouts } = register_descriptions([
			common,
			{ layouts: { Ms_Mixed: [{ name: "w", type: "Word", offset: 0, coupling: "status_bits" }] } },
		]);
		assert.equal(layouts.Ms_Mixed, get_layout("Ms_Mixed"));
		assert.equal(new Ldata("Ms_Mixed", "t").w, 0x0001);
	});

	test("one description can be given as itself, not in a list", () => {
		const { layouts } = register_descriptions({ layouts: { Ms_Single: [{ name: "a", type: "UInt", offset: 0, init_value: 1 }] } });
		assert.equal(layouts.Ms_Single.size, 2);
	});

	test("the layouts key is optional in a description, but some description must define a layout", () => {
		assert.deepEqual(errors_of([write(COMMON)]), ["no layout is defined in the descriptions"]);
		assert.deepEqual(errors_of([{}]), ["no layout is defined in the descriptions"]);
	});

	test("the same fragment or layout in two descriptions is an error naming both", () => {
		const first = write(COMMON + layout_text("Ms_Dup"));
		const second = write(COMMON.replace("run", "go") + layout_text("Ms_Dup").replace("Ms_Dup", "Ms_Dup"));
		const errors = errors_of([first, second]);
		assert.equal(errors.length, 2, errors.join("\n"));
		assert.ok(errors.includes(`fragment status_bits is defined in ${first} and ${second}`), errors.join("\n"));
		assert.ok(errors.includes(`layout Ms_Dup is defined in ${first} and ${second}`), errors.join("\n"));
		assert.throws(() => get_layout("Ms_Dup"), /unknown layout Ms_Dup/);
	});

	test("objects are named by their position in the list", () => {
		const errors = errors_of([
			{ layouts: { Ms_O: [{ name: "a", type: "UInt", offset: 0, init_value: 0 }] } },
			{ layouts: { Ms_O: [{ name: "a", type: "UInt", offset: 0, init_value: 0 }] } },
		]);
		assert.deepEqual(errors, ["layout Ms_O is defined in layout description #1 and layout description #2"]);
	});

	test("every problem of every description is reported, and nothing is registered", () => {
		const errors = errors_of([
			join(dir, "absent.yaml"),
			{ layouts: [] },
			42,
			[["nested"]],
			null,
			{ layouts: { Ms_Not_Registered: [{ name: "a", type: "UInt", offset: 0, init_value: 0 }] } },
		]);
		assert.equal(errors.length, 5, errors.join("\n"));
		assert.throws(() => get_layout("Ms_Not_Registered"), /unknown layout/);
	});

	test("an empty list is an error", () => {
		assert.deepEqual(errors_of([]), ["no description is given"]);
	});

	test("the descriptions are not changed", () => {
		const description = { layouts: { Ms_Pure: [{ name: "w", type: "Word", offset: 0, coupling: "bits" }] }, bits: [{ name: "b", type: "Bool", offset: 0 }] };
		const before = structuredClone(description);
		register_descriptions([description]);
		assert.deepEqual(description, before);
	});
});
