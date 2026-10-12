import { one_tag } from "./share.js";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test, { describe } from "node:test";
import { io_index, io_index_table, io_range, load_entry, store_entry } from "../src/endian.js";
import { TData } from "../src/TData.js";
import { make_struct } from "./share.js";

/** Loads a tag of a data block from an IO buffer and detects the change. */
function load(data, io_buffer, endian) {
	load_entry(data.get("tag").entry, io_buffer, data.buffer, endian);
	data.detect();
}

function store(data, io_buffer, endian) {
	store_entry(data.get("tag").entry, data.buffer, io_buffer, endian);
}

describe("multi-byte conversion", () => {
	const cases_2 = [
		["BE", [0x12, 0x34]],
		["LE", [0x34, 0x12]],
		["little", [0x34, 0x12]],
		["BEBS", [0x34, 0x12]],
		["LEBS", [0x12, 0x34]],
	];
	for (const type of ["Int", "UInt", "Word"]) {
		for (const [endian, bytes] of cases_2) {
			test(`${type} ${endian}`, () => {
				const data = one_tag(type, 0);
				load(data, Buffer.from(bytes), endian);
				assert.equal(data.tag, 0x1234);
				assert.deepEqual([...data.buffer.subarray(0, 2)], [0x12, 0x34]);
				const out = Buffer.alloc(2);
				store(data, out, endian);
				assert.deepEqual([...out], bytes);
			});
		}
	}

	// internal value ABCD = 0x01020304
	const cases_4 = [
		["BE", [0x01, 0x02, 0x03, 0x04]],
		["LE", [0x04, 0x03, 0x02, 0x01]],
		["little", [0x04, 0x03, 0x02, 0x01]],
		["BEBS", [0x02, 0x01, 0x04, 0x03]],
		["LEBS", [0x03, 0x04, 0x01, 0x02]],
	];
	for (const type of ["DInt", "UDInt", "DWord"]) {
		for (const [endian, bytes] of cases_4) {
			test(`${type} ${endian}`, () => {
				const data = one_tag(type, 0);
				load(data, Buffer.from(bytes), endian);
				assert.equal(data.tag, 0x01020304);
				const out = Buffer.alloc(4);
				store(data, out, endian);
				assert.deepEqual([...out], bytes);
			});
		}
	}

	for (const [endian, bytes] of cases_4) {
		test(`Real ${endian}`, () => {
			const be = [0x3f, 0xc0, 0x00, 0x01];
			const io = bytes.map((b) => be[b - 1]);
			const data = one_tag("Real", 0);
			load(data, Buffer.from(io), endian);
			assert.equal(data.tag, Buffer.from(be).readFloatBE());
			const out = Buffer.alloc(4);
			store(data, out, endian);
			assert.deepEqual([...out], io);
		});
	}

	test("the tag offset is used in the IO buffer", () => {
		const data = one_tag("UDInt", 0, 32, 8);
		const io = Buffer.from([0xee, 0xee, 0xee, 0xee, 0x04, 0x03, 0x02, 0x01]);
		load(data, io, "LE");
		assert.equal(data.tag, 0x01020304);
		assert.deepEqual([...data.buffer.subarray(0, 4)], [0, 0, 0, 0]);
	});

	test("a load is reported as a change once detected", () => {
		const data = one_tag("Int", 0);
		const events = [];
		data.get("tag").on("change", (...args) => events.push(args));
		load(data, Buffer.from([0xff, 0xff]), "LE");
		assert.deepEqual(events, [[0, -1]]);
	});
});

