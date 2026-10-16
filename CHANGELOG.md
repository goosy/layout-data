# Changelog

## v0.2.0

The first release.

### Features

- **Typed data blocks in a fixed layout.** A data block (the class `Ldata`) is a `Buffer`-backed block of named, typed tags (`Bool`, `Byte`, `SInt`, `USInt`, `Int`, `UInt`, `Word`, `DInt`, `UDInt`, `DWord`, `Real`), stored big-endian. A `Word` made of `Bool`s is a combined word that shares its bytes with its bits. A tag is read and written by name, `ldata.pressure = 1.5`, or through its `Ltag` handle, `ldata.get("pressure")`.
- **Layouts in YAML or in code.** A layout is described in a YAML 1.2 file, with reusable fragments, `includes` and `coupling`, or as the same structure already parsed, and is registered with `register_layout(sources)`. A source is a file path, a parsed description, or a list of them; the fragments of all the sources are collected before they are resolved, so a layout may name a fragment of any source, whatever the order. The layouts are validated as a whole, every violation is reported at once, and either all of them are registered or none. The registration is made once per process, and a call that fails does not use it up. After that a data block is created by the layout name, `new Ldata("Pump", "pump_1")`, and `get_layout(name)` returns the layout, which is read-only.
- **Names that are safe to use.** A tag name is an identifier (letters, digits and `_`, not starting with a digit), unique in its layout, and not one of the reserved names, which are a fixed list in the spec: the members of a data block, the methods of `EventEmitter` in Node.js 20.11 and the names of `Object.prototype`. The `name` of a data block is a string and cannot be changed.
- **Values are checked before they are written.** A value that is not a number written to a numeric tag throws `TypeError`; `NaN`, an infinity, a non-integer or an integer out of range written to an integer tag, or a finite number beyond float32 written to a `Real` tag, throws `RangeError`. Nothing is truncated or converted, and the old value is kept.
- **Change detection and events.** `change` `(name, old_value, new_value)` is emitted for every tag whose value changes, and by the `Ltag` of that tag as `(old_value, new_value)`; `write` is emitted after every write. Only the byte range a write touched is compared. `transaction(fn)` makes a group of writes one whole: its events are emitted together at the end, and its writes are undone if `fn` throws. When a handler throws, every listener of every event is still called, and the first exception is thrown by the write afterwards; the new value stands. `on`, `once` and `off` are typed for the reserved events `change`, `write`, `access` and `read`.
- **Raw access.** `read_bytes`, `write_bytes` and `write_bit` read and write the bytes by offset, for a server that works with register addresses and for an IO layer. The buffer itself stays private, so no write goes unnoticed.
- **Device byte order.** `load_tag` and `store_tag` (`Ltag.load` and `Ltag.store`) convert one tag between the data block and a device-ordered IO buffer in `BE`, `LE`, `BEBS` or `LEBS`, and `io_index_table` gives the byte indexes for exchanging a whole block at once.
- **Observing accesses.** The `access` event `(kind, tags)` tells which tags a read or a write touched, by name or by bytes, and `Ldata.on_access` and `Ldata.off_access` do the same for every data block of the process. It is a diagnostic, for example to check the dependencies a rule declares against the ones it really has; without a listener an access pays one check.
- **Types for editors.** The type declarations are generated from the JSDoc of the source into `dist/types`, with typed layout descriptions (`Layout_Description`, `Tag_Item`, `Include_Item`) and `Tag_Type`, and are covered by a type test. `render_types` writes an interface of the tags of each layout, `<Layout>_Tags` and `<Layout>_Ldata`, and the JSDoc cast that names the type of a data block gives completion of its tags in plain JavaScript.
- **Tooling.** ESM only, for Node.js >= 20.11, with `yaml` bundled; `pnpm bench` measures loading a data block from a device image. MPL-2.0.

## v0.2.0 (中文)

首个发布版本。

### 功能

