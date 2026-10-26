// Type tests of the generated declarations (dist/types), checked by `pnpm test:types`.
// The package is imported by its own name, so the "types" of package.json is what
// is tested. A `@ts-expect-error` that no longer fails is an error too.
import { Buffer } from "node:buffer";
import {
	Ldata, Ltag,
	register_layout, get_layout,
	io_index_table, render_types,
	type Layout, type Layout_Tag, type Layout_Item,
	type Tag_Item, type Include_Item, type Layout_Description,
	type Registered_Layouts, type Endian, type Tag_Type,
} from "layout-data";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
function assert_type<_T extends true>() {}

// registering layouts: a description file, a description object, or a list of them
const compiled: Registered_Layouts = register_layout({ layouts: {} });
const from_file: Registered_Layouts = register_layout("layout.yaml");
const from_list: Registered_Layouts = register_layout(["common.yaml", "pump.yaml", { layouts: {} }]);
const descriptions: Array<string | Layout_Description> = ["a.yaml", { layouts: {} }];
register_layout(descriptions);
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
// @ts-expect-error a description is a path or a description object, not a number
register_layout(1);
// @ts-expect-error the descriptions are required
register_layout();

// the entries of a description: a tag, or an inclusion
const tag_item: Tag_Item = { name: "a", type: "UInt", offset: 0, init_value: 1, comment: "first", length: 16 };
const include_item: Include_Item = { includes: "common", offset: 16, name_prefix: "p_" };
const combined: Tag_Item = {
	name: "w", type: "Word", offset: 32, is_combined: true,
	coupling: [{ name: "b", type: "Bool", offset: 0 }],
};
const coupled_by_name: Tag_Item = { name: "w2", type: "Word", offset: 48, coupling: "bits" };
const inline_include: Include_Item = { includes: [tag_item, combined], offset: 0 };
const either: Layout_Item[] = [tag_item, include_item, combined, coupled_by_name, inline_include];
// @ts-expect-error an inclusion has no type
const typed_include: Include_Item = { includes: "common", offset: 0, type: "UInt" };
// @ts-expect-error an inclusion has no name
const named_include: Include_Item = { includes: "common", offset: 0, name: "x" };
// @ts-expect-error a tag does not include entries
const including_tag: Tag_Item = { name: "a", type: "UInt", offset: 0, includes: "common" };
// @ts-expect-error the bits of a combined word are entries or a fragment name, not a list of names
const named_bits: Tag_Item = { name: "w", type: "Word", offset: 0, coupling: ["a", "b"] };
// @ts-expect-error a tag needs a name
const nameless: Layout_Item = { type: "UInt", offset: 0 };
// @ts-expect-error a tag needs an offset
const offsetless: Layout_Item = { name: "a", type: "UInt" };
const description: Layout_Description = { layouts: { Pump: either }, common: [tag_item] };
register_layout(description);
register_layout({ layouts: { Pump: [{ name: "a", type: "UInt", offset: 0 }] }, common: [{ name: "b", type: "Byte", offset: 0 }] });
// @ts-expect-error a field of an entry is misspelled
register_layout({ layouts: { Pump: [{ name: "a", type: "UInt", offest: 0 }] } });
// @ts-expect-error layouts maps layout names to lists of entries
register_layout({ layouts: [] });
// @ts-expect-error a fragment is a list of entries
register_layout({ layouts: {}, common: 3 });
void [typed_include, named_include, including_tag, named_bits, nameless, offsetless];

// items given in code are a description, registered and then used by name
const items: Layout_Item[] = [{ name: "a", type: "word", offset: 0, init_value: 1 }];
const same_layout: Layout = register_layout({ layouts: { s: items } }).layouts.s;
assert_type<Equal<typeof same_layout, Layout>>();
assert_type<Equal<typeof get_layout, (name: string) => Layout>>();
// @ts-expect-error the old compile names are gone
void (await import("layout-data")).compile_layout;
// @ts-expect-error the file and the data entries are one entry now
void (await import("layout-data")).register_layout_file;
// @ts-expect-error a structure is no longer built in steps
void (await import("layout-data")).build_structure;
// @ts-expect-error the validation is part of the registration
void (await import("layout-data")).validate_structure;

