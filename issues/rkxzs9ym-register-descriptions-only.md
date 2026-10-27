---
id: rkxzs9ym
opened: 2026-10-27T06:08:40.924Z
closed: 2026-10-27T09:43:54.782Z
title: register_layout accepts only description objects, and YAML text and files are parsed by the exported yaml and yaml_file
status: fixed       # open | accepted | fixed | rejected | wontfix
fixed_in: []        # commit IDs, backfilled at version commit time
labels: []
remote:
problem_title:
proposal_title:
decision_title:
---

## Problem

The descriptions of `scope.register_layout(descriptions)` are paths of description files (strings) or description objects, or a list of them (spec-layout §5.2). This causes two problems:

- **No direct registration from YAML text.** A string always means a path, so YAML written as text in code can only be parsed into an object by the caller. The caller then has to depend on `yaml` directly (pnpm does not allow importing transitive dependencies), and the parse settings (YAML 1.2) and error format may differ from those this package uses when reading files.
- **Registration takes over file reading.** Reading files, parsing YAML and registering layouts are three things, and `register_layout` combines them: the parameter type is `string | Layout_Description`, a string is always a path, and an unreadable file or a syntax error also counts as a registration violation. Adding another meaning (text) to strings could only rely on guessing and would be ambiguous.

## Proposal

- `register_layout(descriptions)` accepts only description objects (`Layout_Description`) or a list of them. A string is no longer a path; given as a description it is a violation, and the error message suggests `yaml` or `yaml_file` instead. Reading and parsing move out of registration.
- The run-time entry `layout-data` exports two functions that return description objects, which the caller combines and passes to `register_layout`:
  - `yaml`: parses YAML 1.2 text into a description object. It can be used as a tagged template (``yaml`...` ``, interpolations concatenated as text) or called normally (`yaml(text)`);
  - `yaml_file`: reads and parses one description file. It can be used as a tagged template (``yaml_file`pump.yaml` ``) or called normally with a path string or a `file:` URL (`yaml_file(new URL("./pump.yaml", import.meta.url))`). Relative paths are resolved against the current working directory;
  - parse and read errors are thrown immediately at the call, as an `Error` with `errors`, in the same format as registration errors; the parse settings are the same as when description files were read before.
- `yaml_file` records the file path on the returned object with an internal, non-enumerable symbol. At registration, duplicate-name errors use it to refer to the description (`item table Pump is defined in a.yaml and b.yaml`), and descriptions without it are still referred to by position as `layout description #2`. This marker is not public API and is gone after spreading or copying the object. The two entries are bundled separately, each with its own copy of the run-time code, and when a development script takes `yaml_file` from `layout-data` and `render_types` from `layout-data/dev`, both sides must recognize the same marker, so it is a global symbol registered with `Symbol.for`, not a module-local `Symbol()`.
- The `descriptions` of `render_types(descriptions, options)` accordingly accepts only description objects. When `options.source` is omitted and all descriptions carry the file marker, the header names these paths; otherwise it only says that the text is generated.
- The development entry does not re-export `yaml` and `yaml_file`: development scripts import them from `layout-data` like applications, so each function has only one import location.
- The usage of the command line `layout-types` is unchanged and still accepts description files: it reads each file with `yaml_file`, collects the errors of all files to report them together, then calls `render_types`.

Example:

```js
import { create_scope, yaml, yaml_file } from "layout-data";

const scope = create_scope("app");
scope.register_layout([
  yaml_file`common.yaml`,
  yaml`
layouts: [Pump]
item_tables:
  Pump:
    - { name: id, type: UInt, offset: 0 }
`,
  { layouts: ["Valve"], item_tables: { Valve: [{ name: "open", type: "Bool", offset: 0 }] } },
]);
```

This is a breaking change: `register_layout("pump.yaml")` becomes ``register_layout(yaml_file`pump.yaml`)``, and likewise for `render_types`.

Rejected alternatives:

- Tell paths and text apart by the content of the string (e.g. whether it has a line break): relies on guessing and is ambiguous.
- Wrap text as `{ yaml: text }` in description objects: the root key `yaml` would occupy another root key name of the caller, and this package reads only `layouts` and `item_tables` (issue#kx4mpc3h), so other root keys should not change the meaning of a description.
- Keep `register_layout` accepting paths and only add `yaml`: registration still takes over file reading, and the parameter has meanings from two sources.
- `yaml_file` accepting several paths separated by `|`: `|` is a valid file name character on Linux and macOS and would need an escape rule; one file at a time has the simplest semantics, and the caller can `map` several files into a list.
- Not marking the file source and always referring by position: duplicate-name errors would no longer say which file, which makes them hard to locate.

## Decision

Accepted, implemented as proposed. Registration only registers: `register_layout` and `render_types` accept only description objects, YAML text and description files are parsed into description objects by `yaml` and `yaml_file` exported from `layout-data`, and the caller combines them; `yaml_file` takes one file at a time and records the source with a global `Symbol.for` symbol, so that errors of both entries and the generated header can still name the file; the command line usage is unchanged. This is a breaking change: `register_layout("pump.yaml")` becomes ``register_layout(yaml_file`pump.yaml`)``.
