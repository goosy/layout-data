// Type definitions of the public interface. This file has no run-time content:
// the JSDoc here is the source of the generated declaration file (dist/types).
// The types of the internals are in internal_types.js and are not exported.

/**
 * One item of a layout description, as written by the user in a layout file
 * or given to register_layout_data (doc/spec-data-api.md §6).
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
 * One tag of a compiled layout (doc/spec-data-api.md §6.6), read-only:
 * `name`; `type`, as written in the description; `offset`, the absolute bit
 * offset; `length` in bits; `init_value`; `comment`, if given; `coupling`,
 * the tag names of the bits of a combined word, or of the combined words a
 * bit belongs to.
 *
 * @typedef {Readonly<{
 *   name: string,
 *   type: string,
 *   offset: number,
 *   length: number,
 *   init_value: number | boolean,
 *   comment?: string,
 *   coupling: readonly string[],
 * }>} Layout_Tag
 */

/**
 * A compiled layout (doc/spec-data-api.md §6.6), read-only and deeply frozen:
 * `name`; `length` in bits; `size` in bytes; `items`, the tags in layout
 * order (a combined word before its bits).
 *
 * @typedef {Readonly<{
 *   name: string,
 *   length: number,
 *   size: number,
 *   items: readonly Layout_Tag[],
 * }>} Layout
 */

/**
 * Device byte order of an IO buffer (doc/spec-data-api.md §2.9).
 *
 * @typedef {"BE" | "LE" | "BEBS" | "LEBS"} Endian
 */

/**
 * A source of layouts: the path of a YAML 1.2 layout file, or a description
 * that is already parsed (the same structure as the file: `layouts` and the
 * fragments, doc/spec-data-api.md §6.1).
 *
 * @typedef {string | Record<string, any>} Layout_Source
 */

/**
 * The result of registering a layout description.
 *
 * @typedef {object} Registered_Layouts
 * @property {Record<string, Layout>} layouts
 * @property {Record<string, Layout_Item[]>} fragments
 */

/**
 * Type of a tag, in lower case: the type of `TTag.type` (doc/spec-data-api.md §1).
 *
 * @typedef {"bool" | "byte" | "usint" | "sint" | "int" | "uint" | "word" | "dint" | "udint" | "dword" | "real"} Tag_Type
 */

/**
 * The listeners of the events of a TData that the library emits.
 *
 * @typedef {object} Data_Events
 * @property {(name: string, old_value: number | boolean, new_value: number | boolean) => void} change
 * @property {(data: import("./TData.js").TData) => void} write
 * @property {(kind: "read" | "write", tags: import("./TTag.js").TTag[]) => void} access
 */

/**
 * A class-level access listener: called for the accesses to every TData
 * (doc/spec-data-api.md §2.8).
 *
 * @typedef {(data: import("./TData.js").TData, kind: "read" | "write", tags: import("./TTag.js").TTag[]) => void} Class_Access_Listener
 */

/**
 * The listener of an event of a TData: typed for `change` and `write`, any
 * listener for another name (doc/spec-data-api.md §2.7).
 *
 * @template {string | symbol} E
 * @typedef {E extends keyof Data_Events ? Data_Events[E] : (...args: any[]) => void} Data_Listener
 */

/**
 * The listeners of the events of a TTag that the library emits.
 *
 * @typedef {object} Tag_Events
 * @property {(old_value: number | boolean, new_value: number | boolean) => void} change
 */

/**
 * The listener of an event of a TTag: typed for `change`, any listener for
 * another name (doc/spec-data-api.md §3).
 *
 * @template {string | symbol} E
 * @typedef {E extends keyof Tag_Events ? Tag_Events[E] : (...args: any[]) => void} Tag_Listener
 */

export {};
