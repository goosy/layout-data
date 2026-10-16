# tagged-data

Structured, reactive, buffer-based data blocks with named, typed tags.

A data block is a fixed-layout `Buffer` (big-endian inside). The layout is described in YAML. You read and write tags by name, subscribe to their changes, and convert byte order only at the edge where you talk to a device. It does no I/O, scheduling or logging; those belong to the program that uses it (a controller, a device simulator, ...).

## Features

- **Fixed, validated layouts**: tag types `Bool`, `Byte`, `SInt`, `USInt`, `Int`, `UInt`, `Word`, `DInt`, `UDInt`, `DWord`, `Real`; the layout is checked as a whole and every violation is reported at once.
- **Access by name**: `data.pressure = 1.5`, or through a `TTag` handle (`data.get("pressure")`).
- **Combined words**: a `Word` made of `Bool` bits shares its bytes with them, so writing either side updates the other.
- **Change events**: emitted after the new value is in place, for writes by name and raw writes (`write_bytes`, `write_bit`); the internal buffer is not exposed, so no write is missed. Writes that leave a value unchanged emit nothing.
- **Immediate detection and transactions**: events fire when a write returns; `transaction(fn)` makes a group of writes one whole, with its events emitted together at the end and its writes undone if `fn` fails.
- **Device byte order**: `BE`, `LE`, `BEBS`, `LEBS` conversion per tag (`load_tag` / `store_tag`), or by a byte index table for a whole block (`io_index_table`).
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

Register it once, then use it by the layout name:

```js
import { register_layout, TData } from "tagged-data";

register_layout("pump.yaml");
const pump = new TData("PUMP", "pump_1");

pump.on("change", (name, old_value, new_value) => {
	console.log(name, old_value, "->", new_value);
});
pump.get("pressure").on("change", (old_value, new_value) => { /* ... */ });

pump.pressure = 1.5;            // pressure 0.5 -> 1.5
pump.run = true;               // status 0 -> 1, then run false -> true
pump.write_bytes(2, Buffer.from([0x00, 0x02])); // raw write by byte offset: fault becomes true
pump.id = 70000;                // throws RangeError, the old value is kept
```

Exchanging data with a device in another byte order:

```js
pump.load_tag("pressure", io_buffer, "LEBS");  // device -> big-endian, the change is reported
pump.get("pressure").store(io_buffer, "LEBS"); // the same through the TTag, big-endian -> device

// a batch of loads is one write with one detection
pump.transaction(() => {
	for (const { name } of pump.layout.items) pump.load_tag(name, io_buffer, "LEBS");
});
```

## Exports

| Export | Purpose |
| --- | --- |
| `TData`, `TTag` | The data object and the tag handle |
| `register_layout(sources)` | Register the layouts of YAML files or parsed descriptions (a path, an object, or a list of them), once per process; then create `TData` by layout name |
| `render_types(layouts, { source, tdata_module })` | Generate TypeScript interfaces for layouts |
| `get_layout(name)` | Look up a registered layout by name |
| `io_index_table` | Byte index table for exchanging a whole block with a device (per-tag conversion is `load_tag` / `store_tag` of `TData`) |

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
