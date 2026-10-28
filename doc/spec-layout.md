# Layout Specification

> English version of [spec-layout.zh-cn.md](spec-layout.zh-cn.md), the primary Chinese version. When the two differ, update both.
>
> This document defines the scopes, the loading of descriptions, and the layouts it registers: the properties and methods of a layout object, how a layout manages its ldata, and the type declarations rendered from layouts. It refines [spec.md](spec.md). The form of layouts before loading, the structure, items and rules of a description, and the compilation by `yaml` and `desc_file`, are in [spec-description.md](spec-description.md). The data objects created from a layout (Ldata / Ltag) are in [spec-data-api.md](spec-data-api.md), the implementation in §3 of [design.md](design.md).

## 1. Flow

The flow is **compile the descriptions, load them into a scope, get the layout, create and find ldata through it**: the layouts are described ([spec-description.md](spec-description.md)), read and compiled by `yaml` or `desc_file`, a scope is created and its `load` loads them (§3), and from then on `get_layout("Pump")` of the scope gets a layout by its name (§4), its `create_ldata("pump_1")` creates data blocks ([spec-data-api.md](spec-data-api.md) §2.1) and its `get_ldata("pump_1")` finds one by name. At loading, the package creates the ldata of the `blocks` of a description.

```js
import { create_scope, desc_file, get_scope } from "layout-data";
const scope = create_scope("lib_a");                          // create a scope
const { ldata } = scope.load(desc_file`pump.yaml`);            // load, creating the ldata of its blocks
const pump = scope.get_layout("Pump").create_ldata("pump_9"); // from then on, get the layout and create
get_scope("lib_a").get_layout("Pump").get_ldata("pump_9");    // elsewhere, find the ldata by its names
```

## 2. Scopes

A scope (`Layout_Scope`) manages a group of layouts and is the unit that separates layout names. It lets a library built on layout-data bring and register its own layouts, and an application combine several such libraries in one process.

- Layout names are unique within a scope, and a layout belongs to one scope only; layouts of the same name in different scopes do not conflict. One `Description` loaded into two scopes gives two unrelated layouts;
- **Layouts are registered only in a scope created explicitly.** Libraries and applications each create a scope of their own, and layouts are registered and looked up through the methods of a scope; the package has no default scope;
- `create_scope(name)` creates a scope. A scope name, like a layout name, must be an identifier of JavaScript ([spec-description.md](spec-description.md) §5.1), so it has no `.`; a string such as a package name, with `@`, `/` or `-`, cannot be used as it is. A scope name is unique in the process and chosen by the library or application that creates it; a name that is not a string throws `TypeError`, one that is not an identifier throws `Error`, and one used by another scope throws `Error` (`a scope is already named X`). A scope lasts as long as the process and cannot be removed;
- `get_scope(name)` returns the scope created under that name, and `undefined` when there is none, so it also tells whether a scope exists;
- The members of a scope: the read-only `name`, the scope name; `load(descriptions)`, which loads descriptions, registering their layouts and creating the ldata of their blocks (§3); `get_layout(name)`, the layout of this scope by its layout name (without the scope name). A scope object is frozen: any module can get it by its name, but none can replace its methods or properties, a change throwing `TypeError`. `Layout_Scope` is exported as a type only: scopes are made only by `create_scope`;
- The `scope` of a layout is the scope it belongs to (§4). Errors name a layout as `<scope>.<layout>`, for example `unknown layout lib_a.Pump` or `lib_a.Pump: changes do not settle after 16 rounds`; the layout name itself is still `Pump`;
- The package does not rule who may load descriptions into which scope: whoever gets a scope can load into it, any number of times. A library that keeps others from registering conflicting layouts in its scope loads its own descriptions right when it creates the scope, for example at the top level of its module, right after creating it: from then on a layout of the same name and a different structure cannot be registered in that scope (§3). How a library and its users work together is for the library to define.

## 3. Loading

`scope.load(descriptions)` loads the descriptions into the scope: it registers their layouts in the scope, then creates the ldata of their blocks. A layout can be used only after it is registered. How descriptions are imported, traversed and validated is in [spec-description.md](spec-description.md) §4 and §5, all done when `yaml` and `desc_file` read them.

