# Description Specification

> English version of [spec-description.zh-cn.md](spec-description.zh-cn.md), the primary Chinese version. When the two differ, update both.
>
> This document defines the description, the form of layouts and ldata instances before they are registered: description files and YAML text, the `Description` compiled by `yaml` and `desc_file`, the four root keys `imports`, `layouts`, `item_tables` and `blocks`, items, imports and traversal, and the rules a description must follow. It refines [spec.md](spec.md). The registration and the layout objects it makes are in [spec-layout.md](spec-layout.md), the implementation in §3 of [design.md](design.md).

## 1. Form and compilation

A description has one form only: **YAML 1.2 text**, written in a **description file** or in code. JSON is valid YAML 1.2, so JSON text and `.json` files are valid descriptions too.

A description together with the descriptions it imports (§4) is complete: compiling it needs only itself and its `imports`, and the result depends only on them, not on what it is registered with. `yaml` and `desc_file` of the run-time entry `layout-data` read one description and compile it, returning a `Description` (§1.2), which `register_layout` of a scope registers ([spec-layout.md](spec-layout.md) §3).

### 1.1 yaml and desc_file

```js
import { create_scope, desc_file, yaml } from "layout-data";

const scope = create_scope("app");
scope.register_layout([
  desc_file`pump.yaml`,
  yaml`
imports:
  - ${new URL("common.yaml", import.meta.url)}
layouts: [Valve]
item_tables:
  Valve:
    - { includes: common_head, offset: 0 }
    - { name: opening, type: Real, offset: 32 }
`,
]);
```

- `yaml` reads a description written in code, as YAML 1.2 text. It is the tag of a template literal, ``yaml`...` ``, or is called with the text, `yaml(text)`;
- `desc_file` reads a description file. It is a tag too, ``desc_file`pump.yaml` ``, or is called with a path string or a `file:` URL, `desc_file(new URL("./pump.yaml", import.meta.url))`. A relative path is resolved against the current working directory. One call reads one file: several files are several calls, put in one list by the caller;
- As tags, both take the raw text of the template, as `String.raw` does: a backslash is kept as written, so a Windows path and the escapes of YAML double-quoted strings reach the file system and the YAML parser unchanged. An interpolated value is put into the text as a string;
- So the text of a template is YAML, not JavaScript: an escape such as `\t` or `\n` means a tab or a line break only inside a YAML double-quoted string. A single-quoted string and an unquoted scalar keep the backslash as written, with no error, so a value that looks the same in a JavaScript string is a different one here:

  ```yaml
  comment: "tab\tdone"  # "tab<TAB>done", a tab
  comment: 'tab\tdone'  # "tab\\tdone", a backslash and t
  comment: tab\tdone    # "tab\\tdone", a backslash and t
  ```

  Called with a string, `yaml(text)` gets the text after JavaScript has read its escapes, as any string;
- Both do at the call all the work that does not depend on a scope: reading the file, parsing the YAML, reading the imported descriptions (§4), traversing and validating the item tables, compiling the layouts and checking `blocks` (§5.3). Any error throws an `Error` whose `errors` property lists all the errors, without stopping at the first one. The title is `invalid YAML text` for `yaml` and `invalid description file <path>` for `desc_file`. An argument of another type throws `TypeError`;
- An error that comes from a file starts with the path of that file, an imported file with its own path; the errors of layouts and item tables name the layout or item table. The text of an error after the path is not a stable interface: a program relies only on whether `errors` is present and how many entries it has.

### 1.2 Description

`yaml` and `desc_file` return the compiled result of one description, a `Description`. It is the root object parsed from the YAML, with only `layouts` replaced by the result of the compilation and the other root keys kept as they are (`blocks` made `[]` when absent):

```js
/**
 * @typedef {Omit<Layout, "scope">} Layout_Desc     // one compiled layout, not bound to a scope
 * @typedef {{ name: string, layout: string } & Record<string, unknown>} Block_Desc
 * @typedef {{ layouts: Record<string, Layout_Desc>, blocks: Block_Desc[] } & Record<string, unknown>} Description
 */
```

