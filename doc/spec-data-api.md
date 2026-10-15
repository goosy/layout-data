# Data Object Interface Specification (TData / TTag)

> English version of [spec-data-api.zh-cn.md](spec-data-api.zh-cn.md), the primary Chinese version. When the two differ, update both.
>
> This document defines the programming interface that TData and TTag promise to their users. It refines [spec.md](spec.md). The implementation is described in §2 of [design.md](design.md).
> TData and TTag are general data objects for programmers: values can be read and written at any time, and a change event is emitted when a value changes. They do not depend on how the user schedules work; scan-style data flow is only one way to use them and does not limit what they can do.

## 1. Concepts

| Name | Meaning |
| --- | --- |
| Layout | The fixed format of a data block: name, type, bit offset and initial value of every tag, given by a layout description (§6) and immutable once compiled |
| TData / tdata | TData is the class of data objects, a tdata is an instance: a block of data allocated for a layout, stored big-endian internally, with access by name and change events |
| TTag | The interface of one named tag of a tdata: read and write its value, subscribe to its changes |

The T in TData and TTag stands for Typed: a tdata is stored in a fixed layout and every tag has a definite type and position.

Tag types: `Bool`, `Byte`, `SInt`, `USInt`, `Int`, `UInt`, `Word`, `DInt`, `UDInt`, `DWord`, `Real`. The value of a `Bool` is `true` / `false`, all others are numbers. A `Word` made of several `Bool`s is called a combined word; it shares its data with its bits.

## 2. TData

### 2.1 Creating

```js
const data = new TData(layout, name);
```

- `layout`: a registered layout, from `compile_layout` (§6) or `register_layout` (§6.5), or the name of one, which `layout_of(name)` resolves; a structure is not accepted, and an unknown name or a layout object that is not the registered one of its name throws;
- `name`: the name of the tdata, used in logs and error messages;
- After creation every tag equals its initial value from the layout, and no change event is emitted;
- A layout name identifies one layout for the life of the process: the data blocks of one layout share one class (§6.4).

### 2.2 Properties

| Property | Access | Description |
| --- | --- | --- |
| `name` | read/write | The name of the tdata |
| `layout` | read-only | The layout in use |
| `size` | read-only | Size of the tdata in bytes |

Assigning to a read-only property throws `TypeError`.

The bytes of a tdata (stored big-endian internally) are not exposed as a property: they are reached only by access by name (§2.3), through a TTag (§3) and by raw reads and writes (§2.5). Every write therefore goes through TData and no change is missed.

### 2.3 Access by name

```js
data.pressure = 1.5;          // write
const value = data.pressure;  // read
```

- Every tag name is a property of the tdata, readable and writable at any time;
- A write takes effect at once: after it, reading gives the new value, and so does the `value` of the TTag;
- Writing a combined word changes its bits; writing a bit changes the combined word;
- Writing an integer outside the range of the type throws `RangeError` and keeps the old value; a `Bool` is written by truthiness.

### 2.4 Getting a TTag

```js
const tag = data.get("pressure");
```

Returns the TTag of the tag; the same tdata always returns the same TTag for the same name. Returns `undefined` if the name does not exist.

### 2.5 Raw reads and writes

Untyped access to the bytes, for users that do not access by tag name (such as an upstream server, or the IO layer that exchanges data with a device). **Typed access goes through tags, untyped access goes through bytes**: raw access has only two granularities, byte and bit, it does not interpret the type of a value, and it has no methods classified by width (words, double words).

`offset` is a byte offset, the same as the byte position of a tag in the layout (the bit offset divided by 8). The data is big-endian; converting device byte order is the job of the IO layer (§7). What happens after a write is the same as for a write by name:

| Method | Description |
| --- | --- |
| `read_bytes(offset = 0, length = size - offset)` | Read `length` bytes starting at `offset` and return a copy (a `Buffer`); changing the copy does not affect the tdata |
| `write_bytes(offset, source)` | Write all the bytes of `source` (a `Uint8Array`) starting at `offset`; an empty `source` writes nothing, is not a write and emits no `write` |
| `write_bit(offset, mask, value)` | Write the bits of the byte at `offset` selected by `mask`; `value` is taken by truthiness and the other bits are unchanged |

```js
data.write_bytes(5 * 2, Buffer.from([0x12, 0x34]));  // register 5 (a Modbus write of one register)
const bytes = data.read_bytes();                     // a copy of the whole block
```

- A write need not be aligned with tags: the tags that own the bytes written change with them, and emit events as in §4;
- There is no `read_bit`: read a bit with `read_bytes(offset, 1)[0] & mask`. `write_bit` exists because it is a read-modify-write done in one step, which the caller cannot build reliably from `write_bytes`;
- An `offset` or `length` that is not a non-negative integer in range, a write past the end of the data block, or a `mask` that is not an integer from 1 to 0xff throws `RangeError`; a `source` that is not a `Uint8Array` throws `TypeError`. The arguments are checked before any byte is changed: on error the data is unchanged and no `write` is emitted.

