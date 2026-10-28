# 描述规范

> 本文规定描述，即布局和 ldata 实例在装入登记域之前的形式：描述文件与 YAML 文本，`yaml` 与 `desc_file` 编译出的 `Description`，`imports`、`layouts`、`item_tables`、`blocks` 四个根键，条目，引入与遍历，以及描述必须满足的规则，是 [spec.zh-cn.md](spec.zh-cn.md) 的细化。装入和由此登记的布局对象见 [spec-layout.zh-cn.md](spec-layout.zh-cn.md)，实现见 [design.zh-cn.md](design.zh-cn.md) §3。

## 1. 形式与编译

描述只有一种形式：**YAML 1.2 文本**，写在**描述文件**里，或写在代码里。JSON 是合法的 YAML 1.2，所以 JSON 文本和 `.json` 文件也是合法的描述。

一份描述连同它引入的描述（§4）是完整的：编译它只需要它自己和它的 `imports`，结果只由这些内容决定，与它和谁一起装入、装入哪个登记域无关。运行时入口 `layout-data` 的 `yaml` 和 `desc_file` 读取一份描述并编译，返回 `Description`（§1.2），由登记域的 `load` 装入（[spec-layout.zh-cn.md](spec-layout.zh-cn.md) §3）。

### 1.1 yaml 与 desc_file

```js
import { create_scope, desc_file, yaml } from "layout-data";

const scope = create_scope("app");
scope.load([
  desc_file`pump.yaml`,
  yaml`
imports:
  - ${new URL("common.yaml", import.meta.url)}
layouts: [Valve]
item_tables:
  Valve:
    - { includes: common_head, offset: 0 }
    - { name: opening, type: Real, offset: 32 }
`,
]);
```

- `yaml` 读取一份写在代码里的描述，即 YAML 1.2 文本。它是模板字面量的标签，``yaml`...` ``，也可以用文本普通调用，`yaml(text)`；
- `desc_file` 读取一个描述文件。它也是标签，``desc_file`pump.yaml` ``，也可以用路径字符串或 `file:` URL 普通调用，`desc_file(new URL("./pump.yaml", import.meta.url))`。相对路径按当前工作目录解析。一次调用读一个文件：多个文件就是多次调用，由调用方放进一个列表；
- 作为标签时，两者取模板的原始文本，与 `String.raw` 相同：反斜杠按原样保留，所以 Windows 路径和 YAML 双引号字符串的转义原样到达文件系统和 YAML 解析器。插值按字符串放进文本；
- 所以模板里的文本按 YAML 解释，不按 JavaScript 解释：`\t`、`\n` 这样的转义只在 YAML 的双引号字符串里表示制表符、换行。单引号字符串和不加引号的标量按原样保留反斜杠，也不报错，所以在 JavaScript 字符串里看起来一样的写法，在这里得到的是另一个值：

  ```yaml
  comment: "tab\tdone"  # "tab<TAB>done"，制表符
  comment: 'tab\tdone'  # "tab\\tdone"，反斜杠和 t
  comment: tab\tdone    # "tab\\tdone"，反斜杠和 t
  ```

  用字符串普通调用时，`yaml(text)` 拿到的是 JavaScript 已经处理过转义的文本，与任何字符串相同；
- 两者都在调用时完成全部与登记域无关的工作：读取文件、解析 YAML、读取引入的描述（§4）、遍历和校验条目表、编译布局、检查 `blocks`（§5.3）。有任何错误时抛出 `Error`，其 `errors` 属性列出全部错误，不在第一个错误处中断。`yaml` 的标题是 `invalid YAML text`，`desc_file` 的是 `invalid description file <路径>`。其他类型的参数抛出 `TypeError`；
- 来自文件的错误以该文件的路径开头，被引入的文件也用它自己的路径；布局和条目表方面的错误写出布局或条目表的名字。错误文本在路径之后的格式不是稳定接口，程序只应依赖 `errors` 是否存在及其条数。

### 1.2 Description

