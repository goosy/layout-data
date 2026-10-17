// Conversion between the device byte order of an IO buffer and the big-endian
// buffer of an Ldata, per compiled layout entry (doc/spec-data-api.md §2.9,
// doc/design.md §6). Device byte order acts per 16-bit register and per 32-bit
// value; the IO buffer is indexed like the Ldata buffer. Only io_index_table is
// exported by the package: Ldata calls the other functions with its own buffer.
import { compiled_of } from "./registry.js";

/** @import { Endian, Layout } from "./typedefs.js" */
/** @import { Layout_Entry } from "./internal_types.js" */

// The device byte orders; there are no aliases.
const ENDIANS = ["BE", "LE", "BEBS", "LEBS"];

// Endians that swap the two bytes of a 16-bit register.
const BYTE_SWAP_ENDIANS = ["LE", "BEBS"];

/**
 * Throws for a byte order that is not one of BE, LE, BEBS and LEBS, instead of
 * treating it as BE and corrupting the data silently.
 *
 * @param {string} endian
 * @throws {RangeError}
 */
export function check_endian(endian) {
	if (!ENDIANS.includes(endian)) {
		throw new RangeError(`unknown byte order ${endian}: use BE, LE, BEBS or LEBS`);
	}
}

/**
 * Converts the endianness of a 2-byte value between the specified endian format and Big Endian (BE).
 *
 * This function performs bidirectional conversion:
 * - If the data is not in BE, it converts it to BE.
 * - If the data is in BE, it converts it to the specified endian format.
 *
 * @param {Uint8Array} buffer_from - The source buffer containing the data to be converted.
 * @param {Uint8Array} buffer_to - The destination buffer where the converted data will be written.
 * @param {number} index - The starting index in the buffers for the 2-byte value.
 * @param {Endian} endian - The endian format to convert to/from.
 */
function convert_endian_2byte(buffer_from, buffer_to, index, endian) {
	if (BYTE_SWAP_ENDIANS.includes(endian)) { // LE, BEBS: BA
		buffer_to[index] = buffer_from[index + 1];
		buffer_to[index + 1] = buffer_from[index];
	} else { // BE, LEBS: AB
		buffer_to[index] = buffer_from[index];
		buffer_to[index + 1] = buffer_from[index + 1];
	}
}

/**
 * Converts the endianness of a 4-byte value between the specified endian format and Big Endian (BE).
 *
 * This function performs bidirectional conversion:
 * - If the data is not in BE, it converts it to BE.
 * - If the data is in BE, it converts it to the specified endian format.
 *
 * The function handles different endian formats:
 * - LE (Little Endian): DCBA <-> ABCD
 * - BEBS (Big Endian Byte Swap): BADC <-> ABCD
 * - LEBS (Little Endian Byte Swap): CDAB <-> ABCD
 *
 * @param {Uint8Array} buffer_from - The source buffer containing the data to be converted.
 * @param {Uint8Array} buffer_to - The destination buffer where the converted data will be written.
 * @param {number} index - The starting index in the buffers for the 4-byte value.
 * @param {Endian} endian - The endian format to convert to/from.
 */
function convert_endian_4bytes(buffer_from, buffer_to, index, endian) {
	switch (endian) {
		case "LE": { // DCBA <-> ABCD
			buffer_to[index] = buffer_from[index + 3];
			buffer_to[index + 1] = buffer_from[index + 2];
			buffer_to[index + 2] = buffer_from[index + 1];
			buffer_to[index + 3] = buffer_from[index];
			break;
		}
		case "BEBS": { // BADC <-> ABCD
			buffer_to[index] = buffer_from[index + 1];
			buffer_to[index + 1] = buffer_from[index];
			buffer_to[index + 2] = buffer_from[index + 3];
			buffer_to[index + 3] = buffer_from[index + 2];
			break;
		}
		case "LEBS": { // CDAB <-> ABCD
			buffer_to[index] = buffer_from[index + 2];
			buffer_to[index + 1] = buffer_from[index + 3];
			buffer_to[index + 2] = buffer_from[index];
			buffer_to[index + 3] = buffer_from[index + 1];
			break;
		}
		default: { // BE
			for (let k = 0; k < 4; k++) buffer_to[index + k] = buffer_from[index + k];
		}
	}
}

