// Type tests of the generated declarations (dist/types), checked by `pnpm test:types`.
// The package is imported by its own name, so the "types" of package.json is what
// is tested. A `@ts-expect-error` that no longer fails is an error too.
import { Buffer } from "node:buffer";
import {
	TData, TTag,
	compile_layout, compile_layout_data, layout_of, register_layout, set_access_tracer,
	build_structure, validate_structure,
	io_index_table, load_entry, store_entry, render_types,
	type Layout, type Layout_Entry, type Layout_Item, type Data_Struct,
	type TData_Options, type Compiled_Layouts, type Access_Tracer,
} from "tagged-data";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
function assert_type<_T extends true>() {}

// layout compilation
const compiled: Compiled_Layouts = compile_layout_data({ layouts: {} });
const from_file: Compiled_Layouts = compile_layout("layout.yaml");
const layout: Layout = compiled.layouts.any;
const fragment: Layout_Item[] = from_file.fragments.any;
assert_type<Equal<typeof layout.entries, Map<string, Layout_Entry>>>();
assert_type<Equal<typeof layout.size, number>>();
assert_type<Equal<typeof fragment, Layout_Item[]>>();
compile_layout_data({ layouts: {} }, "origin");
// @ts-expect-error the path must be a string
compile_layout(1);

// structures
const items: Layout_Item[] = [{ name: "a", type: "word", offset: 0, init_value: 1 }];
const data_struct: Data_Struct = build_structure({ name: "s" }, items);
const errors: string[] = validate_structure(data_struct);
const same_layout: Layout = register_layout(data_struct);
assert_type<Equal<typeof errors, string[]>>();
// @ts-expect-error an item needs a type and an offset
build_structure({ name: "s" }, [{ name: "a" }]);

// TData
const options: TData_Options = { detection: "deferred" };
const tdata = new TData(same_layout, "block", options);
// @ts-expect-error a structure is compiled by layout_of first: TData takes a layout
new TData(data_struct, "block");
const tag: TTag | undefined = tdata.get("a");
assert_type<Equal<typeof tdata.buffer, Buffer>>();
assert_type<Equal<typeof tdata.size, number>>();
assert_type<Equal<typeof tdata.layout, Layout>>();
tdata.name = "renamed";
tdata.detect();
tdata.on("write", (written: typeof tdata) => void written.size);
tdata.write_register(0, 1);
tdata.write_bit(0, 0x01, true);
tdata.write_bytes(0, Buffer.alloc(2));
tdata.on("change", () => {});
// @ts-expect-error buffer is read-only
tdata.buffer = Buffer.alloc(1);
// @ts-expect-error size is read-only
tdata.size = 1;
// @ts-expect-error layout is read-only
tdata.layout = layout;
// @ts-expect-error the offset is a number
tdata.write_register("0", 1);
// @ts-expect-error a bit value is a boolean
tdata.write_bit(0, 1, 1);
// @ts-expect-error unknown detection mode
new TData(same_layout, "block", { detection: "lazy" });

// TTag
if (tag) {
	assert_type<Equal<typeof tag.name, string>>();
	assert_type<Equal<typeof tag.type, string>>();
	assert_type<Equal<typeof tag.length, number>>();
	assert_type<Equal<typeof tag.entry, Layout_Entry>>();
	assert_type<Equal<typeof tag.value, number | boolean>>();
	tag.value = 1;
	tag.value = true;
	// @ts-expect-error a value is a number or a boolean
	tag.value = "1";
	// @ts-expect-error the name is read-only
	tag.name = "x";
}

// access tracer
const tracer: Access_Tracer = (_tdata, _name, kind) => void kind.length;
set_access_tracer(tracer);
set_access_tracer(null);
// @ts-expect-error the kind is "read" or "write"
set_access_tracer((_tdata: TData, _name: string, kind: "erase") => void kind);

// endian conversion
const entry: Layout_Entry = layout.entries.get("a")!;
const table: Int32Array = io_index_table(layout, "BEBS");
load_entry(entry, Buffer.alloc(2), tdata.buffer, "LE");
store_entry(entry, tdata.buffer, Buffer.alloc(2), "LE");
// @ts-expect-error the endian is a string
io_index_table(layout, 1);

// type rendering
const text: string = render_types(compiled.layouts, { source: "layout.yaml", tdata_module: "tagged-data" });
// @ts-expect-error the options are required
render_types(compiled.layouts);

export { table, text };
