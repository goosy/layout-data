# Layout Specification

> English version of [spec-layout.zh-cn.md](spec-layout.zh-cn.md), the primary Chinese version. When the two differ, update both.
>
> This document defines the description, the scopes, the registration and the object of a layout. It refines [spec.md](spec.md). The data objects created from a layout (Ldata / Ltag) are in [spec-data-api.md](spec-data-api.md), the implementation in §3 of [design.md](design.md).

## 1. Flow

The flow is **create a scope, register once, get the layout, create from it**: the layouts are described (§2 to §4), a scope is created, all the layouts are registered by one call of its `register_layout` (§5), and from then on `get_layout("Pump")` of the scope gets a layout by its name and its `create_ldata("pump_1")` creates data blocks ([spec-data-api.md](spec-data-api.md) §2.1). The user needs to know how to express a layout as a YAML structure, which name it has and in which scope it is registered; whether it is compiled, and into what, is not part of the flow.

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
| `init_value` | Initial value; when given it must be representable by the type (an integer inside the range of the type; for a `Real`, a finite number inside the float32 range). It may be omitted: the layout then gives the tag no initial value, and in a data block the tag starts at `0` (`false` for a `Bool`); see below for combined words and their bits |
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
- A description object has the declaration `Layout_Description`: `layouts`, a mapping from layout names to lists of entries, and one list of entries for each fragment. In the declarations the parameter of `register_layout` of a scope is typed with it (`string | Layout_Description`, or a list of them), so that an editor completes the fields of an entry and notices a misspelled one;
- The `fragments` that `register_layout` of a scope returns hold the entries with the references expanded: `includes` and `coupling` are lists of entries, never names, and every `length` is present. Their declaration is the same `Layout_Item`.

## 4. Validity

- Layout names are identifiers of JavaScript (letters of any script, digits, `_` and `$`, not starting with a digit), as a layout name is part of type names (§8);
- Tag names are identifiers (letters, digits and `_`, not starting with a digit; a number, an empty name or a missing name is not one), are unique and are not reserved names ([spec-data-api.md](spec-data-api.md) §2.10);
- The byte ranges of non-Bool tags do not overlap; each bit belongs to at most one Bool;
- A Bool inside the byte range of a non-Bool tag must be a bit (`coupling`) of that tag; every bit of a combined word must lie inside the word;
- Only one side of a combined word and its bits gives the initial value: if the word gives it, the initial values of the bits come from the whole word; otherwise they come from the bits (a bit without a value is `false`) and the word is composed from them; if neither side gives one, the word and its bits have none;
- The total length of a layout is a whole number of registers (a multiple of 16 bits);
- Referenced fragments must exist, and fragments must not reference each other in a cycle.

## 5. Scopes and registering

```js
import { create_scope, get_scope } from "layout-data";
const scope = create_scope("lib_a");                              // create a scope
scope.register_layout(["common.yaml", "pump.yaml"]);              // register once per scope
const pump = scope.get_layout("Pump").create_ldata("pump_1");     // from then on, get the layout and create
get_scope("lib_a").get_layout("Pump");                            // elsewhere, get the scope by its name
```

### 5.1 Scopes

A scope (`Layout_Scope`) is the unit that separates layout names. It lets a library built on layout-data bring and register its own layouts, and an application combine several such libraries in one process.