/**
 * Index in a device-ordered IO buffer of the byte of a single-byte entry
 * (Bool, Byte, SInt, USInt): when the endian swaps the register bytes, the
 * byte sits in the other half of its register.
 *
 * @param {number} byte - Byte offset of the entry.
 * @param {Endian} endian - Device byte order.
 * @returns {number}
 */
export function io_index(byte, endian) {
	return BYTE_SWAP_ENDIANS.includes(endian) ? byte ^ 1 : byte;
}

/**
 * The index in a device-ordered IO buffer of every byte of a data block: the
 * byte `i` of the block is the byte `table[i]` of the IO buffer. The table
 * makes loading and storing a whole block a plain byte copy, and it agrees
 * with `load_entry` / `store_entry` for every entry (a Bool or a single-byte
 * entry maps as `io_index`, a multi-byte entry as its endian).
 *
 * @param {Layout} layout - The compiled layout of the data block.
 * @param {Endian} endian - Device byte order: BE, LE, BEBS or LEBS.
 * @returns {Int32Array}
 * @throws {RangeError} For another byte order.
 */
export function io_index_table(layout, endian) {
	check_endian(endian);
	const table = new Int32Array(layout.size);
	for (let i = 0; i < table.length; i++) table[i] = io_index(i, endian);
	for (const { byte, size, type } of compiled_of(layout).entries.values()) {
		if (size !== 4 || type === "bool") continue;
		for (let k = 0; k < 4; k++) {
			switch (endian) {
				case "LE": table[byte + k] = byte + 3 - k; break;
				case "BEBS": table[byte + k] = byte + (k ^ 1); break;
				case "LEBS": table[byte + k] = byte + ((k + 2) % 4); break;
				default: table[byte + k] = byte + k;
			}
		}
	}
	return table;
}

/**
 * Byte range [start, end) an entry occupies in a device-ordered IO buffer.
 *
 * @param {Layout_Entry} entry
 * @param {Endian} endian - Device byte order.
 * @returns {{start: number, end: number}}
 */
export function io_range(entry, endian) {
	const start = entry.size === 1 ? io_index(entry.byte, endian) : entry.byte;
	return { start, end: start + entry.size };
}

/**
 * Copies an entry from a device-ordered IO buffer into a big-endian buffer.
 * A Bool only changes its own bit. No change is detected here, and the byte
 * order and the range in the IO buffer are not checked (Ldata does).
 *
 * @param {Layout_Entry} entry
 * @param {Uint8Array} io_buffer - The device-ordered source.
 * @param {Uint8Array} buffer - The big-endian destination.
 * @param {Endian} endian - Device byte order.
 */
export function load_entry(entry, io_buffer, buffer, endian) {
	const { byte, size, mask } = entry;
	if (entry.type === "bool") {
		const value = io_buffer[io_index(byte, endian)] & mask;
		buffer[byte] = value ? buffer[byte] | mask : buffer[byte] & ~mask;
	} else if (size === 1) {
		buffer[byte] = io_buffer[io_index(byte, endian)];
	} else if (size === 2) {
		convert_endian_2byte(io_buffer, buffer, byte, endian);
	} else {
		convert_endian_4bytes(io_buffer, buffer, byte, endian);
	}
}

/**
 * Copies an entry from a big-endian buffer into a device-ordered IO buffer.
 *
 * @param {Layout_Entry} entry
 * @param {Uint8Array} buffer - The big-endian source.
 * @param {Uint8Array} io_buffer - The device-ordered destination.
 * @param {Endian} endian - Device byte order.
 */
export function store_entry(entry, buffer, io_buffer, endian) {
	const { byte, size, mask } = entry;
	if (entry.type === "bool") {
		const index = io_index(byte, endian);
		io_buffer[index] = buffer[byte] & mask ? io_buffer[index] | mask : io_buffer[index] & ~mask;
	} else if (size === 1) {
		io_buffer[io_index(byte, endian)] = buffer[byte];
	} else if (size === 2) {
		convert_endian_2byte(buffer, io_buffer, byte, endian);
	} else {
		convert_endian_4bytes(buffer, io_buffer, byte, endian);
	}
}
