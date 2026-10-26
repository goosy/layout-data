---
id: ckft7m0z
opened: 2026-10-26T08:36:00.584Z
closed: 2026-10-26T08:58:38.000Z
title: Make layouts objects that create ldata
status: fixed       # open | accepted | fixed | rejected | wontfix
fixed_in: []        # commit IDs, backfilled at version commit time
labels: []
remote:
problem_title:
proposal_title:
decision_title:
---

## Problem

spec-data-api §2.1 specifies that the `layout` of `new Ldata(layout, name)` may be the name of a registered layout or a layout object, and presents creation by name as the usual use. As a result:

- Creation by name looks up the layout by string at construction, so a misspelled name or an unregistered layout is reported only when the data block is created. When a layout object is passed, it must also be checked to be the one registered under its name (spec-data-api §2.1, design §5).
- Construction takes a detour: `new Ldata(...)` first constructs a base class instance, then the constructor returns a new instance of the subclass for the layout, and the base instance is thrown away (design §5); the subclass of each layout is kept separately in a table in `Ldata.js` indexed by layout name (design §4).
- The interface puts `Ldata` at the center and does not show the relation "ldata is created from a layout".
- `io_index_table(layout, endian)` depends only on one layout and the byte order, yet is a global function. Layouts are plain data without methods (spec-data-api §6.6, design §3), so operations on a layout can only be global functions or live elsewhere.

## Proposal

Layouts change from plain data to objects with methods, and ldata is created from a layout:

- `layout.create_ldata(name)` is the only way to create ldata. The rule for `name` is unchanged (it must be a string, otherwise `TypeError`).
- `Ldata` is still exported, for `instanceof`, type annotations and `Ldata.on_access` / `off_access`, but cannot be constructed with `new`: `new Ldata(...)` throws `TypeError` with an error message giving the correct usage; in the type declarations the constructor is private, so TypeScript and `checkJs` already report it at compile time.
- There is no more creation by name: creating a data block requires a layout object in hand, and lookup by name happens only in the step that obtains the layout (`get_layout`).
- The Ldata subclass of each layout is kept in a private member of the layout object and is not exposed; `create_ldata` constructs this subclass directly. The table in `Ldata.js` indexing subclasses by name and the detour of the constructor building a base instance and returning a subclass instance both go away. Only registered layouts carry this subclass; a copied object (such as `{ ...layout }`) has no `create_ldata`, so "is this the registered layout" is no longer a question users meet.
- `io_index_table` becomes the layout method `layout.io_index_table(endian)`, and the global `io_index_table` is removed.
- Layouts stay read-only and deeply frozen: the meaning of `name`, `length`, `size` and `items` is unchanged, and layouts do not expose compiled data (spec-data-api §6.6). Where the subclass and the compiled data are kept and when they are built is up to the design.
- This is a breaking change. Migration: `new Ldata("Pump", name)` becomes `get_layout("Pump").create_ldata(name)`, `new Ldata(layout, name)` becomes `layout.create_ldata(name)`, `io_index_table(layout, endian)` becomes `layout.io_index_table(endian)`.

This leads to the following design requirements:

- Rewrite spec-data-api §2.1 as creation from a layout; change the flow "register once, then use by name" at the start of §6 to obtaining the layout after registration and creating from the layout; change `io_index_table` in §2.9 and §7 to the layout method; list the layout methods in §6.6; remove `io_index_table` from the export table in spec §6.
- The type declaration of `Layout` changes from the type of a frozen object to a class, exported only as a type, not as a constructible value.
- The statement in the design "a layout is immutable plain data with no class; `layout.js` does not depend on `Ldata`" must be rewritten: the module holding layouts depends on `Ldata.js` to build subclasses, and `Ldata.js` does not depend on the layout module, so there is no cycle. Tag accessors read and write the private buffer of `Ldata`, so the subclass is still built in `Ldata.js`, which provides internal functions to the layout.
- The reserved names of `Ldata` (spec-data-api §2.10) are unchanged: the new methods are on the layout, not on ldata.

Rejected alternatives:

- Keep `new Ldata` and add `layout.create_ldata` as an equivalent form: the same thing would have two forms, and the failures of creation by name would remain.
- Only make `new Ldata` accept layout objects, without adding `create_ldata`: removes the failures of lookup by name, but the interface still centers on `Ldata` and the constructor detour remains.
- Put the layout's subclass on the layout as a public member: users would `new` it directly, back to the constructor problem.
- Make `io_index_table` a static method of `Ldata`: only hangs it somewhere else, the layout still has to be passed; make it an instance method of ldata: adds a reserved name, and tags can no longer use that name.

## Decision

Implemented as proposed: layouts become objects with methods, `layout.create_ldata(name)` is the only way to create ldata, `new Ldata(...)` throws `TypeError`, and `io_index_table` becomes a layout method. The reasons are those of the proposal: remove the delayed errors of creation by name and the constructor detour, and let the interface show that ldata is created from a layout.
