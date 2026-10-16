# 数据对象接口规范（TData / TTag）

> 本文规定 TData 和 TTag 对使用者承诺的编程接口，是 [spec.zh-cn.md](spec.zh-cn.md) 的细化。实现见 [design.zh-cn.md](design.zh-cn.md) §2。
> TData 和 TTag 是面向程序员的通用数据对象：任何时候都可以读写值，值发生变化时发出事件。它们不依赖使用方的调度方式；扫描式的数据流只是使用它们的一种方式，不限制它们的能力。

## 1. 概念

| 名称 | 含义 |
| --- | --- |
| 布局 | 一块数据的固定格式：每个 tag 的名称、类型、位偏移、初值，由布局描述（§6）给出，编译后不可变 |
| TData / tdata | TData 是数据对象的类，tdata 是它的实例：按某个布局分配的一块数据，内部按大端存放，提供按名读写和变化事件 |
| TTag | tdata 中一个具名 tag 的操作接口，可读写其值、订阅其变化 |

TData、TTag 中的 T 指 Typed（有类型的）：tdata 按固定布局存放，每个 tag 有确定的类型和位置。

tag 的类型：`Bool`、`Byte`、`SInt`、`USInt`、`Int`、`UInt`、`Word`、`DInt`、`UDInt`、`DWord`、`Real`。`Bool` 的值为 `true` / `false`，其余为数值。由若干 `Bool` 组成的 `Word` 称为组合字，它与各组成位共用同一块数据。

`Tag_Type` 是导出的 TypeScript 类型，取值为小写的类型名（`"bool" | "byte" | "usint" | "sint" | "int" | "uint" | "word" | "dint" | "udint" | "dword" | "real"`）。只有 `TTag.type`（§3）是这个类型，所以 `switch (tag.type)` 有类型检查；布局描述和布局条目（§6）里的 `type` 是描述中的原文（`string`）。

单位：本接口中 `length` 一律是位，`size` 一律是字节（`Layout.length` 与 `Layout.size`、布局条目的 `length`、`TData.size`、`TTag.size`）。

## 2. TData

### 2.1 创建

```js
const data = new TData(layout, name);
```

- `layout`：已登记的布局，来自 `compile_layout`（§6）或 `register_layout`（§6.5），或者是其名字，由 `layout_of(name)` 解析；不接受结构，名字未知或布局对象不是其名字下已登记的那个时抛出错误；
- `name`：tdata 的名称，用于日志和错误信息；
- 创建后每个 tag 的值等于布局中的初值，此时不发出变化事件；
- 布局名在进程的整个生命期内标识唯一的布局：同一布局的数据块共用一个类（§6.4）。

### 2.2 属性

| 属性 | 读写 | 说明 |
| --- | --- | --- |
| `name` | 可写 | tdata 的名称 |
| `layout` | 只读 | 所用的布局 |
| `size` | 只读 | tdata 的字节数 |

对只读属性赋值时抛出 `TypeError`。

tdata 的字节内容（内部按大端存放）不作为属性公开：它只能通过按名读写（§2.3）、TTag（§3）和原始读写（§2.5）访问，所以每一次写入都经过 TData，变化不会被遗漏。

### 2.3 按名读写

```js
data.pressure = 1.5;          // write
const value = data.pressure;  // read
```

- 每个 tag 名都是 tdata 的一个属性，可读可写，任何时候都可以进行；tag 名不得是保留名（§2.10）；
- 写入立即生效：写入后读到的就是新值，读取 TTag 的 `value` 也是新值；
- 写组合字时，各组成位随之改变；写组成位时，组合字随之改变；
- 值在写入之前先检查；被拒绝的值抛出异常，原值不变，不发出事件，也不发出 `write`：

  | 类型 | 接受 | 拒绝 |
  | --- | --- | --- |
  | `Bool` | 任何值，按真假值处理 | 无 |
  | 整型（`Byte`、`SInt`、`USInt`、`Int`、`UInt`、`Word`、`DInt`、`UDInt`、`DWord`） | 在类型取值范围内的整数 | 不是数字（字符串、`null`、`undefined`、布尔值、对象、bigint）：`TypeError`；`NaN`、`Infinity`、`1.5` 这样的非整数、超出范围的整数：`RangeError`；不截断，不转换 |
  | `Real` | 任何数字：`NaN` 和 `±Infinity` 照常保存；有限值舍入为 float32 | 不是数字：`TypeError`；绝对值超过 float32 最大值（约 3.4028235e38）的有限数，如 `1e40`：`RangeError` |

  布局的 `init_value` 更严格（§6.2）：`Real` 的初值必须是同一范围内的有限数。

