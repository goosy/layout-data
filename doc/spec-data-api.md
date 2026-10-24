# Data Object Interface Specification (Ldata / Ltag)

> English version of [spec-data-api.zh-cn.md](spec-data-api.zh-cn.md), the primary Chinese version. When the two differ, update both.
>
> This document defines the programming interface that Ldata and Ltag promise to their users. It refines [spec.md](spec.md). The implementation is described in §2 of [design.md](design.md).
> Ldata and Ltag are general data objects for programmers: values can be read and written at any time, and a change event is emitted when a value changes. They do not depend on how the user schedules work; scan-style data flow is only one way to use them and does not limit what they can do.

## 1. Concepts

| Name | Meaning |
| --- | --- |
| Layout | The fixed format of a data block: name, type, bit offset and initial value of every tag, given by a layout description (§6) and immutable once registered |
| Ldata / ldata | Ldata is the class of data objects, an ldata is an instance: a block of data allocated for a layout, stored big-endian internally, with access by name and change events |
| Ltag | The interface of one named tag of an ldata: read and write its value, subscribe to its changes |

The L in Ldata and Ltag stands for Layout: an ldata is stored in the fixed layout it is created from, and every tag has a definite type and position.

Tag types: `Bool`, `Byte`, `SInt`, `USInt`, `Int`, `UInt`, `Word`, `DInt`, `UDInt`, `DWord`, `Real`. The value of a `Bool` is `true` / `false`, all others are numbers. A `Word` made of several `Bool`s is called a combined word; it shares its data with its bits.

`Tag_Type` is the exported TypeScript type of the lower case type names (`"bool" | "byte" | "usint" | "sint" | "int" | "uint" | "word" | "dint" | "udint" | "dword" | "real"`). Only `Ltag.type` (§3) has it, so that `switch (tag.type)` is checked. The `type` of a layout description and of the items of a layout (§6) is the text of the description (`string`).

Units: a `length` is in bits and a `size` is in bytes, everywhere in this interface (`Layout.length` and `Layout.size`, the `length` of a layout item, `Ldata.size`, `Ltag.size`).

## 2. Ldata

### 2.1 Creating

```js
const data = new Ldata(layout, name);
```

- `layout`: the name of a registered layout, which is the normal way (§6.4: register first, then create by name), or the registered layout object itself, which `get_layout(name)` returns or a registration result holds; a list of items is not accepted, and an unknown name or a layout object that is not the registered one of its name throws;
- `name`: the name of the ldata, used in logs and error messages. It must be a string (any string, the empty one included), otherwise `TypeError`; it is given here and cannot be changed afterwards;
- After creation every tag equals its initial value from the layout, and no change event is emitted;
- A layout name identifies one layout for the life of the process: the data blocks of one layout share one class (§6.4).

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

  The `init_value` of a layout is stricter (§6.2): for a `Real` it must be a finite number inside the same range.

### 2.4 Getting an Ltag

```js
const tag = data.get("pressure");
```

Returns the Ltag of the tag; the same ldata always returns the same Ltag for the same name. Returns `undefined` if the name does not exist.

### 2.5 Raw reads and writes

Untyped access to the bytes, for users that do not access by tag name (such as an upstream server, or the IO layer that exchanges data with a device). **Typed access goes through tags, untyped access goes through bytes**: raw access has only two granularities, byte and bit, it does not interpret the type of a value, and it has no methods classified by width (words, double words).

`offset` is a byte offset, the same as the byte position of a tag in the layout (the bit offset divided by 8). The data is big-endian; converting device byte order is the job of the IO layer (§7). What happens after a write is the same as for a write by name:

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
- It is emitted only for an access that took effect: a refused write (§2.3, §5) and an access that throws an argument error emit nothing. A write emits it right after the new value has taken effect, before the detection of the write and its `change` and `write` events; reading and writing inside a transaction emit it at once, as usual. The restoring of a rolled-back transaction is not an access;
- A listener may read and write any tag, but the accesses made while an `access` listener runs (by the listener itself, to any ldata) emit nothing, which would never end;
- An exception thrown by a listener follows §4.4: every listener is called, the write goes on to its detection and its events, and the first exception is thrown by the statement afterwards; a read throws it instead of returning the value;
- An instance listener sees only the ldata it is subscribed on. To observe every ldata of the process, including those not created yet, subscribe on the class (below).

