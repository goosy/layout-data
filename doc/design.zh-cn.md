# layout-data 设计

> 需求见 [spec.zh-cn.md](spec.zh-cn.md)，编程接口见 [spec-layout.zh-cn.md](spec-layout.zh-cn.md)（布局）和 [spec-data-api.zh-cn.md](spec-data-api.zh-cn.md)（数据对象）。本文说明实现。

## 1. 源文件

| 文件 | 职责 |
| --- | --- |
| `src/index.js` | 包的公开接口 |
| `src/Ldata.js` / `src/Ltag.js` | 数据对象与 tag 句柄；`Ldata.js` 还构建各布局的 Ldata 子类及其原型访问器 |
| `src/layout.js` | 描述的读取与合并、布局的编译、`Layout` 类 |
| `src/structure.js` | 结构展开（`build_structure`）与布局校验（`validate_structure`）；内部使用，包不导出 |
| `src/dispatch.js` | `emit_all`：调用一个事件的每个监听函数，收集它们抛出的异常（内部使用，包不导出） |
| `src/reserved.js` | 保留的 tag 名与保留的事件名的静态清单（内部使用，包不导出） |
| `src/codecs.js` | 各类型在大端缓冲区上的编解码 |
| `src/observer.js` | 快照比对，变化事件 |
| `src/endian.js` | 单个条目和整块数据的设备字节序转换（内部使用，包不导出） |
| `src/types.js` | 由布局生成 TypeScript 类型声明（`render_types`） |
| `src/typedefs.js` | 公开类型的 JSDoc 定义（类型的唯一来源，无运行时内容） |
| `dist/types/` | 构建时由 `tsc` 从 JSDoc 生成的声明文件（`tsconfig.json`），不入库 |
| `type_check/consumer.ts` | 类型测试：以包名导入生成的声明，用 `Equal` 断言和 `@ts-expect-error` 检查公开接口（`pnpm test:types`，已包含在 `pnpm test` 中） |

## 2. 组成

| 部分 | 职责 | 实例数 | 可变性 |
| --- | --- | --- | --- |
| Layout | 由布局定义编译而来：公开的 `name`、`length`、`size`、`items` 和方法 `create_ldata`、`io_index_table`；私有的编译数据（各 tag 的字节位置、编解码、字节到 tag 的反查表）和该布局的 Ldata 子类 | 每种结构一个 | 不可变 |
| Ldata | 值缓冲区（私有，大端）、按名访问、原始读写方法、`get(name)` 返回的 Ltag | 每个 ldata 一个 | 可变 |
| Observer | 快照比对，发出变化事件 | 每个 ldata 一个 | 可变 |

依赖方向：Layout 依赖描述和 Ldata（它构建子类、创建 ldata）；Ldata 使用 Layout 在构建子类时交给它的布局和编译数据，`Ldata.js` 不引用 `layout.js`，不成环；Observer 只使用 Ldata 交给它的缓冲区和编译数据。使用方的调度和 IO 在包之外，包只通过 Ldata 的 `write` 事件通知它们，任何一方都可以监听。

### 2.1 组件边界

- 包代码不依赖使用方的配置、业务和日志器；
- 出错时抛出异常，不写日志、不调用 `process.exit`；
- 描述对包是外部输入：使用方按路径给出描述文件，或直接给出描述对象。

## 3. 描述与注册

公开的术语（描述、描述文件、描述对象、布局定义、片段、布局）见 spec.zh-cn.md §2。注册要经过几个阶段，各阶段的产物是内部的，本文这样称呼它们：

| 术语 | 含义 | 代码中 |
| --- | --- | --- |
| 合并描述 | 一次注册的所有描述合并而成的那一份描述 | `register_layout_data` 的 `root` |
| 结构 | 解析了片段引用、展开为扁平条目的布局定义 | `Data_Struct`，由 `build_structure` 生成 |
| 编译数据 | `Ldata` 需要而公开的 Layout 不展示的部分：`entries` 和 `tags_at_byte` | `Compiled_Layout`，Layout 的私有字段 `#compiled` |