### 2.4 取得 TTag

```js
const tag = data.get("pressure");
```

返回该 tag 的 TTag；同一 tdata 对同一名称总是返回同一个 TTag。名称不存在时返回 `undefined`。

### 2.5 原始读写

不带类型的字节访问，供不按 tag 名访问的使用方（如对上服务端、与设备交换数据的 IO 层）使用。**带类型的访问走 tag，不带类型的访问走字节**：原始读写只有字节和位两种粒度，不解释数值的类型，也没有按字、双字的宽度分类的方法。

`offset` 是以字节计的偏移，与布局中 tag 的字节位置（位偏移除以 8）一致；数据按大端存放，设备字节序的转换由 IO 层负责（§7）。写入后的处理与按名写入相同：

| 方法 | 说明 |
| --- | --- |
| `read_bytes(offset = 0, length = size - offset)` | 从 `offset` 起读 `length` 个字节，返回副本（`Buffer`）；改动副本不影响 tdata |
| `write_bytes(offset, source)` | 从 `offset` 起写入 `source`（`Uint8Array`）的全部字节；`source` 为空时什么也不写，不算一次写入，不发出 `write` |
| `write_bit(offset, mask, value)` | 写 `offset` 处字节中由 `mask` 指定的位，`value` 按真假值处理，其余位不变 |

```js
data.write_bytes(5 * 2, Buffer.from([0x12, 0x34]));  // 写 5 号寄存器（Modbus 写单个寄存器）
const bytes = data.read_bytes();                     // 读出整块内容的副本
```

- 写入的范围不必与 tag 对齐：写到的字节属于哪些 tag，这些 tag 的值就随之改变，并按 §4 发出事件；
- 没有 `read_bit`：读一位用 `read_bytes(offset, 1)[0] & mask`。`write_bit` 之所以存在，是因为它是一次完成的“读-改-写”，调用方无法用 `write_bytes` 可靠地拼出；
- `offset` 或 `length` 不是范围内的非负整数、写入越过数据块末尾、`mask` 不是 1 到 0xff 的整数时抛出 `RangeError`；`source` 不是 `Uint8Array` 时抛出 `TypeError`。参数在改动任何字节之前检查：出错时数据不变，也不发出 `write`。

### 2.6 事务

```js
const result = data.transaction(() => {
  data.valve = true;
  data.pressure = 1.5;
  return "done";
});
```

`transaction(fn)`：同步执行 `fn`，把其中的全部写入作为一个整体提交或回滚，返回 `fn` 的返回值。规则见 §4.2。

### 2.7 事件

```js
data.on("change", (name, old_value, new_value) => { /* ... */ });
```

tdata 中任一 tag 的值变化时发出，参数为 tag 名、旧值、新值。

```js
data.on("write", (data) => { /* ... */ });
```

每次写入之后发出，不论值是否改变。写入包括按名写入、TTag 写入和原始写入（`write_bytes`、`write_bit`），读取不发出；被拒绝的写入（生效之前就抛出异常，见 §2.3、§5）不发出。它表示“发生了一次写入”，供使用方的调度和 IO 使用：这些使用方要处理每一次写入，哪怕写入的值没有变；值的变化由 `change` 表示。在本次写入的检测和它引起的 `change` 事件之后发出。事务中的写入不立即发出，见 §4.2。可以有任意多方监听，各用各的处理器。

事件名：

- `change`、`write`、`read` 是库保留的事件名。库发出 `change` 和 `write`；`read` 留给以后的读钩子，现在不发出。使用方不得用 `emit` 自行发出这些事件，也不得把它们用作自己的事件；
- 其他名字归使用方的自定义事件使用：`on`、`once`、`off` 对它们接受任意字符串或 symbol，处理器可以是任意签名；
- 类型声明中，`on`、`once`、`off` 对保留名带类型：`change` 的处理器是 `(name: string, old_value: number | boolean, new_value: number | boolean) => void`，`write` 的处理器是 `(data: TData) => void`，处理器类型不符是编译期错误。TTag 的 `change` 同样带类型 `(old_value, new_value)`（§3）。

### 2.8 追踪访问