- `layouts` maps the layout names of the description to layouts not yet bound to a scope, its keys being the names listed by the root key `layouts`, in the same order. These layouts are traversed, validated and compiled, and lack only a scope: they have the `name`, `length`, `size`, `items` and `io_index_table` of a layout object ([spec-layout.md](spec-layout.md) §4), but belong to no scope, so they create no ldata, `create_ldata` throwing `Error`. The layouts that are used are got from a scope only (the result of registering, or `get_layout`);
- `blocks` is the parsed root key `blocks` itself, checked (§2, §5.3), neither copied nor changed, with the keys of the application kept. When the description has no `blocks` it is `[]`, the only change beside `layouts`. Whether an application reads its own keys from here or parses the description itself is for the application to decide;
- The other root keys are kept as they are: `imports`, `item_tables` and the root keys of the application hold the values parsed from the YAML, `imports` the paths as written and `item_tables` the items not expanded. An application reads its own root keys without parsing the YAML again. Only the root keys of the description read are kept; those of imported descriptions are not merged in. The package reads only `layouts` and `blocks`, never the other root keys;
- A `Description` and all it holds are deeply frozen, the root keys kept as they are among them. Registration never changes it ([spec-layout.md](spec-layout.md) §3), so one `Description` can be cached and registered in any number of scopes;
- The compiled layouts share no memory with the content of the description, and the layouts compiled from one description are not affected by any other description;
- The `Description` returned by `desc_file` remembers its file, so that the errors of registration and the header of rendered types ([spec-layout.md](spec-layout.md) §5) name it by its path;
- A `Description` is made only by `yaml` and `desc_file`: a hand-written object of the same shape is not a `Description`, and registering it is a violation.

## 2. Structure

The root of a description is a mapping, and the package reads only four root keys in it:

- **`imports`**: a list of the paths of imported description files (§4). An imported description only provides item tables;
- **`layouts`**: a list of layout names. Every name listed is the name of an item table, and that item table is compiled into the layout of the same name;
- **`item_tables`**: a mapping from item table names to item tables. An **item table** is a list of items (§3); it is listed as a layout by `layouts`, or referenced by name by the `includes` and `coupling` of items;
- **`blocks`**: a list of the ldata instances of the description. Each block is a mapping, of which the package reads only `name` (the instance name) and `layout` (`<scope>.<layout>`); the ldata of a block is created at registration ([spec-layout.md](spec-layout.md) §3).

```yaml
imports:
  - common.yaml

layouts: [NODE]

item_tables:
  NODE:
    - { name: ID, type: UInt, offset: 0, init_value: 0 }
    - name: response_code
      type: Word
      offset: 128
      coupling: node_commands
    - { includes: node_parameters, offset: 144 }

  node_commands:
    - { name: stop_pumps, type: Bool, offset: 8, init_value: false, comment: Stop pump command }
    - { name: cancel_stop, type: Bool, offset: 9, comment: Cancel stop pump }

  node_parameters:
    - { name: max_pressure, type: Real, offset: 0, init_value: 10 }

blocks:
  - { name: node_1, layout: app.NODE, unit_id: 1 }   # unit_id is read by the application
```

- A layout and a referenced item table are the same kind of thing and differ only in use: one item table may be listed in `layouts` and referenced by other item tables as well;
- Each of the four root keys may be omitted. A description without `layouts` has no layouts, for example a file of common item tables that other descriptions import, or a description of `blocks` only, referencing the layouts of other descriptions;
- All the other root keys belong to the caller: the package neither reads nor validates them, keeps them as they are in the `Description` (§1.2), and item table names never collide with them. The keys of a block other than `name` and `layout` belong to the caller too, for example the Modbus address of a device simulator;
- Of `item_tables`, the package reads only the item tables reached by traversal from `layouts` (§4);
- The order of the root keys does not change the meaning. **Write `imports`, `layouts`, `item_tables`, `blocks` in this order**: the reader sees the dependencies and which layouts there are, then finds each item table by its name, and the instances last. The examples of this document follow this order.

## 3. Items

Every element of an item table is an item:

| Field | Description |
| --- | --- |
| `name` | The tag name. It is an identifier in every language (§5.2), so that a tag is always written `data.name` and is the same as the field of a data block in a PLC. If the point table of a device names the point otherwise, put that name in the `comment` |
| `type` | One of the types listed in [spec-data-api.md](spec-data-api.md) §1, case-insensitive |
| `offset` | Bit offset; a non-Bool must be on a whole byte, a multi-byte type must start at an even byte |
| `length` | Length in bits; may be omitted, in which case the type decides it; when written it must match the type |
| `init_value` | Initial value; when given it must be representable by the type (an integer inside the range of the type; for a `Real`, a finite number inside the float32 range). It may be omitted: the layout then gives the tag no initial value, and in a data block the tag starts at `0` (`false` for a `Bool`); for combined words and their bits see §5.2 |
| `comment` | Optional description, used to generate point tables, type declarations and so on |
| `coupling` | The bits of a combined word: an item table name or an inline list of items; the `offset` of each bit is relative to the word |
| `is_combined` | Optional descriptive mark of a combined word whose word and bits are linked in both directions; the linkage is decided by `coupling` and does not depend on it |
| `includes` | Together with `offset` (and optionally `name_prefix`), splices in the items given by an item table name or an inline list, shifted as a whole |

Items in a referenced item table may reference other item tables too.

There are two kinds of item:

| Item | Fields |
| --- | --- |
| A tag item | `name`, `type`, `offset` are required; `length`, `init_value`, `comment`, `is_combined`, `coupling` are optional; it has no `includes` |
| An include item | `includes` and `offset` are required; `name_prefix` is optional; it has no `name` and no `type` |

