# tagged-data Specification

> English version of [spec.zh-cn.md](spec.zh-cn.md), the primary Chinese version. When the two differ, update both.

## 1. Goals and scope

tagged-data is a structured data block library: `Buffer`-based, data-flow oriented, reactive data blocks.

- A data block is stored in a fixed layout, which can be described by a YAML file;
- Tag values are read and written by name, and changes can be subscribed to;
- The package provides layout validation, byte order conversion functions and type declaration generation;
- It is published as a library, shared by controllers, device simulators and similar programs.

Out of scope: device communication, scheduling, business rules and logging. The user of the library is responsible for them.

## 2. Terms

| Term | Meaning |
| --- | --- |
| Layout | The fixed format of a data block: name, type, bit offset and initial value of every tag. Immutable once compiled |
| TData / tdata | TData is the class of data objects, a tdata is an instance: a block of data allocated for a layout, stored big-endian internally |
| TTag | The interface of one named entry of a tdata |
| Combined word | A Word made of several Bools, sharing its data with its bits |

## 3. Data block requirements

- **Fixed layout**: every tag has a definite type, byte offset and bit number.
- **Valid layout**: a layout must obey the rules below. An invalid layout is a programming error, and validation reports all violations:
  - tag names are unique within a tdata;
  - the bit length of a tag matches its type; multi-byte types (Int, UInt, Word, DInt, UDInt, DWord, Real) start at an even byte, single-byte types (Byte, SInt, USInt) start at a whole byte, a Bool may be at any bit;
  - the byte ranges of non-Bool tags do not overlap;
  - each bit belongs to at most one Bool tag;
  - a Bool inside the byte range of a non-Bool tag must be a bit of that tag (a combined word); conversely every bit of a combined word must lie inside the word;
  - only one side of a combined word and its bits gives the initial value: if the word gives it, the initial values of the bits come from the whole word; otherwise they come from the bits (a bit without a value is false) and the word is composed from them;
  - the total length of a data block is a whole number of registers (a multiple of 16 bits).
- **Bit numbering of combined words**: in a 16-bit combined word, bit k of the word value is bit k of the register. This is guaranteed by the offsets of the bits in the layout; no extra byte swapping is done internally.
- **Byte order**: data is stored big-endian internally. Device byte orders (`BE`, `LE`, `BEBS`, `LEBS`) are converted only at the boundary where data is exchanged with a device; the package provides per-entry conversion functions. For Bool and single-byte tags the device byte order acts per 16-bit register.
- **Access by name**: a program reads and writes tag values by name, at any time. The programming interface is in [spec-data-api.md](spec-data-api.md).
- **Change events**: when the value of a tag changes (from an assignment, a raw write, or a direct buffer write followed by detection) a change event is emitted, after the new value has taken effect.
- **Combined word linkage**: a combined word and its bits are linked in both directions.
- **Errors**: errors are thrown as exceptions; nothing is logged and the process is never exited.

## 4. Layout description

A layout is given by a YAML 1.2 file; see §6 of [spec-data-api.md](spec-data-api.md).

## 5. Distribution

- Published as an ES module library with the entry `tagged-data`. `yaml` is bundled, so users need not install it;
- Type declarations are generated from the JSDoc of the source (`src/typedefs.js` and the comments of the functions are the only source). They are emitted to `dist/types` by the build; no hand-written `.d.ts`;
- Node.js >= 20.11.

## 6. Public interface at a glance

The entry `tagged-data` exports:

| Export | Description |
| --- | --- |
| `TData`, `TTag` | The data object and the tag handle (§2 and §3 of [spec-data-api.md](spec-data-api.md)) |
| `compile_layout`, `compile_layout_data` | Compile a layout description (§6 of [spec-data-api.md](spec-data-api.md)) |
| `render_types` | Generates TypeScript declarations from compiled layouts |
| `load_entry`, `store_entry`, `io_index`, `io_index_table`, `io_range` | Per-entry device byte order conversion (§6 of [design.md](design.md)) |
| `build_structure`, `validate_structure`, `layout_of`, `TYPE_BITS`, `CODECS`, `Observer`, `set_access_tracer` | Lower-level parts, usually used indirectly through `compile_layout` |

## 7. Documents

- The Chinese documents are the primary ones: [spec.zh-cn.md](spec.zh-cn.md), [spec-data-api.zh-cn.md](spec-data-api.zh-cn.md), [design.zh-cn.md](design.zh-cn.md);
- This directory holds the English versions, which correspond to them; update both when the specification changes;
- For a quick start see [../README.md](../README.md).
