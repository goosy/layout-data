# tagged-data 设计

> 需求见 [spec.zh-cn.md](spec.zh-cn.md)，编程接口见 [spec-data-api.zh-cn.md](spec-data-api.zh-cn.md)。本文说明实现。

## 1. 源文件

| 文件 | 职责 |
| --- | --- |
| `src/index.js` | 包的公开接口 |
| `src/TData.js` / `src/TTag.js` | 数据对象与 tag 句柄 |
| `src/layout.js` | 布局描述文件的读取与编译、Layout、原型访问器 |
| `src/structure.js` | 结构展开（`build_structure`）与布局校验（`validate_structure`） |
| `src/codecs.js` | 各类型在大端缓冲区上的编解码 |
| `src/observer.js` | 快照比对，变化事件 |
| `src/endian.js` | 单个条目和整块数据的设备字节序转换（只导出 `io_index_table`） |
| `src/types.js` | 由布局生成 TypeScript 类型声明（`render_types`） |
| `src/typedefs.js` | 公开类型的 JSDoc 定义（类型的唯一来源，无运行时内容） |
| `dist/types/` | 构建时由 `rolldown.config.js` 中的插件调用 `tsc` 从 JSDoc 生成的声明文件（`tsconfig.json`），不入库 |
| `type_check/consumer.ts` | 类型测试：以包名导入生成的声明，用 `Equal` 断言和 `@ts-expect-error` 检查公开接口（`pnpm test:types`，已包含在 `pnpm test` 中） |

## 2. 组成

| 部分 | 职责 | 实例数 | 可变性 |
| --- | --- | --- | --- |
| Layout | 由布局描述编译而来：各 tag 的字节位置、编解码、字节到 tag 的反查表、原型访问器 | 每种结构一个 | 不可变 |
| TData | 值缓冲区（私有，大端）、按名访问、原始读写方法、`get(name)` 返回的 TTag | 每个 tdata 一个 | 可变 |
| Observer | 快照比对，发出变化事件 | 每个 tdata 一个 | 可变 |

依赖方向：Observer 依赖 TData 与 Layout，TData 只依赖 Layout，Layout 只依赖布局描述。使用方的调度和 IO 在包之外，包只通过 TData 的 `write` 事件通知它们，任何一方都可以监听。

### 2.1 组件边界

- 包代码不依赖使用方的配置、业务和日志器；
- 出错时抛出异常，不写日志、不调用 `process.exit`；
- 布局描述对包是外部输入，由使用方提供文件路径。

## 3. 布局定义

