# 布局规范

> 本文规定布局的描述、注册和布局对象，是 [spec.zh-cn.md](spec.zh-cn.md) 的细化。由布局创建的数据对象（Ldata / Ltag）见 [spec-data-api.zh-cn.md](spec-data-api.zh-cn.md)，实现见 [design.zh-cn.md](design.zh-cn.md) §3。

## 1. 流程

流程是**注册一次，取得布局，由布局创建**：先描述布局（§2 到 §4），用一次 `register_layout` 调用把它们全部注册（§5），此后用 `get_layout("Pump")` 按名取得布局，再用它的 `create_ldata("pump_1")` 创建数据块（[spec-data-api.zh-cn.md](spec-data-api.zh-cn.md) §2.1）。使用方需要知道的是怎样把布局表达成 YAML 结构、它叫什么名字；它是否经过编译、编译成什么，不属于这个流程。

## 2. 结构

一份描述可以同时定义多个布局。它有结构相同的两种形式：**描述文件**是 YAML 1.2 文件，按路径给出；**描述对象**是代码中的同一结构（§6）。结构是：

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

一份描述可以自成一体，也可以是一起注册的多份描述之一（§5）：描述里可以只有片段、只有布局，或者两者都有，每份描述的片段对所有描述的布局都可用。

## 3. 条目

| 字段 | 说明 |
| --- | --- |
| `name` | tag 名：字母、数字和 `_`，不以数字开头，是所有语言都认的标识符，所以 tag 总能写成 `data.名字`，也与 PLC 数据块里的字段一致。同一布局内唯一，不得是保留名（[spec-data-api.zh-cn.md](spec-data-api.zh-cn.md) §2.10）。设备点表里点位的名字若不同，把那个名字写进 `comment` |
| `type` | [spec-data-api.zh-cn.md](spec-data-api.zh-cn.md) §1 所列类型之一，大小写不敏感 |
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

- `coupling` 是片段名或内联的 tag 条目列表，不能是名称列表：各位的名称是注册的结果（出现在 `Layout_Tag.coupling` 里，§7），不是输入；
- 描述对象的声明是 `Layout_Description`：`layouts` 是布局名到条目列表的映射，每个片段是一个条目列表。类型声明里 `register_layout` 的参数用它标注（`string | Layout_Description` 或它们的列表），所以编辑器会补全条目的字段，拼错字段名时会提示；
- `register_layout` 返回的 `fragments` 里是引用展开后的条目：`includes` 和 `coupling` 都是条目列表，不会是名称，每个 `length` 都存在。它们的声明仍然是 `Layout_Item`。

## 4. 合法性

- 布局名是 JavaScript 的标识符（任何文字的字母、数字、`_` 和 `$`，不以数字开头），因为布局名是类型名的一部分（§8）；
- tag 名是标识符（字母、数字和 `_`，不以数字开头；数字、空名和缺少 name 都不是），唯一，且不是保留名（[spec-data-api.zh-cn.md](spec-data-api.zh-cn.md) §2.10）；
- 非 Bool 的 tag 之间字节范围互不重叠；每一位最多属于一个 Bool；
- Bool 落在某个非 Bool tag 的字节范围内时，必须是该 tag（组合字）的组成位；组合字的每个组成位都必须落在该字的范围内；
- 组合字与它的组成位只能由一方给出初值：组合字给出时，组成位的初值由整字决定；组合字不给出时，由各组成位给出（未给出的位为 `false`），整字的初值由它们合成；
- 布局总长是整数个寄存器（16 位的整数倍）；
- 引用的片段必须存在，片段之间不得循环引用。

## 5. 注册

```js
register_layout("pump.yaml");                                     // 一个文件
register_layout(["common.yaml", "pump.yaml", "valve.yaml"]);      // 多个文件
register_layout(["common.yaml", { layouts: { INLINE: [...] } }]); // 描述文件和描述对象混用
const pump = get_layout("Pump").create_ldata("pump_1");           // 此后取得布局，由它创建
```

`register_layout(descriptions)` 注册各描述中的布局。布局注册之后才能使用。

