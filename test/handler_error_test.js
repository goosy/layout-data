import { make_struct } from "./share.js";
import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { TData } from "../src/TData.js";
import { register_layout } from "../src/layout.js";

const LAYOUT = register_layout(make_struct([
	{ name: "a", type: "UInt", offset: 0, length: 16, init_value: 0 },
	{ name: "b", type: "UInt", offset: 16, length: 16, init_value: 0 },
	{ name: "c", type: "UInt", offset: 32, length: 16, init_value: 0 },
], "HANDLER_ERRORS"));

const create = () => new TData(LAYOUT, "d");

describe("4.4 exceptions thrown by handlers", () => {
	test("the first exception is thrown after every event is dispatched, and the value stands", () => {
		const data = create();
		const seen = [];
		data.on("change", (name) => {
			seen.push(name);
			if (name === "a") throw new Error("first");
			if (name === "b") throw new Error("second");
		});
		data.on("write", () => seen.push("write"));
		assert.throws(() => data.transaction(() => {
			data.a = 1;
			data.b = 2;
			data.c = 3;
		}), /first/);
		assert.deepEqual(seen, ["a", "b", "c", "write"]);
		assert.deepEqual([data.a, data.b, data.c], [1, 2, 3]);
	});

	test("the later listeners of the same event and the tag listeners are still called", () => {
		const data = create();
		const seen = [];
		data.on("change", () => { throw new Error("bad"); });
		data.on("change", () => seen.push("second listener"));
		data.get("a").on("change", (old_value, new_value) => seen.push(["tag", old_value, new_value]));
		data.on("write", () => { throw new Error("bad write listener"); });
		data.on("write", () => seen.push("write"));
		assert.throws(() => { data.a = 5; }, /bad$/);
		assert.deepEqual(seen, ["second listener", ["tag", 0, 5], "write"]);
	});

	test("an event is not lost: the next write reports only its own change", () => {
		const data = create();
		const seen = [];
		let fail = true;
		data.on("change", (name, old_value, new_value) => {
			seen.push([name, old_value, new_value]);
			if (fail) throw new Error("once");
		});
		assert.throws(() => { data.a = 1; }, /once/);
		fail = false;
		data.b = 2;
		assert.deepEqual(seen, [["a", 0, 1], ["b", 0, 2]]);
	});

	test("write is emitted although the statement throws", () => {
		const data = create();
		let writes = 0;
		data.on("write", () => writes++);
		data.on("change", () => { throw new Error("x"); });
		assert.throws(() => { data.a = 1; }, /x/);
		assert.throws(() => data.write_bytes(0, Uint8Array.of(0, 9)), /x/);
		assert.throws(() => data.load_tag("a", Uint8Array.of(0, 3, 0, 0, 0, 0), "BE"), /x/);
		assert.equal(writes, 3);
	});

	test("an exception of a write listener alone is thrown too", () => {
		const data = create();
		data.on("write", () => { throw new TypeError("in write"); });
		assert.throws(() => { data.a = 1; }, TypeError);
		assert.equal(data.a, 1);
	});

	test("once listeners are removed as usual", () => {
		const data = create();
		let calls = 0;
		data.once("change", () => {
			calls++;
			throw new Error("once");
		});
		assert.throws(() => { data.a = 1; }, /once/);
		data.a = 2;
		assert.equal(calls, 1);
	});

	test("a write in a handler is ordinary: its exception goes into the handler", () => {
		const data = create();
		const seen = [];
		data.on("change", (name) => {
			seen.push(name);
			if (name === "a") data.b = 1;
		});
		data.get("b").on("change", () => { throw new Error("tag b"); });
		assert.throws(() => { data.a = 1; }, /tag b/);
		assert.deepEqual(seen, ["a", "b"]);
		assert.equal(data.b, 1);
	});

	test("changes that do not settle are thrown after the events, with write", () => {
		const data = create();
		let writes = 0;
		data.on("write", () => writes++);
		data.on("change", (name, _old, value) => {
			if (name === "a") data.a = value + 1;
		});
		assert.throws(() => { data.a = 1; }, /do not settle after 16 rounds/);
		assert.ok(writes >= 1);
	});

	test("a rolled back transaction emits nothing, whatever the handlers do", () => {
		const data = create();
		const seen = [];
		data.on("change", () => seen.push("change"));
		data.on("write", () => seen.push("write"));
		assert.throws(() => data.transaction(() => {
			data.a = 1;
			throw new Error("fn");
		}), /fn/);
		assert.deepEqual(seen, []);
		assert.equal(data.a, 0);
	});
});
