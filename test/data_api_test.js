// The TData / TTag programming interface, section by section of
// doc/spec-data-api.md.
import { make_struct } from "./share.js";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test, { describe } from "node:test";
import { TData } from "../src/TData.js";
import { TTag } from "../src/TTag.js";
import { register_layout } from "../src/layout.js";
import { layout_of } from "../src/registry.js";

// the word gives no init value: it is composed from its bits
const ITEMS = [
	{ name: "id", type: "UInt", offset: 0, length: 16, init_value: 7 },
	{
		name: "status", type: "Word", offset: 16, length: 16,
		coupling: [
			{ name: "run", type: "Bool", offset: 8, length: 1, init_value: true },
			{ name: "alarm", type: "Bool", offset: 0, length: 1 },
		],
	},
	{ name: "pressure", type: "Real", offset: 32, length: 32, init_value: 1.5 },
];
const LAYOUT = register_layout(make_struct(ITEMS, "SAMPLE"));

const record = (data) => {
	const events = [];
	data.on("change", (name, old_value, new_value) => events.push([name, old_value, new_value]));
	return events;
};

describe("2 TData", () => {
	test("2.1 a new data block holds the init values, without events", () => {
		const data = new TData(LAYOUT, "d");
		assert.equal(data.id, 7);
		assert.equal(data.run, true);
		assert.equal(data.alarm, false);
		assert.equal(data.status, 0x0001);
		assert.equal(data.pressure, 1.5);
		const events = record(data);
		data.detect();
		assert.deepEqual(events, []);
	});

	test("2.1 a data block is an instance of the class of its layout, a subclass of TData", () => {
		const data = new TData(LAYOUT, "d");
		assert.ok(data instanceof TData);
		assert.notEqual(Object.getPrototypeOf(data), TData.prototype);
		assert.equal(Object.getPrototypeOf(new TData(LAYOUT, "e")), Object.getPrototypeOf(data));
	});

	test("2.1 the same layout registered again is the registered one; another one under the name throws", () => {
		assert.equal(register_layout(make_struct(ITEMS, "SAMPLE")), LAYOUT);
		const changed = structuredClone(ITEMS);
		changed[0].init_value = 8;
		assert.throws(() => register_layout(make_struct(changed, "SAMPLE")), /another layout is already named SAMPLE/);
	});

	test("2.1 a layout name stands for the registered layout", () => {
		const data = new TData("SAMPLE", "d");
		assert.equal(data.layout, LAYOUT);
		assert.equal(Object.getPrototypeOf(data), Object.getPrototypeOf(new TData(LAYOUT, "e")));
		assert.equal(layout_of("SAMPLE"), LAYOUT);
		assert.throws(() => new TData("NOPE", "d"), /unknown layout NOPE/);
		assert.throws(() => layout_of("NOPE"), /unknown layout NOPE/);
	});

	test("2.1 a layout that is not the registered one throws", () => {
		assert.throws(() => new TData({}, "d"), /is not a registered layout/);
		assert.throws(() => new TData({ ...LAYOUT }, "d"), /SAMPLE is not a registered layout/);
	});

	test("2.2 properties", () => {
		const data = new TData(LAYOUT, "d");
		assert.equal(data.name, "d");
		assert.equal(data.layout, LAYOUT);
		assert.equal(data.size, 8);
		assert.equal(data.buffer.length, 8);
	});

	test("2.2 the tag accessors sit once on the prototype of the class of the layout", () => {
		const data = new TData(LAYOUT, "a");
		const other = new TData(LAYOUT, "b");
		const proto = Object.getPrototypeOf(data);
		assert.equal(Object.getPrototypeOf(other), proto);
		assert.equal(data.constructor, other.constructor);
		assert.ok(data instanceof TData);
		for (const name of ["id", "status", "run", "alarm", "pressure"]) {
			assert.equal(Object.hasOwn(data, name), false, name);
			const desc = Object.getOwnPropertyDescriptor(proto, name);
			assert.ok(desc?.get && desc.set, name);
			assert.equal(desc.enumerable, true);
			assert.equal(desc.configurable, false);
		}
		data.pressure = 2.5;
		assert.equal(other.pressure, 1.5); // the buffers stay separate
	});

	test("2.2 name is writable; layout, size and buffer are read-only, the buffer contents writable", () => {
		const data = new TData(LAYOUT, "d");
		data.name = "renamed";
		assert.equal(data.name, "renamed");
		const { buffer } = data;
		// ES modules run in strict mode: assigning a getter-only property throws
		assert.throws(() => { data.layout = null; }, TypeError);
		assert.throws(() => { data.size = 1; }, TypeError);
		assert.throws(() => { data.buffer = Buffer.alloc(8); }, TypeError);
		assert.equal(data.buffer, buffer);
		data.buffer.writeUInt16BE(9, 0);
		assert.equal(data.id, 9);
	});

	test("2.3 a write takes effect at once, for the data block and its TTag", () => {
		const data = new TData(LAYOUT, "d");
		data.pressure = 2.5;
		assert.equal(data.pressure, 2.5);
		assert.equal(data.get("pressure").value, 2.5);
	});

	test("2.3 a combined word and its bits follow each other", () => {
		const data = new TData(LAYOUT, "d");
		data.alarm = true;
		assert.equal(data.status, 0x0101);
		data.status = 0x0100;
		assert.equal(data.run, false);
		assert.equal(data.alarm, true);
	});

	test("2.3 coupling offset 8..15 is the low byte of the word, 0..7 the high byte", () => {
		const data = new TData(LAYOUT, "d");
		data.status = 0;
		data.alarm = true; // offset 0: bit 8 of the word
		assert.equal(data.status, 0x0100);
		assert.deepEqual([...data.buffer.subarray(2, 4)], [0x01, 0x00]);
		data.run = true; // offset 8: bit 0 of the word
		assert.equal(data.status, 0x0101);
	});

	test("2.3 an out-of-range integer throws RangeError and keeps the value; a Bool takes truthiness", () => {
		const data = new TData(LAYOUT, "d");
		assert.throws(() => { data.id = -1; }, RangeError);
		assert.equal(data.id, 7);
		data.alarm = 1;
		assert.equal(data.alarm, true);
	});

	test("2.4 get() returns the same TTag for a name, undefined for an unknown one", () => {
		const data = new TData(LAYOUT, "d");
		assert.ok(data.get("id") instanceof TTag);
		assert.equal(data.get("id"), data.get("id"));
		assert.equal(data.get("nope"), undefined);
	});

	test("2.6 detect() reports a direct write of the buffer", () => {
		const data = new TData(LAYOUT, "d");
		const events = record(data);
		data.buffer.writeUInt16BE(9, 0);
		assert.deepEqual(events, []);
		data.detect();
		assert.deepEqual(events, [["id", 7, 9]]);
	});
});

