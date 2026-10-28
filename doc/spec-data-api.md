# Data Object Interface Specification (Ldata / Ltag)

> English version of [spec-data-api.zh-cn.md](spec-data-api.zh-cn.md), the primary Chinese version. When the two differ, update both.
>
> This document defines the programming interface that Ldata and Ltag promise to their users. It refines [spec.md](spec.md). The implementation is described in §2 of [design.md](design.md).
> Ldata and Ltag are general data objects for programmers: values can be read and written at any time, and a change event is emitted when a value changes. They do not depend on how the user schedules work; scan-style data flow is only one way to use them and does not limit what they can do.

## 1. Concepts

| Name | Meaning |
| --- | --- |
| Layout | The fixed format of a data block: name, type, bit offset and initial value of every tag, given by an item table listed in `layouts` of a description ([spec-description.md](spec-description.md)) and immutable once registered |
| Ldata / ldata | Ldata is the class of data objects, an ldata is an instance: a block of data allocated for a layout, stored big-endian internally, with access by name and change events |
| Ltag | The interface of one named tag of an ldata: read and write its value, subscribe to its changes |

The L in Ldata and Ltag stands for Layout: an ldata is stored in the fixed layout it is created from, and every tag has a definite type and position.

Tag types: `Bool`, `Byte`, `SInt`, `USInt`, `Int`, `UInt`, `Word`, `DInt`, `UDInt`, `DWord`, `Real`. The value of a `Bool` is `true` / `false`, all others are numbers. A `Word` made of several `Bool`s is called a combined word; it shares its data with its bits.

`Tag_Type` is the exported TypeScript type of the lower case type names (`"bool" | "byte" | "usint" | "sint" | "int" | "uint" | "word" | "dint" | "udint" | "dword" | "real"`). Only `Ltag.type` (§3) has it, so that `switch (tag.type)` is checked. The `type` of the entries of a description and of the items of a layout ([spec-layout.md](spec-layout.md)) is the text of the description (`string`).

Units: a `length` is in bits and a `size` is in bytes, everywhere in this interface (`Layout.length` and `Layout.size`, the `length` of a layout item, `Ldata.size`, `Ltag.size`).

## 2. Ldata

### 2.1 Creating

```js
const data = layout.create_ldata(name);
```

- An ldata is made by its layout: `layout.create_ldata(name)` is the only way to create one, and loading a description creates the ldata of its `blocks` through it too ([spec-layout.md](spec-layout.md) §3). `layout` is a registered layout object, which `get_layout(name)` of a scope returns or the result of loading holds ([spec-layout.md](spec-layout.md) §3, §4); looking up by name happens only when the layout is got, so the layout object is in hand when a data block is created. Only a registered layout creates ldata; a copy of one (such as `{ ...layout }`) has not the method;
- `name`: the name of the ldata, used in logs and error messages, and the key by which its layout finds it. It must be a string (any string, the empty one included), otherwise `TypeError`; it is unique within its layout, and one used by the layout throws `Error` (`ldata X.Y.Z already exists`); it is given here and cannot be changed afterwards;
- A layout manages the ldata it creates by name: `layout.get_ldata(name)` finds one, and `layout.delete_ldata(name)` unbinds it, giving the name back ([spec-layout.md](spec-layout.md) §4.1);
- After creation every tag equals its initial value from the layout, a tag without one is `0` (`false` for a `Bool`), and no change event is emitted;
- `Ldata` cannot be constructed with `new`: `new Ldata(...)` throws `TypeError`, whose message gives the right usage, `layout.create_ldata(name)`; in the declarations the constructor is private, so TypeScript and a file checked with `checkJs` report it at compile time. `Ldata` is still exported, for `instanceof`, type annotations and `Ldata.on_access` / `off_access` (§2.8);
- The data blocks of one layout share one class, a subclass of `Ldata`, which cannot be constructed with `new` either.

### 2.2 Properties

| Property | Access | Description |
| --- | --- | --- |
| `name` | read-only | The name of the ldata, as given at creation |
| `layout` | read-only | The layout in use |
| `size` | read-only | Size of the ldata in bytes |

Assigning to a read-only property throws `TypeError`.

The bytes of an ldata (stored big-endian internally) are not exposed as a property: they are reached only by access by name (§2.3), through an Ltag (§3) and by raw reads and writes (§2.5). Every write therefore goes through Ldata and no change is missed.