- `descriptions`: one `Description` or a list of them ([spec-description.md](spec-description.md) §1.2). A list does not hold lists, and an empty list is an error. A `Description` is made only by `yaml` and `desc_file`: loading reads no file and parses no YAML, and a string, a hand-written object or any other value is not a description;
- **Any number of calls.** Every description is compiled on its own, so a scope may load in several calls, and every call binds, reuses or refuses each layout by the rules below;
- **Layouts are the same by fingerprint.** Every layout has a fingerprint decided only by its compiled structure: the name, type, offset and initial value of each tag, in layout order; neither the layout name nor the comments. Whether two layouts are the same is decided by the fingerprint; the layout name only serves lookup and location. The fingerprint is internal, not offered to the user, and compared only within a scope: the package holds no fingerprint table across scopes. When a layout is registered:
  - if the scope has a layout of the same fingerprint: with the same name too, that layout is reused and no new one is made; with another name it is a violation;
  - if the scope has no layout of the same fingerprint: a name used by a layout of the scope is a violation; otherwise a new layout bound to this scope is made from the layout of the `Description`;
  - a layout registered earlier in the same call counts as one the scope has for the layouts after it;
- The layout name is the name listed by `layouts` of the description, and loading cannot change it;
- **Blocks.** A block references only a layout of its own description, checked when reading ([spec-description.md](spec-description.md) §5.3). Every block creates, on the layout that the layout of that name of its description becomes in this scope (a new one, or one the scope had, reused by its fingerprint), an ldata named by the block name, managed by that layout by name (§4). These are violations:
  - the block name is used by an ldata of that layout (`ldata X.Y.Z already exists`), which includes loading a description with the same `blocks` again into the same scope: the layout is reused by its fingerprint, but a block is not, and this is an error of the configuration;
  - the block name is used twice across the descriptions of one call, as they are gathered in one index of the result;
- Blocks are created in the scope the description is loaded into, and one call changes this scope only:
  - to create several groups of ldata of the same names from one description, load it into several scopes;
  - to create blocks of an application on a layout of a library, the description of the application imports the item tables of the library with `imports`, lists that layout under the same name in its own `layouts`, and is loaded into the scope of the library, for example `get_scope("lib_a").load(...)`: with the same name and structure, the layout reuses the layout the library has by its fingerprint, and the blocks are created on it; the same structure under another name, or the same name with another structure, is a violation by the fingerprint rules above;
- **All or none.** Any violation throws an `Error` whose `errors` property lists all the violations of the call, and the scope stays as it was before the call: no layout is registered, no ldata is created, and the layouts and ldata it had are unchanged. The title of the error names the scope (for example `invalid descriptions of scope lib_a`), and every error names the layout or block in error and its description (a description read by `desc_file` by its path, any other by its position in the list, `description #2`);
- The `Description`s given are not changed: every call makes new bound layouts from their layouts, or reuses layouts of the same fingerprint the scope has;
- Return value: `{ layouts, ldata }`. `layouts` holds the layouts loaded by this call by name (bound to this scope; a reused one is the layout the scope had), as `scope.get_layout(name)` returns them; `ldata` holds the ldata created by `blocks` in this call, by block name;
- A layout stays registered for the life of the process. `scope.get_layout(name)` returns the registered layout (§4) and throws `unknown layout X.Y` (X the scope name, Y the layout name) for a name that is not registered;
- A changed layout file, of a different structure under the same name, cannot be registered in the scope it was registered in, and takes effect only in a new process or a new scope (no hot reload);
- When the dependency tree holds two copies of the package (for example two versions), they share nothing: each has its own scopes, a layout registered through one is not found by name through the other, and a `Description` compiled by one cannot be loaded by the other.

## 4. The layout object

A layout (`Layout`) is what loading registers: a read-only object with methods that exposes only these members:

| Member | Description |
| --- | --- |
| `name` | The layout name |
| `scope` | The scope of the layout (§2), read-only; the scope name is `layout.scope.name` |
| `length` | Total length in bits |
| `size` | Total size in bytes |
| `items` | The expanded tags, in layout order (a combined word before its bits) |
| `create_ldata(name)` | Creates an ldata of the layout ([spec-data-api.md](spec-data-api.md) §2.1), managed by the layout by name |
| `get_ldata(name)` | The ldata of a name created by the layout |
| `delete_ldata(name)` | Unbinds the name from its ldata, giving the name back |
| `io_index_table(endian)` | The byte index table for exchanging a whole block with a device ([spec-data-api.md](spec-data-api.md) §2.9); an `endian` that is not one of the four byte orders throws `RangeError` |

