# 数据对象接口规范（Ldata / Ltag）

> 本文规定 Ldata 和 Ltag 对使用者承诺的编程接口，是 [spec.zh-cn.md](spec.zh-cn.md) 的细化。实现见 [design.zh-cn.md](design.zh-cn.md) §2。
> Ldata 和 Ltag 是面向程序员的通用数据对象：任何时候都可以读写值，值发生变化时发出事件。它们不依赖使用方的调度方式；扫描式的数据流只是使用它们的一种方式，不限制它们的能力。

## 1. 概念

| 名称 | 含义 |
| --- | --- |
| 布局 | 一块数据的固定格式：每个 tag 的名称、类型、位偏移、初值，由描述中的布局定义（§6）给出，注册后不可变 |
| Ldata / ldata | Ldata 是数据对象的类，ldata 是它的实例：按某个布局分配的一块数据，内部按大端存放，提供按名读写和变化事件 |
| Ltag | ldata 中一个具名 tag 的操作接口，可读写其值、订阅其变化 |

Ldata、Ltag 中的 L 指 Layout（布局）：ldata 按创建它的那个固定布局存放，每个 tag 有确定的类型和位置。

tag 的类型：`Bool`、`Byte`、`SInt`、`USInt`、`Int`、`UInt`、`Word`、`DInt`、`UDInt`、`DWord`、`Real`。`Bool` 的值为 `true` / `false`，其余为数值。由若干 `Bool` 组成的 `Word` 称为组合字，它与各组成位共用同一块数据。

`Tag_Type` 是导出的 TypeScript 类型，取值为小写的类型名（`"bool" | "byte" | "usint" | "sint" | "int" | "uint" | "word" | "dint" | "udint" | "dword" | "real"`）。只有 `Ltag.type`（§3）是这个类型，所以 `switch (tag.type)` 有类型检查；描述中的条目和布局的条目（§6）里的 `type` 是描述中的原文（`string`）。

单位：本接口中 `length` 一律是位，`size` 一律是字节（`Layout.length` 与 `Layout.size`、布局条目的 `length`、`Ldata.size`、`Ltag.size`）。

## 2. Ldata

### 2.1 创建

```js
const data = new Ldata(layout, name);
```

- `layout`：已登记布局的名字，这是通常的用法（§6.4：先注册，再按名创建）；也可以是已登记的布局对象本身，由 `get_layout(name)` 返回，或来自注册的返回值；不接受条目列表，名字未知或布局对象不是其名字下已登记的那个时抛出错误；
- `name`：ldata 的名称，用于日志和错误信息。必须是字符串（任何字符串，空字符串也可以），否则抛出 `TypeError`；名称在这里给定，以后不能修改；
- 创建后每个 tag 的值等于布局中的初值，此时不发出变化事件；
- 布局名在进程的整个生命期内标识唯一的布局：同一布局的数据块共用一个类（§6.4）。

### 2.2 属性

| 属性 | 读写 | 说明 |
| --- | --- | --- |
| `name` | 只读 | ldata 的名称，创建时给定 |
| `layout` | 只读 | 所用的布局 |
| `size` | 只读 | ldata 的字节数 |

对只读属性赋值时抛出 `TypeError`。

ldata 的字节内容（内部按大端存放）不作为属性公开：它只能通过按名读写（§2.3）、Ltag（§3）和原始读写（§2.5）访问，所以每一次写入都经过 Ldata，变化不会被遗漏。

### 2.3 按名读写

```js
data.pressure = 1.5;          // write
const value = data.pressure;  // read
```

- 每个 tag 名都是 ldata 的一个属性，可读可写，任何时候都可以进行；tag 名不得是保留名（§2.10）；
- 写入立即生效：写入后读到的就是新值，读取 Ltag 的 `value` 也是新值；
- 写组合字时，各组成位随之改变；写组成位时，组合字随之改变；
- 值在写入之前先检查；被拒绝的值抛出异常，原值不变，不发出事件，也不发出 `write`：

  | 类型 | 接受 | 拒绝 |
  | --- | --- | --- |
  | `Bool` | 任何值，按真假值处理 | 无 |
  | 整型（`Byte`、`SInt`、`USInt`、`Int`、`UInt`、`Word`、`DInt`、`UDInt`、`DWord`） | 在类型取值范围内的整数 | 不是数字（字符串、`null`、`undefined`、布尔值、对象、bigint）：`TypeError`；`NaN`、`Infinity`、`1.5` 这样的非整数、超出范围的整数：`RangeError`；不截断，不转换 |
  | `Real` | 任何数字：`NaN` 和 `±Infinity` 照常保存；有限值舍入为 float32 | 不是数字：`TypeError`；绝对值超过 float32 最大值（约 3.4028235e38）的有限数，如 `1e40`：`RangeError` |

  布局的 `init_value` 更严格（§6.2）：`Real` 的初值必须是同一范围内的有限数。