`set_access_tracer(tracer)` 设置一个函数，每次通过属性访问器读写 tag 时按 `tracer(tdata, name, "read" | "write")` 调用；`set_access_tracer(null)` 取消。供检查一段代码碰了哪些 tag 的工具使用。追踪器对整个进程全局有效，未设置时每次访问只多一次判断。

### 2.9 设备字节序

tdata 内部按大端存放。与设备交换数据时，按 tag 在 tdata 与设备字节序的 IO 缓冲区之间转换：

| 方法 | 说明 |
| --- | --- |
| `load_tag(name, io_buffer, endian)` | 把名为 `name` 的 tag 的字节从 `io_buffer` 转换后写入 tdata，这是一次写入 |
| `store_tag(name, io_buffer, endian)` | 把 tdata 中名为 `name` 的 tag 的字节转换后写入 `io_buffer`；不改变 tdata，不发出任何事件 |

- `name`：tag 名。已经持有 TTag 时用它的 `load` / `store`（§3），效果相同；批量处理时直接用名字，不必为每个 tag 创建 TTag；
- `io_buffer`：`Uint8Array`，下标与 tdata 的字节偏移一一对应（与数据块等长的镜像），tag 在其中占的范围必须在其内；
- `endian`：设备字节序，只接受 `"BE"`、`"LE"`、`"BEBS"`、`"LEBS"` 四个值（以 ABCD 表示大端的四个字节）：

  | 字节序 | 2 字节 | 4 字节 |
  | --- | --- | --- |
  | `BE` | 不变 | ABCD |
  | `LE` | 交换两个字节 | DCBA |
  | `BEBS` | 交换两个字节 | BADC |
  | `LEBS` | 不变 | CDAB |

  Bool 和单字节 tag（Byte、SInt、USInt）以其所在的 16 位寄存器为单位：`LE` 和 `BEBS` 时位于寄存器内的另一个字节，`BE` 和 `LEBS` 时原位；Bool 只改自己的位；
- `load_tag` 与按名写入相同：立即生效，检测并发出 `change`，再发出 `write`；事务中则在提交时一并处理。成批装载放进事务（§2.6），提交时只检测一次、只发出一次 `write`；
- 整块一次交换：`io_index_table(layout, endian)` 返回字节下标表，数据块的第 `i` 个字节在 IO 缓冲区中的下标是 `table[i]`，使用方据此按字节复制，再用 `write_bytes` 一次写入（§2.5）；
- 出错时先于任何改动检查：tdata 不变，`load_tag` 不发出 `write`（错误见 §5）。

### 2.10 保留名

tdata 是一个对象，既用属性存放 tag，又有自己的方法，所以两边的名字不能相撞。保留名是一份固定的清单，在此给出，不随运行程序的 Node.js 版本而变：

| 来源 | 保留名 |
| --- | --- |
| TData 的成员 | `name`、`layout`、`size`、`get`、`transaction`、`read_bytes`、`write_bytes`、`write_bit`、`load_tag`、`store_tag` |
| EventEmitter（Node.js 20.11） | `addListener`、`emit`、`eventNames`、`getMaxListeners`、`listenerCount`、`listeners`、`off`、`on`、`once`、`prependListener`、`prependOnceListener`、`rawListeners`、`removeAllListeners`、`removeListener`、`setMaxListeners`、`_events`、`_eventsCount`、`_maxListeners` |
| Object | `constructor`、`hasOwnProperty`、`isPrototypeOf`、`propertyIsEnumerable`、`toLocaleString`、`toString`、`valueOf`、`__proto__`、`__defineGetter__`、`__defineSetter__`、`__lookupGetter__`、`__lookupSetter__` |

- tag 使用保留名属于布局违规（§6.3）：校验会报告，用这样的布局创建 tdata 时抛出 `Error`；
- TData 仍然是 EventEmitter 的子类。以后的 Node.js 可能给 EventEmitter 增加方法，清单不会跟着变，所以与这类方法同名的 tag 会遮蔽该方法。测试会把清单与运行中的 Node.js 比对；
- 本包以后给 TData 增加成员，只用以 `Symbol` 为键的成员或静态方法，不会再给实例增加字符串名的成员，所以现在合法的 tag 名以后仍然合法；
- 保留的事件名见 §2.7。名字是否保留不提供查询：没有公开函数；
- TTag 没有 tag 名，它的成员（§3）不是需要避开的清单。

## 3. TTag