- `descriptions`：一份描述，或描述的列表；每份描述是**字符串，即描述文件的路径**，或是**对象，即描述对象**（§2 的结构：`layouts` 加各片段；在代码里给条目也是这样，§6）。列表里不能再放列表，空列表是错误。字符串永远是路径，不是 YAML 文本；
- **每个进程只能调用一次。** 布局一次注册，布局和片段就是同时全部已知的，不依赖调用的先后。第二次调用抛出 `Error`（`register_layout can be called only once`），第一次登记的布局保持不变。失败的调用什么都不登记，也不算用掉这一次，所以程序可以接着注册别的内容，例如自己的文件不合法时改用默认描述；
- **先合并描述，再解析。** 先收集所有描述的布局和片段，然后才解析片段引用，所以布局可以引用任何描述中的片段，与列表的顺序无关。描述不必有 `layouts` 键（只放公共片段的文件就没有），但至少要有一份描述定义了布局；
- 两份描述里出现同名片段或同名布局是错误，错误信息写出这两份描述（描述文件用路径，描述对象用它在列表中的位置，如 `layout description #2`）；不做覆盖；
- 每个布局都要校验（§4），省略的 `length` 会补全，传入的描述不会被修改；
- 有任何违规时抛出 `Error`，其 `errors` 属性列出所有描述的全部违规项，且什么都不登记：这些描述要么全部登记，要么都不登记。读不到的文件和 YAML 语法错误也是违规。布局和片段方面的错误写出布局或片段的名字，不写文件名；
- 返回值：`{ layouts, fragments }`，包含所有描述。`layouts` 是按名字索引的已登记布局，与 `get_layout(name)` 返回的相同；`fragments` 是按片段名索引的条目列表（展开引用后，偏移相对于片段起点），供使用方查询，例如取得参数块的全部 tag 名。上面的流程不需要它们；
- 布局名在进程的整个生命期内保持登记。`get_layout(name)` 返回已登记的布局（只读，§7），名字未登记时抛出 `unknown layout X`；
- 只注册一次的后果：改过的布局文件只在新进程里生效（没有热重载，REPL 或测试里也无法重新注册改过的布局）；基于 layout-data 的库不能自己调用 `register_layout`，只能导出它的描述文件路径，由应用放进 `descriptions`。
- 依赖树里有两份本包时（例如不同版本各装一份），两份互不相通：各能调用一次 `register_layout`，用一份注册的布局，另一份按名找不到。

## 6. 在代码中定义布局

布局不一定要有文件。把一个描述对象，即 §2 的结构，交给 `register_layout`（§5），每个布局的条目是它名字下的一个列表：

```js
register_layout({
  layouts: {
    Pump: [
      { name: "id", type: "UInt", offset: 0, init_value: 0 },
      { name: "pressure", type: "Real", offset: 32, init_value: 0 },
    ],
  },
});
const data = get_layout("Pump").create_ldata("pump_1");
```

- 条目就是 §3 的条目；`length` 可以省略；`coupling` 和 `includes` 接受内联列表，或任一描述中某个片段的名字；
- 传入的描述对象和其中的条目不会被修改；
- 没有单独登记一个条目列表的函数，也没有单独展开或校验结构的函数：注册是唯一做校验的步骤（§5）。

## 7. 布局对象

布局（`Layout`）是带方法的只读对象，只公开下面这些成员：

| 成员 | 说明 |
| --- | --- |
| `name` | 布局名 |
| `length` | 总长，单位为位 |
| `size` | 总字节数 |
| `items` | 展开后的 tag 描述列表，按布局顺序（组合字在其组成位之前） |
| `create_ldata(name)` | 创建该布局的一个 ldata（[spec-data-api.zh-cn.md](spec-data-api.zh-cn.md) §2.1） |
| `io_index_table(endian)` | 与设备整块交换用的字节下标表（[spec-data-api.zh-cn.md](spec-data-api.zh-cn.md) §2.9）；`endian` 不是四种字节序之一时抛出 `RangeError` |

