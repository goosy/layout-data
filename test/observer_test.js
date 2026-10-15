import { make_struct } from "./share.js";
import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { TData } from "../src/TData.js";
import { register_layout } from "../src/layout.js";

const ITEMS = [
	{ name: "a", type: "UInt", offset: 0, length: 16, init_value: 0 },
	{
		name: "flags", type: "Word", offset: 16, length: 16,
		is_combined: true, coupling: [
			{ name: "f0", type: "Bool", offset: 8, length: 1, init_value: false },
			{ name: "f8", type: "Bool", offset: 0, length: 1, init_value: false },
		],
	},
	{ name: "b", type: "UInt", offset: 32, length: 16, init_value: 0 },
];

const LAYOUT = register_layout(make_struct(ITEMS, "SAMPLE"));
const create = () => new TData(LAYOUT, "sample");

const record = (data) => {
	const events = [];
	data.on("change", (name, old_value, new_value) => events.push([name, old_value, new_value]));
	return events;
};

describe("Observer", () => {
	test("changes of one detection are reported in layout order", () => {
		const data = create();
		const events = record(data);
		data.transaction(() => {
			data.write_bytes(4, Uint8Array.of(0, 5)); // b
			data.write_bytes(2, Uint8Array.of(0x01, 0x01)); // f8 and f0
			data.write_bytes(0, Uint8Array.of(0, 7)); // a
		});
		assert.deepEqual(events.map(([name]) => name), ["a", "flags", "f0", "f8", "b"]);
	});

	test("a value changed and restored before detection is not reported", () => {
		const data = create();
		const events = record(data);
		data.transaction(() => {
			data.write_bytes(0, Uint8Array.of(0, 9));
			data.write_bytes(0, Uint8Array.of(0, 0));
		});
		assert.deepEqual(events, []);
	});

	test("a write by a change handler is reported after the current changes", () => {
		const data = create();
		const events = record(data);
		data.get("a").on("change", (_, value) => { data.b = value * 10; });
		data.transaction(() => {
			data.write_bytes(0, Uint8Array.of(0, 1)); // a
			data.write_bit(3, 0x01, true); // f0
		});
		assert.deepEqual(events, [["a", 0, 1], ["flags", 0, 1], ["f0", false, true], ["b", 0, 10]]);
		assert.equal(data.b, 10);
	});

	test("changes that never settle throw", () => {
		const data = create();
		data.get("a").on("change", () => { data.a += 1; });
		assert.throws(() => { data.a = 1; }, /do not settle/);
		// the observer recovers: the last unreported change is not lost
		data.get("a").removeAllListeners("change");
		const events = record(data);
		data.b = 3;
		assert.deepEqual(events, [["a", 16, 17], ["b", 0, 3]]);
	});

	test("only the written range is compared: a write reports its own tags and no others", () => {
		const data = create();
		const events = record(data);
		data.write_bytes(2, Uint8Array.of(0, 0)); // the same bytes as before
		data.b = 3;
		data.write_bit(1, 0x01, false);
		assert.deepEqual(events, [["b", 0, 3]]);
	});

	test("a rolled back transaction leaves no range to compare", () => {
		const data = create();
		const events = record(data);
		assert.throws(() => data.transaction(() => {
			data.a = 5;
			data.b = 6;
			throw new Error("x");
		}));
		data.write_bytes(2, Uint8Array.of(0, 1));
		assert.deepEqual(events.map(([name]) => name), ["flags", "f0"]);
		assert.equal(data.a, 0);
	});
});