describe("single-byte device byte order", () => {
	// [endian, IO index of byte 2, IO index of byte 3]
	const cases = [
		["BE", 2, 3],
		["big", 2, 3],
		["LEBS", 2, 3],
		["LE", 3, 2],
		["little", 3, 2],
		["BEBS", 3, 2],
	];
	for (const [endian, index_2, index_3] of cases) {
		test(`${endian}: byte moves within its 16-bit register only`, () => {
			assert.equal(io_index(2, endian), index_2);
			assert.equal(io_index(3, endian), index_3);
		});

		test(`${endian}: Bool reads and writes only its own bit at the mapped byte`, () => {
			const data = one_tag("Bool", false, 25); // byte 3, bit 1
			const io = Buffer.alloc(4);
			io[index_3] = 0x02;
			load(data, io, endian);
			assert.equal(data.tag, true);
			const out = Buffer.alloc(4, 0xf0);
			store(data, out, endian);
			const expected = Buffer.alloc(4, 0xf0);
			expected[index_3] = 0xf2;
			assert.deepEqual([...out], [...expected]);
		});

		test(`${endian}: Byte and SInt read and write the mapped byte`, () => {
			const byte = one_tag("Byte", 0, 16);
			const sint = one_tag("SInt", 0, 24);
			const io = Buffer.alloc(4);
			io[index_2] = 0x12;
			io[index_3] = 0xff;
			load(byte, io, endian);
			load(sint, io, endian);
			assert.equal(byte.tag, 0x12);
			assert.equal(sint.tag, -1);
			const out = Buffer.alloc(4);
			store(byte, out, endian);
			store(sint, out, endian);
			assert.deepEqual([...out], [...io]);
		});
	}

	test("io_range maps single-byte tags and keeps multi-byte tags in place", () => {
		const entry = (type, offset) => one_tag(type, type === "Bool" ? false : 0, offset, 8).get("tag").entry;
		assert.deepEqual(io_range(entry("Bool", 24), "LE"), { start: 2, end: 3 });
		assert.deepEqual(io_range(entry("Bool", 24), "BE"), { start: 3, end: 4 });
		assert.deepEqual(io_range(entry("Word", 16), "LE"), { start: 2, end: 4 });
		assert.deepEqual(io_range(entry("Real", 32), "BEBS"), { start: 4, end: 8 });
	});

	test("SInt is copied unchanged", () => {
		const data = one_tag("SInt", 0, 8, 2);
		load(data, Buffer.from([0x00, 0x80]), "BE");
		assert.equal(data.tag, -128);
		data.tag = -2;
		const out = Buffer.alloc(2);
		store(data, out, "BE");
		assert.deepEqual([...out], [0x00, 0xfe]);
	});
});

describe("io_index_table", () => {
	const ITEMS = [
		{ name: "u", type: "UInt", offset: 0, length: 16, init_value: 0 },
		{
			name: "status", type: "Word", offset: 16, length: 16,
			coupling: [
				{ name: "run", type: "Bool", offset: 8, length: 1, init_value: false },
				{ name: "alarm", type: "Bool", offset: 0, length: 1, init_value: false },
			],
		},
		{ name: "r", type: "Real", offset: 32, length: 32, init_value: 0 },
		{ name: "d", type: "DInt", offset: 64, length: 32, init_value: 0 },
		{ name: "b", type: "SInt", offset: 96, length: 8, init_value: 0 },
		{ name: "c", type: "USInt", offset: 104, length: 8, init_value: 0 },
		{ name: "w", type: "Int", offset: 112, length: 16, init_value: 0 },
	];

	for (const endian of ["BE", "LE", "little", "BEBS", "LEBS"]) {
		test(`${endian}: the table moves every byte as load_entry and store_entry do`, () => {
			const layout = new TData(make_struct(ITEMS), "t").layout;
			const table = io_index_table(layout, endian);
			const io = Buffer.from(Array.from({ length: layout.size }, (_, i) => 0x10 + i));
			const by_entry = new TData(layout, "e");
			const by_table = Buffer.alloc(layout.size);
			for (const entry of layout.entries.values()) {
				if (entry.type !== "bool") load_entry(entry, io, by_entry.buffer, endian);
			}
			for (let i = 0; i < layout.size; i++) by_table[i] = io[table[i]];
			assert.deepEqual(by_table.subarray(0, 4), by_entry.buffer.subarray(0, 4)); // u and the word
			assert.deepEqual(by_table.subarray(4), by_entry.buffer.subarray(4));

			const back_entry = Buffer.alloc(layout.size);
			const back_table = Buffer.alloc(layout.size);
			for (const entry of layout.entries.values()) {
				if (entry.type !== "bool") store_entry(entry, by_entry.buffer, back_entry, endian);
			}
			for (let i = 0; i < layout.size; i++) back_table[table[i]] = by_entry.buffer[i];
			assert.deepEqual(back_table, back_entry);
		});
	}

	test("a single-byte tag maps as io_index", () => {
		const layout = new TData(make_struct(ITEMS), "t").layout;
		assert.equal(io_index_table(layout, "LE")[12], io_index(12, "LE"));
		assert.equal(io_index_table(layout, "BE")[12], 12);
	});
});