```js
Ldata.on_access((data, kind, tags) => { /* every access to every ldata */ });
Ldata.off_access(listener);
```

`Ldata.on_access(listener)` subscribes a function that is called for the accesses to all ldatas, whichever layout they have and whenever they were created; the listener gets the ldata first, then `kind` and `tags` as above. `Ldata.off_access(listener)` cancels it, and does nothing for a function that is not subscribed. Any number of parties can subscribe, each with its own function, and none overrides another. Subscribing a function twice is one subscription. The class-level listeners live apart from the events of the instances, so `data.removeAllListeners()` does not remove them. For one access, the listeners of the instance are called first, then those of the class, and the exception rule above covers both. While no listener of either kind exists, an access pays one extra check. A tool that observes with it should remove its listener when it is done.

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
- Exchanging a whole block at once: `io_index_table(layout, endian)` returns the table of byte indexes; byte `i` of the data block is byte `table[i]` of the IO buffer. The user copies the bytes by it, then writes them with one `write_bytes` (§2.5);
- Errors are checked before anything is changed: the ldata is unchanged and `load_tag` emits no `write` (errors in §5).

### 2.10 Reserved names

An ldata is one object that holds both the tags (as properties) and its own methods, so the names of the two must not meet. The reserved names are a fixed list, given here, and do not depend on the Node.js version that runs the program:

| Source | Reserved names |
| --- | --- |
| Members of Ldata | `name`, `layout`, `size`, `get`, `transaction`, `read_bytes`, `write_bytes`, `read_bit`, `write_bit`, `load_tag`, `store_tag` |
| EventEmitter (Node.js 20.11) | `addListener`, `emit`, `eventNames`, `getMaxListeners`, `listenerCount`, `listeners`, `off`, `on`, `once`, `prependListener`, `prependOnceListener`, `rawListeners`, `removeAllListeners`, `removeListener`, `setMaxListeners`, `_events`, `_eventsCount`, `_maxListeners` |
| Object | `constructor`, `hasOwnProperty`, `isPrototypeOf`, `propertyIsEnumerable`, `toLocaleString`, `toString`, `valueOf`, `__proto__`, `__defineGetter__`, `__defineSetter__`, `__lookupGetter__`, `__lookupSetter__` |

- A tag with a reserved name is a violation of the layout (§6.3): registering such a layout throws `Error` (§6.4), so an ldata of it never exists;
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
- Inside a transaction every read and write is allowed: by name, through an Ltag, raw reads and writes. A write takes effect at once and reads give the uncommitted current value; a write triggers no detection and emits neither `change` nor `write`;
- Commit: after the transaction is closed, one detection (§4.1) runs and emits the `change` events. Its baseline is the values at the last detection before the transaction, so several writes in the transaction merge into one event, and a value changed and restored emits none. Then, if the transaction contained a write by name, through an Ltag or a raw write, one `write` (§2.7) is emitted, however many such writes there were;
- Rollback: when `fn` throws, the content of the ldata is restored to what it was at the start of the transaction and no event is emitted; the original exception is rethrown;
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

A handler (a listener of `change` or `write`) may throw. The library never logs it and emits no `error` event; the rules are:

- **No event is lost**: a write is dispatched completely. All the `change` events of its detection are emitted in the order of §4.3, then `write`; every listener of every event is called, in the order it subscribed. A listener that throws does not stop the others, the later listeners of the same event, the later events and `write` are still delivered;
- **The first exception is thrown**: when the dispatch is complete, the write statement (an assignment by name, `tag.value = v`, a raw write, `load_tag`) throws the first exception caught. The other exceptions are dropped;
- **The value stands**: the new value has taken effect before any event, so it is not rolled back, and `write` is emitted even though the statement throws. A refused write (§2.3) is the only write that throws without taking effect;
- **A transaction** at its commit follows the same rules, and the first exception propagates out of `transaction`, which has been committed (§4.2). When `fn` itself throws, nothing is emitted and the changes are rolled back, as before;
- **Nested writes**: a write made by a handler is an ordinary write; the exception it throws goes into the handler that made it, and it is the handler's own exception if the handler does not catch it. The oscillation exception of §4.3 counts as an exception of the dispatch under the same rules.
## 5. Errors