### 2.4 取得 Ltag

```js
const tag = data.get("pressure");
```

返回该 tag 的 Ltag；同一 ldata 对同一名称总是返回同一个 Ltag。名称不存在时返回 `undefined`。

### 2.5 原始读写

不带类型的字节访问，供不按 tag 名访问的使用方（如对上服务端、与设备交换数据的 IO 层）使用。**带类型的访问走 tag，不带类型的访问走字节**：原始读写只有字节和位两种粒度，不解释数值的类型，也没有按字、双字的宽度分类的方法。

`offset` 是以字节计的偏移，与布局中 tag 的字节位置（位偏移除以 8）一致；数据按大端存放，设备字节序的转换由 IO 层负责（§7）。写入后的处理与按名写入相同：

| 方法 | 说明 |
| --- | --- |
| `read_bytes(offset = 0, length = size - offset)` | 从 `offset` 起读 `length` 个字节，返回副本（`Buffer`）；改动副本不影响 ldata |
| `write_bytes(offset, source)` | 从 `offset` 起写入 `source`（`Uint8Array`）的全部字节；`source` 为空时什么也不写，不算一次写入，不发出 `write` |
| `read_bit(offset, mask)` | 读 `offset` 处字节中由 `mask` 指定的位，其中任一位被置位时返回 `true` |
| `write_bit(offset, mask, value)` | 写 `offset` 处字节中由 `mask` 指定的位，`value` 按真假值处理，其余位不变 |

```js
data.write_bytes(5 * 2, Buffer.from([0x12, 0x34]));  // 写 5 号寄存器（Modbus 写单个寄存器）
const bytes = data.read_bytes();                     // 读出整块内容的副本
```

- 写入的范围不必与 tag 对齐：写到的字节属于哪些 tag，这些 tag 的值就随之改变，并按 §4 发出事件；
- `read_bit` 和 `write_bit` 使用同样的 `mask`。`write_bit` 是一次完成的“读-改-写”，调用方无法用 `write_bytes` 可靠地拼出。`read_bit` 得到的不比 `read_bytes(offset, 1)[0] & mask` 多，它存在是为了让 `access` 只指出被读的位所属的 Bool（§2.8）。多位 `mask` 时要得到各位的值，用 `read_bytes`；
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

ldata 中任一 tag 的值变化时发出，参数为 tag 名、旧值、新值。

```js
data.on("write", (data) => { /* ... */ });
```

每次写入之后发出，不论值是否改变。写入包括按名写入、Ltag 写入和原始写入（`write_bytes`、`write_bit`），读取不发出；被拒绝的写入（生效之前就抛出异常，见 §2.3、§5）不发出。它表示“发生了一次写入”，供使用方的调度和 IO 使用：这些使用方要处理每一次写入，哪怕写入的值没有变；值的变化由 `change` 表示。在本次写入的检测和它引起的 `change` 事件之后发出。事务中的写入不立即发出，见 §4.2。可以有任意多方监听，各用各的处理器。同一个 ldata 的一个事件订阅了超过 100 个监听器时，Node.js 会打印警告（`MaxListenersExceededWarning`），Ltag 的 `change` 超过 20 个时同样；这两个上限由库固定，需要别的上限的程序对该对象调用继承来的 `setMaxListeners(n)`。

事件名：

- `change`、`write`、`access`、`read` 是库保留的事件名。库发出 `change`、`write` 和 `access`（§2.8）；`read` 留给以后的读钩子，现在不发出。使用方不得用 `emit` 自行发出这些事件，也不得把它们用作自己的事件；
- 其他名字归使用方的自定义事件使用：`on`、`once`、`off` 对它们接受任意字符串或 symbol，处理器可以是任意签名；
- 类型声明中，`on`、`once`、`off` 对保留名带类型：`change` 的处理器是 `(name: string, old_value: number | boolean, new_value: number | boolean) => void`，`write` 的处理器是 `(data: Ldata) => void`，`access` 的处理器是 `(kind: "read" | "write", tags: Ltag[]) => void`，处理器类型不符是编译期错误。Ltag 的 `change` 同样带类型 `(old_value, new_value)`（§3）。

### 2.8 观察访问

