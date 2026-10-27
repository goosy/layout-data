# Description Specification

> English version of [spec-description.zh-cn.md](spec-description.zh-cn.md), the primary Chinese version. When the two differ, update both.
>
> This document defines the description, the form of layouts before they are registered and compiled: description files and description objects, item tables and `item_tables`, `layouts`, items, traversal and merging, and the rules a description must follow. It refines [spec.md](spec.md). The registration and the layout objects it makes are in [spec-layout.md](spec-layout.md), the implementation in §3 of [design.md](design.md).

## 1. Forms

A description takes one of two forms with the same structure:

- a **description file**: a YAML 1.2 file, given by its path;
- a **description object**: the same structure in code (§6).

Descriptions are registered by `register_layout` of a scope ([spec-layout.md](spec-layout.md) §3). One registration may give several descriptions; they are merged and processed together (§4).

## 2. Structure

The root of a description is a mapping, and the package uses only two root keys in it:

- **`layouts`**: a list of layout names. Every name listed is the name of an item table, and that item table is registered as the layout of the same name;
- **`item_tables`**: a mapping from item table names to item tables. An **item table** is a list of items (§3); it is listed as a layout by `layouts`, or referenced by name by the `includes` and `coupling` of items.

```yaml
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
```

- A layout and a referenced item table are the same kind of thing and differ only in use: one item table may be listed in `layouts` and referenced by other item tables as well;
- All the root keys other than `layouts` and `item_tables` belong to the caller: the package neither reads nor validates them, and item table names never collide with them. So a description may carry other content: a larger configuration, part of which is the description, can be given as a description as it is, without first cutting out the items;
- Of `item_tables`, the package reads only the item tables reached by traversal from `layouts` (§4). Several descriptions may therefore share one larger `item_tables`, each listing its own layouts;
- The order of the root keys does not change the meaning. **Write `layouts` before `item_tables`**: the reader sees which layouts there are, then finds each item table by its name. The examples of this document follow this order.

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

There are two kinds of item, and the declarations name them (`Layout_Item` is either of the two):

| Item | Fields | Declaration |
| --- | --- | --- |
| A tag item | `name`, `type`, `offset` are required; `length`, `init_value`, `comment`, `is_combined`, `coupling` are optional; it has no `includes` | `Tag_Item` |
| An include item | `includes` and `offset` are required; `name_prefix` is optional; it has no `name` and no `type` | `Include_Item` |

- `coupling` is an item table name or an inline list of tag items, never a list of names: the names of the bits are a result of the registration (they appear in the `items` of the layout, [spec-layout.md](spec-layout.md) §4), not an input;
- A description object has the declaration `Layout_Description`: `layouts` is a list of strings, `item_tables` maps names to lists of `Layout_Item`, and any other root key may hold any value. In the declarations the parameter of `register_layout` of a scope is typed with it, so that an editor completes the fields of an item written in code and notices a misspelled one.

## 4. Traversal and merging

When registering, the descriptions are merged first, and then traversed from `layouts`:

- **`layouts` is merged.** Every description may have `layouts`, and the lists of all descriptions are merged into one list. A description needs no `layouts` (a file of common item tables has none), but the merged list has at least one name;
- **Traversal.** Starting from the names listed by the merged `layouts`, the item table names given by `includes` and `coupling` of the items are followed to find every referenced item table. Only the item tables reached are read and validated, and appear in the result of the registration; the items of inline lists are traversed the same way;
- **Names are looked up across descriptions.** A name is looked up in the `item_tables` of all the descriptions, whatever their order in the list: a layout may reference an item table of any description. Other root keys are never looked up, whatever their names;
- **Only the names reached are compared.** An item table reached must be defined in exactly one description; item tables not reached are not compared, so two descriptions may each have an item table of the same name that no layout reaches.

The item tables reached are returned with the result of the registration (`tables`, returned by `register_layout`, [spec-layout.md](spec-layout.md) §3), by item table name, holding the items with the references expanded: `includes` and `coupling` are lists of items, never names, every `length` is present, and offsets are relative to the start of the item table. They are still in the form of the description, declared `Layout_Item`; for example, they give all the tag names of a parameter block.

## 5. Validity

Breaking any of the rules below is a violation. Registration reports all the violations and registers nothing ([spec-layout.md](spec-layout.md) §3).

### 5.1 Description

- `layouts`, when given, is a list of strings;
- `item_tables`, when given, is a mapping;
- The merged `layouts` has at least one name, and no name twice: a name repeated in one description or in different descriptions is a violation, and is not deduplicated;
- The names listed by `layouts` are identifiers of JavaScript (letters of any script, digits, `_` and `$`, not starting with a digit), as a layout name is part of type names ([spec-layout.md](spec-layout.md) §5);
- The names listed by `layouts` and the item table names referenced by items have an item table in `item_tables`, which is a list of items; a value that is not a list is a violation;
- An item table reached that is defined in two descriptions is a violation naming both (a description file by its path, a description object by its position in the list, `layout description #2`); nothing is overridden;
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

## 6. Giving a description in code

A description needs no file. Give a description object, the structure of §2, to `register_layout` of a scope:

```js
const scope = create_scope("app");
scope.register_layout({
  layouts: ["Pump"],
  item_tables: {
    Pump: [
      { name: "id", type: "UInt", offset: 0, init_value: 0 },
      { name: "pressure", type: "Real", offset: 32, init_value: 0 },
    ],
  },
});
const data = scope.get_layout("Pump").create_ldata("pump_1");
```

- the items are those of §3; `length` may be omitted; `coupling` and `includes` take an inline list or the name of an item table of any of the descriptions registered together;
- when the configuration object of an application carries `layouts` and `item_tables`, the whole configuration object can be given as a description; the other root keys and the item tables not reached from `layouts` are not read;
- the description object and the items in it are not changed;
- there is no separate function that registers one list of items, nor any that expands or validates a structure by itself: registration is the single step that validates.