- Every scope has its own layouts and fragments: layout and fragment names are unique only within a scope, a layout can reference only the fragments of its own scope, and layouts or fragments of the same name in different scopes do not conflict;
- **Layouts are registered only in a scope created explicitly.** Libraries and applications each create a scope of their own, and layouts are registered and looked up through the methods of a scope;
- `create_scope(name)` creates a scope. A scope name, like a layout name, must be an identifier of JavaScript (§4), so it has no `.`; a string such as a package name, with `@`, `/` or `-`, cannot be used as it is. A scope name is unique in the process and chosen by the library or application that creates it; a name that is not a string throws `TypeError`, one that is not an identifier throws `Error`, and one used by another scope throws `Error` (`a scope is already named X`). A scope lasts as long as the process and cannot be removed;
- `get_scope(name)` returns the scope created under that name, and `undefined` when there is none, so it also tells whether a scope exists;
- The members of a scope: the read-only `name`, the scope name; `register_layout(descriptions)`, which registers layouts (§5.2); `get_layout(name)`, the layout of this scope by its layout name (without the scope name). A scope object is frozen: any module can get it by its name, but none can replace its methods or properties, a change throwing `TypeError`. `Layout_Scope` is exported as a type only: scopes are made only by `create_scope`;
- The `scope` of a layout is the scope it belongs to (§7). Errors name a layout as `<scope>.<layout>`, for example `unknown layout lib_a.Pump` or `lib_a.Pump: changes do not settle after 16 rounds`; the layout name itself is still `Pump`;
- The package does not rule who may register in which scope: whoever gets a scope can register in it, and conflicts are prevented only by "every scope registers once" (§5.2), a second registration always throwing. A library that keeps its layouts from being decided by others registers right when it creates its scope, for example at the top level of its module, right after creating it, before any other code can get the scope; a library may also leave its scope for the user to register in, for example to let the user add layouts of its own to the descriptions of the library. How a library and its users work together is for the library to define.

### 5.2 Registering

`scope.register_layout(descriptions)` registers the layouts of the descriptions in the scope. A layout can be used only after it is registered.

- `descriptions`: one description or a list of descriptions, each either **a string, the path of a description file**, or **an object, a description object** (the structure of §2: `layouts` plus the fragments; this is also how items are given in code, §6). A list does not hold lists, and an empty list is an error. A string is always a path, never YAML text;
- **Once per scope.** The layouts are registered by one call, so that the layouts and fragments of a scope are all known together and nothing depends on the order of calls. A second call throws `Error` (`register_layout can be called only once in scope X`), and the layouts of the first stay. A call that fails registers nothing and does not use up the call, so it can be retried in the same scope, for example with a fallback description when its own file is not valid;
- **The descriptions are merged, then resolved.** The layouts and the fragments of all the descriptions are collected first, and only then are the fragment references resolved, so a layout may name a fragment of any description, whatever the order of the list. A description needs no `layouts` key (a file of common fragments has none), but at least one description must define a layout;
- The same fragment name or the same layout name in two descriptions is an error naming both (a description file by its path, a description object by its position in the list, `layout description #2`); nothing is overridden;
- Every layout is validated (§4), the omitted `length`s are filled in, and the descriptions given are not changed;
- Any violation throws an `Error` whose `errors` property lists all violations of all descriptions, and nothing is registered: the descriptions are registered all or none. An unreadable file and a YAML syntax error are violations too. The title of the error names the scope (for example `invalid layout descriptions of scope lib_a`); the layout and fragment errors name the layout or fragment, not the file;
- Return value: `{ layouts, fragments }` for all the descriptions. `layouts` holds the registered layouts by name, as `scope.get_layout(name)` returns them; `fragments` holds the entry lists by fragment name (references expanded, offsets relative to the start of the fragment), for the user to query, for example to get all tag names of a parameter block. Neither is needed for the flow above;
- A layout stays registered for the life of the process. `scope.get_layout(name)` returns the registered layout (read-only, §7) and throws `unknown layout X.Y` (X the scope name, Y the layout name) for a name that is not registered;
- Consequences of registering once: a changed layout file takes effect only in a new process (no hot reload, and a REPL cannot register a changed layout again in the same scope);
- When the dependency tree holds two copies of the package (for example two versions), they share nothing: each has its own scopes, and a layout registered through one is not found by name through the other.

## 6. Defining a layout in code

A layout needs no file. Give a description object, the structure of §2, to `register_layout` of a scope (§5.2), with the items of a layout as a list under its name:

```js
const scope = create_scope("app");
scope.register_layout({
  layouts: {
    Pump: [
      { name: "id", type: "UInt", offset: 0, init_value: 0 },
      { name: "pressure", type: "Real", offset: 32, init_value: 0 },
    ],
  },
});
const data = scope.get_layout("Pump").create_ldata("pump_1");
```

