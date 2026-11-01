---
id: jt0zxgth
opened: 2026-10-24T02:34:21.133Z
closed: 2026-10-24T05:06:41.000Z
title: Include access in transaction
status: fixed       # open | accepted | fixed | rejected | wontfix
fixed_in: [00a5925]  # commit IDs, backfilled at version commit time
labels: []
remote:
problem_title:
proposal_title:
decision_title:
---

## Problem

spec-data-api §2.8 specifies that reads and writes inside a transaction "emit it at once, as usual", i.e. `access` is emitted on every call; the transaction of §4.2 defers only `change` and `write`. This causes two problems:

- Count: a transaction emits as many `access` events as read/write methods are called in it, and the same tag appears repeatedly. A transaction represents one logical step; `change` and `write` are already merged per step, but `access` still exposes every call inside the step, so the three are inconsistent.
- Rollback: a rolled-back write never took effect, but its `access write` has already been emitted. Diagnostics report a write dependency that does not exist.

Observed: in a transaction, writing the two halves of a Real with two `write_bytes` calls, then one `read_bytes`, emits `access write`, `access write`, `access read` in turn, and only on commit one `change` and one `write`; when an exception is thrown after a write in a transaction and it is rolled back, `access write` has still been emitted.

Example: modbus_emulator handles one request of the master with one transaction per block for the reads and writes. One request of the master is one logical access, but now one FC1 read of 16 coils emits 16 `access` events.

## Proposal

Inside a transaction, `access` is not emitted right away: the tags involved are accumulated separately for `read` and `write` (as a union), and at the end of the transaction each kind is emitted at most once.

Rationale:

- Consistent with the meaning of a transaction: a transaction makes a group of reads and writes one whole; `change` and `write` are already emitted per whole, and `access` should be too. Observers see which tags one logical step accessed, not how many method calls it made internally.
- Accurate diagnostics: rolled-back writes are no longer reported.
- Precision and count no longer conflict: callers can use fine-grained precise methods (byte-wise `write_bit`, bit-wise `read_bit`, see issue#dy6d5xgj) to get a precise tag set, while the number of `access` events does not grow with the number of calls. Now callers must choose one: call many times (precise but repeated), or one `read_bytes` / `write_bytes` covering the whole range (once, but counting in all Bools of the same bytes).
- Cost: a listener is called only once per kind per transaction.

Semantics:

- Commit: first emit the accumulated `access` (`read` before `write`, `tags` in layout order without duplicates), then detect and emit `change`, finally emit `write`, consistent with the order outside a transaction where "`access` comes before detection".
- Rollback: `access write` is discarded, since the writes are undone; `access read` is emitted as usual, since the reads did happen. The original exception is rethrown as usual; an exception thrown by an `access` listener at that point is discarded, and the exception of `fn` prevails (§4.4 "other exceptions are discarded").
- Listener exceptions: inside a transaction, an exception of an `access` listener is instead thrown by `transaction` at commit, consistent with the rule for exceptions of `change` / `write` listeners at commit (§4.2, §4.4); the transaction is already committed and is not rolled back. Behavior outside transactions is unchanged: the read throws the listener's exception and returns no value.
- Unchanged: accesses made while an `access` listener runs emit no events; class-level listeners (`Ldata.on_access`) are deferred by the same rules; a transaction concerns only its own ldata, and accesses to other ldata inside it are emitted as usual.

The ability of a listener to veto a read: after deferring, an `access read` listener inside a transaction can no longer make a read fail by throwing. This ability is considered unnecessary:

- `access` is positioned as diagnostics (§2.8), not a means to control reads; a read throwing a listener's exception is a consequence of the uniform exception rule of §4.4, not a deliberately designed veto feature.
- When intervention before a read is needed, this repository's plan is to design a separate synchronous read hook (such as `before_read`; the event name `read` is reserved for it), which should not rely on `access`.

This is a behavior change to a released version; §2.8, §4.2 and §4.4 must be changed and it must go into the CHANGELOG.

## Decision

Accepted, implemented as proposed. Emitting `access` immediately inside a transaction is inconsistent with the transaction emitting `change` and `write` as a whole, and still reporting write dependencies after a rollback is wrong diagnostics. After deferring, an `access read` listener can no longer veto a read inside a transaction: `access` is positioned as diagnostics, and intervention before a read gets a separate read hook, so this ability is given up.

Two points the proposal left open are settled as well:

- An access is accumulated only when an `access` listener (instance or class level) exists at the time of the access, so without listeners each access still costs just one extra check; at commit the events go to the listeners subscribed at that time, as for `change` and `write` at commit.
- Accesses made while an `access` listener runs emit no events and are not accumulated either; a transaction opened inside a listener emits no `access` at commit.

An `access` listener at commit writing the same ldata triggers detection early; that is already the case outside transactions and does not belong to this issue.