`yaml` 和 `desc_file` 返回一份描述编译后的结果 `Description`。它是 YAML 解析出的根对象，其中只有 `layouts` 换成了编译的结果，其余根键原样保留（`blocks` 缺省时补为 `[]`）：

```js
/**
 * @typedef {Omit<Layout, "scope">} Layout_Desc     // one compiled layout, not bound to a scope
 * @typedef {{ name: string, layout: string } & Record<string, unknown>} Block_Desc
 * @typedef {{ layouts: Record<string, Layout_Desc>, blocks: Block_Desc[] } & Record<string, unknown>} Description
 */
```

- `layouts` 是这份描述的布局名到尚未绑定登记域的布局的映射，键就是根键 `layouts` 列出的名字，顺序也相同。这些布局已经遍历、校验、编译，只差登记域：它们有布局对象的 `name`、`length`、`size`、`items` 和 `io_index_table`（[spec-layout.zh-cn.md](spec-layout.zh-cn.md) §4），但不属于任何登记域，所以不能创建 ldata，`create_ldata` 抛出 `Error`。使用的布局只从登记域取得（装入的结果或 `get_layout`）；
- `blocks` 是解析出的根键 `blocks` 本身，经过检查（§2、§5.3），不复制也不改动，保留应用自己的键；块的 `layout` 仍是布局名字符串，读入时只检查它在本描述的 `layouts` 中，不替换为布局。原文没有 `blocks` 时它是 `[]`，这是 `layouts` 之外唯一的改变。应用读取自己的键时，用这里的值还是自己解析描述，由应用决定；
- 其余根键原样保留：`imports`、`item_tables` 和应用自己的根键都是 YAML 解析出的值，`imports` 是原文中的路径，`item_tables` 是未展开的条目。应用读取自己的根键不必再解析一次 YAML。只保留被读入的描述自己的根键，被引入描述的根键不并入。本包只读 `layouts` 和 `blocks`，不读其他根键；
- `Description` 及其中的一切都是深度冻结的，原样保留的根键也是如此。装入从不改动它（[spec-layout.zh-cn.md](spec-layout.zh-cn.md) §3），所以同一个 `Description` 可以缓存，并装入任意多个登记域；
- 编译出的布局与描述的内容在内存上无关，一份描述编译出的布局不受其他描述影响；
- `desc_file` 返回的 `Description` 记得它的文件，所以装入的错误和生成的类型的头部（[spec-layout.zh-cn.md](spec-layout.zh-cn.md) §5）用路径称呼它；
- `Description` 只由 `yaml` 和 `desc_file` 产生：手写的同样形状的对象不是 `Description`，装入时是违规。

## 2. 结构

描述的根是映射，本包只读取其中四个根键：

- **`imports`**：被引入的描述文件的路径列表（§4）。被引入的描述只提供条目表；
- **`layouts`**：布局名的列表。列出的每个名字都是一个条目表的名字，这个条目表编译为同名的布局；
- **`item_tables`**：条目表名到条目表的映射。**条目表**是条目的列表（§3），供 `layouts` 列为布局，或供条目的 `includes`、`coupling` 按名引用；
- **`blocks`**：这份描述的 ldata 实例的列表。每个块是一个映射，本包只读其中的 `name`（实例名）和 `layout`（本描述的布局名）；块的 ldata 在装入时创建在描述装入的登记域中（[spec-layout.zh-cn.md](spec-layout.zh-cn.md) §3）。

```yaml
imports:
  - common.yaml

layouts: [NODE]

item_tables:
  NODE:
    - { name: ID, type: UInt, offset: 0, init_value: 0 }
    - name: response_code
      type: Word
      offset: 128
      coupling: node_commands
    - { includes: node_parameters, offset: 144 }

  node_commands:
    - { name: stop_pumps, type: Bool, offset: 8, init_value: false, comment: Stop pump command }
    - { name: cancel_stop, type: Bool, offset: 9, comment: Cancel stop pump }

  node_parameters:
    - { name: max_pressure, type: Real, offset: 0, init_value: 10 }

blocks:
  - { name: node_1, layout: NODE, unit_id: 1 }   # unit_id is read by the application
```

