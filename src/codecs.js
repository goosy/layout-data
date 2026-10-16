// Codecs of the tag types on a big-endian buffer (doc/design.md §4).
// `byte` is the byte offset of the tag; `mask` is the bit mask of a Bool.
// Device byte order is handled at the IO boundary, not here.

/** The largest finite float32 value; a finite number above it is refused by a Real. */
export const FLOAT32_MAX = 3.4028234663852886e38;

const read_bool = (buffer, byte, mask) => (buffer[byte] & mask) !== 0;
const write_bool = (buffer, byte, mask, value) => {
	buffer[byte] = value ? buffer[byte] | mask : buffer[byte] & ~mask;
};

/** A Bool takes any value, by truthiness. */
const check_bool = () => null;

/**
 * The check of an integer type: a number that is an integer inside the range.
 *
 * @param {number} min
 * @param {number} max
 * @returns {(value: any) => string | null}
 */
const check_integer = (min, max) => (value) => {
	if (typeof value !== "number") return `a ${typeof value} is not a number`;
	if (!Number.isInteger(value)) return `${value} is not an integer`;
	if (value < min || value > max) return `${value} is outside ${min}..${max}`;
	return null;
};

/** The check of a Real: any number, NaN and the infinities included, but no finite value beyond float32. */
const check_real = (value) => {
	if (typeof value !== "number") return `a ${typeof value} is not a number`;
	if (Number.isFinite(value) && Math.abs(value) > FLOAT32_MAX) return `${value} is beyond the float32 range`;
	return null;
};

const check_byte = check_integer(0, 0xff);
const check_sint = check_integer(-0x80, 0x7f);
const check_int = check_integer(-0x8000, 0x7fff);
const check_uint = check_integer(0, 0xffff);
const check_dint = check_integer(-0x80000000, 0x7fffffff);
const check_udint = check_integer(0, 0xffffffff);

/**
 * Codec of each tag type (lower case): its size in bytes, `check(value)`, which
 * returns null for a value that can be written and the reason otherwise,
 * `get(buffer, byte, mask)` and `set(buffer, byte, mask, value)`. `set` is
 * called with a checked value only (doc/spec-data-api.md §2.3).
 *
 * @type {Record<string, import("./internal_types.js").Codec>}
 */
export const CODECS = {
	bool: { size: 1, check: check_bool, get: read_bool, set: write_bool },
	byte: { size: 1, check: check_byte, get: (b, i) => b.readUInt8(i), set: (b, i, _m, v) => b.writeUInt8(v, i) },
	usint: { size: 1, check: check_byte, get: (b, i) => b.readUInt8(i), set: (b, i, _m, v) => b.writeUInt8(v, i) },
	sint: { size: 1, check: check_sint, get: (b, i) => b.readInt8(i), set: (b, i, _m, v) => b.writeInt8(v, i) },
	int: { size: 2, check: check_int, get: (b, i) => b.readInt16BE(i), set: (b, i, _m, v) => b.writeInt16BE(v, i) },
	uint: { size: 2, check: check_uint, get: (b, i) => b.readUInt16BE(i), set: (b, i, _m, v) => b.writeUInt16BE(v, i) },
	word: { size: 2, check: check_uint, get: (b, i) => b.readUInt16BE(i), set: (b, i, _m, v) => b.writeUInt16BE(v, i) },
	dint: { size: 4, check: check_dint, get: (b, i) => b.readInt32BE(i), set: (b, i, _m, v) => b.writeInt32BE(v, i) },
	udint: { size: 4, check: check_udint, get: (b, i) => b.readUInt32BE(i), set: (b, i, _m, v) => b.writeUInt32BE(v, i) },
	dword: { size: 4, check: check_udint, get: (b, i) => b.readUInt32BE(i), set: (b, i, _m, v) => b.writeUInt32BE(v, i) },
	real: { size: 4, check: check_real, get: (b, i) => b.readFloatBE(i), set: (b, i, _m, v) => b.writeFloatBE(v, i) },
};