The interface throws exceptions on errors. It does not log or exit the process; the caller decides how to handle them:

| Case | Exception |
| --- | --- |
| Writing a value that is not a number to an integer or `Real` tag | `TypeError`, the old value is kept, no event and no `write` |
| Writing `NaN`, `Infinity`, a non-integer or an integer outside the range to an integer tag, or a finite number beyond float32 to a `Real` tag | `RangeError`, the old value is kept, no event and no `write` |
| A handler throws | the first exception is thrown by the write statement after all events are dispatched; the value stands and `write` is emitted (§4.4) |
| An ldata created with a name that is not a string | `TypeError` |
| Invalid layout, or a reserved tag name (§2.10) | `Error` with `errors`, thrown by `register_layout`; nothing is registered (§6.4) |
| `register_layout` called again after it registered layouts | `Error`, the layouts of the first call stay (§6.4) |
| Writes triggered by handlers that do not settle | `Error`, thrown by the write statement after the events are dispatched (§4.4) |
| Starting another transaction inside a transaction | `Error` |
| A raw read or write whose offset, length or mask is out of range, or that writes past the end of the data block | `RangeError`, the data is unchanged and no `write` is emitted |
| A raw write whose `source`, or `load_tag` / `store_tag` whose `io_buffer`, is not a `Uint8Array` | `TypeError` |
| `load_tag` / `store_tag` with an unknown tag name | `Error`, the ldata is unchanged and no `write` is emitted |
| A byte order other than `BE`, `LE`, `BEBS`, `LEBS`, or a tag whose range in `io_buffer` is out of bounds | `RangeError`, the ldata is unchanged and no `write` is emitted |

## 6. Layout description

The flow is **register once, then use by name**: the layouts are described (§6.1 to §6.3), all of them are registered by one call of `register_layout` (§6.4), and from then on `new Ldata("Pump", "pump_1")` creates data blocks of a layout by its name. The user needs to know how to express a layout as a YAML structure and which name it has; whether it is compiled, and into what, is not part of the flow.

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

A file is complete in itself or is one of several sources (§6.4): a file may hold only fragments, only layouts, or both, and the fragments of every source are available to the layouts of every source.

### 6.2 Entries

| Field | Description |
| --- | --- |
| `name` | The tag name: letters, digits and `_`, not starting with a digit, an identifier in every language, so that a tag is always written `data.name` and is the same as the field of a data block in a PLC. Unique within a layout, not a reserved name (§2.10). If the point table of a device names the point otherwise, put that name in the `comment` |
| `type` | One of the types listed in §1, case-insensitive |
| `offset` | Bit offset; a non-Bool must be on a whole byte, a multi-byte type must start at an even byte |
| `length` | Length in bits; may be omitted, in which case the type decides it; when written it must match the type |
| `init_value` | Initial value, which must be representable by the type (an integer inside the range of the type; for a `Real`, a finite number inside the float32 range); see below for combined words and their bits |
| `comment` | Optional description, used to generate point tables, type declarations and so on |
| `coupling` | The bits of a combined word: a fragment name or an inline list of entries; the `offset` of each bit is relative to the word |
| `is_combined` | Optional descriptive mark of a combined word whose word and bits are linked in both directions; the linkage is decided by `coupling` and does not depend on it |
| `includes` | Together with `offset` (and optionally `name_prefix`), splices in the entries given by a fragment name or an inline list, shifted as a whole |

Entries in a fragment may reference other fragments too.

There are two kinds of entry, and the declarations name them (`Layout_Item` is either of the two):

| Entry | Fields | Declaration |
| --- | --- | --- |
| A tag | `name`, `type`, `offset` are required; `length`, `init_value`, `comment`, `is_combined`, `coupling` are optional; it has no `includes` | `Tag_Item` |
| An inclusion | `includes` and `offset` are required; `name_prefix` is optional; it has no `name` and no `type` | `Include_Item` |