- 布局和被引用的条目表是同一种东西，差别只在用法：一个条目表可以既列在 `layouts` 里，又被别的条目表引用；
- 四个根键都可以省略。没有 `layouts` 的描述没有布局，例如只放公共条目表、供别的描述引入的文件。块只引用本描述的布局（§5.3），所以有 `blocks` 的描述也要有列出这些布局的 `layouts`；
- 其余根键都归调用方：本包不读取、不校验，原样留在 `Description` 中（§1.2），条目表名也不会与它们冲突。块条目中 `name`、`layout` 以外的键同样归调用方，例如设备模拟器的 Modbus 地址；
- `item_tables` 中，本包只读取从 `layouts` 出发遍历到的条目表（§4）；
- 根键的顺序不影响含义。**建议按 `imports`、`layouts`、`item_tables`、`blocks` 的顺序写**：读者先看到依赖和有哪些布局，再按名字找到各条目表，最后是实例。本文的示例都按这个顺序写。

## 3. 条目

条目表的每个元素是一个条目：

| 字段 | 说明 |
| --- | --- |
| `name` | tag 名。它是所有语言都认的标识符（§5.2），所以 tag 总能写成 `data.名字`，也与 PLC 数据块里的字段一致。设备点表里点位的名字若不同，把那个名字写进 `comment` |
| `type` | [spec-data-api.zh-cn.md](spec-data-api.zh-cn.md) §1 所列类型之一，大小写不敏感 |
| `offset` | 位偏移；非 Bool 必须在整字节上，多字节类型必须从偶数字节开始 |
| `length` | 位长，可省略，省略时由类型决定；写出时须与类型一致 |
| `init_value` | 初值；给出时须是该类型可表示的值（整型是范围内的整数，`Real` 是 float32 范围内的有限数）。可以省略：此时布局不给该 tag 初值，它在数据块中从 `0` 开始（`Bool` 为 `false`）；组合字与组成位见 §5.2 |
| `comment` | 可选的说明文字，供生成点表、类型声明等使用 |
| `coupling` | 组合字的组成位：条目表名或内联条目列表，各位的 `offset` 相对于该字 |
| `is_combined` | 可选，说明性标记（整字与各位双向联动的组合字）；联动由 `coupling` 决定，不依赖它 |
| `includes` | 与 `offset`（可加 `name_prefix`）一起，把条目表名或内联列表指定的条目整体偏移后拼接进来 |

被引用的条目表中的条目也可以引用其他条目表。

条目有两种：

| 条目 | 字段 |
| --- | --- |
| tag | `name`、`type`、`offset` 必填；`length`、`init_value`、`comment`、`is_combined`、`coupling` 可选；没有 `includes` |
| 包含 | `includes` 和 `offset` 必填；`name_prefix` 可选；没有 `name` 和 `type` |

`coupling` 是条目表名或内联的 tag 条目列表，不能是名称列表：各位的名称是编译的结果（出现在布局的 `items` 里，[spec-layout.zh-cn.md](spec-layout.zh-cn.md) §4），不是输入。

## 4. 引入与遍历

一份描述用 `imports` 引入别的描述文件，以使用其中的条目表：

```yaml
imports:
  - common.yaml
layouts: [Pump]
item_tables:
  Pump:
    - { includes: Motor_Status, offset: 0 }   # from common.yaml
```