- the items are the entries of §3; `length` may be omitted; `coupling` and `includes` take an inline list or the name of a fragment of any of the descriptions registered together;
- the description object and the entries in it are not changed;
- there is no separate function that registers one list of items, nor any that expands or validates a structure by itself: registration is the single step that validates (§5.2).

## 7. The layout object

A layout (`Layout`) is a read-only object with methods that exposes only these members:

| Member | Description |
| --- | --- |
| `name` | The layout name |
| `scope` | The scope of the layout (§5.1), read-only; the scope name is `layout.scope.name` |
| `length` | Total length in bits |
| `size` | Total size in bytes |
| `items` | The expanded descriptions of the tags, in layout order (a combined word before its bits) |
| `create_ldata(name)` | Creates an ldata of the layout ([spec-data-api.md](spec-data-api.md) §2.1) |
| `io_index_table(endian)` | The byte index table for exchanging a whole block with a device ([spec-data-api.md](spec-data-api.md) §2.9); an `endian` that is not one of the four byte orders throws `RangeError` |

- Every item of `items` has: `name`; `type` (as written in the description, the case unchanged, while `Ltag.type` is always lower case); `offset` (the absolute bit offset; the byte position is `offset >> 3`); `length` (bits); `init_value` (if the tag has one, §3); `comment` (if given); `coupling` (for a combined word: the tag names of its bits; for a bit: the tag names of the combined words it belongs to). `includes` and `name_prefix` are expanded and no longer appear;
- The layout and its `items` are deeply frozen: modifying them throws `TypeError`;
- `Layout` is exported as a type only, not as a value that can be constructed: layouts are made only by registering (§5.2);
- Two scopes may each have a layout of the same name. They are different layouts, and the ldatas they create have classes of their own. To group by layout, use the layout object, or the scope name with the layout name: grouping by the layout name alone mixes them up, for example in an observer of `Ldata.on_access` ([spec-data-api.md](spec-data-api.md) §2.8);
- A layout does not expose the table by name, byte positions, bit masks, codecs or other internal data, and users need not know them: access by name goes through `data.get(name)`, which gives an Ltag, and exchanging data with a device through `load_tag` / `store_tag` or `load` / `store` of an Ltag ([spec-data-api.md](spec-data-api.md) §2.9).

## 8. Type declarations for the editor

Type declarations let an editor complete the tags of a data block. Rendering them is a matter of development time: a development script or the command line runs it once after the layouts change and writes the text to a file beside the code, for example `layout_types.d.ts`; the application does not need it at run time. So it is not in the run-time entry `layout-data`, but in the development entry `layout-data/dev`, which is also the command line tool `layout-types` (§8.1).

`render_types(descriptions, options)` (imported from `layout-data/dev`) renders the text of a TypeScript declaration file (`.d.ts`) from descriptions. Rendering the types needs the descriptions only: `descriptions` is what `register_layout` takes (§5.2), the path of a description file, a description object, or a list of them; the function creates a scope of its own, registers the descriptions in it and renders all their layouts. The declarations are only read by the editor, so they are always rendered for all the layouts, never for some of them; types that are not used do no harm. Invalid descriptions throw the same `Error` with `errors` as `register_layout`.

