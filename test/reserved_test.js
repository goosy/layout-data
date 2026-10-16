import { one_tag } from "./share.js";
import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { TData } from "../src/TData.js";
import { RESERVED_EVENTS, is_reserved_name } from "../src/reserved.js";

/** The string names found on an object and along its prototype chain. */
function member_names(object) {
	const names = new Set();
	for (let o = object; o !== null; o = Object.getPrototypeOf(o)) {
		for (const name of Object.getOwnPropertyNames(o)) names.add(name);
	}
	return names;
}

describe("2.10 reserved names", () => {
	test("every name on a data block is reserved, except the tags", () => {
		const data = one_tag("Int", 0);
		const missing = [...member_names(data)].filter((name) => name !== "tag" && !is_reserved_name(name));
		assert.deepEqual(missing, [], "extend RESERVED_NAMES in src/reserved.js");
	});

	test("the members listed in the specification are reserved", () => {
		const members = ["name", "layout", "size", "get", "transaction",
			"read_bytes", "write_bytes", "write_bit", "load_tag", "store_tag"];
		const data = one_tag("Int", 0);
		for (const name of members) {
			assert.ok(name in data, name);
			assert.ok(is_reserved_name(name), name);
		}
	});

	test("a tag name is not reserved because of the Node.js version", () => {
		for (const name of ["buffer", "detect", "pressure", "id", "length"]) assert.equal(is_reserved_name(name), false, name);
	});

	test("the check is not a public static method of TData", () => {
		assert.equal(TData.is_reserved_name, undefined);
	});

	test("the reserved event names are change, write, access and read", () => {
		assert.deepEqual([...RESERVED_EVENTS], ["change", "write", "access", "read"]);
	});

	test("an event of the user's own is delivered to its listeners", () => {
		const data = one_tag("Int", 0);
		const seen = [];
		data.on("alarm", (level) => seen.push(level));
		data.once("alarm", (level) => seen.push(`once ${level}`));
		data.emit("alarm", 3);
		data.emit("alarm", 4);
		assert.deepEqual(seen, [3, "once 3", 4]);
		assert.equal(data.off("alarm", () => {}), data);
	});
});
