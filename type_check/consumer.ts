// Type tests of the generated declarations (dist), checked by `pnpm test:types`.
// The package is imported by its own name, so the "types" of package.json is what
// is tested. A `@ts-expect-error` that no longer fails is an error too.
import { Buffer } from "node:buffer";
import {
	Ldata, Ltag,
	create_scope, get_scope, yaml, desc_file,
	type Layout, type Layout_Tag, type Layout_Desc, type Block_Desc, type Description,
	type Registration, type Endian, type Tag_Type, type Layout_Scope,
} from "layout-data";
import { render_types } from "layout-data/dev";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
function assert_type<_T extends true>() {}

// scopes: created by name, got by name
const scope: Layout_Scope = create_scope("app");
assert_type<Equal<typeof scope.name, string>>();
assert_type<Equal<typeof get_scope, (name: string) => Layout_Scope | undefined>>();
assert_type<Equal<typeof scope.get_layout, (name: string) => Layout>>();
// @ts-expect-error the scope name is read-only
scope.name = "other";
// @ts-expect-error a scope name is a string
create_scope(1);
// a scope is made by create_scope only: the class is not exported, and its
// declared constructor is private (scope.constructor is a Function, which no
// type check can construct, so there is nothing more to test here)
// @ts-expect-error there is no global registration
void (await import("layout-data")).register_layout;
// @ts-expect-error a layout is got from its scope
void (await import("layout-data")).get_layout;

// registering layouts: a Description or a list of them, compiled from YAML by yaml and desc_file
const compiled: Registration = scope.register_layout(yaml`layouts: []`);
const from_file: Registration = scope.register_layout(desc_file`layout.yaml`);
const from_list: Registration = scope.register_layout([desc_file("common.yaml"), desc_file(new URL("file:///pump.yaml")), yaml`layouts: []`]);
const descriptions: Description[] = [yaml("layouts: []"), desc_file("pump.yaml")];
scope.register_layout(descriptions);
assert_type<Equal<ReturnType<typeof desc_file>, Description>>();
assert_type<Equal<ReturnType<typeof yaml>, Description>>();
// @ts-expect-error a path is read by desc_file, not by register_layout
scope.register_layout("layout.yaml");
// @ts-expect-error a description object is not a Description
scope.register_layout({ layouts: ["Pump"], item_tables: {} });
// @ts-expect-error a list of descriptions holds no path
scope.register_layout(["common.yaml", yaml`layouts: []`]);
// @ts-expect-error yaml takes text
yaml(1);
// @ts-expect-error desc_file takes a path or a URL
desc_file(1);
// @ts-expect-error yaml_file is desc_file now
void (await import("layout-data")).yaml_file;
void from_list;
const layout: Layout = compiled.layouts.any;
const block_ldata: Ldata = from_file.ldata.any;
void block_ldata;
assert_type<Equal<typeof layout.size, number>>();
assert_type<Equal<typeof layout.name, string>>();
assert_type<Equal<typeof layout.scope, Layout_Scope>>();
assert_type<Equal<typeof layout.items, readonly Layout_Tag[]>>();
assert_type<Equal<Layout_Tag["coupling"], readonly string[]>>();
assert_type<Equal<ReturnType<Layout["get_ldata"]>, Ldata>>();
assert_type<Equal<Layout["delete_ldata"], (name: string) => boolean>>();
// @ts-expect-error the compiled entries are not part of a layout
void layout.entries;
// @ts-expect-error the lookup table is not part of a layout
void layout.tags_at_byte;
// @ts-expect-error a layout is read-only
layout.name = "x";
// @ts-expect-error the items are read-only
layout.items.push({ name: "a", type: "Int", offset: 0, length: 16, init_value: 0, coupling: [] });
// @ts-expect-error the item tables reached are not returned
void from_file.tables;
// @ts-expect-error a description is a Description, not a number
scope.register_layout(1);
// @ts-expect-error the descriptions are required
scope.register_layout();

