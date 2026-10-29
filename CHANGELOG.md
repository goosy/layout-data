# Changelog

## v0.6.0

### Breaking changes

- **Descriptions are YAML only, compiled when read.** `yaml` and `desc_file` (renamed from `yaml_file`) read a description, its imports included, then traverse, validate and compile it. They throw every error at the call, as an `Error` with `errors`. They return a deeply frozen `Description`: the parsed root, with `layouts` replaced by the compiled layouts, not yet bound to a scope, and `blocks` made `[]` when absent; the other root keys are kept as they are. Description objects are no longer taken, and the types `Layout_Description`, `Tag_Item`, `Include_Item` and `Layout_Item` are no longer exported. Write descriptions as YAML (JSON is valid YAML), and `Description`, `Layout_Desc` and `Block_Desc` type the results.
- **Every description is self-contained.** A description uses only its own item tables and those it imports with `imports`; descriptions given together are no longer merged. Item table names need to be unique only within a description and its imports.
- **`scope.register_layout` becomes `scope.load`, callable any number of times.** A layout of the same structure and name as one in the scope is reused. The same name with another structure, or the same structure under another name, is an error. A call takes effect all or none. The result is `{ layouts, ldata }`; `tables` is gone. The error title is `invalid descriptions of scope X`.
- **An ldata name is unique within its layout.** `create_ldata` throws `ldata X.Y.Z already exists` for a name the layout already uses.
- **`render_types` of `layout-data/dev` takes Descriptions.** It combines their layouts by the rules of `load` into one empty scope, and creates no scope.
- Migration: ``scope.register_layout(yaml_file`pump.yaml`)`` becomes ``scope.load(desc_file`pump.yaml`)``. Common item tables are imported where they are used (`imports: [common.yaml]`) instead of being registered in the same call.

### Features

- **`imports`** lists the description files whose item tables a description uses. Imports are transitive, a file counts once, and only the item tables reached from `layouts` are read. A relative path is relative to the importing file; YAML text written in code imports by absolute path or `file:` URL.
- **`blocks`** lists the ldata of a description, each with a `name` and a `layout`, a layout name of the same description. `load` creates them in the scope the description is loaded into and returns them as `ldata`. Their other keys are left to the application.
- **A layout manages its ldata by name.** `layout.get_ldata(name)` finds one, and `layout.delete_ldata(name)` gives the name back so that it can be used again, for example by an application that rebuilds its instances in the same process.
- A description may list no layout, for example a file of common item tables.

## v0.6.0 (中文)

### 破坏性变更

- **描述只用 YAML，读入时即编译。** `yaml` 和 `desc_file`（由 `yaml_file` 改名）读取一份描述及其引入的描述，并完成遍历、校验和编译。所有错误都在调用处一并抛出，是带 `errors` 的 `Error`。返回深度冻结的 `Description`：即解析出的根对象，其中 `layouts` 换成编译好、尚未绑定登记域的布局，`blocks` 缺省时补为 `[]`，其余根键原样保留。不再接受描述对象，类型 `Layout_Description`、`Tag_Item`、`Include_Item` 和 `Layout_Item` 不再导出。描述改用 YAML 编写（JSON 也是合法的 YAML），结果的类型是 `Description`、`Layout_Desc` 和 `Block_Desc`。
- **每份描述自包含。** 一份描述只使用自己的条目表，以及用 `imports` 引入的条目表；一起给出的多份描述不再合并。条目表名只需在一份描述及其引入范围内唯一。
- **`scope.register_layout` 改名为 `scope.load`，可以多次调用。** 登记域中已有结构和名字都相同的布局时复用它；名字相同而结构不同，或结构相同而名字不同，都是错误。一次调用要么全部生效，要么全不生效。返回值是 `{ layouts, ldata }`，不再有 `tables`。错误标题改为 `invalid descriptions of scope X`。
- **ldata 名在它的布局内唯一。** 名字已被该布局使用时，`create_ldata` 抛出 `ldata X.Y.Z already exists`。
- **`layout-data/dev` 的 `render_types` 接受 `Description`。** 它按 `load` 装入同一个空登记域的规则合并各描述的布局，不创建登记域。
- 迁移：``scope.register_layout(yaml_file`pump.yaml`)`` 改为 ``scope.load(desc_file`pump.yaml`)``。公共条目表在使用它的描述中引入（`imports: [common.yaml]`），不再放在同一次调用里一起注册。

### 功能

- **`imports`** 列出一份描述要使用其条目表的描述文件。引入可以传递，同一个文件只算一次，只读取从 `layouts` 出发遍历到的条目表。相对路径相对于引入方文件；写在代码里的 YAML 文本用绝对路径或 `file:` URL 引入。
- **`blocks`** 列出一份描述的 ldata，每个块有 `name` 和 `layout`（本描述的布局名）。`load` 在描述装入的登记域中创建它们，并以 `ldata` 返回。块的其他键留给应用。
- **布局按名管理它的 ldata。** `layout.get_ldata(name)` 按名找到 ldata，`layout.delete_ldata(name)` 交还名字，使它可以再次使用，例如供在同一进程里重建实例的应用使用。
- 描述可以不列出布局，例如只放公共条目表的文件。

## v0.5.0

### Breaking changes

