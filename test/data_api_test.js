import { register_items } from "./share.js";
// The Ldata / Ltag programming interface, section by section of
// doc/spec-data-api.md.
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test, { describe } from "node:test";
import { Ldata } from "../src/Ldata.js";
import { Ltag } from "../src/Ltag.js";
import { get_layout } from "../src/registry.js";

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
const LAYOUT = register_items("Sample", ITEMS);

const record = (data) => {
	const events = [];
	data.on("change", (name, old_value, new_value) => events.push([name, old_value, new_value]));
	return events;
};

describe("2 Ldata", () => {
	test("2.1 a new data block holds the init values, without events", () => {
		const data = LAYOUT.create_ldata("d");
		assert.equal(data.id, 7);
		assert.equal(data.run, true);
		assert.equal(data.alarm, false);
		assert.equal(data.status, 0x0001);
		assert.equal(data.pressure, 1.5);
		const events = record(data);
		data.write_bytes(0, data.read_bytes()); // the same bytes again
		assert.deepEqual(events, []);
	});

	test("2.1 a data block is an instance of the class of its layout, a subclass of Ldata", () => {
		const data = LAYOUT.create_ldata("d");
		assert.ok(data instanceof Ldata);
		assert.notEqual(Object.getPrototypeOf(data), Ldata.prototype);
		assert.equal(Object.getPrototypeOf(LAYOUT.create_ldata("e")), Object.getPrototypeOf(data));
	});

	test("2.1 the same layout registered again is the registered one; another one under the name throws", () => {
		assert.equal(register_items("Sample", ITEMS), LAYOUT);
		const changed = structuredClone(ITEMS);
		changed[0].init_value = 8;
		assert.throws(() => register_items("Sample", changed), /another layout is already named Sample/);
	});

	test("2.1 the name of an ldata must be a string, the empty one included", () => {
		assert.equal(LAYOUT.create_ldata("").name, "");
		assert.equal(LAYOUT.create_ldata("by name").name, "by name");
		for (const name of [undefined, null, 1, {}, ["d"], Symbol("d"), true]) {
			assert.throws(() => LAYOUT.create_ldata(name), TypeError, String(name));
		}
		assert.throws(() => LAYOUT.create_ldata(), TypeError);
	});

	test("2.1 Ldata cannot be created with new, nor can the class of a layout", () => {
		const usage = /an ldata is created by its layout: layout\.create_ldata\(name\)/;
		assert.throws(() => new Ldata(LAYOUT, "d"), TypeError);
		assert.throws(() => new Ldata(LAYOUT, "d"), usage);
		assert.throws(() => new Ldata("Sample", "d"), usage);
		const data = LAYOUT.create_ldata("d");
		assert.throws(() => new data.constructor("e"), usage);
		assert.throws(() => new data.constructor(LAYOUT, "e"), usage);
	});

	test("2.7 the listener limits are fixed: 100 for an ldata, 20 for an Ltag, and setMaxListeners changes one object", () => {
		const data = LAYOUT.create_ldata("d");
		assert.equal(data.getMaxListeners(), 100);
		assert.equal(data.get("id").getMaxListeners(), 20);
		data.setMaxListeners(5);
		assert.equal(data.getMaxListeners(), 5);
		assert.equal(LAYOUT.create_ldata("e").getMaxListeners(), 100);
	});

	test("2.1 a layout got by its name is the registered one", () => {
		assert.equal(get_layout("Sample"), LAYOUT);
		const data = get_layout("Sample").create_ldata("d");
		assert.equal(data.layout, LAYOUT);
		assert.equal(Object.getPrototypeOf(data), Object.getPrototypeOf(LAYOUT.create_ldata("e")));
		assert.throws(() => get_layout("Nope"), /unknown layout Nope/);
	});

	test("2.1 a copy of a layout creates no ldata", () => {
		const copy = { ...LAYOUT };
		assert.equal(copy.create_ldata, undefined);
		assert.deepEqual(Object.keys(copy), ["name", "length", "size", "items"]);
	});

	test("2.2 properties", () => {
		const data = LAYOUT.create_ldata("d");
		assert.equal(data.name, "d");
		assert.equal(data.layout, LAYOUT);
		assert.equal(data.size, 8);
		assert.equal(data.read_bytes().length, 8);
	});

	test("2.2 the tag accessors sit once on the prototype of the class of the layout", () => {
		const data = LAYOUT.create_ldata("a");
		const other = LAYOUT.create_ldata("b");
		const proto = Object.getPrototypeOf(data);
		assert.equal(Object.getPrototypeOf(other), proto);
		assert.equal(data.constructor, other.constructor);
		assert.ok(data instanceof Ldata);
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

	test("2.2 name, layout and size are read-only; the bytes are not a property", () => {
		const data = LAYOUT.create_ldata("d");
		assert.equal(data.name, "d");
		// ES modules run in strict mode: assigning a getter-only property throws
		assert.throws(() => { data.name = "renamed"; }, TypeError);
		assert.equal(data.name, "d");
		assert.throws(() => { data.layout = null; }, TypeError);
		assert.throws(() => { data.size = 1; }, TypeError);
		for (const member of ["buffer", "detect", "after_write", "write_words", "write_dwords"]) {
			assert.equal(member in data, false, member);
		}
	});

	test("2.3 a write takes effect at once, for the data block and its Ltag", () => {
		const data = LAYOUT.create_ldata("d");
		data.pressure = 2.5;
		assert.equal(data.pressure, 2.5);
		assert.equal(data.get("pressure").value, 2.5);
	});

	test("2.3 a combined word and its bits follow each other", () => {
		const data = LAYOUT.create_ldata("d");
		data.alarm = true;
		assert.equal(data.status, 0x0101);
		data.status = 0x0100;
		assert.equal(data.run, false);
		assert.equal(data.alarm, true);
	});

	test("2.3 coupling offset 8..15 is the low byte of the word, 0..7 the high byte", () => {
		const data = LAYOUT.create_ldata("d");
		data.status = 0;
		data.alarm = true; // offset 0: bit 8 of the word
		assert.equal(data.status, 0x0100);
		assert.deepEqual([...data.read_bytes(2, 2)], [0x01, 0x00]);
		data.run = true; // offset 8: bit 0 of the word
		assert.equal(data.status, 0x0101);
	});

	test("2.3 an out-of-range integer throws RangeError and keeps the value; a Bool takes truthiness", () => {
		const data = LAYOUT.create_ldata("d");
		assert.throws(() => { data.id = -1; }, RangeError);
		assert.equal(data.id, 7);
		data.alarm = 1;
		assert.equal(data.alarm, true);
	});

	test("2.4 get() returns the same Ltag for a name, undefined for an unknown one", () => {
		const data = LAYOUT.create_ldata("d");
		assert.ok(data.get("id") instanceof Ltag);
		assert.equal(data.get("id"), data.get("id"));
		assert.equal(data.get("nope"), undefined);
	});
});

describe("3 Ltag", () => {
	test("members describe the tag", () => {
		const tag = LAYOUT.create_ldata("d").get("pressure");
		assert.equal(tag.name, "pressure");
		assert.equal(tag.type, "real");
		assert.equal(tag.size, 4);
	});

	test("value is readable and writable, the same as the data block property", () => {
		const data = LAYOUT.create_ldata("d");
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
	test("every source of change is reported: property, Ltag, raw write", () => {
		const data = LAYOUT.create_ldata("d");
		const events = record(data);
		data.id = 1;
		data.get("id").value = 2;
		data.write_bytes(0, Uint8Array.of(0, 3));
		assert.deepEqual(events, [["id", 7, 1], ["id", 1, 2], ["id", 2, 3]]);
	});

	test("events come after the new value is applied, only on a real change", () => {
		const data = LAYOUT.create_ldata("d");
		const seen = [];
		data.on("change", (name) => seen.push([name, data[name]]));
		data.id = 7;
		data.pressure = Number.NaN;
		data.pressure = Number.NaN;
		assert.deepEqual(seen.map(([name]) => name), ["pressure"]);
		assert.ok(Number.isNaN(seen[0][1]));
	});

	test("a combined word and its changed bits each emit, in layout order, data block before Ltag", () => {
		const data = LAYOUT.create_ldata("d");
		const order = [];
		data.on("change", (name) => order.push(`data:${name}`));
		data.get("alarm").on("change", () => order.push("tag:alarm"));
		data.get("status").on("change", () => order.push("tag:status"));
		data.alarm = true;
		assert.deepEqual(order, ["data:status", "tag:status", "data:alarm", "tag:alarm"]);
	});

	test("a handler may write any tag; that change follows the current changes", () => {
		const data = LAYOUT.create_ldata("d");
		const events = record(data);
		data.get("id").on("change", () => { data.alarm = true; });
		data.id = 8;
		assert.deepEqual(events, [["id", 7, 8], ["status", 1, 0x0101], ["alarm", false, true]]);
	});

	test("handlers triggering each other without end throw after 16 rounds; no change is lost", () => {
		const data = LAYOUT.create_ldata("d");
		const ping = () => { data.id += 1; };
		data.get("id").on("change", ping);
		assert.throws(() => { data.id = 0; }, /do not settle after 16 rounds/);
		data.get("id").off("change", ping);
		const events = record(data);
		data.pressure = 2; // the next write reports the change left over
		assert.deepEqual(events.map(([name]) => name), ["id", "pressure"]);
	});
});

describe("4.2 detection after a write", () => {
	test("the events of a write are emitted before the write returns", () => {
		const data = LAYOUT.create_ldata("d");
		const events = record(data);
		data.pressure = 3;
		assert.deepEqual(events, [["pressure", 1.5, 3]]);
	});

	test("write is emitted after every write, once its change events are emitted", () => {
		const calls = [];
		const data = LAYOUT.create_ldata("d");
		data.on("write", (d) => calls.push([d, d.pressure]));
		data.on("change", (name) => calls.push(name));
		data.pressure = 3;
		data.pressure = 3; // unchanged: no event, but still a write
		assert.deepEqual(calls, ["pressure", [data, 3], [data, 3]]);
	});
});

describe("2.5 raw reads and writes", () => {
	test("read_bytes returns a copy; by default the whole block, or from an offset to the end", () => {
		const data = LAYOUT.create_ldata("d");
		assert.deepEqual([...data.read_bytes()], [0, 7, 0, 1, 0x3f, 0xc0, 0, 0]);
		assert.deepEqual([...data.read_bytes(4)], [0x3f, 0xc0, 0, 0]);
		assert.deepEqual([...data.read_bytes(2, 2)], [0, 1]);
		assert.equal(data.read_bytes(8).length, 0);
		const copy = data.read_bytes();
		assert.ok(Buffer.isBuffer(copy));
		copy.fill(0xff);
		assert.equal(data.id, 7);
		assert.deepEqual([...data.read_bytes(0, 2)], [0, 7]);
	});

	test("write_bytes writes the bytes at a byte offset; the tags that own them change and emit", () => {
		const data = LAYOUT.create_ldata("d");
		const events = record(data);
		const writes = [];
		data.on("write", (d) => writes.push(d));
		data.write_bytes(0, Buffer.from([0, 10, 0x12, 0x34]));
		assert.deepEqual([...data.read_bytes(0, 4)], [0, 10, 0x12, 0x34]);
		assert.equal(data.id, 10);
		assert.equal(data.status, 0x1234);
		assert.deepEqual(events.map(([name]) => name), ["id", "status", "run"]);
		assert.equal(writes.length, 1);
	});

	test("write_bytes takes any Uint8Array, and a write need not align with tags", () => {
		const data = LAYOUT.create_ldata("d");
		const events = record(data);
		data.write_bytes(5, Uint8Array.of(0xc1)); // the middle of pressure
		assert.deepEqual(events.map(([name]) => name), ["pressure"]);
		assert.deepEqual([...data.read_bytes(4, 4)], [0x3f, 0xc1, 0, 0]);
	});

	test("write_bit changes only the masked bits", () => {
		const data = LAYOUT.create_ldata("d");
		const events = record(data);
		data.write_bit(3, 0x80, true);
		assert.deepEqual([...data.read_bytes(2, 2)], [0, 0x81]);
		data.write_bit(3, 0x81, false);
		assert.deepEqual([...data.read_bytes(2, 2)], [0, 0]);
		data.write_bit(3, 0x01, 1); // truthiness
		assert.equal(data.run, true);
		assert.deepEqual(events.map(([name]) => name), ["status", "status", "run", "status", "run"]);
	});

	test("read_bit tells whether any of the masked bits is set", () => {
		const data = LAYOUT.create_ldata("d");
		data.write_bit(3, 0x81, true);
		assert.equal(data.read_bit(3, 0x01), true);
		assert.equal(data.read_bit(3, 0x02), false);
		assert.equal(data.read_bit(3, 0x82), true);
		assert.equal(data.read_bit(3, 0x7e), false);
		assert.equal(data.read_bit(2, 0xff), false);
	});

	test("every raw write emits write, also one that changes nothing; a read does not", () => {
		const data = LAYOUT.create_ldata("d");
		let writes = 0;
		data.on("write", () => writes++);
		data.write_bytes(0, data.read_bytes(0, 2));
		data.write_bit(3, 0x01, true);
		data.read_bytes();
		data.read_bit(3, 0x01);
		assert.equal(writes, 2);
	});

	test("an empty write_bytes writes nothing and emits no write, but its range is still checked", () => {
		const data = LAYOUT.create_ldata("d");
		let writes = 0;
		data.on("write", () => writes++);
		data.write_bytes(0, new Uint8Array(0));
		data.write_bytes(8, new Uint8Array(0)); // the end of the block
		assert.equal(writes, 0);
		assert.throws(() => data.write_bytes(9, new Uint8Array(0)), RangeError);
		data.transaction(() => { data.write_bytes(0, new Uint8Array(0)); });
		assert.equal(writes, 0);
	});

	test("a bad range, mask or source throws, changes nothing and emits no write", () => {
		const data = LAYOUT.create_ldata("d");
		const before = data.read_bytes();
		let writes = 0;
		data.on("write", () => writes++);
		for (const [offset, length] of [[-1, 1], [1.5, 1], [9, 0], [0, 9], [8, 1], [4, -1], [0, 1.5], ["0", 1]]) {
			assert.throws(() => data.read_bytes(offset, length), RangeError, `${offset}, ${length}`);
		}
		assert.throws(() => data.write_bytes(7, Uint8Array.of(1, 2)), RangeError);
		assert.throws(() => data.write_bytes(-1, Uint8Array.of(1)), RangeError);
		assert.throws(() => data.write_bytes(0.5, Uint8Array.of(1)), RangeError);
		assert.throws(() => data.write_bytes(0, [1, 2]), TypeError);
		assert.throws(() => data.write_bit(8, 0x01, true), RangeError);
		assert.throws(() => data.write_bit(-1, 0x01, true), RangeError);
		assert.throws(() => data.read_bit(8, 0x01), RangeError);
		assert.throws(() => data.read_bit(-1, 0x01), RangeError);
		for (const mask of [0, 0x100, -1, 1.5, "1", Number.NaN]) {
			assert.throws(() => data.write_bit(0, mask, true), RangeError, String(mask));
			assert.throws(() => data.read_bit(0, mask), RangeError, String(mask));
		}
		assert.deepEqual(data.read_bytes(), before);
		assert.equal(writes, 0);
	});
});

describe("2.9 device byte order", () => {
	// io image of Sample in LEBS: id (2 bytes) as is, status, pressure 1.5 = 3f c0 00 00 as CDAB
	const io_image = () => Uint8Array.of(0x00, 0x09, 0x00, 0x03, 0x00, 0x00, 0x3f, 0xc0);

	test("load_tag converts a tag from the IO buffer, as a write: change, then write", () => {
		const data = LAYOUT.create_ldata("d");
		const events = record(data);
		const order = [];
		data.on("write", () => order.push("write"));
		data.on("change", () => order.push("change"));
		data.load_tag("pressure", io_image(), "LEBS");
		assert.equal(data.pressure, 1.5);
		data.load_tag("id", io_image(), "LEBS");
		assert.equal(data.id, 9);
		assert.deepEqual(events, [["id", 7, 9]]);
		assert.deepEqual(order, ["write", "change", "write"]);
	});

	test("load_tag works on a plain Uint8Array, with every byte order", () => {
		for (const [endian, bytes] of [["BE", [0x12, 0x34]], ["LE", [0x34, 0x12]], ["BEBS", [0x34, 0x12]], ["LEBS", [0x12, 0x34]]]) {
			const data = LAYOUT.create_ldata("d");
			const io = new Uint8Array(8);
			io.set(bytes, 2);
			data.load_tag("status", io, endian);
			assert.equal(data.status, 0x1234, endian);
		}
	});

	test("load_tag of a Bool changes only its own bit", () => {
		const data = LAYOUT.create_ldata("d");
		const events = record(data);
		const io = new Uint8Array(8);
		io[2] = 0x01; // alarm, in place for BE; every other bit is 0
		data.load_tag("alarm", io, "BE");
		assert.equal(data.alarm, true);
		assert.equal(data.run, true); // not loaded: unchanged
		assert.deepEqual(events.map(([name]) => name), ["status", "alarm"]);
	});

	test("a batch of loads in a transaction is one detection and one write", () => {
		const data = LAYOUT.create_ldata("d");
		const events = record(data);
		let writes = 0;
		data.on("write", () => writes++);
		data.transaction(() => {
			for (const { name } of data.layout.items) data.load_tag(name, io_image(), "LEBS");
		});
		assert.equal(writes, 1);
		assert.deepEqual(events.map(([name]) => name), ["id", "status"]);
		assert.equal(data.status, 3);
		assert.equal(data.pressure, 1.5);
	});

	test("store_tag converts a tag into the IO buffer; the data block is unchanged and no event is emitted", () => {
		const data = LAYOUT.create_ldata("d");
		const events = record(data);
		let writes = 0;
		data.on("write", () => writes++);
		const before = data.read_bytes();
		const io = new Uint8Array(8);
		data.store_tag("pressure", io, "LEBS");
		data.store_tag("id", io, "LEBS");
		assert.deepEqual([...io], [0x00, 0x07, 0, 0, 0x00, 0x00, 0x3f, 0xc0]);
		assert.deepEqual(data.read_bytes(), before);
		assert.deepEqual(events, []);
		assert.equal(writes, 0);
	});

	test("Ltag load and store are load_tag and store_tag for the name of the tag", () => {
		const data = LAYOUT.create_ldata("d");
		const events = record(data);
		data.get("id").load(io_image(), "LEBS");
		assert.deepEqual(events, [["id", 7, 9]]);
		const io = new Uint8Array(8);
		data.get("pressure").store(io, "LEBS");
		assert.deepEqual([...io.subarray(4)], [0x00, 0x00, 0x3f, 0xc0]);
	});

	test("an unknown tag, a wrong argument or a tag out of the IO buffer throws and changes nothing", () => {
		const data = LAYOUT.create_ldata("d");
		const before = data.read_bytes();
		let writes = 0;
		data.on("write", () => writes++);
		assert.throws(() => data.load_tag("nope", io_image(), "BE"), /unknown tag nope/);
		assert.throws(() => data.store_tag("nope", io_image(), "BE"), /unknown tag nope/);
		assert.throws(() => data.load_tag("pressure", new Uint8Array(7), "BE"), RangeError);
		assert.throws(() => data.store_tag("pressure", new Uint8Array(7), "BE"), RangeError);
		assert.throws(() => data.load_tag("id", [0, 9], "BE"), TypeError);
		assert.throws(() => data.store_tag("id", [0, 9], "BE"), TypeError);
		assert.deepEqual(data.read_bytes(), before);
		assert.equal(writes, 0);
	});

	test("only BE, LE, BEBS and LEBS are byte orders: aliases and other values throw", () => {
		const data = LAYOUT.create_ldata("d");
		for (const endian of ["little", "big", "le", "lebs", "", undefined, 1]) {
			assert.throws(() => data.load_tag("id", io_image(), endian), RangeError, String(endian));
			assert.throws(() => data.store_tag("id", io_image(), endian), RangeError, String(endian));
			assert.throws(() => data.get("id").load(io_image(), endian), RangeError, String(endian));
		}
		assert.equal(data.id, 7);
	});
});

describe("4.2 transactions", () => {
	const create = () => {
		const writes = [];
		const data = LAYOUT.create_ldata("d");
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
			data.write_bytes(0, Uint8Array.of(0, 10));
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

	test("raw writes in a transaction are detected at the commit, with one write", () => {
		const { data, writes, events } = create();
		data.transaction(() => {
			data.write_bytes(0, Uint8Array.of(0x12, 0x34));
			data.write_bit(7, 0xff, true);
		});
		assert.deepEqual(events.map(([name]) => name), ["id", "pressure"]);
		assert.equal(writes.length, 1);
	});

	test("a transaction without a write emits nothing", () => {
		const { data, writes, events } = create();
		assert.equal(data.transaction(() => data.id), 7);
		assert.deepEqual(events, []);
		assert.deepEqual(writes, []);
	});

	test("a throwing function rolls back the buffer, emits nothing and rethrows", () => {
		const { data, writes, events } = create();
		const before = data.read_bytes();
		assert.throws(() => data.transaction(() => {
			data.id = 9;
			data.write_bit(7, 0xff, true);
			throw new RangeError("boom");
		}), /boom/);
		assert.deepEqual(data.read_bytes(), before);
		assert.deepEqual(events, []);
		assert.deepEqual(writes, []);
		data.id = 8; // the data block works normally afterwards, the rolled back writes leave no trace
		assert.deepEqual(events, [["id", 7, 8]]);
		data.pressure = 1.5; // unchanged
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

	test("a nested transaction throws, and rolls the outer one back if unhandled", () => {
		const { data, events } = create();
		assert.throws(() => data.transaction(() => {
			data.id = 9;
			data.transaction(() => {});
		}), /already open/);
		assert.equal(data.id, 7);
		assert.deepEqual(events, []);
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
		const other = LAYOUT.create_ldata("o");
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
	test("a reserved tag name is refused when the layout is registered", () => {
		const items = [{ name: "read_bytes", type: "UInt", offset: 0, init_value: 0 }];
		assert.throws(() => register_items("BAD", items), /read_bytes: name is a reserved name/);
	});

	test("buffer and detect are not members: tags may have these names", () => {
		const data = register_items("FREE_NAMES", [
			{ name: "buffer", type: "UInt", offset: 0, init_value: 3 },
			{ name: "detect", type: "UInt", offset: 16, init_value: 4 },
		]).create_ldata("d");
		assert.equal(data.buffer, 3);
		assert.equal(data.detect, 4);
	});
});
