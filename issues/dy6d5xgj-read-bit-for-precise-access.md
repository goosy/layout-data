---
id: dy6d5xgj
opened: 2026-10-24T02:34:21.022Z
closed: 2026-10-24T03:50:14.000Z
title: Add read_bit so that access of a bit-wise read reports only the Bools read
status: fixed       # open | accepted | fixed | rejected | wontfix
fixed_in: [3354983]  # commit IDs, backfilled at version commit time
labels: []
remote:
problem_title:
proposal_title:
decision_title:
---

## Problem

Raw reads and writes are asymmetric at bit granularity: writing has `write_bit(offset, mask, value)`, reading has only `read_bytes`. spec-data-api §2.5 states why there is no `read_bit`: the value of a bit can be taken with `read_bytes(offset, 1)[0] & mask`, while `write_bit` exists because read-modify-write must happen in one step.

As far as taking the value goes, that reason holds, but it does not consider `access` (§2.8). `access` reports which tags an access involves; it is a diagnostic means, for example to check the dependencies a rule declares against the ones it actually has. Per the table in §2.8:

- `write_bit` reports "the tags of that byte, excluding Bools whose bit is not in `mask`", which is precise;
- `read_bytes(offset, 1)` reports "the tags with a byte in the range", so all Bools in the same byte are reported as read.

So a caller reading bit by bit cannot make `access` tell which Bool's state it read, and diagnostics show false dependencies.

Example: modbus_emulator calls `read_bytes(offset, 1)` once per coil when reading coils (FC1 / FC2). When reading coil 17 (not the bit of `alarm`), `access` also reports `alarm`.

Non-Bool tags are byte-aligned, so reporting by byte is precise for them; the problem is only with Bools in the same byte.

## Proposal

Add `read_bit(offset, mask)`, symmetric to `write_bit`. The main purpose of the mask is to let `access` tell which bits' state was read; convenience in taking the value is secondary.

- It returns `(byte & mask) !== 0`. `offset` and `mask` are checked as for `write_bit` (`mask` is an integer in 1..0xff, otherwise `RangeError`). With a multi-bit `mask` it returns "any bit is set".
- `access`: `kind` is `read`, `tags` follow the same rule as `write_bit`, i.e. the tags of that byte, excluding Bools whose bit is not in `mask`. A combined word shares bytes with its bits, so reading one bit also reports that word.
- Change the note "there is no `read_bit`" in §2.5 and add a row to the table in §2.8. This is an additive new method.

Together with issue#jt0zxgth (`access` included in `transaction`): when one logical read needs several bits, the caller calls `read_bit` for each in a transaction, which is both precise and emits only one `access`.

Rejected alternative: a multi-byte masked read (e.g. `read_bits(offset, masks)`): a heavier interface; with issue#jt0zxgth, calling `read_bit` bit by bit is already enough.

## Decision

Accepted, implemented as proposed. `read_bit` returns a boolean: symmetric to the `value` of `write_bit`, meaning "any bit is set" for a multi-bit `mask`; use `read_bytes` when the value of each bit is needed.

`read_bit` is a string-named instance method, which breaks the promise of spec-data-api §2.10 "from now on only `Symbol`-keyed members or static methods are added": it joins the reserved names, and a tag named `read_bit` is no longer valid. A static method `Ldata.read_bit(data, offset, mask)` would keep the promise but is asymmetric to `write_bit`, so it is not adopted. The promise should only have been fixed from 1.0 on, so it is changed to take effect from 1.0.