- 描述是描述文件（YAML 1.2）或同样结构的描述对象：根键 `layouts` 把布局名映射到布局定义（条目列表）；其余根键都是片段，由条目按名称引用。
- 每个条目包含 `{ name, type, offset, init_value }`，可选 `length`、`comment`；`offset` 和 `length` 的单位都是位（bit），`length` 省略时由类型决定。
- 组合字与组成位只由一方给出 `init_value`：`build_structure` 展开时，组合字未给出则由组成位合成（未给出的位为 false），组合字给出则组成位的值从整字拆出；双方都给出时保留给出的值，由校验报告。
- `type` 取值（大小写不敏感）：`Bool`、`Byte`、`SInt`、`USInt`、`Int`、`UInt`、`Word`、`DInt`、`UDInt`、`DWord`、`Real`。
- `Word` 条目带 `coupling`（片段名或内联列表）时，表示由若干 Bool 组成的状态字或命令字；`is_combined: true` 只是说明性标记：整字与各位共用同一块字节，联动不依赖它。coupling 内各项的 `offset` 相对于该字的起点。
- `{ includes: <片段名或内联列表>, offset }` 把一组公共条目整体偏移后拼接进来，可加 `name_prefix`。
- `register_layout(descriptions)`（spec-layout.zh-cn.md §5）由模块标志 `registered_once` 守护：标志已置位时抛出 `Error`，只有 `register_descriptions` 成功返回之后才置位，所以失败的调用不会置位。实际工作由 `register_descriptions(descriptions)` 完成，它是内部函数，测试调用的就是它，因为测试在一个进程里要注册很多次。
- `register_descriptions(descriptions)` 把各描述整理成合并描述并交下去。第一阶段：按列表顺序读取每份描述，描述文件（字符串）用 `readFileSync` 和 `parseDocument`（YAML 1.2）读取，描述对象原样使用；读取或解析错误、根不是映射、`layouts` 不是映射，都带着出处（路径，或第 i 个对象的 `layout description #i`）进入 `errors`。各描述的布局和片段分别合并为一张表；名字已被前面的描述占用时报错并写出两处出处（`owners` 记着每个名字的出处）。空列表、列表里再放列表、合并后没有任何布局都是错误。发现的所有问题一起作为带 `errors` 的 `Error` 抛出。
- `register_layout_data(root, origin)` 是第二阶段，接收合并描述（`root`，`{ layouts, ...fragments }`，spec-layout.zh-cn.md §2），登记其中的布局并返回 `{ layouts, fragments }`。它报告每个不匹配 `IDENTIFIER`（`structure.js`）的布局名，在 `resolve_items` 中解析片段引用（不存在或循环引用时报错）并补全省略的 `length`，`resolve_items` 复制每个条目和嵌套列表，所以传入的描述从不被修改。再对每个布局调用 `build_structure` 展开为扁平的 `items`（计算结构总长 `length`，把 coupling 规范为名称数组），校验每个结构，检查与已登记布局的冲突（`find_conflicts`），然后才用 `register_structure` 把它们全部登记，所以一份描述要么全部登记，要么都不登记。除了测试辅助函数 `one_tag` 为了随意补齐数据块而直接调用 `register_structure` 之外，没有任何路径会登记未经校验的布局。
- 每个布局编译为一个 Layout（`register_structure`）。`Layout` 是 `layout.js` 里的类，实例深度冻结（构造函数最后 `Object.freeze(this)`），公开的属性只有 `name`、`length`、`size`、`items`（spec-layout.zh-cn.md §7），其中 `items` 是展开后条目的冻结副本，只含文档规定的字段；方法 `create_ldata` 和 `io_index_table` 在原型上，所以 `{ ...layout }` 只复制这四个属性。编译结果，即按名称索引的条目表 `entries`（字节偏移、位掩码、编解码）和字节到 tag 的反查表 `tags_at_byte`，存放在私有字段 `#compiled`，从不作为属性出现，所以公开接口里不出现 entry。
- 构造 Layout 时就调用 `Ldata.js` 的内部函数 `build_ldata_class(layout, compiled)` 构建该布局的 Ldata 子类（§4），存放在私有字段 `#ldata_class`，不公开，以免使用方拿它直接 `new`。`create_ldata(name)` 调用 `Ldata.js` 的内部函数 `new_ldata(#ldata_class, name)`（§5）；`io_index_table(endian)` 把 `size` 和 `#compiled` 交给 `endian.js` 的同名内部函数（§6）。tag 访问器要读写 `Ldata` 的私有缓冲区，所以子类在 `Ldata` 的类体内构建，由 `Ldata.js` 向布局提供这两个内部函数；`layout.js` 依赖 `Ldata.js`，`Ldata.js` 不依赖 `layout.js`。
- Layout 的构造函数要求 `layout.js` 模块私有的键 `CREATE_KEY`，否则抛出 `TypeError`，所以布局只由注册产生，`new layout.constructor(...)` 也不行。类型声明中构造函数是私有的（JSDoc `@private`），`typedefs.js` 的 `Layout` 引用这个类，包只导出该类型，不导出类。测试通过 `layout.js` 的内部函数 `compiled_of(layout)` 读取编译数据：Layout 的静态初始化块把读取私有字段的函数交给模块，对不是 Layout 的对象抛出 `X is not a registered layout`。
- 同一份描述内的布局名互不相同（它们是 `layouts` 的键）。
- 已编译的布局按布局名保存在登记表中（`registry.js`，它不引用任何模块，由 `layout.js` 写入，`get_layout` 读取）。`register_structure(struct)` 计算展开后结构的规范文本（`name`、`length`、`items`；对象键排序，不含 `comment`，类型名小写）。该名字已登记且文本相同，就返回已登记的 Layout；文本不同则抛出 `another layout is already named X`。`register_layout_data` 在登记任何一个之前先检查描述里的每个布局有无这种冲突，所以一份描述要么全部登记，要么都不登记。公开的 `register_layout` 只登记一次（见上），所以这两条规则只对内部函数有意义，测试会多次调用它们。`get_layout(name)` 返回已登记的布局，没有则抛出 `unknown layout X`。登记表不会清空：布局名在进程的整个生命期内有效。
- Bool 的定位规则：`byte = offset >> 3`，`bit = offset % 8`。内部缓冲按大端存放，一个字的第一个字节是寄存器的高字节，所以 coupling 中偏移 8–15 对应寄存器的 bit0–7，偏移 0–7 对应 bit8–15。布局文件按 8–15、0–7 的顺序列出，就是按寄存器 bit0 到 bit15 的顺序排列。

