---
id: v4rrhbrw
opened: 2026-10-26T19:26:00.817Z
closed: 2026-10-26T19:45:28.000Z
title: Move type generation to a development entry, generate from descriptions, and stop locating the module of Ldata
status: fixed       # open | accepted | fixed | rejected | wontfix
fixed_in: [086dfd5]  # commit IDs, backfilled at version commit time
labels: []
remote:
problem_title:
proposal_title:
decision_title:
---

## Problem

The type generation of spec-layout §8 is the scope method `scope.render_types(options)` (issue#h57v9x2x), released in v0.4.0. It has two problems:

- **It mixes development and run time.** Type declarations are only read by editors; generating them is a development matter, run once by a development script after layouts change, and the application does not need it at run time. Yet it is a member of `Layout_Scope`: every scope at run time carries the method, and the run-time entry includes its implementation.
- **It takes over the caller's module location.** The generated declarations import `Ldata`, and `options.ldata_module` gives the module specifier of that import, "relative to the output file". This requires this package to know where the caller puts the file and how it organizes its modules, which is the caller's business and should not be expressed by a parameter of this package. The type tests of this repository self-reference the package name `"layout-data"` and do not need this option either.

## Proposal

- Remove `render_types` from `Layout_Scope`. Add a development entry `layout-data/dev` (`exports["./dev"]` in `package.json`, file `src/dev.js`). The run-time entry `layout-data` no longer includes type generation.
- The development entry exports `render_types(descriptions, options)`, which generates the declaration text from descriptions:
  - `descriptions` is the same as what `register_layout` accepts: paths of description files, description objects, or a list of them. The function creates a scope internally, registers these descriptions and generates the text for all their layouts;
  - `options.scope` is a scope name, used only in the example given in the header comment, default `app`; it should be the scope name actually used in the application;
  - `options.source` is the source written in the header comment; when omitted, if the descriptions are all file paths the header names these files, otherwise it only says that the text is generated;
  - invalid descriptions throw the same `Error` with `errors` as `register_layout`; an invalid scope name throws the same exception as `create_scope`.
- Remove `options.ldata_module`. The generated text always writes `import type { Ldata } from "layout-data";`: this is the name of this package, not a location. Types are generated at development time, the developer's project depends on this package, and the generated declarations are read by that project's editor, so it always resolves.
- The same file doubles as a command line tool, named `layout-types` in `bin` of `package.json`, and uses `import.meta.main` to tell whether it runs as the entry. The command line only parses arguments and then calls `render_types`:
  - `layout-types <description files...> [--scope <name>] [-o|--out <file>]`;
  - positional arguments are description files, at least one;
  - `--scope` corresponds to `options.scope`, default `app`;
  - `-o`/`--out` is the output file; when omitted, output goes to standard output;
  - `-h`/`--help` shows the usage, including the version requirement;
  - on error the reason goes to standard error (listing each problem when the descriptions are invalid), the exit code is non-zero, and no output file is written.
- The command line only handles description files; when layouts are given in code as description objects, write a development script with the function entry.
- `import.meta.main` requires Node >= 24.2. This only constrains the development environment that generates types and does not affect the run-time `engines` (`node >= 20.11`); the function entry also only needs `node >= 20.11`; switching Node versions at development time to generate types is a capability developers are expected to have. The specification and the command line help state this requirement; when the command line runs on an earlier Node, it must not silently output nothing but state the required version, the current version and how to use the function entry instead, and exit with a non-zero code.

This is a breaking change: `scope.render_types(options)` becomes `render_types(descriptions, options)` imported from `layout-data/dev`, its parameter is descriptions rather than a scope, and `ldata_module` is no longer provided.

Rejected alternatives:

- `render_types(scope, options)`, taking an already registered scope object: generating types only needs descriptions; taking a scope object ties the development tool to a run-time object, and makes the inputs of the function entry and the command line differ.
- Keep `ldata_module` as "the package name providing `Ldata`": this package would still write the module specifier for the caller, while this package is always available at development time, so the option is not needed.
- The generated file does not import `Ldata` and only generates `<Layout>_Tags`: `<Layout>_Ldata` disappears, and users have to compose `Ldata & <Layout>_Tags` themselves, which is verbose.
- This package declares global types (such as `Layout_Data.Ldata`) so that the generated file needs no import: pollutes the global type space, and needs a hand-written declaration file for it.
- Compute the location of `Ldata` with `import.meta.url`/`import.meta.resolve`: that is the absolute path of the run-time JS file, not the location of the type declarations, and written into the generated file it is not portable.
- Split the function and the command line into two files: one more file, and telling the entry apart can be done with `import.meta.main` in the same file.

## Decision

Accepted, implemented as proposed. Type generation is a development matter, so it moves to the development entry `layout-data/dev` and the run-time entry no longer includes it; types are generated from descriptions, the same input as `register_layout`; the generated text always imports `Ldata` from `"layout-data"` and no longer locates the module for the caller. The command line `layout-types` requires Node.js >= 24.2, which only constrains the development environment that generates types; the run-time `engines` is unchanged. This is a breaking change that concerns only type generation at development time; the run-time API is unchanged.
