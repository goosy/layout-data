// Type definitions of the public interface. This file has no run-time content:
// the JSDoc here is the source of the generated declaration files (dist).
// The types of the internals are in internal_types.js and are not exported.

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
 * One item of an item table, as written by the user in a description file
 * or a description object (doc/spec-description.md §3).
 *
 * @typedef {Tag_Item | Include_Item} Layout_Item
 */

/**
 * A description object, the form of a layout description in code (a
 * description file is the YAML form): `layouts` lists layout names, and
 * `item_tables` maps item table names to lists of items; other root keys may
 * hold anything and are not read (doc/spec-description.md §2).
 *
 * @typedef {{ layouts?: string[], item_tables?: Record<string, Layout_Item[]> } & Record<string, unknown>} Layout_Description
 */

/**
 * One tag of a compiled layout (doc/spec-layout.md §4), read-only:
 * `name`; `type`, as written in the description; `offset`, the absolute bit
 * offset; `length` in bits; `init_value` and `comment`, if given; `coupling`,
 * the tag names of the bits of a combined word, or of the combined words a
 * bit belongs to.
 *
 * @typedef {Readonly<{
 *   name: string,
 *   type: string,
 *   offset: number,
 *   length: number,
 *   init_value?: number | boolean,
 *   comment?: string,
 *   coupling: readonly string[],
 * }>} Layout_Tag
 */

/**
 * A compiled layout (doc/spec-layout.md §4), read-only and deeply frozen:
 * `name`; `scope`, the scope it is registered in; `length` in bits; `size`
 * in bytes; `items`, the tags in layout order (a combined word before its
 * bits); the methods `create_ldata(name)` and `io_index_table(endian)`. A type only: the class is not exported, and
 * only a registration makes a layout.
 *
 * @typedef {import("./layout.js").Layout} Layout
 */

/**
 * A scope of layout names (doc/spec-layout.md §2): read-only `name`; the
 * methods `register_layout(descriptions)` and `get_layout(name)`. Frozen. A
 * type only: the class is not exported, and only create_scope makes a scope.
 *
 * @typedef {import("./scope.js").Layout_Scope} Layout_Scope
 */

/**
 * Device byte order of an IO buffer (doc/spec-data-api.md §2.9).
 *
 * @typedef {"BE" | "LE" | "BEBS" | "LEBS"} Endian
 */

/**
 * The result of registering a layout description.
 *
 * @typedef {object} Registered_Layouts
 * @property {Record<string, Layout>} layouts
 * @property {Record<string, Layout_Item[]>} tables - Every item table reached from `layouts`, references expanded.
 */

/**
 * Type of a tag, in lower case: the type of `Ltag.type` (doc/spec-data-api.md §1).
 *
 * @typedef {"bool" | "byte" | "usint" | "sint" | "int" | "uint" | "word" | "dint" | "udint" | "dword" | "real"} Tag_Type
 */

/**
 * The listeners of the events of an Ldata that the library emits.
 *
 * @typedef {object} Data_Events
 * @property {(name: string, old_value: number | boolean, new_value: number | boolean) => void} change
 * @property {(data: import("./Ldata.js").Ldata) => void} write
 * @property {(kind: "read" | "write", tags: import("./Ltag.js").Ltag[]) => void} access
 */

/**
 * A class-level access listener: called for the accesses to every Ldata
 * (doc/spec-data-api.md §2.8).
 *
 * @typedef {(data: import("./Ldata.js").Ldata, kind: "read" | "write", tags: import("./Ltag.js").Ltag[]) => void} Class_Access_Listener
 */

/**
 * The listener of an event of an Ldata: typed for `change` and `write`, any
 * listener for another name (doc/spec-data-api.md §2.7).
 *
 * @template {string | symbol} E
 * @typedef {E extends keyof Data_Events ? Data_Events[E] : (...args: any[]) => void} Data_Listener
 */

/**
 * The listeners of the events of an Ltag that the library emits.
 *
 * @typedef {object} Tag_Events
 * @property {(old_value: number | boolean, new_value: number | boolean) => void} change
 */

/**
 * The listener of an event of an Ltag: typed for `change`, any listener for
 * another name (doc/spec-data-api.md §3).
 *
 * @template {string | symbol} E
 * @typedef {E extends keyof Tag_Events ? Tag_Events[E] : (...args: any[]) => void} Tag_Listener
 */

export {};