### 2.6 Transactions

```js
const result = data.transaction(() => {
  data.valve = true;
  data.pressure = 1.5;
  return "done";
});
```

`transaction(fn)`: runs `fn` synchronously, commits or rolls back all the writes in it as a whole, and returns the return value of `fn`. The rules are in §4.2.

### 2.7 Events

```js
data.on("change", (name, old_value, new_value) => { /* ... */ });
```

Emitted when the value of any tag of the tdata changes. The arguments are the tag name, the old value and the new value.

```js
data.on("write", (data) => { /* ... */ });
```

Emitted after every write, whether or not it changed a value. A write is a write by name, through a TTag, or a raw write (`write_bytes`, `write_bit`); a read does not emit it, and neither does a failed write (one that throws). It means "a write happened", for the user's scheduling and IO: they must handle every write, even one that wrote the same value; a change of value is what `change` stands for. It is emitted after the detection of that write and the `change` events it caused. Writes inside a transaction do not emit it at once, see §4.2. Any number of parties can listen, each with its own handler.

### 2.8 Tracing accesses

`set_access_tracer(tracer)` sets a function called on every read and write of a tag through the property accessors, as `tracer(tdata, name, "read" | "write")`; `set_access_tracer(null)` clears it. For tools that check which tags a piece of code touches. The tracer is global to the process and costs one check per access while unset.

### 2.9 Device byte order

A tdata is stored big-endian internally. To exchange data with a device, convert per tag between the tdata and an IO buffer in the byte order of the device:

| Method | Description |
| --- | --- |
| `load_tag(name, io_buffer, endian)` | Convert the bytes of the tag named `name` from `io_buffer` and write them into the tdata; this is a write |
| `store_tag(name, io_buffer, endian)` | Convert the bytes of the tag named `name` in the tdata and write them into `io_buffer`; the tdata is unchanged and no event is emitted |

- `name`: the tag name. When you already hold a TTag, use its `load` / `store` (§3), which do the same; for a batch use names directly, which needs no TTag created for each tag;
- `io_buffer`: a `Uint8Array` indexed like the byte offsets of the tdata (a mirror of the same size as the data block); the range of the tag in it must lie inside it;
- `endian`: the device byte order; only `"BE"`, `"LE"`, `"BEBS"` and `"LEBS"` are accepted (ABCD stands for the four bytes in big-endian):

  | Byte order | 2 bytes | 4 bytes |
  | --- | --- | --- |
  | `BE` | unchanged | ABCD |
  | `LE` | the two bytes swapped | DCBA |
  | `BEBS` | the two bytes swapped | BADC |
  | `LEBS` | unchanged | CDAB |

  A Bool and a single-byte tag (Byte, SInt, USInt) go by the 16-bit register they lie in: for `LE` and `BEBS` they sit in the other byte of the register, for `BE` and `LEBS` in place; a Bool changes only its own bit;
- `load_tag` is the same as a write by name: it takes effect at once, detects, emits `change` and then `write`; inside a transaction it is handled at the commit. Put a batch of loads into a transaction (§2.6): one detection and one `write` at the commit;
- Exchanging a whole block at once: `io_index_table(layout, endian)` returns the table of byte indexes; byte `i` of the data block is byte `table[i]` of the IO buffer. The user copies the bytes by it, then writes them with one `write_bytes` (§2.5);
- Errors are checked before anything is changed: the tdata is unchanged and `load_tag` emits no `write` (errors in §5).

## 3. TTag

| Member | Description |
| --- | --- |
| `name` | The tag name |
| `type` | The type (lower case) |
| `length` | Number of bytes it occupies |
| `value` | The current value, readable and writable; writing it is exactly equivalent to `data[name] = v` |
| `on("change", (old_value, new_value) => ...)` | Subscribe to changes of this tag |
| `load(io_buffer, endian)` | Equivalent to `data.load_tag(name, io_buffer, endian)` (§2.9) |
| `store(io_buffer, endian)` | Equivalent to `data.store_tag(name, io_buffer, endian)` (§2.9) |

A TTag stores no value; reads and writes act directly on the tdata it belongs to.

## 4. Changes and events

### 4.1 Detection

A **detection** compares the current value of every tag of the tdata with its value at the previous detection, and emits a `change` event for every tag whose value differs. After the detection the current values become the baseline for the next one. The initial values at creation are the baseline of the first detection.

How many times a tag is written between two detections does not matter: a detection compares only the values at the two moments. Several writes are merged into one event whose old value is the value at the previous detection; a value that changed and was restored emits no event.

A detection is run by TData itself after every write (inside a transaction, at its commit, see §4.2). It is not a public interface: users neither need to nor can trigger it.

