# tagged-data

Structured, reactive, buffer-based data blocks with named, typed tags.

A data block is a fixed-layout `Buffer` (big-endian inside). The layout is described in YAML. You read and write tags by name, subscribe to their changes, and convert byte order only at the edge where you talk to a device. It does no I/O, scheduling or logging; those belong to the program that uses it (a controller, a device simulator, ...).

## Features

- **Fixed, validated layouts**: tag types `Bool`, `Byte`, `SInt`, `USInt`, `Int`, `UInt`, `Word`, `DInt`, `UDInt`, `DWord`, `Real`; the layout is checked as a whole and every violation is reported at once.
- **Access by name**: `data.pressure = 1.5`, or through a `TTag` handle (`data.get("pressure")`).
- **Combined words**: a `Word` made of `Bool` bits shares its bytes with them, so writing either side updates the other.
- **Change events**: emitted after the new value is in place, for writes by name, raw writes and direct buffer writes (followed by `detect()`). Writes that leave a value unchanged emit nothing.
- **Two detection modes**: `immediate` (default, events fire when the write returns) and `deferred` (events fire at `detect()`, merged).
- **Device byte order**: `BE`, `LE`, `BEBS`, `LEBS` conversion per entry (`load_entry` / `store_entry`).
- **TypeScript types**: declarations are generated from JSDoc, and `render_types` generates per-layout interfaces for editor completion.

## Install

Requires Node.js >= 20.11. The package is ESM only.

```bash
pnpm add tagged-data
```

`yaml` is bundled into the library, so nothing else needs to be installed.

## Usage

Describe the layout (`pump.yaml`). Entries other than `layouts` are fragments that entries can reference by name. Offsets are in bits.

```yaml
status_bits:
  - { name: run, type: Bool, offset: 8 }
  - { name: fault, type: Bool, offset: 9, comment: Fault latch }

layouts:
  PUMP:
    - { name: id, type: UInt, offset: 0, init_value: 1 }
    - { name: status, type: Word, offset: 16, coupling: status_bits }
    - { name: pressure, type: Real, offset: 32, init_value: 0.5, comment: Outlet pressure }
```

Compile it and use it:

```js
import { compile_layout, TData } from "tagged-data";

const { layouts } = compile_layout("pump.yaml");
const pump = new TData(layouts.PUMP, "pump_1");

pump.on("change", (name, old_value, new_value) => {
	console.log(name, old_value, "->", new_value);
});
pump.get("pressure").on("change", (old_value, new_value) => { /* ... */ });

pump.pressure = 1.5;            // pressure 0.5 -> 1.5
pump.run = true;               // status 0 -> 1, then run false -> true
pump.write_register(2, 0x0002); // raw write by byte offset: fault becomes true
pump.id = 70000;                // throws RangeError, the old value is kept
```

Exchanging data with a device in another byte order:

```js
import { load_entry, store_entry } from "tagged-data";

const entry = pump.layout.entries.get("pressure");
load_entry(entry, io_buffer, pump.buffer, "LEBS");  // device -> big-endian
store_entry(entry, pump.buffer, io_buffer, "LEBS"); // big-endian -> device
// after changing pump.buffer directly, report the changes:
pump.detect();
```

## Exports

| Export | Purpose |
| --- | --- |
| `TData`, `TTag` | The data object and the tag handle |
| `compile_layout(path)`, `compile_layout_data(root, origin)` | Compile a YAML layout file, or an already parsed description |
| `render_types(layouts, { source, tdata_module })` | Generate TypeScript interfaces for layouts |
| `build_structure`, `validate_structure`, `register_layout`, `layout_of` | Define a layout in code instead of a file |
| `set_access_tracer` | Trace the reads and writes of tags |
| `load_entry`, `store_entry`, `io_index_table` | Device byte order conversion |

## Documentation

The specification and design documents are in [doc/](doc/spec.md) (English, `*.md`; the Chinese primary version is `*.zh-cn.md`):

- [Specification](doc/spec.md): goals, scope and data block requirements
- [Data object interface](doc/spec-data-api.md): `TData`, `TTag`, change events and the layout description format
- [Design](doc/design.md): how it is implemented

## Development

```bash
pnpm install
pnpm build      # bundle to dist/ and generate dist/types
pnpm test       # build, type tests, node --test
pnpm lint
```

## License

ISC