- **路径。** `imports` 的每一项是一个路径字符串：绝对路径、`file:` URL，或相对路径。描述文件里的相对路径相对于该文件所在的目录。``yaml`...` `` 写的文本没有所在的文件，其中的相对路径是违规；需要相对位置的调用方自己插值，如 `${new URL("common.yaml", import.meta.url)}`；
- **只提供条目表。** 被引入描述的 `layouts` 和 `blocks` 一律忽略：布局只来自引入方的 `layouts`，实例只来自引入方的 `blocks`；
- **传递引入。** 被引入的描述可以再有 `imports`。一份描述连同它直接和间接引入的全部描述构成一个名字空间；同一个文件（按解析后的路径）无论被引入几次，都只算一份，所以两份被引入的描述引入同一个文件不是冲突。循环引入是违规；
- **遍历。** 从引入方 `layouts` 列出的名字出发，顺着条目中 `includes` 和 `coupling` 给出的条目表名，找到所有被引用的条目表。只有遍历到的条目表被读取、校验；内联列表中的条目也照此遍历。所以引入一份大的公共描述，不会把其中与本描述无关的条目带进布局，公共描述可以放心做大；
- **按名查找。** 一个名字在这个名字空间内全部描述的 `item_tables` 中查找，与引入的顺序无关。其他根键无论叫什么名字，都不参与查找；
- **只比较遍历到的名字。** 遍历到的条目表必须恰好在名字空间内的一份描述中定义：在本地和被引入的描述中都有定义，或在两份被引入的描述中都有定义，都是违规，不引入限定名。没有遍历到的条目表不比较；
- 条目表名只需在一份描述及其引入范围内唯一，不同描述各自的名字空间互不相干。

## 5. 合法性

违反下列任何一条都是违规。§5.1 至 §5.3 的违规由 `yaml` 和 `desc_file` 在读入时报告（§1.1）；装入时只检查与登记域状态有关的规则（[spec-layout.zh-cn.md](spec-layout.zh-cn.md) §3）。

### 5.1 描述

- 描述的根是映射；
- `imports` 给出时必须是字符串列表；每个路径都能读取并解析；``yaml`...` `` 文本中不能有相对路径；引入不得循环；
- `layouts` 给出时必须是字符串列表，名字互不重复；
- `layouts` 列出的名字必须是 JavaScript 的标识符（任何文字的字母、数字、`_` 和 `$`，不以数字开头），因为布局名是类型名的一部分（[spec-layout.zh-cn.md](spec-layout.zh-cn.md) §5）；
- `item_tables` 给出时必须是映射，引入的描述也是如此；
- `layouts` 列出的名字和条目引用的条目表名都必须在名字空间内有对应的条目表，且它是条目列表，不是列表时是违规；
- 遍历到的条目表在名字空间内的两份描述中都有定义时是违规，错误写出这两份描述（文件用它的路径，``yaml`...` `` 文本是 `YAML text`）；不做覆盖；
- 条目表之间不得循环引用；
- 每个条目是 §3 的 tag 条目或包含条目之一，字段符合 §3 的规定。

### 5.2 布局

列在 `layouts` 里的每个条目表，展开引用后作为一个布局，还要满足：

- tag 名是标识符（字母、数字和 `_`，不以数字开头；数字、空名和缺少 name 都不是），在布局内唯一，且不是保留名（[spec-data-api.zh-cn.md](spec-data-api.zh-cn.md) §2.10）；
- 非 Bool 的 tag 之间字节范围互不重叠；每一位最多属于一个 Bool；
- Bool 落在某个非 Bool tag 的字节范围内时，必须是该 tag（组合字）的组成位；组合字的每个组成位都必须落在该字的范围内；
- 组合字与它的组成位只能由一方给出初值：组合字给出时，组成位的初值由整字决定；组合字不给出时，由各组成位给出（未给出的位为 `false`），整字的初值由它们合成；双方都不给出时，组合字与组成位都没有初值；
- 布局总长是整数个寄存器（16 位的整数倍）。

只被引用、不在 `layouts` 里的条目表不单独按布局校验：它的条目展开到引用它的布局里，随那个布局一起校验。

### 5.3 块

- `blocks` 缺省时视为 `[]`；给出时必须是列表，每个块是映射；
- 块的 `name` 必须给出且是字符串，在一份描述内唯一；
- 块的 `layout` 必须是字符串，且是本描述 `layouts` 列出的布局名之一，否则是违规，例如 `block pump_1: unknown layout Pump`。块不写登记域名，也不引用别的描述（包括被引入的描述）的布局：块建在描述装入的那个登记域中（[spec-layout.zh-cn.md](spec-layout.zh-cn.md) §3），所以描述不依赖它和谁一起装入、装入哪个登记域，读入时就能确定每个块用哪个布局。