describe("3 TTag", () => {
	test("members describe the tag", () => {
		const tag = new TData(LAYOUT, "d").get("pressure");
		assert.equal(tag.name, "pressure");
		assert.equal(tag.type, "real");
		assert.equal(tag.length, 4);
	});

	test("value is readable and writable, the same as the data block property", () => {
		const data = new TData(LAYOUT, "d");
		const tag = data.get("id");
		const events = record(data);
		const tag_events = [];
		tag.on("change", (...args) => tag_events.push(args));
		tag.value = 12;
		assert.equal(tag.value, 12);
		assert.equal(data.id, 12);
		assert.deepEqual(events, [["id", 7, 12]]);
		assert.deepEqual(tag_events, [[7, 12]]);
		assert.throws(() => { tag.value = 70000; }, RangeError);
		assert.equal(tag.value, 12);
	});
});

describe("4.3 changes and events", () => {
	test("every source of change is reported: property, TTag, direct buffer write", () => {
		const data = new TData(LAYOUT, "d");
		const events = record(data);
		data.id = 1;
		data.get("id").value = 2;
		data.buffer.writeUInt16BE(3, 0);
		data.detect();
		assert.deepEqual(events, [["id", 7, 1], ["id", 1, 2], ["id", 2, 3]]);
	});

	test("events come after the new value is applied, only on a real change", () => {
		const data = new TData(LAYOUT, "d");
		const seen = [];
		data.on("change", (name) => seen.push([name, data[name]]));
		data.id = 7;
		data.pressure = Number.NaN;
		data.pressure = Number.NaN;
		assert.deepEqual(seen.map(([name]) => name), ["pressure"]);
		assert.ok(Number.isNaN(seen[0][1]));
	});

	test("a combined word and its changed bits each emit, in layout order, data block before TTag", () => {
		const data = new TData(LAYOUT, "d");
		const order = [];
		data.on("change", (name) => order.push(`data:${name}`));
		data.get("alarm").on("change", () => order.push("tag:alarm"));
		data.get("status").on("change", () => order.push("tag:status"));
		data.alarm = true;
		assert.deepEqual(order, ["data:status", "tag:status", "data:alarm", "tag:alarm"]);
	});

	test("a handler may write any tag; that change follows the current changes", () => {
		const data = new TData(LAYOUT, "d");
		const events = record(data);
		data.get("id").on("change", () => { data.alarm = true; });
		data.id = 8;
		assert.deepEqual(events, [["id", 7, 8], ["status", 1, 0x0101], ["alarm", false, true]]);
	});

	test("handlers triggering each other without end throw after 16 rounds; no change is lost", () => {
		const data = new TData(LAYOUT, "d");
		const ping = () => { data.id += 1; };
		data.get("id").on("change", ping);
		assert.throws(() => { data.id = 0; }, /do not settle after 16 rounds/);
		data.get("id").off("change", ping);
		const events = record(data);
		data.detect();
		assert.equal(events.length, 1);
		assert.equal(events[0][0], "id");
	});
});