### 2.3 Access by name

```js
data.pressure = 1.5;          // write
const value = data.pressure;  // read
```

- Every tag name is a property of the ldata, readable and writable at any time; a tag name must not be a reserved name (§2.10);
- A write takes effect at once: after it, reading gives the new value, and so does the `value` of the Ltag;
- Writing a combined word changes its bits; writing a bit changes the combined word;
- A value is checked before it is written, and a value that is refused throws, keeps the old value, emits no event and no `write`:

  | Type | Accepted | Refused |
  | --- | --- | --- |
  | `Bool` | any value, taken by truthiness | none |
  | Integer types (`Byte`, `SInt`, `USInt`, `Int`, `UInt`, `Word`, `DInt`, `UDInt`, `DWord`) | an integer inside the range of the type | not a number (a string, `null`, `undefined`, a boolean, an object, a bigint): `TypeError`; `NaN`, `Infinity`, a non-integer such as `1.5`, or an integer outside the range: `RangeError`; nothing is truncated or converted |
  | `Real` | any number: `NaN` and `±Infinity` are kept; a finite value is rounded to float32 | not a number: `TypeError`; a finite number whose magnitude is above the float32 maximum (about 3.4028235e38), such as `1e40`: `RangeError` |

  A given `init_value` of a layout is stricter ([spec-description.md](spec-description.md) §3): for a `Real` it must be a finite number inside the same range.

### 2.4 Getting an Ltag

```js
const tag = data.get("pressure");
```

Returns the Ltag of the tag; the same ldata always returns the same Ltag for the same name. Returns `undefined` if the name does not exist.

### 2.5 Raw reads and writes

Untyped access to the bytes, for users that do not access by tag name (such as an upstream server, or the IO layer that exchanges data with a device). **Typed access goes through tags, untyped access goes through bytes**: raw access has only two granularities, byte and bit, it does not interpret the type of a value, and it has no methods classified by width (words, double words).

`offset` is a byte offset, the same as the byte position of a tag in the layout (the bit offset divided by 8). The data is big-endian; converting device byte order is the job of the IO layer (§6). What happens after a write is the same as for a write by name:

| Method | Description |
| --- | --- |
| `read_bytes(offset = 0, length = size - offset)` | Read `length` bytes starting at `offset` and return a copy (a `Buffer`); changing the copy does not affect the ldata |
| `write_bytes(offset, source)` | Write all the bytes of `source` (a `Uint8Array`) starting at `offset`; an empty `source` writes nothing, is not a write and emits no `write` |
| `read_bit(offset, mask)` | Read the bits of the byte at `offset` selected by `mask`; returns `true` when any of them is set |
| `write_bit(offset, mask, value)` | Write the bits of the byte at `offset` selected by `mask`; `value` is taken by truthiness and the other bits are unchanged |

```js
data.write_bytes(5 * 2, Buffer.from([0x12, 0x34]));  // register 5 (a Modbus write of one register)
const bytes = data.read_bytes();                     // a copy of the whole block
```

- A write need not be aligned with tags: the tags that own the bytes written change with them, and emit events as in §4;
- `read_bit` and `write_bit` take the same `mask`. `write_bit` is a read-modify-write done in one step, which the caller cannot build reliably from `write_bytes`. `read_bit` tells no more than `read_bytes(offset, 1)[0] & mask`; it exists so that `access` names only the Bools whose bit is read (§2.8). To get each bit of a multi-bit `mask`, use `read_bytes`;
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

Emitted when the value of any tag of the ldata changes. The arguments are the tag name, the old value and the new value.

```js
data.on("write", (data) => { /* ... */ });
```

Emitted after every write, whether or not it changed a value. A write is a write by name, through an Ltag, or a raw write (`write_bytes`, `write_bit`); a read does not emit it, and neither does a refused write (one that throws before it takes effect, §2.3, §5). It means "a write happened", for the user's scheduling and IO: they must handle every write, even one that wrote the same value; a change of value is what `change` stands for. It is emitted after the detection of that write and the `change` events it caused. Writes inside a transaction do not emit it at once, see §4.2. Any number of parties can listen, each with its own handler. Node.js prints a warning (`MaxListenersExceededWarning`) when more than 100 listeners are subscribed to one event of an ldata, and 20 to the `change` of an Ltag; the library fixes these limits, and a program that needs another one calls the inherited `setMaxListeners(n)` of that object.