- 布局描述是一个 YAML 1.2 文件：根键 `layouts` 映射布局名到条目列表；其余根键都是片段，由条目按名称引用。
- 每个条目包含 `{ name, type, offset, init_value }`，可选 `length`、`comment`；`offset` 和 `length` 的单位都是位（bit），`length` 省略时由类型决定。
- 组合字与组成位只由一方给出 `init_value`：`build_structure` 展开时，组合字未给出则由组成位合成（未给出的位为 false），组合字给出则组成位的值从整字拆出；双方都给出时保留给出的值，由校验报告。
- `type` 取值（大小写不敏感）：`Bool`、`Byte`、`SInt`、`USInt`、`Int`、`UInt`、`Word`、`DInt`、`UDInt`、`DWord`、`Real`。
- `Word` 条目带 `coupling`（片段名或内联列表）时，表示由若干 Bool 组成的状态字或命令字；`is_combined: true` 只是说明性标记：整字与各位共用同一块字节，联动不依赖它。coupling 内各项的 `offset` 相对于该字的起点。
- `{ includes: <片段名或内联列表>, offset }` 把一组公共条目整体偏移后拼接进来，可加 `name_prefix`。
- `compile_layout(yaml_path)` 同步读取文件，解析片段引用（不存在或循环引用时报错），补全省略的 `length`，再对每个布局调用 `build_structure` 展开为扁平的 `items`（计算结构总长 `length`，把 coupling 规范为名称数组）并校验，返回 `{ layouts, fragments }`。
- `compile_layout_data(root, origin)` 编译已解析的描述（与文件同结构），供在自己的文件中携带布局的使用方；`compile_layout` 读文件后调用它。
- 每个布局编译为一个 Layout（`register_layout`）。公开的 Layout 是深度冻结的 `{ name, length, size, items }`（spec-data-api.zh-cn.md §6.6），其中 `items` 是展开后条目的冻结副本，只含文档规定的字段。编译结果，即按名称索引的条目表 `entries`（字节偏移、位掩码、编解码）和字节到 tag 的反查表 `tags_at_byte`，存放在 `registry.js` 的模块私有 `WeakMap` 里，由 `TData`、Observer 和 `endian.js` 通过 `compiled_of(layout)` 读取，从不挂在 Layout 上，所以公开接口里不出现 entry。布局是不可变的纯数据，不含类，`layout.js` 不依赖 `TData`。同一份布局描述内的布局名互不相同（它们是 `layouts` 的键）。
- 已编译的布局按布局名保存在登记表中（`registry.js`，它不引用任何模块，所以 `layout.js` 写入、`TData` 读取而不成环）。`register_layout(struct)` 计算展开后结构的规范文本（`name`、`length`、`items`；对象键排序，不含 `comment`，类型名小写）。该名字已登记且文本相同，就返回已登记的 Layout，所以同一个布局描述两次（即使在两份不同的描述里）只编译一次；文本不同则抛出 `another layout is already named X`。`compile_layout_data` 在登记任何一个之前先检查描述里的每个布局有无这种冲突，所以一份描述要么全部登记，要么都不登记。`layout_of(name)` 返回已登记的布局，没有则抛出 `unknown layout X`。登记表不会清空：布局名在进程的整个生命期内有效。
- Bool 的定位规则：`byte = offset >> 3`，`bit = offset % 8`。内部缓冲按大端存放，一个字的第一个字节是寄存器的高字节，所以 coupling 中偏移 8–15 对应寄存器的 bit0–7，偏移 0–7 对应 bit8–15。布局文件按 8–15、0–7 的顺序列出，就是按寄存器 bit0 到 bit15 的顺序排列。

### 3.1 布局校验

布局规则在布局阶段集中校验，不分散到 TData 和 TTag 的运行时：

- `validate_structure(data_struct)` 对 `build_structure` 展开后的扁平 `items` 做校验，返回违规描述的数组（空数组表示合法），不在发现第一个错误时退出。
- 校验内容：
  - 名称：`items` 中名称重复；名称与 TData 的成员（`TData.prototype` 上的方法、getter，以及 `name` 等实例字段）冲突。
  - 类型与长度：`type` 不在支持的类型中；`length` 与类型不符（Bool 1，Byte / SInt / USInt 8，Int / UInt / Word 16，DInt / UDInt / DWord / Real 32）。
  - 对齐：非 Bool 的 `offset` 必须是 8 的倍数；多字节类型的字节偏移必须是偶数。
  - 重叠：把非 Bool 条目按字节区间排序后检查相邻区间是否相交；Bool 按 `offset` 检查是否重复占用同一位；Bool 落在某个非 Bool 区间内时，要求该 Bool 条目的 `coupling`（展开后是它所属组合字的名称数组）包含这个非 Bool 条目的名称。
  - 组合字：带 `coupling` 的条目，其每个组成位必须存在、是 Bool，且 `offset` 都在 `[offset, offset + length)` 内。
  - 总长：`length % 16 === 0`。
  - `init_value` 的类型与取值范围与 `type` 相符。
  - 组合字与它的组成位不同时给出 `init_value`（展开时记录冲突，由校验报告）。
- `build_structure` 遇到重名时保留条目，交给校验报告。
- `compile_layout` 对文件中的全部布局调用校验，有违规时抛出包含全部违规项的错误（`error.errors`）。
- 校验通过后，TData 和 TTag 不重复做这些检查；`register_layout` 只保留防御性断言。

## 4. 编解码与原型访问器

- 编解码表 `codecs.js` 中每种类型有一项，`get(buffer, byte, mask)` 从大端缓冲区解码，`set(buffer, byte, mask, value)` 编码写入；设备字节序不在表中处理。
- `TData` 持有一张从布局名到该布局的 TData 子类的表。某个名字第一次 `new TData(layout, ...)` 时构建子类，在其原型上为每个条目定义一次访问器，同一布局的实例共用，之后直接复用；子类带有静态属性 `layout`。只靠名字就能区分布局，因为登记表中一个名字只对应一个布局：
  - getter 每次用编解码表从 `buffer` 解码，不缓存值；
  - setter 用编解码表写入 `buffer`，再调用 `after_write`。
