// Package-internal keys (doc/design.md §1): Symbol-keyed members that one
// file of the package defines and another one uses, so that no static block
// or module variable relays a private member. index.js never exports them, and
// the "exports" of package.json opens no other file, so a user cannot reach
// them by mistake. Each key names the file that defines it and its users.

/**
 * The static method `Ldata[LDATA_FACTORY](layout, compiled)`: builds the class
 * of a layout and returns the function that creates its ldata. Defined by
 * Ldata.js, called by layout.js when a Layout is constructed.
 */
export const LDATA_FACTORY = Symbol("ldata factory");

/**
 * The read-only getter `layout[COMPILED]`: the compiled data of a layout.
 * Defined by layout.js, read by the tests.
 */
export const COMPILED = Symbol("compiled");

/**
 * The property `description[ORIGIN]`: the path of the description file a
 * description object was read from, not enumerable. Defined by yaml.js, read
 * by layout.js and dev.js. A registered Symbol, not a Symbol of its own: each
 * entry is bundled with its own copy of yaml.js, and an object read by the
 * yaml_file of one entry is given to the other.
 */
export const ORIGIN = Symbol.for("layout-data.origin");