// Ldata
const ldata = new Ldata(same_layout, "block");
// @ts-expect-error a list of items is registered first: Ldata takes a layout
new Ldata(items, "block");
const tag: Ltag | undefined = ldata.get("a");
assert_type<Equal<typeof ldata.size, number>>();
assert_type<Equal<typeof ldata.layout, Layout>>();
assert_type<Equal<typeof ldata.name, string>>();
// @ts-expect-error name is read-only
ldata.name = "renamed";
// @ts-expect-error the name is a string
new Ldata(same_layout, 1);
const done: string = ldata.transaction(() => "done");
assert_type<Equal<typeof done, string>>();
// @ts-expect-error the transaction function is required
ldata.transaction();
ldata.on("write", (written: typeof ldata) => void written.size);
const bytes: Buffer = ldata.read_bytes();
assert_type<Equal<ReturnType<typeof ldata.read_bytes>, Buffer>>();
ldata.read_bytes(2);
ldata.read_bytes(0, 2);
ldata.write_bit(0, 0x01, true);
assert_type<Equal<ReturnType<typeof ldata.read_bit>, boolean>>();
ldata.write_bytes(0, Buffer.alloc(2));
ldata.write_bytes(0, new Uint8Array(2));
ldata.on("change", () => {});
ldata.on("change", (name, old_value, new_value) => void [name.length, old_value, new_value]);
ldata.once("write", (written) => void written.size);
ldata.off("write", (written: Ldata) => void written);
// @ts-expect-error the listener of change gets a name first
ldata.on("change", (old_value: number) => void old_value);
// @ts-expect-error the listener of write gets the data block
ldata.on("write", (written: string) => void written);
// the events of the user's own take any listener
ldata.on("alarm", (level: number, text: string) => void [level, text]);
ldata.emit("alarm", 1, "high");
// @ts-expect-error the reserved check is not public
Ldata.is_reserved_name("get");
// @ts-expect-error the bytes are not a property
void ldata.buffer;
// @ts-expect-error detection is not public
ldata.detect();
// @ts-expect-error there are no raw writes classified by width
ldata.write_words(0, [1]);
// @ts-expect-error size is read-only
ldata.size = 1;
// @ts-expect-error layout is read-only
ldata.layout = layout;
// @ts-expect-error the offset is a number
ldata.write_bytes("0", Buffer.alloc(1));
// @ts-expect-error a source is a Uint8Array
ldata.write_bytes(0, [1, 2]);
// @ts-expect-error the length is a number
ldata.read_bytes(0, "2");
// @ts-expect-error a bit value is a boolean
ldata.write_bit(0, 1, 1);
// @ts-expect-error the mask is required
ldata.read_bit(0);

// Ltag
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
ldata.on("access", (kind, tags) => {
	assert_type<Equal<typeof kind, "read" | "write">>();
	assert_type<Equal<typeof tags, Ltag[]>>();
});
ldata.once("access", (kind: "read" | "write", tags: Ltag[]) => void [kind, tags.length]);
// @ts-expect-error the kind is "read" or "write"
ldata.on("access", (kind: "erase") => void kind);
// @ts-expect-error the tags are Ltag handles, not names
ldata.on("access", (_kind, tags: string[]) => void tags);
// class-level listeners see every ldata
const class_listener = (data: Ldata, kind: "read" | "write", tags: Ltag[]) => void [data.size, kind, tags.length];
Ldata.on_access(class_listener);
Ldata.on_access((data, kind, tags) => {
	assert_type<Equal<typeof data, Ldata>>();
	assert_type<Equal<typeof kind, "read" | "write">>();
	assert_type<Equal<typeof tags, Ltag[]>>();
});
Ldata.off_access(class_listener);
// @ts-expect-error the class listener gets the ldata first
Ldata.on_access((kind: "read" | "write") => void kind);
// @ts-expect-error a listener is a function
Ldata.on_access("x");
// @ts-expect-error the global single-slot tracer is gone
void (await import("layout-data")).set_access_tracer;

// device byte order
const endian: Endian = "LEBS";
const table: Int32Array = io_index_table(layout, endian);
ldata.load_tag("a", Buffer.alloc(2), "LE");
ldata.load_tag("a", new Uint8Array(2), "BEBS");
ldata.store_tag("a", new Uint8Array(2), endian);
tag?.load(new Uint8Array(2), "BE");
tag?.store(new Uint8Array(2), "BE");
// @ts-expect-error the byte order is one of the four
io_index_table(layout, "little");
// @ts-expect-error the byte order is one of the four
ldata.load_tag("a", bytes, "big");
// @ts-expect-error the tag is given by name
ldata.load_tag(tag, bytes, "BE");
// @ts-expect-error the IO buffer is a Uint8Array
ldata.store_tag("a", [1, 2], "BE");
// @ts-expect-error the byte order is required
tag?.load(bytes);
// @ts-expect-error the entry functions are not exported
void (await import("layout-data")).load_entry;

// type rendering
const text: string = render_types(compiled.layouts, { source: "layout.yaml", ldata_module: "layout-data" });
render_types(compiled.layouts);
render_types(compiled.layouts, { source: "layout.yaml" });
render_types(compiled.layouts, { ldata_module: "../src/index.js" });
// @ts-expect-error the source is a string
render_types(compiled.layouts, { source: 1 });
// @ts-expect-error the layouts are registered layouts
render_types({ Pump: 1 });

export { bytes, table, text };