```js
data.on("access", (kind, tags) => { /* kind 是 "read" 或 "write"；tags 是 Ltag 数组 */ });
```

ldata 的 tag 每被访问一次就发出一次，供工具查出一段代码碰了哪些 tag，例如把一条规则声明的依赖与它实际的依赖核对。它是开发和测试用的诊断手段，不观察访问的程序用不到它：ldata 没有 `access` 监听器时，每次访问只多一次判断。

- `kind` 是 `"read"` 或 `"write"`，`tags` 是被访问的 tag，即 `data.get(name)` 的 Ltag，按布局顺序排列，不重复；
- 哪些访问发出它，它指出哪些 tag：

  | 访问 | kind | tags |
  | --- | --- | --- |
  | 按名读取（`data.pressure`、`tag.value`） | `read` | 该 tag |
  | 按名写入（`data.pressure = v`、`tag.value = v`） | `write` | 该 tag |
  | `load_tag`、`tag.load` | `write` | 该 tag |
  | `store_tag`、`tag.store` | `read` | 该 tag |
  | `read_bytes(offset, length)` | `read` | 在该范围内有字节的 tag |
  | `write_bytes(offset, source)` | `write` | 在该范围内有字节的 tag |
  | `read_bit(offset, mask)` | `read` | 该字节上的 tag，但位不在 `mask` 内的 Bool 除外 |
  | `write_bit(offset, mask, value)` | `write` | 该字节上的 tag，但位不在 `mask` 内的 Bool 除外 |

  组合字和它的组成位共用字节，所以对这些字节的原始访问会同时指出组合字和它的组成位，而按名读写组合字只指出组合字。没有触及任何字节的原始访问（空范围或空 `source`）不指出任何 tag，也不发出；
- 只有生效了的访问才发出：被拒绝的写入（§2.3、§5）和因参数错误而抛出的访问都不发出。写入在新值生效之后、本次写入的检测以及它的 `change`、`write` 事件之前发出。事务里不立即发出：访问先累积，在事务结束时发出（§4.2）。事务回滚时对内容的恢复不算访问；
- 监听器里可以读写任何 tag，但 `access` 监听器运行期间发生的访问（它自己对任何 ldata 的访问）不发出任何事件，否则永远不会结束；事务也不累积这些访问；
- 监听器抛出的异常按 §4.4 处理：所有监听器都被调用，写入继续做它的检测和事件，之后由该语句抛出第一个异常；读取则抛出异常而不返回值。事务里的访问在事务结束时才调用监听器，其异常按 §4.2 处理；
- 实例上的监听器只看得到订阅它的那个 ldata。要观察进程里的所有 ldata，包括还没有创建的，就在类上订阅（见下）。

```js
Ldata.on_access((data, kind, tags) => { /* 对每个 ldata 的每次访问 */ });
Ldata.off_access(listener);
```

`Ldata.on_access(listener)` 订阅一个函数，对所有 ldata 的访问都会调用它，不论布局是什么、何时创建；监听器先收到 ldata，再是上面的 `kind` 和 `tags`。`Ldata.off_access(listener)` 取消订阅，对没有订阅过的函数什么都不做。可以有任意多方订阅，各用各的函数，互不覆盖。同一个函数订阅两次只算一次。类级监听器与各实例自己的事件分开保存，所以 `data.removeAllListeners()` 不会把它们移除。同一次访问，先调用实例上的监听器，再调用类上的，上面的异常规则对两者都适用。两种监听器都没有时，每次访问只多一次检查。用它做观察的工具，用完应取消自己的监听器。

### 2.9 设备字节序

ldata 内部按大端存放。与设备交换数据时，按 tag 在 ldata 与设备字节序的 IO 缓冲区之间转换：

| 方法 | 说明 |
| --- | --- |
| `load_tag(name, io_buffer, endian)` | 把名为 `name` 的 tag 的字节从 `io_buffer` 转换后写入 ldata，这是一次写入 |
| `store_tag(name, io_buffer, endian)` | 把 ldata 中名为 `name` 的 tag 的字节转换后写入 `io_buffer`；不改变 ldata，不发出任何事件 |

- `name`：tag 名。已经持有 Ltag 时用它的 `load` / `store`（§3），效果相同；批量处理时直接用名字，不必为每个 tag 创建 Ltag；
- `io_buffer`：`Uint8Array`，下标与 ldata 的字节偏移一一对应（与数据块等长的镜像），tag 在其中占的范围必须在其内；
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
- 出错时先于任何改动检查：ldata 不变，`load_tag` 不发出 `write`（错误见 §5）。