### 4.2 Transactions

Because a detection runs right after every write, the several writes of one logical step let subscribers see a half-updated intermediate state. A **transaction** makes a group of writes one whole: no event is emitted during it, and at its end it is either committed at once or undone entirely.

- Start and end: `transaction(fn)` calls `fn()` synchronously and commits when `fn` returns; its return value is the return value of `transaction`;
- Inside a transaction every read and write is allowed: by name, through a TTag, raw reads and writes. A write takes effect at once and reads give the uncommitted current value; a write triggers no detection and emits neither `change` nor `write`;
- Commit: after the transaction is closed, one detection (§4.1) runs and emits the `change` events. Its baseline is the values at the last detection before the transaction, so several writes in the transaction merge into one event, and a value changed and restored emits none. Then, if the transaction contained a write by name, through a TTag or a raw write, one `write` (§2.7) is emitted, however many such writes there were;
- Rollback: when `fn` throws, the content of the tdata is restored to what it was at the start of the transaction and no event is emitted; the original exception is rethrown;
- Starting another transaction inside a transaction throws `Error`; if `fn` does not handle it, the transaction rolls back;
- Events are emitted after the transaction is closed, so writes and transactions in handlers are ordinary ones. An exception thrown by a handler at commit propagates out of `transaction`, but the transaction is already committed and is not rolled back.

Boundaries of a transaction:

- A transaction guarantees atomicity only for the synchronous part of `fn` and does not inspect its return value: `fn` should be a synchronous function; if it returns a Promise, no error is raised and the Promise is not awaited. Node.js runs no other JS code while `fn` executes, so no other code on the thread can read or write this tdata. The continuation of an asynchronous operation started inside `fn` runs after the transaction is closed; it is an ordinary write, does not belong to the transaction and is never rolled back;
- A transaction guarantees only the content of this tdata. Writes to other tdatas inside it emit their events as usual; side effects such as event handlers are not undone by a rollback;
- A copy of the content of the tdata is made when the transaction starts; its cost is proportional to the size of the data block.

### 4.3 Common conventions

- Wherever a change comes from (a write by name, a write through a TTag, a raw write) an event is emitted; none is missed;
- Events are emitted after the new value has taken effect: handlers read the new value;
- An event is emitted only when the value really changes: writing the same value emits none; writing `NaN` over `NaN` counts as unchanged;
- A combined word and its bits emit their own events: when one write changes the word and some of its bits, the word and those bits all emit;
- The changes of one detection are emitted in layout order (a combined word before its bits); for each change the `change` of the tdata is emitted first, then the `change` of the TTag;
- Handlers may write any tag: the changes caused by that write are emitted after the current batch has been emitted;
- If writes triggered by handlers keep causing new changes for 16 rounds in a row, the detection throws an exception to prevent endless oscillation; changes not yet emitted are not lost and are emitted at the next detection.

## 5. Errors

The interface throws exceptions on errors. It does not log or exit the process; the caller decides how to handle them:

| Case | Exception |
| --- | --- |
| Writing an integer outside the range of the type | `RangeError`, the old value is kept |
| Invalid layout, or a tag name colliding with a TData member | `Error` thrown when the tdata is created |
| Writes triggered by handlers that do not settle | `Error` thrown by the detection |
| Starting another transaction inside a transaction | `Error` |
| A raw read or write whose offset, length or mask is out of range, or that writes past the end of the data block | `RangeError`, the data is unchanged and no `write` is emitted |
| A raw write whose `source`, or `load_tag` / `store_tag` whose `io_buffer`, is not a `Uint8Array` | `TypeError` |
| `load_tag` / `store_tag` with an unknown tag name | `Error`, the tdata is unchanged and no `write` is emitted |
| A byte order other than `BE`, `LE`, `BEBS`, `LEBS`, or a tag whose range in `io_buffer` is out of bounds | `RangeError`, the tdata is unchanged and no `write` is emitted |

## 6. Layout description

### 6.1 File

A layout description is a YAML 1.2 file that can define several layouts at once:

- The root key `layouts`: a mapping from layout names (such as `NODE`) to lists of entries;
- Every other root key is a fragment: its key is the fragment name and its value a list of entries, which entries can reference by name.

```yaml
node_commands:              # a fragment
  - { name: stop_pumps, type: Bool, offset: 8, init_value: false, comment: Stop pump command }
  - { name: cancel_stop, type: Bool, offset: 9, comment: Cancel stop pump }

layouts:
  NODE:
    - { name: ID, type: UInt, offset: 0, init_value: 0 }
    - name: response_code
      type: Word
      offset: 128
      coupling: node_commands
    - { includes: node_parameters, offset: 144 }
```

Only one file is compiled at a time for now. When several files (a directory) are supported, the merge rules and the handling of key conflicts will be specified.