`coupling` is an item table name or an inline list of tag items, never a list of names: the names of the bits are a result of the compilation (they appear in the `items` of the layout, [spec-layout.md](spec-layout.md) §4), not an input.

## 4. Imports and traversal

A description imports other description files with `imports`, to use their item tables:

```yaml
imports:
  - common.yaml
layouts: [Pump]
item_tables:
  Pump:
    - { includes: Motor_Status, offset: 0 }   # from common.yaml
```

- **Paths.** Every entry of `imports` is a path string: an absolute path, a `file:` URL, or a relative path. A relative path in a description file is relative to the directory of that file. The text of ``yaml`...` `` has no file, and a relative path in it is a violation; a caller that needs a relative location interpolates it, as `${new URL("common.yaml", import.meta.url)}`;
- **Item tables only.** The `layouts` and `blocks` of an imported description are always ignored: layouts come only from the `layouts` of the importing description, and instances only from its `blocks`;
- **Transitive imports.** An imported description may have `imports` of its own. A description together with all the descriptions it imports directly and indirectly forms one name space; a file (by its resolved path) counts once however often it is imported, so two imported descriptions importing the same file do not conflict. Circular imports are a violation;
- **Traversal.** Starting from the names listed by `layouts` of the importing description, the item table names given by `includes` and `coupling` of the items are followed to find every referenced item table. Only the item tables reached are read and validated; the items of inline lists are traversed the same way. So importing a large common description brings none of its items unrelated to this description into the layouts, and a common description can safely grow;
- **Lookup by name.** A name is looked up in the `item_tables` of all the descriptions of the name space, whatever the order of the imports. Other root keys are never looked up, whatever their names;
- **Only the names reached are compared.** An item table reached must be defined in exactly one description of the name space: defined both locally and in an imported description, or in two imported descriptions, it is a violation, and no qualified names are introduced. Item tables not reached are not compared;
- Item table names need to be unique only within a description and its imports; the name spaces of different descriptions have nothing to do with each other.

## 5. Validity

Breaking any of the rules below is a violation. The violations of §5.1 to §5.3 are reported by `yaml` and `desc_file` when reading (§1.1); registration checks only the rules that depend on the state of a scope ([spec-layout.md](spec-layout.md) §3).

### 5.1 Description

- The root of a description is a mapping;
- `imports`, when given, is a list of strings; every path can be read and parsed; the text of ``yaml`...` `` has no relative path; imports do not form a cycle;
- `layouts`, when given, is a list of strings, with no name twice;
- The names listed by `layouts` are identifiers of JavaScript (letters of any script, digits, `_` and `$`, not starting with a digit), as a layout name is part of type names ([spec-layout.md](spec-layout.md) §5);
- `item_tables`, when given, is a mapping, in imported descriptions too;
- The names listed by `layouts` and the item table names referenced by items have an item table in the name space, which is a list of items; a value that is not a list is a violation;
- An item table reached that is defined in two descriptions of the name space is a violation naming both (a file by its path, the text of ``yaml`...` `` as `YAML text`); nothing is overridden;
- Item tables do not reference each other in a cycle;
- Every item is either a tag item or an include item of §3, with the fields §3 requires.

### 5.2 Layout

Every item table listed in `layouts`, with its references expanded, is a layout and also follows these rules:

- Tag names are identifiers (letters, digits and `_`, not starting with a digit; a number, an empty name or a missing name is not one), are unique within the layout and are not reserved names ([spec-data-api.md](spec-data-api.md) §2.10);
- The byte ranges of non-Bool tags do not overlap; each bit belongs to at most one Bool;
- A Bool inside the byte range of a non-Bool tag must be a bit (`coupling`) of that tag; every bit of a combined word must lie inside the word;
- Only one side of a combined word and its bits gives the initial value: if the word gives it, the initial values of the bits come from the whole word; otherwise they come from the bits (a bit without a value is `false`) and the word is composed from them; if neither side gives one, the word and its bits have none;
- The total length of a layout is a whole number of registers (a multiple of 16 bits).

An item table only referenced and not listed in `layouts` is not validated as a layout by itself: its items are expanded into the layouts that reference it and validated with them.

### 5.3 Blocks

- `blocks` is taken as `[]` when absent; when given, it is a list, and every block is a mapping;
- The `name` of a block is given and is a string, unique within a description;
- The `layout` of a block is a string of the form `<scope>.<layout>`, both parts identifiers of JavaScript. It is configuration, and only a string: neither a scope name nor a layout name holds a `.`, so the form is not ambiguous, and it is written as the error `unknown layout X.Y` of `get_layout` writes it. The scope name is required: the package has no default scope ([spec-layout.md](spec-layout.md) §2), and a block that references a layout of its own description writes the name of the scope it will be registered in;
- A layout is found by its scope name only once registered, so whether the scope and the layout exist is checked at registration, not when reading ([spec-layout.md](spec-layout.md) §3).
