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
| `src/structure.js` | Structure expansion (`build_structure`) and layout validation (`validate_structure`) |
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
- `compile_layout(yaml_path)` reads the file synchronously, resolves fragment references (an unknown or circular reference is an error), fills in omitted `length`s, then calls `build_structure` for every layout to expand it into flat `items` (computing the total `length` of the structure and normalizing `coupling` to an array of names), validates it, and returns `{ layouts, fragments }`.
- `compile_layout_data(root, origin)` compiles an already parsed description (same structure as the file), for users who carry layouts in their own files; `compile_layout` calls it after reading the file.
- Every layout is compiled to a Layout (`register_layout`). The public Layout is the deeply frozen `{ name, length, size, items }` (spec-data-api.md §6.6), where `items` are frozen copies of the expanded items with only the documented fields. The compiled data, the table `entries` indexed by name (byte offset, bit mask, codec) and the byte-to-tag lookup table `tags_at_byte`, is kept in a module-private `WeakMap` of `registry.js` and read with `compiled_of(layout)` by `TData`, the Observer and `endian.js`; it is never attached to the Layout, so no entry appears in the public interface. A layout is plain, immutable data: it holds no class and `layout.js` does not depend on `TData`. Within one layout description the layout names are distinct (they are the keys of `layouts`).
- The compiled layouts are kept in a registry by layout name (`registry.js`, which imports nothing, so `layout.js` writes to it and `TData` reads it without a cycle). `register_layout(struct)` computes the canonical text of the expanded structure (`name`, `length`, `items`; object keys sorted, `comment` left out, type names in lower case). If the name is registered with the same text it returns the registered Layout, so a layout described twice, even in two different descriptions, is compiled once; with another text it throws `another layout is already named X`. `compile_layout_data` checks every layout of the description for such a conflict before registering any, so a description is registered all or none. `layout_of(name)` returns the registered layout and throws `unknown layout X` otherwise. The registry is never cleared: a layout name is used for the life of the process.
- Bool placement: `byte = offset >> 3`, `bit = offset % 8`. The internal buffer is big-endian and the first byte of a word is the high byte of the register, so offsets 8-15 in `coupling` are register bit 0-7 and offsets 0-7 are register bit 8-15. Listing the bits in the order 8-15, 0-7 in the layout file therefore lists them from register bit 0 to bit 15.

### 3.1 Layout validation

The layout rules are validated centrally at the layout stage, not spread over the run time of TData and TTag:

- `validate_structure(data_struct)` validates the flat `items` produced by `build_structure` and returns an array of violation descriptions (an empty array means valid). It does not stop at the first error.
- What it checks:
  - Names: duplicate names in `items`; names colliding with a member of TData (methods and getters on `TData.prototype`, and instance fields such as `name`).
  - Type and length: `type` is not a supported type; `length` does not match the type (Bool 1, Byte / SInt / USInt 8, Int / UInt / Word 16, DInt / UDInt / DWord / Real 32).
  - Alignment: the `offset` of a non-Bool must be a multiple of 8; the byte offset of a multi-byte type must be even.
  - Overlap: non-Bool entries are sorted by byte range and neighbouring ranges are checked for intersection; Bools are checked by `offset` for a bit occupied twice; a Bool inside the range of a non-Bool requires the `coupling` of that Bool entry (after expansion, the array of names of the combined words it belongs to) to contain the name of the non-Bool entry.
  - Combined words: every bit named in the `coupling` of an entry must exist, be a Bool, and have an `offset` within `[offset, offset + length)`.
  - Total length: `length % 16 === 0`.
  - The type and range of `init_value` match `type`.
  - A combined word and its bits do not both give `init_value` (the conflict is recorded during expansion and reported by validation).
- `build_structure` keeps entries with duplicate names and leaves them to validation.
- `compile_layout` validates all layouts in the file and, on violations, throws an error that contains all of them (`error.errors`).
- After validation passes, TData and TTag do not repeat these checks; `register_layout` keeps only defensive assertions.

## 4. Codecs and prototype accessors

- The codec table `codecs.js` has one entry per type: `get(buffer, byte, mask)` decodes from the big-endian buffer and `set(buffer, byte, mask, value)` encodes into it. Device byte order is not handled in the table.
- `TData` keeps a map from layout name to the TData subclass built for that layout. The first `new TData(layout, ...)` of a name builds the subclass and defines the accessor of every entry once on its prototype, shared by all instances of the layout; later ones reuse it. The subclass has the static `layout`. The name alone tells the layouts apart, because the registry holds one layout per name:
  - the getter decodes from `buffer` with the codec on every read and caches nothing;
  - the setter writes into `buffer` with the codec and then calls `after_write`.
- A combined word and its bits share the same bytes, so writing either one makes the other read the new value; no extra linkage is needed.
- A tag name must not equal a TData member name (the accessor would shadow the member). `validate_structure` checks this (through `TData.is_reserved_name`), and `TData` throws when it builds the subclass.
- `set_access_tracer(tracer | null)`: once set, the accessors call `tracer(tdata, name, "read" | "write")` on every read or write of a tag, for the user's dependency tracking. When unset, the accessors only pay one extra condition.
- `render_types(layouts, { source, tdata_module })` generates type declarations from layouts (one interface per layout, tags as properties, `comment` as doc comment), to give editor completion for access by name.

## 5. TData