- `coupling` is a fragment name or an inline list of tag entries, never a list of names: the names of the bits are a result of the registration (they appear in `Layout_Tag.coupling`, §6.6), not an input;
- A whole description has the declaration `Layout_Description`: `layouts`, a mapping from layout names to lists of entries, and one list of entries for each fragment. The declaration of a source of layouts is `Layout_Source`, a file path or a description. In the declarations the parameter of `register_layout` is typed with them, so that an editor completes the fields of an entry and notices a misspelled one;
- The `fragments` that `register_layout` returns hold the entries with the references expanded: `includes` and `coupling` are lists of entries, never names, and every `length` is present. Their declaration is the same `Layout_Item`.

### 6.3 Validity

- Tag names are identifiers (letters, digits and `_`, not starting with a digit; a number, an empty name or a missing name is not one), are unique and are not reserved names (§2.10);
- The byte ranges of non-Bool tags do not overlap; each bit belongs to at most one Bool;
- A Bool inside the byte range of a non-Bool tag must be a bit (`coupling`) of that tag; every bit of a combined word must lie inside the word;
- Only one side of a combined word and its bits gives the initial value: if the word gives it, the initial values of the bits come from the whole word; otherwise they come from the bits (a bit without a value is `false`) and the word is composed from them;
- The total length of a layout is a whole number of registers (a multiple of 16 bits);
- Referenced fragments must exist, and fragments must not reference each other in a cycle.

### 6.4 Registering

```js
register_layout("pump.yaml");                                     // one file
register_layout(["common.yaml", "pump.yaml", "valve.yaml"]);      // several files
register_layout(["common.yaml", { layouts: { INLINE: [...] } }]); // files and descriptions
const pump = new Ldata("Pump", "pump_1");                         // from then on, by the layout name
```

`register_layout(sources)` registers the layouts of its sources. A layout can be used only after it is registered.

- `sources`: one source or a list of sources, each either **a string, the path of a YAML 1.2 file**, or **an object, a description that is already parsed** (the structure of §6.1: `layouts` plus the fragments; this is also how items are given in code, §6.5). A list does not hold lists, and an empty list is an error. A string is always a path;
- **Once per process.** The layouts are registered by one call, so that the layouts and fragments are all known together and nothing depends on the order of calls. A second call throws `Error` (`register_layout can be called only once`), and the layouts of the first stay. A call that fails registers nothing and does not use up the call, so the program may go on to register something else, for example a default description when its own file is not valid;
- **The sources are merged, then resolved.** The layouts and the fragments of all the sources are collected first, and only then are the fragment references resolved, so a layout may name a fragment of any source, whatever the order of the list. A source needs no `layouts` key (a file of common fragments has none), but at least one source must define a layout;
- The same fragment name or the same layout name in two sources is an error naming both sources (a file is named by its path, a description by its position in the list, `layout description #2`); nothing is overridden;
- Every layout is validated (§6.3), the omitted `length`s are filled in, and the sources are not changed;
- Any violation throws an `Error` whose `errors` property lists all violations of all sources, and nothing is registered: the sources are registered all or none. An unreadable file and a YAML syntax error are violations too. The layout and fragment errors name the layout or fragment, not the file;
- Return value: `{ layouts, fragments }` for all the sources. `layouts` holds the registered layouts by name, as `get_layout(name)` returns them; `fragments` holds the entry lists by fragment name (references expanded, offsets relative to the start of the fragment), for the user to query, for example to get all tag names of a parameter block. Neither is needed for the flow above;
- A layout name stays registered for the life of the process. `get_layout(name)` returns the registered layout (read-only, §6.6) and throws `unknown layout X` for a name that is not registered, as `new Ldata(name, ...)` does;
- Consequences of registering once: a changed layout file takes effect only in a new process (no hot reload, and a REPL or a test cannot register a changed layout again); a library built on layout-data cannot call `register_layout` itself, it can only export the paths of its layout files for the application to put in `sources`; when two copies of the package are installed, each has its own registry and its own single call, and neither sees the layouts of the other.

### 6.5 Defining a layout in code

A layout needs no file. Give a description, the structure of §6.1, to `register_layout` (§6.4), with the items of a layout as a list under its name:

```js
register_layout({
  layouts: {
    Pump: [
      { name: "id", type: "UInt", offset: 0, init_value: 0 },
      { name: "pressure", type: "Real", offset: 32, init_value: 0 },
    ],
  },
});
const data = new Ldata("Pump", "pump_1");
```