Event names:

- `change`, `write`, `access` and `read` are reserved event names of the library. The library emits `change`, `write` and `access` (§2.8); `read` is kept for a future read hook and is not emitted now. A user must not emit them with `emit` and must not use them for events of its own;
- Any other name is free for the user's own events: `on`, `once` and `off` accept any string or symbol for it, with a listener of any signature;
- In the declarations `on`, `once` and `off` are typed for the reserved names: the listener of `change` is `(name: string, old_value: number | boolean, new_value: number | boolean) => void`, that of `write` is `(data: Ldata) => void` and that of `access` is `(kind: "read" | "write", tags: Ltag[]) => void`; a listener of another type is a compile-time error. The `change` of an Ltag is typed `(old_value, new_value)` the same way (§3).

### 2.8 Observing accesses

```js
data.on("access", (kind, tags) => { /* kind is "read" or "write"; tags is an array of Ltag */ });
```

Emitted on every access to the tags of the ldata, so that a tool can find out which tags a piece of code touches, for example to check the dependencies a rule declares against the ones it really has. It is a diagnostic for development and tests, and is not needed in a program that does not observe accesses: while the ldata has no `access` listener, an access pays one extra check.

- `kind` is `"read"` or `"write"`, and `tags` are the tags accessed, as the Ltag of `data.get(name)`, in layout order, without repeats;
- Which accesses emit it, and which tags it names:

  | Access | kind | tags |
  | --- | --- | --- |
  | Read by name (`data.pressure`, `tag.value`) | `read` | that tag |
  | Write by name (`data.pressure = v`, `tag.value = v`) | `write` | that tag |
  | `load_tag`, `tag.load` | `write` | that tag |
  | `store_tag`, `tag.store` | `read` | that tag |
  | `read_bytes(offset, length)` | `read` | the tags that have a byte in the range |
  | `write_bytes(offset, source)` | `write` | the tags that have a byte in the range |
  | `read_bit(offset, mask)` | `read` | the tags of that byte, except the Bools whose bit is not in `mask` |
  | `write_bit(offset, mask, value)` | `write` | the tags of that byte, except the Bools whose bit is not in `mask` |

  A combined word and its bits share bytes, so a raw access to those bytes names the word and its bits, while a read or write by name of the word names the word only. A raw access that touches no byte (an empty range or source) names no tag and emits nothing;
- It is emitted only for an access that took effect: a refused write (§2.3, §5) and an access that throws an argument error emit nothing. A write emits it right after the new value has taken effect, before the detection of the write and its `change` and `write` events. Inside a transaction it is not emitted at once: the accesses are gathered and emitted at the end of the transaction (§4.2). The restoring of a rolled-back transaction is not an access;
- A listener may read and write any tag, but the accesses made while an `access` listener runs (by the listener itself, to any ldata) emit nothing, which would never end; a transaction does not gather them either;
- An exception thrown by a listener follows §4.4: every listener is called, the write goes on to its detection and its events, and the first exception is thrown by the statement afterwards; a read throws it instead of returning the value. The accesses inside a transaction call the listeners at its end, and their exceptions follow §4.2;
- An instance listener sees only the ldata it is subscribed on. To observe every ldata of the process, including those not created yet, subscribe on the class (below).

```js
Ldata.on_access((data, kind, tags) => { /* every access to every ldata */ });
Ldata.off_access(listener);
```

`Ldata.on_access(listener)` subscribes a function that is called for the accesses to all ldatas, whichever layout they have and whenever they were created; the listener gets the ldata first, then `kind` and `tags` as above. `Ldata.off_access(listener)` cancels it, and does nothing for a function that is not subscribed. Any number of parties can subscribe, each with its own function, and none overrides another. Subscribing a function twice is one subscription. The class-level listeners live apart from the events of the instances, so `data.removeAllListeners()` does not remove them. For one access, the listeners of the instance are called first, then those of the class, and the exception rule above covers both. While no listener of either kind exists, an access pays one extra check. A tool that observes with it should remove its listener when it is done. Two scopes may each have a layout of the same name, so to group the accesses by layout, use the layout object (`data.layout`), or the scope name with the layout name (`data.layout.scope.name` and `data.layout.name`): grouping by the layout name alone mixes them up ([spec-layout.md](spec-layout.md) §4).