| 成员 | 说明 |
| --- | --- |
| `name` | tag 名 |
| `type` | 类型（小写），类型为 `Tag_Type`（§1） |
| `size` | 占用的字节数；Bool 占用它所在的那个字节，所以其 `size` 是 1 |
| `value` | 当前值，可读可写；写入与 `data[name] = v` 完全等价 |
| `on("change", (old_value, new_value) => ...)` | 订阅该 tag 的变化；`change` 是 TTag 唯一的事件，也是它的保留名 |
| `load(io_buffer, endian)` | 等价于 `data.load_tag(name, io_buffer, endian)`（§2.9） |
| `store(io_buffer, endian)` | 等价于 `data.store_tag(name, io_buffer, endian)`（§2.9） |

TTag 不保存值，读写都直接作用于所属 tdata。

## 4. 变化与事件

### 4.1 检测

**检测**是把 tdata 中每个 tag 的当前值，与上一次检测时的值比较，对值不同的 tag 发出 `change` 事件；检测完成后，当前值成为下一次检测的比较基准。tdata 创建时的初值是第一次检测的比较基准。

两次检测之间，同一个 tag 被写入多少次都不影响检测：检测只比较前后两个时刻的值，所以多次写入合并为一个事件，旧值是上一次检测时的值；值改变后又恢复的，不发出事件。

检测由 TData 在每次写入之后自动进行（事务中在提交时进行，见 §4.2），不是公开接口，使用方不需要也不能触发它。

### 4.2 事务

写入之后立即检测，所以一个逻辑步骤中的多次写入，会让订阅者看到“只更新了一半”的中间状态。**事务**把一组写入作为一个整体：事务期间不发出任何事件，结束时一次性提交，或者全部撤销。

- 开始与结束：`transaction(fn)` 同步调用 `fn()`，`fn` 返回时提交，其返回值就是 `transaction` 的返回值；
- 事务中可以进行任何读写：按名读写、TTag、原始读写。写入立即生效，读到的是未提交的当前值；写入不做检测，不发出 `change` 和 `write`；
- 提交：事务关闭后做一次检测（§4.1）并发出 `change` 事件，比较基准是事务之前最近一次检测时的值，所以事务内的多次写入合并为一个事件，改变后又恢复的不发出事件；随后，如果事务中有过按名写入、TTag 写入或原始写入，发出一次 `write`（§2.7），事务中的多次写入只发出一次；
- 回滚：`fn` 抛出异常时，tdata 的内容恢复为事务开始时的样子，不发出任何事件，原异常继续抛出；
- 事务中开始另一个事务，抛出 `Error`；`fn` 不处理它，事务就回滚；
- 事件在事务关闭之后发出，处理器中的写入和事务与平常一样。提交时处理器抛出的异常按 §4.4 从 `transaction` 抛出，但事务已经提交，不回滚。

事务的边界：

- 事务只保证 `fn` 同步执行部分的原子性，不检查 `fn` 的返回值：`fn` 应当是同步函数，返回 Promise 时不会报错，也不会等待它。Node.js 在 `fn` 执行期间不运行别的 JS 代码，所以同一线程中没有其他代码能读写这个 tdata；`fn` 中启动的异步操作，其后续步骤在事务关闭之后才执行，只是普通的写入，不属于该事务，也不会被回滚；
- 事务只保证本 tdata 的内容。事务中写其他 tdata，它们照常发出事件；事件处理器等副作用不随回滚撤销；
- 事务开始时复制一份 tdata 的内容，代价与数据块的大小成正比。

### 4.3 共同约定

- 无论变化来自哪里（按名写入、TTag 写入、原始写入），都会发出事件，不会遗漏；
- 事件在新值生效之后发出：处理器中读到的就是新值；
- 只有值真正改变才发出事件：写入相同的值不发出；`NaN` 写成 `NaN` 视为未变；
- 组合字与组成位各自发出事件：一次写入改变了组合字和其中某些位时，组合字和这些位都发出；
- 一次检测中的多个变化按布局中的顺序发出（组合字在其组成位之前）；每个变化先发出 tdata 的 `change`，再发出该 TTag 的 `change`；
- 事件处理器中可以写任何 tag：这次写入引起的变化在当前这批变化发出完之后发出；
- 如果处理器之间的写入互相触发，连续 16 轮仍有新变化，检测停止并抛出异常，防止无限振荡（与 §4.4 的异常同类）；尚未发出的变化不会丢失，下一次检测时发出。

### 4.4 处理器抛出异常