- Every item of `items` (`Layout_Tag`) has: `name`; `type` (as written in the description, the case unchanged, while `Ltag.type` is always lower case); `offset` (the absolute bit offset; the byte position is `offset >> 3`); `length` (bits, always present); `init_value` (if the tag has one); `comment` (if given); `coupling` (for a combined word: the tag names of its bits; for a bit: the tag names of the combined words it belongs to). Include items are expanded, and `includes` and `name_prefix` no longer appear;
- The layout and its `items` are deeply frozen: modifying them throws `TypeError`;
- `Layout` is exported as a type only, not as a value that can be constructed: layouts are made only by loading (§3). A layout of a `Description` not yet bound to a scope is a `Layout_Desc`, a `Layout` without `scope` ([spec-description.md](spec-description.md) §1.2), and creates no ldata;
- Two scopes may each have a layout of the same name. They are different layouts, and the ldatas they create have classes of their own. To group by layout, use the layout object, or the scope name with the layout name: grouping by the layout name alone mixes them up, for example in an observer of `Ldata.on_access` ([spec-data-api.md](spec-data-api.md) §2.8);
- A layout does not expose the table by name, byte positions, bit masks, codecs, the fingerprint or other internal data, and users need not know them: access by name goes through `data.get(name)`, which gives an Ltag, and exchanging data with a device through `load_tag` / `store_tag` or `load` / `store` of an Ltag ([spec-data-api.md](spec-data-api.md) §2.9).

### 4.1 A layout manages its ldata

An ldata belongs to one layout only (`ldata.layout`), and a layout manages the ldata it creates by name:

- An ldata name is unique within its layout. `create_ldata(name)` with a name the layout uses throws `Error` (`ldata X.Y.Z already exists`, X the scope name, Y the layout name, Z the ldata name). The ldata of different layouts may share a name, including those of layouts of the same name in different scopes; to have several groups of ldata of the same names, load the descriptions into different scopes, the layouts of each scope managing their own ldata;
- `get_ldata(name)` returns the ldata the layout created under that name and that is still bound, and throws `Error` (`unknown ldata X.Y.Z`) when there is none, as `get_layout` does. The ldata created by `blocks` at loading are managed by their layouts too, and found the same way;
- `delete_ldata(name)` removes the binding of the name to its ldata from the layout, and returns as `Map.prototype.delete` does: `true` when a binding was removed; when the name is not bound it does nothing and returns `false`. Afterwards `get_ldata(name)` does not find the ldata, the name can be used again in the layout, and neither `create_ldata` nor loading `blocks` reports it as used; the layout no longer holds the ldata, which can be collected once the caller drops its references;
- `delete_ldata` only unbinds the name, and the ldata itself is unaffected: it can still be read and written, its events are emitted as before, and `ldata.layout` is unchanged. The package offers no way to dispose of an ldata itself, nor to destroy a scope;
- A layout holds its ldata by ordinary strong references: the use of a name is ended only by `delete_ldata`, never by garbage collection. So an ldata found by name is never collected before it is found, and a name not deleted by mistake is always reported as used;
- A user that rebuilds instances in one process (for example tests that create and stop a device simulator again and again) calls, when stopping, `delete_ldata` of the layout of every ldata of the `ldata` of the result of loading, giving those names back.

## 5. Type declarations for the editor

Type declarations let an editor complete the tags of a data block. Rendering them is a matter of development time: a development script or the command line runs it once after the layouts change and writes the text to a file beside the code, for example `layout_types.d.ts`; the application does not need it at run time. So it is not in the run-time entry `layout-data`, but in the development entry `layout-data/dev`, which is also the command line tool `layout-types` (§5.1).

`render_types(descriptions, options)` (imported from `layout-data/dev`) renders the text of a TypeScript declaration file (`.d.ts`) from descriptions. Rendering the types needs the descriptions only: `descriptions` is what `load` takes (§3), the result of `yaml` or `desc_file`; the function renders all their layouts, creating no scope and no ldata of blocks. The layouts of the descriptions are combined by the rules of loading them into one empty scope (§3): the same name with a different structure, or the same structure under different names, is a violation, throwing the same `Error` with `errors` as `load`; layouts of the same name and structure are rendered once. The declarations are only read by the editor, so they are always rendered for all the layouts, never for some of them; types that are not used do no harm.

- For each layout it declares `<Layout>_Tags`, an interface with one property per tag of the `items` of the layout (`boolean` for a Bool, `number` for every other type; a `comment` becomes the doc comment of the property), and `<Layout>_Ldata`, which is `Ldata & <Layout>_Tags`;
- The layout name is used as it is, with the case it has: the layout `Pump` gives `Pump_Tags` and `Pump_Ldata`, `my_block` gives `my_block_Tags`, `Pump_Station` gives `Pump_Station_Tags`. The case style is the choice of the caller, and `Snake_Pascal_Case` is recommended, the style of the type names of this package; the library does not require it. The name is the one written in `scope.get_layout("Pump")`, and two layouts with different names in one scope never give the same type name;
- Layouts of the same name in different scopes give the same type names, so every scope is rendered into a file of its own and told apart by the import path, for example `Pump_Ldata` of the library's `lib_a/layout_types.d.ts` and of the application's `layout_types.d.ts`;
- Layout names and tag names are identifiers ([spec-description.md](spec-description.md) §5), so they are written as they are, as part of the type names and as the property names. A `*/` in a comment is escaped, so the text is always a valid declaration file;
- The text always has `import type { Ldata } from "layout-data";`: `"layout-data"` is the name of this package, not a location, and the package does not decide for the caller how its modules are organized. The types are rendered at development time, in a project that depends on this package, and the declarations are read by the editor of that project, so it always resolves;
- `options.scope` is a scope name, used only in the example of the header comment (`get_scope("<scope>")`) and in the title of errors, `app` by default; it should be the scope name the application uses. It is checked by the rules of `create_scope`, a name that is not valid throwing the same exception (§2), but no scope is created and the name need not be unused;
- `options.source` is the source named in the header comment. Without it, the description files are named (joined by `, `) when all the descriptions were read by `desc_file` ([spec-description.md](spec-description.md) §1.2); otherwise the header only says that the text is generated. The argument `options` itself may be omitted.

