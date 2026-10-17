# layout-data

Structured, reactive, buffer-based data blocks with named, typed tags.

A data block is a fixed-layout `Buffer` (big-endian inside). The layout is described in YAML. You read and write tags by name, subscribe to their changes, and convert byte order only at the edge where you talk to a device. It does no I/O, scheduling or logging; those belong to the program that uses it (a controller, a device simulator, ...).

## Features

- **Fixed, validated layouts**: tag types `Bool`, `Byte`, `SInt`, `USInt`, `Int`, `UInt`, `Word`, `DInt`, `UDInt`, `DWord`, `Real`; the layout is checked as a whole and every violation is reported at once.
- **Access by name**: `data.pressure = 1.5`, or through a `Ltag` handle (`data.get("pressure")`).
- **Combined words**: a `Word` made of `Bool` bits shares its bytes with them, so writing either side updates the other.
- **Change events**: emitted after the new value is in place, for writes by name and raw writes (`write_bytes`, `write_bit`); the internal buffer is not exposed, so no write is missed. Writes that leave a value unchanged emit nothing.
- **Immediate detection and transactions**: events fire when a write returns; `transaction(fn)` makes a group of writes one whole, with its events emitted together at the end and its writes undone if `fn` fails.
- **Device byte order**: `BE`, `LE`, `BEBS`, `LEBS` conversion per tag (`load_tag` / `store_tag`), or by a byte index table for a whole block (`io_index_table`).
- **TypeScript types**: declarations are generated from JSDoc, and `render_types` generates per-layout interfaces for editor completion.

## Install

Requires Node.js >= 20.11. The package is ESM only.

```bash
pnpm add layout-data
```

## Usage

Describe the layout (`pump.yaml`). Entries other than `layouts` are fragments that entries can reference by name. Offsets are in bits.

```yaml
status_bits:
  - { name: run, type: Bool, offset: 8 }
  - { name: fault, type: Bool, offset: 9, comment: Fault latch }

layouts:
  Pump:
    - { name: id, type: UInt, offset: 0, init_value: 1 }
    - { name: status, type: Word, offset: 16, coupling: status_bits }
    - { name: pressure, type: Real, offset: 32, init_value: 0.5, comment: Outlet pressure }
```

Register it once, then use it by the layout name:

```js
import { register_layout, Ldata } from "layout-data";

register_layout("pump.yaml");
const pump = new Ldata("Pump", "pump_1");

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
pump.get("pressure").store(io_buffer, "LEBS"); // the same through the Ltag, big-endian -> device

// a batch of loads is one write with one detection
pump.transaction(() => {
	for (const { name } of pump.layout.items) pump.load_tag(name, io_buffer, "LEBS");
});
```

## Exports

| Export | Purpose |
| --- | --- |
| `Ldata`, `Ltag` | The data object and the tag handle |
| `register_layout(sources)` | Register the layouts of YAML files or parsed descriptions (a path, an object, or a list of them), once per process; then create `Ldata` by layout name |
| `render_types(layouts, options)` | Generate TypeScript interfaces for layouts, for editor completion (see below) |
| `get_layout(name)` | Look up a registered layout by name |
| `io_index_table` | Byte index table for exchanging a whole block with a device (per-tag conversion is `load_tag` / `store_tag` of `Ldata`) |

## Editor completion

`new Ldata("Pump", "pump_1")` is typed `Ldata`. To have the tags of the layout completed, generate the types of the registered layouts once, write them to a file beside your code, and name the type of the value with a JSDoc cast:

```js
import { writeFileSync } from "node:fs";
import { register_layout, render_types } from "layout-data";

const { layouts } = register_layout("pump.yaml");
writeFileSync("layout_types.d.ts", render_types(layouts, { source: "pump.yaml" }));
```

```js
const pump = /** @type {import("./layout_types.js").Pump_Ldata} */ (new Ldata("Pump", "pump_1"));
pump.pressure = 1.5;   // completed, and known to be a number
```

The parentheses are part of the cast. With `checkJs` or `// @ts-check` a misspelled tag or a value of the wrong type is reported too.

The types are named after the layout: `Pump_Tags` and `Pump_Ldata` for the layout `Pump`. In TypeScript write `new Ldata("Pump", "pump_1") as Pump_Ldata`.

## Documentation

The specification and design documents are in [doc/](doc/spec.md) (English, `*.md`; the Chinese primary version is `*.zh-cn.md`):

- [Specification](doc/spec.md): goals, scope and data block requirements
- [Data object interface](doc/spec-data-api.md): `Ldata`, `Ltag`, change events and the layout description format
- [Design](doc/design.md): how it is implemented

## Development

```bash
pnpm install
pnpm build      # generate dist/types
pnpm test       # build, type tests, node --test
pnpm lint
```

## License

[MPL-2.0](LICENSE). You may use this library as a component of your own products, commercial or not, under any license. If you modify the files of this library, the modified files must be published under MPL-2.0, and the copyright and license notices must be kept.

The license grants no trademark rights: the name "layout-data" may not be used to promote a modified or repackaged copy of this library.
