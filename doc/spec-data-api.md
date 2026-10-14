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
| TTag | The interface of one named entry of a tdata: read and write its value, subscribe to its changes |

The T in TData and TTag stands for Typed: a tdata is stored in a fixed layout and every tag has a definite type and position.

Tag types: `Bool`, `Byte`, `SInt`, `USInt`, `Int`, `UInt`, `Word`, `DInt`, `UDInt`, `DWord`, `Real`. The value of a `Bool` is `true` / `false`, all others are numbers. A `Word` made of several `Bool`s is called a combined word; it shares its data with its bits.

## 2. TData

### 2.1 Creating

```js
const data = new TData(layout, name, options);
```

- `layout`: a registered layout, from `compile_layout` (§6) or `register_layout` (§6.5), or the name of one, which `layout_of(name)` resolves; a structure is not accepted, and an unknown name or a layout object that is not the registered one of its name throws;
- `name`: the name of the tdata, used in logs and error messages;
- `options` (optional):
  - `detection`: the detection mode, `"immediate"` (default) or `"deferred"`, see §4.2;
- After creation every tag equals its initial value from the layout, and no change event is emitted;
- A layout name identifies one layout for the life of the process: the data blocks of one layout share one class (§6.4).

### 2.2 Properties

| Property | Access | Description |
| --- | --- | --- |
| `name` | read/write | The name of the tdata |
| `layout` | read-only | The layout in use |
| `size` | read-only | Size of the tdata in bytes |
| `buffer` | read-only | The internal buffer (big-endian). The property cannot be replaced by another buffer, but its content can be read and written. After changing the content directly you must call `detect()`, otherwise the changes are not detected |

Assigning to a read-only property throws `TypeError`.

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

### 2.5 Raw writes

For writers that do not access by tag name (such as an upstream server). They locate the data by byte offset, and what happens after the write is the same as for a write by name:

| Method | Description |
| --- | --- |
| `write_register(offset, value)` | Write one 16-bit register (big-endian); `offset` is a byte offset |
| `write_bit(offset, mask, value)` | Write the bits of a byte selected by `mask` |
| `write_bytes(offset, source)` | Write a run of bytes starting at `offset` |

### 2.6 Detection

`detect()`: performs one detection (§4.1) and reports all changes since the last detection. In the immediate mode a detection runs automatically after every write, so you usually need it only after changing `buffer` directly; in the deferred mode the user calls it at the right moment.

### 2.7 Events

```js
data.on("change", (name, old_value, new_value) => { /* ... */ });
```

Emitted when the value of any tag of the tdata changes. The arguments are the tag name, the old value and the new value.

```js
data.on("write", (data) => { /* ... */ });
```

Emitted after every write, whether or not it changed a value, and in both detection modes (§4.2). In the immediate mode it is emitted after the detection of that write and the `change` events it caused; in the deferred mode it is the place to schedule a detection. Any number of parties can listen, each with its own handler.

### 2.8 Tracing accesses

`set_access_tracer(tracer)` sets a function called on every read and write of a tag through the property accessors, as `tracer(tdata, name, "read" | "write")`; `set_access_tracer(null)` clears it. For tools that check which tags a piece of code touches. The tracer is global to the process and costs one check per access while unset.

## 3. TTag

| Member | Description |
| --- | --- |
| `name` | The tag name |
| `type` | The type (lower case) |
| `length` | Number of bytes it occupies |
| `value` | The current value, readable and writable; writing it is exactly equivalent to `data[name] = v` |
| `on("change", (old_value, new_value) => ...)` | Subscribe to changes of this tag |

A TTag stores no value; reads and writes act directly on the tdata it belongs to.

## 4. Changes and events

### 4.1 Detection

A **detection** compares the current value of every tag of the tdata with its value at the previous detection, and emits a `change` event for every tag whose value differs. After the detection the current values become the baseline for the next one. The initial values at creation are the baseline of the first detection.

How many times a tag is written between two detections does not matter: a detection compares only the values at the two moments. Several writes are merged into one event whose old value is the value at the previous detection; a value that changed and was restored emits no event.

