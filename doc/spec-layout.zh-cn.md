# 布局规范

> 本文规定布局的描述、登记域、注册和布局对象，是 [spec.zh-cn.md](spec.zh-cn.md) 的细化。由布局创建的数据对象（Ldata / Ltag）见 [spec-data-api.zh-cn.md](spec-data-api.zh-cn.md)，实现见 [design.zh-cn.md](design.zh-cn.md) §3。

## 1. 流程

流程是**创建登记域，注册一次，取得布局，由布局创建**：先描述布局（§2 到 §4），创建一个登记域，用它的一次 `register_layout` 调用把布局全部注册（§5），此后用登记域的 `get_layout("Pump")` 按名取得布局，再用它的 `create_ldata("pump_1")` 创建数据块（[spec-data-api.zh-cn.md](spec-data-api.zh-cn.md) §2.1）。使用方需要知道的是怎样把布局表达成 YAML 结构、它叫什么名字、注册在哪个登记域；它是否经过编译、编译成什么，不属于这个流程。

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
- 描述对象的声明是 `Layout_Description`：`layouts` 是布局名到条目列表的映射，每个片段是一个条目列表。类型声明里登记域的 `register_layout` 的参数用它标注（`string | Layout_Description` 或它们的列表），所以编辑器会补全条目的字段，拼错字段名时会提示；
- 登记域的 `register_layout` 返回的 `fragments` 里是引用展开后的条目：`includes` 和 `coupling` 都是条目列表，不会是名称，每个 `length` 都存在。它们的声明仍然是 `Layout_Item`。

## 4. 合法性

- 布局名是 JavaScript 的标识符（任何文字的字母、数字、`_` 和 `$`，不以数字开头），因为布局名是类型名的一部分（§8）；
- tag 名是标识符（字母、数字和 `_`，不以数字开头；数字、空名和缺少 name 都不是），唯一，且不是保留名（[spec-data-api.zh-cn.md](spec-data-api.zh-cn.md) §2.10）；
- 非 Bool 的 tag 之间字节范围互不重叠；每一位最多属于一个 Bool；
- Bool 落在某个非 Bool tag 的字节范围内时，必须是该 tag（组合字）的组成位；组合字的每个组成位都必须落在该字的范围内；
- 组合字与它的组成位只能由一方给出初值：组合字给出时，组成位的初值由整字决定；组合字不给出时，由各组成位给出（未给出的位为 `false`），整字的初值由它们合成；
- 布局总长是整数个寄存器（16 位的整数倍）；
- 引用的片段必须存在，片段之间不得循环引用。

## 5. 登记域与注册

```js
import { create_scope, get_scope } from "layout-data";
const scope = create_scope("lib_a");                              // 创建登记域
scope.register_layout(["common.yaml", "pump.yaml"]);              // 每个登记域注册一次
const pump = scope.get_layout("Pump").create_ldata("pump_1");     // 此后取得布局，由它创建
get_scope("lib_a").get_layout("Pump");                            // 在别处按登记域名取得登记域
```

### 5.1 登记域

登记域（`Layout_Scope`）是布局名的分隔单位，让基于 layout-data 的库能自带并自己注册布局，应用可以在同一进程里组合多个这样的库。

- 每个登记域有自己的布局和片段：布局名和片段名只在登记域内唯一，一个登记域的布局只能引用本登记域的片段，不同登记域里的同名布局、同名片段互不冲突；
- **没有默认登记域。** 布局只能注册到显式创建的登记域里，应用也要创建自己的登记域；包不提供全局的注册、取得布局和类型生成，它们都是登记域的方法；
- `create_scope(name)` 创建登记域。登记域名和布局名一样必须是 JavaScript 的标识符（§4），所以不含 `.`；包名这类含 `@`、`/`、`-` 的字符串不能直接用作登记域名。登记域名在进程内唯一，由创建它的库或应用选择；不是字符串时抛出 `TypeError`，不是标识符时抛出 `Error`，已被别的登记域使用时抛出 `Error`（`a scope is already named X`）。登记域创建后一直存在，不能删除；
- `get_scope(name)` 返回已创建的那个登记域，没有这个名字的登记域时返回 `undefined`，所以也可以用来判断登记域是否存在；
- 登记域的成员：只读的 `name`，即登记域名；`register_layout(descriptions)`，注册布局（§5.2）；`get_layout(name)`，按布局名（不带登记域名）取得本登记域的布局；`render_types(options)`，为本登记域的全部布局生成类型声明（§8）。登记域对象是冻结的：任何模块都能按名取得它，但不能替换它的方法和属性，修改抛出 `TypeError`。`Layout_Scope` 只作为类型导出，登记域只由 `create_scope` 产生；
- 布局的 `scope` 是它所属的登记域（§7）。错误信息写成 `登记域名.布局名` 来指出布局，例如 `unknown layout lib_a.Pump`、`lib_a.Pump: changes do not settle after 16 rounds`；布局名本身仍是 `Pump`；
- 谁可以向哪个登记域注册，本包不作规定：任何取得登记域的一方都能向它注册，冲突只由"每个登记域只注册一次"保证（§5.2），第二次注册总是报错。库要防止自己的布局被别人决定，就在创建登记域时立即注册，例如在模块顶层创建后紧接着注册，此前别的代码取不到这个登记域；库也可以把登记域留给使用方注册，例如让使用方在库的描述之外补充自己的布局。库与使用方如何交互，由库自行约定。

