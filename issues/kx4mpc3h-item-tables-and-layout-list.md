---
id: kx4mpc3h
opened: 2026-10-27T08:08:11.934Z
closed: 2026-10-27T08:47:31.041Z
title: Structure descriptions as item tables under item_tables plus a list of layout names under layouts, handling only the item tables reached from layouts
status: fixed       # open | accepted | fixed | rejected | wontfix
fixed_in: []        # commit IDs, backfilled at version commit time
labels: []
remote:
problem_title:
proposal_title:
decision_title:
---

## Problem

The structure of a description (description file or description object) is: the root key `layouts` maps layout names to lists of entries, and every other root key is a fragment (spec-layout §2). Layouts and fragments are two different kinds of things in different places, which causes three problems:

- **An item table cannot be both a layout and a fragment.** A group of entries that should be used as a layout on its own and also be `includes`d by other layouts has to be written twice, or split out into a fragment that the layout then includes as a whole.
- **The root cannot hold anything else.** Every root key other than `layouts` is taken as a fragment, and a value that is not a list of entries is a violation. An application's description is often part of a larger configuration (other settings in the same file or object), and the entry part must be cut out before it is passed in.
- **Validation and the returned range cover all fragments.** Fragments that no layout references are also resolved and their errors reported, and the `fragments` returned by `register_layout` include them too, which does not fit the usage of "caring only about layouts".

Besides, the structure of descriptions is currently written in spec-layout §2, §3 and §6, mixed with scopes, registration and layout objects, with no document dedicated to descriptions.

## Proposal

**Structure.** Layouts and fragments are unified as **item tables**. The root key `item_tables` maps item table names to lists of entries; the root key `layouts` is a list of layout names, and the item tables it lists are the layouts. An item table can both be listed in `layouts` and be referenced by `includes` / `coupling`. This package uses only the two root keys `layouts` and `item_tables`; all other root keys are left to the caller.

```yaml
layouts: [NODE]

item_tables:
  NODE:
    - { name: ID, type: UInt, offset: 0, init_value: 0 }
    - { name: response_code, type: Word, offset: 128, coupling: node_commands }

  node_commands:
    - { name: stop_pumps, type: Bool, offset: 8, init_value: false }
    - { name: cancel_stop, type: Bool, offset: 9 }
```

The order of the root keys does not affect the meaning. The documentation recommends writing `layouts` before `item_tables`: readers first see which layouts there are, then find each item table by name. All examples in the documentation follow this order.

**Traversal.** This package reads only `layouts` and `item_tables`: starting from the names listed in `layouts`, it looks them up by name in `item_tables`, follows the name references of `includes` and `coupling`, and reads, caches and validates only the item tables it reaches. Other root keys and item tables in `item_tables` that are not reached are neither read nor validated, so a description can carry other content, a superset of a layout description can be passed in directly, and several descriptions can share one larger `item_tables` while each lists different layouts.

**Several descriptions.**

- Each description may have `layouts` and `item_tables`; at registration the `layouts` are merged into one list. Names in the merged list must not repeat; a repetition is a violation whether it occurs within one description or across descriptions;
- A reached item table must be defined in the `item_tables` of exactly one description; being in two descriptions is a violation, and the error names both descriptions; item tables not reached are not compared;
- The merged `layouts` has at least one name.

**Validation.**

- It is a violation when `layouts` is not a list of names, `item_tables` is not a mapping, a listed or referenced name has no corresponding item table in `item_tables`, or a reached item table is not a list of entries;
- Item tables listed in `layouts` are fully validated as layouts (spec-layout §4); item tables that are only referenced and not in `layouts` are validated only for the entries themselves and the references (the fragment exists, no cycles), without layout-level checks (overlap, total length, etc.).

**Resulting changes (breaking).**

- All description files and description objects must be rewritten: `layouts: { Pump: [...] }` becomes `layouts: [Pump]` plus `item_tables: { Pump: [...] }`, and the former fragment root keys move into `item_tables`;
- Layouts and fragments share the single name space of `item_tables`; a name can have only one item table;
- Unreferenced item tables are no longer errors;
- `fragments` in the return value of `register_layout` becomes all reached item tables (after expanding references), and its name is adjusted accordingly;
- The type declaration `Layout_Description` changes accordingly: `layouts` is a list of names, `item_tables` maps item table names to lists of entries, and other root keys hold anything; when item tables are written inline, editors can still complete fields per entry.

**Documentation.** Create `doc/spec-description.md` (and `doc/spec-description.zh-cn.md`) dedicated to descriptions: description files and description objects, item tables and `item_tables`, `layouts`, traversal and merging, entries (now spec-layout §3), giving descriptions in code (now §6), validity at the description level, and the writing recommendation of putting `layouts` first. These sections of spec-layout are changed in place to introductions pointing to the new document; layout-level validity, scopes, registration, layout objects and type declarations stay in spec-layout. spec.md references the new document.

**Relation to issue#rkxzs9ym.** Both are breaking changes to the description and registration interfaces and should be released in the same version. The examples in issue#rkxzs9ym and its rejection reason "`{ yaml: text }` would occupy a root key" are rewritten for the new structure.

Rejected alternatives:

- Keep `layouts` as a mapping and add a marker "a fragment can also be a layout": the two places still coexist, and supersets still have to be cut.
- Item tables directly as root keys (the root key name is the item table name): item tables share one name space with the caller's own root keys, and root key names the caller uses can no longer be item table names; a misspelled name in `includes` / `coupling` may happen to point at a root key of the caller, reported as "not a list of entries" rather than "unknown item table", which is hard to locate; once the root allows arbitrary content, type declarations can no longer complete fields per entry.
- Take every root key not in `layouts` as a fragment and validate all of them: the root cannot hold anything else.
- Validate all item tables in `item_tables`: several descriptions could no longer share one larger `item_tables`, and unreferenced item tables would be errors again, back to the third point of the problem.
- Put `layouts` into one root key as well (e.g. `layout_data: { layouts, item_tables }`), occupying a single root key: every description gets one more level of indentation, and two fixed root keys are already few enough.
- Deduplicate repeated names when merging several `layouts`: a repetition is most likely the same description registered twice or a naming conflict, and silent deduplication would hide it.

## Decision

Accepted. With item tables unified and placed under `item_tables`, an item table can be both a layout and a fragment, and item table names do not occupy the caller's root keys; with only the item tables reached from `layouts` handled, a description can carry other content, and supersets need no cutting. The breaking change is released in the same version as issue#rkxzs9ym.
