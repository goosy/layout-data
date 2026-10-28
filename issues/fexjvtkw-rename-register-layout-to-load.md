---
id: fexjvtkw
opened: 2026-10-28T14:56:11.517Z
closed: 2026-10-28T15:34:47.336Z
title: Rename scope.register_layout to scope.load
status: fixed       # open | accepted | fixed | rejected | wontfix
fixed_in: []        # commit IDs, backfilled at version commit time
labels: []
remote:
problem_title:
proposal_title:
decision_title:
---

## Problem

Since issue#f0j027s2, `scope.register_layout(descriptions)` does two things: it registers the description's layouts into the scope, then creates the ldata listed by `blocks` of the description (spec-layout §3). The return value `{ layouts, ldata }` also contains these two parts. The name is inaccurate in two ways:

- It only mentions registering layouts, not creating instances. For a description with both `layouts` and `blocks`, the line `scope.register_layout(desc_file\`pump.yaml\`)` alone does not show that it creates ldata.
- `layout` is singular, while one call registers all layouts of several descriptions.

## Proposal

- Rename `scope.register_layout(descriptions)` to `scope.load(descriptions)`, meaning loading descriptions into the scope. Parameters, behavior and the return value `{ layouts, ldata }` are unchanged.
- `load` covers both meanings, defining and producing: layouts enter the scope, blocks become instances. When a description has no `blocks`, only the first meaning applies, and the name still makes sense.
- The error title changes accordingly to `invalid descriptions of scope X` (was `invalid layout descriptions of scope X`), since what is loaded is descriptions, and the violations include those of blocks.
- `load` accepts only compiled `Description`s and does not read files; reading files and compiling are done by `desc_file` and `yaml`, which the spec states.
- This is an incompatible change, requiring matching changes to the spec, the design, the README, the implementation, the type declarations, the tests, the benchmarks and `type_check/consumer.ts`; the notes in `render_types` mentioning `register_layout` must also be changed, and both the English and zh-cn versions of the spec and the design must be changed. The old name is not kept.
- Implemented in the same version as issue#37h39ham (the layout of a block gives only the layout name).

Rejected alternatives:

- Add an alias `scope.register_ldata` for the same function: one function with two names makes readers think they do two things; the name is also inaccurate, since a call first registers layouts, a description with only `layouts` creates no ldata at all, and ldata is created, not registered.
- `register` or `register_description`: express only defining, not creating instances; `register_description` is singular while the parameter can be a list.
- `apply`: suggests something like `kubectl apply` that can be run repeatedly, while here loading the same `blocks` again reports duplicate names.
- `instantiate`: expresses only instances, but layouts are not instances; in this package instances mean blocks and ldata.
- `install`, `deploy`: carry meanings from package management and operations, and suggest doing it only once.
- `add`, `define`: `add` is too vague, `define` expresses only defining.
- Split into two methods, registering layouts and creating blocks: one description would need two calls, "all or nothing" could only be guaranteed in two parts, and the method creating blocks would still have to take the whole `Description`.

## Decision

Accepted, implemented as proposed. Since registration also creates blocks, `register_layout` only mentions registering layouts and does not match what it does; `load` expresses loading descriptions into the scope, covering both layouts entering the scope and blocks becoming instances; parameters, behavior and the return value are unchanged, only the name changes.
