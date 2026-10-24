import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { Ldata } from "../src/Ldata.js";
import { Ltag } from "../src/Ltag.js";
import { register_items } from "./share.js";

// bytes: id 0-1, status 2-3 (fault is bit 0 of byte 2, run is bit 0 of byte 3), pressure 4-7
const LAYOUT = register_items("Access_Sample", [
	{ name: "id", type: "UInt", offset: 0, init_value: 7 },
	{
		name: "status", type: "Word", offset: 16,
		coupling: [
			{ name: "run", type: "Bool", offset: 8, init_value: false },
			{ name: "fault", type: "Bool", offset: 0, init_value: false },
		],
	},
	{ name: "pressure", type: "Real", offset: 32, init_value: 1.5 },
]);

/** A data block that records its accesses as [kind, names]. */
function watched() {
	const data = new Ldata(LAYOUT, "d");
	const seen = [];
	data.on("access", (kind, tags) => seen.push([kind, tags.map((tag) => tag.name)]));
	return { data, seen };
}

describe("2.8 the access event", () => {
	test("a read and a write by name name the tag", () => {
		const { data, seen } = watched();
		void data.id;
		data.pressure = 2.5;
		assert.deepEqual(seen, [["read", ["id"]], ["write", ["pressure"]]]);
	});

	test("tag.value reads and writes by name too, and the tags are the Ltag handles of get()", () => {
		const { data } = watched();
		const handles = [];
		data.on("access", (_kind, tags) => handles.push(...tags));
		void data.get("id").value;
		data.get("id").value = 1;
		assert.equal(handles.length, 2);
		assert.ok(handles[0] instanceof Ltag);
		assert.equal(handles[0], data.get("id"));
		assert.equal(handles[1], data.get("id"));
	});

	test("a combined word by name is the word only, its bits are not named", () => {
		const { data, seen } = watched();
		void data.status;
		data.status = 0x0100;
		void data.run;
		assert.deepEqual(seen, [["read", ["status"]], ["write", ["status"]], ["read", ["run"]]]);
	});

	test("read_bytes names the tags with a byte in the range, in layout order, without repeats", () => {
		const { data, seen } = watched();
		data.read_bytes(2, 3); // bytes 2, 3, 4: the word, its bits, and the first byte of pressure
		data.read_bytes(0, 1);
		data.read_bytes();
		assert.deepEqual(seen, [
			["read", ["status", "run", "fault", "pressure"]],
			["read", ["id"]],
			["read", ["id", "status", "run", "fault", "pressure"]],
		]);
	});

	test("write_bytes names the tags with a byte in the range", () => {
		const { data, seen } = watched();
		data.write_bytes(3, Uint8Array.of(0x01, 0x00)); // byte 3: the word and run, byte 4: pressure
		assert.deepEqual(seen, [["write", ["status", "run", "pressure"]]]);
	});

	test("write_bit names the tags of the byte, but not the Bools of the other bits", () => {
		const { data, seen } = watched();
		data.write_bit(2, 0x01, true); // bit 0 of byte 2: fault
		data.write_bit(3, 0x01, true); // bit 0 of byte 3: run
		data.write_bit(3, 0x02, true); // another bit of byte 3: only the word
		assert.deepEqual(seen, [["write", ["status", "fault"]], ["write", ["status", "run"]], ["write", ["status"]]]);
	});

	test("read_bit names the tags of the byte, but not the Bools of the other bits", () => {
		const { data, seen } = watched();
		data.read_bit(2, 0x01); // bit 0 of byte 2: fault
		data.read_bit(3, 0x03); // bits 0 and 1 of byte 3: run
		data.read_bit(3, 0x02); // another bit of byte 3: only the word
		data.read_bit(4, 0x01); // a byte of pressure
		assert.deepEqual(seen, [
			["read", ["status", "fault"]], ["read", ["status", "run"]], ["read", ["status"]], ["read", ["pressure"]],
		]);
	});

	test("load_tag is a write and store_tag a read of that tag", () => {
		const { data, seen } = watched();
		const io = new Uint8Array(8);
		data.load_tag("pressure", io, "BE");
		data.get("pressure").store(io, "LE");
		data.get("id").load(io, "BE");
		assert.deepEqual(seen, [["write", ["pressure"]], ["read", ["pressure"]], ["write", ["id"]]]);
	});

	test("a raw access that touches no byte emits nothing", () => {
		const { data, seen } = watched();
		data.read_bytes(8, 0);
		data.write_bytes(0, new Uint8Array(0));
		assert.deepEqual(seen, []);
	});

	test("an access that did not take effect emits nothing", () => {
		const { data, seen } = watched();
		assert.throws(() => { data.id = 1.5; }, RangeError);
		assert.throws(() => { data.id = "x"; }, TypeError);
		assert.throws(() => data.read_bytes(0, 99), RangeError);
		assert.throws(() => data.write_bytes(9, Uint8Array.of(1)), RangeError);
		assert.throws(() => data.write_bit(0, 0, true), RangeError);
		assert.throws(() => data.read_bit(0, 0), RangeError);
		assert.throws(() => data.read_bit(8, 0x01), RangeError);
		assert.throws(() => data.load_tag("nope", new Uint8Array(8), "BE"), /unknown tag/);
		assert.throws(() => data.store_tag("id", new Uint8Array(1), "BE"), RangeError);
		assert.deepEqual(seen, []);
	});

	test("a write emits it before its change and write events, with the new value in effect", () => {
		const { data } = watched();
		const order = [];
		data.on("access", (kind) => order.push(`access ${kind} ${data.id}`));
		data.on("change", (name) => order.push(`change ${name}`));
		data.on("write", () => order.push("write"));
		data.id = 9;
		assert.deepEqual(order.filter((line) => line !== "access read 9"), ["access write 9", "change id", "write"]);
	});

	test("it is emitted inside a transaction at once, and a rollback is not an access", () => {
		const { data, seen } = watched();
		data.transaction(() => {
			data.id = 1;
			void data.pressure;
		});
		assert.deepEqual(seen, [["write", ["id"]], ["read", ["pressure"]]]);
		seen.length = 0;
		assert.throws(() => data.transaction(() => {
			data.id = 2;
			throw new Error("rollback");
		}), /rollback/);
		assert.deepEqual(seen, [["write", ["id"]]]);
	});

	test("the accesses of a listener do not emit again", () => {
		const data = new Ldata(LAYOUT, "d");
		const seen = [];
		data.on("access", (kind, tags) => {
			seen.push([kind, tags[0].name]);
			void data.id; // a read in the listener
			data.pressure = 3; // a write in the listener
		});
		void data.status;
		assert.deepEqual(seen, [["read", "status"]]);
		assert.equal(data.pressure, 3);
		data.id = 4; // the listener runs again for an access of its own ldata, and only once
		assert.deepEqual(seen.at(-1), ["write", "id"]);
	});

	test("an exception of a listener: all listeners run, then the read throws, or the write after its events", () => {
		const data = new Ldata(LAYOUT, "d");
		const seen = [];
		data.on("access", () => { throw new Error("first"); });
		data.on("access", (kind) => seen.push(`second ${kind}`));
		data.on("change", (name) => seen.push(`change ${name}`));
		data.on("write", () => seen.push("write"));
		assert.throws(() => data.id, /first/);
		assert.throws(() => { data.id = 5; }, /first/);
		assert.deepEqual(seen, ["second read", "second write", "change id", "write"]);
		data.removeAllListeners("access");
		assert.equal(data.id, 5);
	});

	test("without a listener nothing is built, and removing the listener stops it", () => {
		const data = new Ldata(LAYOUT, "d");
		const seen = [];
		const listener = (kind) => seen.push(kind);
		data.on("access", listener);
		void data.id;
		data.off("access", listener);
		void data.id;
		assert.deepEqual(seen, ["read"]);
		data.once("access", listener);
		void data.id;
		void data.id;
		assert.deepEqual(seen, ["read", "read"]);
		data.on("access", listener);
		data.removeAllListeners();
		void data.id;
		assert.deepEqual(seen, ["read", "read"]);
	});

	test("it sees only the ldata it is subscribed on", () => {
		const first = new Ldata(LAYOUT, "a");
		const second = new Ldata(LAYOUT, "b");
		const seen = [];
		first.on("access", (kind, tags) => seen.push([kind, tags[0].name]));
		void second.id;
		second.id = 1;
		void first.id;
		assert.deepEqual(seen, [["read", "id"]]);
	});

	test("the global tracer is gone from the package", async () => {
		const api = await import("../src/index.js");
		assert.equal("set_access_tracer" in api, false);
	});
});

