# layout-data

Structured, reactive, buffer-based data blocks with named, typed tags.

A data block is a fixed-layout `Buffer` (big-endian inside). The layout is described in YAML. You read and write tags by name, subscribe to their changes, and convert byte order only at the edge where you talk to a device. It does no I/O, scheduling or logging; those belong to the program that uses it (a controller, a device simulator, ...).

## Features

- **Fixed, validated layouts**: tag types `Bool`, `Byte`, `SInt`, `USInt`, `Int`, `UInt`, `Word`, `DInt`, `UDInt`, `DWord`, `Real`; the layout is checked as a whole and every violation is reported at once.
- **Access by name**: `data.pressure = 1.5`, or through a `Ltag` handle (`data.get("pressure")`).
- **Combined words**: a `Word` made of `Bool` bits shares its bytes with them, so writing either side updates the other.
- **Change events**: emitted after the new value is in place, for writes by name and raw writes (`write_bytes`, `write_bit`); the internal buffer is not exposed, so no write is missed. Writes that leave a value unchanged emit nothing.
- **Immediate detection and transactions**: events fire when a write returns; `transaction(fn)` makes a group of writes one whole, with its events emitted together at the end and its writes undone if `fn` fails.
- **Device byte order**: `BE`, `LE`, `BEBS`, `LEBS` conversion per tag (`load_tag` / `store_tag`), or by a byte index table for a whole block (`io_index_table` of a layout).
- **Scopes**: layout names are separated by scopes, so a library can register its own layouts and an application can combine several such libraries.
- **TypeScript types**: declarations are generated from JSDoc, and the development entry `layout-data/dev` (also the command `layout-types`) generates per-layout interfaces for editor completion.

## Install

Requires Node.js >= 20.11. The package is ESM only.

```bash
pnpm add layout-data
```

## Usage

Describe the layout (`pump.yaml`). `item_tables` maps names to item tables, lists of items; `layouts` lists the item tables that are layouts, and items reference other item tables by name. Other root keys are not read. Offsets are in bits.

```yaml
layouts: [Pump]

item_tables:
  Pump:
    - { name: id, type: UInt, offset: 0, init_value: 1 }
    - { name: status, type: Word, offset: 16, coupling: status_bits }
    - { name: pressure, type: Real, offset: 32, init_value: 0.5, comment: Outlet pressure }

  status_bits:
    - { name: run, type: Bool, offset: 8 }
    - { name: fault, type: Bool, offset: 9, comment: Fault latch }
```

Create a scope, register the layouts in it once, then get a layout by its name and create data blocks from it:

```js
import { create_scope } from "layout-data";

const scope = create_scope("app");      // an identifier, unique in the process
scope.register_layout("pump.yaml");     // once per scope
const pump = scope.get_layout("Pump").create_ldata("pump_1");

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
| `Ldata`, `Ltag` | The data object and the tag handle; an ldata is created by `layout.create_ldata(name)`, never with `new Ldata` |
| `create_scope(name)` | Create a scope of layout names. A scope has `register_layout(descriptions)`, which registers the layouts of descriptions, description files or description objects (a path, an object, or a list of them), once per scope; and `get_layout(name)`, which looks up a registered layout by name |
| `get_scope(name)` | Get a created scope by its name, `undefined` when there is none |

The development entry `layout-data/dev` exports `render_types(descriptions, options)`, which generates TypeScript interfaces for the layouts of descriptions, for editor completion (see below). It is not needed at run time.

A layout has `create_ldata(name)` and `io_index_table(endian)`, the byte index table for exchanging a whole block with a device (per-tag conversion is `load_tag` / `store_tag` of `Ldata`), and `scope`, the scope it belongs to.

A library built on layout-data creates a scope of its own and, to keep its layouts from being decided by others, registers in it right away, at the top level of its module:

```js
// lib_a/index.js
import { fileURLToPath } from "node:url";
import { create_scope } from "layout-data";
export const scope = create_scope("lib_a");
scope.register_layout(fileURLToPath(new URL("./pump.yaml", import.meta.url)));
```

The application gets it with `get_scope("lib_a")` or from the export of the library.

## Editor completion

`scope.get_layout("Pump").create_ldata("pump_1")` is typed `Ldata`. To have the tags of the layout completed, generate the types of the layouts once during development (again after the layouts change), write them to a file beside your code, and name the type of the value with a JSDoc cast.

With the command line tool (requires Node.js >= 24.2; only the development environment needs it):

```bash
pnpm exec layout-types pump.yaml --scope app -o layout_types.d.ts
```

Or in a development script, which also works with layouts given in code (Node.js >= 20.11):

```js
import { writeFileSync } from "node:fs";
import { render_types } from "layout-data/dev";

// descriptions as for register_layout; scope is the name used in the header comment
writeFileSync("layout_types.d.ts", render_types("pump.yaml", { scope: "app" }));
```

The generated file imports `Ldata` from `"layout-data"`, which your project has as a (development) dependency; how you bundle the run-time code does not matter.

Then:

```js
const pump = /** @type {import("./layout_types.js").Pump_Ldata} */ (scope.get_layout("Pump").create_ldata("pump_1"));
pump.pressure = 1.5;   // completed, and known to be a number
```

The parentheses are part of the cast. With `checkJs` or `// @ts-check` a misspelled tag or a value of the wrong type is reported too.

The types are named after the layout: `Pump_Tags` and `Pump_Ldata` for the layout `Pump`, so every scope is rendered into a file of its own. In TypeScript write `scope.get_layout("Pump").create_ldata("pump_1") as Pump_Ldata`.

## Documentation

The specification and design documents are in [doc/](doc/spec.md) (English, `*.md`; the Chinese primary version is `*.zh-cn.md`):

- [Specification](doc/spec.md): goals, scope and data block requirements
- [Descriptions](doc/spec-description.md): the description format: `layouts`, `item_tables` and items
- [Layouts](doc/spec-layout.md): scopes, registration, the layout object and type declarations
- [Data object interface](doc/spec-data-api.md): `Ldata`, `Ltag` and change events
- [Design](doc/design.md): how it is implemented

## Development

```bash
pnpm install
pnpm build      # bundle the two entries into dist (yaml stays external), then generate the declarations beside them
pnpm test       # build, type tests, node --test, then the public interface tests against dist
pnpm lint
```

## License

[MPL-2.0](LICENSE). You may use this library as a component of your own products, commercial or not, under any license. If you modify the files of this library, the modified files must be published under MPL-2.0, and the copyright and license notices must be kept.

The license grants no trademark rights: the name "layout-data" may not be used to promote a modified or repackaged copy of this library.
