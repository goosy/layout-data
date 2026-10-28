// Type definitions of the public interface. This file has no run-time content:
// the JSDoc here is the source of the generated declaration files (dist).
// The types of the internals are in internal_types.js and are not exported.

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
 * bits); the methods `create_ldata(name)`, `get_ldata(name)`,
 * `delete_ldata(name)` and `io_index_table(endian)`. A type only: the class is
 * not exported, and only a registration makes a layout.
 *
 * @typedef {import("./layout.js").Layout} Layout
 */

/**
 * A compiled layout of a Description, not bound to a scope
 * (doc/spec-description.md §1.2): a Layout without `scope`, which creates no
 * ldata.
 *
 * @typedef {Omit<Layout, "scope">} Layout_Desc
 */

/**
 * A checked entry of the root key `blocks` of a description
 * (doc/spec-description.md §2): the ldata instance `name` and its `layout`,
 * written `<scope>.<layout>`; the other keys belong to the application.
 *
 * @typedef {{ name: string, layout: string } & Record<string, unknown>} Block_Desc
 */

/**
 * A description compiled by yaml or desc_file (doc/spec-description.md §1.2),
 * deeply frozen: the root parsed from the YAML, where `layouts` maps the layout
 * names of the description to its unbound layouts and `blocks` lists its block
 * entries; the other root keys are kept as they are.
 *
 * @typedef {{ readonly layouts: Readonly<Record<string, Layout_Desc>>, readonly blocks: readonly Readonly<Block_Desc>[] } & Readonly<Record<string, unknown>>} Description
 */

/**
 * A scope managing a group of layouts (doc/spec-layout.md §2): read-only
 * `name`; the methods `register_layout(descriptions)` and `get_layout(name)`. Frozen. A
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
 * The result of a call of register_layout (doc/spec-layout.md §3).
 *
 * @typedef {object} Registration
 * @property {Record<string, Layout>} layouts - The layouts of the call by name, bound to the scope.
 * @property {Record<string, import("./Ldata.js").Ldata>} ldata - The ldata created by the blocks of the call, by block name.
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