- `new TData(layout, name)` takes a registered layout, or the name of one (resolved by `layout_of`), and returns an instance of the subclass built for the layout name (see §4); the constructor calls `super()` first and then returns that instance. A layout object that is not the registered one of its name throws (an identity check, not a structural one). `TData` itself is never the direct class of an instance. The instance allocates `buffer` (`layout.size` bytes) and encodes the `init_value` of the entries in order.
- `name` is writable; `layout` and `size` are read-only (getter only, assignment throws `TypeError`). The buffer is a private field (`#buffer`) with no accessor, always big-endian; the Observer and the transaction get it from the TData that creates them. Typed access goes through tags, untyped access through bytes: there are no raw methods classified by width.
- There are two ways to write the buffer, both through TData and allowed at any time:

  | Way | Used by |
  | --- | --- |
  | Assignment by name (`data[name] = v` or `tag.value = v`) | Any code |
  | Raw methods `write_bytes(offset, source)` and `write_bit(offset, mask, value)`, locating by byte offset | Code that deals with register addresses, such as a Modbus server, and the IO layer |

- `read_bytes(offset = 0, length = size - offset)` returns a copy of a byte range (`Buffer.from(buffer.subarray(...))`), so the buffer cannot be changed through it.
- The raw methods check their arguments before touching the buffer, so that on error the data is unchanged and `#written()` is not reached: `offset` and `length` must be integers with `0 <= offset` and `offset + length <= size`, `mask` an integer from 1 to 0xff (`RangeError`), `source` a `Uint8Array` (`TypeError`). `write_bytes` copies with `buffer.set(source, offset)`. A raw write records the byte range it touched for the Observer (§5.1).
- `load_tag(name, io_buffer, endian)` and `store_tag(name, io_buffer, endian)` (spec-data-api.md §2.9) resolve `name` to the compiled entry of the layout (an unknown name throws `Error`), check `endian`, `io_buffer` and the range of the entry in it (`io_range`), and then call `load_entry` / `store_entry` of `endian.js` with the private buffer. `load_tag` registers the byte range of the entry and ends in `#written()` like any write; `store_tag` only reads the buffer. `TTag.load(io_buffer, endian)` and `TTag.store(io_buffer, endian)` call them with the name of the tag, so a TTag needs no check of which tdata it belongs to.

- TData throws exceptions on errors (layout conflicts, out-of-range values); it neither logs nor exits.
- `data.get(name)` returns the `TTag` of the tag, created and cached on first access; for an unknown name it returns `undefined`. A TTag holds no value: reading `value` decodes from the buffer of the TData, writing `value` is exactly equivalent to `data[name] = v`; `name`, `type` and `length` come from the compiled entry of the layout, which a TTag holds privately and does not expose; the `change` event is emitted by the Observer.

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
- Events are emitted after the transaction is closed, so writes and transactions in handlers are ordinary ones; an exception thrown by a handler at commit propagates and does not roll back;
- Node.js runs no other JS code during the transaction, so no other code on the thread can access the tdata and the transaction needs no lock or isolation. `written` is a boolean flag, not a count, because the `write` event carries nothing beyond the tdata.

**Snapshot comparison.** The Observer holds a snapshot as long as the buffer, copied from it at creation. Every write path knows the byte range it wrote and registers it with the Observer (`touch(start, end)`; inside a transaction the ranges accumulate into one); `diff()` compares the buffer with the snapshot byte by byte over the registered range only, as all other bytes are equal by construction, and clears the range. For the bytes that differ it finds the related tags through the lookup table `tags_at_byte`, decodes the old value from the snapshot and the new value from `buffer`, and records a change when the values differ (two NaNs count as equal). It then updates the snapshot and reports all changes together:

- Changes are reported in layout order (a combined word before its bits). For each change TData emits `change(tagname, old, new)` first, then the TTag of that tag emits `change(old, new)`. Events are always emitted after the new value has taken effect;
- Several writes to the same tag between two detections are merged into one event; a value changed and restored emits none;
- When a handler writes a tag again, the nested comparison is only registered; once the current round of changes is reported, another round of comparison runs. If new changes keep appearing for 16 rounds in a row, an exception is thrown to prevent oscillation;
- Old values are decoded from the snapshot; no value is cached.

## 6. Byte order conversion

`endian.js` converts between device byte order and the internal big-endian order per compiled entry (`load_entry` / `store_entry` / `io_index` / `io_range`), and builds the byte index table of a whole data block (`io_index_table`), with which a user that exchanges a whole block with a device copies the bytes directly. Only `io_index_table` is exported by the package; the others are internal and used by `load_tag` / `store_tag` of TData (§5), which pass them the private buffer. The table agrees with `load_entry` / `store_entry` for every entry (covered by a test). The functions accept only the byte orders `BE`, `LE`, `BEBS` and `LEBS` (anything else is a `RangeError`, there are no aliases) and do not detect changes:

- 2 bytes: `BE` copies as is; `LE` / `BEBS` swap the two bytes;
- 4 bytes: the four orders `BE`, `LE`, `BEBS` and `LEBS` are supported;
- Bool and single-byte types (Byte, SInt, USInt) read and write one byte without any conversion inside the byte. Their index in the IO buffer is computed per 16-bit register: `byte ^ 1` for `LE` / `BEBS`, `byte` for `BE` / `LEBS`. A Bool changes only its own bit, by bit mask.

## 7. Build and test

- `pnpm build`: rolldown bundles `src/index.js` into `dist/tagged-data.js` (`yaml` is bundled into the library);
- `pnpm bench`: `bench/change_detection_bench.js` measures reading a block of 86 tags and 146 bytes (loading every tag from a device-ordered buffer, which detects and reports the changes). On a development machine, `load_tag` of every tag in one transaction takes one cycle about 2.5 µs with no change, 2.5–3.7 µs with a few changes, and 7.5–8 µs with every tag changed; copying the bytes with `io_index_table` and one `write_bytes` takes about 0.4–0.5 µs, 0.6–1.6 µs and 5.3–5.7 µs;
- `pnpm test`: builds first, then runs the type tests and `node --test`; `pnpm lint`: ESLint.