### 3.1 布局校验

布局规则在布局阶段集中校验，不分散到 Ldata 和 Ltag 的运行时：

- `validate_structure(data_struct)` 对 `build_structure` 展开后的扁平 `items` 做校验，返回违规描述的数组（空数组表示合法），不在发现第一个错误时退出。它是内部函数。
- 校验内容：
  - 名称：不是匹配 `TAG_NAME`（`/^[A-Za-z_][A-Za-z0-9_]*$/`，各种语言和 PLC 都认的 ASCII 标识符）的字符串，所以 YAML 里的数字、空名、缺少 name 都在这里失败；`items` 中名称重复；名称与 Ldata 的成员（`Ldata.prototype` 上的方法、getter，以及 `name` 等实例字段）冲突。
  - 类型与长度：`type` 不在支持的类型中；`length` 与类型不符（Bool 1，Byte / SInt / USInt 8，Int / UInt / Word 16，DInt / UDInt / DWord / Real 32）。
  - 对齐：非 Bool 的 `offset` 必须是 8 的倍数；多字节类型的字节偏移必须是偶数。
  - 重叠：把非 Bool 条目按字节区间排序后检查相邻区间是否相交；Bool 按 `offset` 检查是否重复占用同一位；Bool 落在某个非 Bool 区间内时，要求该 Bool 条目的 `coupling`（展开后是它所属组合字的名称数组）包含这个非 Bool 条目的名称。
  - 组合字：带 `coupling` 的条目，其每个组成位必须存在、是 Bool，且 `offset` 都在 `[offset, offset + length)` 内。
  - 总长：`length % 16 === 0`。
  - `init_value` 的类型与取值范围与 `type` 相符。
  - 组合字与它的组成位不同时给出 `init_value`（展开时记录冲突，由校验报告）。
- `build_structure` 遇到重名或不合法的名字时保留条目，交给校验报告。只有纯包含条目（有 `includes` 且没有 name）才会被丢弃；其余条目都是 tag，所以缺少 name 的 tag 条目会被报告，不会丢失。名称前缀只加在字符串类型的名字前。
- `register_layout` 对全部描述中的布局调用校验，有违规时抛出包含全部违规项的错误（`error.errors`）。
- 校验通过后，Ldata 和 Ltag 不重复做这些检查；`register_structure` 只保留防御性断言。

