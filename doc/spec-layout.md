# Layout Specification

> English version of [spec-layout.zh-cn.md](spec-layout.zh-cn.md), the primary Chinese version. When the two differ, update both.
>
> This document defines the description, the registration and the object of a layout. It refines [spec.md](spec.md). The data objects created from a layout (Ldata / Ltag) are in [spec-data-api.md](spec-data-api.md), the implementation in §3 of [design.md](design.md).

## 1. Flow

The flow is **register once, get the layout, create from it**: the layouts are described (§2 to §4), all of them are registered by one call of `register_layout` (§5), and from then on `get_layout("Pump")` gets a layout by its name and its `create_ldata("pump_1")` creates data blocks ([spec-data-api.md](spec-data-api.md) §2.1). The user needs to know how to express a layout as a YAML structure and which name it has; whether it is compiled, and into what, is not part of the flow.

## 2. Structure

A description can define several layouts at once. It takes one of two forms with the same structure: a **description file**, a YAML 1.2 file given by its path, and a **description object**, the same structure in code (§6). The structure is:

- The root key `layouts`: a mapping from layout names (such as `NODE`) to lists of entries;
- Every other root key is a fragment: its key is the fragment name and its value a list of entries, which entries can reference by name.

```yaml
node_commands:              # a fragment
  - { name: stop_pumps, type: Bool, offset: 8, init_value: false, comment: Stop pump command }
  - { name: cancel_stop, type: Bool, offset: 9, comment: Cancel stop pump }

layouts:
  NODE:
    - { name: ID, type: UInt, offset: 0, init_value: 0 }
    - name: response_code
      type: Word
      offset: 128
      coupling: node_commands
    - { includes: node_parameters, offset: 144 }
```

A description is complete in itself or is one of several descriptions registered together (§5): it may hold only fragments, only layouts, or both, and the fragments of every description are available to the layouts of every description.

## 3. Entries

| Field | Description |
| --- | --- |
| `name` | The tag name: letters, digits and `_`, not starting with a digit, an identifier in every language, so that a tag is always written `data.name` and is the same as the field of a data block in a PLC. Unique within a layout, not a reserved name ([spec-data-api.md](spec-data-api.md) §2.10). If the point table of a device names the point otherwise, put that name in the `comment` |
| `type` | One of the types listed in [spec-data-api.md](spec-data-api.md) §1, case-insensitive |
| `offset` | Bit offset; a non-Bool must be on a whole byte, a multi-byte type must start at an even byte |
| `length` | Length in bits; may be omitted, in which case the type decides it; when written it must match the type |
| `init_value` | Initial value, which must be representable by the type (an integer inside the range of the type; for a `Real`, a finite number inside the float32 range); see below for combined words and their bits |
| `comment` | Optional description, used to generate point tables, type declarations and so on |
| `coupling` | The bits of a combined word: a fragment name or an inline list of entries; the `offset` of each bit is relative to the word |
| `is_combined` | Optional descriptive mark of a combined word whose word and bits are linked in both directions; the linkage is decided by `coupling` and does not depend on it |
| `includes` | Together with `offset` (and optionally `name_prefix`), splices in the entries given by a fragment name or an inline list, shifted as a whole |

Entries in a fragment may reference other fragments too.

There are two kinds of entry, and the declarations name them (`Layout_Item` is either of the two):

| Entry | Fields | Declaration |
| --- | --- | --- |
| A tag | `name`, `type`, `offset` are required; `length`, `init_value`, `comment`, `is_combined`, `coupling` are optional; it has no `includes` | `Tag_Item` |
| An inclusion | `includes` and `offset` are required; `name_prefix` is optional; it has no `name` and no `type` | `Include_Item` |

- `coupling` is a fragment name or an inline list of tag entries, never a list of names: the names of the bits are a result of the registration (they appear in `Layout_Tag.coupling`, §7), not an input;
- A description object has the declaration `Layout_Description`: `layouts`, a mapping from layout names to lists of entries, and one list of entries for each fragment. In the declarations the parameter of `register_layout` is typed with it (`string | Layout_Description`, or a list of them), so that an editor completes the fields of an entry and notices a misspelled one;
- The `fragments` that `register_layout` returns hold the entries with the references expanded: `includes` and `coupling` are lists of entries, never names, and every `length` is present. Their declaration is the same `Layout_Item`.

## 4. Validity