describe("4.2 detection after a write", () => {
	test("the events of a write are emitted before the write returns", () => {
		const data = new TData(LAYOUT, "d");
		const events = record(data);
		data.pressure = 3;
		assert.deepEqual(events, [["pressure", 1.5, 3]]);
	});

	test("write is emitted after every write, once its change events are emitted", () => {
		const calls = [];
		const data = new TData(LAYOUT, "d");
		data.on("write", (d) => calls.push([d, d.pressure]));
		data.on("change", (name) => calls.push(name));
		data.pressure = 3;
		data.pressure = 3; // unchanged: no event, but still a write
		assert.deepEqual(calls, ["pressure", [data, 3], [data, 3]]);
	});
});

describe("2.5 raw writes of words and double words", () => {
	test("write_words writes big-endian words from an even offset and detects the change", () => {
		const data = new TData(LAYOUT, "d");
		const events = record(data);
		data.write_words(0, [10, 0x1234]);
		assert.deepEqual([...data.buffer.subarray(0, 4)], [0, 10, 0x12, 0x34]);
		assert.equal(data.id, 10);
		assert.deepEqual(events[0], ["id", 7, 10]);
		assert.equal(data.status, 0x1234);
	});

	test("write_dwords writes big-endian double words from an even offset", () => {
		const data = new TData(LAYOUT, "d");
		data.write_dwords(2, new Uint32Array([0x01020304]));
		assert.deepEqual([...data.buffer.subarray(2, 6)], [1, 2, 3, 4]);
	});

	test("an odd offset or a run past the end throws and writes nothing", () => {
		const data = new TData(LAYOUT, "d");
		const before = Buffer.from(data.buffer);
		assert.throws(() => data.write_words(1, [1]), RangeError);
		assert.throws(() => data.write_dwords(3, [1]), RangeError);
		assert.throws(() => data.write_words(data.size - 2, [1, 2]), RangeError);
		assert.throws(() => data.write_dwords(data.size - 2, [1]), RangeError);
		assert.deepEqual(data.buffer, before);
	});
});

