---
id: f0j027s2
opened: 2026-10-28T04:48:53.930Z
closed:
title: Descriptions are YAML only, each self-contained with dependencies brought in by imports, yaml and desc_file compile them to a Description, and blocks describe ldata instances
status: accepted    # open | accepted | fixed | rejected | wontfix
fixed_in: []        # commit IDs, backfilled at version commit time
labels: []
remote:
problem_title:
proposal_title:
decision_title:
---

## Problem

The current flow is: `yaml` / `yaml_file` parse YAML into description objects, and `scope.register_layout(descriptions)` merges the list of descriptions, traverses from `layouts`, validates and generates layouts (spec-description §1, §4, spec-layout §3). This causes five problems:

- **One description cannot yield its layouts on its own.** A description can reference item tables of another description (e.g. `pump.yaml` referencing `common.yaml` in spec-layout §1), so its meaning depends on what it is registered with, and layouts can only be generated after merging at registration. Before registration there is no stable way to get the layouts of one description; reusing layouts by content can only normalize the whole list of descriptions and compute a characteristic value (modbus-emulator issue#99agfr7m, and the `layout_fingerprint` proposal in the TODO).
- **Description objects are an unnecessary intermediate product.** They are convenient for programs to manipulate but unsuited as configuration: configuration should be easy for people to read, and people read YAML, not objects. Actual dependents do not need them either: the layouts of TLMS_ESD.js are all in `src/layouts.yaml`, and what is generated dynamically at run time is the description of ldata instances (the `blocks` given to modbus-emulator), not of layouts; dynamically assembled description objects appear only in `test/share.js`, to register test layouts together with `layouts.yaml`. Keeping description objects makes the spec cover two forms, description files and description objects (spec-description §1, §6), declare `Layout_Description`, and support using an application's whole configuration object as a description.
- **The name `yaml_file` does not say what it reads.** It reads what the spec calls a description file, yet the name looks like a general YAML file reading function.
- **Instances cannot be looked up by name, and a scope can register only once.** There is nowhere to look up ldata by name, and instance names can repeat freely; each scope can register only once, because descriptions reference each other and can only be generated at once after merging.
- **There is no description format for ldata instances.** This package only provides `layout.create_ldata(name)`; where and how instances are written is up to each application. The description files of modbus-emulator write `blocks` (`{ name, unit_id, layout, start, offset }`) together with `layouts` and `item_tables`, and its `#read_blocks` looks up layouts, creates ldata, checks duplicate block names and collects errors one by one by itself; of these only `name` and `layout` belong to the data block, while `unit_id`, `start` and `offset` are the Modbus address mapping.

## Proposal

### Descriptions are YAML only

- Descriptions have only one form: YAML 1.2 text, written in code (``yaml`...` ``) or in a description file (`desc_file`). JSON is valid YAML 1.2; the spec states that JSON text and `.json` files are also valid descriptions, with no extra function.
- Remove the public concept of description objects: `register_layout` no longer accepts objects, `Layout_Description` is no longer exported, and spec-description §6 (giving descriptions in code) and the usage "using an application's whole configuration object as a description" are removed with it. Users generating descriptions by program generate YAML text instead, or interpolate with the `yaml` tag.

### Each description is self-contained, with dependencies declared explicitly by imports

- A description together with the descriptions it imports is complete: compiling it needs only itself and its `imports`, and the result is determined only by these contents.
- Add the root key `imports`, alongside `layouts` and `item_tables`, listing the paths of the imported description files:

  ```yaml
  imports:
    - common.yaml
  layouts: [Pump]
  item_tables:
    Pump:
      - includes: Motor_Status   # from common.yaml
  ```

- `imports` only provides item tables: the `layouts` of imported descriptions are always ignored, and traversal starts only from the importer's `layouts`. By the existing traversal rules only the reached item tables are read and validated, so importing a large common description does not bring its entries unrelated to this description into the layouts, and common descriptions can safely be large.
- Name conflicts compare only reached names: a reached item table defined both locally and in an imported description (or in two imported descriptions) is a violation, reported directly, without introducing qualified names.
- Imported descriptions may have `imports` of their own; circular imports are a violation.
- Relative paths in a description file are relative to that file. Text written with ``yaml`...` `` has no file of its own, and a template tag cannot be given a base either, so relative paths in it are a violation; only absolute paths and `file:` URLs are accepted; callers needing a relative location interpolate it themselves, e.g. `${new URL("common.yaml", import.meta.url)}`.
- Item table names need only be unique within one description and its imports, no longer within a scope.
- `imports` becomes a root key read by this package and can no longer be used by callers for other purposes.

### yaml and desc_file compile to a Description in one step

- `yaml` and `desc_file` read, parse and compile, returning the compiled `Description` of the description (whose layouts are not yet registered), and no longer produce description objects. Parse, import and validation errors are thrown at the call, as an `Error` with `errors`.
- What is compiled are layouts not yet bound to a scope: traversal, validation, compilation and fingerprint are all done, only `scope` is missing. An unbound layout cannot `create_ldata` (it throws). Layouts used by callers are obtained only from scopes (the registration result or `get_layout`), so `scope` is always present in the public `Layout` type.
- ``yaml`...` `` and `desc_file` return one description as a `Description`, which is given to `register_layout` (and `render_types`):

  ```js
  /**
   * @typedef {Omit<Layout, "scope">} Layout_Desc           // one compiled layout, not bound to a scope
   * @typedef {{ name: string, layout: string } & Record<string, unknown>} Block_Desc
   * @typedef {{ layouts: Record<string, Layout_Desc>, blocks: Block_Desc[] } & Record<string, unknown>} Description
   */
  ```

  - `layouts` maps the layout names of the description to unbound layouts, with the same keys as the names listed by the root key `layouts`;
  - `blocks` is the parsed list of blocks itself, checked, not copied or altered, keeping the application's own keys. When omitted in the source (no such root key) it is `[]`, the only change to the return value besides `layouts`; the default is filled in before checking, so a `blocks` that is given but is not a list is still a violation. When the application reads its own keys (such as `unit_id`, `start`, `offset` of modbus-emulator), whether it uses the values here or parses the description itself is up to the application;
  - other root keys are returned as they are: of the root object parsed from YAML, only `layouts` is replaced by the compiled result, and the other root keys (including `imports`, `item_tables` and the application's own root keys) are put into `Description` as the parsed objects; `imports` keeps the original paths, and `item_tables` keeps the unexpanded entries. The application reading its own root keys need not parse the YAML again; this package reads only `layouts` and `blocks`, no other keys. Only the root keys of the description read in are returned; the root keys of imported descriptions are not merged in;
  - `Description` and everything in it are deeply frozen, including the root keys returned as they are: they are objects newly created by parsing, so freezing does not affect the caller;
  - type names are named from the description side, consistent with the abbreviation in `desc_file`.
- With each description compiled independently, registration no longer has to happen at once: the rule "each scope registers only once" is removed. `scope.register_layout` can be called many times, binding, reusing or rejecting each layout by the fingerprint rules below.
- The parameter of `register_layout(descriptions)` is one `Description` or a group of `Description`s. It returns `{ layouts, ldata }`: `layouts` indexes by layout name the layouts registered by this call (bound to this scope; a reused one is the existing one in the scope), and `ldata` indexes by block name the ldata created from `blocks` by this call. Block names of the descriptions in one call must not repeat, otherwise it is a violation, since they are merged into the same index.
- Registration never alters the `Description` passed in: each time it generates new bound layouts from its `Layout_Desc`s, or reuses existing layouts with the same fingerprint in the scope; so one `Description` can be cached and registered into any number of scopes.
- Within a scope, fingerprints are taken per layout: whether layouts are the same is decided by the fingerprint, and layout names are used only for lookup and locating. The fingerprint is determined only by the compiled structure (the names, types, offsets and initial values of the tags), without layout names and comments. The fingerprint is internal and not exposed; the `layout_fingerprint` proposal in the TODO is superseded by it.
- When registering a layout in a scope:
  - the scope already has a layout with the same fingerprint: with the same name too, the existing layout is reused and no new layout is generated; a different name is a violation;
  - the scope has no layout with the same fingerprint: a name equal to an existing layout is a violation; otherwise a new layout bound to this scope is generated from the layout passed in.
- One `register_layout` call takes effect entirely or not at all: violations are collected and thrown together (an `Error` with `errors`), and the scope stays in its state before the call, with existing layouts and ldata unchanged.
- The mapping from fingerprints to layouts is kept by each scope itself, and this package holds no cross-scope fingerprint table, so fingerprints are compared only within one scope: one description registered into two scopes generates independent layouts in each, and duplicate layouts are not required to have only one instance.
- The layout name is the name listed by `layouts` of the description and cannot be changed at registration.
- The registration result no longer contains `tables` (the expanded form of the reached item tables): it is only an intermediate product of compilation, and the item tables dependents use are those they read from YAML themselves.
- Compiled layouts are already independent of descriptions in memory (referenced item tables are deep-copied at each place when expanded, and layouts share only the module constant `CODECS`), so the layouts compiled from one description can be cached and reused directly, unaffected by other descriptions.

### Scopes manage layouts, layouts manage instances

- A scope manages a group of layouts: layout names are unique within a scope, and a layout belongs to only one scope (`layout.scope` is kept). The same compiled result registered into two scopes yields two unrelated layouts; duplicate layouts each take their own resources in exchange for a simple ownership relation.
- A layout manages its ldata: an ldata belongs to only one layout (`ldata.layout`). Add `layout.get_ldata(name)`, which finds by name an ldata created by this layout and throws when the name does not exist (`unknown ldata X.Y.Z`), consistent with `get_layout`. ldata names are unique within their layout, and `create_ldata` throws an `Error` on a duplicate name (`ldata X.Y.Z already exists`, corresponding to `unknown ldata X.Y.Z`); ldata of different layouts (including layouts with the same name in different scopes) may have the same name.
- Users needing several groups of instances with the same names register the layouts into different scopes, and the layouts of each scope manage their own instances.
- The log name of an ldata is still `<scope_name>.<layout_name>` plus the ldata name.
- This issue provides no mechanism to release ldata (there is none now either); that is handled by another issue, and the way layouts hold ldata must leave room for adding release later.

### blocks describe ldata instances

- Add the root key `blocks`, alongside `layouts`, `item_tables` and `imports`, listing the ldata instances of the description. Each entry is a mapping, of which this package reads only `name` (the instance name) and `layout` (the layout); the other keys of an entry are not read and are left to the application, such as `unit_id`, `start` and `offset` of modbus-emulator:

  ```yaml
  layouts: [PUMP]
  blocks:
    - { name: pump_1, layout: app.PUMP, unit_id: 1 }   # unit_id is read by the application
  ```

- The compiled result contains only the list `blocks` (plain data), no ldata, so it can still be cached and reused together with the layouts. The ldata of blocks are created at registration: one `register_layout` call first registers all layouts in the call, then creates all blocks, so a block can reference a layout of another description in the same call. Each block creates an ldata on the layout `layout` points to, managed by that layout by block name; a block name equal to an existing ldata of that layout is a violation, including registering a description with the same `blocks` again in the same scope: layouts are reused by fingerprint, but blocks are not, which is a configuration error. To create several groups of instances with the same names from one description, register the layouts into different scopes, with the scope names written in the blocks differing accordingly, which the caller arranges.
- `layout` is configuration and can only be a string, not a reference to a layout object; its form is fixed as `<scope_name>.<layout_name>`, and the scope name must be written. Scope names and layout names are both identifiers without `.`, so the form is unambiguous and consistent with the error message `unknown layout X.Y` of `get_layout`. A scope with no such name, or a scope without this layout, is a violation.
- A layout can be found by scope name only after it is registered, so `layout` is resolved at registration, not at compile time; a block in a description referencing a layout of the same description must also write the scope name it will be registered into.
- Block names are unique within one description. Violations are collected and reported together (an `Error` with `errors`), without stopping at the first error.
- Checks are done in two places:
  - `yaml` / `desc_file` do the scope-independent checks, with errors reported when reading, with the position in the original file: `blocks` is a list and its entries are mappings; `name` must be given and be a string; block names are unique within one description; `layout` is a string of the form `<identifier>.<identifier>`; the `blocks` of imported descriptions are discarded here.
  - Registration only does the checks related to scope state: the scope named by `<scope_name>` exists, the scope has this layout, and the block name does not equal an existing ldata of that layout.
- The `blocks` of imported descriptions are always ignored, like `layouts`: instances come only from the importer.
- `blocks` becomes a root key read by this package, and `name` and `layout` in its entries belong to this package; the other keys of entries are always left to the application.

### Naming

- Keep `yaml`. Template tags are conventionally named for the language written in the template, not for the return value (lit's `html`, graphql-tag's `gql` and the `sql` of various database libraries all return objects); the meaning "this is a layout description" is given by the call site.
- Rename `yaml_file` to `desc_file`. It is not a case where the tag convention applies (its parameter is a path, not content), so it is named for what its parameter is: a description file, consistent with the spec's terminology, and it cannot be misread as a general YAML reading function.
- Rejected names:
  - `desc` instead of `yaml`: descriptions used to include description objects and are not necessarily YAML, and `desc(...)` suggests it accepts objects or constructs descriptions;
  - `file` instead of `yaml_file`: too general, easily shadowing or shadowed by the user's variables, and the name alone does not show its purpose;
  - `descfile`: an abbreviation also counts as a word and should be separated in snake_case, consistent with the precedent of `yaml_file`.

### Affected parts

- The input of `render_types` becomes `Description` (the return value of `yaml` / `desc_file`); the command line `layout-types` still accepts description files.
- modbus-emulator re-exports `yaml` and `yaml_file` and must rename accordingly; its `create_upward` collects `errors` at registration and must be adjusted now that description errors are thrown earlier, when reading.
- `test/share.js` of TLMS_ESD.js writes its test layouts with `yaml` instead and brings in `layouts.yaml` with `imports`.
- `#read_blocks` of modbus-emulator leaves creating instances to this package, reads `unit_id`, `start` and `offset` itself and attaches them to the unit table; the `name` of a block must be written, and the default name `unit_${unit_id}` is filled in by the emulator itself when it generates the configuration; the `BLOCK_KEYS` check is adjusted accordingly. The `layout` of blocks is rewritten as `<scope_name>.<layout_name>`. When registering layouts the caller specifies the scope name explicitly, and that is the name written in `blocks`; an automatically generated scope name (such as `s<fingerprint>`) that cannot be obtained or is written wrong is the caller's own business, and this package provides no means of looking it up.

This is a breaking change: description objects are removed, `yaml_file` is renamed to `desc_file`, the return value of `yaml` and `desc_file` changes from description objects to `Description`, the parameter of registration changes accordingly, the registration result no longer contains `tables`, the scope of item table names shrinks from the scope to the description, `blocks` becomes a root key read by this package, the rule "each scope registers only once" is removed, and ldata names must be unique within their layout.

Rejected alternatives:

- Drop registration and export layouts from ES modules instead: registration must stay, since it provides the scope for looking up layouts by name.
- Declare imports with YAML comments (e.g. `# @import common.yaml`): comments are not data and are discarded when parsing; letting comments carry semantics goes against the intent of YAML.
- Declare imports with a custom YAML tag (e.g. `!include common.yaml`): depends on parser extensions and is not general YAML.
- Keep `Layout_Description` as the type of the return value: it also carries `blocks` and is not just a layout description; the old name with a changed meaning would make migrators think objects can still be passed.
- Name the type of the return value `Compiled_Description`, `Unbound_Layout` or the like: puts the internal compilation state into public names.
- `Description` containing only `layouts` and `blocks`: an application reading its own root keys (such as the overall configuration of a device emulator) would have to parse the same text as YAML again, and could not get the same content `desc_file` parsed.
- This package defines a complete instance description (including address fields and the like): fields other than `name` and `layout` belong to device communication, outside the scope of this package.
- `layout` giving only the layout name, looked up in a default scope or in this description: this package has no default scope (spec-layout §2), and giving only the layout name would make the meaning of a block depend on what it is used with.
- Keep instances out of descriptions and keep only `create_ldata`: each application would keep writing its own code to look up layouts, create instances and check duplicate names, and the way of writing instances could not be unified.
- Manage ldata names by instance groups held by the caller (`blocks` returns a group, and directly created instances join a group): when several separately registered descriptions each have `blocks`, the registration method has no way to specify which group they go into; creating instances with a layout after registration and also looking them up with the layout is a more natural mental model.
- Scopes manage only names, not identity (neither layouts nor ldata reference scopes, the same object can be put into several scopes, and scopes can also hold ldata): callers would have to record themselves which scopes each object was put into, too heavy a mental burden; it only lets duplicate layouts share one instance, saving resources without improving run-time efficiency.
- Strictly self-contained, without imports: common item tables could only be copied into each description, losing sharing.
- Rename layouts at registration with an optional mapping parameter, to change layout names without touching the description source: the name conflict it would solve is solved by registering the layout into another scope; after renaming, `blocks` in the same description written with the original name would not find the layout, and the type names generated by `render_types` would differ from the layout names in the scope. No existing dependent needs it; as an optional parameter it can be added when needed without breaking existing usage.
- Add `json` as an alias of `yaml`: the name promises a JSON format it does not check, and `` json`a: 1` `` would pass too; users wanting to mark it can rename it on import themselves. A strict `json` (parsing with `JSON.parse`) is an additive feature and can be added after 1.0 when needed.

## Decision

Accepted, implemented as proposed. Only with descriptions being YAML only and each self-contained can layouts be obtained apart from the combination at registration and reused by fingerprint, after which the rule "each scope registers only once" can be removed; the ownership of scopes managing layouts and layouts managing ldata stays simple, and `blocks` saves callers who create blocks in bulk from duplicated code. Releasing ldata gets a separate issue.
