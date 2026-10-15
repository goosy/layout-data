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
| `src/endian.js` | Per-entry device byte order conversion |
| `src/types.js` | TypeScript declaration generation from layouts (`render_types`) |
| `src/typedefs.js` | JSDoc definitions of the public types (the only source of the types, no run-time content) |
| `dist/types/` | Declaration files generated from the JSDoc by `tsc`, called from a plugin in `rolldown.config.js` during the build (`tsconfig.json`); not committed |
| `type_check/consumer.ts` | Type test: imports the generated declarations by package name and checks the public interface with `Equal` assertions and `@ts-expect-error` (`pnpm test:types`, included in `pnpm test`) |

## 2. Parts

| Part | Responsibility | Instances | Mutability |
| --- | --- | --- | --- |
| Layout | Compiled from a layout description: byte position and codec of every tag, a byte-to-tag lookup table, prototype accessors | One per structure | Immutable |
| TData | The value buffer `buffer` (big-endian), access by name, raw write methods, the TTag returned by `get(name)` | One per tdata | Mutable |
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
- Every layout is compiled to a Layout (`register_layout`). Besides the expanded `name`, `length` and `items`, it has the table `entries` indexed by name (byte offset, bit mask, codec), and the byte-to-tag lookup table `tags_at_byte`. A layout is plain, immutable data: it holds no class and `layout.js` does not depend on `TData`. Within one layout description the layout names are distinct (they are the keys of `layouts`).
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
- `name` is writable; `layout`, `size` and `buffer` are read-only (getter only, assignment throws `TypeError`), and the content of `buffer` can be read and written. `buffer` is always big-endian.
- There are two ways to write `buffer`, both through TData and allowed at any time:

  | Way | Used by |
  | --- | --- |
  | Assignment by name (`data[name] = v` or `tag.value = v`) | Any code |
  | Raw write methods `write_bit(offset, mask, value)`, `write_bytes(offset, source)`, `write_words(offset, source)`, `write_dwords(offset, source)`, locating by byte offset | Code that deals with register addresses, such as a Modbus server |

- TData throws exceptions on errors (layout conflicts, out-of-range values); it neither logs nor exits.
- `data.get(name)` returns the `TTag` of the tag, created and cached on first access; for an unknown name it returns `undefined`. A TTag holds no value: reading `value` decodes from the `buffer` of the TData, writing `value` is exactly equivalent to `data[name] = v`; `name`, `type` and `length` come from the Layout entry; the `change` event is emitted by the Observer.

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
- After writing the content of `buffer` directly, call `detect()`; inside a transaction `detect()` throws `Error`.

**Transactions.** `transaction(fn)` throws `Error` if a transaction is already open; otherwise it copies `buffer`, registers the transaction state `{ written: false }` and calls `fn()` synchronously:

- `fn` returns normally: the transaction is closed, `diff()` is called once, one `write` is emitted if `written` is true, and the return value of `fn` is returned (it is not checked for being a Promise);
- `fn` throws: the transaction is closed, the copy is written back to `buffer`, no event is emitted, and the original exception is rethrown;
- The snapshot of the Observer stays untouched during the transaction: the `diff()` at commit is exactly the net change between the last detection before the transaction and now. After a rollback `buffer` is back to its content at the start, in the same relation to the snapshot as before the transaction, so a change made by writing `buffer` directly before the transaction and not yet detected is left for the next detection;
- Events are emitted after the transaction is closed, so writes and transactions in handlers are ordinary ones; an exception thrown by a handler at commit propagates and does not roll back;
- Node.js runs no other JS code during the transaction, so no other code on the thread can access the tdata and the transaction needs no lock or isolation. `written` is a boolean flag, not a count, because the `write` event carries nothing beyond the tdata.

**Snapshot comparison.** The Observer holds a snapshot as long as `buffer`, copied from `buffer` at creation. `diff()` compares `buffer` with the snapshot byte by byte; for the bytes that differ it finds the related tags through the lookup table `tags_at_byte`, decodes the old value from the snapshot and the new value from `buffer`, and records a change when the values differ (two NaNs count as equal). It then updates the snapshot and reports all changes together:

- Changes are reported in layout order (a combined word before its bits). For each change TData emits `change(tagname, old, new)` first, then the TTag of that tag emits `change(old, new)`. Events are always emitted after the new value has taken effect;
- Several writes to the same tag between two detections are merged into one event; a value changed and restored emits none;
- When a handler writes a tag again, the nested comparison is only registered; once the current round of changes is reported, another round of comparison runs. If new changes keep appearing for 16 rounds in a row, an exception is thrown to prevent oscillation;
- Old values are decoded from the snapshot; no value is cached.

## 6. Byte order conversion

`endian.js` converts between device byte order and the internal big-endian order per layout entry (`load_entry` / `store_entry` / `io_index` / `io_range`), and builds the byte index table of a whole data block (`io_index_table`), with which a user that exchanges groups of entries with a device copies the bytes of the group directly. The table agrees with `load_entry` / `store_entry` for every entry (covered by a test). It does not detect changes:

- 2 bytes: `BE` copies as is; `LE` / `little` / `BEBS` swap the two bytes;
- 4 bytes: the four orders `BE`, `LE` / `little`, `BEBS` and `LEBS` are supported;
- Bool and single-byte types (Byte, SInt, USInt) read and write one byte without any conversion inside the byte. Their index in the IO buffer is computed per 16-bit register: `byte ^ 1` for `LE` / `little` / `BEBS`, `byte` for `BE` / `LEBS`. A Bool changes only its own bit, by bit mask.

## 7. Build and test

- `pnpm build`: rolldown bundles `src/index.js` into `dist/tagged-data.js` (`yaml` is bundled into the library);
- `pnpm bench`: `bench/change_detection_bench.js` measures reading a block of 86 tags and 146 bytes (loading every tag from a device-ordered buffer, then detecting and reporting the changes). On a development machine one cycle takes about 2 µs with no change, 2.5–3.5 µs with a few changes, and 7–8 µs with every tag changed;
- `pnpm test`: builds first, then runs the type tests and `node --test`; `pnpm lint`: ESLint.
