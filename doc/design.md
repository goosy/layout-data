# tagged-data Design

> English version of [design.zh-cn.md](design.zh-cn.md), the primary Chinese version. When the two differ, update both.
>
> Requirements are in [spec.md](spec.md), the programming interface in [spec-data-api.md](spec-data-api.md). This document describes the implementation.

## 1. Source files

| File | Responsibility |
| --- | --- |
| `src/index.js` | The public interface of the package |
| `src/TData.js` / `src/TTag.js` | The data object and the tag handle |
| `src/layout.js` | Reading and compiling layout description files, Layout, prototype accessors |
| `src/structure.js` | Structure expansion (`build_structure`) and layout validation (`validate_structure`); internal, not exported by the package |
| `src/dispatch.js` | `emit_all`: calls every listener of an event, collecting what they throw (internal, not exported by the package) |
| `src/reserved.js` | The static lists of reserved tag names and reserved event names (internal, not exported by the package) |
| `src/codecs.js` | Encoding and decoding of each type on a big-endian buffer |
| `src/observer.js` | Snapshot comparison, change events |
| `src/endian.js` | Device byte order conversion of one entry and of a whole block (only `io_index_table` is exported) |
| `src/types.js` | TypeScript declaration generation from layouts (`render_types`) |
| `src/typedefs.js` | JSDoc definitions of the public types (the only source of the types, no run-time content) |
| `dist/types/` | Declaration files generated from the JSDoc by `tsc`, called from a plugin in `rolldown.config.js` during the build (`tsconfig.json`); not committed |
| `type_check/consumer.ts` | Type test: imports the generated declarations by package name and checks the public interface with `Equal` assertions and `@ts-expect-error` (`pnpm test:types`, included in `pnpm test`) |

## 2. Parts

| Part | Responsibility | Instances | Mutability |
| --- | --- | --- | --- |
| Layout | Compiled from a layout description: byte position and codec of every tag, a byte-to-tag lookup table, prototype accessors | One per structure | Immutable |
| TData | The value buffer (private, big-endian), access by name, raw read and write methods, the TTag returned by `get(name)` | One per tdata | Mutable |
| Observer | Snapshot comparison, emits change events | One per tdata | Mutable |

Dependency direction: Observer depends on TData and Layout, TData depends only on Layout, Layout depends only on the layout description. The user's scheduling and IO are outside the package; the package notifies them only through the `write` event of a TData, which any party can listen to.

### 2.1 Component boundary

- The package code does not depend on the user's configuration, business logic or logger;
- Errors are thrown as exceptions; nothing is logged and `process.exit` is never called;
- The layout description is external input to the package, and the user provides the file path.

## 3. Layout definition

