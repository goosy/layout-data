// Public interface of the package (doc/design.md §1).
export { TData, set_access_tracer } from "./TData.js";
export { TTag } from "./TTag.js";
export { compile_layout, compile_layout_data, register_layout } from "./layout.js";
export { layout_of } from "./registry.js";
export { build_structure, validate_structure } from "./structure.js";
export { io_index_table } from "./endian.js";
export { render_types } from "./types.js";
export * from "./typedefs.js";
