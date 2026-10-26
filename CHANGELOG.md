# Changelog

## v0.4.0

### Breaking changes

- **Layouts are registered in scopes, and there is no default scope.** `create_scope(name)` makes a scope of layout names, and `get_scope(name)` gets a scope that was created. A scope name is a JavaScript identifier, unique in the process. Every scope has `register_layout(descriptions)`, once per scope, with the same rules as before: the layouts are validated as a whole, all or none of them are registered, and a call that fails does not use up the single call. A scope also has `get_layout(name)` and `render_types(options)`, which renders the types of all the layouts of the scope. Layout and fragment names are unique within a scope only, so two libraries can each register their own layouts, and an application can use both. The global `register_layout`, `get_layout` and `render_types` are removed. Errors name a layout as `scope.Layout`, for example `unknown layout lib_a.Pump`. Migration: `register_layout(d)` becomes `create_scope("app").register_layout(d)`, `get_layout("Pump")` becomes `scope.get_layout("Pump")`, and `render_types(layouts, options)` becomes `scope.render_types(options)`.
- **An ldata is created from its layout.** `layout.create_ldata(name)` is the only way to create an ldata. `new Ldata(...)` throws `TypeError`, and its constructor is private in the declarations. `Ldata` is still exported, for `instanceof`, type annotations and `Ldata.on_access` / `off_access`. A layout is now an object with methods: `create_ldata(name)`, `io_index_table(endian)`, which replaces the exported function `io_index_table(layout, endian)`, and `scope`. Migration: `new Ldata("Pump", name)` becomes `scope.get_layout("Pump").create_ldata(name)`.
- **"Description" replaces "source".** The input of `register_layout` is called descriptions: a description file, a description object, or a list of them. The type `Layout_Source` is removed; use `string | Layout_Description`. The error texts that spoke of sources now speak of descriptions.
- **Layout names must be identifiers.** A layout name that is not a JavaScript identifier is now reported at registration. Before, it was reported only by `render_types`.

### Fixes

- **`init_value` may be omitted, as the spec says.** Before, registration refused a tag without one. Now only a given `init_value` is checked. A tag without one has no `init_value` in `layout.items`, and in a data block it starts at `0` (`false` for a `Bool`). A combined word and its bits with no value on either side have none either. In the declarations `Layout_Tag.init_value` is now optional.

## v0.4.0 (中文)

### 破坏性变更

- **布局在登记域中注册，没有默认登记域。** `create_scope(name)` 创建一个布局名的登记域，`get_scope(name)` 取得已创建的登记域。登记域名是 JavaScript 标识符，在进程内唯一。每个登记域有 `register_layout(descriptions)`，每个登记域只能调用一次，规则与原来相同：布局整体校验，要么全部登记，要么都不登记，失败的调用不会用掉这一次。登记域还有 `get_layout(name)` 和 `render_types(options)`，后者为该登记域的全部布局生成类型。布局名和片段名只在登记域内唯一，所以两个库可以各自注册自己的布局，应用可以同时使用它们。全局的 `register_layout`、`get_layout`、`render_types` 已取消。错误信息以 `登记域名.布局名` 指出布局，例如 `unknown layout lib_a.Pump`。迁移：`register_layout(d)` 改为 `create_scope("app").register_layout(d)`，`get_layout("Pump")` 改为 `scope.get_layout("Pump")`，`render_types(layouts, options)` 改为 `scope.render_types(options)`。
- **由布局创建 ldata。** `layout.create_ldata(name)` 是创建 ldata 的唯一方式。`new Ldata(...)` 抛出 `TypeError`，类型声明中它的构造函数是私有的。`Ldata` 仍然导出，供 `instanceof`、类型标注和 `Ldata.on_access` / `off_access` 使用。布局现在是带方法的对象：`create_ldata(name)`；`io_index_table(endian)`，取代导出的函数 `io_index_table(layout, endian)`；以及 `scope`。迁移：`new Ldata("Pump", name)` 改为 `scope.get_layout("Pump").create_ldata(name)`。
- **"描述"取代"来源"。** `register_layout` 的输入称为描述：描述文件、描述对象，或它们组成的列表。类型 `Layout_Source` 已移除，改用 `string | Layout_Description`。原来提到 sources 的错误信息改为 descriptions。
- **布局名必须是标识符。** 不是 JavaScript 标识符的布局名现在在注册时就报告。原来只有 `render_types` 才会报告。

### 修复

- **`init_value` 可以省略，与规范一致。** 原来注册会拒绝没有初值的 tag。现在只校验给出的 `init_value`。没有初值的 tag 在 `layout.items` 中没有 `init_value`，在数据块中从 `0` 开始（`Bool` 为 `false`）。组合字与它的组成位双方都不给出初值时，都没有初值。类型声明中 `Layout_Tag.init_value` 改为可选。

## v0.3.0

### Breaking changes

- **`access` is gathered in a transaction.** Inside `transaction(fn)` no `access` is emitted at once: the tags read and the tags written are gathered apart, and at the end at most one `access` of kind `read` and one of kind `write` are emitted, each with its tags in layout order and without repeats. At commit they come before the `change` events and `write`; on rollback only the `read` one is emitted, as those reads did happen, and the undone writes report nothing. The exceptions of `access` listeners follow the rules of the other handlers at commit, and are dropped on rollback.
- **`read_bit` is a reserved name.** A layout with a tag named `read_bit` no longer registers. Before 1.0 the list of reserved names may still grow; from 1.0 on new members are added only as `Symbol`-keyed members or static methods.

### Features

- **`read_bit(offset, mask)`** reads the bits of a byte selected by `mask` and returns `true` when any of them is set. Its `access` names only the Bools whose bit is read, as `write_bit` does for writes, instead of every tag of the byte as `read_bytes` would.

### Packaging

- `yaml` is no longer bundled: it is a run-time dependency, and the package ships `src` as is, with the declarations in `dist/types`.

## v0.3.0 (中文)

### 破坏性变更

- **事务内汇总 `access`。** 在 `transaction(fn)` 内不再立即发出 `access`：被读的 tag 和被写的 tag 分别汇总，结束时最多发出一次 `read` 类和一次 `write` 类的 `access`，tag 按布局顺序且不重复。提交时它们先于 `change` 事件和 `write`；回滚时只发出 `read` 类，因为那些读确实发生了，被撤销的写不报告。`access` 监听函数的异常在提交时与其他处理器的规则相同，回滚时丢弃。
- **`read_bit` 成为保留名。** 含名为 `read_bit` 的 tag 的布局不再能注册。1.0 之前保留名清单仍可能增加；从 1.0 起新成员只以 `Symbol` 键成员或静态方法的形式加入。

### 功能

- **`read_bit(offset, mask)`** 读取一个字节中由 `mask` 选中的位，任一位置位即返回 `true`。它的 `access` 只列出被读位的 Bool，与 `write_bit` 对写的处理一致，而不像 `read_bytes` 那样列出该字节的所有 tag。

### 打包

- 不再内置 `yaml`：它成为运行时依赖，包直接发布 `src`，类型声明在 `dist/types`。

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
