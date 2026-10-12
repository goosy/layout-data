// Public interface of the package (doc/design.md §1).
export { TData } from "./TData.js";
export { TTag } from "./TTag.js";
export { compile_layout, compile_layout_data, layout_of, set_access_tracer } from "./layout.js";
export { build_structure, validate_structure } from "./structure.js";
export { io_index_table, load_entry, store_entry } from "./endian.js";
export { render_types } from "./types.js";
export * from "./typedefs.js";