## 4. 编解码与原型访问器

- 编解码表 `codecs.js` 中每种类型有一项，`get(buffer, byte, mask)` 从大端缓冲区解码，`set(buffer, byte, mask, value)` 编码写入；设备字节序不在表中处理。
- 每个布局在编译时构建一个 Ldata 子类（`Ldata.#build_class(layout, compiled)`，Ldata 的静态初始化块把它交给模块函数 `build_ldata_class`），在其原型上为每个条目定义一次访问器，同一布局的实例共用。子类由它的 Layout 私有保存（§3），`Ldata.js` 不按名字索引子类。子类的构造函数是 `(key, name)`，把它所属的布局和编译数据交给 `super`（§5），没有公开的静态属性。访问器：
  - getter 每次用编解码表从 `buffer` 解码，不缓存值；
  - setter 用编解码表写入 `buffer`，再调用 `after_write`。
- 组合字与它的组成位共用同一块字节，写任何一方，另一方读到的自然是新值，不需要额外联动。
- tag 名不得是保留名（spec-data-api.zh-cn.md §2.10），否则访问器会遮蔽成员。保留名是 `reserved.js` 里的静态集合：Ldata 的成员、Node.js 20.11 中 EventEmitter 的方法名与字段名、`Object.prototype` 的名字。运行时不做任何探测，所以集合不随 Node.js 版本而变。`reserved.js` 导出 `is_reserved_name(name)`，只供 `structure.js` 和 `Ldata.js` 使用；包不导出它，Ldata 也没有对应的静态方法。`validate_structure` 报告保留名，`Ldata` 构建子类时也会抛出错误。测试把该集合与运行中的 Node.js 里实例上能找到的名字比对，所以 EventEmitter 新增成员会使测试失败，那时再扩充集合。
- 保留的事件名（`change`、`write`、`read`）是 `reserved.js` 里的常量 `RESERVED_EVENTS`，供测试和文档使用；这是对使用方的规则，运行时不强制。`Ldata` 和 `Ltag` 覆盖 `on`、`once`、`off`（各自只调用 `EventEmitter` 的同名方法），仅为携带带类型的重载：处理器类型由事件名通过 `typedefs.js` 里的条件类型 `Data_Listener<E>` 和 `Tag_Listener<E>` 决定，所以 `change`、`write` 的处理器写错是编译期错误，其他名字可以用任意处理器。从 1.0 起，以后给 Ldata 增加的成员只用 `Symbol` 为键或静态方法。
- `access` 事件（spec-data-api.zh-cn.md §2.8）取代了原来的全局函数 `set_access_tracer`。监听器有两种。实例监听器是数据块的 `EventEmitter` 上的监听器；类监听器单独存放在 `Ldata.js` 模块私有的一个 `Set` 里（`Ldata.on_access` 和 `Ldata.off_access` 往里加、从里删），所以 `removeAllListeners()` 或任何对实例的调用都碰不到它们。在构造任何东西之前，`#has_access_listeners()` 判断 `class_access_listeners.size > 0 || this.listenerCount("access") > 0`，所以没有监听器的数据块，每次访问只多一次开销很小的检查。实例部分不缓存成由 `newListener`、`removeListener` 事件维护的标志，因为 `removeAllListeners()` 会把这两个内部监听器一起移除，标志就会出错；类部分由 `Set` 自己计数，而它只被两个静态方法改动。`#emit_access(kind, tags, errors)` 先通过 `emit_all` 调用实例监听器，再调用类监听器（各自在自己的 `try` 里，参数是 `(this, kind, tags)`），它们抛出的东西推入 `errors`。模块标志 `in_access` 在这两次调用期间置位，监听器自己在此期间对任何 ldata 的访问都不触发。读取在监听器都调用完之后抛出 `errors[0]`；写入把 `errors` 交给 `#written()`，它在 `touch()` 之后、检测之前发出 `access`，最后才抛出第一个错误，这样缓冲区、快照和事件始终一致。tags 是 `get(name)` 的句柄（用到时才创建）：按名访问是那一个 tag；字节范围则由 `#tags_in(start, end, mask)` 遍历 `tags_at_byte`，去重、去掉位不在 `mask` 内的 Bool，并按条目的序号排序。
- `render_types(layouts, { source, ldata_module })`（spec-layout.zh-cn.md §8）由布局生成类型声明：每个布局一个接口 `<布局>_Tags`（每个 tag 一个属性）和类型 `<布局>_Ldata = Ldata & <布局>_Tags`。布局名原样使用，不做大小写折叠（大小写风格由调用者决定），所以类型名就是 `get_layout("<布局>")` 里的名字，名字不同就不会冲突；`layouts` 的每个键都必须匹配 `IDENTIFIER`，即注册时检查布局名用的那个表达式，否则把所有不合格的键一起放进同一个 `Error` 的 `errors` 抛出。`IDENTIFIER` 使用 Unicode 属性 `ID_Start` 和 `ID_Continue`（加上 `_`、`$`），任何文字的名字都能接受。tag 名原样写出，因为校验已经保证它们是标识符。`doc_comment` 把 `comment` 写成单行或多行文档注释，并转义 `*/`。选项有默认值（`ldata_module` 是 `"layout-data"`，没有 `source` 时头部不写文件名），头部注释给出为值指定类型的 JSDoc 类型转换写法。`create_ldata` 的返回类型是 `Ldata`：同一个方法的声明不能随布局返回不同的类型。