### 5.2 注册

`scope.register_layout(descriptions)` 把各描述中的布局注册到登记域。布局注册之后才能使用。

- `descriptions`：一份描述，或描述的列表；每份描述是**字符串，即描述文件的路径**，或是**对象，即描述对象**（§2 的结构：`layouts` 加各片段；在代码里给条目也是这样，§6）。列表里不能再放列表，空列表是错误。字符串永远是路径，不是 YAML 文本；
- **每个登记域只能调用一次。** 布局一次注册，登记域的布局和片段就是同时全部已知的，不依赖调用的先后。第二次调用抛出 `Error`（`register_layout can be called only once in scope X`），第一次登记的布局保持不变。失败的调用什么都不登记，也不算用掉这一次，所以可以在同一登记域重试，例如自己的文件不合法时改用备用描述；
- **先合并描述，再解析。** 先收集所有描述的布局和片段，然后才解析片段引用，所以布局可以引用任何描述中的片段，与列表的顺序无关。描述不必有 `layouts` 键（只放公共片段的文件就没有），但至少要有一份描述定义了布局；
- 两份描述里出现同名片段或同名布局是错误，错误信息写出这两份描述（描述文件用路径，描述对象用它在列表中的位置，如 `layout description #2`）；不做覆盖；
- 每个布局都要校验（§4），省略的 `length` 会补全，传入的描述不会被修改；
- 有任何违规时抛出 `Error`，其 `errors` 属性列出所有描述的全部违规项，且什么都不登记：这些描述要么全部登记，要么都不登记。读不到的文件和 YAML 语法错误也是违规。错误的标题写出登记域名（如 `invalid layout descriptions of scope lib_a`）；布局和片段方面的错误写出布局或片段的名字，不写文件名；
- 返回值：`{ layouts, fragments }`，包含所有描述。`layouts` 是按名字索引的已登记布局，与 `scope.get_layout(name)` 返回的相同；`fragments` 是按片段名索引的条目列表（展开引用后，偏移相对于片段起点），供使用方查询，例如取得参数块的全部 tag 名。上面的流程不需要它们；
- 布局在进程的整个生命期内保持登记。`scope.get_layout(name)` 返回已登记的布局（只读，§7），名字未登记时抛出 `unknown layout X.Y`（X 是登记域名，Y 是布局名）；
- 只注册一次的后果：改过的布局文件只在新进程里生效（没有热重载，REPL 里也无法在同一登记域重新注册改过的布局）；
- 依赖树里有两份本包时（例如不同版本各装一份），两份互不相通：各有自己的登记域，用一份注册的布局，另一份按名找不到。

## 6. 在代码中定义布局

布局不一定要有文件。把一个描述对象，即 §2 的结构，交给登记域的 `register_layout`（§5.2），每个布局的条目是它名字下的一个列表：

```js
const scope = create_scope("app");
scope.register_layout({
  layouts: {
    Pump: [
      { name: "id", type: "UInt", offset: 0, init_value: 0 },
      { name: "pressure", type: "Real", offset: 32, init_value: 0 },
    ],
  },
});
const data = scope.get_layout("Pump").create_ldata("pump_1");
```

- 条目就是 §3 的条目；`length` 可以省略；`coupling` 和 `includes` 接受内联列表，或同一次注册的任一描述中某个片段的名字；
- 传入的描述对象和其中的条目不会被修改；
- 没有单独登记一个条目列表的函数，也没有单独展开或校验结构的函数：注册是唯一做校验的步骤（§5.2）。

## 7. 布局对象

布局（`Layout`）是带方法的只读对象，只公开下面这些成员：

| 成员 | 说明 |
| --- | --- |
| `name` | 布局名 |
| `scope` | 布局所属的登记域（§5.1），只读；登记域名是 `layout.scope.name` |
| `length` | 总长，单位为位 |
| `size` | 总字节数 |
| `items` | 展开后的 tag 描述列表，按布局顺序（组合字在其组成位之前） |
| `create_ldata(name)` | 创建该布局的一个 ldata（[spec-data-api.zh-cn.md](spec-data-api.zh-cn.md) §2.1） |
| `io_index_table(endian)` | 与设备整块交换用的字节下标表（[spec-data-api.zh-cn.md](spec-data-api.zh-cn.md) §2.9）；`endian` 不是四种字节序之一时抛出 `RangeError` |