### 2.9 Device byte order

An ldata is stored big-endian internally. To exchange data with a device, convert per tag between the ldata and an IO buffer in the byte order of the device:

| Method | Description |
| --- | --- |
| `load_tag(name, io_buffer, endian)` | Convert the bytes of the tag named `name` from `io_buffer` and write them into the ldata; this is a write |
| `store_tag(name, io_buffer, endian)` | Convert the bytes of the tag named `name` in the ldata and write them into `io_buffer`; the ldata is unchanged and no event is emitted |

- `name`: the tag name. When you already hold an Ltag, use its `load` / `store` (§3), which do the same; for a batch use names directly, which needs no Ltag created for each tag;
- `io_buffer`: a `Uint8Array` indexed like the byte offsets of the ldata (a mirror of the same size as the data block); the range of the tag in it must lie inside it;
- `endian`: the device byte order; only `"BE"`, `"LE"`, `"BEBS"` and `"LEBS"` are accepted (ABCD stands for the four bytes in big-endian):

  | Byte order | 2 bytes | 4 bytes |
  | --- | --- | --- |
  | `BE` | unchanged | ABCD |
  | `LE` | the two bytes swapped | DCBA |
  | `BEBS` | the two bytes swapped | BADC |
  | `LEBS` | unchanged | CDAB |

  A Bool and a single-byte tag (Byte, SInt, USInt) go by the 16-bit register they lie in: for `LE` and `BEBS` they sit in the other byte of the register, for `BE` and `LEBS` in place; a Bool changes only its own bit;
- `load_tag` is the same as a write by name: it takes effect at once, detects, emits `change` and then `write`; inside a transaction it is handled at the commit. Put a batch of loads into a transaction (§2.6): one detection and one `write` at the commit;
- Exchanging a whole block at once: the layout method `layout.io_index_table(endian)` ([spec-layout.md](spec-layout.md) §4) returns the table of byte indexes; byte `i` of the data block is byte `table[i]` of the IO buffer. The user copies the bytes by it, then writes them with one `write_bytes` (§2.5);
- Errors are checked before anything is changed: the ldata is unchanged and `load_tag` emits no `write` (errors in §5).

### 2.10 Reserved names

An ldata is one object that holds both the tags (as properties) and its own methods, so the names of the two must not meet. The reserved names are a fixed list, given here, and do not depend on the Node.js version that runs the program:

| Source | Reserved names |
| --- | --- |
| Members of Ldata | `name`, `layout`, `size`, `get`, `transaction`, `read_bytes`, `write_bytes`, `read_bit`, `write_bit`, `load_tag`, `store_tag` |
| EventEmitter (Node.js 20.11) | `addListener`, `emit`, `eventNames`, `getMaxListeners`, `listenerCount`, `listeners`, `off`, `on`, `once`, `prependListener`, `prependOnceListener`, `rawListeners`, `removeAllListeners`, `removeListener`, `setMaxListeners`, `_events`, `_eventsCount`, `_maxListeners` |
| Object | `constructor`, `hasOwnProperty`, `isPrototypeOf`, `propertyIsEnumerable`, `toLocaleString`, `toString`, `valueOf`, `__proto__`, `__defineGetter__`, `__defineSetter__`, `__lookupGetter__`, `__lookupSetter__` |

- A tag with a reserved name is a violation of the layout ([spec-description.md](spec-description.md) §5.2): reading such a description, `yaml` or `desc_file` throws `Error` ([spec-description.md](spec-description.md) §1.1), so an ldata of it never exists;
- Ldata stays a subclass of EventEmitter. A later version of Node.js may add methods to EventEmitter; the list does not follow them, so a tag named like such a method would hide it. The test suite compares the list with the running Node.js;
- From version 1.0 on, this package adds members to Ldata only as `Symbol`-keyed members or static methods, never as a new string-named member of an instance, so a tag name that is valid in 1.0 stays valid. Before 1.0 the list may still grow;
- The reserved event names are in §2.7. Whether a name is reserved is not queryable: there is no public function for it;
- An Ltag has no tag names, so its members (§3) are not a list to avoid.

## 3. Ltag

