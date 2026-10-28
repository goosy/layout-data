// Type definitions of the internals. This file has no run-time content, and
// index.js does not export it: the compiled data of a layout is not part of
// the public interface (doc/spec-layout.md §4).

/**
 * An item of an item table that defines a tag (doc/spec-description.md §3).
 *
 * @typedef {object} Tag_Item
 * @property {string} name - Tag name.
 * @property {string} type - Tag type, case-insensitive (see Tag_Type).
 * @property {number} offset - Bit offset, relative to the parent item until expanded.
 * @property {number} [length] - Length in bits, filled in from the type when omitted.
 * @property {number | boolean} [init_value] - Initial value.
 * @property {string} [comment] - Description, rendered into the generated types.
 * @property {boolean} [is_combined] - Descriptive mark of a combined word; the linkage is decided by `coupling`.
 * @property {Tag_Item[] | string} [coupling] - The bits of a combined word, as an inline list or the name of an item table.
 * @property {never} [includes] - A tag item does not include items.
 */

/**
 * An item of an item table that splices in other items (doc/spec-description.md §3).
 *
 * @typedef {object} Include_Item
 * @property {Layout_Item[] | string} includes - The items to include, as an inline list or the name of an item table.
 * @property {number} offset - Bit offset by which the included items are shifted as a whole.
 * @property {string} [name_prefix] - Prefix of the names of the included items.
 * @property {never} [name] - An inclusion defines no tag.
 * @property {never} [type] - An inclusion defines no tag.
 */

/**
 * One item of an item table, as written in a description
 * (doc/spec-description.md §3).
 *
 * @typedef {Tag_Item | Include_Item} Layout_Item
 */

/**
 * Codec of one tag type on a big-endian buffer (doc/design.md §4).
 *
 * @typedef {object} Codec
 * @property {number} size - Size in bytes.
 * @property {(value: any) => string | null} check - The reason a value is refused, null if it can be written.
 * @property {(buffer: Buffer, byte: number, mask: number) => number | boolean} get
 * @property {(buffer: Buffer, byte: number, mask: number, value: number | boolean) => void} set
 */

/**
 * One tag of a compiled layout.
 *
 * @typedef {object} Layout_Entry
 * @property {string} name
 * @property {import("./typedefs.js").Tag_Type} type - Lower case type name.
 * @property {number | boolean} [init_value] - Absent when the layout gives none.
 * @property {number} byte - Byte offset.
 * @property {number} index - Position among the entries of the layout.
 * @property {number} size - Size in bytes.
 * @property {number} mask - Bit mask of a Bool, 0xff otherwise.
 * @property {Codec} codec
 */

/**
 * The expanded structure of a data block (the result of build_structure).
 *
 * @typedef {object} Data_Struct
 * @property {string} name
 * @property {number} length - Total length in bits.
 * @property {Layout_Item[]} items
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
