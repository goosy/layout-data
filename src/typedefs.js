// Type definitions of the public interface. This file has no run-time content:
// the JSDoc here is the source of the generated declaration file (dist/types).

/**
 * One item of a layout description, as written by the user and as expanded by
 * build_structure (doc/spec-data-api.md §6).
 *
 * @typedef {object} Layout_Item
 * @property {string} [name] - Tag name.
 * @property {string} type - Tag type, case-insensitive (see TYPE_BITS).
 * @property {number} offset - Bit offset, relative to the parent item until expanded.
 * @property {number} [length] - Length in bits, filled in from the type when omitted.
 * @property {number | boolean} [init_value] - Initial value.
 * @property {string} [comment] - Description, rendered into the generated types.
 * @property {string} [name_prefix] - Prefix of the names of the included items.
 * @property {Layout_Item[] | string} [includes] - Included items, or a fragment name.
 * @property {Layout_Item[] | string[] | string} [coupling] - Coupled bits, or a fragment name; names after expansion.
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
 * @property {string} type - Lower case type name.
 * @property {number | boolean} init_value
 * @property {number} byte - Byte offset.
 * @property {number} index - Position among the entries of the layout.
 * @property {number} size - Size in bytes.
 * @property {number} mask - Bit mask of a Bool, 0xff otherwise.
 * @property {Codec} codec
 * @property {Layout_Item} item - The item the entry was compiled from.
 */

/**
 * A compiled layout (doc/design.md §3), immutable.
 *
 * @typedef {object} Layout
 * @property {string} name
 * @property {number} length - Total length in bits.
 * @property {number} size - Total size in bytes.
 * @property {Layout_Item[]} items
 * @property {Map<string, Layout_Entry>} entries
 * @property {Layout_Entry[][]} tags_at_byte - The entries covering each byte.
 * @property {new (data_struct: Data_Struct | Layout, name: string, options?: TData_Options) => import("./TData.js").TData} Data_Class
 */

/**
 * @typedef {object} TData_Options
 * @property {"immediate" | "deferred"} [detection="immediate"] - When changes are detected.
 * @property {(tdata: import("./TData.js").TData) => void} [on_write] - Called after each write, after its detection in the immediate mode.
 */

/**
 * The result of compiling a layout description.
 *
 * @typedef {object} Compiled_Layouts
 * @property {Record<string, Layout>} layouts
 * @property {Record<string, Layout_Item[]>} fragments
 */

/**
 * @typedef {(tdata: import("./TData.js").TData, name: string, kind: "read" | "write") => void} Access_Tracer
 */

export {};
