---
id: 37h39ham
opened: 2026-10-28T14:40:53.409Z
closed:
title: The layout of a block gives only the layout name, and the scope a block belongs to is decided by code
status: accepted    # open | accepted | fixed | rejected | wontfix
fixed_in: []        # commit IDs, backfilled at version commit time
labels: []
remote:
problem_title:
proposal_title:
decision_title:
---

## Problem

issue#f0j027s2 specifies that the `layout` of each block under the root key `blocks` of a description is written as `<scope>.<layout>`, and the scope name cannot be omitted (spec-description §2, §5.3); at registration the block is created on the layout this string names (spec-layout §3). Writing it this way has the following problems:

- The description hard-codes a scope name, which contradicts the convention that "descriptions are not bound to scopes". spec-description §1.2 specifies that the compiled result of a `Description` depends only on the description itself and its `imports`, and can be cached and registered into any number of scopes. But for a description with `blocks`, where the blocks go is hard-coded: when it is registered into another scope, the layouts go into that scope while the blocks are still created in the scope originally written.
- When a block references a layout of its own description, the scope name this description will later be registered into must be written in advance. This information is fixed only when `register_layout` is called, yet the description must know it beforehand.
- To produce several groups of ldata with the same names from one description, spec-layout §3 registers the layouts into different scopes and has the blocks name these scopes. With scope names hard-coded in the YAML, the only practical way is to copy the description, one scope name per copy.
- One registration can modify other scopes. `app.register_layout(...)` can create ldata on layouts of `lib_a`, but "all or nothing" only guarantees that the called scope is unchanged; the state of `lib_a` is not covered.
- A block can reference layouts of other descriptions (spec-description §2 allows a description with only `blocks`), so a description depends on the environment at registration: from the description alone one cannot tell whether its blocks can be created; the result depends on what it is registered with and into which scope.

## Proposal

- The `layout` of a block gives only the layout name, which must be a JavaScript identifier; the `<scope>.<layout>` form is no longer accepted.
- A description cares only about layouts and data, not about the environment: the `layout` of a block must be a layout listed by `layouts` of the same description, checked at compile time, and a layout not of this description is a violation. So a description with only `blocks` and no `layouts` is no longer valid. A description contains no scope names and does not depend on layouts of other descriptions, so which layout each block uses is known at compile time.
- After compiling, the `layout` of a block in `Description.blocks` is still a layout name string; compiling only checks that it is in this description's `layouts` and does not resolve it to a `Layout_Desc`, so `Description` is still plain data.
- Where violations are reported changes accordingly: a block `layout` that is not an identifier, or not in this description's `layouts`, is reported by `yaml` and `desc_file` when reading, with the position in the original file, e.g. `block pump_1: unknown layout Pump`; at registration only one violation remains for blocks, a block name equal to an existing ldata of that layout (`ldata X.Y.Z already exists`).
- A block belongs to the scope its description is registered into: `scope.register_layout(descriptions)` registers the description's layouts into `scope` (newly, or reusing an existing layout by fingerprint), then creates the blocks on the resulting layouts. A `Description` can still be registered into any number of scopes.
- To produce several groups of ldata with the same names from one description, register this description into several scopes.
- To create the application's own blocks on a library's layout, the application's description brings in the library's item tables with `imports`, lists this layout under the same layout name in its own `layouts`, and is registered into the library's scope, e.g. `get_scope("lib_a").register_layout(...)`. With the same structure and name, the layout reuses the library's existing layout by fingerprint, and the blocks are created on that layout; the same structure with a different name, or the same name with a different structure, are errors by the fingerprint rules. So each registration modifies only one scope, and "all or nothing" fully covers the registration.
- Blocks no longer reference layouts of other descriptions in the same call, so registration need not register all layouts first and then create all blocks; the rule that block names must not repeat within one call is kept, since they are merged into the same index of the return value.
- This is an incompatible change, requiring matching changes (both the English and zh-cn versions) to:
  - spec-description: the explanation of `blocks` and the sentence on "a description with only `blocks`" in §1.2 and §2, and the block rules of §5.3;
  - spec-layout: the block rules and the list of violations of §3 (removing the statement "the scope names written in blocks differ accordingly"), and the entry "a block naming a layout that does not exist" in the error table of §6;
  - the design, the README (the explanation of `<scope>.<layout>`), the implementation, the tests and the examples.
- Implemented in the same version as issue#fexjvtkw (rename `register_layout` to `load`).

Rejected alternatives:

- Add a required root key `scope`, with `layout` giving only the layout name: it states the scope a second time besides the caller of `register_layout`, and a separate violation would be needed when the two disagree; the description would also be bound to one scope, against the convention of §1.2. Nor is it needed as a fallback: `register_layout` is a method of a scope, so registration always happens on some scope, and that scope is the one the blocks belong to. Scopes can only be created by `create_scope` in code, and layouts are also registered by code, so to create blocks on a layout of some scope, the code must already know that scope name, and a scope name in the YAML would only be a copy of it. If a general loader that decides scopes from configuration files appears in the future, it can use the caller's own root keys (spec-description §2), and letting `Description` keep these root keys can be considered then.
- Keep `<scope>.<layout>` while allowing the scope name to be omitted, defaulting to the scope registered into: the same thing would have two forms, and the cross-scope modification problem would remain.
- Blocks give only the layout name but may reference existing layouts in the scope registered into (keeping descriptions with only `blocks`): the description would implicitly depend on the environment, and whether the blocks can be created would be known only at registration; creating blocks on a library's layout is already possible by bringing in its item tables with `imports` and reusing the layout by fingerprint, with no need for this dependency.

## Decision

Accepted, implemented as proposed. Hard-coding scope names in the `layout` of blocks binds a description to one scope and lets one registration modify other scopes; with blocks referencing only layouts of their own description and belonging to the scope the description is registered into, a description no longer depends on the environment, the layouts of blocks can be checked at compile time, and scope names are decided only by code.
