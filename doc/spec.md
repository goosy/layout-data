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
| Layout | The fixed format of a data block: name, type, bit offset and initial value of every tag. Immutable once registered |
| TData / tdata | TData is the class of data objects, a tdata is an instance: a block of data allocated for a layout, stored big-endian internally |
| TTag | The interface of one named tag of a tdata |
| Combined word | A Word made of several Bools, sharing its data with its bits |

## 3. Data block requirements

- **Fixed layout**: every tag has a definite type, byte offset and bit number.
- **Valid layout**: a layout must obey the rules below. An invalid layout is a programming error, and validation reports all violations:
  - tag names are identifiers (letters, digits and `_`, not starting with a digit), unique within a tdata, and not reserved names (see §2.10 and §6.2 of [spec-data-api.md](spec-data-api.md));
  - the bit length of a tag matches its type; multi-byte types (Int, UInt, Word, DInt, UDInt, DWord, Real) start at an even byte, single-byte types (Byte, SInt, USInt) start at a whole byte, a Bool may be at any bit;
  - the byte ranges of non-Bool tags do not overlap;
  - each bit belongs to at most one Bool tag;
  - a Bool inside the byte range of a non-Bool tag must be a bit of that tag (a combined word); conversely every bit of a combined word must lie inside the word;
  - only one side of a combined word and its bits gives the initial value: if the word gives it, the initial values of the bits come from the whole word; otherwise they come from the bits (a bit without a value is false) and the word is composed from them;
  - the total length of a data block is a whole number of registers (a multiple of 16 bits).
- **Bit numbering of combined words**: in a 16-bit combined word, bit k of the word value is bit k of the register. This is guaranteed by the offsets of the bits in the layout; no extra byte swapping is done internally.
- **Byte order**: data is stored big-endian internally. Device byte orders (`BE`, `LE`, `BEBS`, `LEBS`) are converted only at the boundary where data is exchanged with a device; the package provides per-tag conversion (`load_tag`, `store_tag` of TData, and `load`, `store` of TTag) and a byte index table for a whole block (`io_index_table`). For Bool and single-byte tags the device byte order acts per 16-bit register.
- **Access by name**: a program reads and writes tag values by name, at any time. The programming interface is in [spec-data-api.md](spec-data-api.md).
- **Raw access**: the bytes of a tdata are read and written only through the interface, by tag or raw by byte offset (`read_bytes`, `write_bytes`, `write_bit`); the internal buffer is not exposed, so every write is seen and no change is missed. Typed access goes through tags, untyped access through bytes.
- **Change events**: when the value of a tag changes (from an assignment or a raw write) a change event is emitted, after the new value has taken effect.
- **Transactions**: a group of writes can be made one whole: no event is emitted during the transaction, its events are emitted together at the end, and all its writes are undone if `fn` fails. A transaction acts on the data of a single tdata only; see §4.2 of [spec-data-api.md](spec-data-api.md).
- **Combined word linkage**: a combined word and its bits are linked in both directions.
- **Errors**: errors are thrown as exceptions; nothing is logged and the process is never exited.

## 4. Layout description

A layout is given by a YAML 1.2 file; see §6 of [spec-data-api.md](spec-data-api.md).

## 5. Distribution

- Published as an ES module library with the entry `tagged-data`. `yaml` is bundled, so users need not install it;
- Type declarations are generated from the JSDoc of the source (`src/typedefs.js` and the comments of the functions are the only source). They are emitted to `dist/types` by the build; no hand-written `.d.ts`;
- Node.js >= 20.11;
- License: MPL-2.0 (see `LICENSE`). The library may be used as a component of products under any license; modifications to its files must be published under MPL-2.0, and copyright notices must be kept. The name "tagged-data" is not covered by the license (MPL-2.0 §2.3).

## 6. Public interface at a glance

The entry `tagged-data` exports:

| Export | Description |
| --- | --- |
| `TData`, `TTag` | The data object and the tag handle (§2 and §3 of [spec-data-api.md](spec-data-api.md)) |
| `register_layout` | Register the layouts of the sources, YAML files or parsed descriptions (also for items given in code), once per process; register first, then create `TData` by layout name (§6 of [spec-data-api.md](spec-data-api.md)) |
| `get_layout` | Look up a registered layout by name (§6.4 of [spec-data-api.md](spec-data-api.md)) |
| `io_index_table` | The byte index table for exchanging a whole block with a device (§2.9 of [spec-data-api.md](spec-data-api.md)); the per-tag conversion is `load_tag` / `store_tag` of TData |
| `render_types` | Generates TypeScript declarations from registered layouts |

## 7. Documents

- The Chinese documents are the primary ones: [spec.zh-cn.md](spec.zh-cn.md), [spec-data-api.zh-cn.md](spec-data-api.zh-cn.md), [design.zh-cn.md](design.zh-cn.md);
- This directory holds the English versions, which correspond to them; update both when the specification changes;
- For a quick start see [../README.md](../README.md).
