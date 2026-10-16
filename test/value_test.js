import { one_tag } from "./share.js";
import assert from "node:assert/strict";
import test, { describe } from "node:test";

const INTEGER_TYPES = {
	Byte: [0, 0xff], USInt: [0, 0xff], SInt: [-0x80, 0x7f],
	Int: [-0x8000, 0x7fff], UInt: [0, 0xffff], Word: [0, 0xffff],
	DInt: [-0x80000000, 0x7fffffff], UDInt: [0, 0xffffffff], DWord: [0, 0xffffffff],
};

/** Writes a value and checks the refusal: nothing changes and nothing is emitted. */
function assert_refused(type, init_value, value, error_type) {
	const data = one_tag(type, init_value);
	const events = [];
	data.on("change", (...args) => events.push(["change", ...args]));
	data.on("write", () => events.push(["write"]));
	const before = data.read_bytes();
	assert.throws(() => { data.tag = value; }, error_type, `${type} ${String(value)}`);
	assert.throws(() => { data.get("tag").value = value; }, error_type);
	assert.deepEqual(data.read_bytes(), before);
	assert.equal(data.tag, init_value);
	assert.deepEqual(events, []);
}

describe("2.3 values of a write", () => {
	for (const [type, [min, max]] of Object.entries(INTEGER_TYPES)) {
		test(`${type} takes the integers from ${min} to ${max}`, () => {
			const data = one_tag(type, 0);
			data.tag = min;
			assert.equal(data.tag, min);
			data.tag = max;
			assert.equal(data.tag, max);
		});

		test(`${type} refuses a value that is not a number with TypeError`, () => {
			for (const value of ["7", "", null, undefined, true, {}, [], 7n, Symbol("x")]) {
				assert_refused(type, 0, value, TypeError);
			}
		});

		test(`${type} refuses NaN, the infinities, non-integers and values out of range with RangeError`, () => {
			for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1.5, min - 1, max + 1, 2 ** 53]) {
				assert_refused(type, 0, value, RangeError);
			}
		});
	}

	test("the error names the tdata and the tag", () => {
		const data = one_tag("Int", 0);
		assert.throws(() => { data.tag = 1.5; }, /t\.tag: 1\.5 is not an integer/);
		assert.throws(() => { data.tag = "x"; }, /t\.tag: a string is not a number/);
	});

	test("Real keeps NaN and the infinities", () => {
		const data = one_tag("Real", 0);
		for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
			data.tag = value;
			assert.ok(Object.is(data.tag, value), String(value));
		}
	});

	test("Real rounds a finite value to float32 and refuses one beyond the float32 range", () => {
		const data = one_tag("Real", 0);
		data.tag = 3.4028234663852886e38;
		assert.equal(data.tag, 3.4028234663852886e38);
		data.tag = -3.4028234663852886e38;
		assert.equal(data.tag, -3.4028234663852886e38);
		data.tag = 0.1;
		assert.equal(data.tag, Math.fround(0.1));
		for (const value of [1e40, -1e40, 3.5e38]) assert_refused("Real", 0, value, RangeError);
		for (const value of ["1.5", null, undefined, false, 1n]) assert_refused("Real", 0, value, TypeError);
	});

	test("Bool takes any value by truthiness", () => {
		const data = one_tag("Bool", false);
		const cases = [[1, true], [0, false], ["x", true], ["", false], [{}, true], [null, false], [undefined, false], [Number.NaN, false]];
		for (const [value, expected] of cases) {
			data.tag = value;
			assert.equal(data.tag, expected, String(value));
		}
	});

	test("a refused write inside a transaction leaves the earlier writes to commit as usual", () => {
		const data = one_tag("Int", 0);
		const events = [];
		data.on("change", (...args) => events.push(args));
		data.transaction(() => {
			data.tag = 5;
			assert.throws(() => { data.tag = 1.5; }, RangeError);
		});
		assert.deepEqual(events, [["tag", 0, 5]]);
	});
});
