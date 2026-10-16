// Benchmark of reading a data block (doc/design.md §5.1, §6): loading every tag
// from a device-ordered IO buffer, which detects and reports the changes:
// "tags" by load_tag in one transaction, "table" by copying the bytes with the
// index table and one write_bytes.
// Not part of `pnpm test`. Run: pnpm bench
import { Buffer } from "node:buffer";
import { TData, io_index_table, register_layout_data } from "../src/index.js";

const ITER = 200_000;
const TAG_COUNT = 65;

// a block like a device image: an id, a status word of 16 bits, 3 reals, then plain words
const items = [
	{ name: "id", type: "UInt", offset: 0, length: 16, init_value: 0 },
	{
		name: "status", type: "Word", offset: 16, length: 16,
		coupling: [8, 9, 10, 11, 12, 13, 14, 15, 0, 1, 2, 3, 4, 5, 6, 7]
			.map((offset, i) => ({ name: `bit_${i}`, type: "Bool", offset, length: 1, init_value: false })),
	},
	{ name: "temperature", type: "Real", offset: 32, length: 32, init_value: 0 },
	{ name: "pressure", type: "Real", offset: 64, length: 32, init_value: 0 },
	{ name: "flowmeter", type: "Real", offset: 96, length: 32, init_value: 0 },
];
for (let i = 0; i < TAG_COUNT; i++) items.push({ name: `word_${i}`, type: "UInt", offset: 128 + i * 16, length: 16, init_value: 0 });
const layout = register_layout_data({ layouts: { BENCH: items } }).layouts.BENCH;
const size = layout.size;

function make_reader(endian, method) {
	const data = new TData(layout, "bench");
	let events = 0;
	data.on("change", () => { events++; });
	const names = layout.items.map((item) => item.name);
	const table = io_index_table(layout, endian);
	const read = method === "tags"
		? (io) => {
				data.transaction(() => {
					for (const name of names) data.load_tag(name, io, endian);
				});
			}
		: (io) => {
				const staged = Buffer.allocUnsafe(size);
				for (let i = 0; i < size; i++) staged[i] = io[table[i]];
				data.write_bytes(0, staged);
			};
	return { read, events: () => events };
}

function make_frames(kind) {
	// two alternating frames so "changing" tags really change every cycle
	const f0 = Buffer.alloc(size), f1 = Buffer.alloc(size);
	for (let i = 0; i < size; i++) f0[i] = f1[i] = (i * 37) & 0xff;
	if (kind === "3 reals") {
		for (const off of [4, 8, 12]) {
			f1.writeFloatBE(1.5 + off, off);
			f0.writeFloatBE(2.5 + off, off);
		}
	} else if (kind === "status bits") {
		f0[2] = 0x55;
		f1[2] = 0xaa;
		f0[3] = 0x0f;
		f1[3] = 0xf0;
	} else if (kind === "all") {
		for (let i = 0; i < size; i++) f1[i] = ~f0[i] & 0xff;
	}
	return [f0, f1];
}

function bench(reader, frames) {
	for (let i = 0; i < 20_000; i++) reader.read(frames[i & 1]); // warm-up
	const t0 = process.hrtime.bigint();
	for (let i = 0; i < ITER; i++) reader.read(frames[i & 1]);
	return Number(process.hrtime.bigint() - t0) / ITER;
}

const rows = [];
for (const method of ["tags", "table"]) {
	for (const endian of ["BE", "LEBS"]) {
		for (const kind of ["none", "3 reals", "status bits", "all"]) {
			const reader = make_reader(endian, method);
			const ns = bench(reader, make_frames(kind));
			rows.push({ method, endian, "scenario": kind, "ns/cycle": ns.toFixed(0) });
		}
	}
}
console.log(`${layout.name}: ${layout.items.length} tags, ${size} bytes, ${ITER} cycles each`);
console.table(rows);