- Layout names are identifiers of JavaScript (letters of any script, digits, `_` and `$`, not starting with a digit), as a layout name is part of type names (§8);
- Tag names are identifiers (letters, digits and `_`, not starting with a digit; a number, an empty name or a missing name is not one), are unique and are not reserved names ([spec-data-api.md](spec-data-api.md) §2.10);
- The byte ranges of non-Bool tags do not overlap; each bit belongs to at most one Bool;
- A Bool inside the byte range of a non-Bool tag must be a bit (`coupling`) of that tag; every bit of a combined word must lie inside the word;
- Only one side of a combined word and its bits gives the initial value: if the word gives it, the initial values of the bits come from the whole word; otherwise they come from the bits (a bit without a value is `false`) and the word is composed from them;
- The total length of a layout is a whole number of registers (a multiple of 16 bits);
- Referenced fragments must exist, and fragments must not reference each other in a cycle.

## 5. Registering

```js
register_layout("pump.yaml");                                     // one file
register_layout(["common.yaml", "pump.yaml", "valve.yaml"]);      // several files
register_layout(["common.yaml", { layouts: { INLINE: [...] } }]); // description files and objects
const pump = get_layout("Pump").create_ldata("pump_1");           // from then on, get the layout and create
```

`register_layout(descriptions)` registers the layouts of the descriptions. A layout can be used only after it is registered.

- `descriptions`: one description or a list of descriptions, each either **a string, the path of a description file**, or **an object, a description object** (the structure of §2: `layouts` plus the fragments; this is also how items are given in code, §6). A list does not hold lists, and an empty list is an error. A string is always a path, never YAML text;
- **Once per process.** The layouts are registered by one call, so that the layouts and fragments are all known together and nothing depends on the order of calls. A second call throws `Error` (`register_layout can be called only once`), and the layouts of the first stay. A call that fails registers nothing and does not use up the call, so the program may go on to register something else, for example a default description when its own file is not valid;
- **The descriptions are merged, then resolved.** The layouts and the fragments of all the descriptions are collected first, and only then are the fragment references resolved, so a layout may name a fragment of any description, whatever the order of the list. A description needs no `layouts` key (a file of common fragments has none), but at least one description must define a layout;
- The same fragment name or the same layout name in two descriptions is an error naming both (a description file by its path, a description object by its position in the list, `layout description #2`); nothing is overridden;
- Every layout is validated (§4), the omitted `length`s are filled in, and the descriptions given are not changed;
- Any violation throws an `Error` whose `errors` property lists all violations of all descriptions, and nothing is registered: the descriptions are registered all or none. An unreadable file and a YAML syntax error are violations too. The layout and fragment errors name the layout or fragment, not the file;
- Return value: `{ layouts, fragments }` for all the descriptions. `layouts` holds the registered layouts by name, as `get_layout(name)` returns them; `fragments` holds the entry lists by fragment name (references expanded, offsets relative to the start of the fragment), for the user to query, for example to get all tag names of a parameter block. Neither is needed for the flow above;
- A layout name stays registered for the life of the process. `get_layout(name)` returns the registered layout (read-only, §7) and throws `unknown layout X` for a name that is not registered;
- Consequences of registering once: a changed layout file takes effect only in a new process (no hot reload, and a REPL or a test cannot register a changed layout again); a library built on layout-data cannot call `register_layout` itself, it can only export the paths of its description files for the application to put in `descriptions`.
- When the dependency tree holds two copies of the package (for example two versions), they share nothing: each allows its own single call of `register_layout`, and a layout registered through one is not found by name through the other.

## 6. Defining a layout in code

A layout needs no file. Give a description object, the structure of §2, to `register_layout` (§5), with the items of a layout as a list under its name:

```js
register_layout({
  layouts: {
    Pump: [
      { name: "id", type: "UInt", offset: 0, init_value: 0 },
      { name: "pressure", type: "Real", offset: 32, init_value: 0 },
    ],
  },
});
const data = get_layout("Pump").create_ldata("pump_1");
```

- the items are the entries of §3; `length` may be omitted; `coupling` and `includes` take an inline list or the name of a fragment of any of the descriptions;
- the description object and the entries in it are not changed;
- there is no separate function that registers one list of items, nor any that expands or validates a structure by itself: registration is the single step that validates (§5).

## 7. The layout object

A layout (`Layout`) is a read-only object with methods that exposes only these members:

| Member | Description |
| --- | --- |
| `name` | The layout name |
| `length` | Total length in bits |
| `size` | Total size in bytes |
| `items` | The expanded descriptions of the tags, in layout order (a combined word before its bits) |
| `create_ldata(name)` | Creates an ldata of the layout ([spec-data-api.md](spec-data-api.md) §2.1) |
| `io_index_table(endian)` | The byte index table for exchanging a whole block with a device ([spec-data-api.md](spec-data-api.md) §2.9); an `endian` that is not one of the four byte orders throws `RangeError` |

- Every item of `items` has: `name`; `type` (as written in the description, the case unchanged, while `Ltag.type` is always lower case); `offset` (the absolute bit offset; the byte position is `offset >> 3`); `length` (bits); `init_value`; `comment` (if given); `coupling` (for a combined word: the tag names of its bits; for a bit: the tag names of the combined words it belongs to). `includes` and `name_prefix` are expanded and no longer appear;
- The layout and its `items` are deeply frozen: modifying them throws `TypeError`;
- `Layout` is exported as a type only, not as a value that can be constructed: layouts are made only by registering (§5);
- A layout does not expose the table by name, byte positions, bit masks, codecs or other internal data, and users need not know them: access by name goes through `data.get(name)`, which gives an Ltag, and exchanging data with a device through `load_tag` / `store_tag` or `load` / `store` of an Ltag ([spec-data-api.md](spec-data-api.md) §2.9).

## 8. Type declarations for the editor

`render_types(layouts, options)` returns the text of a TypeScript declaration file (`.d.ts`) for layouts, so that an editor can complete the tags of a data block. It is a helper for building the program: after the layouts are registered, the program writes the text to a file beside its code, for example `layout_types.d.ts`. `layouts` is the `layouts` that `register_layout` returns.

- For each layout it declares `<Layout>_Tags`, an interface with one property per tag (`boolean` for a Bool, `number` for every other type; a `comment` becomes the doc comment of the property), and `<Layout>_Ldata`, which is `Ldata & <Layout>_Tags`;
- The layout name is used as it is, with the case it has: the layout `Pump` gives `Pump_Tags` and `Pump_Ldata`, `my_block` gives `my_block_Tags`, `Pump_Station` gives `Pump_Station_Tags`. The case style is the choice of the caller, and `Snake_Pascal_Case` is recommended, the style of the type names of this package; the library does not require it. The name is the one written in `get_layout("Pump")`, and two layouts with different names never give the same type name;
- The keys of `layouts` are used as the layout names and must be identifiers of JavaScript. The names of registered layouts are (§4), so only keys given otherwise can fail; then `Error` is thrown, whose `errors` lists every such key. A tag name is always an identifier (§3), so it is written as the property name as it is. A `*/` in a comment is escaped, so the text is always a valid declaration file;
- `options.source` names the layout file in the header comment of the text; without it the header only says that the text is generated. `options.ldata_module` is the module specifier the text imports `Ldata` from, relative to the output file; it is `"layout-data"` by default. Both options, and the argument `options` itself, may be omitted.

Using the types. `get_layout("Pump").create_ldata("pump_1")` is typed `Ldata`: the declaration of `create_ldata` cannot return another type for each layout, so the type of the value is named by hand, once. In JavaScript a JSDoc cast, which is enough for an editor to complete the tags and, when the file is checked (`checkJs` or `// @ts-check`), to flag a misspelled tag or a value of the wrong type:

```js
const pump = /** @type {import("./layout_types.js").Pump_Ldata} */ (get_layout("Pump").create_ldata("pump_1"));
pump.pressure = 1.5;   // completed, and known to be a number
```

The parentheses are part of the JSDoc cast. A `/** @type {...} */` written above `const pump = get_layout("Pump").create_ldata(...)` also gives the completion, but a checked file then reports that `Ldata` is not assignable to `Pump_Ldata`.

In TypeScript: `const pump = get_layout("Pump").create_ldata("pump_1") as Pump_Ldata;`.

## 9. Errors

Registering, looking up and rendering the types of layouts throw exceptions on errors:

| Case | Exception |
| --- | --- |
| `get_layout` with a name that is not registered | `Error` (`unknown layout X`, §5) |
| Invalid layout, or a reserved tag name ([spec-data-api.md](spec-data-api.md) §2.10) | `Error` with `errors`, thrown by `register_layout`; nothing is registered (§5) |
| `register_layout` called again after it registered layouts | `Error`, the layouts of the first call stay (§5) |
| A key of the `layouts` of `render_types` that is not an identifier | `Error`, whose `errors` lists every such key (§8) |