| Member | Description |
| --- | --- |
| `name` | The tag name |
| `type` | The type (lower case), of the type `Tag_Type` (§1) |
| `size` | Number of bytes it occupies; a Bool occupies the byte it lies in, so its `size` is 1 |
| `value` | The current value, readable and writable; writing it is exactly equivalent to `data[name] = v` |
| `on("change", (old_value, new_value) => ...)` | Subscribe to changes of this tag; `change` is the only event of an Ltag and its reserved name |
| `load(io_buffer, endian)` | Equivalent to `data.load_tag(name, io_buffer, endian)` (§2.9) |
| `store(io_buffer, endian)` | Equivalent to `data.store_tag(name, io_buffer, endian)` (§2.9) |

An Ltag stores no value; reads and writes act directly on the ldata it belongs to.

## 4. Changes and events

### 4.1 Detection

A **detection** compares the current value of every tag of the ldata with its value at the previous detection, and emits a `change` event for every tag whose value differs. After the detection the current values become the baseline for the next one. The initial values at creation are the baseline of the first detection.

How many times a tag is written between two detections does not matter: a detection compares only the values at the two moments. Several writes are merged into one event whose old value is the value at the previous detection; a value that changed and was restored emits no event.

A detection is run by Ldata itself after every write (inside a transaction, at its commit, see §4.2). It is not a public interface: users neither need to nor can trigger it.

### 4.2 Transactions

Because a detection runs right after every write, the several writes of one logical step let subscribers see a half-updated intermediate state. A **transaction** makes a group of writes one whole: no event is emitted during it, and at its end it is either committed at once or undone entirely.

- Start and end: `transaction(fn)` calls `fn()` synchronously and commits when `fn` returns; its return value is the return value of `transaction`;
- Inside a transaction every read and write is allowed: by name, through an Ltag, raw reads and writes. A write takes effect at once and reads give the uncommitted current value; a write triggers no detection and emits neither `change` nor `write`, and no access emits `access`;
- Commit: after the transaction is closed, one detection (§4.1) runs and emits the `change` events. Its baseline is the values at the last detection before the transaction, so several writes in the transaction merge into one event, and a value changed and restored emits none. Then, if the transaction contained a write by name, through an Ltag or a raw write, one `write` (§2.7) is emitted, however many such writes there were;
- Accesses: `access` (§2.8) is not emitted during the transaction. The tags read and the tags written are gathered apart, each as a union; an access is gathered only when the ldata or the class has an `access` listener at that moment. At the end they are emitted to the listeners subscribed then: at most one `access` of kind `read` and one of kind `write`, each with its tags in layout order and without repeats, and none for a kind with no tag;
- Commit order: the gathered `access` of kind `read`, then that of kind `write`, then the detection and its `change` events, then `write`, as an access outside a transaction comes before its detection;
- Rollback: when `fn` throws, the content of the ldata is restored to what it was at the start of the transaction, and then only the gathered `access` of kind `read` is emitted, as those reads did happen; the writes were undone, so neither their `access` nor `change` nor `write` is emitted. What the `access` listeners throw is dropped and the original exception is rethrown;
- Starting another transaction inside a transaction throws `Error`; if `fn` does not handle it, the transaction rolls back;
- Events are emitted after the transaction is closed, so writes and transactions in handlers are ordinary ones. An exception thrown by a handler at commit propagates out of `transaction` as in §4.4, but the transaction is already committed and is not rolled back.

Boundaries of a transaction:

- A transaction guarantees atomicity only for the synchronous part of `fn` and does not inspect its return value: `fn` should be a synchronous function; if it returns a Promise, no error is raised and the Promise is not awaited. Node.js runs no other JS code while `fn` executes, so no other code on the thread can read or write this ldata. The continuation of an asynchronous operation started inside `fn` runs after the transaction is closed; it is an ordinary write, does not belong to the transaction and is never rolled back;
- A transaction guarantees only the content of this ldata. Writes to other ldatas inside it emit their events as usual; side effects such as event handlers are not undone by a rollback;
- A copy of the content of the ldata is made when the transaction starts; its cost is proportional to the size of the data block.

### 4.3 Common conventions