### 2.10 保留名

ldata 是一个对象，既用属性存放 tag，又有自己的方法，所以两边的名字不能相撞。保留名是一份固定的清单，在此给出，不随运行程序的 Node.js 版本而变：

| 来源 | 保留名 |
| --- | --- |
| Ldata 的成员 | `name`、`layout`、`size`、`get`、`transaction`、`read_bytes`、`write_bytes`、`read_bit`、`write_bit`、`load_tag`、`store_tag` |
| EventEmitter（Node.js 20.11） | `addListener`、`emit`、`eventNames`、`getMaxListeners`、`listenerCount`、`listeners`、`off`、`on`、`once`、`prependListener`、`prependOnceListener`、`rawListeners`、`removeAllListeners`、`removeListener`、`setMaxListeners`、`_events`、`_eventsCount`、`_maxListeners` |
| Object | `constructor`、`hasOwnProperty`、`isPrototypeOf`、`propertyIsEnumerable`、`toLocaleString`、`toString`、`valueOf`、`__proto__`、`__defineGetter__`、`__defineSetter__`、`__lookupGetter__`、`__lookupSetter__` |

- tag 使用保留名属于布局违规（§6.3）：注册这样的布局时抛出 `Error`（§6.4），所以不会有这种布局的 ldata；
- Ldata 仍然是 EventEmitter 的子类。以后的 Node.js 可能给 EventEmitter 增加方法，清单不会跟着变，所以与这类方法同名的 tag 会遮蔽该方法。测试会把清单与运行中的 Node.js 比对；
- 从 1.0 版起，本包给 Ldata 增加成员只用以 `Symbol` 为键的成员或静态方法，不会再给实例增加字符串名的成员，所以在 1.0 合法的 tag 名以后仍然合法。1.0 之前这个清单还可能增加；
- 保留的事件名见 §2.7。名字是否保留不提供查询：没有公开函数；
- Ltag 没有 tag 名，它的成员（§3）不是需要避开的清单。

## 3. Ltag

| 成员 | 说明 |
| --- | --- |
| `name` | tag 名 |
| `type` | 类型（小写），类型为 `Tag_Type`（§1） |
| `size` | 占用的字节数；Bool 占用它所在的那个字节，所以其 `size` 是 1 |
| `value` | 当前值，可读可写；写入与 `data[name] = v` 完全等价 |
| `on("change", (old_value, new_value) => ...)` | 订阅该 tag 的变化；`change` 是 Ltag 唯一的事件，也是它的保留名 |
| `load(io_buffer, endian)` | 等价于 `data.load_tag(name, io_buffer, endian)`（§2.9） |
| `store(io_buffer, endian)` | 等价于 `data.store_tag(name, io_buffer, endian)`（§2.9） |

Ltag 不保存值，读写都直接作用于所属 ldata。

## 4. 变化与事件

### 4.1 检测

**检测**是把 ldata 中每个 tag 的当前值，与上一次检测时的值比较，对值不同的 tag 发出 `change` 事件；检测完成后，当前值成为下一次检测的比较基准。ldata 创建时的初值是第一次检测的比较基准。

两次检测之间，同一个 tag 被写入多少次都不影响检测：检测只比较前后两个时刻的值，所以多次写入合并为一个事件，旧值是上一次检测时的值；值改变后又恢复的，不发出事件。

检测由 Ldata 在每次写入之后自动进行（事务中在提交时进行，见 §4.2），不是公开接口，使用方不需要也不能触发它。

### 4.2 事务

写入之后立即检测，所以一个逻辑步骤中的多次写入，会让订阅者看到“只更新了一半”的中间状态。**事务**把一组写入作为一个整体：事务期间不发出任何事件，结束时一次性提交，或者全部撤销。