## 5. Ldata

- ldata 只由 `layout.create_ldata(name)` 创建（spec-data-api.zh-cn.md §2.1），它调用 `new_ldata(Layout_Data, name)`，即以 `Ldata.js` 模块私有的键 `CREATE_KEY` 构造布局的子类（§4）。`Ldata` 的构造函数是 `(key, name, layout, compiled)`：在调用 `super()` 之前，先检查 `key` 是 `CREATE_KEY`，否则抛出 `TypeError`（信息是 `an ldata is created by its layout: layout.create_ldata(name)`），再检查 `name` 是字符串（`TypeError`）。所以 `new Ldata(...)` 和对子类（例如 `data.constructor`）使用 `new` 都抛出错误；类型声明中构造函数是私有的（JSDoc `@private`），TypeScript 中既不能 `new` 也不能继承。`Ldata` 本身不会是任何实例的直接类。实例分配 `buffer`（`layout.size` 字节），按条目的 `init_value` 依次编码写入。
- `name`、`layout`、`size` 都只读（只有 getter，赋值抛出 `TypeError`）；`name` 是私有字段 `#name`，构造函数在检查私有键之后、`super()` 之前检查它是字符串（`TypeError`），再赋值。Ldata 的 `setMaxListeners(100)` 和 Ltag 的 `setMaxListeners(20)` 固定写在各自的构造函数里。缓冲区是私有字段（`#buffer`），没有访问器，统一按大端存放；Observer 和事务所需的缓冲区由创建它们的 Ldata 传入。带类型的访问走 tag，不带类型的访问走字节：没有按宽度分类的原始方法。
- 写缓冲区有两种途径，都经过 Ldata，任何时候都允许：

  | 途径 | 使用者 |
  | --- | --- |
  | 按名赋值（`data[name] = v` 或 `tag.value = v`） | 任何代码 |
  | 原始方法 `write_bytes(offset, source)`、`write_bit(offset, mask, value)`，以字节偏移定位 | 与寄存器地址打交道的代码，如 Modbus 服务端，以及 IO 层 |

- `read_bytes(offset = 0, length = size - offset)` 返回一段字节的副本（`Buffer.from(buffer.subarray(...))`），所以无法通过它改动缓冲区。
- 原始方法在碰缓冲区之前先检查参数，出错时数据不变，也不会走到 `#written()`：`offset`、`length` 须为整数，且 `0 <= offset`、`offset + length <= size`，`mask` 须为 1 到 0xff 的整数（`RangeError`），`source` 须为 `Uint8Array`（`TypeError`）。`write_bytes` 用 `buffer.set(source, offset)` 复制。原始写入把它碰过的字节范围登记给 Observer（§5.1）。
- `load_tag(name, io_buffer, endian)` 和 `store_tag(name, io_buffer, endian)`（spec-data-api.zh-cn.md §2.9）把 `name` 解析为布局的编译条目（名字不存在时抛出 `Error`），检查 `endian`、`io_buffer` 和该条目在其中的范围（`io_range`），再以私有缓冲区调用 `endian.js` 的 `load_entry` / `store_entry`。`load_tag` 登记该条目的字节范围，像任何写入一样以 `#written()` 结束；`store_tag` 只读缓冲区。`Ltag.load(io_buffer, endian)` 和 `Ltag.store(io_buffer, endian)` 以 tag 名调用它们，所以 Ltag 不需要检查自己属于哪个 ldata。

