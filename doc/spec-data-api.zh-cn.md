# 数据对象接口规范（TData / TTag）

> 本文规定 TData 和 TTag 对使用者承诺的编程接口，是 [spec.zh-cn.md](spec.zh-cn.md) 的细化。实现见 [design.zh-cn.md](design.zh-cn.md) §2。
> TData 和 TTag 是面向程序员的通用数据对象：任何时候都可以读写值，值发生变化时发出事件。它们不依赖使用方的调度方式；扫描式的数据流只是使用它们的一种方式，不限制它们的能力。

## 1. 概念

| 名称 | 含义 |
| --- | --- |
| 布局 | 一块数据的固定格式：每个 tag 的名称、类型、位偏移、初值，由布局描述（§6）给出，编译后不可变 |
| TData / tdata | TData 是数据对象的类，tdata 是它的实例：按某个布局分配的一块数据，内部按大端存放，提供按名读写和变化事件 |
| TTag | tdata 中一个具名条目的操作接口，可读写其值、订阅其变化 |

TData、TTag 中的 T 指 Typed（有类型的）：tdata 按固定布局存放，每个 tag 有确定的类型和位置。

tag 的类型：`Bool`、`Byte`、`SInt`、`USInt`、`Int`、`UInt`、`Word`、`DInt`、`UDInt`、`DWord`、`Real`。`Bool` 的值为 `true` / `false`，其余为数值。由若干 `Bool` 组成的 `Word` 称为组合字，它与各组成位共用同一块数据。

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
| `buffer` | 只读 | 内部缓冲区（大端）。属性只读，不能换成另一个缓冲区；缓冲区的内容可以读写，直接改写内容后须调用 `detect()`，否则变化不会被检测（事务中不必，提交时会检测，见 §4.2） |

对只读属性赋值时抛出 `TypeError`。

### 2.3 按名读写

```js
data.pressure = 1.5;          // write
const value = data.pressure;  // read
```

- 每个 tag 名都是 tdata 的一个属性，可读可写，任何时候都可以进行；
- 写入立即生效：写入后读到的就是新值，读取 TTag 的 `value` 也是新值；
- 写组合字时，各组成位随之改变；写组成位时，组合字随之改变；
- 写入超出类型取值范围的整数时抛出 `RangeError`，原值不变；写 `Bool` 时按真假值处理。

### 2.4 取得 TTag

```js
const tag = data.get("pressure");
```

返回该 tag 的 TTag；同一 tdata 对同一名称总是返回同一个 TTag。名称不存在时返回 `undefined`。

### 2.5 原始写入

供不按 tag 名访问的写入方（如对上服务端）使用，以字节偏移定位，写入后的处理与按名写入相同：

| 方法 | 说明 |
| --- | --- |
| `write_register(offset, value)` | 写一个 16 位寄存器（大端），`offset` 为字节偏移 |
| `write_bit(offset, mask, value)` | 写一个字节中由 `mask` 指定的位 |
| `write_bytes(offset, source)` | 从 `offset` 起写一段字节 |

### 2.6 检测与事务

`detect()`：做一次检测（§4.1），报告自上次检测以来的全部变化。写入后会自动检测，通常只在直接改写 `buffer` 内容后需要调用。事务中不允许调用（§4.2）。

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

每次写入之后发出，不论值是否改变。它表示“发生了一次写入”，供使用方的调度和 IO 使用：这些使用方要处理每一次写入，哪怕写入的值没有变；值的变化由 `change` 表示。在本次写入的检测和它引起的 `change` 事件之后发出。直接改写 `buffer` 不是这里所说的写入，不发出 `write`。事务中的写入不立即发出，见 §4.2。可以有任意多方监听，各用各的处理器。

### 2.8 追踪访问

`set_access_tracer(tracer)` 设置一个函数，每次通过属性访问器读写 tag 时按 `tracer(tdata, name, "read" | "write")` 调用；`set_access_tracer(null)` 取消。供检查一段代码碰了哪些 tag 的工具使用。追踪器对整个进程全局有效，未设置时每次访问只多一次判断。

## 3. TTag

| 成员 | 说明 |
| --- | --- |
| `name` | tag 名 |
| `type` | 类型（小写） |
| `length` | 占用的字节数 |
| `value` | 当前值，可读可写；写入与 `data[name] = v` 完全等价 |
| `on("change", (old_value, new_value) => ...)` | 订阅该 tag 的变化 |

TTag 不保存值，读写都直接作用于所属 tdata。

## 4. 变化与事件

### 4.1 检测

**检测**是把 tdata 中每个 tag 的当前值，与上一次检测时的值比较，对值不同的 tag 发出 `change` 事件；检测完成后，当前值成为下一次检测的比较基准。tdata 创建时的初值是第一次检测的比较基准。

两次检测之间，同一个 tag 被写入多少次都不影响检测：检测只比较前后两个时刻的值，所以多次写入合并为一个事件，旧值是上一次检测时的值；值改变后又恢复的，不发出事件。

### 4.2 事务

写入之后立即检测，所以一个逻辑步骤中的多次写入，会让订阅者看到“只更新了一半”的中间状态。**事务**把一组写入作为一个整体：事务期间不发出任何事件，结束时一次性提交，或者全部撤销。