- **按固定布局存放的、有类型的数据块。** 数据块（类 `Ldata`）是以 `Buffer` 为底的一块数据，由具名、有类型的 tag（`Bool`、`Byte`、`SInt`、`USInt`、`Int`、`UInt`、`Word`、`DInt`、`UDInt`、`DWord`、`Real`）组成，内部按大端存放。由若干 `Bool` 组成的 `Word` 是组合字，与各组成位共用字节。tag 按名读写，`ldata.pressure = 1.5`，也可以通过它的 `Ltag` 句柄，`ldata.get("pressure")`。
- **用 YAML 或在代码里写布局。** 布局可以写在 YAML 1.2 文件里（可复用片段，有 `includes` 和 `coupling`），也可以是同样结构的已解析对象，用 `register_layout(sources)` 注册。来源可以是文件路径、已解析的描述，或它们组成的列表；先收集所有来源的片段再解析引用，所以布局可以引用任何来源中的片段，与顺序无关。布局作为整体校验，所有违规一次报出，要么全部登记，要么都不登记。注册每个进程只做一次，失败的调用不会用掉这一次。此后按布局名创建数据块，`new Ldata("Pump", "pump_1")`，`get_layout(name)` 返回只读的布局。
- **可以放心使用的名字。** tag 名是标识符（字母、数字和 `_`，不以数字开头），在布局内唯一，且不是保留名；保留名是规格里的固定清单：数据块的成员、Node.js 20.11 的 `EventEmitter` 方法和 `Object.prototype` 的名字。数据块的 `name` 是字符串，且不能修改。
- **写入之前先检查值。** 向数值 tag 写入不是数字的值抛出 `TypeError`；向整型 tag 写入 `NaN`、无穷大、非整数或超出范围的整数，或向 `Real` tag 写入超出 float32 的有限数，抛出 `RangeError`。不截断，不转换，原值保留。
- **变化检测与事件。** tag 的值变化时发出 `change` `(name, old_value, new_value)`，该 tag 的 `Ltag` 也发出 `(old_value, new_value)`；每次写入之后发出 `write`。只比较写入触及的字节范围。`transaction(fn)` 让一组写入成为一个整体：事件在结束时一起发出，`fn` 抛出异常时所有写入都被撤销。处理器抛出异常时，每个事件的每个监听函数仍然都会被调用，之后由这次写入抛出第一个异常；新值保留。`on`、`once`、`off` 对保留的事件 `change`、`write`、`access`、`read` 带类型。
- **原始访问。** `read_bytes`、`write_bytes`、`write_bit` 按偏移读写字节，供按寄存器地址工作的服务端和 IO 层使用。缓冲区本身是私有的，所以任何写入都不会被漏掉。
- **设备字节序。** `load_tag` 和 `store_tag`（`Ltag.load` 和 `Ltag.store`）按 `BE`、`LE`、`BEBS`、`LEBS` 在数据块与设备字节序的 IO 缓冲区之间转换一个 tag，`io_index_table` 给出整块一次交换时的字节下标。
- **观察访问。** `access` 事件 `(kind, tags)` 指出一次读或写触及了哪些 tag，不论是按名还是按字节；`Ldata.on_access` 和 `Ldata.off_access` 对进程里所有数据块做同样的事。它是诊断手段，例如核对一条规则声明的依赖与它实际的依赖；没有监听器时，每次访问只多一次检查。
- **供编辑器使用的类型。** 类型声明由源码的 JSDoc 生成到 `dist/types`，布局描述有类型（`Layout_Description`、`Tag_Item`、`Include_Item`），tag 类型有 `Tag_Type`，并有类型测试。`render_types` 为每个布局写出 tag 的接口，`<Layout>_Tags` 和 `<Layout>_Ldata`，用 JSDoc 类型转换为数据块指定这个类型，就能在纯 JavaScript 里补全它的 tag。
- **工具。** 只有 ESM，要求 Node.js >= 20.11，已内置 `yaml`；`pnpm bench` 测量从设备映像装载数据块的开销。MPL-2.0。