- the items are the entries of §6.2; `length` may be omitted; `coupling` and `includes` take an inline list or the name of a fragment of any of the sources;
- the description and the entries in it are not changed;
- there is no separate function that registers one list of items, nor any that expands or validates a structure by itself: registration is the single step that validates (§6.4).

### 6.6 The layout object

A layout (`Layout`) is a read-only object that exposes only these members:

| Member | Description |
| --- | --- |
| `name` | The layout name |
| `length` | Total length in bits |
| `size` | Total size in bytes |
| `items` | The expanded descriptions of the tags, in layout order (a combined word before its bits) |

- Every item of `items` has: `name`; `type` (as written in the description, the case unchanged, while `Ltag.type` is always lower case); `offset` (the absolute bit offset; the byte position is `offset >> 3`); `length` (bits); `init_value`; `comment` (if given); `coupling` (for a combined word: the tag names of its bits; for a bit: the tag names of the combined words it belongs to). `includes` and `name_prefix` are expanded and no longer appear;
- The layout and its `items` are deeply frozen: modifying them throws `TypeError`;
- A layout does not expose the table by name, byte positions, bit masks, codecs or other internal data, and users need not know them: access by name goes through `data.get(name)`, which gives an Ltag, and exchanging data with a device through `load_tag` / `store_tag` or `load` / `store` of an Ltag (§2.9).

### 6.7 Type declarations for the editor

`render_types(layouts, options)` returns the text of a TypeScript declaration file (`.d.ts`) for layouts, so that an editor can complete the tags of a data block. It is a helper for building the program: after the layouts are registered, the program writes the text to a file beside its code, for example `layout_types.d.ts`. `layouts` is the `layouts` that `register_layout` returns.

- For each layout it declares `<Layout>_Tags`, an interface with one property per tag (`boolean` for a Bool, `number` for every other type; a `comment` becomes the doc comment of the property), and `<Layout>_Ldata`, which is `Ldata & <Layout>_Tags`;
- The layout name is used as it is, with the case it has: the layout `Pump` gives `Pump_Tags` and `Pump_Ldata`, `my_block` gives `my_block_Tags`, `Pump_Station` gives `Pump_Station_Tags`. The case style is the choice of the caller, and `Snake_Pascal_Case` is recommended, the style of the type names of this package; the library does not require it. The name is the one written in `new Ldata("Pump", ...)`, and two layouts with different names never give the same type name;
- A layout name must be an identifier of JavaScript (letters of any script, digits, `_` and `$`, not starting with a digit), because it is part of a type name; otherwise `Error` is thrown, whose `errors` lists every such name. A tag name is always an identifier (§6.2), so it is written as the property name as it is. A `*/` in a comment is escaped, so the text is always a valid declaration file;
- `options.source` names the layout file in the header comment of the text; without it the header only says that the text is generated. `options.ldata_module` is the module specifier the text imports `Ldata` from, relative to the output file; it is `"layout-data"` by default. Both options, and the argument `options` itself, may be omitted.

Using the types. `new Ldata("Pump", "pump_1")` is typed `Ldata`: the constructor of a class cannot return another type according to its argument, so the type of the value is named by hand, once. In JavaScript a JSDoc cast, which is enough for an editor to complete the tags and, when the file is checked (`checkJs` or `// @ts-check`), to flag a misspelled tag or a value of the wrong type:

```js
const pump = /** @type {import("./layout_types.js").Pump_Ldata} */ (new Ldata("Pump", "pump_1"));
pump.pressure = 1.5;   // completed, and known to be a number
```

The parentheses are part of the JSDoc cast. A `/** @type {...} */` written above `const pump = new Ldata(...)` also gives the completion, but a checked file then reports that `Ldata` is not assignable to `Pump_Ldata`.

In TypeScript: `const pump = new Ldata("Pump", "pump_1") as Pump_Ldata;`.

## 7. Outside this interface

- Exchanging data with devices (driver binding, the orchestration of reads and writes) is the job of the user's IO layer, which operates the ldata through this interface: `load_tag` / `store_tag` convert the byte order per tag (§2.9), a whole block is exchanged with `io_index_table` plus `read_bytes` / `write_bytes` (§2.5), and a batch of loads goes into a transaction (§2.6);
- Scheduling, rules and timing do not belong to this interface.