处理器（`change` 或 `write` 的监听函数）可能抛出异常。库不记录日志，也不发出 `error` 事件，规则如下：

- **事件不丢失**：一次写入的派发是完整的。它的检测所产生的全部 `change` 按 §4.3 的顺序发出，然后发出 `write`；每个事件的每个监听函数都被调用，顺序与订阅顺序相同。某个监听函数抛出异常不会中止其余的：同一事件中后面的监听函数、后面的事件和 `write` 照常送达；
- **抛出第一个异常**：派发全部完成后，写入语句（按名赋值、`tag.value = v`、原始写入、`load_tag`）抛出捕获到的第一个异常，其余异常丢弃；
- **值保留**：新值在任何事件之前就已生效，不回滚；语句虽然抛出异常，`write` 仍然发出。被拒绝的写入（§2.3）是唯一一种没有生效就抛出的写入；
- **事务**提交时遵循同样的规则，第一个异常从 `transaction` 抛出，而事务已经提交（§4.2）。`fn` 自己抛出异常时仍然不发出任何事件，写入全部回滚，与以前相同；
- **嵌套写入**：处理器中的写入是一次普通写入；它抛出的异常进入发起写入的处理器，处理器不捕获则成为处理器自己的异常。§4.3 的振荡异常按同样的规则算作派发的异常。
## 5. 错误

接口出错时抛出异常，不写日志、不退出进程，由调用方决定如何处理：

| 情况 | 异常 |
| --- | --- |
| 向整型或 `Real` tag 写入不是数字的值 | `TypeError`，原值不变，不发出事件和 `write` |
| 向整型 tag 写入 `NaN`、`Infinity`、非整数或超出范围的整数，或向 `Real` tag 写入超出 float32 的有限数 | `RangeError`，原值不变，不发出事件和 `write` |
| 处理器抛出异常 | 全部事件派发完之后，写入语句抛出第一个异常；值保留，`write` 照常发出（§4.4） |
| 布局不合法、tag 名是保留名（§2.10） | 创建 tdata 时抛出 `Error` |
| 处理器互相触发的写入不能平息 | `Error`，全部事件派发完之后由写入语句抛出（§4.4） |
| 事务中开始另一个事务 | `Error` |
| 原始读写的偏移、长度、掩码越界，或写入越过数据块末尾 | `RangeError`，数据不变，不发出 `write` |
| 原始写入的 `source`、`load_tag` / `store_tag` 的 `io_buffer` 不是 `Uint8Array` | `TypeError` |
| `load_tag` / `store_tag` 的 tag 名不存在 | `Error`，tdata 不变，不发出 `write` |
| 字节序不是 `BE`、`LE`、`BEBS`、`LEBS`，或 tag 在 `io_buffer` 中的范围越界 | `RangeError`，tdata 不变，不发出 `write` |

## 6. 布局描述

### 6.1 文件

布局描述是一个 YAML 1.2 文件，可以同时定义多个布局：

- 根键 `layouts`：映射，键为布局名（如 `NODE`），值为该布局的条目列表；
- 其余根键都是片段：键为片段名，值为条目列表，供条目按名称引用。

```yaml
node_commands:              # a fragment
  - { name: stop_pumps, type: Bool, offset: 8, init_value: false, comment: Stop pump command }
  - { name: cancel_stop, type: Bool, offset: 9, comment: Cancel stop pump }

layouts:
  NODE:
    - { name: ID, type: UInt, offset: 0, init_value: 0 }
    - name: response_code
      type: Word
      offset: 128
      coupling: node_commands
    - { includes: node_parameters, offset: 144 }
```

目前一次只编译一个文件。以后支持多个文件（目录）时，再规定合并方式和键冲突的处理。

### 6.2 条目

| 字段 | 说明 |
| --- | --- |
| `name` | tag 名，同一布局内唯一，不得是保留名（§2.10） |
| `type` | §1 所列类型之一，大小写不敏感 |
| `offset` | 位偏移；非 Bool 必须在整字节上，多字节类型必须从偶数字节开始 |
| `length` | 位长，可省略，省略时由类型决定；写出时须与类型一致 |
| `init_value` | 初值，须是该类型可表示的值（整型是范围内的整数，`Real` 是 float32 范围内的有限数）；组合字与组成位见下文 |
| `comment` | 可选的说明文字，供生成点表、类型声明等使用 |
| `coupling` | 组合字的组成位：片段名或内联条目列表，各位的 `offset` 相对于该字 |
| `is_combined` | 可选，说明性标记（整字与各位双向联动的组合字）；联动由 `coupling` 决定，不依赖它 |
| `includes` | 与 `offset`（可加 `name_prefix`）一起，把片段名或内联列表指定的条目整体偏移后拼接进来 |

