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
