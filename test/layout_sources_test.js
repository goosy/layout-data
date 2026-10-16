import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { describe } from "node:test";
import { register_sources } from "../src/layout.js";
import { TData } from "../src/TData.js";
import { get_layout } from "../src/registry.js";

const dir = mkdtempSync(join(tmpdir(), "tlms-sources-"));
let seq = 0;

function write(text) {
	const file = join(dir, `source_${++seq}.yaml`);
	writeFileSync(file, text);
	return file;
}

function errors_of(sources) {
	try {
		register_sources(sources);
	} catch (error) {
		return error.errors;
	}
	assert.fail("the sources were accepted");
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

describe("6.4 several sources", () => {
	test("a layout names a fragment of another file, whatever the order of the files", () => {
		const common = write(COMMON);
		const pump = write(layout_text("MS_PUMP"));
		const valve = write(layout_text("MS_VALVE"));
		const { layouts, fragments } = register_sources([pump, valve, common]);
		assert.deepEqual(Object.keys(layouts), ["MS_PUMP", "MS_VALVE"]);
		assert.equal(fragments.status_bits.length, 2);
		assert.equal(new TData("MS_PUMP", "p").status, 0x0001);
		const other = register_sources([write(COMMON.replace("status_bits", "bits")), write(layout_text("MS_LATE").replace("status_bits", "bits"))]);
		assert.equal(new TData(other.layouts.MS_LATE, "t").status, 0x0001);
	});

	test("files and parsed descriptions can be mixed", () => {
		const common = write(COMMON);
		const { layouts } = register_sources([
			common,
			{ layouts: { MS_MIXED: [{ name: "w", type: "Word", offset: 0, coupling: "status_bits" }] } },
		]);
		assert.equal(layouts.MS_MIXED, get_layout("MS_MIXED"));
		assert.equal(new TData("MS_MIXED", "t").w, 0x0001);
	});

	test("one source can be given as itself, not in a list", () => {
		const { layouts } = register_sources({ layouts: { MS_SINGLE: [{ name: "a", type: "UInt", offset: 0, init_value: 1 }] } });
		assert.equal(layouts.MS_SINGLE.size, 2);
	});

	test("the layouts key is optional in a source, but some source must define a layout", () => {
		assert.deepEqual(errors_of([write(COMMON)]), ["no layout is defined in the sources"]);
		assert.deepEqual(errors_of([{}]), ["no layout is defined in the sources"]);
	});

	test("the same fragment or layout in two sources is an error naming both", () => {
		const first = write(COMMON + layout_text("MS_DUP"));
		const second = write(COMMON.replace("run", "go") + layout_text("MS_DUP").replace("MS_DUP", "MS_DUP"));
		const errors = errors_of([first, second]);
		assert.equal(errors.length, 2, errors.join("\n"));
		assert.ok(errors.includes(`fragment status_bits is defined in ${first} and ${second}`), errors.join("\n"));
		assert.ok(errors.includes(`layout MS_DUP is defined in ${first} and ${second}`), errors.join("\n"));
		assert.throws(() => get_layout("MS_DUP"), /unknown layout MS_DUP/);
	});

	test("objects are named by their position in the list", () => {
		const errors = errors_of([
			{ layouts: { MS_O: [{ name: "a", type: "UInt", offset: 0, init_value: 0 }] } },
			{ layouts: { MS_O: [{ name: "a", type: "UInt", offset: 0, init_value: 0 }] } },
		]);
		assert.deepEqual(errors, ["layout MS_O is defined in layout description #1 and layout description #2"]);
	});

	test("every problem of every source is reported, and nothing is registered", () => {
		const errors = errors_of([
			join(dir, "absent.yaml"),
			{ layouts: [] },
			42,
			[["nested"]],
			null,
			{ layouts: { MS_NOT_REGISTERED: [{ name: "a", type: "UInt", offset: 0, init_value: 0 }] } },
		]);
		assert.equal(errors.length, 5, errors.join("\n"));
		assert.throws(() => get_layout("MS_NOT_REGISTERED"), /unknown layout/);
	});

	test("an empty list is an error", () => {
		assert.deepEqual(errors_of([]), ["no source is given"]);
	});

	test("the sources are not changed", () => {
		const description = { layouts: { MS_PURE: [{ name: "w", type: "Word", offset: 0, coupling: "bits" }] }, bits: [{ name: "b", type: "Bool", offset: 0 }] };
		const before = structuredClone(description);
		register_sources([description]);
		assert.deepEqual(description, before);
	});
});