- 组合字与它的组成位共用同一块字节，写任何一方，另一方读到的自然是新值，不需要额外联动。
- tag 名不得与 TData 的成员同名（访问器会遮蔽成员），由 `validate_structure` 检查（通过 `TData.is_reserved_name`），`TData` 构建子类时也会抛出错误。
- `set_access_tracer(tracer | null)`：设置后，访问器每次读写 tag 都调用 `tracer(tdata, name, "read" | "write")`，供使用方的依赖追踪使用；未设置时访问器只多一次判断。
- `render_types(layouts, { source, tdata_module })` 由布局生成类型声明（每个布局一个接口，tag 为属性，`comment` 作为注释），为按名访问提供编辑器补全。

## 5. TData

- `new TData(layout, name)` 接收已登记的布局或其名字（由 `layout_of` 解析），返回按布局名构建的子类（见 §4）的实例；构造函数先调用 `super()`，再返回该实例。传来的布局对象不是其名字下已登记的那个时抛出错误（只比较引用，不比较结构）。`TData` 本身不会是任何实例的直接类。该实例分配 `buffer`（`layout.size` 字节），按条目的 `init_value` 依次编码写入。
- `name` 可写；`layout`、`size` 只读（只有 getter，赋值抛出 `TypeError`）。缓冲区是私有字段（`#buffer`），没有访问器，统一按大端存放；Observer 和事务所需的缓冲区由创建它们的 TData 传入。带类型的访问走 tag，不带类型的访问走字节：没有按宽度分类的原始方法。
- 写缓冲区有两种途径，都经过 TData，任何时候都允许：

  | 途径 | 使用者 |
  | --- | --- |
  | 按名赋值（`data[name] = v` 或 `tag.value = v`） | 任何代码 |
  | 原始方法 `write_bytes(offset, source)`、`write_bit(offset, mask, value)`，以字节偏移定位 | 与寄存器地址打交道的代码，如 Modbus 服务端，以及 IO 层 |

- `read_bytes(offset = 0, length = size - offset)` 返回一段字节的副本（`Buffer.from(buffer.subarray(...))`），所以无法通过它改动缓冲区。
- 原始方法在碰缓冲区之前先检查参数，出错时数据不变，也不会走到 `#written()`：`offset`、`length` 须为整数，且 `0 <= offset`、`offset + length <= size`，`mask` 须为 1 到 0xff 的整数（`RangeError`），`source` 须为 `Uint8Array`（`TypeError`）。`write_bytes` 用 `buffer.set(source, offset)` 复制。原始写入把它碰过的字节范围登记给 Observer（§5.1）。
- `load_tag(name, io_buffer, endian)` 和 `store_tag(name, io_buffer, endian)`（spec-data-api.zh-cn.md §2.9）把 `name` 解析为布局的编译条目（名字不存在时抛出 `Error`），检查 `endian`、`io_buffer` 和该条目在其中的范围（`io_range`），再以私有缓冲区调用 `endian.js` 的 `load_entry` / `store_entry`。`load_tag` 登记该条目的字节范围，像任何写入一样以 `#written()` 结束；`store_tag` 只读缓冲区。`TTag.load(io_buffer, endian)` 和 `TTag.store(io_buffer, endian)` 以 tag 名调用它们，所以 TTag 不需要检查自己属于哪个 tdata。

- TData 出错时抛出异常（布局冲突、值越界），不写日志、不退出。
- `data.get(name)` 返回该 tag 的 `TTag`，首次访问时创建并缓存，名称不存在时返回 `undefined`。TTag 不持有值：读 `value` 从 TData 的缓冲区解码，写 `value` 与 `data[name] = v` 完全等价；`name`、`type`、`length` 来自布局的编译条目，TTag 私有地持有它，不对外公开；`change` 事件由 Observer 发出。

### 5.1 检测、事务与 Observer

所有写入路径最后都汇到 TData 的同一个私有方法：

```js
#written() {
    if (this.#transaction) { this.#transaction.written = true; return; }  // in a transaction: only remember
    this.#observer.diff();                                                // detect right now
    this.emit("write", this);                                             // then tell the listeners
}
```

- 事务之外，在写入语句内部同步调用 `diff()`，再发出 `write`。
- `diff()` 是内部方法，没有任何公开方法能触发检测。所有写入路径都经 `#written()` 到达它，所以在写入或事务之外，缓冲区与快照不会有差异。