### 4.2 Detection modes

The detection mode decides when detection happens; it is chosen by `detection` when the tdata is created. It only affects when `change` events are emitted, not the values: in both modes a write takes effect at once, and reading a property of the tdata or the `value` of a TTag at any time gives the current value (§2.3). In both modes the read/write abilities of tdata and TTag, and the content and conventions of events (§4.3), are the same.

| Mode | After a write | When events are emitted | `write` event | Suited to |
| --- | --- | --- | --- | --- |
| Immediate (`"immediate"`, default) | Detect at once | When the write statement returns, the events it caused have been emitted | Emitted after the detection | Ordinary programs, device simulation |
| Deferred (`"deferred"`) | No detection | When the user calls `detect()`, all events since the last detection are emitted together | Emitted, to schedule a detection | Users that process a batch of inputs as a whole |

- Neither mode loses changes: in the deferred mode, as long as the user eventually calls `detect()`, all changes since the last detection are reported.
- In the immediate mode every write is detected, so several writes emit separate events; in the deferred mode they are merged as in §4.1.

### 4.3 Common conventions

- Wherever a change comes from (a write by name, a write through a TTag, a raw write, or `detect()` after a direct write to `buffer`) an event is emitted; none is missed;
- Events are emitted after the new value has taken effect: handlers read the new value;
- An event is emitted only when the value really changes: writing the same value emits none; writing `NaN` over `NaN` counts as unchanged;
- A combined word and its bits emit their own events: when one write changes the word and some of its bits, the word and those bits all emit;
- The changes of one detection are emitted in layout order (a combined word before its bits); for each change the `change` of the tdata is emitted first, then the `change` of the TTag;
- Handlers may write any tag: in the immediate mode, the changes caused by that write are emitted after the current batch has been emitted; in the deferred mode, that write emits `write` and its changes are emitted at the next `detect()`;
- If writes triggered by handlers keep causing new changes for 16 rounds in a row, the detection throws an exception to prevent endless oscillation; changes not yet emitted are not lost and are emitted at the next detection.

## 5. Errors

The interface throws exceptions on errors. It does not log or exit the process; the caller decides how to handle them:

| Case | Exception |
| --- | --- |
| Writing an integer outside the range of the type | `RangeError`, the old value is kept |
| Invalid layout, or a tag name colliding with a TData member | `Error` thrown when the tdata is created |
| Writes triggered by handlers that do not settle | `Error` thrown by the detection |

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
- Every layout is registered under its name (§6.4); a layout identical to a registered one of that name (a file, whatever its path, or an object given to `compile_layout_data`) is the same `Layout` object, so several users of one description get identical objects. Do not modify a layout;
- A layout name is used by one layout only: a layout that differs from the registered one of its name (the `comment` of the items and the case of the type names do not count) is an error, `another layout is already named X`. A description is registered all or none: the conflicts are reported in `errors` before any layout is registered. Layouts of different descriptions therefore need distinct names unless they are identical. `layout_of(name)` returns the registered layout and throws `unknown layout X` for an unknown name;
- `compile_layout_data(root, origin)` compiles an already parsed description (the same structure as the file: `layouts` plus the fragments), for layouts embedded in the user's own file. The result and the errors are the same.

### 6.5 Defining a layout in code

A layout needs no file. `build_structure({ name }, items)` expands a list of items (the same entries as in the file, with inline `coupling` lists and explicit `length`) into a structure, `validate_structure(structure)` returns the list of violations (§6.3; empty when valid), and `register_layout(structure)` compiles it into a layout and registers it (§6.4). `layout_of(name)` returns a registered layout. `new TData(layout, name)` takes that layout. `build_structure` keeps what it is given, including violations, so check the result before use.

## 7. Outside this interface

- Exchanging data with devices (byte order conversion, grouped reads and writes, driver binding) is the job of the user's IO layer, which operates the tdata through this interface and `buffer` (the package provides per-entry byte order conversion functions, see design.md §6);
- Scheduling, rules and timing do not belong to this interface.