- For each layout it declares `<Layout>_Tags`, an interface with one property per tag (`boolean` for a Bool, `number` for every other type; a `comment` becomes the doc comment of the property), and `<Layout>_Ldata`, which is `Ldata & <Layout>_Tags`;
- The layout name is used as it is, with the case it has: the layout `Pump` gives `Pump_Tags` and `Pump_Ldata`, `my_block` gives `my_block_Tags`, `Pump_Station` gives `Pump_Station_Tags`. The case style is the choice of the caller, and `Snake_Pascal_Case` is recommended, the style of the type names of this package; the library does not require it. The name is the one written in `scope.get_layout("Pump")`, and two layouts with different names in one scope never give the same type name;
- Layouts of the same name in different scopes give the same type names, so every scope is rendered into a file of its own and told apart by the import path, for example `Pump_Ldata` of the library's `lib_a/layout_types.d.ts` and of the application's `layout_types.d.ts`;
- Layout names and tag names are identifiers (§3, §4), so they are written as they are, as part of the type names and as the property names. A `*/` in a comment is escaped, so the text is always a valid declaration file;
- The text always has `import type { Ldata } from "layout-data";`: `"layout-data"` is the name of this package, not a location, and the package does not decide for the caller how its modules are organized. The types are rendered at development time, in a project that depends on this package, and the declarations are read by the editor of that project, so it always resolves;
- `options.scope` is a scope name, used only in the example of the header comment (`get_scope("<scope>")`), `app` by default; it should be the scope name the application uses. It is also the name of the scope created inside, and a name that is not valid throws the same exception as `create_scope` (§5.1);
- `options.source` is the source named in the header comment. Without it, the description files are named (joined by `, `) when all the descriptions are paths; otherwise the header only says that the text is generated. The argument `options` itself may be omitted.

The function entry in a development script:

```js
import { writeFileSync } from "node:fs";
import { render_types } from "layout-data/dev";

writeFileSync("layout_types.d.ts", render_types("pump.yaml", { scope: "app" }));
```

### 8.1 The command line tool `layout-types`

```
layout-types <description files...> [--scope <scope name>] [-o|--out <output file>]
```

The command line only parses the arguments and calls `render_types`:

- The positional arguments are description files, at least one: the `descriptions`;
- `--scope` is `options.scope`, `app` by default;
- `-o`/`--out` is the output file; without it the text goes to the standard output;
- `-h`/`--help` shows the usage, with the version requirement;
- On wrong arguments or invalid descriptions it writes the reason to the standard error (every error, for invalid descriptions), exits with a non-zero code and writes no output file.

The command line takes description files only. For layouts given in code as description objects, write a development script with the function entry.

The command line requires Node.js >= 24.2 (it finds out whether it is the entry with `import.meta.main`). This binds only the development environment that renders the types: the run-time entry and the function entry still need Node.js >= 20.11. Run on an earlier Node.js, the command line renders nothing, writes to the standard error the version required, the version running and that the function entry can be used instead, and exits with a non-zero code.

Using the types. `scope.get_layout("Pump").create_ldata("pump_1")` is typed `Ldata`: the declaration of `create_ldata` cannot return another type for each layout, so the type of the value is named by hand, once. In JavaScript a JSDoc cast, which is enough for an editor to complete the tags and, when the file is checked (`checkJs` or `// @ts-check`), to flag a misspelled tag or a value of the wrong type:

```js
const pump = /** @type {import("./layout_types.js").Pump_Ldata} */ (scope.get_layout("Pump").create_ldata("pump_1"));
pump.pressure = 1.5;   // completed, and known to be a number
```

The parentheses are part of the JSDoc cast. A `/** @type {...} */` written above `const pump = scope.get_layout("Pump").create_ldata(...)` also gives the completion, but a checked file then reports that `Ldata` is not assignable to `Pump_Ldata`.

In TypeScript: `const pump = scope.get_layout("Pump").create_ldata("pump_1") as Pump_Ldata;`.

## 9. Errors

Creating scopes, and registering, looking up and rendering the types of layouts, throw exceptions on errors:

| Case | Exception |
| --- | --- |
| `create_scope` with a scope name that is not a string | `TypeError` (§5.1) |
| `create_scope` with a scope name that is not an identifier, or is used by another scope | `Error` (§5.1) |
| `scope.get_layout` with a name not registered in the scope | `Error` (`unknown layout X.Y`, §5.2) |
| Invalid layout, or a reserved tag name ([spec-data-api.md](spec-data-api.md) §2.10) | `Error` with `errors`, thrown by `scope.register_layout`; nothing is registered (§5.2) |
| `scope.register_layout` called again after it registered layouts in the scope | `Error`, the layouts of the first call stay (§5.2) |
| `render_types` of `layout-data/dev` with invalid descriptions, or an `options.scope` that is not a valid scope name | The same as `scope.register_layout` and `create_scope` (§8) |