- 开始与结束：`transaction(fn)` 同步调用 `fn()`，`fn` 返回时提交，其返回值就是 `transaction` 的返回值；
- 事务中可以进行任何读写：按名读写、TTag、原始写入、直接读写 `buffer`。写入立即生效，读到的是未提交的当前值；写入不做检测，不发出 `change` 和 `write`；
- 提交：事务关闭后做一次检测（§4.1）并发出 `change` 事件，比较基准是事务之前最近一次检测时的值，所以事务内的多次写入合并为一个事件，改变后又恢复的不发出事件；随后，如果事务中有过按名写入、TTag 写入或原始写入，发出一次 `write`（§2.7），事务中的多次写入只发出一次；
- 回滚：`fn` 抛出异常时，`buffer` 恢复为事务开始时的内容，不发出任何事件，原异常继续抛出；
- 事务中调用 `detect()` 或开始另一个事务，抛出 `Error`；`fn` 不处理它，事务就回滚；
- 事件在事务关闭之后发出，处理器中的写入和事务与平常一样。提交时处理器抛出的异常从 `transaction` 抛出，但事务已经提交，不回滚。

事务的边界：

- 事务只保证 `fn` 同步执行部分的原子性，不检查 `fn` 的返回值：`fn` 应当是同步函数，返回 Promise 时不会报错，也不会等待它。Node.js 在 `fn` 执行期间不运行别的 JS 代码，所以同一线程中没有其他代码能读写这个 tdata；`fn` 中启动的异步操作，其后续步骤在事务关闭之后才执行，只是普通的写入，不属于该事务，也不会被回滚；
- 事务只保证本 tdata 的 `buffer`。事务中写其他 tdata，它们照常发出事件；事件处理器等副作用不随回滚撤销；
- 事务不保护被事件循环之外的力量写入的 `buffer`，例如交给异步读取的 `buffer`，或放在 `SharedArrayBuffer` 上被其他线程写入的 `buffer`；
- 事务开始时复制一份 `buffer`，代价与数据块的大小成正比。

### 4.3 共同约定

- 无论变化来自哪里（按名写入、TTag 写入、原始写入、直接改写 `buffer` 后的 `detect()`），都会发出事件，不会遗漏；
- 事件在新值生效之后发出：处理器中读到的就是新值；
- 只有值真正改变才发出事件：写入相同的值不发出；`NaN` 写成 `NaN` 视为未变；
- 组合字与组成位各自发出事件：一次写入改变了组合字和其中某些位时，组合字和这些位都发出；
- 一次检测中的多个变化按布局中的顺序发出（组合字在其组成位之前）；每个变化先发出 tdata 的 `change`，再发出该 TTag 的 `change`；
- 事件处理器中可以写任何 tag：这次写入引起的变化在当前这批变化发出完之后发出；
- 如果处理器之间的写入互相触发，连续 16 轮仍有新变化，检测抛出异常，防止无限振荡；尚未发出的变化不会丢失，下一次检测时发出。

## 5. 错误

接口出错时抛出异常，不写日志、不退出进程，由调用方决定如何处理：

| 情况 | 异常 |
| --- | --- |
| 写入超出类型取值范围的整数 | `RangeError`，原值不变 |
| 布局不合法、tag 名与 TData 的成员冲突 | 创建 tdata 时抛出 `Error` |
| 处理器互相触发的写入不能平息 | 检测时抛出 `Error` |
| 事务中调用 `detect()` 或开始另一个事务 | `Error` |

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
| `name` | tag 名，同一布局内唯一，不得与 TData 的成员同名 |
| `type` | §1 所列类型之一，大小写不敏感 |
| `offset` | 位偏移；非 Bool 必须在整字节上，多字节类型必须从偶数字节开始 |
| `length` | 位长，可省略，省略时由类型决定；写出时须与类型一致 |
| `init_value` | 初值，须是该类型可表示的值；组合字与组成位见下文 |
| `comment` | 可选的说明文字，供生成点表、类型声明等使用 |
| `coupling` | 组合字的组成位：片段名或内联条目列表，各位的 `offset` 相对于该字 |
| `is_combined` | 可选，说明性标记（整字与各位双向联动的组合字）；联动由 `coupling` 决定，不依赖它 |
| `includes` | 与 `offset`（可加 `name_prefix`）一起，把片段名或内联列表指定的条目整体偏移后拼接进来 |

片段中的条目也可以引用其他片段。

### 6.3 合法性

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
- 每个布局都按其名字登记（§6.4）；与某名字下已登记的布局相同的布局（文件，不论路径；或交给 `compile_layout_data` 的对象）就是同一个 `Layout` 对象，所以共用一份描述的多个使用方拿到同一批对象。不要修改布局；
- 一个布局名只属于一个布局：与其名字下已登记的布局不同的布局（条目的 `comment` 和类型名的大小写不计）是错误，`another layout is already named X`。一份描述要么全部登记，要么都不登记：冲突在登记任何布局之前就写入 `errors` 报告。所以不同描述中的布局须使用不同的名字，除非它们完全相同。`layout_of(name)` 返回已登记的布局，名字未知时抛出 `unknown layout X`；
- `compile_layout_data(root, origin)` 编译已解析的描述（与文件同结构：`layouts` 加各片段），用于布局嵌在使用方自己文件中的情形，返回值和错误同上。

### 6.5 在代码中定义布局

布局不一定要有文件。`build_structure({ name }, items)` 把条目列表（与文件中的条目相同，可内联 `coupling` 列表并显式给出 `length`）展开为结构，`validate_structure(structure)` 返回违规描述的数组（§6.3，空数组表示合法），`register_layout(structure)` 把它编译为布局并登记（§6.4）。`layout_of(name)` 返回已登记的布局。`new TData(layout, name)` 接收该布局。`build_structure` 保留收到的内容（包括违规），使用前须检查校验结果。

## 7. 不在本接口内

- 与设备交换数据（字节序转换、分组读写、驱动绑定）由使用方的 IO 层负责，它通过本接口和 `buffer` 操作 tdata（包提供按条目的字节序转换函数，见 design.md §6）；
- 调度、规则、计时不属于本接口。