- A layout description is a YAML 1.2 file: the root key `layouts` maps layout names to entry lists; every other root key is a fragment, referenced by name from entries.
- Every entry has `{ name, type, offset, init_value }` and optionally `length` and `comment`. `offset` and `length` are in bits; when `length` is omitted the type decides it.
- Only one side of a combined word and its bits gives `init_value`. When `build_structure` expands them, a word without a value is composed from its bits (a bit without a value is false), and a word with a value passes its bits' values down. If both sides give values, the given values are kept and validation reports the conflict.
- `type` values (case-insensitive): `Bool`, `Byte`, `SInt`, `USInt`, `Int`, `UInt`, `Word`, `DInt`, `UDInt`, `DWord`, `Real`.
- A `Word` entry with `coupling` (a fragment name or an inline list) is a status or command word made of several Bools. `is_combined: true` is a descriptive mark only: the word and its bits share the same bytes, so the linkage does not depend on it. The `offset` of each item in `coupling` is relative to the start of the word.
- `{ includes: <fragment name or inline list>, offset }` splices in a group of common entries shifted as a whole; `name_prefix` may be added.
- `register_layout(sources)` (spec-data-api.md §6.4) is guarded by the module flag `registered_once`: it throws `Error` when the flag is set, and sets it only after `register_sources` returned, so a failed call leaves it unset. `register_sources(sources)` does the work and is internal, which is what the tests call, since they register many times in one process.
- `register_sources(sources)` turns the sources into one description and hands it on. Stage one: each source is read in the order of the list, a string with `readFileSync` and `parseDocument` (YAML 1.2), an object as it is; a read or parse error, a root that is not a mapping and a `layouts` that is not a mapping go to `errors` with the origin (the path, or `layout description #i` for the i-th object). The layouts and the fragments of every source are merged into one table each; a name already taken by an earlier source is an error that names both origins (`owners` remembers the origin of each name). An empty list, a list inside the list and a merge without any layout are errors. Everything found is thrown together as the `Error` with `errors`.
- `register_layout_data(root, origin)` is stage two and takes the merged description (`{ layouts, ...fragments }`, spec-data-api.md §6.1), registers its layouts and returns `{ layouts, fragments }`. It resolves the fragment references (an unknown or circular reference is an error) and fills in the omitted `length`s in `resolve_items`, which copies every item and nested list, so the description given is never changed. It calls `build_structure` for every layout to expand it into flat `items` (computing the total `length` of the structure and normalizing `coupling` to an array of names), validates each structure, checks the conflicts with the registered layouts (`find_conflicts`), and only then registers all of them with `register_structure`, so a description is registered all or none. No path registers a layout that has not been validated, except the test helper `one_tag`, which uses `register_structure` directly to pad a data block freely.
- Every layout is compiled to a Layout (`register_structure`). The public Layout is the deeply frozen `{ name, length, size, items }` (spec-data-api.md §6.6), where `items` are frozen copies of the expanded items with only the documented fields. The compiled data, the table `entries` indexed by name (byte offset, bit mask, codec) and the byte-to-tag lookup table `tags_at_byte`, is kept in a module-private `WeakMap` of `registry.js` and read with `compiled_of(layout)` by `TData`, the Observer and `endian.js`; it is never attached to the Layout, so no entry appears in the public interface. A layout is plain, immutable data: it holds no class and `layout.js` does not depend on `TData`. Within one layout description the layout names are distinct (they are the keys of `layouts`).
- The compiled layouts are kept in a registry by layout name (`registry.js`, which imports nothing, so `layout.js` writes to it and `TData` reads it without a cycle). `register_structure(struct)` computes the canonical text of the expanded structure (`name`, `length`, `items`; object keys sorted, `comment` left out, type names in lower case). If the name is registered with the same text it returns the registered Layout; with another text it throws `another layout is already named X`. `register_layout_data` checks every layout of the description for such a conflict before registering any, so a description is registered all or none. The public `register_layout` registers once (above), so these two rules only matter to the internal functions, which the tests call many times. `get_layout(name)` returns the registered layout and throws `unknown layout X` otherwise. The registry is never cleared: a layout name is used for the life of the process.
- Bool placement: `byte = offset >> 3`, `bit = offset % 8`. The internal buffer is big-endian and the first byte of a word is the high byte of the register, so offsets 8-15 in `coupling` are register bit 0-7 and offsets 0-7 are register bit 8-15. Listing the bits in the order 8-15, 0-7 in the layout file therefore lists them from register bit 0 to bit 15.

### 3.1 Layout validation

The layout rules are validated centrally at the layout stage, not spread over the run time of TData and TTag:

- `validate_structure(data_struct)` validates the flat `items` produced by `build_structure` and returns an array of violation descriptions (an empty array means valid). It does not stop at the first error. It is internal.
- What it checks:
  - Names: a name that is not a string matching `TAG_NAME` (`/^[A-Za-z_][A-Za-z0-9_]*$/`: the ASCII identifier that every language and PLC accepts; so a number of YAML, an empty or a missing name fails here); duplicate names in `items`; names colliding with a member of TData (methods and getters on `TData.prototype`, and instance fields such as `name`).
  - Type and length: `type` is not a supported type; `length` does not match the type (Bool 1, Byte / SInt / USInt 8, Int / UInt / Word 16, DInt / UDInt / DWord / Real 32).
  - Alignment: the `offset` of a non-Bool must be a multiple of 8; the byte offset of a multi-byte type must be even.
  - Overlap: non-Bool entries are sorted by byte range and neighbouring ranges are checked for intersection; Bools are checked by `offset` for a bit occupied twice; a Bool inside the range of a non-Bool requires the `coupling` of that Bool entry (after expansion, the array of names of the combined words it belongs to) to contain the name of the non-Bool entry.
  - Combined words: every bit named in the `coupling` of an entry must exist, be a Bool, and have an `offset` within `[offset, offset + length)`.
  - Total length: `length % 16 === 0`.
  - The type and range of `init_value` match `type`.
  - A combined word and its bits do not both give `init_value` (the conflict is recorded during expansion and reported by validation).
- `build_structure` keeps entries with duplicate or invalid names and leaves them to validation. An entry is dropped only when it is a pure inclusion (it has `includes` and no name); any other entry is a tag, so a tag entry without a name is reported and not lost. A name prefix is put only before a name that is a string.
- `register_layout` validates all layouts of all the sources and, on violations, throws an error that contains all of them (`error.errors`).
- After validation passes, TData and TTag do not repeat these checks; `register_structure` keeps only defensive assertions.

## 4. Codecs and prototype accessors

- The codec table `codecs.js` has one entry per type: `get(buffer, byte, mask)` decodes from the big-endian buffer and `set(buffer, byte, mask, value)` encodes into it. Device byte order is not handled in the table.
- `TData` keeps a map from layout name to the TData subclass built for that layout. The first `new TData(layout, ...)` of a name builds the subclass and defines the accessor of every entry once on its prototype, shared by all instances of the layout; later ones reuse it. The subclass has the static `layout`. The name alone tells the layouts apart, because the registry holds one layout per name:
  - the getter decodes from `buffer` with the codec on every read and caches nothing;
  - the setter writes into `buffer` with the codec and then calls `after_write`.