- 开始与结束：`transaction(fn)` 同步调用 `fn()`，`fn` 返回时提交，其返回值就是 `transaction` 的返回值；
- 事务中可以进行任何读写：按名读写、Ltag、原始读写。写入立即生效，读到的是未提交的当前值；写入不做检测，不发出 `change` 和 `write`，访问也不发出 `access`；
- 提交：事务关闭后做一次检测（§4.1）并发出 `change` 事件，比较基准是事务之前最近一次检测时的值，所以事务内的多次写入合并为一个事件，改变后又恢复的不发出事件；随后，如果事务中有过按名写入、Ltag 写入或原始写入，发出一次 `write`（§2.7），事务中的多次写入只发出一次；
- 访问：事务期间不发出 `access`（§2.8）。读到的 tag 和写到的 tag 分别累积，各取并集；只有访问发生时 ldata 或类上有 `access` 监听器，这次访问才累积。结束时发给当时已订阅的监听器：`read` 和 `write` 各至多发出一次，tags 按布局顺序、不重复，没有 tag 的那种不发出；
- 提交顺序：先发出累积的 `access`（先 `read` 后 `write`），再检测并发出 `change`，最后发出 `write`，与事务外访问在检测之前一致；
- 回滚：`fn` 抛出异常时，ldata 的内容恢复为事务开始时的样子，然后只发出累积的 `access` `read`，因为这些读取确实发生过；写入已撤销，所以它们的 `access`、`change`、`write` 都不发出。`access` 监听器抛出的异常丢弃，原异常继续抛出；
- 事务中开始另一个事务，抛出 `Error`；`fn` 不处理它，事务就回滚；
- 事件在事务关闭之后发出，处理器中的写入和事务与平常一样。提交时处理器抛出的异常按 §4.4 从 `transaction` 抛出，但事务已经提交，不回滚。

事务的边界：

- 事务只保证 `fn` 同步执行部分的原子性，不检查 `fn` 的返回值：`fn` 应当是同步函数，返回 Promise 时不会报错，也不会等待它。Node.js 在 `fn` 执行期间不运行别的 JS 代码，所以同一线程中没有其他代码能读写这个 ldata；`fn` 中启动的异步操作，其后续步骤在事务关闭之后才执行，只是普通的写入，不属于该事务，也不会被回滚；
- 事务只保证本 ldata 的内容。事务中写其他 ldata，它们照常发出事件；事件处理器等副作用不随回滚撤销；
- 事务开始时复制一份 ldata 的内容，代价与数据块的大小成正比。

### 4.3 共同约定

- 无论变化来自哪里（按名写入、Ltag 写入、原始写入），都会发出事件，不会遗漏；
- 事件在新值生效之后发出：处理器中读到的就是新值；
- 只有值真正改变才发出事件：写入相同的值不发出；`NaN` 写成 `NaN` 视为未变；
- 组合字与组成位各自发出事件：一次写入改变了组合字和其中某些位时，组合字和这些位都发出；
- 一次检测中的多个变化按布局中的顺序发出（组合字在其组成位之前）；每个变化先发出 ldata 的 `change`，再发出该 Ltag 的 `change`；
- 事件处理器中可以写任何 tag：这次写入引起的变化在当前这批变化发出完之后发出；
- 如果处理器之间的写入互相触发，连续 16 轮仍有新变化，检测停止并抛出异常，防止无限振荡（与 §4.4 的异常同类）；尚未发出的变化不会丢失，下一次检测时发出。

### 4.4 处理器抛出异常

处理器（`change`、`write` 或 `access` 的监听函数）可能抛出异常。库不记录日志，也不发出 `error` 事件，规则如下：

- **事件不丢失**：一次写入的派发是完整的。它的检测所产生的全部 `change` 按 §4.3 的顺序发出，然后发出 `write`；每个事件的每个监听函数都被调用，顺序与订阅顺序相同。某个监听函数抛出异常不会中止其余的：同一事件中后面的监听函数、后面的事件和 `write` 照常送达；
- **抛出第一个异常**：派发全部完成后，写入语句（按名赋值、`tag.value = v`、原始写入、`load_tag`）抛出捕获到的第一个异常，其余异常丢弃；
- **值保留**：新值在任何事件之前就已生效，不回滚；语句虽然抛出异常，`write` 仍然发出。被拒绝的写入（§2.3）是唯一一种没有生效就抛出的写入；
- **事务**提交时遵循同样的规则，包括 `access` 监听器，第一个异常从 `transaction` 抛出，而事务已经提交（§4.2）。`fn` 自己抛出异常时，写入全部回滚，只发出累积的 `access` `read`，其监听器抛出的异常丢弃，重新抛出 `fn` 的异常；
- **嵌套写入**：处理器中的写入是一次普通写入；它抛出的异常进入发起写入的处理器，处理器不捕获则成为处理器自己的异常。§4.3 的振荡异常按同样的规则算作派发的异常。
## 5. 错误

接口出错时抛出异常，不写日志、不退出进程，由调用方决定如何处理：

