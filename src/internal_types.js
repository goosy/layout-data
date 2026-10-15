// Type definitions of the internals. This file has no run-time content, and
// index.js does not export it: the compiled data of a layout is not part of
// the public interface (doc/spec-data-api.md §6.6).

/**
 * Codec of one tag type on a big-endian buffer (doc/design.md §4).
 *
 * @typedef {object} Codec
 * @property {number} size - Size in bytes.
 * @property {(buffer: Buffer, byte: number, mask: number) => number | boolean} get
 * @property {(buffer: Buffer, byte: number, mask: number, value: number | boolean) => void} set
 */

/**
 * One tag of a compiled layout.
 *
 * @typedef {object} Layout_Entry
 * @property {string} name
 * @property {import("./typedefs.js").Tag_Type} type - Lower case type name.
 * @property {number | boolean} init_value
 * @property {number} byte - Byte offset.
 * @property {number} index - Position among the entries of the layout.
 * @property {number} size - Size in bytes.
 * @property {number} mask - Bit mask of a Bool, 0xff otherwise.
 * @property {Codec} codec
 */

/**
 * The compiled data of a layout, kept apart from the public Layout
 * (doc/design.md §3).
 *
 * @typedef {object} Compiled_Layout
 * @property {Map<string, Layout_Entry>} entries
 * @property {Layout_Entry[][]} tags_at_byte - The entries covering each byte.
 */

export {};
