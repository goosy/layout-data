// Type tests of the generated declarations (dist/types), checked by `pnpm test:types`.
// The package is imported by its own name, so the "types" of package.json is what
// is tested. A `@ts-expect-error` that no longer fails is an error too.
import { Buffer } from "node:buffer";
import {
	TData, TTag,
	register_layout, get_layout,
	io_index_table, render_types,
	type Layout, type Layout_Tag, type Layout_Item, type Layout_Source,
	type Registered_Layouts, type Endian, type Tag_Type,
} from "tagged-data";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
function assert_type<_T extends true>() {}

// registering layouts: a file, a parsed description, or a list of them
const compiled: Registered_Layouts = register_layout({ layouts: {} });
const from_file: Registered_Layouts = register_layout("layout.yaml");
const from_list: Registered_Layouts = register_layout(["common.yaml", "pump.yaml", { layouts: {} }]);
const sources: Layout_Source[] = ["a.yaml", { layouts: {} }];
register_layout(sources);
void from_list;
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
// @ts-expect-error a source is a path or a description, not a number
register_layout(1);
// @ts-expect-error the sources are required
register_layout();

// items given in code are a description, registered and then used by name
const items: Layout_Item[] = [{ name: "a", type: "word", offset: 0, init_value: 1 }];
const same_layout: Layout = register_layout({ layouts: { s: items } }).layouts.s;
assert_type<Equal<typeof same_layout, Layout>>();
assert_type<Equal<typeof get_layout, (name: string) => Layout>>();
// @ts-expect-error the old compile names are gone
void (await import("tagged-data")).compile_layout;
// @ts-expect-error the file and the data entries are one entry now
void (await import("tagged-data")).register_layout_file;
// @ts-expect-error a structure is no longer built in steps
void (await import("tagged-data")).build_structure;
// @ts-expect-error the validation is part of the registration
void (await import("tagged-data")).validate_structure;

// TData
const tdata = new TData(same_layout, "block");
// @ts-expect-error a list of items is registered first: TData takes a layout
new TData(items, "block");
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
tdata.on("change", (name, old_value, new_value) => void [name.length, old_value, new_value]);
tdata.once("write", (written) => void written.size);
tdata.off("write", (written: TData) => void written);
// @ts-expect-error the listener of change gets a name first
tdata.on("change", (old_value: number) => void old_value);
// @ts-expect-error the listener of write gets the data block
tdata.on("write", (written: string) => void written);
// the events of the user's own take any listener
tdata.on("alarm", (level: number, text: string) => void [level, text]);
tdata.emit("alarm", 1, "high");
// @ts-expect-error the reserved check is not public
TData.is_reserved_name("get");
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
	assert_type<Equal<typeof tag.type, Tag_Type>>();
	assert_type<Equal<typeof tag.size, number>>();
	// @ts-expect-error length is in bits, a tag has a size in bytes
	void tag.length;
	// @ts-expect-error a misspelled type is not a Tag_Type
	void (tag.type === "itn");
	const type_name: string = ((type: Tag_Type) => {
		switch (type) {
			case "bool": return "Bool";
			case "real": return "Real";
			default: return type;
		}
	})(tag.type);
	void type_name;
	tag.on("change", (old_value, new_value) => void [old_value, new_value]);
	// @ts-expect-error the change of a tag has two numbers or booleans
	tag.on("change", (old_value: string) => void old_value);
	tag.on("other", (anything: string) => void anything);
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

// observing the accesses
tdata.on("access", (kind, tags) => {
	assert_type<Equal<typeof kind, "read" | "write">>();
	assert_type<Equal<typeof tags, TTag[]>>();
});
tdata.once("access", (kind: "read" | "write", tags: TTag[]) => void [kind, tags.length]);
// @ts-expect-error the kind is "read" or "write"
tdata.on("access", (kind: "erase") => void kind);
// @ts-expect-error the tags are TTag handles, not names
tdata.on("access", (_kind, tags: string[]) => void tags);
// class-level listeners see every tdata
const class_listener = (data: TData, kind: "read" | "write", tags: TTag[]) => void [data.size, kind, tags.length];
TData.on_access(class_listener);
TData.on_access((data, kind, tags) => {
	assert_type<Equal<typeof data, TData>>();
	assert_type<Equal<typeof kind, "read" | "write">>();
	assert_type<Equal<typeof tags, TTag[]>>();
});
TData.off_access(class_listener);
// @ts-expect-error the class listener gets the tdata first
TData.on_access((kind: "read" | "write") => void kind);
// @ts-expect-error a listener is a function
TData.on_access("x");
// @ts-expect-error the global single-slot tracer is gone
void (await import("tagged-data")).set_access_tracer;

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
