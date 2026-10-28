---
id: 3aeg7vcd
opened: 2026-10-28T10:41:19.825Z
closed:
title: A layout unbinds the name of an ldata, giving back the name it occupies in the layout
status: accepted    # open | accepted | fixed | rejected | wontfix
fixed_in: []        # commit IDs, backfilled at version commit time
labels: []
remote:
problem_title:
proposal_title:
decision_title:
---

## Problem

issue#f0j027s2 lets a layout manage its ldata by name (`layout.get_ldata(name)`, ldata names unique within the layout), so the layout holds every ldata it creates; layouts belong to scopes, and scopes exist until the process ends. So a created ldata is never collected, and its name stays occupied forever. Before, layouts did not hold ldata, the caller could drop its reference to let it be collected, and this package needed no release; now that this package holds ldata, it must offer a way to let go. f0j027s2 explicitly left this to this issue and required the way of holding to leave room for it.

Usages actually affected:

- The tests of modbus-emulator create an emulator repeatedly in the same process, each time with the same scope and the same `blocks` (`make()` in `test/emulator_test.js`). On the second creation the layout is reused by fingerprint, the block names are already occupied by the ldata created the first time, and registration fails.
- Switching to a new scope name each time only moves the problem: scopes cannot be released either.
- The emulator already has `stop()`, but cannot give back the ldata it created. A restart in production is a pm2 restart of the process and is not affected; affected are the tests and usages that rebuild instances in the same process.

## Proposal

- The goal is only to unbind the name: add `layout.delete_ldata(name)` (symmetric to `create_ldata` and `get_ldata`), which removes the binding of this name to its ldata from the layout. After that:
  - `layout.get_ldata(name)` no longer finds it (throws `unknown ldata X.Y.Z`);
  - the name can be used again in that layout, and `create_ldata` and registering `blocks` no longer report it as a duplicate;
  - the layout no longer holds it, and it can be collected once the caller drops its reference.
- The return value is the same as `Map.prototype.delete`: `true` when a binding was removed; when the name does not exist, nothing is done and `false` is returned.
- The ldata itself is not affected: it can still be read and written, events work as usual, and `ldata.layout` is unchanged. Disabling the ldata itself (e.g. stopping it from responding) is not a goal of this issue and not needed for now, so no `ldata.release()` is provided.
- The layout holds ldata with ordinary strong references, and the occupation of a name is released only by `layout.delete_ldata`.
- Destroying a whole scope (with its layouts and ldata) is not part of this issue; there is no actual need for it now, and the spec adds no statement about it.
- Callers unbind according to the registration result: the `ldata` returned by `register_layout` is the group created by that call; e.g. the emulator calls `delete_ldata` of its layout for each ldata in `stop()`.

Rejected alternatives:

- The layout holds ldata with weak references (`Map<string, WeakRef<Ldata>>`; keys of a `WeakMap` cannot be strings, so lookup by name would be impossible), with or without explicit deletion: lookup by name spares the caller from keeping references itself, and ldata created from `blocks` at registration is often held only by the layout, so weak holding would let it be collected before it is looked up, losing its state and listeners. Besides, when a caller forgets to delete, whether the name is still occupied would depend on whether garbage collection has happened, so the error would come and go; with strong holding, forgetting to delete always reports a duplicate name, which is easy to notice.
- Name the method `layout.delete(name)`: the layout also has members such as `create_ldata`, `get_ldata` and `io_index_table`, and a bare `delete` reads like deleting the layout itself.
- Also provide `ldata.release()` to disable the ldata itself: beyond the goal of unbinding the name, and not needed for now.
- Throw `unknown ldata X.Y.Z` for a name that does not exist: the purpose of deleting is that the name is no longer occupied; when the name does not exist, the purpose is already achieved, and returning `false` per the convention of `Map.prototype.delete` is enough.
- Use a new scope name each time to avoid duplicate names: scopes cannot be released either, so the occupation only moves from ldata to scopes.

## Decision

Accepted, implemented as proposed. issue#f0j027s2 makes layouts hold ldata, so this package must offer a way to give names back; the goal is only to unbind names, for which `layout.delete_ldata(name)` is enough; holding with strong references ensures that ldata looked up by name is not collected, and the scope is not widened to disabling ldata itself or destroying scopes.
