// Type tests of the generated declarations (dist/types), checked by `pnpm test:types`.
// The package is imported by its own name, so the "types" of package.json is what
// is tested. A `@ts-expect-error` that no longer fails is an error too.
import { Buffer } from "node:buffer";
import {
	TData, TTag,
	compile_layout, compile_layout_data, layout_of, register_layout, set_access_tracer,
	build_structure, validate_structure,
	io_index_table, render_types,
	type Layout, type Layout_Tag, type Layout_Item, type Data_Struct,
	type Compiled_Layouts, type Access_Tracer, type Endian,
} from "tagged-data";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
function assert_type<_T extends true>() {}

// layout compilation
const compiled: Compiled_Layouts = compile_layout_data({ layouts: {} });
const from_file: Compiled_Layouts = compile_layout("layout.yaml");
const layout: Layout = compiled.layouts.any;
const fragment: Layout_Item[] = from_file.fragments.any;
assert_type<Equal<typeof layout.size, number>>();
assert_type<Equal<typeof layout.name, string>>();
assert_type<Equal<typeof layout.items, readonly Layout_Tag[]>>();
assert_type<Equal<Layout_Tag["coupling"], readonly string[]>>();
// @ts-expect-error the compiled entries are not part of a layout
void layout.entries;
// @ts-expect-error the lookup table is not part of a layout
void layout.tags_at_byte;
// @ts-expect-error a layout is read-only
layout.name = "x";
// @ts-expect-error the items are read-only
layout.items.push({ name: "a", type: "Int", offset: 0, length: 16, init_value: 0, coupling: [] });
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
const tdata = new TData(same_layout, "block");
// @ts-expect-error a structure is compiled by layout_of first: TData takes a layout
new TData(data_struct, "block");
const tag: TTag | undefined = tdata.get("a");
assert_type<Equal<typeof tdata.size, number>>();
assert_type<Equal<typeof tdata.layout, Layout>>();
tdata.name = "renamed";
const done: string = tdata.transaction(() => "done");
assert_type<Equal<typeof done, string>>();
// @ts-expect-error the transaction function is required
tdata.transaction();
tdata.on("write", (written: typeof tdata) => void written.size);
const bytes: Buffer = tdata.read_bytes();
assert_type<Equal<ReturnType<typeof tdata.read_bytes>, Buffer>>();
tdata.read_bytes(2);
tdata.read_bytes(0, 2);
tdata.write_bit(0, 0x01, true);
tdata.write_bytes(0, Buffer.alloc(2));
tdata.write_bytes(0, new Uint8Array(2));
tdata.on("change", () => {});
// @ts-expect-error the bytes are not a property
void tdata.buffer;
// @ts-expect-error detection is not public
tdata.detect();
// @ts-expect-error there are no raw writes classified by width
tdata.write_words(0, [1]);
// @ts-expect-error size is read-only
tdata.size = 1;
// @ts-expect-error layout is read-only
tdata.layout = layout;
// @ts-expect-error the offset is a number
tdata.write_bytes("0", Buffer.alloc(1));
// @ts-expect-error a source is a Uint8Array
tdata.write_bytes(0, [1, 2]);
// @ts-expect-error the length is a number
tdata.read_bytes(0, "2");
// @ts-expect-error a bit value is a boolean
tdata.write_bit(0, 1, 1);

// TTag
if (tag) {
	assert_type<Equal<typeof tag.name, string>>();
	assert_type<Equal<typeof tag.type, string>>();
	assert_type<Equal<typeof tag.length, number>>();
	// @ts-expect-error the compiled entry is not public
	void tag.entry;
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

// device byte order
const endian: Endian = "LEBS";
const table: Int32Array = io_index_table(layout, endian);
tdata.load_tag("a", Buffer.alloc(2), "LE");
tdata.load_tag("a", new Uint8Array(2), "BEBS");
tdata.store_tag("a", new Uint8Array(2), endian);
tag?.load(new Uint8Array(2), "BE");
tag?.store(new Uint8Array(2), "BE");
// @ts-expect-error the byte order is one of the four
io_index_table(layout, "little");
// @ts-expect-error the byte order is one of the four
tdata.load_tag("a", bytes, "big");
// @ts-expect-error the tag is given by name
tdata.load_tag(tag, bytes, "BE");
// @ts-expect-error the IO buffer is a Uint8Array
tdata.store_tag("a", [1, 2], "BE");
// @ts-expect-error the byte order is required
tag?.load(bytes);
// @ts-expect-error the entry functions are not exported
void (await import("tagged-data")).load_entry;

// type rendering
const text: string = render_types(compiled.layouts, { source: "layout.yaml", tdata_module: "tagged-data" });
// @ts-expect-error the options are required
render_types(compiled.layouts);

export { bytes, table, text };