- Ldata 出错时抛出异常（布局冲突、值被拒绝），不写日志、不退出。
- **值检查。** 每个编解码器在 `get`、`set` 之外有 `check(value)`：值可接受时返回 `null`，否则返回原因文字。tag 访问器的 setter 在 `codec.set` 之前调用它，所以被拒绝的值不会碰缓冲区和 Observer；`typeof value` 不是 `"number"` 时抛出 `TypeError`，是数字时抛出 `RangeError`（消息为 `<ldata 名>.<tag>: <原因>`）。`Bool` 总是返回 `null`。整型编解码器要求是数字、满足 `Number.isInteger` 并在类型范围内；`Real` 编解码器要求是数字，放过 `NaN` 和 `±Infinity`，拒绝绝对值超过 `FLOAT32_MAX`（`3.4028234663852886e38`，与 `structure.js` 的 `check_init_value` 用的值相同）的有限值。`Buffer.write*` 只作为最后一道防线，不当作检查。
- `data.get(name)` 返回该 tag 的 `Ltag`，首次访问时创建并缓存，名称不存在时返回 `undefined`。Ltag 不持有值：读 `value` 从 Ldata 的缓冲区解码，写 `value` 与 `data[name] = v` 完全等价；`name`、`type`、`size` 来自布局的编译条目，Ltag 私有地持有它，不对外公开；`change` 事件由 Observer 发出。

### 5.1 检测、事务与 Observer

所有写入路径最后都汇到 Ldata 的同一个私有方法：

```js
#written() {
    if (this.#transaction) { this.#transaction.written = true; return; }  // in a transaction: only remember
    this.#observer.diff();                                                // detect right now
    this.emit("write", this);                                             // then tell the listeners
}
```

- 事务之外，在写入语句内部同步调用 `diff()`，再发出 `write`。
- `diff()` 是内部方法，没有任何公开方法能触发检测。所有写入路径都经 `#written()` 到达它，所以在写入或事务之外，缓冲区与快照不会有差异。

**事务。** `transaction(fn)` 在已有事务时抛出 `Error`；否则复制一份缓冲区，登记事务状态 `{ written: false, read: Set, write: Set }`，同步调用 `fn()`：

- 访问：事务中 `#emit_access` 把 tags 加入状态的 `read` 或 `write` 集合，不调用监听器。只有 `#has_access_listeners()` 为真时才会走到这里，且 `in_access` 置位时它先返回，所以没有监听器时、监听器运行期间都不累积。结束时由 `#in_layout_order(tags)` 按条目序号排序；
- `fn` 正常返回：关闭事务，先发出累积的 `access` `read`，再发出累积的 `access` `write`，调用一次 `diff()`，`written` 为真时发出一次 `write`，返回 `fn` 的返回值（不检查它是否是 Promise）；
- `fn` 抛出异常：关闭事务，把副本写回缓冲区，只发出累积的 `access` `read`（其监听器抛出的异常丢弃），重新抛出原异常；
- Observer 的快照在事务中保持不动：提交时的 `diff()` 就是事务之前最近一次检测与现在之间的净变化；回滚后缓冲区回到事务开始时的内容，与快照重新一致；
- 事件在事务关闭之后发出，处理器中的写入和事务按普通情形处理；提交时处理器抛出的异常在全部事件和 `write` 派发完之后由 `transaction` 抛出（见下文派发），不回滚；
- 事务期间 Node.js 不运行别的 JS 代码，同一线程中没有其他代码能访问这个 ldata，所以事务不需要加锁或隔离；`written` 只是布尔标记，不计次数，因为 `write` 事件没有载荷之外的信息。