- **A description lists its layouts and holds item tables under `item_tables`.** The root key `layouts` is now a list of layout names, and the root key `item_tables` maps names to item tables, lists of items; every layout is an item table. An item table may be a layout and be referenced by `includes` or `coupling` as well. The package uses no other root key, so they may hold anything and never collide with an item table name. Only the item tables reached from `layouts` are read, validated and returned; the result of `register_layout` gives them as `tables`, which replaces `fragments`. The description format has its own specification, doc/spec-description.md. Migration: `layouts: { Pump: [...] }` becomes `layouts: [Pump]` plus `item_tables: { Pump: [...] }`, fragments move under `item_tables`, and `fragments` of the result becomes `tables`.
- **Registration takes description objects only.** `register_layout` and `render_types` of `layout-data/dev` take a description object or a list of them, and read no file. Migration: `register_layout("pump.yaml")` becomes ``register_layout(yaml_file`pump.yaml`)``, and the same for `render_types`.

### Features

- **`yaml` and `yaml_file` make description objects from YAML 1.2.** Both are exported by `layout-data` and work as template tags or as plain calls. `yaml` parses YAML text written in code. `yaml_file` reads a description file given by a path or a `file:` URL, for example `yaml_file(new URL("./pump.yaml", import.meta.url))` in a library. As tags they take the raw text, so escapes are those of YAML double-quoted strings. A read or parse error throws at the call, as an `Error` with `errors`. A description read by `yaml_file` remembers its file, so registration errors and the header of rendered types still name it.
- The command `layout-types` reports the read and parse errors of all its files together.

## v0.5.0 (中文)

### 破坏性变更

- **描述列出它的布局，条目表放在 `item_tables` 下。** 根键 `layouts` 现在是布局名的列表，根键 `item_tables` 是名字到条目表（条目的列表）的映射，每个布局是一个条目表。条目表可以既是布局，又被 `includes` 或 `coupling` 引用。本包不使用其他根键，所以它们可以存放任何内容，也不会与条目表名冲突。只有从 `layouts` 出发能到达的条目表才会被读取、校验和返回；`register_layout` 的结果以 `tables` 给出它们，取代 `fragments`。描述格式有了单独的规范 doc/spec-description.md。迁移：`layouts: { Pump: [...] }` 改为 `layouts: [Pump]` 加上 `item_tables: { Pump: [...] }`，原来的片段移入 `item_tables`，结果中的 `fragments` 改为 `tables`。
- **注册只接受描述对象。** `register_layout` 和 `layout-data/dev` 的 `render_types` 接受一个描述对象或描述对象的列表，不再读取文件。迁移：`register_layout("pump.yaml")` 改为 ``register_layout(yaml_file`pump.yaml`)``，`render_types` 同样修改。

### 功能

- **`yaml` 和 `yaml_file` 由 YAML 1.2 生成描述对象。** 二者由 `layout-data` 导出，既可以作模板标签，也可以普通调用。`yaml` 解析写在代码中的 YAML 文本。`yaml_file` 读取由路径或 `file:` URL 指定的描述文件，例如在库中写 `yaml_file(new URL("./pump.yaml", import.meta.url))`。作为标签时它们取原始文本，所以转义是 YAML 双引号字符串的转义。读取或解析出错时在调用处抛出带 `errors` 的 `Error`。由 `yaml_file` 读取的描述记得它的文件，所以注册错误和生成类型的文件头仍然写出文件名。
- 命令 `layout-types` 把所有文件的读取和解析错误一起报告。

## v0.4.1

### Development entry

The run-time API is unchanged. Type rendering moves out of it, which breaks only code that renders the types:

- **Types are rendered from descriptions in the new entry `layout-data/dev`.** `render_types(descriptions, options)` takes the descriptions that `register_layout` takes, registers them in a scope of its own and renders all their layouts; `options.scope` names the scope in the header example (`"app"` by default). The same file is the command `layout-types`, for example `pnpm exec layout-types pump.yaml --scope app -o layout_types.d.ts`. The command needs Node.js >= 24.2; an earlier Node.js gets an explanatory error. The function `render_types` and the run-time entry need only Node.js >= 20.11.
- **`scope.render_types(options)` and the option `ldata_module` are removed.** The rendered text always imports `Ldata` from `"layout-data"`. Migration: replace `scope.render_types(options)` with `render_types(descriptions, { scope })` imported from `"layout-data/dev"`, and drop `ldata_module`.

### Packaging

- The two entries are bundled each on its own into `dist/index.js` and `dist/dev.js`, with `yaml` and the Node.js built-in modules left as imports. Only `dist` is published, with the declarations beside the bundles; `src` is no longer shipped. The run-time bundle contains no code of the development entry.

## v0.4.1 (中文)

### 开发期入口

运行时 API 不变。类型生成移出运行时，只影响生成类型的代码：

- **在新入口 `layout-data/dev` 中由描述生成类型。** `render_types(descriptions, options)` 接受与 `register_layout` 相同的描述，把它们登记在自己的登记域中，并生成其全部布局的类型；`options.scope` 是文件头示例中使用的登记域名（默认 `"app"`）。同一个文件也是命令 `layout-types`，例如 `pnpm exec layout-types pump.yaml --scope app -o layout_types.d.ts`。该命令需要 Node.js >= 24.2，更早的 Node.js 会得到说明原因的错误。函数 `render_types` 和运行时入口只需要 Node.js >= 20.11。
- **移除 `scope.render_types(options)` 和选项 `ldata_module`。** 生成的文本总是从 `"layout-data"` 导入 `Ldata`。迁移：把 `scope.render_types(options)` 改为从 `"layout-data/dev"` 导入的 `render_types(descriptions, { scope })`，并去掉 `ldata_module`。

### 打包

- 两个入口各自打包为 `dist/index.js` 和 `dist/dev.js`，`yaml` 和 Node.js 内置模块保留为导入。只发布 `dist`，类型声明与打包文件并列；不再发布 `src`。运行时打包文件不含开发期入口的代码。

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