- `items` 的每一项有：`name`；`type`（保持描述中的写法，不改大小写，而 `Ltag.type` 总是小写）；`offset`（绝对位偏移，字节位置是 `offset >> 3`）；`length`（位）；`init_value`；`comment`（如果给出）；`coupling`（组合字：其组成位的 tag 名；组成位：它所属的组合字的 tag 名）。`includes` 和 `name_prefix` 已经展开，不再出现；
- 布局及其 `items` 是深度冻结的，修改它们抛出 `TypeError`；
- `Layout` 只作为类型导出，不作为可构造的值导出：布局只由注册产生（§5）；
- 布局不公开按名索引表、字节位置、位掩码、编解码器等内部数据，使用方不需要了解它们：按名访问用 `data.get(name)` 取得 Ltag，与设备交换数据用 `load_tag` / `store_tag` 或 Ltag 的 `load` / `store`（[spec-data-api.zh-cn.md](spec-data-api.zh-cn.md) §2.9）。

## 8. 供编辑器使用的类型声明

`render_types(layouts, options)` 返回一份 TypeScript 声明文件（`.d.ts`）的文本，让编辑器能补全数据块的 tag。它是构建程序时用的辅助：布局注册之后，程序把文本写到代码旁边的文件里，例如 `layout_types.d.ts`。`layouts` 就是 `register_layout` 返回的 `layouts`。

- 每个布局生成 `<布局>_Tags` 和 `<布局>_Ldata`：前者是接口，每个 tag 一个属性（Bool 是 `boolean`，其余类型都是 `number`；`comment` 成为该属性的文档注释），后者是 `Ldata & <布局>_Tags`；
- 布局名原样使用，大小写不变：布局 `Pump` 生成 `Pump_Tags` 和 `Pump_Ldata`，`my_block` 生成 `my_block_Tags`，`Pump_Station` 生成 `Pump_Station_Tags`。大小写风格由调用者决定，建议用 `Snake_Pascal_Case`，也就是本包类型名的风格，库不强制。它就是 `get_layout("Pump")` 里写的名字，名字不同的两个布局不会生成同名的类型；
- `layouts` 的键作为布局名使用，必须是 JavaScript 的标识符。已登记的布局名都是标识符（§4），所以只有另给的键才可能不合格；这时抛出 `Error`，其 `errors` 列出全部这样的键。tag 名一定是标识符（§3），所以原样作为属性名。注释里的 `*/` 会被转义，所以生成的文本总是合法的声明文件；
- `options.source` 在文本的头部注释里写出布局文件的名字，省略时头部只说明这是生成的文本。`options.ldata_module` 是文本导入 `Ldata` 的模块说明符，相对于输出文件，默认是 `"layout-data"`。两个选项以及 `options` 参数本身都可以省略。

怎样使用这些类型。`get_layout("Pump").create_ldata("pump_1")` 的类型是 `Ldata`：`create_ldata` 的声明不能随布局返回不同的类型，所以值的类型要手工指定一次。在 JavaScript 里用 JSDoc 类型转换就够了，编辑器能据此补全 tag；文件开启检查（`checkJs` 或 `// @ts-check`）时，还能指出拼错的 tag 和类型不对的值：

```js
const pump = /** @type {import("./layout_types.js").Pump_Ldata} */ (get_layout("Pump").create_ldata("pump_1"));
pump.pressure = 1.5;   // 会补全，且知道它是数字
```

括号是 JSDoc 类型转换的一部分。把 `/** @type {...} */` 写在 `const pump = get_layout("Pump").create_ldata(...)` 上面也能补全，但开启检查的文件会报“`Ldata` 不能赋给 `Pump_Ldata`”。

在 TypeScript 里写 `const pump = get_layout("Pump").create_ldata("pump_1") as Pump_Ldata;`。

## 9. 错误

布局的注册、查找和类型声明生成出错时抛出异常：

| 情况 | 异常 |
| --- | --- |
| `get_layout` 的名字未登记 | `Error`（`unknown layout X`，§5） |
| 布局不合法、tag 名是保留名（[spec-data-api.zh-cn.md](spec-data-api.zh-cn.md) §2.10） | `register_layout` 抛出带 `errors` 的 `Error`，什么都不登记（§5） |
| `register_layout` 在成功登记之后再次调用 | `Error`，第一次登记的布局保持不变（§5） |
| `render_types` 的 `layouts` 有不是标识符的键 | `Error`，其 `errors` 列出全部这样的键（§8） |