The function entry in a development script:

```js
import { writeFileSync } from "node:fs";
import { desc_file } from "layout-data";
import { render_types } from "layout-data/dev";

writeFileSync("layout_types.d.ts", render_types(desc_file`pump.yaml`, { scope: "app" }));
```

### 5.1 The command line tool `layout-types`

```
layout-types <description files...> [--scope <scope name>] [-o|--out <output file>]
```

The command line only parses the arguments and calls `render_types`:

- The positional arguments are description files, at least one. Each is read with `desc_file`, and the `Description`s are the `descriptions`; when files cannot be read, parsed or compiled, the errors of all of them are reported together and nothing is rendered;
- `--scope` is `options.scope`, `app` by default;
- `-o`/`--out` is the output file; without it the text goes to the standard output;
- `-h`/`--help` shows the usage, with the version requirement;
- On wrong arguments or invalid descriptions it writes the reason to the standard error (every error, for invalid descriptions), exits with a non-zero code and writes no output file.

The command line takes description files only. For descriptions written in code, write a development script with the function entry.

The command line requires Node.js >= 24.2 (it finds out whether it is the entry with `import.meta.main`). This binds only the development environment that renders the types: the run-time entry and the function entry still need Node.js >= 20.11. Run on an earlier Node.js, the command line renders nothing, writes to the standard error the version required, the version running and that the function entry can be used instead, and exits with a non-zero code.

Using the types. `scope.get_layout("Pump").create_ldata("pump_1")` is typed `Ldata`: the declaration of `create_ldata` cannot return another type for each layout, so the type of the value is named by hand, once. In JavaScript a JSDoc cast, which is enough for an editor to complete the tags and, when the file is checked (`checkJs` or `// @ts-check`), to flag a misspelled tag or a value of the wrong type:

```js
const pump = /** @type {import("./layout_types.js").Pump_Ldata} */ (scope.get_layout("Pump").create_ldata("pump_1"));
pump.pressure = 1.5;   // completed, and known to be a number
```

The parentheses are part of the JSDoc cast. A `/** @type {...} */` written above `const pump = scope.get_layout("Pump").create_ldata(...)` also gives the completion, but a checked file then reports that `Ldata` is not assignable to `Pump_Ldata`.

In TypeScript: `const pump = scope.get_layout("Pump").create_ldata("pump_1") as Pump_Ldata;`.

## 6. Errors

Reading descriptions, creating scopes, loading descriptions, looking up layouts, creating and finding ldata, and rendering the types of layouts throw exceptions on errors:

| Case | Exception |
| --- | --- |
| `create_scope` with a scope name that is not a string | `TypeError` (§2) |
| `create_scope` with a scope name that is not an identifier, or is used by another scope | `Error` (§2) |
| `yaml` or `desc_file` with text that is not valid YAML, a file that cannot be read, or an invalid description ([spec-description.md](spec-description.md) §5), a reserved tag name among them | `Error` with `errors` ([spec-description.md](spec-description.md) §1.1) |
| `yaml` or `desc_file` with an argument that is not text, a path or a `file:` URL | `TypeError` ([spec-description.md](spec-description.md) §1.1) |
| `scope.load` with an argument that is not a `Description` or a list of them, a layout conflicting with a layout of the scope, or a block name used by an ldata of its layout or twice in one call | `Error` with `errors`; the scope stays as it was before the call (§3) |
| `scope.get_layout` with a name not registered in the scope | `Error` (`unknown layout X.Y`, §3) |
| `create_ldata` with a name used by the layout | `Error` (`ldata X.Y.Z already exists`, §4.1) |
| `create_ldata` of a layout of a `Description`, not bound to a scope | `Error` (§4) |
| `get_ldata` with a name that has no ldata in the layout | `Error` (`unknown ldata X.Y.Z`, §4.1) |
| `render_types` of `layout-data/dev` with conflicting descriptions, or an `options.scope` that is not a valid scope name | The same as `scope.load` and `create_scope` (§5) |