**快照比对。** Observer 持有与缓冲区等长的快照，创建时复制缓冲区。每条写入路径都知道自己写了哪一段字节，并把它登记给 Observer（`touch(start, end)`；事务中各段累计为一段）；`diff()` 只逐字节比较登记范围内缓冲区与快照的差异（其余字节按构造必然相等），并清除登记。只对不同的字节经反查表 `tags_at_byte` 找到相关 tag，从快照解码旧值、从 `buffer` 解码新值，值不同（两个 NaN 视为相同）的记为变化；比对完成后更新快照，再统一报告：

- 按布局顺序报告（组合字在其组成位之前），每个变化先由 Ldata 发出 `change(tagname, old, new)`，再由该 tag 的 Ltag 发出 `change(old, new)`；事件总在新值生效之后发出；
- 两次检测之间同一 tag 的多次写入合并为一个事件，值改变后又恢复的不发事件；
- 事件处理器中再写 tag 时，嵌套的比对只登记，等当前这一轮变化报告完再比对一轮；连续 16 轮仍有新变化时停止后续轮次，并把振荡异常记为这次派发的一个错误；
- **派发与错误**（spec-data-api.zh-cn.md §4.4）。`#written()` 和事务的提交各持有一个 `errors` 数组，依次传给 `diff(errors)` 和 `emit_all`；派发期间什么都不抛，直到最后。`dispatch.js` 中的 `emit_all(emitter, event, args, errors)` 对 `emitter.rawListeners(event)` 的每个函数在各自的 `try` 里以 `emitter` 为 `this` 调用，监听函数抛出的东西推入 `errors`；`once` 的包装函数照常在 `rawListeners` 里自行移除。Observer 对每个变化都调用 `report(entry, old, new, errors)`，即使其中一个抛出也不中止，因为一轮的变化在报告第一个之前就已收集完、快照也已更新。`diff(errors)` 之后，写入同样经 `emit_all` 发出 `write`，最后才在有错误时抛出 `errors[0]`。嵌套的 `diff()`（`#diffing`）只登记待处理的一轮，不推入任何错误。第一个异常原样抛出，不包装（不用 `AggregateError`），其余丢弃；
- 旧值从快照解码，不缓存任何值。

## 6. 字节序转换

`endian.js` 按编译条目实现设备字节序与内部大端之间的转换（`load_entry` / `store_entry` / `io_index` / `io_range`），并为整个数据块生成字节下标表（`io_index_table(block_size, compiled, endian)`），与设备整块交换的使用方可以据此直接按字节复制。包不导出这些函数：下标表由布局的方法 `io_index_table(endian)`（§3）传入大小和编译数据调用，其余由 Ldata 的 `load_tag` / `store_tag`（§5）传入私有缓冲区调用。下标表与 `load_entry` / `store_entry` 对每个条目的结果一致（有测试保证）。这些函数只接受 `BE`、`LE`、`BEBS`、`LEBS` 四种字节序（其他值抛出 `RangeError`，没有别名），都不检测变化：

- 2 字节：`BE` 原样复制；`LE` / `BEBS` 交换两个字节；
- 4 字节：支持 `BE`、`LE`、`BEBS`、`LEBS` 四种排列；
- Bool 和单字节类型（Byte、SInt、USInt）只读写一个字节，不做字节内转换；它在 IO 缓冲区中的下标按 16 位寄存器换算：`LE` / `BEBS` 时为 `byte ^ 1`，`BE` / `LEBS` 时为 `byte`。Bool 按位掩码只改自己的位。

## 7. 构建与测试

- `pnpm build`：`tsc` 从 JSDoc 生成 `dist/types` 中的声明文件（不使用打包工具：包直接发布 `src`，并依赖 `yaml`）；
- `pnpm bench`：`bench/change_detection_bench.js` 测量读取一个 86 个 tag、146 字节的数据块（从设备字节序缓冲装载每个 tag，并检测、报告变化）的开销。开发机上，在一个事务中对每个 tag 调用 `load_tag`，每周期无变化约 3.1–3.2 µs，少量变化 3.1–4.5 µs，全部变化 8.5–8.6 µs（每次 `load_tag` 还要检查一次是否有 `access` 监听器，86 个 tag 合计约 0.6 µs）；用 `layout.io_index_table` 按字节复制再一次 `write_bytes` 时分别约 0.4 µs、0.6–1.7 µs、5.7–5.9 µs；
- `pnpm test`：先构建，再运行类型测试和 `node --test`；`pnpm lint`：ESLint。