- `items` 的每一项有：`name`；`type`（保持描述中的写法，不改大小写，而 `Ltag.type` 总是小写）；`offset`（绝对位偏移，字节位置是 `offset >> 3`）；`length`（位）；`init_value`；`comment`（如果给出）；`coupling`（组合字：其组成位的 tag 名；组成位：它所属的组合字的 tag 名）。`includes` 和 `name_prefix` 已经展开，不再出现；
- 布局及其 `items` 是深度冻结的，修改它们抛出 `TypeError`；
- `Layout` 只作为类型导出，不作为可构造的值导出：布局只由注册产生（§5.2）；
- 不同登记域可以各有一个同名的布局，它们是不同的布局，各自创建的 ldata 也各有自己的类。所以按布局归类时，要用布局对象，或登记域名加布局名，只按布局名归类会把它们混在一起，例如 `Ldata.on_access` 的观察者（[spec-data-api.zh-cn.md](spec-data-api.zh-cn.md) §2.8）；
- 布局不公开按名索引表、字节位置、位掩码、编解码器等内部数据，使用方不需要了解它们：按名访问用 `data.get(name)` 取得 Ltag，与设备交换数据用 `load_tag` / `store_tag` 或 Ltag 的 `load` / `store`（[spec-data-api.zh-cn.md](spec-data-api.zh-cn.md) §2.9）。

## 8. 供编辑器使用的类型声明

`scope.render_types(options)` 为登记域的全部布局返回一份 TypeScript 声明文件（`.d.ts`）的文本，让编辑器能补全数据块的 tag。它是构建程序时用的辅助：布局注册之后，程序把文本写到代码旁边的文件里，例如 `layout_types.d.ts`。声明只供编辑器读取类型，所以总是为整个登记域生成，不能只为部分布局生成，多出来的类型无害。

- 每个布局生成 `<布局>_Tags` 和 `<布局>_Ldata`：前者是接口，每个 tag 一个属性（Bool 是 `boolean`，其余类型都是 `number`；`comment` 成为该属性的文档注释），后者是 `Ldata & <布局>_Tags`；
- 布局名原样使用，大小写不变：布局 `Pump` 生成 `Pump_Tags` 和 `Pump_Ldata`，`my_block` 生成 `my_block_Tags`，`Pump_Station` 生成 `Pump_Station_Tags`。大小写风格由调用者决定，建议用 `Snake_Pascal_Case`，也就是本包类型名的风格，库不强制。它就是 `scope.get_layout("Pump")` 里写的名字，同一登记域里名字不同的两个布局不会生成同名的类型；
- 不同登记域的同名布局生成同名的类型，所以每个登记域生成到自己的文件，由 import 路径区分，例如库的 `lib_a/layout_types.d.ts` 和应用的 `layout_types.d.ts` 各有一个 `Pump_Ldata`；
- 布局名和 tag 名都是标识符（§3、§4），所以原样作为类型名的一部分和属性名。注释里的 `*/` 会被转义，所以生成的文本总是合法的声明文件；
- `options.source` 在文本的头部注释里写出布局文件的名字，省略时头部只说明这是生成的文本。`options.ldata_module` 是文本导入 `Ldata` 的模块说明符，相对于输出文件，默认是 `"layout-data"`。两个选项以及 `options` 参数本身都可以省略。

怎样使用这些类型。`scope.get_layout("Pump").create_ldata("pump_1")` 的类型是 `Ldata`：`create_ldata` 的声明不能随布局返回不同的类型，所以值的类型要手工指定一次。在 JavaScript 里用 JSDoc 类型转换就够了，编辑器能据此补全 tag；文件开启检查（`checkJs` 或 `// @ts-check`）时，还能指出拼错的 tag 和类型不对的值：

```js
const pump = /** @type {import("./layout_types.js").Pump_Ldata} */ (scope.get_layout("Pump").create_ldata("pump_1"));
pump.pressure = 1.5;   // 会补全，且知道它是数字
```

括号是 JSDoc 类型转换的一部分。把 `/** @type {...} */` 写在 `const pump = scope.get_layout("Pump").create_ldata(...)` 上面也能补全，但开启检查的文件会报“`Ldata` 不能赋给 `Pump_Ldata`”。

在 TypeScript 里写 `const pump = scope.get_layout("Pump").create_ldata("pump_1") as Pump_Ldata;`。

## 9. 错误

登记域的创建、布局的注册、查找和类型声明生成出错时抛出异常：

| 情况 | 异常 |
| --- | --- |
| `create_scope` 的登记域名不是字符串 | `TypeError`（§5.1） |
| `create_scope` 的登记域名不是标识符，或已被别的登记域使用 | `Error`（§5.1） |
| `scope.get_layout` 的名字在该登记域中未登记 | `Error`（`unknown layout X.Y`，§5.2） |
| 布局不合法、tag 名是保留名（[spec-data-api.zh-cn.md](spec-data-api.zh-cn.md) §2.10） | `scope.register_layout` 抛出带 `errors` 的 `Error`，什么都不登记（§5.2） |
| `scope.register_layout` 在该登记域成功登记之后再次调用 | `Error`，第一次登记的布局保持不变（§5.2） |