| 情况 | 异常 |
| --- | --- |
| 向整型或 `Real` tag 写入不是数字的值 | `TypeError`，原值不变，不发出事件和 `write` |
| 向整型 tag 写入 `NaN`、`Infinity`、非整数或超出范围的整数，或向 `Real` tag 写入超出 float32 的有限数 | `RangeError`，原值不变，不发出事件和 `write` |
| 处理器抛出异常 | 全部事件派发完之后，写入语句抛出第一个异常；值保留，`write` 照常发出（§4.4） |
| 创建 ldata 时 `name` 不是字符串 | `TypeError` |
| 布局不合法、tag 名是保留名（§2.10） | `register_layout` 抛出带 `errors` 的 `Error`，什么都不登记（§6.4） |
| `register_layout` 在成功登记之后再次调用 | `Error`，第一次登记的布局保持不变（§6.4） |
| 处理器互相触发的写入不能平息 | `Error`，全部事件派发完之后由写入语句抛出（§4.4） |
| 事务中开始另一个事务 | `Error` |
| 原始读写的偏移、长度、掩码越界，或写入越过数据块末尾 | `RangeError`，数据不变，不发出 `write` |
| 原始写入的 `source`、`load_tag` / `store_tag` 的 `io_buffer` 不是 `Uint8Array` | `TypeError` |
| `load_tag` / `store_tag` 的 tag 名不存在 | `Error`，ldata 不变，不发出 `write` |
| 字节序不是 `BE`、`LE`、`BEBS`、`LEBS`，或 tag 在 `io_buffer` 中的范围越界 | `RangeError`，ldata 不变，不发出 `write` |

## 6. 布局描述

流程是**注册一次，再按名使用**：先描述布局（§6.1 到 §6.3），用一次 `register_layout` 调用把它们全部注册（§6.4），此后用 `new Ldata("Pump", "pump_1")` 按布局名创建数据块。使用方需要知道的是怎样把布局表达成 YAML 结构、它叫什么名字；它是否经过编译、编译成什么，不属于这个流程。

### 6.1 结构

一份描述可以同时定义多个布局。它有结构相同的两种形式：**描述文件**是 YAML 1.2 文件，按路径给出；**描述对象**是代码中的同一结构（§6.5）。结构是：

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

一份描述可以自成一体，也可以是一起注册的多份描述之一（§6.4）：描述里可以只有片段、只有布局，或者两者都有，每份描述的片段对所有描述的布局都可用。

### 6.2 条目

| 字段 | 说明 |
| --- | --- |
| `name` | tag 名：字母、数字和 `_`，不以数字开头，是所有语言都认的标识符，所以 tag 总能写成 `data.名字`，也与 PLC 数据块里的字段一致。同一布局内唯一，不得是保留名（§2.10）。设备点表里点位的名字若不同，把那个名字写进 `comment` |
| `type` | §1 所列类型之一，大小写不敏感 |
| `offset` | 位偏移；非 Bool 必须在整字节上，多字节类型必须从偶数字节开始 |
| `length` | 位长，可省略，省略时由类型决定；写出时须与类型一致 |
| `init_value` | 初值，须是该类型可表示的值（整型是范围内的整数，`Real` 是 float32 范围内的有限数）；组合字与组成位见下文 |
| `comment` | 可选的说明文字，供生成点表、类型声明等使用 |
| `coupling` | 组合字的组成位：片段名或内联条目列表，各位的 `offset` 相对于该字 |
| `is_combined` | 可选，说明性标记（整字与各位双向联动的组合字）；联动由 `coupling` 决定，不依赖它 |
| `includes` | 与 `offset`（可加 `name_prefix`）一起，把片段名或内联列表指定的条目整体偏移后拼接进来 |

片段中的条目也可以引用其他片段。

条目有两种，类型声明里各有名字（`Layout_Item` 是两者之一）：

| 条目 | 字段 | 声明 |
| --- | --- | --- |
| tag | `name`、`type`、`offset` 必填；`length`、`init_value`、`comment`、`is_combined`、`coupling` 可选；没有 `includes` | `Tag_Item` |
| 包含 | `includes` 和 `offset` 必填；`name_prefix` 可选；没有 `name` 和 `type` | `Include_Item` |

- `coupling` 是片段名或内联的 tag 条目列表，不能是名称列表：各位的名称是注册的结果（出现在 `Layout_Tag.coupling` 里，§6.6），不是输入；
- 描述对象的声明是 `Layout_Description`：`layouts` 是布局名到条目列表的映射，每个片段是一个条目列表。类型声明里 `register_layout` 的参数用它标注（`string | Layout_Description` 或它们的列表），所以编辑器会补全条目的字段，拼错字段名时会提示；
- `register_layout` 返回的 `fragments` 里是引用展开后的条目：`includes` 和 `coupling` 都是条目列表，不会是名称，每个 `length` 都存在。它们的声明仍然是 `Layout_Item`。