describe("4.2 transactions", () => {
	const create = () => {
		const writes = [];
		const data = new TData(LAYOUT, "d");
		data.on("write", (d) => writes.push(d));
		return { data, writes, events: record(data) };
	};

	test("writes take effect at once, events come at the commit, write once after the changes", () => {
		const { data, writes, events } = create();
		const order = [];
		data.on("change", () => order.push("change"));
		data.on("write", () => order.push("write"));
		const result = data.transaction(() => {
			data.id = 9;
			data.get("pressure").value = 2;
			data.write_words(0, [10]);
			assert.equal(data.id, 10);
			assert.deepEqual(events, []);
			assert.deepEqual(writes, []);
			return "done";
		});
		assert.equal(result, "done");
		assert.deepEqual(events, [["id", 7, 10], ["pressure", 1.5, 2]]);
		assert.equal(writes.length, 1);
		assert.deepEqual(order, ["change", "change", "write"]);
	});

	test("writes in a transaction are merged; a value changed and restored emits no change but still a write", () => {
		const { data, writes, events } = create();
		data.transaction(() => {
			data.id = 1;
			data.id = 2;
			data.run = false;
			data.run = true;
		});
		assert.deepEqual(events, [["id", 7, 2]]);
		assert.equal(writes.length, 1);
		events.length = 0;
		data.transaction(() => {
			data.id = 5;
			data.id = 2;
		});
		assert.deepEqual(events, []);
		assert.equal(writes.length, 2);
	});

	test("direct writes to the buffer are detected at the commit and emit no write", () => {
		const { data, writes, events } = create();
		data.transaction(() => { data.buffer.writeUInt16BE(0x1234, 0); });
		assert.deepEqual(events, [["id", 7, 0x1234]]);
		assert.deepEqual(writes, []);
	});

	test("a transaction without a write emits nothing", () => {
		const { data, writes, events } = create();
		assert.equal(data.transaction(() => data.id), 7);
		assert.deepEqual(events, []);
		assert.deepEqual(writes, []);
	});

	test("a throwing function rolls back the buffer, emits nothing and rethrows", () => {
		const { data, writes, events } = create();
		const before = Buffer.from(data.buffer);
		assert.throws(() => data.transaction(() => {
			data.id = 9;
			data.buffer[7] = 0xff;
			throw new RangeError("boom");
		}), /boom/);
		assert.deepEqual(data.buffer, before);
		assert.deepEqual(events, []);
		assert.deepEqual(writes, []);
		data.detect();
		assert.deepEqual(events, []);
		data.id = 8; // the data block works normally afterwards
		assert.deepEqual(events, [["id", 7, 8]]);
	});

	test("a failing write rolls back when the function does not handle it, not when it does", () => {
		const { data, events } = create();
		assert.throws(() => data.transaction(() => {
			data.id = 3;
			data.id = 70000;
		}), RangeError);
		assert.equal(data.id, 7);
		data.transaction(() => {
			data.id = 3;
			try { data.id = 70000; } catch { /* handled */ }
		});
		assert.deepEqual(events, [["id", 7, 3]]);
	});

	test("a change made by writing the buffer before the transaction is still reported by the next detection", () => {
		const { data, events } = create();
		data.buffer.writeUInt16BE(4, 0);
		assert.throws(() => data.transaction(() => {
			data.id = 9;
			throw new Error("x");
		}));
		assert.equal(data.id, 4);
		data.detect();
		assert.deepEqual(events, [["id", 7, 4]]);
	});

	test("detect() and a nested transaction throw inside a transaction, and roll it back if unhandled", () => {
		const { data, events } = create();
		assert.throws(() => data.transaction(() => {
			data.id = 9;
			data.detect();
		}), /not allowed in a transaction/);
		assert.throws(() => data.transaction(() => {
			data.id = 9;
			data.transaction(() => {});
		}), /already open/);
		assert.equal(data.id, 7);
		assert.deepEqual(events, []);
		data.detect(); // the transaction is closed
	});

	test("the function returning a Promise is not inspected: the transaction ends at once", () => {
		const { data, events } = create();
		const result = data.transaction(async () => { data.id = 9; });
		assert.ok(result instanceof Promise);
		assert.deepEqual(events, [["id", 7, 9]]);
	});

	test("events come after the transaction is closed: handlers write and open transactions as usual", () => {
		const { data, writes, events } = create();
		data.get("id").on("change", () => {
			data.transaction(() => { data.alarm = true; });
		});
		data.transaction(() => { data.id = 8; });
		assert.deepEqual(events, [["id", 7, 8], ["status", 1, 0x0101], ["alarm", false, true]]);
		assert.equal(writes.length, 2);
	});

	test("a handler throwing at the commit propagates; the transaction stays committed", () => {
		const { data } = create();
		data.on("change", () => { throw new Error("handler"); });
		assert.throws(() => data.transaction(() => { data.id = 8; }), /handler/);
		assert.equal(data.id, 8);
	});

	test("a write to another data block in a transaction emits its events as usual", () => {
		const { data } = create();
		const other = new TData(LAYOUT, "o");
		const other_events = record(other);
		assert.throws(() => data.transaction(() => {
			other.id = 1;
			throw new Error("x");
		}));
		assert.deepEqual(other_events, [["id", 7, 1]]);
		assert.equal(other.id, 1);
	});
});

describe("5 errors", () => {
	test("a tag name colliding with a data block member throws at creation", () => {
		const struct = make_struct([{ name: "detect", type: "UInt", offset: 0, length: 16, init_value: 0 }], "BAD");
		assert.throws(() => new TData(register_layout(struct), "d"), /collides with a TData member/);
	});
});