- Wherever a change comes from (a write by name, a write through an Ltag, a raw write) an event is emitted; none is missed;
- Events are emitted after the new value has taken effect: handlers read the new value;
- An event is emitted only when the value really changes: writing the same value emits none; writing `NaN` over `NaN` counts as unchanged;
- A combined word and its bits emit their own events: when one write changes the word and some of its bits, the word and those bits all emit;
- The changes of one detection are emitted in layout order (a combined word before its bits); for each change the `change` of the ldata is emitted first, then the `change` of the Ltag;
- Handlers may write any tag: the changes caused by that write are emitted after the current batch has been emitted;
- If writes triggered by handlers keep causing new changes for 16 rounds in a row, the detection stops and throws an exception to prevent endless oscillation (an exception like those of §4.4); changes not yet emitted are not lost and are emitted at the next detection.

### 4.4 Exceptions thrown by handlers

A handler (a listener of `change`, `write` or `access`) may throw. The library never logs it and emits no `error` event; the rules are:

- **No event is lost**: a write is dispatched completely. All the `change` events of its detection are emitted in the order of §4.3, then `write`; every listener of every event is called, in the order it subscribed. A listener that throws does not stop the others, the later listeners of the same event, the later events and `write` are still delivered;
- **The first exception is thrown**: when the dispatch is complete, the write statement (an assignment by name, `tag.value = v`, a raw write, `load_tag`) throws the first exception caught. The other exceptions are dropped;
- **The value stands**: the new value has taken effect before any event, so it is not rolled back, and `write` is emitted even though the statement throws. A refused write (§2.3) is the only write that throws without taking effect;
- **A transaction** at its commit follows the same rules, the `access` listeners included, and the first exception propagates out of `transaction`, which has been committed (§4.2). When `fn` itself throws, the changes are rolled back and only the gathered `access` of kind `read` is emitted; what its listeners throw is dropped and the exception of `fn` is rethrown;
- **Nested writes**: a write made by a handler is an ordinary write; the exception it throws goes into the handler that made it, and it is the handler's own exception if the handler does not catch it. The oscillation exception of §4.3 counts as an exception of the dispatch under the same rules.

## 5. Errors

The interface throws exceptions on errors. It does not log or exit the process; the caller decides how to handle them:

| Case | Exception |
| --- | --- |
| Writing a value that is not a number to an integer or `Real` tag | `TypeError`, the old value is kept, no event and no `write` |
| Writing `NaN`, `Infinity`, a non-integer or an integer outside the range to an integer tag, or a finite number beyond float32 to a `Real` tag | `RangeError`, the old value is kept, no event and no `write` |
| A handler throws | the first exception is thrown by the write statement after all events are dispatched; the value stands and `write` is emitted (§4.4) |
| An ldata created with a name that is not a string | `TypeError` |
| An ldata created with a name used by its layout | `Error` (`ldata X.Y.Z already exists`, §2.1) |
| `new` on `Ldata` or on the Ldata subclass of a layout | `TypeError`, whose message gives `layout.create_ldata(name)` (§2.1) |
| Writes triggered by handlers that do not settle | `Error`, thrown by the write statement after the events are dispatched (§4.4) |
| Starting another transaction inside a transaction | `Error` |
| A raw read or write whose offset, length or mask is out of range, or that writes past the end of the data block | `RangeError`, the data is unchanged and no `write` is emitted |
| A raw write whose `source`, or `load_tag` / `store_tag` whose `io_buffer`, is not a `Uint8Array` | `TypeError` |
| `load_tag` / `store_tag` with an unknown tag name | `Error`, the ldata is unchanged and no `write` is emitted |
| A byte order other than `BE`, `LE`, `BEBS`, `LEBS`, or a tag whose range in `io_buffer` is out of bounds | `RangeError`, the ldata is unchanged and no `write` is emitted |

The errors of reading descriptions, loading descriptions, getting layouts and ldata, and rendering type declarations are in [spec-layout.md](spec-layout.md) §6.

## 6. Outside this interface

- Exchanging data with devices (driver binding, the orchestration of reads and writes) is the job of the user's IO layer, which operates the ldata through this interface: `load_tag` / `store_tag` convert the byte order per tag (§2.9), a whole block is exchanged with the `io_index_table` of the layout plus `read_bytes` / `write_bytes` (§2.5), and a batch of loads goes into a transaction (§2.6);
- Scheduling, rules and timing do not belong to this interface.