### 6.3 合法性

- 布局名是 JavaScript 的标识符（任何文字的字母、数字、`_` 和 `$`，不以数字开头），因为布局名是类型名的一部分（§6.7）；
- tag 名是标识符（字母、数字和 `_`，不以数字开头；数字、空名和缺少 name 都不是），唯一，且不是保留名（§2.10）；
- 非 Bool 的 tag 之间字节范围互不重叠；每一位最多属于一个 Bool；
- Bool 落在某个非 Bool tag 的字节范围内时，必须是该 tag（组合字）的组成位；组合字的每个组成位都必须落在该字的范围内；
- 组合字与它的组成位只能由一方给出初值：组合字给出时，组成位的初值由整字决定；组合字不给出时，由各组成位给出（未给出的位为 `false`），整字的初值由它们合成；
- 布局总长是整数个寄存器（16 位的整数倍）；
- 引用的片段必须存在，片段之间不得循环引用。

### 6.4 注册

```js
register_layout("pump.yaml");                                     // 一个文件
register_layout(["common.yaml", "pump.yaml", "valve.yaml"]);      // 多个文件
register_layout(["common.yaml", { layouts: { INLINE: [...] } }]); // 描述文件和描述对象混用
const pump = new Ldata("Pump", "pump_1");                         // 此后按布局名使用
```

`register_layout(descriptions)` 注册各描述中的布局。布局注册之后才能使用。

- `descriptions`：一份描述，或描述的列表；每份描述是**字符串，即描述文件的路径**，或是**对象，即描述对象**（§6.1 的结构：`layouts` 加各片段；在代码里给条目也是这样，§6.5）。列表里不能再放列表，空列表是错误。字符串永远是路径，不是 YAML 文本；
- **每个进程只能调用一次。** 布局一次注册，布局和片段就是同时全部已知的，不依赖调用的先后。第二次调用抛出 `Error`（`register_layout can be called only once`），第一次登记的布局保持不变。失败的调用什么都不登记，也不算用掉这一次，所以程序可以接着注册别的内容，例如自己的文件不合法时改用默认描述；
- **先合并描述，再解析。** 先收集所有描述的布局和片段，然后才解析片段引用，所以布局可以引用任何描述中的片段，与列表的顺序无关。描述不必有 `layouts` 键（只放公共片段的文件就没有），但至少要有一份描述定义了布局；
- 两份描述里出现同名片段或同名布局是错误，错误信息写出这两份描述（描述文件用路径，描述对象用它在列表中的位置，如 `layout description #2`）；不做覆盖；
- 每个布局都要校验（§6.3），省略的 `length` 会补全，传入的描述不会被修改；
- 有任何违规时抛出 `Error`，其 `errors` 属性列出所有描述的全部违规项，且什么都不登记：这些描述要么全部登记，要么都不登记。读不到的文件和 YAML 语法错误也是违规。布局和片段方面的错误写出布局或片段的名字，不写文件名；
- 返回值：`{ layouts, fragments }`，包含所有描述。`layouts` 是按名字索引的已登记布局，与 `get_layout(name)` 返回的相同；`fragments` 是按片段名索引的条目列表（展开引用后，偏移相对于片段起点），供使用方查询，例如取得参数块的全部 tag 名。上面的流程不需要它们；
- 布局名在进程的整个生命期内保持登记。`get_layout(name)` 返回已登记的布局（只读，§6.6），名字未登记时抛出 `unknown layout X`，与 `new Ldata(name, ...)` 相同；
- 只注册一次的后果：改过的布局文件只在新进程里生效（没有热重载，REPL 或测试里也无法重新注册改过的布局）；基于 layout-data 的库不能自己调用 `register_layout`，只能导出它的描述文件路径，由应用放进 `descriptions`。
- 依赖树里有两份本包时（例如不同版本各装一份），两份互不相通：各能调用一次 `register_layout`，用一份注册的布局，另一份按名找不到。

### 6.5 在代码中定义布局

布局不一定要有文件。把一个描述对象，即 §6.1 的结构，交给 `register_layout`（§6.4），每个布局的条目是它名字下的一个列表：

```js
register_layout({
  layouts: {
    Pump: [
      { name: "id", type: "UInt", offset: 0, init_value: 0 },
      { name: "pressure", type: "Real", offset: 32, init_value: 0 },
    ],
  },
});
const data = new Ldata("Pump", "pump_1");
```