- A combined word and its bits share the same bytes, so writing either one makes the other read the new value; no extra linkage is needed.
- A tag name must not be a reserved name (spec-data-api.md §2.10), as its accessor would shadow a member. The reserved names are the static set in `reserved.js`: the members of TData, the method and field names of EventEmitter in Node.js 20.11 and the names of `Object.prototype`. Nothing is probed at run time, so the set does not depend on the Node.js version. `reserved.js` exports `is_reserved_name(name)` to `structure.js` and `TData.js` only; the package does not export it and TData has no static method for it. `validate_structure` reports a reserved name, and `TData` throws when it builds the subclass. A test compares the set with the names found on an instance in the running Node.js, so a new EventEmitter member makes the test fail and the set is then extended.
- The reserved event names (`change`, `write`, `read`) are the constant `RESERVED_EVENTS` in `reserved.js`, for the tests and the documentation; they are a rule for the user and are not enforced at run time. `TData` and `TTag` override `on`, `once` and `off` (each calls the `EventEmitter` method) only to carry the typed overloads: a listener type chosen by the event name through the conditional types `Data_Listener<E>` and `Tag_Listener<E>` of `typedefs.js`, so that a wrong listener of `change` or `write` is a compile-time error and other names take any listener. Future members of TData are `Symbol`-keyed or static.
- The `access` event (spec-data-api.md §2.8) replaces the former global `set_access_tracer`. There are two kinds of listener. The instance listeners are those of the `EventEmitter` of the data block; the class listeners are kept apart in a module-private `Set` of `TData.js` (`TData.on_access` and `TData.off_access` add to and delete from it), so that neither `removeAllListeners()` nor any other call on an instance can reach them. Before anything is built, `#has_access_listeners()` tests `class_access_listeners.size > 0 || this.listenerCount("access") > 0`, so a data block without a listener pays one cheap check per access. The instance part is not cached in a flag kept by the `newListener` and `removeListener` events, because `removeAllListeners()` also removes those two internal listeners and the flag would go wrong; the class part is counted by the `Set` itself, which only the two static methods change. `#emit_access(kind, tags, errors)` calls the instance listeners through `emit_all`, then the class listeners (each in its own `try`, with `(this, kind, tags)`), and pushes what they throw to `errors`. The module flag `in_access` is set around both calls and suppresses every access made meanwhile, to any tdata, by the listeners themselves. A read throws `errors[0]` after the listeners, a write passes `errors` on to `#written()`, which emits `access` right after `touch()` and before the detection, and throws the first error at the end, so that the buffer, the snapshot and the events stay consistent. The tags are the handles of `get(name)` (created when first needed): by name, the one tag; for a byte range, `#tags_in(start, end, mask)` walks `tags_at_byte`, leaves out repeats and the Bools whose bit is not in `mask` and sorts by the index of the entry.
- `render_types(layouts, { source, tdata_module })` (spec-data-api.md §6.7) generates type declarations from layouts: per layout an interface `<Layout>_Tags` with a property per tag and the type `<Layout>_TData = TData & <Layout>_Tags`. The layout name is used as it is, with no case folding (the case style is the caller's choice), so that the type names are those of `new TData("<Layout>", ...)` and different names cannot collide; it must match `IDENTIFIER`, or all the offending names are thrown together in the `errors` of one `Error`. `IDENTIFIER` uses the Unicode properties `ID_Start` and `ID_Continue` (and `_`, `$`), so that names in any script are accepted. Tag names are written as they are, since the validation has made them identifiers. `doc_comment` turns a `comment` into a one-line or a multi-line doc comment and escapes `*/`. The options have defaults (`tdata_module` is `"tagged-data"`, no `source` gives a header without a file name), and the header comment shows the JSDoc cast that names the type of the value. The constructor of `TData` is not changed: the declaration generated from a class cannot make the type returned by `new` depend on an argument.

## 5. TData

- `new TData(layout, name)` takes a registered layout, or the name of one (resolved by `get_layout`), and returns an instance of the subclass built for the layout name (see §4); the constructor calls `super()` first and then returns that instance. A layout object that is not the registered one of its name throws (an identity check, not a structural one). `TData` itself is never the direct class of an instance. The instance allocates `buffer` (`layout.size` bytes) and encodes the `init_value` of the entries in order.
- `name`, `layout` and `size` are read-only (getter only, assignment throws `TypeError`); `name` is the private field `#name`, which the constructor sets after it has checked, before anything else, that it is a string (`TypeError`). `setMaxListeners(100)` of a TData and `setMaxListeners(20)` of a TTag are fixed in their constructors. The buffer is a private field (`#buffer`) with no accessor, always big-endian; the Observer and the transaction get it from the TData that creates them. Typed access goes through tags, untyped access through bytes: there are no raw methods classified by width.
- There are two ways to write the buffer, both through TData and allowed at any time:

  | Way | Used by |
  | --- | --- |
  | Assignment by name (`data[name] = v` or `tag.value = v`) | Any code |
  | Raw methods `write_bytes(offset, source)` and `write_bit(offset, mask, value)`, locating by byte offset | Code that deals with register addresses, such as a Modbus server, and the IO layer |

- `read_bytes(offset = 0, length = size - offset)` returns a copy of a byte range (`Buffer.from(buffer.subarray(...))`), so the buffer cannot be changed through it.
- The raw methods check their arguments before touching the buffer, so that on error the data is unchanged and `#written()` is not reached: `offset` and `length` must be integers with `0 <= offset` and `offset + length <= size`, `mask` an integer from 1 to 0xff (`RangeError`), `source` a `Uint8Array` (`TypeError`). `write_bytes` copies with `buffer.set(source, offset)`. A raw write records the byte range it touched for the Observer (§5.1).
- `load_tag(name, io_buffer, endian)` and `store_tag(name, io_buffer, endian)` (spec-data-api.md §2.9) resolve `name` to the compiled entry of the layout (an unknown name throws `Error`), check `endian`, `io_buffer` and the range of the entry in it (`io_range`), and then call `load_entry` / `store_entry` of `endian.js` with the private buffer. `load_tag` registers the byte range of the entry and ends in `#written()` like any write; `store_tag` only reads the buffer. `TTag.load(io_buffer, endian)` and `TTag.store(io_buffer, endian)` call them with the name of the tag, so a TTag needs no check of which tdata it belongs to.

- TData throws exceptions on errors (layout conflicts, refused values); it neither logs nor exits.
- **Value checks.** A codec has `check(value)` next to `get` and `set`: it returns `null` for an acceptable value and the reason text otherwise. The setter of a tag accessor calls it before `codec.set`, so a refused value touches neither the buffer nor the observer, and throws `TypeError` when `typeof value` is not `"number"` and `RangeError` when it is (the message is `<tdata name>.<tag>: <reason>`). `Bool` always returns `null`. Integer codecs require a number, `Number.isInteger` and the range of the type; the `Real` codec requires a number, lets `NaN` and `±Infinity` pass and refuses a finite value whose magnitude is above `FLOAT32_MAX` (`3.4028234663852886e38`, the value `check_init_value` of `structure.js` uses). `Buffer.write*` is left as the last defence and is not the check.
- `data.get(name)` returns the `TTag` of the tag, created and cached on first access; for an unknown name it returns `undefined`. A TTag holds no value: reading `value` decodes from the buffer of the TData, writing `value` is exactly equivalent to `data[name] = v`; `name`, `type` and `size` come from the compiled entry of the layout, which a TTag holds privately and does not expose; the `change` event is emitted by the Observer.

### 5.1 Detection, transactions and the Observer

Every write path ends in the same private method of TData:

```js
#written() {
    if (this.#transaction) { this.#transaction.written = true; return; }  // in a transaction: only remember
    this.#observer.diff();                                                // detect right now
    this.emit("write", this);                                             // then tell the listeners
}
```

- Outside a transaction, `diff()` is called synchronously inside the write statement, then `write` is emitted.
- `diff()` is internal: no public method triggers a detection. Every write path reaches it through `#written()`, so the buffer never differs from the snapshot outside a write or a transaction.

**Transactions.** `transaction(fn)` throws `Error` if a transaction is already open; otherwise it copies the buffer, registers the transaction state `{ written: false }` and calls `fn()` synchronously:

- `fn` returns normally: the transaction is closed, `diff()` is called once, one `write` is emitted if `written` is true, and the return value of `fn` is returned (it is not checked for being a Promise);
- `fn` throws: the transaction is closed, the copy is written back to the buffer, no event is emitted, and the original exception is rethrown;
- The snapshot of the Observer stays untouched during the transaction: the `diff()` at commit is exactly the net change between the last detection before the transaction and now. After a rollback the buffer is back to its content at the start, equal to the snapshot again;
- Events are emitted after the transaction is closed, so writes and transactions in handlers are ordinary ones; an exception thrown by a handler at commit is thrown by `transaction` after all events and `write` are dispatched (see the dispatch below) and does not roll back;
- Node.js runs no other JS code during the transaction, so no other code on the thread can access the tdata and the transaction needs no lock or isolation. `written` is a boolean flag, not a count, because the `write` event carries nothing beyond the tdata.

**Snapshot comparison.** The Observer holds a snapshot as long as the buffer, copied from it at creation. Every write path knows the byte range it wrote and registers it with the Observer (`touch(start, end)`; inside a transaction the ranges accumulate into one); `diff()` compares the buffer with the snapshot byte by byte over the registered range only, as all other bytes are equal by construction, and clears the range. For the bytes that differ it finds the related tags through the lookup table `tags_at_byte`, decodes the old value from the snapshot and the new value from `buffer`, and records a change when the values differ (two NaNs count as equal). It then updates the snapshot and reports all changes together:

- Changes are reported in layout order (a combined word before its bits). For each change TData emits `change(tagname, old, new)` first, then the TTag of that tag emits `change(old, new)`. Events are always emitted after the new value has taken effect;
- Several writes to the same tag between two detections are merged into one event; a value changed and restored emits none;
- When a handler writes a tag again, the nested comparison is only registered; once the current round of changes is reported, another round of comparison runs. If new changes keep appearing for 16 rounds in a row, the rounds stop and the oscillation exception is kept as an error of the dispatch;
- **Dispatch and errors** (spec-data-api.md §4.4). `#written()` and the commit of a transaction own an `errors` array and pass it to `diff(errors)`, then to `emit_all`; nothing in the dispatch throws until the end. `emit_all(emitter, event, args, errors)` (in `dispatch.js`) calls each of `emitter.rawListeners(event)` with `emitter` as `this` inside its own `try`, and pushes what a listener throws; a `once` wrapper of `rawListeners` removes itself as usual. The Observer calls its `report(entry, old, new, errors)` for every change even when one throws, since the changes of a round are collected, and the snapshot updated, before the first is reported. After `diff(errors)` the write emits `write` through `emit_all` as well, and only then throws `errors[0]`, if any. A nested `diff()` (`#diffing`) only records the pending round and pushes nothing. The first exception is thrown as it is, with no wrapper (no `AggregateError`), and the rest are dropped;
- Old values are decoded from the snapshot; no value is cached.

## 6. Byte order conversion

`endian.js` converts between device byte order and the internal big-endian order per compiled entry (`load_entry` / `store_entry` / `io_index` / `io_range`), and builds the byte index table of a whole data block (`io_index_table`), with which a user that exchanges a whole block with a device copies the bytes directly. Only `io_index_table` is exported by the package; the others are internal and used by `load_tag` / `store_tag` of TData (§5), which pass them the private buffer. The table agrees with `load_entry` / `store_entry` for every entry (covered by a test). The functions accept only the byte orders `BE`, `LE`, `BEBS` and `LEBS` (anything else is a `RangeError`, there are no aliases) and do not detect changes:

- 2 bytes: `BE` copies as is; `LE` / `BEBS` swap the two bytes;
- 4 bytes: the four orders `BE`, `LE`, `BEBS` and `LEBS` are supported;
- Bool and single-byte types (Byte, SInt, USInt) read and write one byte without any conversion inside the byte. Their index in the IO buffer is computed per 16-bit register: `byte ^ 1` for `LE` / `BEBS`, `byte` for `BE` / `LEBS`. A Bool changes only its own bit, by bit mask.

## 7. Build and test

- `pnpm build`: rolldown bundles `src/index.js` into `dist/tagged-data.js` (`yaml` is bundled into the library);
- `pnpm bench`: `bench/change_detection_bench.js` measures reading a block of 86 tags and 146 bytes (loading every tag from a device-ordered buffer, which detects and reports the changes). On a development machine, `load_tag` of every tag in one transaction takes one cycle about 3.1–3.2 µs with no change, 3.1–4.5 µs with a few changes, and 8.5–8.6 µs with every tag changed (each `load_tag` also checks, once, whether an `access` listener exists, which is about 0.6 µs of the 86 tags); copying the bytes with `io_index_table` and one `write_bytes` takes about 0.4 µs, 0.6–1.7 µs and 5.7–5.9 µs;
- `pnpm test`: builds first, then runs the type tests and `node --test`; `pnpm lint`: ESLint.