### 6.2 Entries

| Field | Description |
| --- | --- |
| `name` | The tag name, unique within a layout, not equal to a member name of TData |
| `type` | One of the types listed in §1, case-insensitive |
| `offset` | Bit offset; a non-Bool must be on a whole byte, a multi-byte type must start at an even byte |
| `length` | Length in bits; may be omitted, in which case the type decides it; when written it must match the type |
| `init_value` | Initial value, which must be representable by the type; see below for combined words and their bits |
| `comment` | Optional description, used to generate point tables, type declarations and so on |
| `coupling` | The bits of a combined word: a fragment name or an inline list of entries; the `offset` of each bit is relative to the word |
| `is_combined` | Optional descriptive mark of a combined word whose word and bits are linked in both directions; the linkage is decided by `coupling` and does not depend on it |
| `includes` | Together with `offset` (and optionally `name_prefix`), splices in the entries given by a fragment name or an inline list, shifted as a whole |

Entries in a fragment may reference other fragments too.

### 6.3 Validity

- The byte ranges of non-Bool tags do not overlap; each bit belongs to at most one Bool;
- A Bool inside the byte range of a non-Bool tag must be a bit (`coupling`) of that tag; every bit of a combined word must lie inside the word;
- Only one side of a combined word and its bits gives the initial value: if the word gives it, the initial values of the bits come from the whole word; otherwise they come from the bits (a bit without a value is `false`) and the word is composed from them;
- The total length of a layout is a whole number of registers (a multiple of 16 bits);
- Referenced fragments must exist, and fragments must not reference each other in a cycle.

### 6.4 Compiling

```js
const { layouts, fragments } = compile_layout(yaml_path);
const node = new TData(layouts.NODE, "node_1");
```

- `layouts`: compiled layouts by layout name, used to create TData;
- `fragments`: entry lists by fragment name (references expanded, offsets relative to the start of the fragment), for the user to query, for example to get all tag names of a parameter block;
- Any violation in the file throws an `Error` whose `errors` property lists all violations;
- Every layout is registered under its name (§6.4); a layout identical to a registered one of that name (a file, whatever its path, or an object given to `compile_layout_data`) is the same `Layout` object, so several users of one description get identical objects. A layout is read-only (§6.6);
- A layout name is used by one layout only: a layout that differs from the registered one of its name (the `comment` of the items and the case of the type names do not count) is an error, `another layout is already named X`. A description is registered all or none: the conflicts are reported in `errors` before any layout is registered. Layouts of different descriptions therefore need distinct names unless they are identical. `layout_of(name)` returns the registered layout and throws `unknown layout X` for an unknown name;
- `compile_layout_data(root, origin)` compiles an already parsed description (the same structure as the file: `layouts` plus the fragments), for layouts embedded in the user's own file. The result and the errors are the same.

### 6.5 Defining a layout in code

A layout needs no file. `build_structure({ name }, items)` expands a list of items (the same entries as in the file, with inline `coupling` lists and explicit `length`) into a structure, `validate_structure(structure)` returns the list of violations (§6.3; empty when valid), and `register_layout(structure)` compiles it into a layout and registers it (§6.4). `layout_of(name)` returns a registered layout. `new TData(layout, name)` takes that layout. `build_structure` keeps what it is given, including violations, so check the result before use.

### 6.6 The layout object

A layout (`Layout`) is a read-only object that exposes only these members:

| Member | Description |
| --- | --- |
| `name` | The layout name |
| `length` | Total length in bits |
| `size` | Total size in bytes |
| `items` | The expanded descriptions of the tags, in layout order (a combined word before its bits) |

- Every item of `items` has: `name`; `type` (as written in the description, the case unchanged, while `TTag.type` is always lower case); `offset` (the absolute bit offset; the byte position is `offset >> 3`); `length` (bits); `init_value`; `comment` (if given); `coupling` (for a combined word: the tag names of its bits; for a bit: the tag names of the combined words it belongs to). `includes` and `name_prefix` are expanded and no longer appear;
- The layout and its `items` are deeply frozen: modifying them throws `TypeError`;
- A layout does not expose the table by name, byte positions, bit masks, codecs or other internal data, and users need not know them: access by name goes through `data.get(name)`, which gives a TTag, and exchanging data with a device through `load_tag` / `store_tag` or `load` / `store` of a TTag (§2.9).

## 7. Outside this interface

- Exchanging data with devices (driver binding, the orchestration of reads and writes) is the job of the user's IO layer, which operates the tdata through this interface: `load_tag` / `store_tag` convert the byte order per tag (§2.9), a whole block is exchanged with `io_index_table` plus `read_bytes` / `write_bytes` (§2.5), and a batch of loads goes into a transaction (§2.6);
- Scheduling, rules and timing do not belong to this interface.
