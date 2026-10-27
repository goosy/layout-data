// The public interface the tests under test/api run against (doc/design.md §7):
// the source entries by default, or the bundles in dist when test/api/dist.js
// is imported first (node --test --import ./test/api/dist.js).
const DIST = process.env.LAYOUT_DATA_TEST_TARGET === "dist";

/** "src" or "dist": what the tests run against. */
export const TARGET = DIST ? "dist" : "src";

/** The run-time entry layout-data. */
export const index = DIST ? await import("layout-data") : await import("../../src/index.js");

/** The development entry layout-data/dev. */
export const dev = DIST ? await import("layout-data/dev") : await import("../../src/dev.js");

export const { Ldata, Ltag, create_scope, get_scope } = index;
export const { render_types } = dev;