**事务。** `transaction(fn)` 在已有事务时抛出 `Error`；否则复制一份缓冲区，登记事务状态 `{ written: false }`，同步调用 `fn()`：

- `fn` 正常返回：关闭事务，调用一次 `diff()`，`written` 为真时发出一次 `write`，返回 `fn` 的返回值（不检查它是否是 Promise）；
- `fn` 抛出异常：关闭事务，把副本写回缓冲区，不发出任何事件，重新抛出原异常；
- Observer 的快照在事务中保持不动：提交时的 `diff()` 就是事务之前最近一次检测与现在之间的净变化；回滚后缓冲区回到事务开始时的内容，与快照重新一致；
- 事件在事务关闭之后发出，处理器中的写入和事务按普通情形处理；提交时处理器抛出的异常直接传出，不回滚；
- 事务期间 Node.js 不运行别的 JS 代码，同一线程中没有其他代码能访问这个 tdata，所以事务不需要加锁或隔离；`written` 只是布尔标记，不计次数，因为 `write` 事件没有载荷之外的信息。

**快照比对。** Observer 持有与缓冲区等长的快照，创建时复制缓冲区。每条写入路径都知道自己写了哪一段字节，并把它登记给 Observer（`touch(start, end)`；事务中各段累计为一段）；`diff()` 只逐字节比较登记范围内缓冲区与快照的差异（其余字节按构造必然相等），并清除登记。只对不同的字节经反查表 `tags_at_byte` 找到相关 tag，从快照解码旧值、从 `buffer` 解码新值，值不同（两个 NaN 视为相同）的记为变化；比对完成后更新快照，再统一报告：

- 按布局顺序报告（组合字在其组成位之前），每个变化先由 TData 发出 `change(tagname, old, new)`，再由该 tag 的 TTag 发出 `change(old, new)`；事件总在新值生效之后发出；
- 两次检测之间同一 tag 的多次写入合并为一个事件，值改变后又恢复的不发事件；
- 事件处理器中再写 tag 时，嵌套的比对只登记，等当前这一轮变化报告完再比对一轮；连续 16 轮仍有新变化时抛出异常，防止振荡；
- 旧值从快照解码，不缓存任何值。

## 6. 字节序转换

`endian.js` 按编译条目实现设备字节序与内部大端之间的转换（`load_entry` / `store_entry` / `io_index` / `io_range`），并为整个数据块生成字节下标表（`io_index_table`），与设备整块交换的使用方可以据此直接按字节复制。包只导出 `io_index_table`，其余是内部函数，由 TData 的 `load_tag` / `store_tag`（§5）传入私有缓冲区调用。下标表与 `load_entry` / `store_entry` 对每个条目的结果一致（有测试保证）。这些函数只接受 `BE`、`LE`、`BEBS`、`LEBS` 四种字节序（其他值抛出 `RangeError`，没有别名），都不检测变化：

- 2 字节：`BE` 原样复制；`LE` / `BEBS` 交换两个字节；
- 4 字节：支持 `BE`、`LE`、`BEBS`、`LEBS` 四种排列；
- Bool 和单字节类型（Byte、SInt、USInt）只读写一个字节，不做字节内转换；它在 IO 缓冲区中的下标按 16 位寄存器换算：`LE` / `BEBS` 时为 `byte ^ 1`，`BE` / `LEBS` 时为 `byte`。Bool 按位掩码只改自己的位。

## 7. 构建与测试

- `pnpm build`：rolldown 把 `src/index.js` 打包为 `dist/tagged-data.js`（`yaml` 打进库）；
- `pnpm bench`：`bench/change_detection_bench.js` 测量读取一个 86 个 tag、146 字节的数据块（从设备字节序缓冲装载每个 tag，并检测、报告变化）的开销。开发机上，在一个事务中对每个 tag 调用 `load_tag`，每周期无变化约 2.5 µs，少量变化 2.5–3.7 µs，全部变化 7.5–8 µs；用 `io_index_table` 按字节复制再一次 `write_bytes` 时分别约 0.4–0.5 µs、0.6–1.6 µs、5.3–5.7 µs；
- `pnpm test`：先构建，再运行类型测试和 `node --test`；`pnpm lint`：ESLint。
