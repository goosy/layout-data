---
id: h57v9x2x
opened: 2026-10-24T14:45:09.502Z
closed: 2026-10-26T10:47:45.000Z
title: Separate layouts into scopes, each of which can register once
status: fixed       # open | accepted | fixed | rejected | wontfix
fixed_in: [85926c5]  # commit IDs, backfilled at version commit time
labels: []
remote:
problem_title:
proposal_title:
decision_title:
---

## Problem

spec-layout §5 specifies that `register_layout` can be called only once per process; the registration result is kept in a module-level singleton (`registry.js`), and layout names are valid for the whole lifetime of the process. All layouts registrable in a process can only be one whole.

So none of the consequences listed in spec-layout §5 can be worked around:

- A library built on layout-data cannot call `register_layout` itself; it can only export the paths of its description files for the application to merge; if two such libraries have layouts or fragments with the same name, the application cannot use both.
- A process cannot have two mutually independent groups of layouts, for example to emulate at once two devices whose layouts are defined differently but have the same layout names.
- Tests cannot register layouts in isolation within one process; they can only call the internal function `register_descriptions`, bypassing the public interface.

## Proposal

This issue depends on issue#ckft7m0z (make layouts objects that create ldata) and is to be implemented after it.

Introduce the **scope** (type `Layout_Scope`) as the unit separating layout names:

- Several scopes can be created; each has its own layouts and fragments and can call `register_layout` once; "once per process" becomes "once per scope", and the rules of one registration, validation as a whole and all-or-nothing registration are unchanged within a scope.
- Layout names and fragment names are unique only within a scope; equal names in different scopes do not conflict.
- **There is no default scope.** Layouts can only be registered into explicitly created scopes, and an application also creates its own scope; registration without a scope no longer exists, and the global `register_layout` is removed with it. This is a breaking change: the existing `register_layout(descriptions)` becomes creating a scope and then registering into it, `get_layout(name)` becomes obtaining from the scope, and `render_types(layouts, options)` becomes type generation of the scope.
- The scope name is given when the scope is created and, like a layout name, must be a JavaScript identifier (spec-layout §4), so it contains no `.` and `scope_name.layout_name` can be split unambiguously; strings with `@`, `/` or `-` such as package names cannot be used directly as scope names. Scope names are unique within the process; choosing one is the responsibility of the library or application that creates the scope, and creating a scope with a duplicate name is an error.
- Scopes can be queried and obtained: an already created scope can be obtained by its name, and on a scope one registers, obtains layouts by layout name and generates types; a layout can also give the scope it belongs to. The global `register_layout`, `get_layout` and `render_types` are no longer provided; registering and obtaining layouts go only through scopes. ldata is created from a layout (issue#ckft7m0z), so the interface never needs a string to point at a layout of some scope; `scope_name.layout_name` is only how error messages and logs point at a layout, e.g. `lib_a.Pump`, while the layout name is still `Pump`.

The main benefit is to let libraries built on layout-data carry and register their own layouts, so that an application can combine several such libraries in one process; layouts with the same name not conflicting is a corollary of the isolation, not a separate reason. The default scope is removed because it is a resource shared by the whole process that can be used only once: whichever library breaks the convention and uses it first makes the application's own registration fail, with a result that also depends on import order, and "libraries must not use the default scope" can only be a convention that cannot be enforced. Without a default scope every party must use its own scope, their layouts do not intrude on each other, and the implementation and specification no longer have the special case of a default scope. This leads to the following design requirements:

- Scopes can be obtained by name, so any module can obtain another library's or application's scope and register into it. This package only provides the infrastructure and does not specify who may register into which scope: conflicts are prevented only by "each scope registers once", and a second registration is always an error. A library that wants to keep others from deciding its layouts registers immediately when it creates the scope; a library may also leave its scope for its users to register, e.g. to let users add their own layouts besides the library's descriptions. How a library and its users interact and avoid conflicts is up to the library's own conventions.
- Type generation (spec-layout §8) becomes a method of the scope instead of the global `render_types`: it generates one declaration text for all layouts of the scope, no longer takes a layout table, and does not support generating for only some layouts; the declarations are only for editors to read types, and extra types are harmless. It generates `<Layout>_Tags` and `<Layout>_Ldata` from layout names, so layouts with the same name in different scopes generate types with the same names; generating per scope gives exactly one file per scope, told apart by import path, and the specification must describe this usage.
- Diagnostics must distinguish scopes: when errors such as `unknown layout X` and logs give only the layout name, it is unclear which scope's layout is meant, so errors and logs are written as `scope_name.layout_name` (e.g. `unknown layout lib_a.Pump`). An observer of `Ldata.on_access` that groups by layout name will also mix layouts with the same name in different scopes, and the specification must point this out.
- A failed registration does not use up the scope's one call; it can be retried in the same scope.
- Tests register in their own scopes instead, through the public interface, without calling internal functions.

Naming: the public unit is named for the meaning its users need to understand, i.e. the range within which names are valid and isolated from each other. The Chinese name matches the spec's Chinese wording for "registered layouts"; in English it is scope, and the exported type is prefixed by this package's convention as `Layout_Scope`. The concrete interface for creating and obtaining scopes and registering into them is up to the design. The word registry is kept for the implementation level, meaning the place that holds the registration result (`registry.js`). Scope enters the spec's terminology only after this issue is accepted.

Rejected alternatives:

- Drop "register only once" and allow several calls: resolving layouts and fragments would depend on call order, which is exactly what the single registration of spec-layout §5 avoids.
- Tell layouts apart by writing a prefix into the layout name itself (e.g. naming a layout `Lib_Pump`): only a convention; it cannot isolate fragment resolution, nor let the same name be registered separately in different groups. A scope is a real unit of separation, and the layout name itself stays unchanged.
- Keep a global default scope for calls that specify no scope: compatible with the existing usage and one step less for a single application, but it is a shared resource usable only once, "libraries must not use it" relies on convention, and it needs a special case in the implementation and the specification.
- One default scope per module: the caller could only be identified by means such as the call stack, and module boundaries no longer exist after bundling; a library also consists of several modules, and splitting per module would scatter the library's own layouts.
- Allow only the party that created a scope to register into it: introduces a concept such as an owner and excludes letting users decide when to register and add layouts; a library that needs protection only has to register early.
- Anonymous scopes, not in a global name table and held only by object: the strongest isolation, but scopes cannot be queried and obtained by name.
- Keep the global `get_layout` and look up layouts with `scope_name.layout_name` or an extra parameter naming the scope: obtaining layouts only through scopes is enough; after obtaining the scope by name one obtains the layout, with no need for another global entry.
- Call the public unit registry: registry means both the place of registration and the unit separating names, and as a public name it carries the implementation-level meaning to users.
- Call it registry scope: likewise brings the implementation-level registry into the public interface, and the name is lengthy.
- Call it space (namespace): a namespace suggests names with hierarchy or prefixes, easily confused with the prefix approach rejected above.

## Decision

Accepted, implemented as proposed, after issue#ckft7m0z. Scopes let libraries built on layout-data carry and register their own layouts, so that an application can combine several such libraries in one process. The global default scope is removed because conflicts over a shared resource usable only once cannot be avoided by convention; who may register into which scope is not specified, conflicts are prevented by each scope registering only once, and a library that needs to protect its layouts registers immediately when it creates the scope. This is a breaking change.