// a Description: its layouts, not bound to a scope, and its blocks
const description: Description = desc_file("pump.yaml");
const desc: Layout_Desc = description.layouts.Pump;
const block: Block_Desc = description.blocks[0];
assert_type<Equal<typeof desc.items, readonly Layout_Tag[]>>();
assert_type<Equal<typeof block.name, string>>();
assert_type<Equal<typeof block.layout, string>>();
// the other keys of a block belong to the application
void block.unit_id;
// the other root keys of a description are kept as they are
assert_type<Equal<typeof description.settings, unknown>>();
// @ts-expect-error a layout of a Description has no scope
void desc.scope;
// @ts-expect-error a Description is read-only
description.blocks.push(block);
// @ts-expect-error the types of the items are not public
type _Item = import("layout-data").Layout_Item;

// a layout of a Description is used through a scope
const same_layout: Layout = scope.register_layout(yaml`layouts: [s]`).layouts.s;
assert_type<Equal<typeof same_layout, Layout>>();
// @ts-expect-error the old compile names are gone
void (await import("layout-data")).compile_layout;
// @ts-expect-error the file and the data entries are one entry now
void (await import("layout-data")).register_layout_file;
// @ts-expect-error a structure is no longer built in steps
void (await import("layout-data")).build_structure;
// @ts-expect-error the validation is part of the compilation
void (await import("layout-data")).validate_structure;

// Ldata: created by its layout, never with new
const ldata: Ldata = same_layout.create_ldata("block");
assert_type<Equal<ReturnType<Layout["create_ldata"]>, Ldata>>();
// @ts-expect-error the constructor of Ldata is private
new Ldata(same_layout, "block");
// @ts-expect-error there is no creation by layout name: the scope gives the layout
new Ldata("s", "block");
// @ts-expect-error Ldata cannot be extended
class My_Ldata extends Ldata {}
void My_Ldata;
// @ts-expect-error Layout is a type only
void (await import("layout-data")).Layout;
// @ts-expect-error a copy of a layout has no methods
({ ...same_layout }).create_ldata("block");
const tag: Ltag | undefined = ldata.get("a");
assert_type<Equal<typeof ldata.size, number>>();
assert_type<Equal<typeof ldata.layout, Layout>>();
assert_type<Equal<typeof ldata.name, string>>();
// @ts-expect-error name is read-only
ldata.name = "renamed";
// @ts-expect-error the name is a string
same_layout.create_ldata(1);
// @ts-expect-error the name is required
same_layout.create_ldata();
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
const table: Int32Array = layout.io_index_table(endian);
ldata.load_tag("a", Buffer.alloc(2), "LE");
ldata.load_tag("a", new Uint8Array(2), "BEBS");
ldata.store_tag("a", new Uint8Array(2), endian);
tag?.load(new Uint8Array(2), "BE");
tag?.store(new Uint8Array(2), "BE");
// @ts-expect-error the byte order is one of the four
layout.io_index_table("little");
// @ts-expect-error io_index_table is a method of the layout
void (await import("layout-data")).io_index_table;
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

// type rendering: from Descriptions, in the development entry
const text: string = render_types(desc_file`layout.yaml`, { scope: "app", source: "layout.yaml" });
render_types(desc_file("layout.yaml"));
render_types(yaml`layouts: []`);
render_types([desc_file("common.yaml"), yaml`layouts: []`], { scope: "app" });
assert_type<Equal<Parameters<typeof render_types>[0], Description | Description[]>>();
// @ts-expect-error a path is read by desc_file
render_types("layout.yaml");
// @ts-expect-error a scope is not a description
render_types(scope);
// @ts-expect-error a description object is not a Description
render_types({ layouts: [] });
// @ts-expect-error the source is a string
render_types(description, { source: 1 });
// @ts-expect-error the scope is a name
render_types(description, { scope: 1 });
// @ts-expect-error the module of Ldata is not an option
render_types(description, { ldata_module: "layout-data" });
// @ts-expect-error the types are rendered by the development entry, not by a scope
void scope.render_types;
// @ts-expect-error the run-time entry does not render types
void (await import("layout-data")).render_types;

export { bytes, table, text };