片段中的条目也可以引用其他片段。

### 6.3 合法性

- tag 名唯一，且不是保留名（§2.10）；
- 非 Bool 的 tag 之间字节范围互不重叠；每一位最多属于一个 Bool；
- Bool 落在某个非 Bool tag 的字节范围内时，必须是该 tag（组合字）的组成位；组合字的每个组成位都必须落在该字的范围内；
- 组合字与它的组成位只能由一方给出初值：组合字给出时，组成位的初值由整字决定；组合字不给出时，由各组成位给出（未给出的位为 `false`），整字的初值由它们合成；
- 布局总长是整数个寄存器（16 位的整数倍）；
- 引用的片段必须存在，片段之间不得循环引用。

### 6.4 编译

```js
const { layouts, fragments } = compile_layout(yaml_path);
const node = new TData(layouts.NODE, "node_1");
```

- `layouts`：按布局名索引的已编译布局，用于创建 TData；
- `fragments`：按片段名索引的条目列表（展开引用后，偏移相对于片段起点），供使用方查询，例如取得参数块的全部 tag 名；
- 文件中有任何违规时抛出 `Error`，其 `errors` 属性列出全部违规项；
- 每个布局都按其名字登记（§6.4）；与某名字下已登记的布局相同的布局（文件，不论路径；或交给 `compile_layout_data` 的对象）就是同一个 `Layout` 对象，所以共用一份描述的多个使用方拿到同一批对象。布局是只读的（§6.6）；
- 一个布局名只属于一个布局：与其名字下已登记的布局不同的布局（条目的 `comment` 和类型名的大小写不计）是错误，`another layout is already named X`。一份描述要么全部登记，要么都不登记：冲突在登记任何布局之前就写入 `errors` 报告。所以不同描述中的布局须使用不同的名字，除非它们完全相同。`layout_of(name)` 返回已登记的布局，名字未知时抛出 `unknown layout X`；
- `compile_layout_data(root, origin)` 编译已解析的描述（与文件同结构：`layouts` 加各片段），用于布局嵌在使用方自己文件中的情形，返回值和错误同上。

### 6.5 在代码中定义布局

布局不一定要有文件。`build_structure({ name }, items)` 把条目列表（与文件中的条目相同，可内联 `coupling` 列表并显式给出 `length`）展开为结构，`validate_structure(structure)` 返回违规描述的数组（§6.3，空数组表示合法），`register_layout(structure)` 把它编译为布局并登记（§6.4）。`layout_of(name)` 返回已登记的布局。`new TData(layout, name)` 接收该布局。`build_structure` 保留收到的内容（包括违规），使用前须检查校验结果。

### 6.6 布局对象

布局（`Layout`）是只读对象，只公开下面这些成员：

| 成员 | 说明 |
| --- | --- |
| `name` | 布局名 |
| `length` | 总长，单位为位 |
| `size` | 总字节数 |
| `items` | 展开后的 tag 描述列表，按布局顺序（组合字在其组成位之前） |

- `items` 的每一项有：`name`；`type`（保持描述中的写法，不改大小写，而 `TTag.type` 总是小写）；`offset`（绝对位偏移，字节位置是 `offset >> 3`）；`length`（位）；`init_value`；`comment`（如果给出）；`coupling`（组合字：其组成位的 tag 名；组成位：它所属的组合字的 tag 名）。`includes` 和 `name_prefix` 已经展开，不再出现；
- 布局及其 `items` 是深度冻结的，修改它们抛出 `TypeError`；
- 布局不公开按名索引表、字节位置、位掩码、编解码器等内部数据，使用方不需要了解它们：按名访问用 `data.get(name)` 取得 TTag，与设备交换数据用 `load_tag` / `store_tag` 或 TTag 的 `load` / `store`（§2.9）。

## 7. 不在本接口内

- 与设备交换数据（驱动绑定、读写的编排）由使用方的 IO 层负责，它通过本接口操作 tdata：用 `load_tag` / `store_tag` 按 tag 做字节序转换（§2.9），整块交换用 `io_index_table` 加 `read_bytes` / `write_bytes`（§2.5），成批的装载放进事务（§2.6）；
- 调度、规则、计时不属于本接口。