describe("2.8 class-level access listeners", () => {
	/** Subscribes a recording listener for one test, and cancels it afterwards. */
	function observe(t) {
		const seen = [];
		const listener = (data, kind, tags) => seen.push([data.name, kind, tags.map((tag) => tag.name)]);
		Ldata.on_access(listener);
		t.after(() => Ldata.off_access(listener));
		return { seen, listener };
	}

	test("it sees every ldata, including one created afterwards, with the ldata first", (t) => {
		const { seen } = observe(t);
		const first = new Ldata(LAYOUT, "first");
		const second = new Ldata(LAYOUT, "second");
		void first.id;
		second.pressure = 2;
		first.read_bytes(0, 2);
		assert.deepEqual(seen, [["first", "read", ["id"]], ["second", "write", ["pressure"]], ["first", "read", ["id"]]]);
	});

	test("it needs no subscription on the ldata and cannot be removed through it", (t) => {
		const { seen } = observe(t);
		const data = new Ldata(LAYOUT, "d");
		data.on("access", () => {});
		data.removeAllListeners();
		data.removeAllListeners("access");
		void data.id;
		assert.deepEqual(seen, [["d", "read", ["id"]]]);
	});

	test("off_access cancels it, and does nothing for a function that is not subscribed", () => {
		const data = new Ldata(LAYOUT, "d");
		const seen = [];
		const listener = () => seen.push("called");
		Ldata.on_access(listener);
		void data.id;
		Ldata.off_access(listener);
		Ldata.off_access(listener);
		Ldata.off_access(() => {});
		void data.id;
		assert.deepEqual(seen, ["called"]);
	});

	test("several parties subscribe without overriding each other, and one function twice is one subscription", () => {
		const data = new Ldata(LAYOUT, "d");
		const calls = [];
		const one = () => calls.push("one");
		const two = () => calls.push("two");
		Ldata.on_access(one);
		Ldata.on_access(one);
		Ldata.on_access(two);
		void data.id;
		Ldata.off_access(one);
		void data.id;
		Ldata.off_access(two);
		assert.deepEqual(calls, ["one", "two", "two"]);
	});

	test("the listeners of the instance are called before those of the class, for the same access", (t) => {
		const data = new Ldata(LAYOUT, "d");
		const order = [];
		data.on("access", () => order.push("instance"));
		const listener = () => order.push("class");
		Ldata.on_access(listener);
		t.after(() => Ldata.off_access(listener));
		void data.id;
		assert.deepEqual(order, ["instance", "class"]);
	});

	test("the accesses made by an access listener, to any ldata, emit nothing", (t) => {
		const other = new Ldata(LAYOUT, "other");
		const data = new Ldata(LAYOUT, "data");
		const seen = [];
		other.on("access", (kind) => seen.push(`other ${kind}`));
		const listener = (ldata, kind) => {
			seen.push(`class ${ldata.name} ${kind}`);
			void other.id;
			other.pressure = 4;
			void ldata.id;
		};
		Ldata.on_access(listener);
		t.after(() => Ldata.off_access(listener));
		void data.status;
		assert.deepEqual(seen, ["class data read"]);
		assert.equal(other.pressure, 4);
	});

	test("an exception of a class listener: all listeners run, the first exception is thrown after the events", (t) => {
		const data = new Ldata(LAYOUT, "d");
		const seen = [];
		data.on("access", () => { throw new Error("instance"); });
		const bad = () => { throw new Error("class"); };
		const good = (_ldata, kind) => seen.push(`good ${kind}`);
		data.on("change", (name) => seen.push(`change ${name}`));
		Ldata.on_access(bad);
		Ldata.on_access(good);
		t.after(() => {
			Ldata.off_access(bad);
			Ldata.off_access(good);
		});
		assert.throws(() => { data.id = 3; }, /instance/);
		assert.throws(() => data.pressure, /instance/);
		assert.deepEqual(seen, ["good write", "change id", "good read"]);
		data.removeAllListeners("access");
		assert.throws(() => data.id, /class/);
	});

	test("the guard is released after an exception", (t) => {
		const data = new Ldata(LAYOUT, "d");
		const seen = [];
		const bad = () => { throw new Error("bad"); };
		Ldata.on_access(bad);
		assert.throws(() => data.id, /bad/);
		Ldata.off_access(bad);
		const listener = (_ldata, kind) => seen.push(kind);
		Ldata.on_access(listener);
		t.after(() => Ldata.off_access(listener));
		void data.id;
		assert.deepEqual(seen, ["read"]);
	});

	test("a listener must be a function", () => {
		for (const value of [undefined, null, "x", {}, 1]) {
			assert.throws(() => Ldata.on_access(value), TypeError, String(value));
		}
	});

	test("it is a static member: no tag name and no instance member is affected", () => {
		const data = new Ldata(LAYOUT, "d");
		assert.equal("on_access" in data, false);
		assert.equal(typeof Ldata.on_access, "function");
		assert.equal(typeof Ldata.off_access, "function");
	});
});