- 条目就是 §6.2 的条目；`length` 可以省略；`coupling` 和 `includes` 接受内联列表，或任一描述中某个片段的名字；
- 传入的描述对象和其中的条目不会被修改；
- 没有单独登记一个条目列表的函数，也没有单独展开或校验结构的函数：注册是唯一做校验的步骤（§6.4）。

### 6.6 布局对象

布局（`Layout`）是只读对象，只公开下面这些成员：

| 成员 | 说明 |
| --- | --- |
| `name` | 布局名 |
| `length` | 总长，单位为位 |
| `size` | 总字节数 |
| `items` | 展开后的 tag 描述列表，按布局顺序（组合字在其组成位之前） |

- `items` 的每一项有：`name`；`type`（保持描述中的写法，不改大小写，而 `Ltag.type` 总是小写）；`offset`（绝对位偏移，字节位置是 `offset >> 3`）；`length`（位）；`init_value`；`comment`（如果给出）；`coupling`（组合字：其组成位的 tag 名；组成位：它所属的组合字的 tag 名）。`includes` 和 `name_prefix` 已经展开，不再出现；
- 布局及其 `items` 是深度冻结的，修改它们抛出 `TypeError`；
- 布局不公开按名索引表、字节位置、位掩码、编解码器等内部数据，使用方不需要了解它们：按名访问用 `data.get(name)` 取得 Ltag，与设备交换数据用 `load_tag` / `store_tag` 或 Ltag 的 `load` / `store`（§2.9）。

### 6.7 供编辑器使用的类型声明

`render_types(layouts, options)` 返回一份 TypeScript 声明文件（`.d.ts`）的文本，让编辑器能补全数据块的 tag。它是构建程序时用的辅助：布局注册之后，程序把文本写到代码旁边的文件里，例如 `layout_types.d.ts`。`layouts` 就是 `register_layout` 返回的 `layouts`。

- 每个布局生成 `<布局>_Tags` 和 `<布局>_Ldata`：前者是接口，每个 tag 一个属性（Bool 是 `boolean`，其余类型都是 `number`；`comment` 成为该属性的文档注释），后者是 `Ldata & <布局>_Tags`；
- 布局名原样使用，大小写不变：布局 `Pump` 生成 `Pump_Tags` 和 `Pump_Ldata`，`my_block` 生成 `my_block_Tags`，`Pump_Station` 生成 `Pump_Station_Tags`。大小写风格由调用者决定，建议用 `Snake_Pascal_Case`，也就是本包类型名的风格，库不强制。它就是 `new Ldata("Pump", ...)` 里写的名字，名字不同的两个布局不会生成同名的类型；
- `layouts` 的键作为布局名使用，必须是 JavaScript 的标识符。已登记的布局名都是标识符（§6.3），所以只有另给的键才可能不合格；这时抛出 `Error`，其 `errors` 列出全部这样的键。tag 名一定是标识符（§6.2），所以原样作为属性名。注释里的 `*/` 会被转义，所以生成的文本总是合法的声明文件；
- `options.source` 在文本的头部注释里写出布局文件的名字，省略时头部只说明这是生成的文本。`options.ldata_module` 是文本导入 `Ldata` 的模块说明符，相对于输出文件，默认是 `"layout-data"`。两个选项以及 `options` 参数本身都可以省略。

怎样使用这些类型。`new Ldata("Pump", "pump_1")` 的类型是 `Ldata`：类的构造函数不能按参数返回别的类型，所以值的类型要手工指定一次。在 JavaScript 里用 JSDoc 类型转换就够了，编辑器能据此补全 tag；文件开启检查（`checkJs` 或 `// @ts-check`）时，还能指出拼错的 tag 和类型不对的值：

```js
const pump = /** @type {import("./layout_types.js").Pump_Ldata} */ (new Ldata("Pump", "pump_1"));
pump.pressure = 1.5;   // 会补全，且知道它是数字
```

括号是 JSDoc 类型转换的一部分。把 `/** @type {...} */` 写在 `const pump = new Ldata(...)` 上面也能补全，但开启检查的文件会报“`Ldata` 不能赋给 `Pump_Ldata`”。

在 TypeScript 里写 `const pump = new Ldata("Pump", "pump_1") as Pump_Ldata;`。

## 7. 不在本接口内

- 与设备交换数据（驱动绑定、读写的编排）由使用方的 IO 层负责，它通过本接口操作 ldata：用 `load_tag` / `store_tag` 按 tag 做字节序转换（§2.9），整块交换用 `io_index_table` 加 `read_bytes` / `write_bytes`（§2.5），成批的装载放进事务（§2.6）；
- 调度、规则、计时不属于本接口。
